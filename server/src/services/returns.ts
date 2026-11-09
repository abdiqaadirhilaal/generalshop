import mongoose from 'mongoose';
import { Order, Payment, Sale } from '../models/sales.js';
import { Refund } from '../models/operations.js';
import { Return } from '../models/operations.js';
import { withTransaction } from '../config/db.js';
import { ApiError, round2 } from '../utils/http.js';
import { generateNumber } from '../utils/sequence.js';
import { getSettings } from './settings.js';
import { changeStock } from './inventory.js';
import { ACCOUNTS, postLedger } from './ledger.js';

export async function createReturn(
  input: {
    type: 'order' | 'sale';
    referenceId: string;
    items: { productId: string; quantity: number; restock?: boolean; condition?: string }[];
    reason: string;
    notes?: string;
  },
  actor: { id: string; name: string }
) {
  if (!input.items?.length) throw ApiError.badRequest('Select at least one item to return');

  const source =
    input.type === 'order'
      ? await Order.findById(input.referenceId)
      : await Sale.findById(input.referenceId);
  if (!source) throw ApiError.notFound(input.type === 'order' ? 'Order not found' : 'Sale not found');

  const alreadyReturned = await Return.aggregate<{ _id: mongoose.Types.ObjectId; quantity: number }>([
    {
      $match: {
        [input.type]: new mongoose.Types.ObjectId(input.referenceId),
        status: { $ne: 'rejected' },
      },
    },
    { $unwind: '$items' },
    { $group: { _id: '$items.product', quantity: { $sum: '$items.quantity' } } },
  ]);
  const returnedMap = new Map(alreadyReturned.map((row) => [String(row._id), row.quantity]));

  const items = input.items.map((entry) => {
    const original = source.items.find((item) => String(item.product) === String(entry.productId));
    if (!original) throw ApiError.badRequest('A selected item is not part of this sale');
    const previously = returnedMap.get(String(entry.productId)) ?? 0;
    const available = round2(original.quantity - previously);
    if (!Number.isFinite(entry.quantity) || entry.quantity <= 0) {
      throw ApiError.badRequest(`Invalid return quantity for ${original.name}`);
    }
    if (entry.quantity > available) {
      throw ApiError.badRequest(
        `Only ${available} of ${original.name} can still be returned`
      );
    }
    return {
      product: original.product,
      name: original.name,
      sku: original.sku,
      quantity: entry.quantity,
      unitPrice: original.unitPrice,
      restock: entry.restock ?? true,
      condition: entry.condition,
    };
  });

  const refundAmount = round2(
    items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );
  const returnNumber = await generateNumber('return', 'RTN');

  return Return.create({
    returnNumber,
    type: input.type,
    order: input.type === 'order' ? source._id : undefined,
    sale: input.type === 'sale' ? source._id : undefined,
    customer: (source as { customer?: mongoose.Types.ObjectId }).customer,
    customerName:
      input.type === 'order'
        ? (source as { shippingAddress: { fullName: string } }).shippingAddress.fullName
        : 'Walk-in customer',
    items,
    reason: input.reason,
    status: 'requested',
    refundAmount,
    notes: input.notes,
    history: [{ status: 'requested', at: new Date(), byName: actor.name, note: input.reason }],
  });
}

export async function decideReturn(
  returnId: string,
  decision: 'approved' | 'rejected',
  actor: { id: string; name: string },
  note?: string
) {
  const record = await Return.findById(returnId);
  if (!record) throw ApiError.notFound('Return not found');
  if (record.status !== 'requested') throw ApiError.badRequest('This return has already been processed');

  record.status = decision;
  record.processedBy = new mongoose.Types.ObjectId(actor.id);
  record.processedByName = actor.name;
  if (note) record.notes = note;
  record.history.push({ status: decision, at: new Date(), byName: actor.name, note });
  await record.save();
  return record;
}

export async function receiveReturn(returnId: string, actor: { id: string; name: string }) {
  return withTransaction(async (session) => {
    const record = await Return.findById(returnId).session(session);
    if (!record) throw ApiError.notFound('Return not found');
    if (record.status !== 'approved') {
      throw ApiError.badRequest('Approve the return before receiving items');
    }
    if (record.stockRestored) throw ApiError.conflict('Stock has already been restored');

    const source = record.order
      ? await Order.findById(record.order).session(session)
      : await Sale.findById(record.sale).session(session);

    const alreadyRestored =
      (record.order && source && !(source as typeof source & { stockDeducted: boolean }).stockDeducted) ||
      (record.sale && source && (source as { status?: string }).status === 'voided');

    const settings = await getSettings();
    let restockCost = 0;

    if (!alreadyRestored) {
      for (const item of record.items.filter((entry) => entry.restock)) {
        const product = source?.items.find((entry) => String(entry.product) === String(item.product));
        restockCost += (product?.unitCost ?? 0) * item.quantity;
        await changeStock(
          { productId: item.product, delta: item.quantity, unitCost: product?.unitCost },
          {
            type: 'return',
            reason: `Return ${record.returnNumber}`,
            referenceType: 'return',
            referenceId: record._id,
            referenceNumber: record.returnNumber,
            user: { id: actor.id, name: actor.name },
            session,
          }
        );
      }

      if (restockCost > 0) {
        await postLedger(
          [
            { account: ACCOUNTS.INVENTORY, debit: round2(restockCost), description: `Restock ${record.returnNumber}` },
            { account: ACCOUNTS.COGS, credit: round2(restockCost) },
          ],
          {
            refType: 'return',
            refId: record._id,
            refNumber: record.returnNumber,
            currency: settings.currency,
            createdBy: actor.id,
          },
          session
        );
      }
    }

    record.status = 'received';
    record.restocked = record.items.some((item) => item.restock);
    record.stockRestored = true;
    record.history.push({ status: 'received', at: new Date(), byName: actor.name });
    await record.save({ session: session ?? undefined });

    return record;
  });
}

