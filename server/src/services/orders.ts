import mongoose from 'mongoose';
import { Product } from '../models/catalog.js';
import { Customer } from '../models/people.js';
import { Order, Payment, type ILineItem, type OrderStatus } from '../models/sales.js';
import { Refund } from '../models/operations.js';
import { withTransaction } from '../config/db.js';
import { ApiError, round2 } from '../utils/http.js';
import { generateNumber } from '../utils/sequence.js';
import { getSettings } from './settings.js';
import { applyStockChanges, changeStock } from './inventory.js';
import { ACCOUNTS, postLedger } from './ledger.js';
import { awardLoyaltyPoints } from './loyalty.js';
import { notify } from './notifications.js';
import type { Request } from 'express';

interface OrderItemInput {
  productId: string;
  quantity: number;
  variation?: string;
}

export interface CreateOrderInput {
  items: OrderItemInput[];
  shippingAddress: {
    fullName: string;
    phone: string;
    address: string;
    city: string;
    notes?: string;
  };
  paymentMethod: string;
  guestEmail?: string;
  customerId?: string;
}

export interface PricedItems {
  lines: ILineItem[];
  subtotal: number;
}

/** Re-prices every line from the database — client prices are never trusted. */
export async function priceItems(items: OrderItemInput[]): Promise<PricedItems> {
  if (!items.length) throw ApiError.badRequest('Your cart is empty');

  const ids = [...new Set(items.map((item) => item.productId))];
  const products = await Product.find({ _id: { $in: ids }, status: 'active' }).lean();
  const productMap = new Map(products.map((product) => [String(product._id), product]));

  const lines: ILineItem[] = [];
  for (const item of items) {
    const product = productMap.get(String(item.productId));
    if (!product) {
      throw ApiError.badRequest('One of the products in your cart is no longer available');
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw ApiError.badRequest(`Invalid quantity for ${product.name}`);
    }
    if (product.stock < item.quantity) {
      throw ApiError.conflict(
        `Only ${product.stock} ${product.unit}(s) of ${product.name} are available`,
        { productId: String(product._id), available: product.stock }
      );
    }

    let unitPrice = product.price;
    let variationLabel: string | undefined;
    if (item.variation) {
      const variation = product.variations.find((v) => v.label === item.variation);
      if (!variation) {
        throw ApiError.badRequest(`Selected option "${item.variation}" is unavailable for ${product.name}`);
      }
      unitPrice = round2(product.price + variation.priceDelta);
      variationLabel = variation.label;
    }

    lines.push({
      product: product._id,
      name: product.name,
      sku: product.sku,
      variation: variationLabel,
      unit: product.unit,
      quantity: item.quantity,
      unitPrice,
      unitCost: product.costPrice,
      discount: 0,
      lineTotal: round2(unitPrice * item.quantity),
    });
  }

  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return { lines, subtotal };
}

export async function calculateOrderTotals(lines: ILineItem[], discountTotal = 0) {
  const settings = await getSettings();
  const subtotal = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const discount = Math.min(Math.max(0, round2(discountTotal)), subtotal);
  const taxable = round2(subtotal - discount);
  const taxTotal = settings.taxEnabled ? round2((taxable * settings.taxRate) / 100) : 0;
  const goodsTotal = round2(taxable + taxTotal);
  const deliveryFee =
    settings.freeDeliveryThreshold > 0 && goodsTotal >= settings.freeDeliveryThreshold
      ? 0
      : round2(settings.deliveryFee);
  const total = round2(goodsTotal + deliveryFee);

  return {
    subtotal,
    discountTotal: discount,
    taxTotal,
    deliveryFee,
    total,
    currency: settings.currency,
  };
}

export async function nextCustomerNumber(): Promise<string> {
  return generateNumber('customer', 'CUS', null);
}

