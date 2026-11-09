import mongoose, { Schema, model } from 'mongoose';

/* ─────────────────────────────── Counter ──────────────────────────────── */

const counterSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
});

export const Counter = model('Counter', counterSchema);

/* ───────────────────────── Inventory movement ─────────────────────────── */

export const MOVEMENT_TYPES = [
  'stock_in',
  'stock_out',
  'sale',
  'order',
  'purchase',
  'return',
  'adjustment',
  'damage',
  'transfer_in',
  'transfer_out',
  'void',
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export interface IInventoryMovement {
  product: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  type: MovementType;
  quantity: number;
  quantityBefore: number;
  quantityAfter: number;
  unitCost?: number;
  reason?: string;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceNumber?: string;
  user?: mongoose.Types.ObjectId;
  userName?: string;
  note?: string;
  createdAt: Date;
}

const movementSchema = new Schema<IInventoryMovement>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    type: { type: String, enum: MOVEMENT_TYPES, required: true, index: true },
    quantity: { type: Number, required: true },
    quantityBefore: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    unitCost: { type: Number, min: 0 },
    reason: String,
    referenceType: String,
    referenceId: Schema.Types.ObjectId,
    referenceNumber: String,
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: String,
    note: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

movementSchema.index({ createdAt: -1 });
movementSchema.index({ product: 1, createdAt: -1 });

export const InventoryMovement = model<IInventoryMovement>('InventoryMovement', movementSchema);

/* ──────────────────────────────── Expense ─────────────────────────────── */

export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'electricity',
  'transport',
  'internet',
  'supplies',
  'marketing',
  'maintenance',
  'other',
] as const;

export interface IExpense {
  expenseNumber: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  description: string;
  amount: number;
  date: Date;
  paymentMethod: string;
  paidTo?: string;
  receiptUrl?: string;
  status: 'paid' | 'pending';
  branch?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    expenseNumber: { type: String, required: true, unique: true },
    category: { type: String, enum: EXPENSE_CATEGORIES, required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, required: true, default: Date.now, index: true },
    paymentMethod: { type: String, default: 'cash' },
    paidTo: String,
    receiptUrl: String,
    status: { type: String, enum: ['paid', 'pending'], default: 'paid', index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: String,
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });

export const Expense = model<IExpense>('Expense', expenseSchema);

/* ───────────────────────────── Return & Refund ────────────────────────── */

export interface IReturnItem {
  product: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  restock: boolean;
  condition?: string;
}

export interface IReturn {
  returnNumber: string;
  type: 'order' | 'sale';
  order?: mongoose.Types.ObjectId;
  sale?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  customerName: string;
  items: IReturnItem[];
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded';
  refundAmount: number;
  refundMethod?: string;
  restocked: boolean;
  stockRestored: boolean;
  processedBy?: mongoose.Types.ObjectId;
  processedByName?: string;
  notes?: string;
  history: { status: string; at: Date; byName?: string; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const returnSchema = new Schema<IReturn>(
  {
    returnNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ['order', 'sale'], required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    items: {
      type: [
        {
          product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          name: String,
          sku: String,
          quantity: { type: Number, required: true, min: 0.001 },
          unitPrice: { type: Number, required: true, min: 0 },
          restock: { type: Boolean, default: true },
          condition: String,
        },
      ],
      validate: (v: IReturnItem[]) => v.length > 0,
    },
    reason: { type: String, required: true },
    status: {
      type: String,
      enum: ['requested', 'approved', 'rejected', 'received', 'refunded'],
      default: 'requested',
      index: true,
    },
    refundAmount: { type: Number, default: 0, min: 0 },
    refundMethod: String,
    restocked: { type: Boolean, default: false },
    stockRestored: { type: Boolean, default: false },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedByName: String,
    notes: String,
    history: {
      type: [{ status: String, at: { type: Date, default: Date.now }, byName: String, note: String }],
      default: [],
    },
  },
  { timestamps: true }
);

export const Return = model<IReturn>('Return', returnSchema);

export interface IRefund {
  refundNumber: string;
  return?: mongoose.Types.ObjectId;
  order?: mongoose.Types.ObjectId;
  sale?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  amount: number;
  method: string;
  status: 'pending' | 'completed' | 'failed';
  reason?: string;
  processedBy: mongoose.Types.ObjectId;
  processedByName: string;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    refundNumber: { type: String, required: true, unique: true },
    return: { type: Schema.Types.ObjectId, ref: 'Return' },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
      index: true,
    },
    reason: String,
    processedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    processedByName: String,
    paidAt: Date,
  },
  { timestamps: true }
);

export const Refund = model<IRefund>('Refund', refundSchema);

