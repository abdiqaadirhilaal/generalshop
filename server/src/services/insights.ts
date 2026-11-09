import mongoose from 'mongoose';
import { Product } from '../models/catalog.js';
import { Order, Sale } from '../models/sales.js';
import { round2, startOfRange } from '../utils/http.js';
import { LedgerEntry } from '../models/operations.js';
import { ACCOUNTS } from './ledger.js';

export async function smartInsights() {
  const now = new Date();
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const prev30 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const [bestSellers, reorderAlerts, slowMoving, productPerformance, revenueTrend, periodSales] =
    await Promise.all([
      Product.find({ status: 'active' })
        .sort({ soldCount: -1 })
        .limit(5)
        .select('name sku soldCount stock price images')
        .lean(),
      Product.find({ status: 'active', $expr: { $lte: ['$stock', '$minStockLevel'] } })
        .sort({ stock: 1 })
        .limit(10)
        .select('name sku stock minStockLevel unit')
        .lean(),
      Product.find({ status: 'active', stock: { $gt: 0 }, soldCount: { $lte: 2 } })
        .sort({ stock: -1 })
        .limit(8)
        .select('name sku stock soldCount price createdAt')
        .lean(),
      productPerformanceReport(30),
      revenueTrendReport(6),
      salesByPeriod(),
    ]);

  const declining = productPerformance
    .filter((row) => row.previousQuantity > 0 && row.currentQuantity < row.previousQuantity)
    .sort((a, b) => b.previousQuantity - b.currentQuantity - (a.previousQuantity - a.currentQuantity))
    .slice(0, 6)
    .map((row) => ({
      productId: row.productId,
      name: row.name,
      currentQuantity: row.currentQuantity,
      previousQuantity: row.previousQuantity,
      changePercent: round2(
        ((row.currentQuantity - row.previousQuantity) / row.previousQuantity) * 100
      ),
    }));

  return {
    bestSellers,
    reorderAlerts,
    slowMoving,
    declining,
    highDemandPeriods: periodSales,
    revenueTrend,
    generatedAt: now.toISOString(),
    note: 'Insights are computed from recorded sales, stock and ledger data — not an AI prediction.',
  };
}

async function salesByProduct(from: Date, to: Date) {
  const [saleRows, orderRows] = await Promise.all([
    Sale.aggregate<{ _id: mongoose.Types.ObjectId; name: string; quantity: number; revenue: number; cost: number }>([
      { $match: { status: 'completed', createdAt: { $gte: from, $lte: to } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
          cost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
        },
      },
    ]),
    Order.aggregate<{ _id: mongoose.Types.ObjectId; name: string; quantity: number; revenue: number; cost: number }>([
      { $match: { status: 'delivered', deliveredAt: { $gte: from, $lte: to } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
          cost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
        },
      },
    ]),
  ]);

  const map = new Map<string, { productId: string; name: string; quantity: number; revenue: number; cost: number }>();
  for (const row of [...saleRows, ...orderRows]) {
    const key = String(row._id);
    const entry = map.get(key) ?? { productId: key, name: row.name, quantity: 0, revenue: 0, cost: 0 };
    entry.quantity = round2(entry.quantity + row.quantity);
    entry.revenue = round2(entry.revenue + row.revenue);
    entry.cost = round2(entry.cost + row.cost);
    map.set(key, entry);
  }
  return [...map.values()];
}

async function productPerformanceReport(days: number) {
  const now = new Date();
  const currentFrom = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const previousFrom = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);

  const [current, previous] = await Promise.all([
    salesByProduct(currentFrom, now),
    salesByProduct(previousFrom, currentFrom),
  ]);
  const prevMap = new Map(previous.map((row) => [row.productId, row]));

  return current.map((row) => {
    const prev = prevMap.get(row.productId);
    return {
      ...row,
      margin: round2(row.revenue - row.cost),
      marginPercent: row.revenue > 0 ? round2(((row.revenue - row.cost) / row.revenue) * 100) : 0,
      currentQuantity: row.quantity,
      previousQuantity: prev?.quantity ?? 0,
    };
  });
}

export async function productPerformanceReportPublic(days = 30) {
  return productPerformanceReport(days);
}

async function revenueTrendReport(months: number) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const rows = await LedgerEntry.aggregate<{ _id: string; revenue: number; cost: number }>([
    { $match: { date: { $gte: from } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
        revenue: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$account', ACCOUNTS.SALES_REVENUE] }, then: { $subtract: ['$credit', '$debit'] } },
                { case: { $eq: ['$account', ACCOUNTS.SALES_RETURNS] }, then: { $subtract: ['$debit', '$credit'] } },
              ],
              default: 0,
            },
          },
        },
        cost: {
          $sum: {
            $cond: [{ $eq: ['$account', ACCOUNTS.COGS] }, { $subtract: ['$debit', '$credit'] }, 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return rows.map((row) => ({
    month: row._id,
    revenue: round2(row.revenue),
    profit: round2(row.revenue - row.cost),
  }));
}

async function salesByPeriod() {
  const from = startOfRange('90d');
  const [sales, orders] = await Promise.all([
    Sale.aggregate<{ _id: number; count: number; total: number }>([
      { $match: { status: 'completed', createdAt: { $gte: from } } },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
    ]),
    Order.aggregate<{ _id: number; count: number; total: number }>([
      { $match: { status: 'delivered', deliveredAt: { $gte: from } } },
      {
        $group: {
          _id: { $dayOfWeek: '$deliveredAt' },
          count: { $sum: 1 },
          total: { $sum: '$total' },
        },
      },
    ]),
  ]);

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const merged = new Map<number, { count: number; total: number }>();
  for (const row of [...sales, ...orders]) {
    const entry = merged.get(row._id) ?? { count: 0, total: 0 };
    entry.count += row.count;
    entry.total = round2(entry.total + row.total);
    merged.set(row._id, entry);
  }

  return days.map((label, index) => ({
    day: label,
    orders: merged.get(index + 1)?.count ?? 0,
    revenue: merged.get(index + 1)?.total ?? 0,
  }));
}
