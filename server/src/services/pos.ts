import mongoose from 'mongoose';
import { Product } from '../models/catalog.js';
import { Customer } from '../models/people.js';
import { Payment, Sale, type ISalePayment } from '../models/sales.js';
import { withTransaction } from '../config/db.js';
import { ApiError, round2 } from '../utils/http.js';
import { generateNumber } from '../utils/sequence.js';
import { getSettings } from './settings.js';
import { applyStockChanges, changeStock } from './inventory.js';
import { ACCOUNTS, postLedger } from './ledger.js';
import { awardLoyaltyPoints } from './loyalty.js';
import { priceItems } from './orders.js';

export interface PosPaymentInput {
  method: string;
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  items: { productId: string; quantity: number; variation?: string }[];
  payments: PosPaymentInput[];
  customerId?: string;
  discountTotal?: number;
  note?: string;
  loyaltyPointsToRedeem?: number;
}

export async function createSale(
  input: CreateSaleInput,
  actor: { id: string; name: string; canDiscount: boolean }
) {
  return withTransaction(async (session) => {
    const settings = await getSettings();
    if (!input.items?.length) throw ApiError.badRequest('Add at least one product to the sale');

    const { lines, subtotal } = await priceItems(input.items);

    const discountTotal = round2(input.discountTotal ?? 0);
    if (discountTotal < 0) throw ApiError.badRequest('Discount cannot be negative');
    if (discountTotal > subtotal) throw ApiError.badRequest('Discount cannot exceed the subtotal');
    if (discountTotal > 0 && !actor.canDiscount) {
      throw ApiError.forbidden('You do not have permission to apply discounts');
    }

    const taxTotal = settings.taxEnabled
      ? round2(((subtotal - discountTotal) * settings.taxRate) / 100)
      : 0;
    const total = round2(subtotal - discountTotal + taxTotal);

    let loyaltyDiscount = 0;
    let redeemPoints = 0;
    if (input.loyaltyPointsToRedeem && input.customerId) {
      redeemPoints = Math.floor(input.loyaltyPointsToRedeem);
      loyaltyDiscount = round2(redeemPoints * settings.loyalty.redeemValue);
      if (loyaltyDiscount > total) throw ApiError.badRequest('Loyalty value exceeds the sale total');
    }
    const payable = round2(total - loyaltyDiscount);

    if (!input.payments?.length) throw ApiError.badRequest('Record at least one payment');

    const payments: ISalePayment[] = [];
    let tendered = 0;
    let remaining = payable;
    let confirmedCollected = 0;
    let pendingCollected = 0;

    for (const entry of input.payments) {
      const method = settings.paymentMethods.find((m) => m.key === entry.method && m.enabled);
      if (!method) throw ApiError.badRequest(`Payment method "${entry.method}" is unavailable`);
      if (!Number.isFinite(entry.amount) || entry.amount <= 0) {
        throw ApiError.badRequest('Payment amounts must be positive');
      }
      if (method.requiresReference && !entry.reference?.trim()) {
        throw ApiError.badRequest(`${method.label} requires a transaction reference`);
      }

      tendered = round2(tendered + entry.amount);
      const applied = round2(Math.min(entry.amount, Math.max(0, remaining)));
      if (applied <= 0) continue;
      remaining = round2(remaining - applied);

      // Mobile money is recorded as pending manual verification — never auto-verified.
      const status: ISalePayment['status'] = method.type === 'mobile_money' ? 'pending' : 'confirmed';
      if (status === 'confirmed') confirmedCollected = round2(confirmedCollected + applied);
      else pendingCollected = round2(pendingCollected + applied);

      payments.push({
        method: method.key,
        amount: applied,
        reference: entry.reference,
        status,
      });
    }

    if (remaining > 0.01) {
      throw ApiError.badRequest(`Payments cover ${round2(tendered)} of ${payable}. ${remaining} is still due.`);
    }

    const changeGiven = round2(Math.max(0, tendered - payable));

    const saleNumber = await generateNumber('sale', 'SALE', session);
    const receiptNumber = await generateNumber('receipt', 'RCP', session);

    const sale = await Sale.create(
      [
        {
          saleNumber,
          receiptNumber,
          cashier: actor.id,
          cashierName: actor.name,
          customer: input.customerId,
          items: lines,
          subtotal,
          discountTotal: round2(discountTotal + loyaltyDiscount),
          taxTotal,
          total,
          payments,
          changeGiven,
          status: 'completed',
          stockDeducted: true,
          note: input.note,
        },
      ],
      { session: session ?? undefined }
    );

    await applyStockChanges(
      lines.map((line) => ({ productId: line.product, delta: -line.quantity })),
      {
        type: 'sale',
        reason: 'POS sale',
        referenceType: 'sale',
        referenceId: sale[0]._id,
        referenceNumber: saleNumber,
        user: { id: actor.id, name: actor.name },
        allowNegative: settings.allowNegativeStock,
        session,
      }
    );

    await Product.bulkWrite(
      lines.map((line) => ({
        updateOne: {
          filter: { _id: line.product },
          update: { $inc: { soldCount: line.quantity } },
        },
      })),
      { session: session ?? undefined }
    );

    const cogs = round2(lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));
    const revenue = round2(subtotal - discountTotal - loyaltyDiscount);

    await postLedger(
      [
        ...(confirmedCollected > 0
          ? [{ account: ACCOUNTS.CASH, debit: confirmedCollected, description: `POS ${saleNumber}` }]
          : []),
        ...(pendingCollected > 0
          ? [{ account: ACCOUNTS.MOBILE_PENDING, debit: pendingCollected, description: `POS ${saleNumber} (pending verification)` }]
          : []),
        { account: ACCOUNTS.SALES_REVENUE, credit: revenue },
        { account: ACCOUNTS.TAX_PAYABLE, credit: taxTotal },
        { account: ACCOUNTS.COGS, debit: cogs, description: `COGS ${saleNumber}` },
        { account: ACCOUNTS.INVENTORY, credit: cogs },
      ],
      {
        refType: 'sale',
        refId: sale[0]._id,
        refNumber: saleNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    for (const payment of payments) {
      const paymentNumber = await generateNumber('payment', 'PAY', session);
      await Payment.create(
        [
          {
            paymentNumber,
            direction: 'in',
            kind: 'sale',
            reference: sale[0]._id,
            referenceNumber: saleNumber,
            method: payment.method,
            amount: payment.amount,
            currency: settings.currency,
            status: payment.status === 'confirmed' ? 'confirmed' : 'pending',
            transactionRef: payment.reference,
            customer: input.customerId,
            receivedBy: actor.id,
            paidAt: new Date(),
          },
        ],
        { session: session ?? undefined }
      );
    }

    if (input.customerId) {
      const customer = await Customer.findByIdAndUpdate(
        input.customerId,
        {
          $inc: {
            totalOrders: 1,
            totalSpending: payable,
            ...(redeemPoints > 0 ? { loyaltyPoints: -redeemPoints } : {}),
          },
          $set: { lastPurchaseAt: new Date() },
        },
        { new: true, session: session ?? undefined }
      );

      if (customer && redeemPoints > 0) {
        const { LoyaltyTransaction } = await import('../models/operations.js');
        await LoyaltyTransaction.create(
          [
            {
              customer: customer._id,
              points: -redeemPoints,
              type: 'redeem',
              sale: sale[0]._id,
              note: 'Redeemed at POS',
              balanceAfter: customer.loyaltyPoints,
              createdBy: actor.id,
            },
          ],
          { session: session ?? undefined }
        );
      }

      if (customer) {
        await awardLoyaltyPoints(customer._id, payable, {
          saleId: sale[0]._id,
          userId: actor.id,
          session,
        });
        sale[0].loyaltyAwarded = true;
        await sale[0].save({ session: session ?? undefined });
      }
    }

    return sale[0];
  });
}

export async function voidSale(saleId: string, actor: { id: string; name: string }) {
  return withTransaction(async (session) => {
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) throw ApiError.notFound('Sale not found');
    if (sale.status !== 'completed') throw ApiError.badRequest('Only completed sales can be voided');

    const settings = await getSettings();

    if (sale.stockDeducted) {
      await applyStockChanges(
        sale.items.map((item) => ({ productId: item.product, delta: item.quantity })),
        {
          type: 'void',
          reason: 'Sale voided',
          referenceType: 'sale',
          referenceId: sale._id,
          referenceNumber: sale.saleNumber,
          user: { id: actor.id, name: actor.name },
          session,
        }
      );
      sale.stockDeducted = false;
    }

    await Product.bulkWrite(
      sale.items.map((item) => ({
        updateOne: {
          filter: { _id: item.product },
          update: { $inc: { soldCount: -item.quantity } },
        },
      })),
      { session: session ?? undefined }
    );

    const revenue = round2(sale.subtotal - sale.discountTotal);
    const cogs = round2(sale.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0));
    const cashPaid = round2(
      sale.payments.filter((p) => p.status === 'confirmed').reduce((sum, p) => sum + p.amount, 0)
    );
    const pendingPaid = round2(
      sale.payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0)
    );

    await postLedger(
      [
        { account: ACCOUNTS.SALES_REVENUE, debit: revenue, description: `Void ${sale.saleNumber}` },
        { account: ACCOUNTS.TAX_PAYABLE, debit: sale.taxTotal },
        ...(cashPaid > 0 ? [{ account: ACCOUNTS.CASH, credit: cashPaid }] : []),
        ...(pendingPaid > 0 ? [{ account: ACCOUNTS.MOBILE_PENDING, credit: pendingPaid }] : []),
        { account: ACCOUNTS.INVENTORY, debit: cogs },
        { account: ACCOUNTS.COGS, credit: cogs },
      ],
      {
        refType: 'sale_void',
        refId: sale._id,
        refNumber: sale.saleNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    await Payment.updateMany(
      { kind: 'sale', reference: sale._id },
      { $set: { status: 'reversed' } },
      { session: session ?? undefined }
    );

    sale.status = 'voided';
    await sale.save({ session: session ?? undefined });

    return sale;
  });
}
