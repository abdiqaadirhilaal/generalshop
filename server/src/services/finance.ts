import mongoose from 'mongoose';
import { Customer, Supplier } from '../models/people.js';
import { Expense, LedgerEntry } from '../models/operations.js';
import { Order, Payment, Sale } from '../models/sales.js';
import { Product } from '../models/catalog.js';
import { round2, startOfRange } from '../utils/http.js';
import { ACCOUNTS, accountBalances, creditOf, debitOf, netDebit } from './ledger.js';

export interface FinanceSummary {
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cashOnHand: number;
  receivables: number;
  payables: number;
  customerDeposits: number;
  mobileMoneyPending: number;
  taxPayable: number;
  totalSales: number;
  posSalesCount: number;
  ordersDelivered: number;
  newCustomers: number;
  averageOrderValue: number;
  expenseBreakdown: { category: string; amount: number }[];
  series: { date: string; revenue: number; cogs: number; expenses: number; profit: number }[];
  paymentMix: { method: string; direction: string; amount: number; count: number }[];
  currency: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

export function resolveRange(range = 'month', from?: string, to?: string): DateRange {
  if (from && to) {
    return { from: new Date(from), to: new Date(to) };
  }
  return { from: startOfRange(range), to: new Date() };
}

function roundSeries(entries: Map<string, { revenue: number; cogs: number; expenses: number }>) {
  return [...entries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      revenue: round2(values.revenue),
      cogs: round2(values.cogs),
      expenses: round2(values.expenses),
      profit: round2(values.revenue - values.cogs - values.expenses),
    }));
}

export async function financeSummary(rangeInput: DateRange, currency = 'USD'): Promise<FinanceSummary> {
  const { from, to } = rangeInput;
  const match = { date: { $gte: from, $lte: to } };
  const balances = await accountBalances(match);

  const revenue = round2(
    creditOf(balances, ACCOUNTS.SALES_REVENUE) -
      debitOf(balances, ACCOUNTS.SALES_REVENUE) -
      netDebit(balances, ACCOUNTS.SALES_RETURNS) +
      creditOf(balances, ACCOUNTS.OTHER_INCOME) -
      debitOf(balances, ACCOUNTS.OTHER_INCOME)
  );
  const cogs = round2(debitOf(balances, ACCOUNTS.COGS) - creditOf(balances, ACCOUNTS.COGS));
  const expenses = round2(
    [...balances.values()]
      .filter((balance) => balance.account.startsWith('expense'))
      .reduce((sum, balance) => sum + balance.debit - balance.credit, 0)
  );
  const grossProfit = round2(revenue - cogs);
  const netProfit = round2(grossProfit - expenses);

  const [posSalesCount, ordersDelivered, newCustomers, expenseRows, paymentMix] = await Promise.all([
    Sale.countDocuments({ status: 'completed', createdAt: { $gte: from, $lte: to } }),
    Order.countDocuments({ status: 'delivered', deliveredAt: { $gte: from, $lte: to } }),
    Customer.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    Expense.aggregate<{ _id: string; amount: number }>([
      { $match: { date: { $gte: from, $lte: to }, status: 'paid' } },
      { $group: { _id: '$category', amount: { $sum: '$amount' } } },
      { $sort: { amount: -1 } },
    ]),
    Payment.aggregate<{ _id: { method: string; direction: string }; amount: number; count: number }>([
      { $match: { paidAt: { $gte: from, $lte: to }, status: 'confirmed' } },
      {
        $group: {
          _id: { method: '$method', direction: '$direction' },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]),
  ]);

  const ledgerRows = await LedgerEntry.aggregate<{
    _id: { day: string; account: string };
    debit: number;
    credit: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone: 'UTC' } },
          account: '$account',
        },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]);

  const byDay = new Map<string, { revenue: number; cogs: number; expenses: number }>();
  for (const row of ledgerRows) {
    const bucket = byDay.get(row._id.day) ?? { revenue: 0, cogs: 0, expenses: 0 };
    if (row._id.account === ACCOUNTS.SALES_REVENUE) bucket.revenue += row.credit - row.debit;
    if (row._id.account === ACCOUNTS.OTHER_INCOME) bucket.revenue += row.credit - row.debit;
    if (row._id.account === ACCOUNTS.SALES_RETURNS) bucket.revenue -= row.debit - row.credit;
    if (row._id.account === ACCOUNTS.COGS) bucket.cogs += row.debit - row.credit;
    if (row._id.account.startsWith('expense')) bucket.expenses += row.debit - row.credit;
    byDay.set(row._id.day, bucket);
  }

  const totalSales = posSalesCount + ordersDelivered;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    cogs,
    grossProfit,
    expenses,
    netProfit,
    cashOnHand: round2(netDebit(balances, ACCOUNTS.CASH)),
    receivables: round2(netDebit(balances, ACCOUNTS.RECEIVABLE)),
    payables: round2(-netDebit(balances, ACCOUNTS.PAYABLE)),
    customerDeposits: round2(-netDebit(balances, ACCOUNTS.CUSTOMER_DEPOSITS)),
    mobileMoneyPending: round2(netDebit(balances, ACCOUNTS.MOBILE_PENDING)),
    taxPayable: round2(-netDebit(balances, ACCOUNTS.TAX_PAYABLE)),
    totalSales,
    posSalesCount,
    ordersDelivered,
    newCustomers,
    averageOrderValue: totalSales > 0 ? round2(revenue / totalSales) : 0,
    expenseBreakdown: expenseRows.map((row) => ({ category: row._id, amount: round2(row.amount) })),
    series: roundSeries(byDay),
    paymentMix: paymentMix.map((row) => ({
      method: row._id.method,
      direction: row._id.direction,
      amount: round2(row.amount),
      count: row.count,
    })),
    currency,
  };
}