/* ───────────────────────────── Notification ───────────────────────────── */

export interface INotification {
  type: string;
  title: string;
  message: string;
  link?: string;
  audienceRoles: string[];
  readBy: mongoose.Types.ObjectId[];
  priority: 'low' | 'normal' | 'high';
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    type: { type: String, required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: String,
    audienceRoles: { type: [String], default: [] },
    readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

export const Notification = model<INotification>('Notification', notificationSchema);

/* ───────────────────────── Loyalty transaction ────────────────────────── */

export interface ILoyaltyTransaction {
  customer: mongoose.Types.ObjectId;
  points: number;
  type: 'earn' | 'redeem' | 'adjust';
  order?: mongoose.Types.ObjectId;
  sale?: mongoose.Types.ObjectId;
  note?: string;
  balanceAfter: number;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const loyaltySchema = new Schema<ILoyaltyTransaction>(
  {
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    points: { type: Number, required: true },
    type: { type: String, enum: ['earn', 'redeem', 'adjust'], required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
    note: String,
    balanceAfter: { type: Number, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const LoyaltyTransaction = model<ILoyaltyTransaction>(
  'LoyaltyTransaction',
  loyaltySchema
);

/* ────────────────────────────── Audit log ─────────────────────────────── */

export interface IAuditLog {
  actor?: mongoose.Types.ObjectId;
  actorName: string;
  actorEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const auditSchema = new Schema<IAuditLog>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, required: true },
    actorEmail: String,
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });

// Audit records are append-only: block updates and deletes at the model layer.
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany'] as const) {
  auditSchema.pre(op as never, function (this: unknown, next: (err?: Error) => void) {
    next(new Error('Audit logs are immutable'));
  });
}

export const AuditLog = model<IAuditLog>('AuditLog', auditSchema);

/* ─────────────────────────────── Ledger ───────────────────────────────── */

export interface ILedgerEntry {
  date: Date;
  account: string;
  debit: number;
  credit: number;
  description: string;
  refType?: string;
  refId?: mongoose.Types.ObjectId;
  refNumber?: string;
  currency: string;
  createdBy?: mongoose.Types.ObjectId;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

const ledgerSchema = new Schema<ILedgerEntry>(
  {
    date: { type: Date, required: true, default: Date.now, index: true },
    account: { type: String, required: true, index: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    description: { type: String, required: true },
    refType: String,
    refId: Schema.Types.ObjectId,
    refNumber: String,
    currency: { type: String, default: 'USD' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ledgerSchema.index({ date: -1, account: 1 });
ledgerSchema.index({ refType: 1, refId: 1 });

export const LedgerEntry = model<ILedgerEntry>('LedgerEntry', ledgerSchema);

/* ───────────────────────────── Shop settings ──────────────────────────── */

export interface IPaymentMethodConfig {
  key: string;
  label: string;
  type: 'cash' | 'mobile_money' | 'bank' | 'card' | 'other';
  enabled: boolean;
  instructions?: string;
  requiresReference: boolean;
  manualVerification: boolean;
}

export interface IShopSettings {
  key: string;
  shopName: string;
  legalName?: string;
  logoUrl?: string;
  address: string;
  phone: string;
  email: string;
  currency: 'USD' | 'SOS';
  currencySymbol: string;
  exchangeRate: number;
  taxEnabled: boolean;
  taxRate: number;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  guestCheckout: boolean;
  allowNegativeStock: boolean;
  lowStockAlerts: boolean;
  loyalty: { enabled: boolean; pointsPerCurrencyUnit: number; redeemValue: number };
  paymentMethods: IPaymentMethodConfig[];
  invoice: { prefix: string; footer: string; showLogo: boolean };
  receipt: { prefix: string; footer: string };
  notifications: {
    newOrder: boolean;
    lowStock: boolean;
    payment: boolean;
    cancellation: boolean;
    newCustomer: boolean;
    supplierBalance: boolean;
  };
  social: { facebook?: string; instagram?: string; whatsapp?: string; tiktok?: string };
  businessHours: string;
  homepage: {
    hero: {
      eyebrow: string;
      title: string;
      subtitle: string;
      image: string;
      ctaLabel: string;
      ctaLink: string;
      secondaryLabel?: string;
      secondaryLink?: string;
    };
    promoBanners: Array<{
      title: string;
      subtitle: string;
      image: string;
      link: string;
      cta: string;
      active: boolean;
    }>;
    sections: Record<string, boolean>;
  };
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
  createdAt: Date;
}

const paymentMethodSchema = new Schema<IPaymentMethodConfig>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['cash', 'mobile_money', 'bank', 'card', 'other'], required: true },
    enabled: { type: Boolean, default: true },
    instructions: String,
    requiresReference: { type: Boolean, default: false },
    manualVerification: { type: Boolean, default: false },
  },
  { _id: false }
);

const settingsSchema = new Schema<IShopSettings>(
  {
    key: { type: String, unique: true, default: 'main' },
    shopName: { type: String, default: 'HILAAL' },
    legalName: String,
    logoUrl: String,
    address: { type: String, default: 'Makka Al-Mukarama Road, Mogadishu, Somalia' },
    phone: { type: String, default: '+252 61 000 0000' },
    email: { type: String, default: 'hello@hilaal.shop' },
    currency: { type: String, enum: ['USD', 'SOS'], default: 'USD' },
    currencySymbol: { type: String, default: '$' },
    exchangeRate: { type: Number, default: 570, min: 0 },
    taxEnabled: { type: Boolean, default: false },
    taxRate: { type: Number, default: 0, min: 0, max: 100 },
    deliveryFee: { type: Number, default: 3, min: 0 },
    freeDeliveryThreshold: { type: Number, default: 50, min: 0 },
    guestCheckout: { type: Boolean, default: true },
    allowNegativeStock: { type: Boolean, default: false },
    lowStockAlerts: { type: Boolean, default: true },
    loyalty: {
      enabled: { type: Boolean, default: true },
      pointsPerCurrencyUnit: { type: Number, default: 1 },
      redeemValue: { type: Number, default: 0.01 },
    },
    paymentMethods: {
      type: [paymentMethodSchema],
      default: [],
    },
    invoice: {
      prefix: { type: String, default: 'INV' },
      footer: { type: String, default: 'Thank you for shopping with HILAAL.' },
      showLogo: { type: Boolean, default: true },
    },
    receipt: {
      prefix: { type: String, default: 'RCP' },
      footer: { type: String, default: 'Thank you for shopping with HILAAL.' },
    },
    notifications: {
      newOrder: { type: Boolean, default: true },
      lowStock: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
      cancellation: { type: Boolean, default: true },
      newCustomer: { type: Boolean, default: true },
      supplierBalance: { type: Boolean, default: true },
    },
    social: {
      facebook: String,
      instagram: String,
      whatsapp: String,
      tiktok: String,
    },
    businessHours: { type: String, default: 'Sat–Thu, 8:00 AM – 9:00 PM' },
    homepage: {
      hero: {
        eyebrow: { type: String, default: 'The HILAAL standard' },
        title: { type: String, default: 'Everyday essentials, elevated.' },
        subtitle: {
          type: String,
          default:
            'A modern general shop for the way you live — curated groceries, home goods and daily essentials, delivered with care.',
        },
        image: { type: String, default: '' },
        ctaLabel: { type: String, default: 'Shop the collection' },
        ctaLink: { type: String, default: '/products' },
        secondaryLabel: { type: String, default: 'Our story' },
        secondaryLink: { type: String, default: '/about' },
      },
      promoBanners: {
        type: [
          {
            title: String,
            subtitle: String,
            image: String,
            link: String,
            cta: String,
            active: Boolean,
          },
        ],
        default: [],
      },
      sections: {
        type: Schema.Types.Mixed,
        default: {
          featuredCategories: true,
          newArrivals: true,
          bestSellers: true,
          offers: true,
          recommended: true,
          reviews: true,
          newsletter: true,
          promo: true,
        },
      },
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ShopSettings = model<IShopSettings>('ShopSettings', settingsSchema);

/* ───────────────────────────── Content pages ──────────────────────────── */

export interface IContentPage {
  slug: string;
  title: string;
  subtitle?: string;
  body: string;
  sections: { heading: string; body: string }[];
  isPublished: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contentPageSchema = new Schema<IContentPage>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, required: true },
    subtitle: String,
    body: { type: String, default: '' },
    sections: {
      type: [{ heading: String, body: String }],
      default: [],
    },
    isPublished: { type: Boolean, default: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const ContentPage = model<IContentPage>('ContentPage', contentPageSchema);

/* ─────────────────────── Messages & newsletter ────────────────────────── */

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: String,
    subject: { type: String, required: true },
    message: { type: String, required: true, maxlength: 4000 },
    status: { type: String, enum: ['new', 'read', 'resolved'], default: 'new', index: true },
  },
  { timestamps: true }
);

export const ContactMessage = model('ContactMessage', contactMessageSchema);

const newsletterSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['subscribed', 'unsubscribed'], default: 'subscribed' },
    source: { type: String, default: 'website' },
  },
  { timestamps: true }
);

export const NewsletterSubscriber = model('NewsletterSubscriber', newsletterSchema);
