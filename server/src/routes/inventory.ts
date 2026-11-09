import { Router } from 'express';
import { z } from 'zod';
import { Product } from '../models/catalog.js';
import { InventoryMovement } from '../models/operations.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { adjustStockTo, changeStock, inventoryValuation } from '../services/inventory.js';
import { audit } from '../utils/audit.js';
import { getSettings } from '../services/settings.js';

const router = Router();

const stockAction = (type: 'stock_in' | 'stock_out' | 'damage') =>
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const quantity = Math.abs(Number(req.body.quantity));
    const delta = type === 'stock_in' ? quantity : -quantity;

    const movement = await changeStock(
      { productId: req.body.productId, delta, unitCost: req.body.unitCost },
      {
        type,
        reason: req.body.reason,
        note: req.body.note,
        user: { id: req.auth!.user._id, name: req.auth!.user.name },
        allowNegative: settings.allowNegativeStock,
      }
    );

    await audit(req, `${type}`, 'Product', req.body.productId, undefined, {
      quantity: delta,
      reason: req.body.reason,
    });
    sendSuccess(res, movement, 201);
  });

router.get(
  '/movements',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 30 });
    const filter: Record<string, unknown> = {};
    if (query.product) filter.product = query.product;
    if (query.type) filter.type = query.type;
    if (query.reference) filter.referenceNumber = { $regex: query.reference, $options: 'i' };
    if (query.from || query.to) {
      filter.createdAt = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [movements, total] = await Promise.all([
      InventoryMovement.find(filter)
        .populate('product', 'name sku unit images')
        .populate('user', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      InventoryMovement.countDocuments(filter),
    ]);
    sendSuccess(res, movements, 200, buildMeta(total, page, limit));
  })
);

router.post(
  '/stock-in',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validate({
    body: z.object({
      productId: z.string().min(1),
      quantity: z.coerce.number().positive('Quantity must be greater than zero'),
      unitCost: z.coerce.number().min(0).optional(),
      reason: z.string().trim().max(200).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  stockAction('stock_in')
);

router.post(
  '/stock-out',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validate({
    body: z.object({
      productId: z.string().min(1),
      quantity: z.coerce.number().positive('Quantity must be greater than zero'),
      reason: z.string().trim().max(200).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  stockAction('stock_out')
);

router.post(
  '/damage',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validate({
    body: z.object({
      productId: z.string().min(1),
      quantity: z.coerce.number().positive(),
      reason: z.string().trim().min(2, 'Describe the damage'),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  stockAction('damage')
);

router.post(
  '/adjust',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  validate({
    body: z.object({
      productId: z.string().min(1),
      quantity: z.coerce.number().min(0, 'Target quantity cannot be negative'),
      reason: z.string().trim().min(2, 'A reason is required for stock adjustments'),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const movement = await adjustStockTo(req.body.productId, Number(req.body.quantity), {
      reason: req.body.reason,
      note: req.body.note,
      user: { id: req.auth!.user._id, name: req.auth!.user.name },
    });
    await audit(req, 'inventory.adjust', 'Product', req.body.productId, undefined, {
      target: req.body.quantity,
      reason: req.body.reason,
    });
    sendSuccess(res, movement, 201);
  })
);

router.get(
  '/low-stock',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (_req, res) => {
    const products = await Product.find({
      status: 'active',
      $expr: { $lte: ['$stock', '$minStockLevel'] },
    })
      .select('name sku stock minStockLevel unit costPrice price images category')
      .populate('category', 'name')
      .sort({ stock: 1 })
      .lean();
    sendSuccess(res, products);
  })
);

router.get(
  '/valuation',
  requirePermission(PERMISSIONS.INVENTORY_VIEW),
  asyncHandler(async (_req, res) => {
    const [valuation, lowStock, outOfStock] = await Promise.all([
      inventoryValuation(),
      Product.countDocuments({ status: 'active', stock: { $gt: 0 }, $expr: { $lte: ['$stock', '$minStockLevel'] } }),
      Product.countDocuments({ status: 'active', stock: { $lte: 0 } }),
    ]);
    sendSuccess(res, { ...valuation, lowStock, outOfStock });
  })
);

export default router;
