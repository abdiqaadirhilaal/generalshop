import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/http.js';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          throw ApiError.unprocessable('Validation failed', formatIssues(result.error.issues));
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          throw ApiError.unprocessable('Invalid query parameters', formatIssues(result.error.issues));
        }
        (req as Request & { validatedQuery?: unknown }).validatedQuery = result.data;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          throw ApiError.unprocessable('Invalid route parameters', formatIssues(result.error.issues));
        }
        req.params = result.data as typeof req.params;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function formatIssues(issues: { path: (string | number)[]; message: string }[]) {
  return issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message }));
}

/** Typed access to query parameters parsed by `validate({ query })`. */
export function validatedQuery<T>(req: Request): T {
  return ((req as Request & { validatedQuery?: unknown }).validatedQuery ?? req.query) as T;
}
