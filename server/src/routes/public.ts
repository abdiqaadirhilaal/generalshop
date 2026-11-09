import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Brand, Category, Product, Review } from '../models/catalog.js';
import { ContentPage, ContactMessage, NewsletterSubscriber } from '../models/operations.js';
import { Order } from '../models/sales.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { getPublicSettings, getSettings } from '../services/settings.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { publicFormLimiter } from '../middleware/rateLimit.js';
import { notify } from '../services/notifications.js';

const router = Router();

/* ─────────────────────────────── Settings ─────────────────────────────── */

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await getPublicSettings());
  })
);

router.get(
  '/content',
  asyncHandler(async (_req, res) => {
    const pages = await ContentPage.find({ isPublished: true }).select('slug title subtitle updatedAt').lean();
    sendSuccess(res, pages);
  })
);

router.get(
  '/content/:slug',
  asyncHandler(async (req, res) => {
    const page = await ContentPage.findOne({ slug: req.params.slug, isPublished: true }).lean();
    if (!page) {
      sendSuccess(res, null);
      return;
    }
    sendSuccess(res, page);
  })
);

/* ──────────────────────────────── Catalog ─────────────────────────────── */

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
    const counts = await Product.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((row) => [String(row._id), row.count]));
    const withCounts = categories.map((category) => ({
      ...category,
      productCount: countMap.get(String(category._id)) ?? 0,
    }));
    sendSuccess(res, withCounts);
  })
);

router.get(
  '/brands',
  asyncHandler(async (_req, res) => {
    const brands = await Brand.find({ isActive: true }).sort({ name: 1 }).lean();
    sendSuccess(res, brands);
  })
);

async function categoryIdsFor(value: string): Promise<mongoose.Types.ObjectId[]> {
  const filter = mongoose.isValidObjectId(value) ? { _id: value } : { slug: value };
  const category = await Category.findOne(filter).lean();
  if (!category) return [];
  const children = await Category.find({ parent: category._id }).select('_id').lean();
  return [category._id, ...children.map((child) => child._id)];
}

router.get(
  '/products',
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 12 });
    const filter: Record<string, unknown> = { status: 'active' };

    if (query.q?.trim()) {
      const term = query.q.trim();
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { sku: { $regex: term, $options: 'i' } },
        { tags: { $regex: term, $options: 'i' } },
        { barcode: term },
      ];
    }
    if (query.category) {
      const ids = await categoryIdsFor(query.category);
      if (!ids.length) {
        sendSuccess(res, [], 200, buildMeta(0, page, limit));
        return;
      }
      filter.category = { $in: ids };
    }
    if (query.brand) {
      const brand = mongoose.isValidObjectId(query.brand)
        ? await Brand.findById(query.brand).lean()
        : await Brand.findOne({ slug: query.brand }).lean();
      if (!brand) {
        sendSuccess(res, [], 200, buildMeta(0, page, limit));
        return;
      }
      filter.brand = brand._id;
    }
    if (query.minPrice || query.maxPrice) {
      filter.price = {
        ...(query.minPrice ? { $gte: Number(query.minPrice) } : {}),
        ...(query.maxPrice ? { $lte: Number(query.maxPrice) } : {}),
      };
    }
    if (query.inStock === 'true') filter.stock = { $gt: 0 };
    if (query.featured === 'true') filter.isFeatured = true;
    if (query.onSale === 'true') {
      filter.$expr = { $gt: ['$compareAtPrice', '$price'] };
    }

    const sorts: Record<string, Record<string, 1 | -1>> = {
      newest: { createdAt: -1 },
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      popular: { soldCount: -1, rating: -1 },
      rating: { rating: -1, reviewCount: -1 },
      name: { name: 1 },
    };
    const sort = sorts[query.sort] ?? sorts.newest;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .populate('brand', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    sendSuccess(res, products, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/products/:idOrSlug',
  asyncHandler(async (req, res) => {
    const { idOrSlug } = req.params;
    const filter = mongoose.isValidObjectId(idOrSlug)
      ? { _id: idOrSlug, status: 'active' }
      : { slug: idOrSlug, status: 'active' };
    const product = await Product.findOne(filter)
      .populate('category', 'name slug')
      .populate('brand', 'name slug')
      .lean();
    if (!product) {
      sendSuccess(res, null);
      return;
    }

    const related = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      status: 'active',
    })
      .limit(4)
      .select('name slug price compareAtPrice images rating reviewCount stock unit')
      .lean();

    sendSuccess(res, { ...product, related });
  })
);

router.get(
  '/products/:id/reviews',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, string>, {
      page: 1,
      limit: 8,
    });
    const filter = { product: req.params.id, status: 'approved' as const };
    const [reviews, total] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
    ]);
    sendSuccess(res, reviews, 200, buildMeta(total, page, limit));
  })
);

