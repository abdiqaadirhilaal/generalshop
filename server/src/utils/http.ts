import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown, code?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Invalid request', details?: unknown) {
    return new ApiError(400, message, details, 'BAD_REQUEST');
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message, undefined, 'UNAUTHORIZED');
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new ApiError(403, message, undefined, 'FORBIDDEN');
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message, undefined, 'NOT_FOUND');
  }
  static conflict(message = 'Conflict', details?: unknown) {
    return new ApiError(409, message, details, 'CONFLICT');
  }
  static unprocessable(message = 'Unprocessable request', details?: unknown) {
    return new ApiError(422, message, details, 'UNPROCESSABLE');
  }
}

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = 'Something went wrong. Please try again.';
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    status = 422;
    message = 'Validation failed';
    details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 422;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = 'Invalid identifier';
  } else if (typeof err === 'object' && err && 'code' in err && (err as { code: number }).code === 11000) {
    status = 409;
    const key = Object.keys((err as { keyValue?: Record<string, unknown> }).keyValue ?? {})[0];
    message = key ? `A record with that ${key} already exists` : 'Duplicate record';
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.isProd || status >= 500 ? {} : { stack: err instanceof Error ? err.stack : undefined }),
  });
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>
) {
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function parsePagination(query: Record<string, unknown>, defaults = { page: 1, limit: 20 }) {
  const page = Math.max(1, Number(query.page) || defaults.page);
  const limit = Math.min(200, Math.max(1, Number(query.limit) || defaults.limit));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildMeta(total: number, page: number, limit: number) {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfRange(range: string): Date {
  const now = new Date();
  const d = new Date(now);
  switch (range) {
    case 'today':
      return startOfDay(now);
    case 'week':
      d.setDate(d.getDate() - 6);
      return startOfDay(d);
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    case '7d':
      d.setDate(d.getDate() - 6);
      return startOfDay(d);
    case '30d':
      d.setDate(d.getDate() - 29);
      return startOfDay(d);
    case '90d':
      d.setDate(d.getDate() - 89);
      return startOfDay(d);
    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}
