import { Router } from 'express';
import { z } from 'zod';
import { Return } from '../models/operations.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
  createReturn,
  decideReturn,
  receiveReturn,
  refundReturn,
} from '../services/returns.js';
import { audit } from '../utils/audit.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.RETURNS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.type) filter.type = query.type;
    if (query.q?.trim()) {
      filter.$or = [
        { returnNumber: { $regex: query.q.trim(), $options: 'i' } },
        { customerName: { $regex: query.q.trim(), $options: 'i' } },
      ];
    }

    const [returns, total] = await Promise.all([
      Return.find(filter)
        .populate('order', 'orderNumber')
        .populate('sale', 'saleNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Return.countDocuments(filter),
    ]);
    sendSuccess(res, returns, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/export',
  requirePermission(PERMISSIONS.RETURNS_VIEW),
  asyncHandler(async (_req, res) => {
    const returns = await Return.find().sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ['returnNumber', 'date', 'type', 'reference', 'customer', 'reason', 'status', 'refundAmount'],
      returns.map((record) => [
        record.returnNumber,
        new Date(record.createdAt).toISOString(),
        record.type,
        String(record.order ?? record.sale ?? ''),
        record.customerName,
        record.reason,
        record.status,
        record.refundAmount,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-returns-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.RETURNS_VIEW),
  asyncHandler(async (req, res) => {
    const record = await Return.findById(req.params.id)
      .populate('order', 'orderNumber total status items')
      .populate('sale', 'saleNumber total status items')
      .populate('customer', 'name phone')
      .lean();
    if (!record) throw ApiError.notFound('Return not found');
    sendSuccess(res, record);
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.RETURNS_WRITE),
  validate({
    body: z.object({
      type: z.enum(['order', 'sale']),
      referenceId: z.string().min(1),
      items: z
        .array(
          z.object({
            productId: z.string().min(1),
            quantity: z.coerce.number().positive(),
            restock: z.coerce.boolean().default(true),
            condition: z.string().max(200).optional(),
          })
        )
        .min(1),
      reason: z.string().trim().min(3).max(500),
      notes: z.string().trim().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const record = await createReturn(req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'return.create', 'Return', record._id, undefined, {
      returnNumber: record.returnNumber,
      refundAmount: record.refundAmount,
    });
    sendSuccess(res, record, 201);
  })
);

router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.RETURNS_WRITE),
  validate({ body: z.object({ note: z.string().trim().max(500).optional() }).optional() }),
  asyncHandler(async (req, res) => {
    const record = await decideReturn(
      req.params.id,
      'approved',
      { id: String(req.auth!.user._id), name: req.auth!.user.name },
      req.body?.note
    );
    await audit(req, 'return.approve', 'Return', record._id);
    sendSuccess(res, record);
  })
);

router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.RETURNS_WRITE),
  validate({ body: z.object({ note: z.string().trim().max(500).optional() }).optional() }),
  asyncHandler(async (req, res) => {
    const record = await decideReturn(
      req.params.id,
      'rejected',
      { id: String(req.auth!.user._id), name: req.auth!.user.name },
      req.body?.note
    );
    await audit(req, 'return.reject', 'Return', record._id);
    sendSuccess(res, record);
  })
);

router.post(
  '/:id/receive',
  requirePermission(PERMISSIONS.RETURNS_WRITE),
  asyncHandler(async (req, res) => {
    const record = await receiveReturn(req.params.id, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'return.receive', 'Return', record._id, undefined, {
      restocked: record.restocked,
    });
    sendSuccess(res, record);
  })
);

router.post(
  '/:id/refund',
  requirePermission(PERMISSIONS.RETURNS_WRITE),
  validate({
    body: z.object({
      method: z.string().default('cash'),
      amount: z.coerce.number().positive().optional(),
      notes: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await refundReturn(req.params.id, req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'return.refund', 'Return', result.return._id, undefined, {
      refundNumber: result.refund.refundNumber,
      amount: result.refund.amount,
    });
    sendSuccess(res, result, 201);
  })
);

export default router;
