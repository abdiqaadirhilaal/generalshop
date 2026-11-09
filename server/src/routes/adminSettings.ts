import { Router } from 'express';
import { z } from 'zod';
import { ContentPage, ContactMessage, NewsletterSubscriber, ShopSettings } from '../models/operations.js';
import { ApiError, asyncHandler, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../utils/audit.js';

const router = Router();

const paymentMethodSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(['cash', 'mobile_money', 'bank', 'card', 'other']),
  enabled: z.coerce.boolean(),
  instructions: z.string().max(1000).optional(),
  requiresReference: z.coerce.boolean().default(false),
  manualVerification: z.coerce.boolean().default(true),
});

const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(120).optional(),
  legalName: z.string().trim().max(160).optional(),
  logoUrl: z.string().max(500).optional(),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional(),
  currency: z.enum(['USD', 'SOS']).optional(),
  currencySymbol: z.string().trim().max(5).optional(),
  exchangeRate: z.coerce.number().min(0).optional(),
  taxEnabled: z.coerce.boolean().optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  deliveryFee: z.coerce.number().min(0).optional(),
  freeDeliveryThreshold: z.coerce.number().min(0).optional(),
  guestCheckout: z.coerce.boolean().optional(),
  allowNegativeStock: z.coerce.boolean().optional(),
  lowStockAlerts: z.coerce.boolean().optional(),
  loyalty: z
    .object({
      enabled: z.coerce.boolean().optional(),
      pointsPerCurrencyUnit: z.coerce.number().min(0).optional(),
      redeemValue: z.coerce.number().min(0).optional(),
    })
    .optional(),
  paymentMethods: z.array(paymentMethodSchema).optional(),
  invoice: z
    .object({
      prefix: z.string().trim().max(10).optional(),
      footer: z.string().trim().max(500).optional(),
      showLogo: z.coerce.boolean().optional(),
    })
    .optional(),
  receipt: z
    .object({
      prefix: z.string().trim().max(10).optional(),
      footer: z.string().trim().max(500).optional(),
    })
    .optional(),
  notifications: z
    .object({
      newOrder: z.coerce.boolean().optional(),
      lowStock: z.coerce.boolean().optional(),
      payment: z.coerce.boolean().optional(),
      cancellation: z.coerce.boolean().optional(),
      newCustomer: z.coerce.boolean().optional(),
      supplierBalance: z.coerce.boolean().optional(),
    })
    .optional(),
  social: z
    .object({
      facebook: z.string().max(300).optional(),
      instagram: z.string().max(300).optional(),
      whatsapp: z.string().max(300).optional(),
      tiktok: z.string().max(300).optional(),
    })
    .optional(),
  businessHours: z.string().trim().max(200).optional(),
  homepage: z
    .object({
      hero: z
        .object({
          eyebrow: z.string().max(120).optional(),
          title: z.string().max(200).optional(),
          subtitle: z.string().max(500).optional(),
          image: z.string().max(500).optional(),
          ctaLabel: z.string().max(60).optional(),
          ctaLink: z.string().max(300).optional(),
          secondaryLabel: z.string().max(60).optional(),
          secondaryLink: z.string().max(300).optional(),
        })
        .optional(),
      promoBanners: z
        .array(
          z.object({
            title: z.string().max(160),
            subtitle: z.string().max(300),
            image: z.string().max(500),
            link: z.string().max(300),
            cta: z.string().max(60),
            active: z.coerce.boolean(),
          })
        )
        .optional(),
      sections: z.record(z.coerce.boolean()).optional(),
    })
    .optional(),
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key] as Record<string, unknown>, value);
    } else {
      output[key] = value;
    }
  }
  return output as T;
}

router.get(
  '/settings',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await getSettings());
  })
);

router.put(
  '/settings',
  requirePermission(PERMISSIONS.SETTINGS_WRITE),
  validate({ body: settingsSchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const before = settings.toObject();
    const merged = deepMerge(settings.toObject() as unknown as Record<string, unknown>, req.body);

    settings.set(merged);
    settings.updatedBy = req.auth!.user._id;
    await settings.save();

    await audit(req, 'settings.update', 'ShopSettings', settings._id, before, settings.toObject());
    sendSuccess(res, settings);
  })
);

/* ─────────────────────────────── Content ──────────────────────────────── */

router.get(
  '/content',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, await ContentPage.find().sort({ slug: 1 }).lean());
  })
);

router.put(
  '/content/:slug',
  requirePermission(PERMISSIONS.CONTENT_WRITE),
  validate({
    body: z.object({
      title: z.string().trim().min(1).max(200),
      subtitle: z.string().trim().max(300).optional(),
      body: z.string().max(20000).default(''),
      sections: z
        .array(z.object({ heading: z.string().max(200), body: z.string().max(5000) }))
        .default([]),
      isPublished: z.coerce.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const page = await ContentPage.findOneAndUpdate(
      { slug: req.params.slug.toLowerCase() },
      {
        $set: {
          ...req.body,
          slug: req.params.slug.toLowerCase(),
          updatedBy: req.auth!.user._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await audit(req, 'content.update', 'ContentPage', page._id, undefined, { slug: page.slug });
    sendSuccess(res, page);
  })
);

router.delete(
  '/content/:slug',
  requirePermission(PERMISSIONS.CONTENT_WRITE),
  asyncHandler(async (req, res) => {
    const page = await ContentPage.findOneAndDelete({ slug: req.params.slug });
    if (!page) throw ApiError.notFound('Content page not found');
    await audit(req, 'content.delete', 'ContentPage', page._id, page.toObject());
    sendSuccess(res, { deleted: true });
  })
);

/* ─────────────────────────── Messages & leads ─────────────────────────── */

router.get(
  '/messages',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.status) filter.status = req.query.status;
    const messages = await ContactMessage.find(filter).sort({ createdAt: -1 }).limit(100).lean();
    sendSuccess(res, messages);
  })
);

router.patch(
  '/messages/:id',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  validate({ body: z.object({ status: z.enum(['new', 'read', 'resolved']) }) }),
  asyncHandler(async (req, res) => {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      { $set: { status: req.body.status } },
      { new: true }
    );
    if (!message) throw ApiError.notFound('Message not found');
    sendSuccess(res, message);
  })
);

router.get(
  '/newsletter',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (_req, res) => {
    const subscribers = await NewsletterSubscriber.find().sort({ createdAt: -1 }).lean();
    sendSuccess(res, subscribers);
  })
);

router.delete(
  '/newsletter/:id',
  requirePermission(PERMISSIONS.SETTINGS_VIEW),
  asyncHandler(async (req, res) => {
    await NewsletterSubscriber.findByIdAndDelete(req.params.id);
    sendSuccess(res, { deleted: true });
  })
);

export default router;
