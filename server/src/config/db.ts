import mongoose from 'mongoose';
import { env } from './env.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<void> {
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
    });
    console.log(`✓ MongoDB connected (${mongoose.connection.name})`);
  } catch (error) {
    console.error('✖ MongoDB connection failed:', (error as Error).message);
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Transactions require a replica set. We detect support once and fall back to
 * sequential, compensating writes on standalone MongoDB (typical local dev).
 */
let transactionSupport: boolean | null = null;

export async function supportsTransactions(): Promise<boolean> {
  if (transactionSupport !== null) return transactionSupport;
  try {
    const admin = mongoose.connection.db!.admin();
    const info = await admin.command({ hello: 1 });
    transactionSupport = Boolean(info.setName) || info.msg === 'isdbgrid';
  } catch {
    transactionSupport = false;
  }
  return transactionSupport;
}

export async function withTransaction<T>(
  work: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  if (!(await supportsTransactions())) {
    return work(null);
  }
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
