import { Router } from 'express';
import { z } from 'zod';
import { Supplier } from '../models/people.js';
import { Purchase } from '../models/purchasing.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generateNumber } from '../utils/sequence.js';
import { audit } from '../utils/audit.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(300).optional(),
  productsSupplied: z.array(z.string()).default([]),
  notes: z.string().trim().max(2000).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
});

router.get(
  '/',
  requirePermission(PERMISSIONS.SUPPLIERS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};
    if (query.q?.trim()) {
      const term = query.q.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { company: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
      ];
    }
    if (query.status) filter.status = query.status;

    const [suppliers, total, totals] = await Promise.all([
      Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
      Supplier.countDocuments(filter),
      Supplier.aggregate<{ _id: null; outstanding: number; purchases: number }>([
        { $match: filter },
        {
          $group: {
            _id: null,
            outstanding: { $sum: '$outstandingBalance' },
            purchases: { $sum: '$totalPurchases' },
          },
        },
      ]),
    ]);

    sendSuccess(res, suppliers, 200, {
      ...buildMeta(total, page, limit),
      totalOutstanding: totals[0]?.outstanding ?? 0,
      totalPurchases: totals[0]?.purchases ?? 0,
    });
  })
);

router.get(
  '/export',
  requirePermission(PERMISSIONS.SUPPLIERS_VIEW),
  asyncHandler(async (_req, res) => {
    const suppliers = await Supplier.find().sort({ name: 1 }).lean();
    const csv = toCsv(
      ['supplierNumber', 'name', 'company', 'phone', 'email', 'totalPurchases', 'outstandingBalance', 'status'],
      suppliers.map((supplier) => [
        supplier.supplierNumber,
        supplier.name,
        supplier.company,
        supplier.phone,
        supplier.email,
        supplier.totalPurchases,
        supplier.outstandingBalance,
        supplier.status,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-suppliers-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_VIEW),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id).lean();
    if (!supplier) throw ApiError.notFound('Supplier not found');
    const purchases = await Purchase.find({ supplier: supplier._id }).sort({ createdAt: -1 }).limit(30).lean();
    sendSuccess(res, { ...supplier, purchases });
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.SUPPLIERS_WRITE),
  validate({ body: supplierSchema }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.create({
      ...req.body,
      email: req.body.email || undefined,
      supplierNumber: await generateNumber('supplier', 'SUP'),
    });
    await audit(req, 'supplier.create', 'Supplier', supplier._id, undefined, supplier.toObject());
    sendSuccess(res, supplier, 201);
  })
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_WRITE),
  validate({ body: supplierSchema.partial() }),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw ApiError.notFound('Supplier not found');
    const before = supplier.toObject();
    Object.assign(supplier, req.body);
    if (req.body.email === '') supplier.email = undefined;
    await supplier.save();
    await audit(req, 'supplier.update', 'Supplier', supplier._id, before, supplier.toObject());
    sendSuccess(res, supplier);
  })
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_WRITE),
  asyncHandler(async (req, res) => {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) throw ApiError.notFound('Supplier not found');
    if (supplier.outstandingBalance > 0) {
      throw ApiError.conflict('Settle the outstanding balance before removing this supplier');
    }
    const purchases = await Purchase.countDocuments({ supplier: supplier._id });
    if (purchases > 0) {
      supplier.status = 'inactive';
      await supplier.save();
      sendSuccess(res, {
        deactivated: true,
        message: 'Supplier has purchase history and was deactivated instead of deleted.',
      });
      return;
    }
    await Supplier.deleteOne({ _id: supplier._id });
    await audit(req, 'supplier.delete', 'Supplier', supplier._id, supplier.toObject());
    sendSuccess(res, { deleted: true });
  })
);

export default router;
