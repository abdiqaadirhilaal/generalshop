import { Router } from 'express';
import { z } from 'zod';
import { Role, User } from '../models/people.js';
import { ALL_PERMISSIONS, PERMISSION_GROUPS } from '../config/permissions.js';
import { ApiError, asyncHandler, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { audit } from '../utils/audit.js';

const router = Router();

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/[0-9]/, 'Password must include a number');

router.get(
  '/permissions',
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  asyncHandler(async (_req, res) => {
    sendSuccess(res, PERMISSION_GROUPS);
  })
);

router.get(
  '/roles',
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  asyncHandler(async (_req, res) => {
    const roles = await Role.find().sort({ isSystem: -1, name: 1 }).lean();
    sendSuccess(res, roles);
  })
);

router.post(
  '/roles',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).optional(),
      permissions: z.array(z.string()).default([]),
    }),
  }),
  asyncHandler(async (req, res) => {
    const slug = req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (await Role.exists({ slug })) throw ApiError.conflict('A role with this name already exists');
    const invalid = req.body.permissions.filter((permission: string) => !ALL_PERMISSIONS.includes(permission as never));
    if (invalid.length) throw ApiError.badRequest(`Unknown permissions: ${invalid.join(', ')}`);

    const role = await Role.create({ ...req.body, slug, isSystem: false });
    await audit(req, 'role.create', 'Role', role._id, undefined, role.toObject());
    sendSuccess(res, role, 201);
  })
);

router.patch(
  '/roles/:id',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(60).optional(),
      description: z.string().trim().max(300).optional(),
      permissions: z.array(z.string()).optional(),
      isActive: z.coerce.boolean().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role not found');
    if (role.slug === 'super_admin') {
      throw ApiError.forbidden('Super Admin permissions cannot be restricted');
    }
    if (req.body.permissions) {
      const invalid = req.body.permissions.filter((permission: string) => !ALL_PERMISSIONS.includes(permission as never));
      if (invalid.length) throw ApiError.badRequest(`Unknown permissions: ${invalid.join(', ')}`);
    }

    const before = role.toObject();
    if (req.body.name && !role.isSystem) role.name = req.body.name;
    if (req.body.description !== undefined) role.description = req.body.description;
    if (req.body.permissions) role.permissions = req.body.permissions;
    if (req.body.isActive !== undefined) role.isActive = req.body.isActive;
    await role.save();

    await audit(req, 'role.update', 'Role', role._id, before, role.toObject());
    sendSuccess(res, role);
  })
);

router.delete(
  '/roles/:id',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  asyncHandler(async (req, res) => {
    const role = await Role.findById(req.params.id);
    if (!role) throw ApiError.notFound('Role not found');
    if (role.isSystem) throw ApiError.badRequest('System roles cannot be deleted');
    const users = await User.countDocuments({ role: role._id });
    if (users > 0) throw ApiError.conflict('This role is assigned to staff and cannot be deleted');
    await Role.deleteOne({ _id: role._id });
    await audit(req, 'role.delete', 'Role', role._id, role.toObject());
    sendSuccess(res, { deleted: true });
  })
);

router.get(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEES_VIEW),
  asyncHandler(async (_req, res) => {
    const employees = await User.find({ kind: 'staff' })
      .populate('role', 'name slug permissions')
      .sort({ createdAt: -1 })
      .lean();
    sendSuccess(res, employees);
  })
);

router.post(
  '/',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email(),
      phone: z.string().trim().max(30).optional(),
      password: passwordSchema,
      roleId: z.string().min(1, 'Choose a role'),
      status: z.enum(['active', 'inactive']).default('active'),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) {
      throw ApiError.conflict('An account with this email already exists');
    }
    const role = await Role.findById(req.body.roleId);
    if (!role) throw ApiError.badRequest('Role not found');

    const employee = await User.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      passwordHash: req.body.password,
      kind: 'staff',
      role: role._id,
      status: req.body.status,
    });

    await audit(req, 'employee.create', 'User', employee._id, undefined, {
      email: employee.email,
      role: role.slug,
    });
    const fresh = await User.findById(employee._id).populate('role', 'name slug permissions').lean();
    sendSuccess(res, fresh, 201);
  })
);

router.patch(
  '/:id',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().max(30).optional(),
      roleId: z.string().optional(),
      status: z.enum(['active', 'inactive', 'suspended']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const employee = await User.findOne({ _id: req.params.id, kind: 'staff' });
    if (!employee) throw ApiError.notFound('Employee not found');

    if (String(employee._id) === String(req.auth!.user._id) && req.body.status && req.body.status !== 'active') {
      throw ApiError.badRequest('You cannot deactivate your own account');
    }
    if (req.body.roleId) {
      const role = await Role.findById(req.body.roleId);
      if (!role) throw ApiError.badRequest('Role not found');
      employee.role = role._id;
    }
    if (req.body.name) employee.name = req.body.name;
    if (req.body.phone) employee.phone = req.body.phone;
    if (req.body.status) employee.status = req.body.status;
    await employee.save();

    await audit(req, 'employee.update', 'User', employee._id, undefined, {
      role: req.body.roleId,
      status: req.body.status,
    });
    const fresh = await User.findById(employee._id).populate('role', 'name slug permissions').lean();
    sendSuccess(res, fresh);
  })
);

router.post(
  '/:id/reset-password',
  requirePermission(PERMISSIONS.EMPLOYEES_WRITE),
  validate({ body: z.object({ newPassword: passwordSchema }) }),
  asyncHandler(async (req, res) => {
    const employee = await User.findOne({ _id: req.params.id, kind: 'staff' }).select('+passwordHash');
    if (!employee) throw ApiError.notFound('Employee not found');
    employee.passwordHash = req.body.newPassword;
    await employee.save();
    await audit(req, 'employee.reset_password', 'User', employee._id);
    sendSuccess(res, { reset: true });
  })
);

export default router;
