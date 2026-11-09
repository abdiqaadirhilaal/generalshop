import { Router } from 'express';
import { z } from 'zod';
import { Purchase } from '../models/purchasing.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createPurchase, receivePurchase, recordPurchasePayment } from '../services/purchases.js';
import { audit } from '../utils/audit.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.PURCHASES_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};
    if (query.supplier) filter.supplier = query.supplier;
    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.q?.trim()) filter.purchaseNumber = { $regex: query.q.trim(), $options: 'i' };
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [purchases, total] = await Promise.all([
      Purchase.find(filter)
        .populate('supplier', 'name company phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Purchase.countDocuments(filter),
    ]);
    sendSuccess(res, purchases, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/export',
  requirePermission(PERMISSIONS.PURCHASES_VIEW),
  asyncHandler(async (_req, res) => {
    const purchases = await Purchase.find().populate('supplier', 'name').sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ['purchaseNumber', 'date', 'supplier', 'status', 'paymentStatus', 'total', 'paid', 'balance'],
      purchases.map((purchase) => [
        purchase.purchaseNumber,
        new Date(purchase.createdAt).toISOString(),
        (purchase.supplier as unknown as { name?: string })?.name ?? '',
        purchase.status,
        purchase.paymentStatus,
        purchase.total,
        purchase.amountPaid,
        purchase.balance,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-purchases-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.PURCHASES_VIEW),
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findById(req.params.id)
      .populate('supplier', 'name company phone email outstandingBalance')
      .populate('createdBy', 'name')
      .lean();
    if (!purchase) throw ApiError.notFound('Purchase not found');
    sendSuccess(res, purchase);
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.PURCHASES_WRITE),
  validate({
    body: z.object({
      supplierId: z.string().min(1, 'Choose a supplier'),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.coerce.number().positive(),
            unitCost: z.coerce.number().min(0),
          })
        )
        .min(1, 'Add at least one product'),
      taxTotal: z.coerce.number().min(0).default(0),
      expectedAt: z.string().optional(),
      notes: z.string().trim().max(1000).optional(),
      status: z.enum(['draft', 'ordered']).default('ordered'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const purchase = await createPurchase(req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'purchase.create', 'Purchase', purchase._id, undefined, {
      purchaseNumber: purchase.purchaseNumber,
      total: purchase.total,
    });
    sendSuccess(res, purchase, 201);
  })
);

router.post(
  '/:id/receive',
  requirePermission(PERMISSIONS.PURCHASES_WRITE),
  asyncHandler(async (req, res) => {
    const purchase = await receivePurchase(req.params.id, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'purchase.receive', 'Purchase', purchase._id, undefined, {
      purchaseNumber: purchase.purchaseNumber,
      total: purchase.total,
    });
    sendSuccess(res, purchase);
  })
);

router.post(
  '/:id/payments',
  requirePermission(PERMISSIONS.PURCHASES_WRITE),
  validate({
    body: z.object({
      amount: z.coerce.number().positive(),
      method: z.string().min(1),
      reference: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await recordPurchasePayment(req.params.id, req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'purchase.payment', 'Purchase', result.purchase._id, undefined, {
      amount: req.body.amount,
      paymentNumber: result.payment.paymentNumber,
    });
    sendSuccess(res, result, 201);
  })
);

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.PURCHASES_WRITE),
  asyncHandler(async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    if (purchase.stockReceived) throw ApiError.badRequest('Received purchases cannot be cancelled');
    if (purchase.amountPaid > 0) throw ApiError.badRequest('Refund recorded payments before cancelling');
    purchase.status = 'cancelled';
    await purchase.save();
    await audit(req, 'purchase.cancel', 'Purchase', purchase._id);
    sendSuccess(res, purchase);
  })
);

export default router;