export async function dashboardOverview(range = 'month') {
  const { from, to } = resolveRange(range);
  const { getSettings } = await import('./settings.js');
  const settings = await getSettings();

  const [summary, products, lowStock, outOfStock, customerCount, recentOrders, recentSales, topProducts] =
    await Promise.all([
      financeSummary({ from, to }, settings.currency),
      Product.countDocuments({ status: { $ne: 'archived' } }),
      Product.countDocuments({
        status: 'active',
        stock: { $gt: 0 },
        $expr: { $lte: ['$stock', '$minStockLevel'] },
      }),
      Product.countDocuments({ status: 'active', stock: { $lte: 0 } }),
      Customer.countDocuments(),
      Order.find().sort({ createdAt: -1 }).limit(6).populate('customer', 'name phone').lean(),
      Sale.find().sort({ createdAt: -1 }).limit(6).populate('customer', 'name phone').lean(),
      topSellingProducts(from, to, 5),
    ]);

  const lowStockProducts = await Product.find({
    status: 'active',
    $expr: { $lte: ['$stock', '$minStockLevel'] },
  })
    .select('name sku stock minStockLevel unit images price')
    .sort({ stock: 1 })
    .limit(8)
    .lean();

  return {
    ...summary,
    productCount: products,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock,
    customerCount,
    lowStockProducts,
    recentOrders,
    recentSales,
    topProducts,
    inventory: await inventorySnapshot(),
    currencySymbol: settings.currencySymbol,
  };
}

export async function inventorySnapshot() {
  const [row] = await Product.aggregate<{ costValue: number; retailValue: number; units: number; skus: number }>([
    { $match: { status: { $ne: 'archived' } } },
    {
      $group: {
        _id: null,
        costValue: { $sum: { $multiply: ['$stock', '$costPrice'] } },
        retailValue: { $sum: { $multiply: ['$stock', '$price'] } },
        units: { $sum: '$stock' },
        skus: { $sum: 1 },
      },
    },
  ]);
  return {
    costValue: round2(row?.costValue ?? 0),
    retailValue: round2(row?.retailValue ?? 0),
    potentialMargin: round2((row?.retailValue ?? 0) - (row?.costValue ?? 0)),
    units: row?.units ?? 0,
    skuCount: row?.skus ?? 0,
  };
}

export async function topSellingProducts(from: Date, to: Date, limit = 10) {
  const rows = await Sale.aggregate<{
    _id: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    quantity: number;
    revenue: number;
    cost: number;
  }>([
    { $match: { status: 'completed', createdAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        cost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);

  const orderRows = await Order.aggregate<{
    _id: mongoose.Types.ObjectId;
    name: string;
    sku: string;
    quantity: number;
    revenue: number;
    cost: number;
  }>([
    { $match: { status: 'delivered', deliveredAt: { $gte: from, $lte: to } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        cost: { $sum: { $multiply: ['$items.unitCost', '$items.quantity'] } },
      },
    },
  ]);

  const merged = new Map<string, { id: string; name: string; sku: string; quantity: number; revenue: number; cost: number }>();
  for (const row of [...rows, ...orderRows]) {
    const key = String(row._id);
    const existing = merged.get(key) ?? {
      id: key,
      name: row.name,
      sku: row.sku,
      quantity: 0,
      revenue: 0,
      cost: 0,
    };
    existing.quantity += row.quantity;
    existing.revenue = round2(existing.revenue + row.revenue);
    existing.cost = round2(existing.cost + row.cost);
    merged.set(key, existing);
  }

  return [...merged.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit)
    .map((row) => ({
      ...row,
      margin: round2(row.revenue - row.cost),
      marginPercent: row.revenue > 0 ? round2(((row.revenue - row.cost) / row.revenue) * 100) : 0,
    }));
}

export async function payablesSummary() {
  const suppliers = await Supplier.find({ outstandingBalance: { $gt: 0 } })
    .select('name company outstandingBalance')
    .sort({ outstandingBalance: -1 })
    .lean();
  return {
    total: round2(suppliers.reduce((sum, supplier) => sum + supplier.outstandingBalance, 0)),
    suppliers,
  };
}
