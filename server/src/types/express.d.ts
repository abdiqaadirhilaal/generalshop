import type { IRole, UserDocument } from '../models/people.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: UserDocument;
        role: IRole | null;
        permissions: string[];
      };
    }
  }
}

export {};
