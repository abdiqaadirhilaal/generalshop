import { Router } from 'express';
import mongoose from 'mongoose';
import { Notification, AuditLog } from '../models/operations.js';
import { Customer } from '../models/people.js';
import { Order, Sale } from '../models/sales.js';
import { Supplier } from '../models/people.js';
import { Purchase } from '../models/purchasing.js';
import { Product } from '../models/catalog.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess, startOfDay } from '../utils/http.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { dashboardOverview, financeSummary, inventorySnapshot, payablesSummary, resolveRange, topSellingProducts } from '../services/finance.js';
import { getSettings } from '../services/settings.js';
import { smartInsights, productPerformanceReportPublic } from '../services/insights.js';
import { streamReportPdf } from '../utils/pdfReport.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';
import { LedgerEntry } from '../models/operations.js';

const router = Router();

/* ────────────────────────────── Dashboard ─────────────────────────────── */

router.get(
  '/overview',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (req, res) => {
    const overview = await dashboardOverview(String(req.query.range ?? 'month'));
    sendSuccess(res, overview);
  })
);

router.get(
  '/daily',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const from = startOfDay();
    const to = new Date();
    const [summary, pendingOrders, lowStock, unread] = await Promise.all([
      financeSummary({ from, to }, settings.currency),
      Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped'] } }),
      Product.countDocuments({ status: 'active', $expr: { $lte: ['$stock', '$minStockLevel'] } }),
      Notification.countDocuments({ readBy: { $ne: req.auth!.user._id } }),
    ]);
    sendSuccess(res, {
      ...summary,
      currencySymbol: settings.currencySymbol,
      pendingOrders,
      lowStock,
      unreadNotifications: unread,
    });
  })
);

router.get(
  '/insights',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await smartInsights());
  })
);

/* ─────────────────────────── Notifications ───────────────────────────── */

router.get(
  '/notifications',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (req, res) => {
    const roleSlug = req.auth!.role?.slug ?? '';
    const filter = {
      $or: [{ audienceRoles: roleSlug }, { audienceRoles: { $size: 0 } }, ...(roleSlug === 'super_admin' ? [{}] : [])],
    };
    const [notifications, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ ...filter, readBy: { $ne: req.auth!.user._id } }),
    ]);
    sendSuccess(
      res,
      notifications.map((notification) => ({
        ...notification,
        read: notification.readBy.some((id) => String(id) === String(req.auth!.user._id)),
      })),
      200,
      { unread }
    );
  })
);

router.post(
  '/notifications/:id/read',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (req, res) => {
    await Notification.updateOne(
      { _id: req.params.id },
      { $addToSet: { readBy: req.auth!.user._id } }
    );
    sendSuccess(res, { read: true });
  })
);

router.post(
  '/notifications/read-all',
  requirePermission(PERMISSIONS.DASHBOARD_VIEW),
  asyncHandler(async (req, res) => {
    const roleSlug = req.auth!.role?.slug ?? '';
    await Notification.updateMany(
      { $or: [{ audienceRoles: roleSlug }, { audienceRoles: { $size: 0 } }] },
      { $addToSet: { readBy: req.auth!.user._id } }
    );
    sendSuccess(res, { read: true });
  })
);

/* ────────────────────────────── Audit logs ───────────────────────────── */

router.get(
  '/audit-logs',
  requirePermission(PERMISSIONS.AUDIT_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 30 });
    const filter: Record<string, unknown> = {};
    if (query.entity) filter.entity = query.entity;
    if (query.action) filter.action = { $regex: query.action, $options: 'i' };
    if (query.actor) filter.actor = query.actor;
    if (query.q?.trim()) {
      filter.$or = [
        { actorName: { $regex: query.q.trim(), $options: 'i' } },
        { entityId: { $regex: query.q.trim(), $options: 'i' } },
      ];
    }
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    sendSuccess(res, logs, 200, buildMeta(total, page, limit));
  })
);

/* ─────────────────────────────── Reports ─────────────────────────────── */

router.get(
  '/reports/sales',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const { from, to } = resolveRange(
      String(req.query.range ?? 'month'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    const [summary, topProducts, sales, orders] = await Promise.all([
      financeSummary({ from, to }, settings.currency),
      topSellingProducts(from, to, 15),
      Sale.find({ status: 'completed', createdAt: { $gte: from, $lte: to } }).lean(),
      Order.find({ status: 'delivered', deliveredAt: { $gte: from, $lte: to } }).lean(),
    ]);

    const byCashier = new Map<string, { name: string; sales: number; revenue: number }>();
    for (const sale of sales) {
      const entry = byCashier.get(sale.cashierName) ?? { name: sale.cashierName, sales: 0, revenue: 0 };
      entry.sales += 1;
      entry.revenue += sale.total;
      byCashier.set(sale.cashierName, entry);
    }

    sendSuccess(res, {
      summary,
      currencySymbol: settings.currencySymbol,
      topProducts,
      byCashier: [...byCashier.values()].sort((a, b) => b.revenue - a.revenue),
      orderCount: orders.length,
      posCount: sales.length,
      series: summary.series,
    });
  })
);