export async function refundReturn(
  returnId: string,
  input: { method?: string; amount?: number; notes?: string },
  actor: { id: string; name: string }
) {
  return withTransaction(async (session) => {
    const record = await Return.findById(returnId).session(session);
    if (!record) throw ApiError.notFound('Return not found');
    if (record.status === 'rejected') throw ApiError.badRequest('Return was rejected');
    if (record.status === 'refunded') throw ApiError.conflict('Refund already recorded');

    const settings = await getSettings();
    const amount = round2(input.amount ?? record.refundAmount);
    if (amount <= 0) throw ApiError.badRequest('Refund amount must be positive');
    if (amount > record.refundAmount + 0.01) {
      throw ApiError.badRequest(`Refund cannot exceed the return value of ${record.refundAmount}`);
    }

    const refundNumber = await generateNumber('refund', 'REF', session);
    const refund = await Refund.create(
      [
        {
          refundNumber,
          return: record._id,
          order: record.order,
          sale: record.sale,
          customer: record.customer,
          amount,
          method: input.method ?? 'cash',
          status: 'completed',
          reason: record.reason,
          processedBy: actor.id,
          processedByName: actor.name,
          paidAt: new Date(),
        },
      ],
      { session: session ?? undefined }
    );

    await postLedger(
      [
        { account: ACCOUNTS.SALES_RETURNS, debit: amount, description: `Refund ${refundNumber}` },
        { account: ACCOUNTS.CASH, credit: amount },
      ],
      {
        refType: 'refund',
        refId: refund[0]._id,
        refNumber: refundNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    record.status = 'refunded';
    record.refundAmount = amount;
    record.refundMethod = input.method ?? 'cash';
    record.processedBy = new mongoose.Types.ObjectId(actor.id);
    record.processedByName = actor.name;
    record.history.push({
      status: 'refunded',
      at: new Date(),
      byName: actor.name,
      note: input.notes ?? `${amount} refunded via ${input.method ?? 'cash'}`,
    });
    await record.save({ session: session ?? undefined });

    if (record.order) {
      const order = await Order.findById(record.order).session(session);
      if (order) {
        const paid = await Payment.aggregate<{ total: number }>([
          { $match: { kind: 'order', reference: order._id, status: 'confirmed', direction: 'in' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]).session(session);
        const paidTotal = round2(paid[0]?.total ?? 0);
        order.paymentStatus = amount >= paidTotal ? 'refunded' : 'partially_refunded';
        const allItemsReturned = await Return.aggregate<{ total: number }>([
          {
            $match: {
              order: order._id,
              status: { $in: ['received', 'refunded'] },
            },
          },
          { $unwind: '$items' },
          { $group: { _id: null, total: { $sum: '$items.quantity' } } },
        ]).session(session);
        const returnedQty = allItemsReturned[0]?.total ?? 0;
        const orderedQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
        if (returnedQty >= orderedQty - 0.001) {
          order.status = 'returned';
          order.statusHistory.push({
            status: 'returned',
            at: new Date(),
            byName: actor.name,
            note: 'All items returned',
          });
        }
        await order.save({ session: session ?? undefined });
      }
    }

    if (record.sale) {
      const sale = await Sale.findById(record.sale).session(session);
      if (sale) {
        const allItemsReturned = await Return.aggregate<{ total: number }>([
          {
            $match: { sale: sale._id, status: { $in: ['received', 'refunded'] } },
          },
          { $unwind: '$items' },
          { $group: { _id: null, total: { $sum: '$items.quantity' } } },
        ]).session(session);
        const returnedQty = allItemsReturned[0]?.total ?? 0;
        const soldQty = sale.items.reduce((sum, item) => sum + item.quantity, 0);
        sale.status = returnedQty >= soldQty - 0.001 ? 'refunded' : 'partially_refunded';
        await sale.save({ session: session ?? undefined });
      }
    }

    return { return: record, refund: refund[0] };
  });
}
