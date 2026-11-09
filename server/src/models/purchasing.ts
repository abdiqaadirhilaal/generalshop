import mongoose, { Schema, model } from 'mongoose';

export interface IPurchaseItem {
  product: mongoose.Types.ObjectId;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface IPurchase {
  purchaseNumber: string;
  supplier: mongoose.Types.ObjectId;
  branch?: mongoose.Types.ObjectId;
  items: IPurchaseItem[];
  subtotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  balance: number;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  status: 'draft' | 'ordered' | 'received' | 'cancelled';
  stockReceived: boolean;
  expectedAt?: Date;
  receivedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  receivedBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseItemSchema = new Schema<IPurchaseItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    unitCost: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const purchaseSchema = new Schema<IPurchase>(
  {
    purchaseNumber: { type: String, required: true, unique: true, index: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
    branch: { type: Schema.Types.ObjectId, ref: 'Branch' },
    items: { type: [purchaseItemSchema], validate: (v: IPurchaseItem[]) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'ordered', 'received', 'cancelled'],
      default: 'draft',
      index: true,
    },
    stockReceived: { type: Boolean, default: false },
    expectedAt: Date,
    receivedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: String,
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: String,
  },
  { timestamps: true }
);

purchaseSchema.index({ createdAt: -1 });

export const Purchase = model<IPurchase>('Purchase', purchaseSchema);