router.get(
  '/reports/sales/pdf',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const { from, to } = resolveRange(
      String(req.query.range ?? 'month'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    const [summary, topProducts] = await Promise.all([
      financeSummary({ from, to }, settings.currency),
      topSellingProducts(from, to, 20),
    ]);
    streamReportPdf(res, {
      title: 'Sales & Profit Report',
      shopName: settings.shopName,
      period: `${from.toLocaleDateString()} — ${to.toLocaleDateString()}`,
      summary: [
        { label: 'Revenue', value: `${settings.currencySymbol}${summary.revenue.toFixed(2)}` },
        { label: 'Cost of goods', value: `${settings.currencySymbol}${summary.cogs.toFixed(2)}` },
        { label: 'Gross profit', value: `${settings.currencySymbol}${summary.grossProfit.toFixed(2)}` },
        { label: 'Expenses', value: `${settings.currencySymbol}${summary.expenses.toFixed(2)}` },
        { label: 'Net profit', value: `${settings.currencySymbol}${summary.netProfit.toFixed(2)}` },
        { label: 'Cash on hand', value: `${settings.currencySymbol}${summary.cashOnHand.toFixed(2)}` },
      ],
      table: {
        headers: ['Product', 'Qty', 'Revenue', 'Margin'],
        widths: [250, 60, 100, 100],
        rows: topProducts.map((product) => [
          product.name,
          String(product.quantity),
          `${settings.currencySymbol}${product.revenue.toFixed(2)}`,
          `${settings.currencySymbol}${product.margin.toFixed(2)}`,
        ]),
      },
    });
  })
);

router.get(
  '/reports/products',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    const [performance, products] = await Promise.all([
      productPerformanceReportPublic(days),
      Product.find().select('name sku stock minStockLevel costPrice price status').lean(),
    ]);
    const productMap = new Map(products.map((product) => [String(product._id), product]));
    sendSuccess(res, {
      days,
      rows: performance
        .map((row) => {
          const product = productMap.get(row.productId);
          return {
            ...row,
            sku: product?.sku,
            stock: product?.stock ?? 0,
            price: product?.price ?? 0,
            costPrice: product?.costPrice ?? 0,
            stockValue: Math.round((product?.stock ?? 0) * (product?.costPrice ?? 0) * 100) / 100,
          };
        })
        .sort((a, b) => b.revenue - a.revenue),
      totalProducts: products.length,
    });
  })
);

router.get(
  '/reports/inventory',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    const [snapshot, lowStock, movements] = await Promise.all([
      inventorySnapshot(),
      Product.find({ status: 'active', $expr: { $lte: ['$stock', '$minStockLevel'] } })
        .select('name sku stock minStockLevel unit costPrice price')
        .sort({ stock: 1 })
        .lean(),
      Product.aggregate<{ _id: string; units: number; value: number }>([
        { $match: { status: { $ne: 'archived' } } },
        {
          $group: {
            _id: '$category',
            units: { $sum: '$stock' },
            value: { $sum: { $multiply: ['$stock', '$costPrice'] } },
          },
        },
        {
          $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, name: '$category.name', units: 1, value: 1 } },
        { $sort: { value: -1 } },
      ]),
    ]);
    sendSuccess(res, { snapshot, lowStock, byCategory: movements });
  })
);

router.get(
  '/reports/customers',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    const [total, top, newCustomers, series] = await Promise.all([
      Customer.countDocuments(),
      Customer.find().sort({ totalSpending: -1 }).limit(10).select('name phone totalOrders totalSpending loyaltyPoints').lean(),
      Customer.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
      Customer.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: new Date(Date.now() - 180 * 86400000) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    sendSuccess(res, { total, top, newCustomers, series });
  })
);

