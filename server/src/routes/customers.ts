import { Router } from 'express';
import { z } from 'zod';
import { Customer, User } from '../models/people.js';
import { Order, Sale } from '../models/sales.js';
import { LoyaltyTransaction } from '../models/operations.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generateNumber } from '../utils/sequence.js';
import { audit } from '../utils/audit.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

router.get(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};

    if (query.q?.trim()) {
      const term = query.q.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
        { customerNumber: { $regex: term, $options: 'i' } },
      ];
    }
    if (query.status) filter.status = query.status;
    if (query.tag) filter.tags = query.tag;
    if (query.segment === 'vip') filter.totalSpending = { $gte: 200 };
    if (query.segment === 'repeat') filter.totalOrders = { $gte: 3 };
    if (query.segment === 'new') {
      filter.createdAt = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const [customers, total, totals] = await Promise.all([
      Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(filter),
      Customer.aggregate<{ _id: null; spending: number; points: number }>([
        { $match: filter },
        { $group: { _id: null, spending: { $sum: '$totalSpending' }, points: { $sum: '$loyaltyPoints' } } },
      ]),
    ]);

    sendSuccess(res, customers, 200, {
      ...buildMeta(total, page, limit),
      totalSpending: totals[0]?.spending ?? 0,
      totalPoints: totals[0]?.points ?? 0,
    });
  })
);

router.get(
  '/export',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  asyncHandler(async (_req, res) => {
    const customers = await Customer.find().sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ['customerNumber', 'name', 'phone', 'email', 'city', 'orders', 'spending', 'loyaltyPoints', 'status', 'joined'],
      customers.map((customer) => [
        customer.customerNumber,
        customer.name,
        customer.phone,
        customer.email,
        customer.city,
        customer.totalOrders,
        customer.totalSpending,
        customer.loyaltyPoints,
        customer.status,
        new Date(customer.createdAt).toISOString(),
      ])
    );
    res.set(csvResponseHeaders(`hilaal-customers-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_VIEW),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.id).lean();
    if (!customer) throw ApiError.notFound('Customer not found');

    const [orders, sales, loyalty] = await Promise.all([
      Order.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(20).lean(),
      Sale.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(20).lean(),
      LoyaltyTransaction.find({ customer: customer._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    sendSuccess(res, { ...customer, orders, sales, loyalty });
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(6).max(30),
      email: z.string().trim().email().optional().or(z.literal('')),
      address: z.string().trim().max(300).optional(),
      city: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(2000).optional(),
      tags: z.array(z.string()).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const existing = await Customer.findOne({ phone: req.body.phone });
    if (existing) throw ApiError.conflict('A customer with this phone number already exists');

    const customer = await Customer.create({
      ...req.body,
      email: req.body.email || undefined,
      customerNumber: await generateNumber('customer', 'CUS'),
    });
    await audit(req, 'customer.create', 'Customer', customer._id, undefined, customer.toObject());
    sendSuccess(res, customer, 201);
  })
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().min(6).max(30).optional(),
      email: z.string().trim().email().optional().or(z.literal('')),
      address: z.string().trim().max(300).optional(),
      city: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(2000).optional(),
      tags: z.array(z.string()).optional(),
      status: z.enum(['active', 'inactive', 'blocked']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.id);
    if (!customer) throw ApiError.notFound('Customer not found');
    const before = customer.toObject();
    Object.assign(customer, req.body);
    if (req.body.email === '') customer.email = undefined;
    await customer.save();

    if (req.body.name || req.body.phone) {
      await User.findByIdAndUpdate(customer.user, {
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.phone ? { phone: req.body.phone } : {}),
      });
    }

    await audit(req, 'customer.update', 'Customer', customer._id, before, customer.toObject());
    sendSuccess(res, customer);
  })
);

router.post(
  '/:id/loyalty',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  validate({
    body: z.object({
      points: z.coerce.number().int().refine((value) => value !== 0, 'Points cannot be zero'),
      note: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.id);
    if (!customer) throw ApiError.notFound('Customer not found');
    if (customer.loyaltyPoints + req.body.points < 0) {
      throw ApiError.badRequest('Adjustment would make the loyalty balance negative');
    }

    customer.loyaltyPoints += req.body.points;
    await customer.save();

    const transaction = await LoyaltyTransaction.create({
      customer: customer._id,
      points: req.body.points,
      type: 'adjust',
      note: req.body.note ?? 'Manual adjustment',
      balanceAfter: customer.loyaltyPoints,
      createdBy: req.auth!.user._id,
    });

    await audit(req, 'customer.loyalty_adjust', 'Customer', customer._id, undefined, {
      points: req.body.points,
      balance: customer.loyaltyPoints,
    });
    sendSuccess(res, { customer, transaction });
  })
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_WRITE),
  asyncHandler(async (req, res) => {
    const customer = await Customer.findById(req.params.id);
    if (!customer) throw ApiError.notFound('Customer not found');

    const [orders, sales] = await Promise.all([
      Order.countDocuments({ customer: customer._id }),
      Sale.countDocuments({ customer: customer._id }),
    ]);
    if (orders + sales > 0) {
      customer.status = 'inactive';
      await customer.save();
      sendSuccess(res, {
        deactivated: true,
        message: 'Customer has purchase history and was deactivated instead of deleted.',
      });
      return;
    }

    await Customer.deleteOne({ _id: customer._id });
    await User.updateOne({ customer: customer._id }, { $unset: { customer: 1 } });
    await audit(req, 'customer.delete', 'Customer', customer._id, customer.toObject());
    sendSuccess(res, { deleted: true });
  })
);

export default router;
