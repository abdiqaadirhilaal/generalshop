import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Brand, Category, Product, Review } from '../models/catalog.js';
import { Order, Sale } from '../models/sales.js';
import { Purchase } from '../models/purchasing.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess, slugify } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { audit } from '../utils/audit.js';
import { adjustStockTo, changeStock } from '../services/inventory.js';
import { csvResponseHeaders, parseCsv, toCsv } from '../utils/csv.js';

const router = Router();

/* ─────────────────────────────── Products ─────────────────────────────── */

const variationSchema = z.object({
  label: z.string().trim().min(1),
  sku: z.string().trim().optional(),
  priceDelta: z.coerce.number().default(0),
  isDefault: z.coerce.boolean().default(false),
});

const productBodySchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(200),
  sku: z.string().trim().max(60).optional(),
  barcode: z.string().trim().max(80).optional(),
  category: z.string().min(1, 'Choose a category'),
  brand: z.string().optional().nullable(),
  description: z.string().max(5000).optional(),
  shortDescription: z.string().max(300).optional(),
  unit: z.enum(['piece', 'box', 'kg', 'liter', 'pack', 'dozen', 'meter', 'other']).default('piece'),
  costPrice: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  compareAtPrice: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().min(0).default(0),
  minStockLevel: z.coerce.number().min(0).default(5),
  images: z.array(z.string()).default([]),
  specs: z.array(z.object({ key: z.string(), value: z.string() })).default([]),
  variationLabel: z.string().optional(),
  variations: z.array(variationSchema).default([]),
  tags: z.array(z.string()).default([]),
  status: z.enum(['active', 'draft', 'archived']).default('active'),
  isFeatured: z.coerce.boolean().default(false),
});

