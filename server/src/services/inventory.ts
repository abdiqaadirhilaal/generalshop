import mongoose from 'mongoose';
import { Product } from '../models/catalog.js';
import { InventoryMovement, type MovementType } from '../models/operations.js';
import { ApiError } from '../utils/http.js';
import { notify } from './notifications.js';

export interface StockActor {
  id?: mongoose.Types.ObjectId | string;
  name?: string;
}

export interface StockChange {
  productId: mongoose.Types.ObjectId | string;
  /** Signed quantity: positive adds stock, negative removes it. */
  delta: number;
  unitCost?: number;
}

export interface StockContext {
  type: MovementType;
  reason?: string;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId | string;
  referenceNumber?: string;
  user?: StockActor;
  allowNegative?: boolean;
  note?: string;
  session?: mongoose.ClientSession | null;
}

async function readProduct(id: mongoose.Types.ObjectId | string, session?: mongoose.ClientSession | null) {
  const product = await Product.findById(id).session(session ?? null);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

/**
 * Applies one signed stock change atomically and records the movement.
 * Negative stock is blocked unless explicitly allowed.
 */
export async function changeStock(change: StockChange, ctx: StockContext) {
  const { productId, delta } = change;
  if (!Number.isFinite(delta) || delta === 0) {
    throw ApiError.badRequest('Stock change quantity must be a non-zero number');
  }

  const product = await readProduct(productId, ctx.session);
  const allowNegative = ctx.allowNegative ?? false;

  if (delta < 0 && !allowNegative && product.stock + delta < 0) {
    throw ApiError.conflict(
      `Insufficient stock for ${product.name}. Available: ${product.stock} ${product.unit}(s), requested: ${Math.abs(delta)}.`,
      { productId: String(product._id), available: product.stock, requested: Math.abs(delta) }
    );
  }

  const filter: Record<string, unknown> = { _id: product._id };
  if (delta < 0 && !allowNegative) {
    filter.stock = { $gte: Math.abs(delta) };
  }

  const updated = await Product.findOneAndUpdate(
    filter,
    { $inc: { stock: delta } },
    { new: true, session: ctx.session ?? undefined }
  );

  if (!updated) {
    const fresh = await Product.findById(product._id).session(ctx.session ?? null);
    throw ApiError.conflict(
      `Insufficient stock for ${product.name}. Available: ${fresh?.stock ?? 0}.`,
      { productId: String(product._id), available: fresh?.stock ?? 0, requested: Math.abs(delta) }
    );
  }

  const before = updated.stock - delta;
  const after = updated.stock;

  const movement = await InventoryMovement.create(
    [
      {
        product: updated._id,
        branch: updated.branch,
        type: ctx.type,
        quantity: delta,
        quantityBefore: before,
        quantityAfter: after,
        unitCost: change.unitCost ?? updated.costPrice,
        reason: ctx.reason,
        referenceType: ctx.referenceType,
        referenceId: ctx.referenceId,
        referenceNumber: ctx.referenceNumber,
        user: ctx.user?.id,
        userName: ctx.user?.name,
        note: ctx.note,
      },
    ],
    { session: ctx.session ?? undefined }
  );

  if (after <= updated.minStockLevel) {
    void notify({
      type: after <= 0 ? 'out_of_stock' : 'low_stock',
      title: after <= 0 ? 'Out of stock' : 'Low stock alert',
      message:
        after <= 0
          ? `${updated.name} (${updated.sku}) is out of stock.`
          : `${updated.name} (${updated.sku}) has ${after} ${updated.unit}(s) left — at or below the minimum of ${updated.minStockLevel}.`,
      link: `/admin/inventory?product=${updated._id}`,
      priority: after <= 0 ? 'high' : 'normal',
      roles: ['super_admin', 'shop_manager', 'inventory_manager'],
      meta: { productId: String(updated._id) },
      dedupeKey: `stock:${updated._id}:${after <= 0 ? 'out' : 'low'}`,
    });
  }

  return movement[0];
}

/**
 * Applies many stock changes as one unit. Inside a transaction this is atomic;
 * on standalone MongoDB we compensate completed changes if a later one fails.
 */
export async function applyStockChanges(changes: StockChange[], ctx: StockContext) {
  if (!changes.length) return [];
  const applied: Array<{ productId: string; delta: number }> = [];
  const results = [];

  try {
    for (const change of changes) {
      const movement = await changeStock(change, ctx);
      results.push(movement);
      applied.push({ productId: String(change.productId), delta: change.delta });
    }
    return results;
  } catch (error) {
    if (!ctx.session) {
      // Compensate writes that already succeeded before the failure.
      for (const entry of applied.reverse()) {
        try {
          await changeStock(
            { productId: entry.productId, delta: -entry.delta },
            { ...ctx, type: 'void', reason: 'Automatic rollback of failed transaction' }
          );
        } catch (rollbackError) {
          console.error('[inventory] rollback failed', (rollbackError as Error).message);
        }
      }
    }
    throw error;
  }
}

export async function stockIn(
  productId: string,
  quantity: number,
  ctx: Omit<StockContext, 'type'> & { unitCost?: number }
) {
  return changeStock({ productId, delta: Math.abs(quantity), unitCost: ctx.unitCost }, { ...ctx, type: 'stock_in' });
}

export async function stockOut(
  productId: string,
  quantity: number,
  ctx: Omit<StockContext, 'type'>
) {
  return changeStock({ productId, delta: -Math.abs(quantity) }, { ...ctx, type: 'stock_out' });
}

export async function adjustStockTo(
  productId: string,
  targetQuantity: number,
  ctx: Omit<StockContext, 'type'>
) {
  const product = await readProduct(productId, ctx.session);
  const delta = targetQuantity - product.stock;
  if (delta === 0) return null;
  return changeStock({ productId, delta }, { ...ctx, type: 'adjustment' });
}

export async function inventoryValuation() {
  const [row] = await Product.aggregate<{
    costValue: number;
    retailValue: number;
    units: number;
    skuCount: number;
  }>([
    { $match: { status: { $ne: 'archived' } } },
    {
      $group: {
        _id: null,
        costValue: { $sum: { $multiply: ['$stock', '$costPrice'] } },
        retailValue: { $sum: { $multiply: ['$stock', '$price'] } },
        units: { $sum: '$stock' },
        skuCount: { $sum: 1 },
      },
    },
  ]);
  return {
    costValue: Math.round((row?.costValue ?? 0) * 100) / 100,
    retailValue: Math.round((row?.retailValue ?? 0) * 100) / 100,
    potentialMargin: Math.round(((row?.retailValue ?? 0) - (row?.costValue ?? 0)) * 100) / 100,
    units: row?.units ?? 0,
    skuCount: row?.skuCount ?? 0,
  };
}
