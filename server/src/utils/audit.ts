import type { Request } from 'express';
import { AuditLog } from '../models/operations.js';

interface AuditActor {
  _id?: unknown;
  name?: string;
  email?: string;
}

export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: unknown,
  before?: unknown,
  after?: unknown
): Promise<void> {
  try {
    const actor = (req as Request & { auth?: { user?: AuditActor } })?.auth?.user;
    await AuditLog.create({
      actor: actor?._id,
      actorName: actor?.name ?? 'System',
      actorEmail: actor?.email,
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      before: sanitize(before),
      after: sanitize(after),
      ip: req?.ip,
      userAgent: req?.headers['user-agent'],
    });
  } catch (error) {
    console.error('[audit] failed to write log', (error as Error).message);
  }
}

/** Strip sensitive fields and cap payload size before persisting an audit entry. */
function sanitize(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  try {
    const json = JSON.parse(JSON.stringify(value));
    const scrub = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.slice(0, 50).map(scrub);
      if (node && typeof node === 'object') {
        const out: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
          if (/password|token|secret|authorization/i.test(key)) continue;
          out[key] = scrub(val);
        }
        return out;
      }
      if (typeof node === 'string' && node.length > 2000) return `${node.slice(0, 2000)}…`;
      return node;
    };
    return scrub(json);
  } catch {
    return undefined;
  }
}
