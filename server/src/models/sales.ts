import mongoose, { Schema, model } from 'mongoose';

/* ─────────────────────────── Shared line items ────────────────────────── */

export interface ILineItem {
  product: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  variation?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  discount: number;
  lineTotal: number;
}

export const lineItemSchema = new Schema<ILineItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    variation: String,
    unit: { type: String, default: 'piece' },
    quantity: { type: Number, required: true, min: 0.001 },
    unitPrice: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0, default: 0 },
    discount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

/* ──────────────────────────────── Order ───────────────────────────────── */

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'ready_for_delivery',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'unpaid',
  'partial',
  'paid',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface IShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  notes?: string;
}

export interface IStatusEvent {
  status: string;
  at: Date;
  by?: mongoose.Types.ObjectId;
  byName?: string;
  note?: string;
}

export interface IOrder {
  orderNumber: string;
  customer?: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  items: ILineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  shippingAddress: IShippingAddress;
  guestEmail?: string;
  stockDeducted: boolean;
  revenueRecognized: boolean;
  loyaltyAwarded: boolean;
  couponCode?: string;
  statusHistory: IStatusEvent[];
  internalNotes: { text: string; by?: mongoose.Types.ObjectId; byName?: string; at: Date }[];
  cancelReason?: string;
  deliveredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    items: { type: [lineItemSchema], validate: (v: ILineItem[]) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, required: true, default: 'cash_on_delivery' },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'unpaid',
      index: true,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending',
      index: true,
    },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      notes: String,
    },
    guestEmail: { type: String, lowercase: true, trim: true },
    stockDeducted: { type: Boolean, default: false },
    revenueRecognized: { type: Boolean, default: false },
    loyaltyAwarded: { type: Boolean, default: false },
    couponCode: String,
    statusHistory: {
      type: [
        {
          status: String,
          at: { type: Date, default: Date.now },
          by: { type: Schema.Types.ObjectId, ref: 'User' },
          byName: String,
          note: String,
        },
      ],
      default: [],
    },
    internalNotes: {
      type: [
        {
          text: String,
          by: { type: Schema.Types.ObjectId, ref: 'User' },
          byName: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    cancelReason: String,
    deliveredAt: Date,
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'shippingAddress.phone': 1 });

export const Order = model<IOrder>('Order', orderSchema);

/* ──────────────────────────────── Sale (POS) ──────────────────────────── */

export interface ISalePayment {
  method: string;
  amount: number;
  reference?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface ISale {
  saleNumber: string;
  receiptNumber: string;
  branch?: mongoose.Types.ObjectId;
  cashier: mongoose.Types.ObjectId;
  cashierName: string;
  customer?: mongoose.Types.ObjectId;
  items: ILineItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  payments: ISalePayment[];
  changeGiven: number;
  status: 'completed' | 'voided' | 'refunded' | 'partially_refunded';
  stockDeducted: boolean;
  loyaltyAwarded: boolean;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

const saleSchema = new Schema<ISale>(
  {
    saleNumber: { type: String, required: true, unique: true, index: true },
    receiptNumber: { type: String, required: true, unique: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    cashier: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cashierName: { type: String, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    items: { type: [lineItemSchema], validate: (v: ILineItem[]) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    discountTotal: { type: Number, default: 0, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    payments: {
      type: [
        {
          method: { type: String, required: true },
          amount: { type: Number, required: true, min: 0 },
          reference: String,
          status: {
            type: String,
            enum: ['pending', 'confirmed', 'failed'],
            default: 'confirmed',
          },
        },
      ],
      default: [],
    },
    changeGiven: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['completed', 'voided', 'refunded', 'partially_refunded'],
      default: 'completed',
      index: true,
    },
    stockDeducted: { type: Boolean, default: true },
    loyaltyAwarded: { type: Boolean, default: false },
    note: String,
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });

export const Sale = model<ISale>('Sale', saleSchema);

/* ─────────────────────────────── Payment ──────────────────────────────── */

export type PaymentMethodKey =
  | 'cash'
  | 'cash_at_shop'
  | 'cash_on_delivery'
  | 'evc_plus'
  | 'zaad'
  | 'sahal'
  | 'edahab'
  | 'bank_transfer'
  | 'card'
  | 'other';

export interface IPayment {
  paymentNumber: string;
  direction: 'in' | 'out';
  kind: 'sale' | 'order' | 'purchase' | 'refund' | 'other';
  reference?: mongoose.Types.ObjectId;
  referenceNumber?: string;
  method: string;
  amount: number;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'reversed';
  transactionRef?: string;
  customer?: mongoose.Types.ObjectId;
  supplier?: mongoose.Types.ObjectId;
  receivedBy?: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  notes?: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true },
    direction: { type: String, enum: ['in', 'out'], required: true, index: true },
    kind: {
      type: String,
      enum: ['sale', 'order', 'purchase', 'refund', 'other'],
      required: true,
      index: true,
    },
    reference: { type: Schema.Types.ObjectId },
    referenceNumber: String,
    method: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'failed', 'reversed'],
      default: 'confirmed',
      index: true,
    },
    transactionRef: String,
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    notes: String,
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

paymentSchema.index({ paidAt: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);
