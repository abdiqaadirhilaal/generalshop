export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  counts?: Record<string, number>;
}

export interface Page<T> {
  items: T[];
  meta: ApiMeta;
}

export interface Role {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem?: boolean;
  isActive?: boolean;
}

export interface User {
  id: string;
  /** Raw Mongo id — present on admin employee list responses. */
  _id?: string;
  name: string;
  email: string;
  phone?: string;
  kind: 'staff' | 'customer';
  status: string;
  avatarUrl?: string;
  customerId?: string;
  wishlist: string[];
  role: { id: string; name: string; slug: string; permissions: string[] } | null;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface PaymentMethodConfig {
  key: string;
  label: string;
  type: 'cash' | 'mobile_money' | 'bank' | 'card' | 'other';
  enabled: boolean;
  instructions?: string;
  requiresReference: boolean;
  manualVerification: boolean;
}

export interface ShopSettings {
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
  allowNegativeStock?: boolean;
  lowStockAlerts?: boolean;
  loyalty: { enabled: boolean; pointsPerCurrencyUnit: number; redeemValue: number };
  paymentMethods: PaymentMethodConfig[];
  invoice?: { prefix: string; footer: string; showLogo: boolean };
  receipt?: { prefix: string; footer: string };
  notifications?: Record<string, boolean>;
  social?: { facebook?: string; instagram?: string; whatsapp?: string; tiktok?: string };
  businessHours?: string;
  homepage?: HomepageSettings;
}

export interface HomepageSettings {
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
  promoBanners: {
    title: string;
    subtitle: string;
    image: string;
    link: string;
    cta: string;
    active: boolean;
  }[];
  sections: Record<string, boolean>;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: { _id: string; name: string } | string | null;
  isActive: boolean;
  sortOrder: number;
  productCount?: number;
}

export interface Brand {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  isActive: boolean;
}

export interface ProductVariation {
  label: string;
  sku?: string;
  priceDelta: number;
  isDefault: boolean;
}

export interface Product {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  barcode?: string;
  category?: { _id: string; name: string; slug: string } | string;
  brand?: { _id: string; name: string; slug?: string } | string | null;
  description?: string;
  shortDescription?: string;
  unit: string;
  costPrice: number;
  price: number;
  compareAtPrice?: number;
  stock: number;
  minStockLevel: number;
  images: string[];
  specs: { key: string; value: string }[];
  variationLabel?: string;
  variations: ProductVariation[];
  tags: string[];
  status: 'active' | 'draft' | 'archived';
  isFeatured: boolean;
  rating: number;
  reviewCount: number;
  soldCount: number;
  createdAt: string;
}

export interface Review {
  _id: string;
  product?: { _id: string; name: string; slug: string; images?: string[] } | string;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  verifiedPurchase?: boolean;
  createdAt: string;
}

export interface CartLine {
  product: Product;
  quantity: number;
  variation?: string;
}

export interface ShippingAddress {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  notes?: string;
}

export interface OrderLine {
  product: string;
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

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'ready_for_delivery'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned';

export interface Order {
  _id: string;
  orderNumber: string;
  customer?: { _id: string; name: string; phone: string; customerNumber?: string } | string;
  user?: { name: string; email: string } | string;
  items: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  deliveryFee: number;
  total: number;
  paymentMethod: string;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'refunded';
  status: OrderStatus;
  shippingAddress: ShippingAddress;
  guestEmail?: string;
  internalNotes?: { text: string; byName: string; at: string }[];
  statusHistory: { status: OrderStatus; at: string; byName?: string; note?: string }[];
  payments?: PaymentRecord[];
  createdAt: string;
  deliveredAt?: string;
  cancelReason?: string;
}

export interface PaymentRecord {
  _id: string;
  paymentNumber: string;
  method: string;
  amount: number;
  currency?: string;
  status: string;
  transactionRef?: string;
  notes?: string;
  paidAt?: string;
}

export interface CustomerAddress {
  _id?: string;
  label: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
}

export interface Customer {
  _id: string;
  customerNumber: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  addresses?: CustomerAddress[];
  totalOrders: number;
  totalSpending: number;
  loyaltyPoints: number;
  status: 'active' | 'inactive' | 'blocked';
  notes?: string;
  tags: string[];
  lastPurchaseAt?: string;
  createdAt: string;
  orders?: Order[];
  sales?: Sale[];
  loyalty?: LoyaltyTransaction[];
}

export interface Sale {
  _id: string;
  saleNumber: string;
  receiptNumber: string;
  cashierName: string;
  customer?: { _id: string; name: string; phone: string } | string;
  items: OrderLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  changeGiven: number;
  status: 'completed' | 'voided' | 'refunded' | 'partially_refunded';
  payments: { method: string; amount: number; reference?: string; status: string }[];
  createdAt: string;
}

export interface Supplier {
  _id: string;
  supplierNumber: string;
  name: string;
  company?: string;
  phone: string;
  email?: string;
  address?: string;
  productsSupplied: string[];
  notes?: string;
  totalPurchases: number;
  outstandingBalance: number;
  status: 'active' | 'inactive';
  purchases?: Purchase[];
}

export interface PurchaseItem {
  product: string;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface Purchase {
  _id: string;
  purchaseNumber: string;
  supplier: { _id: string; name: string; company?: string; phone?: string } | string;
  items: PurchaseItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balance: number;
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  stockReceived: boolean;
  expectedAt?: string;
  notes?: string;
  createdAt: string;
  receivedAt?: string;
}

export interface InventoryMovement {
  _id: string;
  product: { _id: string; name: string; sku: string; unit: string; images?: string[] } | string;
  type: string;
  quantity: number;
  balanceAfter: number;
  unitCost?: number;
  reason?: string;
  referenceNumber?: string;
  user?: { name: string } | string;
  createdAt: string;
}

export interface LedgerEntry {
  _id: string;
  date: string;
  account: string;
  debit: number;
  credit: number;
  description?: string;
  refType?: string;
  refNumber?: string;
  currency?: string;
}

export interface Expense {
  _id: string;
  expenseNumber: string;
  category: string;
  description: string;
  amount: number;
  date: string;
  paymentMethod: string;
  paidTo?: string;
  status: 'paid' | 'pending';
  createdByName?: string;
}

export interface ReturnRecord {
  _id: string;
  returnNumber: string;
  type: 'order' | 'sale';
  order?: { _id: string; orderNumber: string; total: number; status: string; items: OrderLine[] } | string;
  sale?: { _id: string; saleNumber: string; total: number; status: string; items: OrderLine[] } | string;
  customer?: { name: string; phone: string } | string;
  items: { product: string; name: string; quantity: number; unitPrice: number; lineTotal: number; restock: boolean; condition?: string }[];
  reason: string;
  status: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded';
  refundAmount: number;
  restocked: boolean;
  createdAt: string;
}

export interface LoyaltyTransaction {
  _id: string;
  points: number;
  type: 'earn' | 'redeem' | 'adjust';
  note?: string;
  balanceAfter: number;
  createdAt: string;
}

export interface NotificationItem {
  _id: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  priority: 'low' | 'normal' | 'high';
  readBy: string[];
  read?: boolean;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  actorName: string;
  actorEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

export interface ContentPage {
  _id: string;
  slug: string;
  title: string;
  subtitle?: string;
  body: string;
  sections: { heading: string; body: string }[];
  isPublished: boolean;
  updatedAt: string;
}

export interface HomeData {
  settings: ShopSettings;
  sections: Record<string, boolean>;
  categories: Category[];
  newArrivals: Product[];
  bestSellers: Product[];
  offers: Product[];
  recommended: Product[];
  reviews: Review[];
  promoBanners: HomepageSettings['promoBanners'];
  stats: { products: number; units: number; categories: number; reviews: number };
}

export interface FinanceSummary {
  from: string;
  to: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  cashOnHand: number;
  receivables: number;
  payables: { total: number; suppliers: { _id: string; name: string; company?: string; outstandingBalance: number }[] } | number;
  customerDeposits: number;
  mobileMoneyPending: number;
  taxPayable: number;
  totalSales: number;
  posSalesCount: number;
  ordersDelivered: number;
  newCustomers: number;
  averageOrderValue: number;
  expenseBreakdown: { category: string; amount: number }[];
  series: { date: string; revenue: number; cogs: number; expenses: number; profit: number }[];
  paymentMix?: { method: string; amount: number }[];
  currencySymbol?: string;
}
