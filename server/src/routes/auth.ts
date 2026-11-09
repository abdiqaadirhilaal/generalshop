import { Router } from 'express';
import { z } from 'zod';
import { Customer, User, type IRole } from '../models/people.js';
import { ApiError, asyncHandler, sendSuccess } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';
import {
  authenticate,
  clearAuthCookie,
  optionalAuth,
  setAuthCookie,
  signToken,
} from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { generateNumber } from '../utils/sequence.js';
import { audit } from '../utils/audit.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email'),
  phone: z.string().trim().min(6, 'Enter a valid phone number').max(30),
  password: passwordSchema,
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

router.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(async (req, res) => {
    const { name, email, phone, password, address, city } = req.body;

    const existing = await User.findOne({ email });
    if (existing) throw ApiError.conflict('An account with this email already exists');

    const user = await User.create({
      name,
      email,
      phone,
      passwordHash: password,
      kind: 'customer',
      status: 'active',
    });

    const customerNumber = await generateNumber('customer', 'CUS');
    const customer = await Customer.create({
      customerNumber,
      name,
      phone,
      email,
      address,
      city,
      user: user._id,
      addresses: address && city
        ? [{ label: 'Home', fullName: name, phone, address, city, isDefault: true }]
        : [],
    });

    user.customer = customer._id;
    await user.save();

    const token = signToken(String(user._id));
    setAuthCookie(res, token);
    await audit(req, 'auth.register', 'User', user._id, undefined, { email: user.email });

    sendSuccess(res, { user: serializeUser(user, null) }, 201);
  })
);

router.post(
  '/login',
  authLimiter,
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+passwordHash').populate('role');

    if (!user) throw ApiError.unauthorized('Incorrect email or password');
    if (user.status !== 'active') {
      throw ApiError.forbidden(
        user.status === 'suspended'
          ? 'This account has been suspended. Please contact the shop.'
          : 'This account is inactive. Please contact the shop.'
      );
    }

    const valid = await user.comparePassword(password);
    if (!valid) throw ApiError.unauthorized('Incorrect email or password');

    const role = (user.role as unknown as IRole) ?? null;
    if (user.kind === 'staff' && (!role || !role.isActive)) {
      throw ApiError.forbidden('Your staff role is not active. Please contact an administrator.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signToken(String(user._id));
    setAuthCookie(res, token);
    await audit(req, 'auth.login', 'User', user._id);

    sendSuccess(res, { user: serializeUser(user, role) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    clearAuthCookie(res);
    sendSuccess(res, { loggedOut: true });
  })
);

router.get(
  '/me',
  optionalAuth,
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      sendSuccess(res, { user: null });
      return;
    }
    sendSuccess(res, {
      user: serializeUser(req.auth.user, req.auth.role),
      permissions: req.auth.permissions,
    });
  })
);

router.patch(
  '/me',
  authenticate,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().min(6).max(30).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = req.auth!.user;
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    await user.save();

    if (user.customer) {
      await Customer.findByIdAndUpdate(user.customer, {
        ...(req.body.name ? { name: req.body.name } : {}),
        ...(req.body.phone ? { phone: req.body.phone } : {}),
      });
    }

    sendSuccess(res, { user: serializeUser(user, req.auth!.role) });
  })
);

router.post(
  '/change-password',
  authenticate,
  validate({
    body: z.object({
      currentPassword: z.string().min(1),
      newPassword: passwordSchema,
    }),
  }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.user._id).select('+passwordHash');
    if (!user) throw ApiError.notFound('User not found');

    const valid = await user.comparePassword(req.body.currentPassword);
    if (!valid) throw ApiError.badRequest('Current password is incorrect');
    if (req.body.currentPassword === req.body.newPassword) {
      throw ApiError.badRequest('New password must be different from the current password');
    }

    user.passwordHash = req.body.newPassword;
    await user.save();

    setAuthCookie(res, signToken(String(user._id)));
    await audit(req, 'auth.change_password', 'User', user._id);
    sendSuccess(res, { changed: true });
  })
);

export default router;
