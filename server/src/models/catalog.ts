import mongoose, { Schema, model } from 'mongoose';

/* ─────────────────────────────── Category ─────────────────────────────── */

export interface ICategory {
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: mongoose.Types.ObjectId;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    image: String,
    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

categorySchema.index({ parent: 1, sortOrder: 1 });

export const Category = model<ICategory>('Category', categorySchema);

/* ───────────────────────────────── Brand ──────────────────────────────── */

export interface IBrand {
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    logo: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Brand = model<IBrand>('Brand', brandSchema);

/* ──────────────────────────────── Product ─────────────────────────────── */

export type ProductUnit = 'piece' | 'box' | 'kg' | 'liter' | 'pack' | 'dozen' | 'meter' | 'other';
export type ProductStatus = 'active' | 'draft' | 'archived';

export interface IProductSpec {
  key: string;
  value: string;
}

export interface IProductVariation {
  label: string;
  sku?: string;
  priceDelta: number;
  isDefault: boolean;
}

export interface IProduct {
  name: string;
  slug: string;
  sku: string;
  barcode?: string;
  category: mongoose.Types.ObjectId;
  brand?: mongoose.Types.ObjectId;
  description?: string;
  shortDescription?: string;
  unit: ProductUnit;
  costPrice: number;
  price: number;
  compareAtPrice?: number;
  stock: number;
  minStockLevel: number;
  images: string[];
  specs: IProductSpec[];
  variationLabel?: string;
  variations: IProductVariation[];
  tags: string[];
  status: ProductStatus;
  isFeatured: boolean;
  rating: number;
  reviewCount: number;
  soldCount: number;
  branch?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200, index: 'text' },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcode: { type: String, trim: true, index: true, sparse: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    brand: { type: Schema.Types.ObjectId, ref: 'Brand', index: true },
    description: String,
    shortDescription: { type: String, maxlength: 300 },
    unit: {
      type: String,
      enum: ['piece', 'box', 'kg', 'liter', 'pack', 'dozen', 'meter', 'other'],
      default: 'piece',
    },
    costPrice: { type: Number, required: true, min: 0, default: 0 },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    minStockLevel: { type: Number, default: 5, min: 0 },
    images: { type: [String], default: [] },
    specs: {
      type: [{ key: { type: String, required: true }, value: { type: String, required: true } }],
      default: [],
    },
    variationLabel: String,
    variations: {
      type: [
        {
          label: { type: String, required: true },
          sku: String,
          priceDelta: { type: Number, default: 0 },
          isDefault: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    tags: { type: [String], default: [], index: true },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'active', index: true },
    isFeatured: { type: Boolean, default: false, index: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

productSchema.virtual('discountPercent').get(function () {
  if (!this.compareAtPrice || this.compareAtPrice <= this.price) return 0;
  return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

export const Product = model<IProduct>('Product', productSchema);

/* ───────────────────────────────── Review ─────────────────────────────── */

export interface IReview {
  product: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  user?: mongoose.Types.ObjectId;
  authorName: string;
  rating: number;
  title?: string;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  verifiedPurchase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, required: true, trim: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 140 },
    comment: { type: String, required: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    verifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index(
  { product: 1, user: 1 },
  { unique: true, partialFilterExpression: { user: { $exists: true } } }
);

export const Review = model<IReview>('Review', reviewSchema);
