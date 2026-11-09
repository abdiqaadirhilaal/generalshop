import type { IUser } from '../models/people.js';
import type { IRole } from '../models/people.js';

type WithId<T> = T & { _id?: unknown };

export function serializeUser(user: IUser, role?: IRole | null) {
  return {
    id: String((user as WithId<IUser>)._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    kind: user.kind,
    status: user.status,
    avatarUrl: user.avatarUrl,
    customerId: user.customer ? String(user.customer) : undefined,
    wishlist: (user.wishlist ?? []).map(String),
    role: role
      ? {
          id: String((role as WithId<IRole>)._id),
          name: role.name,
          slug: role.slug,
          permissions: role.permissions,
        }
      : null,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}