export async function findOrCreateCustomer(input: {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  userId?: mongoose.Types.ObjectId;
  branchId?: mongoose.Types.ObjectId;
}) {
  let customer = await Customer.findOne({ phone: input.phone });
  if (customer) {
    let changed = false;
    if (input.userId && !customer.user) {
      customer.user = input.userId;
      changed = true;
    }
    if (!customer.email && input.email) {
      customer.email = input.email;
      changed = true;
    }
    if (!customer.address && input.address) {
      customer.address = input.address;
      changed = true;
    }
    if (!customer.city && input.city) {
      customer.city = input.city;
      changed = true;
    }
    if (changed) await customer.save();
    return customer;
  }

  const customerNumber = await nextCustomerNumber();
  customer = await Customer.create({
    customerNumber,
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    city: input.city,
    user: input.userId,
    branch: input.branchId,
  });

  void notify({
    type: 'new_customer',
    title: 'New customer',
    message: `${customer.name} (${customer.phone}) joined the customer list.`,
    link: `/admin/customers/${customer._id}`,
    roles: ['super_admin', 'shop_manager', 'sales_employee'],
  });

  return customer;
}

export async function createOrder(input: CreateOrderInput, req?: Request) {
  const settings = await getSettings();
  const method = settings.paymentMethods.find(
    (entry) => entry.key === input.paymentMethod && entry.enabled
  );
  if (!method) throw ApiError.badRequest('Selected payment method is not available');

  const authenticated = req?.auth;
  if (!authenticated && !settings.guestCheckout) {
    throw ApiError.unauthorized('Please sign in to place an order');
  }

  const { lines } = await priceItems(input.items);
  const totals = await calculateOrderTotals(lines, 0);

  const address = input.shippingAddress;
  if (!address.fullName?.trim() || !address.phone?.trim() || !address.address?.trim() || !address.city?.trim()) {
    throw ApiError.unprocessable('Delivery name, phone, address and city are required');
  }

  const userId = authenticated?.user?._id as mongoose.Types.ObjectId | undefined;
  const customer = await findOrCreateCustomer({
    name: address.fullName,
    phone: address.phone,
    email: input.guestEmail ?? authenticated?.user?.email,
    address: address.address,
    city: address.city,
    userId,
  });

  if (customer.status === 'blocked') {
    throw ApiError.forbidden('This account cannot place orders. Please contact the shop.');
  }

  if (userId) {
    await Customer.findByIdAndUpdate(customer._id, { user: userId });
  }

  const orderNumber = await generateNumber('order', 'ORD');

  const order = await Order.create({
    orderNumber,
    customer: customer._id,
    user: userId,
    items: lines,
    ...totals,
    paymentMethod: method.key,
    paymentStatus: 'unpaid',
    status: 'pending',
    shippingAddress: {
      fullName: address.fullName,
      phone: address.phone,
      address: address.address,
      city: address.city,
      notes: address.notes,
    },
    guestEmail: input.guestEmail ?? (!userId ? authenticated?.user?.email : undefined),
    statusHistory: [{ status: 'pending', at: new Date(), byName: 'Customer' }],
  });

  if (settings.notifications.newOrder) {
    void notify({
      type: 'new_order',
      title: 'New online order',
      message: `${order.orderNumber} — ${address.fullName}, ${totals.total} ${settings.currencySymbol}`,
      link: `/admin/orders/${order._id}`,
      priority: 'high',
      roles: ['super_admin', 'shop_manager', 'sales_employee'],
      meta: { orderId: String(order._id) },
    });
  }

  return order;
}

