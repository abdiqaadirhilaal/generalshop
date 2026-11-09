import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, type IRole } from '../models/people.js';
import { ApiError } from '../utils/http.js';

export const AUTH_COOKIE = 'hilaal_token';

export interface TokenPayload {
  sub: string;
  kind: 'staff' | 'customer';
  iat?: number;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId, kind: 'staff' }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSecure ? 'none' : 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
  });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[AUTH_COOKIE] ?? null;
}

async function resolveUser(req: Request): Promise<void> {
  const token = extractToken(req);
  if (!token) return;

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    return;
  }

  const user = await User.findById(payload.sub).select('+passwordHash').populate('role');
  if (!user || user.status !== 'active') return;

  if (user.passwordChangedAt && payload.iat) {
    const changedAt = Math.floor(user.passwordChangedAt.getTime() / 1000);
    if (payload.iat < changedAt) return;
  }

  const role = (user.role as unknown as IRole) ?? null;
  if (user.kind === 'staff' && (!role || !role.isActive)) return;

  req.auth = {
    user,
    role,
    permissions: role?.permissions ?? [],
  };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) await resolveUser(req);
    if (!req.auth) throw ApiError.unauthorized('Please sign in to continue');
    next();
  } catch (error) {
    next(error);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) await resolveUser(req);
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) await resolveUser(req);
    if (!req.auth) throw ApiError.unauthorized('Please sign in to continue');
    if (req.auth.user.kind !== 'staff') {
      throw ApiError.forbidden('Staff access required');
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(...permissions: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.auth) await resolveUser(req);
      if (!req.auth) throw ApiError.unauthorized('Please sign in to continue');
      if (req.auth.user.kind !== 'staff') throw ApiError.forbidden('Staff access required');

      const isSuperAdmin = req.auth.role?.slug === 'super_admin';
      const granted = isSuperAdmin || permissions.every((p) => req.auth!.permissions.includes(p));

      if (!granted) {
        throw ApiError.forbidden('You do not have permission to perform this action');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function hasPermission(req: Request, permission: string): boolean {
  if (!req.auth) return false;
  if (req.auth.role?.slug === 'super_admin') return true;
  return req.auth.permissions.includes(permission);
}
