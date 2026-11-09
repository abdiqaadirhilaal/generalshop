import type mongoose from 'mongoose';
import { Counter } from '../models/operations.js';

export async function nextSequence(
  key: string,
  session?: mongoose.ClientSession | null
): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true, session: session ?? undefined }
  );
  return counter!.value;
}

export function formatDocNumber(prefix: string, value: number, pad = 6): string {
  return `${prefix}-${String(value).padStart(pad, '0')}`;
}

export async function generateNumber(
  key: string,
  prefix: string,
  session?: mongoose.ClientSession | null
): Promise<string> {
  const value = await nextSequence(key, session);
  return formatDocNumber(prefix, value);
}