export async function confirmedPaidAmount(kind: 'order' | 'sale', id: mongoose.Types.ObjectId | string) {
  const [row] = await Payment.aggregate<{ total: number }>([
    {
      $match: {
        kind,
        reference: new mongoose.Types.ObjectId(String(id)),
        status: 'confirmed',
        direction: 'in',
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return round2(row?.total ?? 0);
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['ready_for_delivery', 'cancelled'],
  ready_for_delivery: ['shipped', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export function allowedNextStatuses(status: OrderStatus): OrderStatus[] {
  return ALLOWED_TRANSITIONS[status] ?? [];
}

export async function transitionOrder(
  orderId: string,
  nextStatus: OrderStatus,
  actor: { id?: string; name?: string },
  note?: string
) {
  const result = await withTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.status === nextStatus) return order;
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw ApiError.badRequest(
        `Cannot move an order from "${order.status.replace(/_/g, ' ')}" to "${nextStatus.replace(/_/g, ' ')}".`
      );
    }

    const settings = await getSettings();
    const user = actor.id
      ? { id: actor.id, name: actor.name }
      : { name: actor.name ?? 'System' };

    if (nextStatus === 'confirmed' && !order.stockDeducted) {
      await applyStockChanges(
        order.items.map((item) => ({ productId: item.product, delta: -item.quantity })),
        {
          type: 'order',
          reason: 'Order confirmed',
          referenceType: 'order',
          referenceId: order._id,
          referenceNumber: order.orderNumber,
          user,
          allowNegative: settings.allowNegativeStock,
          session,
        }
      );
      order.stockDeducted = true;
    }

    if (nextStatus === 'delivered') {
      if (!order.stockDeducted) {
        await applyStockChanges(
          order.items.map((item) => ({ productId: item.product, delta: -item.quantity })),
          {
            type: 'order',
            reason: 'Order delivered',
            referenceType: 'order',
            referenceId: order._id,
            referenceNumber: order.orderNumber,
            user,
            allowNegative: settings.allowNegativeStock,
            session,
          }
        );
        order.stockDeducted = true;
      }

      if (!order.revenueRecognized) {
        // Revenue includes any delivery fee; tax is posted separately so the
        // entry balances against the receivable for the full order total.
        const revenue = round2(order.total - order.taxTotal);
        const paid = await confirmedPaidAmount('order', order._id);
        const appliedPaid = Math.min(paid, order.total);
        const cogs = round2(
          order.items.reduce((sum, item) => sum + item.unitCost * item.quantity, 0)
        );

        await postLedger(
          [
            { account: ACCOUNTS.RECEIVABLE, debit: order.total, description: `Order ${order.orderNumber}` },
            { account: ACCOUNTS.SALES_REVENUE, credit: revenue },
            { account: ACCOUNTS.TAX_PAYABLE, credit: order.taxTotal },
            ...(appliedPaid > 0
              ? [
                  { account: ACCOUNTS.CUSTOMER_DEPOSITS, debit: appliedPaid },
                  { account: ACCOUNTS.RECEIVABLE, credit: appliedPaid },
                ]
              : []),
            { account: ACCOUNTS.COGS, debit: cogs, description: `COGS ${order.orderNumber}` },
            { account: ACCOUNTS.INVENTORY, credit: cogs },
          ],
          {
            refType: 'order',
            refId: order._id,
            refNumber: order.orderNumber,
            currency: settings.currency,
            createdBy: actor.id,
          },
          session
        );

        order.revenueRecognized = true;
        order.deliveredAt = new Date();

        if (order.customer) {
          await Customer.findByIdAndUpdate(
            order.customer,
            {
              $inc: { totalOrders: 1, totalSpending: order.total },
              $set: { lastPurchaseAt: new Date() },
            },
            { session: session ?? undefined }
          );
          if (!order.loyaltyAwarded) {
            await awardLoyaltyPoints(order.customer, order.total, {
              orderId: order._id,
              userId: actor.id,
              session,
            });
            order.loyaltyAwarded = true;
          }
        }
      }

      await Product.bulkWrite(
        order.items.map((item) => ({
          updateOne: {
            filter: { _id: item.product },
            update: { $inc: { soldCount: item.quantity } },
          },
        })),
        { session: session ?? undefined }
      );
    }

    if (nextStatus === 'cancelled' || nextStatus === 'returned') {
      if (order.stockDeducted) {
        await applyStockChanges(
          order.items.map((item) => ({ productId: item.product, delta: item.quantity })),
          {
            type: nextStatus === 'cancelled' ? 'void' : 'return',
            reason: `Order ${nextStatus}`,
            referenceType: 'order',
            referenceId: order._id,
            referenceNumber: order.orderNumber,
            user,
            session,
          }
        );
        order.stockDeducted = false;
      }

      if (nextStatus === 'cancelled') {
        const paid = await confirmedPaidAmount('order', order._id);
        if (paid > 0) {
          const refundNumber = await generateNumber('refund', 'REF', session);
          await Refund.create(
            [
              {
                refundNumber,
                order: order._id,
                customer: order.customer,
                amount: paid,
                method: order.paymentMethod,
                status: 'completed',
                reason: 'Order cancelled',
                processedBy: actor.id,
                processedByName: actor.name,
                paidAt: new Date(),
              },
            ],
            { session: session ?? undefined }
          );
          await postLedger(
            [
              {
                account: order.revenueRecognized ? ACCOUNTS.SALES_RETURNS : ACCOUNTS.CUSTOMER_DEPOSITS,
                debit: paid,
                description: `Refund ${order.orderNumber}`,
              },
              { account: ACCOUNTS.CASH, credit: paid },
            ],
            {
              refType: 'refund',
              refId: order._id,
              refNumber: order.orderNumber,
              currency: settings.currency,
              createdBy: actor.id,
            },
            session
          );
          order.paymentStatus = 'refunded';
        }
        order.cancelReason = note;
      }
    }

    order.status = nextStatus;
    order.statusHistory.push({
      status: nextStatus,
      at: new Date(),
      by: actor.id ? new mongoose.Types.ObjectId(actor.id) : undefined,
      byName: actor.name,
      note,
    });
    await order.save({ session: session ?? undefined });

    if (nextStatus === 'cancelled' && settings.notifications.cancellation) {
      void notify({
        type: 'order_cancelled',
        title: 'Order cancelled',
        message: `${order.orderNumber} was cancelled.`,
        link: `/admin/orders/${order._id}`,
        roles: ['super_admin', 'shop_manager'],
      });
    }

    return order;
  });

  return result;
}

export async function recordOrderPayment(
  orderId: string,
  input: { amount: number; method: string; reference?: string; notes?: string },
  actor: { id: string; name?: string }
) {
  return withTransaction(async (session) => {
    const order = await Order.findById(orderId).session(session);
    if (!order) throw ApiError.notFound('Order not found');
    if (order.status === 'cancelled') throw ApiError.badRequest('Cannot record payment on a cancelled order');

    const settings = await getSettings();
    const method = settings.paymentMethods.find((entry) => entry.key === input.method && entry.enabled);
    if (!method) throw ApiError.badRequest('Invalid payment method');

    const paid = await confirmedPaidAmount('order', order._id);
    const outstanding = round2(order.total - paid);
    if (input.amount <= 0) throw ApiError.badRequest('Payment amount must be positive');
    if (input.amount > outstanding + 0.01) {
      throw ApiError.badRequest(`Payment exceeds the outstanding balance of ${outstanding}`);
    }
    if (method.requiresReference && !input.reference?.trim()) {
      throw ApiError.badRequest(`${method.label} requires a transaction reference`);
    }

    const paymentNumber = await generateNumber('payment', 'PAY', session);
    const payment = await Payment.create(
      [
        {
          paymentNumber,
          direction: 'in',
          kind: 'order',
          reference: order._id,
          referenceNumber: order.orderNumber,
          method: method.key,
          amount: round2(input.amount),
          currency: settings.currency,
          status: 'confirmed',
          transactionRef: input.reference,
          customer: order.customer,
          receivedBy: actor.id,
          notes: input.notes,
          paidAt: new Date(),
        },
      ],
      { session: session ?? undefined }
    );

    await postLedger(
      [
        { account: ACCOUNTS.CASH, debit: round2(input.amount), description: `Payment ${paymentNumber}` },
        {
          account: order.revenueRecognized ? ACCOUNTS.RECEIVABLE : ACCOUNTS.CUSTOMER_DEPOSITS,
          credit: round2(input.amount),
        },
      ],
      {
        refType: 'payment',
        refId: payment[0]._id,
        refNumber: paymentNumber,
        currency: settings.currency,
        createdBy: actor.id,
      },
      session
    );

    const newPaid = round2(paid + input.amount);
    order.paymentStatus =
      newPaid >= order.total - 0.01 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
    await order.save({ session: session ?? undefined });

    if (settings.notifications.payment) {
      void notify({
        type: 'payment_received',
        title: 'Payment received',
        message: `${paymentNumber} — ${input.amount} ${settings.currencySymbol} for ${order.orderNumber}.`,
        link: `/admin/orders/${order._id}`,
        roles: ['super_admin', 'shop_manager', 'finance_manager'],
      });
    }

    return { order, payment: payment[0] };
  });
}
