import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Order, ORDER_STATUSES, Payment } from '../models/sales.js';
import { Customer } from '../models/people.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { optionalAuth, requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { createOrder, recordOrderPayment, transitionOrder } from '../services/orders.js';
import { audit } from '../utils/audit.js';
import { getSettings } from '../services/settings.js';
import { streamOrderInvoice } from '../utils/pdf.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

/* ───────────────────────────── Public checkout ────────────────────────── */

const orderItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().positive('Quantity must be greater than zero'),
  variation: z.string().optional(),
});

const createOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'Your cart is empty'),
  shippingAddress: z.object({
    fullName: z.string().trim().min(2, 'Full name is required').max(120),
    phone: z.string().trim().min(6, 'Phone number is required').max(30),
    address: z.string().trim().min(4, 'Delivery address is required').max(300),
    city: z.string().trim().min(2, 'City is required').max(120),
    notes: z.string().trim().max(500).optional(),
  }),
  paymentMethod: z.string().min(1, 'Choose a payment method'),
  guestEmail: z.string().trim().email().optional(),
});

router.post(
  '/',
  optionalAuth,
  validate({ body: createOrderSchema }),
  asyncHandler(async (req, res) => {
    const order = await createOrder(req.body, req);
    await audit(req, 'order.create', 'Order', order._id, undefined, {
      orderNumber: order.orderNumber,
      total: order.total,
    });
    sendSuccess(
      res,
      {
        orderNumber: order.orderNumber,
        id: order._id,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus,
      },
      201
    );
  })
);

/* ────────────────────────────── Staff orders ──────────────────────────── */

router.get(
  '/',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};

    if (query.status) filter.status = query.status;
    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
    if (query.q?.trim()) {
      const term = query.q.trim();
      filter.$or = [
        { orderNumber: { $regex: term, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: term, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: term, $options: 'i' } },
      ];
    }
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [orders, total, counts] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'name phone customerNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter),
      Order.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);

    sendSuccess(res, orders, 200, {
      ...buildMeta(total, page, limit),
      counts: Object.fromEntries(counts.map((row) => [row._id, row.count])),
    });
  })
);

router.get(
  '/export',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(5000).lean();
    const csv = toCsv(
      ['orderNumber', 'date', 'customer', 'phone', 'city', 'status', 'paymentStatus', 'paymentMethod', 'total'],
      orders.map((order) => [
        order.orderNumber,
        new Date(order.createdAt).toISOString(),
        order.shippingAddress.fullName,
        order.shippingAddress.phone,
        order.shippingAddress.city,
        order.status,
        order.paymentStatus,
        order.paymentMethod,
        order.total,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-orders-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name phone email customerNumber totalOrders totalSpending loyaltyPoints')
      .populate('user', 'name email')
      .lean();
    if (!order) throw ApiError.notFound('Order not found');

    const payments = await Payment.find({ kind: 'order', reference: order._id })
      .sort({ paidAt: -1 })
      .lean();

    sendSuccess(res, { ...order, payments });
  })
);

router.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  validate({
    body: z.object({
      status: z.enum(ORDER_STATUSES),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const order = await transitionOrder(
      req.params.id,
      req.body.status,
      { id: String(req.auth!.user._id), name: req.auth!.user.name },
      req.body.note
    );
    await audit(req, 'order.status', 'Order', order._id, undefined, {
      status: order.status,
      note: req.body.note,
    });
    sendSuccess(res, order);
  })
);

router.post(
  '/:id/payments',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  validate({
    body: z.object({
      amount: z.coerce.number().positive('Amount must be greater than zero'),
      method: z.string().min(1),
      reference: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(300).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const result = await recordOrderPayment(req.params.id, req.body, {
      id: String(req.auth!.user._id),
      name: req.auth!.user.name,
    });
    await audit(req, 'order.payment', 'Order', result.order._id, undefined, {
      amount: req.body.amount,
      method: req.body.method,
      paymentNumber: result.payment.paymentNumber,
    });
    sendSuccess(res, result, 201);
  })
);

router.post(
  '/:id/notes',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  validate({ body: z.object({ text: z.string().trim().min(1).max(1000) }) }),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw ApiError.notFound('Order not found');
    order.internalNotes.push({
      text: req.body.text,
      by: req.auth!.user._id,
      byName: req.auth!.user.name,
      at: new Date(),
    });
    await order.save();
    await audit(req, 'order.note', 'Order', order._id, undefined, { text: req.body.text });
    sendSuccess(res, order);
  })
);

router.get(
  '/:id/invoice',
  requirePermission(PERMISSIONS.ORDERS_VIEW),
  asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('customer', 'name phone').lean();
    if (!order) throw ApiError.notFound('Order not found');
    const settings = await getSettings();
    streamOrderInvoice(res, order as never, settings);
  })
);

export default router;
