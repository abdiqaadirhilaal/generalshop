import { Router } from 'express';
import { z } from 'zod';
import { Customer, User, type ICustomerAddress } from '../models/people.js';
import { Order } from '../models/sales.js';
import { Product, Review } from '../models/catalog.js';
import { LoyaltyTransaction } from '../models/operations.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getSettings } from '../services/settings.js';
import { streamOrderInvoice } from '../utils/pdf.js';

const router = Router();
router.use(authenticate);

async function customerFor(userId: string) {
  const customer = await Customer.findOne({ user: userId });
  if (!customer) throw ApiError.notFound('Customer profile not found');
  return customer;
}

type AddressSubdocument = ICustomerAddress & { deleteOne: () => void };

function addressById(
  customer: Awaited<ReturnType<typeof customerFor>>,
  addressId: string
): AddressSubdocument | null {
  const addresses = customer.addresses as unknown as {
    id: (id: string) => AddressSubdocument | null;
  };
  return addresses.id(addressId);
}

/* ─────────────────────────────── Orders ───────────────────────────────── */

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query as Record<string, string>, {
      page: 1,
      limit: 10,
    });
    const user = req.auth!.user;
    const filter: Record<string, unknown> = { user: user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    sendSuccess(res, orders, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.auth!.user._id }).lean();
    if (!order) throw ApiError.notFound('Order not found');
    sendSuccess(res, order);
  })
);

router.get(
  '/orders/:id/invoice',
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ _id: req.params.id, user: req.auth!.user._id })
      .populate('customer', 'name phone')
      .lean();
    if (!order) throw ApiError.notFound('Order not found');
    const settings = await getSettings();
    streamOrderInvoice(res, order as never, settings);
  })
);

/* ────────────────────────────── Addresses ─────────────────────────────── */

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  address: z.string().trim().min(4).max(300),
  city: z.string().trim().min(2).max(120),
  isDefault: z.coerce.boolean().default(false),
});

router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    const customer = await customerFor(String(req.auth!.user._id));
    sendSuccess(res, customer.addresses);
  })
);

router.post(
  '/addresses',
  validate({ body: addressSchema }),
  asyncHandler(async (req, res) => {
    const customer = await customerFor(String(req.auth!.user._id));
    const isFirst = customer.addresses.length === 0;
    if (req.body.isDefault || isFirst) {
      customer.addresses.forEach((entry) => {
        entry.isDefault = false;
      });
    }
    customer.addresses.push({
      ...req.body,
      isDefault: req.body.isDefault || isFirst,
    });
    await customer.save();
    sendSuccess(res, customer.addresses, 201);
  })
);

router.patch(
  '/addresses/:addressId',
  validate({ body: addressSchema.partial() }),
  asyncHandler(async (req, res) => {
    const customer = await customerFor(String(req.auth!.user._id));
    const address = addressById(customer, req.params.addressId);
    if (!address) throw ApiError.notFound('Address not found');

    if (req.body.isDefault) {
      customer.addresses.forEach((entry) => {
        entry.isDefault = false;
      });
    }
    Object.assign(address, req.body);
    await customer.save();
    sendSuccess(res, customer.addresses);
  })
);

router.delete(
  '/addresses/:addressId',
  asyncHandler(async (req, res) => {
    const customer = await customerFor(String(req.auth!.user._id));
    const address = addressById(customer, req.params.addressId);
    if (!address) throw ApiError.notFound('Address not found');
    address.deleteOne();
    if (customer.addresses.length && !customer.addresses.some((entry) => entry.isDefault)) {
      customer.addresses[0].isDefault = true;
    }
    await customer.save();
    sendSuccess(res, customer.addresses);
  })
);

/* ─────────────────────────────── Loyalty ──────────────────────────────── */

router.get(
  '/loyalty',
  asyncHandler(async (req, res) => {
    const customer = await customerFor(String(req.auth!.user._id));
    const transactions = await LoyaltyTransaction.find({ customer: customer._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const settings = await getSettings();
    sendSuccess(res, {
      points: customer.loyaltyPoints,
      value: Math.round(customer.loyaltyPoints * settings.loyalty.redeemValue * 100) / 100,
      enabled: settings.loyalty.enabled,
      transactions,
    });
  })
);

/* ─────────────────────────────── Wishlist ─────────────────────────────── */

router.get(
  '/wishlist',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.user._id).populate({
      path: 'wishlist',
      match: { status: 'active' },
      select: 'name slug price compareAtPrice images rating reviewCount stock unit category',
      populate: { path: 'category', select: 'name slug' },
    });
    sendSuccess(res, user?.wishlist ?? []);
  })
);

router.post(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    const product = await Product.findOne({ _id: req.params.productId, status: 'active' });
    if (!product) throw ApiError.notFound('Product not found');

    const user = await User.findById(req.auth!.user._id);
    if (!user) throw ApiError.notFound('User not found');
    const exists = user.wishlist.some((id) => String(id) === String(product._id));
    if (exists) user.wishlist = user.wishlist.filter((id) => String(id) !== String(product._id));
    else user.wishlist.push(product._id);
    await user.save();
    sendSuccess(res, { wishlisted: !exists });
  })
);

/* ─────────────────────────────── Reviews ──────────────────────────────── */

router.get(
  '/reviews',
  asyncHandler(async (req, res) => {
    const reviews = await Review.find({ user: req.auth!.user._id })
      .populate('product', 'name slug images')
      .sort({ createdAt: -1 })
      .lean();
    sendSuccess(res, reviews);
  })
);

export default router;