router.get(
  '/reports/suppliers',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (_req, res) => {
    const [payables, suppliers, purchases] = await Promise.all([
      payablesSummary(),
      Supplier.find().select('name company phone totalPurchases outstandingBalance status').lean(),
      Purchase.aggregate<{ _id: mongoose.Types.ObjectId; total: number; paid: number; count: number }>([
        { $match: { status: { $ne: 'cancelled' } } },
        {
          $group: {
            _id: '$supplier',
            total: { $sum: '$total' },
            paid: { $sum: '$amountPaid' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);
    const purchaseMap = new Map(purchases.map((row) => [String(row._id), row]));
    sendSuccess(res, {
      payables,
      suppliers: suppliers.map((supplier) => ({
        ...supplier,
        purchaseCount: purchaseMap.get(String(supplier._id))?.count ?? 0,
        totalPurchased: purchaseMap.get(String(supplier._id))?.total ?? 0,
      })),
    });
  })
);

router.get(
  '/reports/employees',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(String(req.query.range ?? 'month'));
    const [salesByCashier, activity] = await Promise.all([
      Sale.aggregate<{ _id: string; name: string; sales: number; revenue: number }>([
        { $match: { status: 'completed', createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: '$cashier',
            name: { $first: '$cashierName' },
            sales: { $sum: 1 },
            revenue: { $sum: '$total' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
      AuditLog.aggregate<{ _id: string; name: string; actions: number; lastAction: Date }>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: '$actor',
            name: { $first: '$actorName' },
            actions: { $sum: 1 },
            lastAction: { $max: '$createdAt' },
          },
        },
        { $sort: { actions: -1 } },
      ]),
    ]);
    sendSuccess(res, { salesByCashier, activity });
  })
);

router.get(
  '/reports/expenses',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(
      String(req.query.range ?? 'year'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    const rows = await LedgerEntry.aggregate<{ _id: { month: string; account: string }; amount: number }>([
      {
        $match: {
          date: { $gte: from, $lte: to },
          account: { $regex: '^expense' },
        },
      },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$date' } },
            account: '$account',
          },
          amount: { $sum: { $subtract: ['$debit', '$credit'] } },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]);
    sendSuccess(res, { rows });
  })
);

router.get(
  '/reports/export',
  requirePermission(PERMISSIONS.REPORTS_VIEW),
  asyncHandler(async (req, res) => {
    const type = String(req.query.type ?? 'sales');
    const settings = await getSettings();
    const { from, to } = resolveRange(
      String(req.query.range ?? 'month'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );

    let csv = '';
    if (type === 'sales') {
      const sales = await Sale.find({ status: 'completed', createdAt: { $gte: from, $lte: to } }).lean();
      csv = toCsv(
        ['saleNumber', 'receiptNumber', 'date', 'cashier', 'items', 'subtotal', 'discount', 'tax', 'total'],
        sales.map((sale) => [
          sale.saleNumber,
          sale.receiptNumber,
          new Date(sale.createdAt).toISOString(),
          sale.cashierName,
          sale.items.reduce((sum, item) => sum + item.quantity, 0),
          sale.subtotal,
          sale.discountTotal,
          sale.taxTotal,
          sale.total,
        ])
      );
    } else if (type === 'products') {
      const performance = await productPerformanceReportPublic(Number(req.query.days) || 30);
      csv = toCsv(
        ['product', 'quantitySold', 'revenue', 'cost', 'margin', 'marginPercent'],
        performance.map((row) => [
          row.name,
          row.quantity,
          row.revenue,
          row.cost,
          row.margin,
          row.marginPercent,
        ])
      );
    } else if (type === 'inventory') {
      const products = await Product.find().populate('category', 'name').lean();
      csv = toCsv(
        ['name', 'sku', 'category', 'stock', 'minStockLevel', 'unit', 'costPrice', 'price', 'stockValue', 'status'],
        products.map((product) => [
          product.name,
          product.sku,
          (product.category as unknown as { name?: string })?.name ?? '',
          product.stock,
          product.minStockLevel,
          product.unit,
          product.costPrice,
          product.price,
          Math.round(product.stock * product.costPrice * 100) / 100,
          product.status,
        ])
      );
    } else if (type === 'customers') {
      const customers = await Customer.find().lean();
      csv = toCsv(
        ['customerNumber', 'name', 'phone', 'orders', 'spending', 'loyaltyPoints', 'status'],
        customers.map((customer) => [
          customer.customerNumber,
          customer.name,
          customer.phone,
          customer.totalOrders,
          customer.totalSpending,
          customer.loyaltyPoints,
          customer.status,
        ])
      );
    } else if (type === 'ledger') {
      const entries = await LedgerEntry.find({ date: { $gte: from, $lte: to } }).sort({ date: -1 }).lean();
      csv = toCsv(
        ['date', 'account', 'debit', 'credit', 'description', 'reference'],
        entries.map((entry) => [
          new Date(entry.date).toISOString(),
          entry.account,
          entry.debit,
          entry.credit,
          entry.description,
          entry.refNumber,
        ])
      );
    } else {
      throw ApiError.badRequest('Unknown report type');
    }

    res.set(csvResponseHeaders(`hilaal-${type}-report-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
    void settings;
  })
);

export default router;
