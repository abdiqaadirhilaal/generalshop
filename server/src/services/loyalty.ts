import type mongoose from 'mongoose';
import { Customer } from '../models/people.js';
import { LoyaltyTransaction } from '../models/operations.js';
import { ApiError } from '../utils/http.js';
import { getSettings } from './settings.js';

interface LoyaltyContext {
  orderId?: mongoose.Types.ObjectId | string;
  saleId?: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId | string;
  note?: string;
  session?: mongoose.ClientSession | null;
}

export async function awardLoyaltyPoints(
  customerId: mongoose.Types.ObjectId | string,
  spend: number,
  ctx: LoyaltyContext = {}
) {
  const settings = await getSettings();
  if (!settings.loyalty.enabled || settings.loyalty.pointsPerCurrencyUnit <= 0) return null;

  const points = Math.floor(spend * settings.loyalty.pointsPerCurrencyUnit);
  if (points <= 0) return null;

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    { $inc: { loyaltyPoints: points } },
    { new: true, session: ctx.session ?? undefined }
  );
  if (!customer) return null;

  return LoyaltyTransaction.create(
    [
      {
        customer: customer._id,
        points,
        type: 'earn',
        order: ctx.orderId,
        sale: ctx.saleId,
        note: ctx.note ?? 'Points earned on purchase',
        balanceAfter: customer.loyaltyPoints,
        createdBy: ctx.userId,
      },
    ],
    { session: ctx.session ?? undefined }
  );
}

export async function redeemLoyaltyPoints(
  customerId: mongoose.Types.ObjectId | string,
  points: number,
  ctx: LoyaltyContext = {}
) {
  if (points <= 0) throw ApiError.badRequest('Points to redeem must be positive');

  const customer = await Customer.findOneAndUpdate(
    { _id: customerId, loyaltyPoints: { $gte: points } },
    { $inc: { loyaltyPoints: -points } },
    { new: true, session: ctx.session ?? undefined }
  );

  if (!customer) {
    const existing = await Customer.findById(customerId);
    throw ApiError.badRequest(
      `Insufficient loyalty points. Available: ${existing?.loyaltyPoints ?? 0}.`
    );
  }

  await LoyaltyTransaction.create(
    [
      {
        customer: customer._id,
        points: -points,
        type: 'redeem',
        order: ctx.orderId,
        sale: ctx.saleId,
        note: ctx.note ?? 'Points redeemed',
        balanceAfter: customer.loyaltyPoints,
        createdBy: ctx.userId,
      },
    ],
    { session: ctx.session ?? undefined }
  );

  const settings = await getSettings();
  return {
    customer,
    value: Math.round(points * settings.loyalty.redeemValue * 100) / 100,
  };
}
