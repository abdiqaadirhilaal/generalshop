import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/catalog.js';
import { Sale, Payment } from '../models/sales.js';
import { Customer } from '../models/people.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { hasPermission, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createSale, voidSale } from '../services/pos.js';
import { getSettings } from '../services/settings.js';
import { streamSaleReceipt } from '../utils/pdf.js';
import { audit } from '../utils/audit.js';
import { findOrCreateCustomer } from '../services/orders.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

router.get(
  '/products',
  requirePermission(PERMISSIONS.POS_USE),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { status: 'active' };
    if (query.q?.trim()) {
      const term = query.q.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { sku: { $regex: term, $options: 'i' } },
        { barcode: term },
      ];
    }
    if (query.category) filter.category = query.category;

    const products = await Product.find(filter)
      .select('name sku barcode price compareAtPrice stock unit images category variations variationLabel')
      .populate('category', 'name')
      .sort({ name: 1 })
      .limit(60)
      .lean();

    sendSuccess(res, products);
  })
);

router.post(
  '/customers',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(6).max(30),
      email: z.string().trim().email().optional().or(z.literal('')),
    }),
  }),
  asyncHandler(async (req, res) => {
    const customer = await findOrCreateCustomer({
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email || undefined,
    });
    sendSuccess(res, customer, 201);
  })
);

router.post(
  '/sales',
  requirePermission(PERMISSIONS.POS_USE),
  validate({
    body: z.object({
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.coerce.number().positive(),
            variation: z.string().optional(),
          })
        )
        .min(1, 'Add at least one product'),
      payments: z
        .array(
          z.object({
            method: z.string().min(1),
            amount: z.coerce.number().positive(),
            reference: z.string().trim().max(120).optional(),
          })
        )
        .min(1, 'Record at least one payment'),
      customerId: z.string().optional(),
      discountTotal: z.coerce.number().min(0).default(0),
      note: z.string().trim().max(500).optional(),
      loyaltyPointsToRedeem: z.coerce.number().min(0).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const sale = await createSale(req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
      canDiscount: hasPermission(req, PERMISSIONS.POS_DISCOUNT),
    });
    await audit(req, 'pos.sale', 'Sale', sale._id, undefined, {
      saleNumber: sale.saleNumber,
      total: sale.total,
      items: sale.items.length,
    });
    sendSuccess(res, sale, 201);
  })
);

router.get(
  '/sales',
  requirePermission(PERMISSIONS.POS_USE),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.cashier) filter.cashier = query.cashier;
    if (query.customer) filter.customer = query.customer;
    if (query.q?.trim()) {
      filter.$or = [
        { saleNumber: { $regex: query.q.trim(), $options: 'i' } },
        { receiptNumber: { $regex: query.q.trim(), $options: 'i' } },
      ];
    }
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [sales, total] = await Promise.all([
      Sale.find(filter)
        .populate('customer', 'name phone')
        .populate('cashier', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Sale.countDocuments(filter),
    ]);
    sendSuccess(res, sales, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/sales/export',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  asyncHandler(async (_req, res) => {
    const sales = await Sale.find().sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ['saleNumber', 'receiptNumber', 'date', 'cashier', 'items', 'subtotal', 'discount', 'tax', 'total', 'status'],
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
        sale.status,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-sales-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/sales/:id',
  requirePermission(PERMISSIONS.POS_USE),
  asyncHandler(async (req, res) => {
    const sale = await Sale.findById(req.params.id)
      .populate('customer', 'name phone customerNumber loyaltyPoints')
      .lean();
    if (!sale) throw ApiError.notFound('Sale not found');
    const payments = await Payment.find({ kind: 'sale', reference: sale._id }).lean();
    sendSuccess(res, { ...sale, paymentRecords: payments });
  })
);

router.get(
  '/sales/:id/receipt',
  requirePermission(PERMISSIONS.POS_USE),
  asyncHandler(async (req, res) => {
    const sale = await Sale.findById(req.params.id).populate('customer', 'name phone').lean();
    if (!sale) throw ApiError.notFound('Sale not found');
    const settings = await getSettings();
    streamSaleReceipt(res, sale as never, settings);
  })
);

router.post(
  '/sales/:id/void',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  asyncHandler(async (req, res) => {
    const sale = await voidSale(req.params.id, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'pos.void', 'Sale', sale._id, undefined, { saleNumber: sale.saleNumber });
    sendSuccess(res, sale);
  })
);

export default router;
