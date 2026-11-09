import mongoose from 'mongoose';
import { Product } from '../models/catalog.js';
import { Supplier } from '../models/people.js';
import { Purchase } from '../models/purchasing.js';
import { Payment } from '../models/sales.js';
import { withTransaction } from '../config/db.js';
import { ApiError, round2 } from '../utils/http.js';
import { generateNumber } from '../utils/sequence.js';
import { getSettings } from './settings.js';
import { changeStock } from './inventory.js';
import { ACCOUNTS, postLedger } from './ledger.js';
import { notify } from './notifications.js';

export interface PurchaseItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export async function createPurchase(
  input: {
    supplierId: string;
    items: PurchaseItemInput[];
    taxTotal?: number;
    expectedAt?: string;
    notes?: string;
    status?: 'draft' | 'ordered';
  },
  actor: { id: string; name: string }
) {
  const supplier = await Supplier.findById(input.supplierId);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  if (!input.items?.length) throw ApiError.badRequest('Add at least one product to the purchase');

  const ids = input.items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const items = input.items.map((item) => {
    const product = productMap.get(String(item.productId));
    if (!product) throw ApiError.badRequest('One of the selected products no longer exists');
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw ApiError.badRequest(`Invalid quantity for ${product.name}`);
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw ApiError.badRequest(`Invalid unit cost for ${product.name}`);
    }
    return {
      product: product._id,
      name: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitCost: round2(item.unitCost),
      lineTotal: round2(item.quantity * item.unitCost),
    };
  });

  const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
  const taxTotal = round2(input.taxTotal ?? 0);
  const total = round2(subtotal + taxTotal);
  const purchaseNumber = await generateNumber('purchase', 'PUR');

  return Purchase.create({
    purchaseNumber,
    supplier: supplier._id,
    items,
    subtotal,
    taxTotal,
    total,
    amountPaid: 0,
    balance: total,
    paymentStatus: 'unpaid',
    status: input.status ?? 'ordered',
    stockReceived: false,
    expectedAt: input.expectedAt ? new Date(input.expectedAt) : undefined,
    createdBy: actor.id,
    createdByName: actor.name,
    notes: input.notes,
  });
}

export async function receivePurchase(purchaseId: string, actor: { id: string; name: string }) {
  return withTransaction(async (session) => {
    const purchase = await Purchase.findById(purchaseId).session(session);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.status === 'cancelled') throw ApiError.badRequest('Cannot receive a cancelled purchase');
    if (purchase.stockReceived) throw ApiError.conflict('This purchase has already been received');

    const settings = await getSettings();

    for (const item of purchase.items) {
      await changeStock(
        { productId: item.product, delta: item.quantity, unitCost: item.unitCost },
        {
          type: 'purchase',
          reason: 'Purchase received',
          referenceType: 'purchase',
          referenceId: purchase._id,
          referenceNumber: purchase.purchaseNumber,
          user: { id: actor.id, name: actor.name },
          session,
        }
      );
      await Product.findByIdAndUpdate(
        item.product,
        { $set: { costPrice: item.unitCost } },
        { session: session ?? undefined }
      );
    }

    await postLedger(
      [
        { account: ACCOUNTS.INVENTORY, debit: purchase.total, description: `Purchase ${purchase.purchaseNumber}` },
        { account: ACCOUNTS.PAYABLE, credit: purchase.total },
      ],
      {
        refType: 'purchase',
        refId: purchase._id,
        refNumber: purchase.purchaseNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    await Supplier.findByIdAndUpdate(
      purchase.supplier,
      { $inc: { totalPurchases: purchase.total, outstandingBalance: purchase.total } },
      { session: session ?? undefined }
    );

    purchase.stockReceived = true;
    purchase.status = 'received';
    purchase.receivedAt = new Date();
    purchase.receivedBy = new mongoose.Types.ObjectId(actor.id);
    await purchase.save({ session: session ?? undefined });

    if (settings.notifications.supplierBalance) {
      void notify({
        type: 'supplier_payable',
        title: 'Supplier balance recorded',
        message: `${purchase.purchaseNumber} received — ${purchase.balance} ${settings.currencySymbol} payable.`,
        link: `/admin/purchases/${purchase._id}`,
        roles: ['super_admin', 'shop_manager', 'finance_manager'],
      });
    }

    return purchase;
  });
}

export async function recordPurchasePayment(
  purchaseId: string,
  input: { amount: number; method: string; reference?: string; notes?: string },
  actor: { id: string; name: string }
) {
  return withTransaction(async (session) => {
    const purchase = await Purchase.findById(purchaseId).session(session);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.status === 'cancelled') throw ApiError.badRequest('Purchase is cancelled');

    const settings = await getSettings();
    const method = settings.paymentMethods.find((entry) => entry.key === input.method && entry.enabled);
    if (!method) throw ApiError.badRequest('Invalid payment method');

    const amount = round2(input.amount);
    if (amount <= 0) throw ApiError.badRequest('Payment amount must be positive');
    if (amount > purchase.balance + 0.01) {
      throw ApiError.badRequest(`Payment exceeds the outstanding balance of ${purchase.balance}`);
    }
    if (method.requiresReference && !input.reference?.trim()) {
      throw ApiError.badRequest(`${method.label} requires a transaction reference`);
    }

    const paymentNumber = await generateNumber('payment', 'PAY', session);
    const payment = await Payment.create(
      [
        {
          paymentNumber,
          direction: 'out',
          kind: 'purchase',
          reference: purchase._id,
          referenceNumber: purchase.purchaseNumber,
          method: method.key,
          amount,
          currency: settings.currency,
          status: 'confirmed',
          transactionRef: input.reference,
          supplier: purchase.supplier,
          receivedBy: actor.id,
          notes: input.notes,
          paidAt: new Date(),
        },
      ],
      { session: session ?? undefined }
    );

    await postLedger(
      [
        { account: ACCOUNTS.PAYABLE, debit: amount, description: `Supplier payment ${paymentNumber}` },
        { account: ACCOUNTS.CASH, credit: amount },
      ],
      {
        refType: 'payment',
        refId: payment[0]._id,
        refNumber: paymentNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    purchase.amountPaid = round2(purchase.amountPaid + amount);
    purchase.balance = round2(purchase.total - purchase.amountPaid);
    purchase.paymentStatus =
      purchase.balance <= 0.01 ? 'paid' : purchase.amountPaid > 0 ? 'partial' : 'unpaid';
    await purchase.save({ session: session ?? undefined });

    await Supplier.findByIdAndUpdate(
      purchase.supplier,
      { $inc: { outstandingBalance: -amount } },
      { session: session ?? undefined }
    );

    return { purchase, payment: payment[0] };
  });
}