router.post(
  '/products/:id/reviews',
  publicFormLimiter,
  optionalAuth,
  validate({
    body: z.object({
      rating: z.coerce.number().int().min(1).max(5),
      title: z.string().trim().max(140).optional(),
      comment: z.string().trim().min(4, 'Please write a short review').max(2000),
      authorName: z.string().trim().min(2).max(120).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.id, status: 'active' });
    if (!product) throw ApiError.notFound('Product not found');

    const user = req.auth?.user;
    const authorName = user?.name ?? req.body.authorName;
    if (!authorName) throw ApiError.badRequest('Please provide your name');

    let customer = null;
    let verifiedPurchase = false;
    if (user?.customer) {
      customer = user.customer;
      verifiedPurchase = Boolean(
        await Order.exists({
          customer: user.customer,
          status: 'delivered',
          'items.product': product._id,
        })
      );
      const existing = await Review.findOne({ product: product._id, user: user._id });
      if (existing) throw ApiError.conflict('You have already reviewed this product');
    }

    const review = await Review.create({
      product: product._id,
      user: user?._id,
      customer,
      authorName,
      rating: req.body.rating,
      title: req.body.title,
      comment: req.body.comment,
      status: 'pending',
      verifiedPurchase,
    });

    void notify({
      type: 'new_review',
      title: 'New product review awaiting moderation',
      message: `${authorName} reviewed ${product.name}.`,
      link: '/admin/reviews',
      roles: ['super_admin', 'shop_manager'],
    });

    sendSuccess(res, review, 201);
  })
);

/* ───────────────────────────────── Home ───────────────────────────────── */

router.get(
  '/home',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    const sections = settings.homepage.sections ?? {};

    const [categories, newArrivals, bestSellers, offers, recommended, reviews, counts] =
      await Promise.all([
        Category.find({ isActive: true }).sort({ sortOrder: 1 }).limit(8).lean(),
        Product.find({ status: 'active' })
          .sort({ createdAt: -1 })
          .limit(8)
          .populate('category', 'name slug')
          .lean(),
        Product.find({ status: 'active' }).sort({ soldCount: -1, rating: -1 }).limit(8).lean(),
        Product.find({ status: 'active', $expr: { $gt: ['$compareAtPrice', '$price'] } })
          .sort({ createdAt: -1 })
          .limit(8)
          .lean(),
        Product.find({ status: 'active', isFeatured: true }).sort({ rating: -1 }).limit(8).lean(),
        Review.find({ status: 'approved' })
          .sort({ createdAt: -1 })
          .limit(6)
          .populate('product', 'name slug')
          .lean(),
        Product.aggregate<{ _id: null; products: number; units: number }>([
          { $match: { status: 'active' } },
          {
            $group: {
              _id: null,
              products: { $sum: 1 },
              units: { $sum: '$stock' },
            },
          },
        ]),
      ]);

    const countsByCategory = await Product.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(countsByCategory.map((row) => [String(row._id), row.count]));

    sendSuccess(res, {
      settings: await getPublicSettings(),
      sections,
      categories: categories.map((category) => ({
        ...category,
        productCount: countMap.get(String(category._id)) ?? 0,
      })),
      newArrivals: sections.newArrivals === false ? [] : newArrivals,
      bestSellers: sections.bestSellers === false ? [] : bestSellers,
      offers: sections.offers === false ? [] : offers,
      recommended: sections.recommended === false ? [] : recommended.length ? recommended : newArrivals,
      reviews: sections.reviews === false ? [] : reviews,
      promoBanners: (settings.homepage.promoBanners ?? []).filter((banner) => banner.active),
      stats: {
        products: counts[0]?.products ?? 0,
        units: counts[0]?.units ?? 0,
        categories: categories.length,
        reviews: await Review.countDocuments({ status: 'approved' }),
      },
    });
  })
);

/* ─────────────────────────── Orders & forms ───────────────────────────── */

router.get(
  '/order-track/:orderNumber',
  asyncHandler(async (req, res) => {
    const phone = String(req.query.phone ?? '').replace(/\s+/g, '');
    if (!phone) {
      sendSuccess(res, null, 400);
      return;
    }
    const order = await Order.findOne({ orderNumber: req.params.orderNumber }).lean();
    if (!order || order.shippingAddress.phone.replace(/\s+/g, '') !== phone) {
      sendSuccess(res, null);
      return;
    }
    sendSuccess(res, {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      total: order.total,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        lineTotal: item.lineTotal,
      })),
      statusHistory: order.statusHistory,
      shippingAddress: {
        fullName: order.shippingAddress.fullName,
        city: order.shippingAddress.city,
      },
    });
  })
);

router.post(
  '/newsletter',
  publicFormLimiter,
  validate({ body: z.object({ email: z.string().trim().email('Enter a valid email') }) }),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    await NewsletterSubscriber.findOneAndUpdate(
      { email },
      { $set: { status: 'subscribed', source: 'website' } },
      { upsert: true, new: true }
    );
    sendSuccess(res, { subscribed: true }, 201);
  })
);

router.post(
  '/contact',
  publicFormLimiter,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email(),
      phone: z.string().trim().max(30).optional(),
      subject: z.string().trim().min(2).max(160),
      message: z.string().trim().min(5).max(4000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const message = await ContactMessage.create(req.body);
    void notify({
      type: 'contact_message',
      title: 'New contact message',
      message: `${message.name}: ${message.subject}`,
      link: '/admin/messages',
      roles: ['super_admin', 'shop_manager'],
    });
    sendSuccess(res, { received: true }, 201);
  })
);

router.get(
  '/customers/lookup',
  asyncHandler(async (req, res) => {
    // Public endpoint intentionally disabled — customer data is private.
    sendSuccess(res, null, 404);
  })
);

export default router;