async function uniqueSlug(name: string, excludeId?: string) {
  const base = slugify(name) || `product-${Date.now()}`;
  let slug = base;
  let counter = 2;
  while (await Product.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

async function uniqueSku(sku?: string) {
  if (sku?.trim()) {
    const exists = await Product.exists({ sku: sku.trim().toUpperCase() });
    if (exists) throw ApiError.conflict(`SKU "${sku}" is already in use`);
    return sku.trim().toUpperCase();
  }
  let candidate = `HIL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  while (await Product.exists({ sku: candidate })) {
    candidate = `HIL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
  return candidate;
}

router.get(
  '/products',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};

    if (query.q?.trim()) {
      filter.$or = [
        { name: { $regex: query.q.trim(), $options: 'i' } },
        { sku: { $regex: query.q.trim(), $options: 'i' } },
        { barcode: query.q.trim() },
      ];
    }
    if (query.category) filter.category = query.category;
    if (query.brand) filter.brand = query.brand;
    if (query.status) filter.status = query.status;
    if (query.stock === 'low') {
      filter.stock = { $gt: 0 };
      filter.$expr = { $lte: ['$stock', '$minStockLevel'] };
    }
    if (query.stock === 'out') filter.stock = { $lte: 0 };
    if (query.stock === 'in') filter.stock = { $gt: 0 };

    const sorts: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      name: { name: 1 },
      stock: { stock: 1 },
      price: { price: -1 },
      popular: { soldCount: -1 },
    };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .populate('brand', 'name')
        .sort(sorts[query.sort] ?? sorts.newest)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    sendSuccess(res, products, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/products/export',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (_req, res) => {
    const products = await Product.find()
      .populate('category', 'name')
      .populate('brand', 'name')
      .lean();
    const csv = toCsv(
      [
        'name',
        'sku',
        'barcode',
        'category',
        'brand',
        'unit',
        'costPrice',
        'price',
        'compareAtPrice',
        'stock',
        'minStockLevel',
        'status',
        'description',
        'images',
        'tags',
      ],
      products.map((product) => [
        product.name,
        product.sku,
        product.barcode,
        (product.category as unknown as { name?: string })?.name ?? '',
        (product.brand as unknown as { name?: string })?.name ?? '',
        product.unit,
        product.costPrice,
        product.price,
        product.compareAtPrice,
        product.stock,
        product.minStockLevel,
        product.status,
        product.description,
        (product.images ?? []).join('|'),
        (product.tags ?? []).join('|'),
      ])
    );
    res.set(csvResponseHeaders(`hilaal-products-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.post(
  '/products/import',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  asyncHandler(async (req, res) => {
    const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
    if (!csv.trim()) throw ApiError.badRequest('Provide CSV content');

    const rows = parseCsv(csv);
    if (!rows.length) throw ApiError.badRequest('No rows found in the CSV');
    if (rows.length > 2000) throw ApiError.badRequest('Import is limited to 2,000 rows at a time');

    let created = 0;
    let updated = 0;
    const errors: { row: number; message: string }[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        const name = row.name?.trim();
        const price = Number(row.price);
        if (!name) throw new Error('name is required');
        if (!Number.isFinite(price) || price < 0) throw new Error('price must be a valid number');

        let category = row.category
          ? await Category.findOne({ $or: [{ name: row.category }, { slug: slugify(row.category) }] })
          : null;
        if (!category) {
          category = await Category.create({
            name: row.category || 'Uncategorised',
            slug: slugify(row.category || 'uncategorised'),
          });
        }

        let brand = null;
        if (row.brand) {
          brand = await Brand.findOne({ slug: slugify(row.brand) });
          if (!brand) brand = await Brand.create({ name: row.brand, slug: slugify(row.brand) });
        }

        const existing = row.sku ? await Product.findOne({ sku: row.sku.toUpperCase() }) : null;
        const payload = {
          name,
          category: category._id,
          brand: brand?._id,
          unit: (row.unit as 'piece') || 'piece',
          costPrice: Number(row.costPrice) || 0,
          price,
          compareAtPrice: row.compareAtPrice ? Number(row.compareAtPrice) : undefined,
          minStockLevel: Number(row.minStockLevel) || 5,
          description: row.description,
          images: row.images ? row.images.split('|').map((s) => s.trim()).filter(Boolean) : [],
          tags: row.tags ? row.tags.split('|').map((s) => s.trim()).filter(Boolean) : [],
          status: (row.status as 'active') || 'active',
          barcode: row.barcode,
        };

        if (existing) {
          const targetStock = row.stock !== undefined && row.stock !== '' ? Number(row.stock) : existing.stock;
          await Product.updateOne({ _id: existing._id }, { $set: payload });
          if (targetStock !== existing.stock) {
            await adjustStockTo(String(existing._id), targetStock, {
              reason: 'CSV import stock update',
              user: { id: req.auth!.user._id, name: req.auth!.user.name },
            });
          }
          updated += 1;
        } else {
          const product = await Product.create({
            ...payload,
            slug: await uniqueSlug(name),
            sku: await uniqueSku(row.sku),
            stock: 0,
          });
          const openingStock = Number(row.stock) || 0;
          if (openingStock > 0) {
            await changeStock(
              { productId: product._id, delta: openingStock },
              {
                type: 'stock_in',
                reason: 'Opening stock (CSV import)',
                user: { id: req.auth!.user._id, name: req.auth!.user.name },
              }
            );
          }
          created += 1;
        }
      } catch (error) {
        errors.push({ row: index + 2, message: (error as Error).message });
      }
    }

    await audit(req, 'products.import', 'Product', undefined, undefined, { created, updated, errors: errors.length });
    sendSuccess(res, { created, updated, errors, total: rows.length });
  })
);

router.get(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('brand', 'name')
      .lean();
    if (!product) throw ApiError.notFound('Product not found');
    sendSuccess(res, product);
  })
);

router.post(
  '/products',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: productBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!(await Category.exists({ _id: body.category }))) throw ApiError.badRequest('Category not found');
    if (body.compareAtPrice && body.compareAtPrice <= body.price) {
      throw ApiError.badRequest('Original price must be higher than the selling price');
    }

    const product = await Product.create({
      ...body,
      brand: body.brand || undefined,
      compareAtPrice: body.compareAtPrice || undefined,
      slug: await uniqueSlug(body.name),
      sku: await uniqueSku(body.sku),
      stock: 0,
    });

    if (body.stock > 0) {
      await changeStock(
        { productId: product._id, delta: body.stock, unitCost: body.costPrice },
        {
          type: 'stock_in',
          reason: 'Opening stock',
          user: { id: req.auth!.user._id, name: req.auth!.user.name },
        }
      );
    }

    await audit(req, 'product.create', 'Product', product._id, undefined, product.toObject());
    const fresh = await Product.findById(product._id).lean();
    sendSuccess(res, fresh, 201);
  })
);

router.patch(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: productBodySchema.partial() }),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product not found');

    const before = product.toObject();
    const body = { ...req.body };
    const targetStock = body.stock;
    delete body.stock;

    if (body.category && !(await Category.exists({ _id: body.category }))) {
      throw ApiError.badRequest('Category not found');
    }
    if (body.name && body.name !== product.name) {
      body.slug = await uniqueSlug(body.name, String(product._id));
    }
    if (body.sku && body.sku.toUpperCase() !== product.sku) {
      body.sku = await uniqueSku(body.sku);
    }
    if (body.brand === '') body.brand = undefined;
    if (body.compareAtPrice === null) body.compareAtPrice = undefined;

    Object.assign(product, body);
    await product.save();

    if (targetStock !== undefined && Number(targetStock) !== product.stock) {
      await adjustStockTo(String(product._id), Number(targetStock), {
        reason: 'Manual product edit',
        user: { id: req.auth!.user._id, name: req.auth!.user.name },
      });
    }

    await audit(req, 'product.update', 'Product', product._id, before, product.toObject());
    const fresh = await Product.findById(product._id).lean();
    sendSuccess(res, fresh);
  })
);

router.delete(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCTS_DELETE),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw ApiError.notFound('Product not found');

    const [orders, sales, purchases] = await Promise.all([
      Order.countDocuments({ 'items.product': product._id }),
      Sale.countDocuments({ 'items.product': product._id }),
      Purchase.countDocuments({ 'items.product': product._id }),
    ]);

    if (orders + sales + purchases > 0) {
      product.status = 'archived';
      await product.save();
      await audit(req, 'product.archive', 'Product', product._id, undefined, {
        reason: 'Referenced by transactions',
      });
      sendSuccess(res, {
        archived: true,
        message: 'Product has sales history and was archived instead of deleted.',
      });
      return;
    }

    await Product.deleteOne({ _id: product._id });
    await audit(req, 'product.delete', 'Product', product._id, product.toObject());
    sendSuccess(res, { deleted: true });
  })
);

router.post(
  '/products/bulk',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({
    body: z.object({
      ids: z.array(z.string()).min(1),
      action: z.enum(['archive', 'activate', 'draft', 'delete']),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { ids, action } = req.body;
    if (action === 'delete') {
      const referenced = await Promise.all(
        ids.map(async (id: string) => {
          const [orders, sales, purchases] = await Promise.all([
            Order.countDocuments({ 'items.product': id }),
            Sale.countDocuments({ 'items.product': id }),
            Purchase.countDocuments({ 'items.product': id }),
          ]);
          return orders + sales + purchases > 0 ? id : null;
        })
      );
      const protectedIds = referenced.filter(Boolean) as string[];
      const deletable = ids.filter((id: string) => !protectedIds.includes(id));
      if (protectedIds.length) {
        await Product.updateMany({ _id: { $in: protectedIds } }, { $set: { status: 'archived' } });
      }
      await Product.deleteMany({ _id: { $in: deletable } });
      await audit(req, 'products.bulk_delete', 'Product', undefined, undefined, { ids, protectedIds });
      sendSuccess(res, { deleted: deletable.length, archived: protectedIds.length });
      return;
    }

    const status = action === 'archive' ? 'archived' : action === 'activate' ? 'active' : 'draft';
    const result = await Product.updateMany({ _id: { $in: ids } }, { $set: { status } });
    await audit(req, 'products.bulk_update', 'Product', undefined, undefined, { ids, action });
    sendSuccess(res, { updated: result.modifiedCount });
  })
);

/* ─────────────────────────────── Reviews ──────────────────────────────── */

router.get(
  '/reviews',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 20 });
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate('product', 'name slug images')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
    ]);
    sendSuccess(res, reviews, 200, buildMeta(total, page, limit));
  })
);

router.patch(
  '/reviews/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: z.object({ status: z.enum(['approved', 'rejected', 'pending']) }) }),
  asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { $set: { status: req.body.status } },
      { new: true }
    );
    if (!review) throw ApiError.notFound('Review not found');

    const stats = await Review.aggregate<{ avg: number; count: number }>([
      { $match: { product: review.product, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    await Product.findByIdAndUpdate(review.product, {
      $set: {
        rating: stats[0]?.avg ? Math.round(stats[0].avg * 10) / 10 : 0,
        reviewCount: stats[0]?.count ?? 0,
      },
    });

    await audit(req, 'review.moderate', 'Review', review._id, undefined, { status: review.status });
    sendSuccess(res, review);
  })
);

router.delete(
  '/reviews/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) throw ApiError.notFound('Review not found');
    await audit(req, 'review.delete', 'Review', review._id, review.toObject());
    sendSuccess(res, { deleted: true });
  })
);

/* ────────────────────────────── Categories ────────────────────────────── */

const categorySchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().max(2000).optional(),
  image: z.string().optional(),
  parent: z.string().optional().nullable(),
  isActive: z.coerce.boolean().default(true),
  sortOrder: z.coerce.number().default(0),
});

router.get(
  '/categories/admin',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (_req, res) => {
    const categories = await Category.find().populate('parent', 'name').sort({ sortOrder: 1 }).lean();
    const counts = await Product.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
    sendSuccess(
      res,
      categories.map((category) => ({
        ...category,
        productCount: countMap.get(String(category._id)) ?? 0,
      }))
    );
  })
);

router.post(
  '/categories',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  validate({ body: categorySchema }),
  asyncHandler(async (req, res) => {
    const slug = await uniqueCategorySlug(req.body.name);
    const category = await Category.create({
      ...req.body,
      parent: req.body.parent || null,
      slug,
    });
    await audit(req, 'category.create', 'Category', category._id, undefined, category.toObject());
    sendSuccess(res, category, 201);
  })
);

router.patch(
  '/categories/:id',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  validate({ body: categorySchema.partial() }),
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw ApiError.notFound('Category not found');

    if (req.body.parent && req.body.parent === String(category._id)) {
      throw ApiError.badRequest('A category cannot be its own parent');
    }
    if (req.body.parent && (await Category.countDocuments({ parent: category._id })) > 0) {
      throw ApiError.badRequest('This category has subcategories and cannot be nested under another category');
    }

    const before = category.toObject();
    Object.assign(category, req.body);
    if (req.body.parent === null) category.parent = undefined;
    if (req.body.name && req.body.name !== before.name) {
      category.slug = await uniqueCategorySlug(req.body.name, String(category._id));
    }
    await category.save();
    await audit(req, 'category.update', 'Category', category._id, before, category.toObject());
    sendSuccess(res, category);
  })
);

router.delete(
  '/categories/:id',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id);
    if (!category) throw ApiError.notFound('Category not found');

    const [products, children] = await Promise.all([
      Product.countDocuments({ category: category._id }),
      Category.countDocuments({ parent: category._id }),
    ]);
    if (products > 0 || children > 0) {
      category.isActive = false;
      await category.save();
      await audit(req, 'category.archive', 'Category', category._id);
      sendSuccess(res, {
        archived: true,
        message: 'Category is in use and was deactivated instead of deleted.',
      });
      return;
    }
    await Category.deleteOne({ _id: category._id });
    await audit(req, 'category.delete', 'Category', category._id, category.toObject());
    sendSuccess(res, { deleted: true });
  })
);

async function uniqueCategorySlug(name: string, excludeId?: string) {
  const base = slugify(name);
  let slug = base;
  let counter = 2;
  while (await Category.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

/* ──────────────────────────────── Brands ──────────────────────────────── */

router.get(
  '/brands/admin',
  requirePermission(PERMISSIONS.PRODUCTS_VIEW),
  asyncHandler(async (_req, res) => {
    const brands = await Brand.find().sort({ name: 1 }).lean();
    sendSuccess(res, brands);
  })
);

router.post(
  '/brands',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      description: z.string().max(1000).optional(),
      logo: z.string().optional(),
      isActive: z.coerce.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const base = slugify(req.body.name);
    let slug = base;
    let counter = 2;
    while (await Brand.exists({ slug })) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    const brand = await Brand.create({ ...req.body, slug });
    await audit(req, 'brand.create', 'Brand', brand._id, undefined, brand.toObject());
    sendSuccess(res, brand, 201);
  })
);

router.patch(
  '/brands/:id',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      description: z.string().max(1000).optional(),
      logo: z.string().optional(),
      isActive: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id);
    if (!brand) throw ApiError.notFound('Brand not found');
    Object.assign(brand, req.body);
    if (req.body.name) brand.slug = slugify(req.body.name);
    await brand.save();
    await audit(req, 'brand.update', 'Brand', brand._id);
    sendSuccess(res, brand);
  })
);

router.delete(
  '/brands/:id',
  requirePermission(PERMISSIONS.CATEGORIES_WRITE),
  asyncHandler(async (req, res) => {
    const used = await Product.countDocuments({ brand: req.params.id });
    if (used > 0) throw ApiError.conflict('This brand is used by products and cannot be deleted');
    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) throw ApiError.notFound('Brand not found');
    await audit(req, 'brand.delete', 'Brand', brand._id, brand.toObject());
    sendSuccess(res, { deleted: true });
  })
);

export default router;
