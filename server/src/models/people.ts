import mongoose, { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import bcrypt from 'bcryptjs';

/* ────────────────────────────── Permission ────────────────────────────── */

export interface IPermission {
  key: string;
  label: string;
  group: string;
  description?: string;
}

const permissionSchema = new Schema<IPermission>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true },
    group: { type: String, required: true },
    description: String,
  },
  { timestamps: true }
);

export const Permission = model<IPermission>('Permission', permissionSchema);

/* ──────────────────────────────── Role ────────────────────────────────── */

export interface IRole {
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  isActive: boolean;
}

const roleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Role = model<IRole>('Role', roleSchema);

/* ──────────────────────────────── User ────────────────────────────────── */

export type UserKind = 'staff' | 'customer';
export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface IUser {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  kind: UserKind;
  role?: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  customer?: mongoose.Types.ObjectId;
  status: UserStatus;
  avatarUrl?: string;
  wishlist: mongoose.Types.ObjectId[];
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

type UserModel = Model<IUser, Record<string, never>, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    kind: { type: String, enum: ['staff', 'customer'], default: 'customer', index: true },
    role: { type: Schema.Types.ObjectId, ref: 'Role' },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    avatarUrl: String,
    wishlist: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash')) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.method('comparePassword', function comparePassword(candidate: string) {
  return bcrypt.compare(candidate, this.passwordHash);
});

export type UserDocument = HydratedDocument<IUser, IUserMethods>;
export const User = model<IUser, UserModel>('User', userSchema);

/* ────────────────────────────── Customer ──────────────────────────────── */

export type CustomerStatus = 'active' | 'inactive' | 'blocked';

export interface ICustomerAddress {
  label: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
}

export interface ICustomer {
  customerNumber: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  addresses: ICustomerAddress[];
  user?: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  totalOrders: number;
  totalSpending: number;
  loyaltyPoints: number;
  status: CustomerStatus;
  notes?: string;
  tags: string[];
  lastPurchaseAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    customerNumber: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, index: true },
    email: { type: String, lowercase: true, trim: true },
    address: String,
    city: String,
    addresses: {
      type: [
        {
          label: { type: String, default: 'Home' },
          fullName: { type: String, required: true },
          phone: { type: String, required: true },
          address: { type: String, required: true },
          city: { type: String, required: true },
          isDefault: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    totalOrders: { type: Number, default: 0, min: 0 },
    totalSpending: { type: Number, default: 0, min: 0 },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' },
    notes: String,
    tags: { type: [String], default: [] },
    lastPurchaseAt: Date,
  },
  { timestamps: true }
);

customerSchema.index({ phone: 1, branch: 1 });

export const Customer = model<ICustomer>('Customer', customerSchema);

/* ────────────────────────────── Supplier ──────────────────────────────── */

export interface ISupplier {
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
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    supplierNumber: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    address: String,
    productsSupplied: { type: [String], default: [] },
    notes: String,
    totalPurchases: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

export const Supplier = model<ISupplier>('Supplier', supplierSchema);

/* ─────────────────────────────── Branch ───────────────────────────────── */

export interface IBranch {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const branchSchema = new Schema<IBranch>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Branch = model<IBranch>('Branch', branchSchema);
