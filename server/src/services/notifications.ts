import { Notification } from '../models/operations.js';

export interface NotifyInput {
  type: string;
  title: string;
  message: string;
  link?: string;
  roles?: string[];
  priority?: 'low' | 'normal' | 'high';
  meta?: Record<string, unknown>;
  dedupeKey?: string;
}

/**
 * Creates an in-app notification for staff roles. Dedupe keys prevent alert
 * storms (for example repeated low-stock notices for the same product).
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    if (input.dedupeKey) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const existing = await Notification.findOne({
        'meta.dedupeKey': input.dedupeKey,
        createdAt: { $gte: since },
      }).lean();
      if (existing) return;
    }

    await Notification.create({
      type: input.type,
      title: input.title,
      message: input.message,
      link: input.link,
      audienceRoles: input.roles ?? ['super_admin', 'shop_manager'],
      priority: input.priority ?? 'normal',
      meta: { ...(input.meta ?? {}), ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}) },
    });
  } catch (error) {
    console.error('[notification] failed', (error as Error).message);
  }
}
