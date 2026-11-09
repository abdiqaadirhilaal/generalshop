import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Expense, EXPENSE_CATEGORIES, LedgerEntry } from '../models/operations.js';
import { Order, Payment } from '../models/sales.js';
import { Purchase } from '../models/purchasing.js';
import { Supplier } from '../models/people.js';
import { ApiError, asyncHandler, buildMeta, parsePagination, sendSuccess } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../middleware/auth.js';
import { PERMISSIONS } from '../config/permissions.js';
import { generateNumber } from '../utils/sequence.js';
import { audit } from '../utils/audit.js';
import { getSettings } from '../services/settings.js';
import { financeSummary, payablesSummary, resolveRange } from '../services/finance.js';
import { ACCOUNTS, postLedger } from '../services/ledger.js';
import { csvResponseHeaders, toCsv } from '../utils/csv.js';

const router = Router();

router.get(
  '/summary',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const { from, to } = resolveRange(
      String(req.query.range ?? 'month'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    const summary = await financeSummary({ from, to }, settings.currency);
    const payables = await payablesSummary();
    sendSuccess(res, { ...summary, currencySymbol: settings.currencySymbol, payables });
  })
);

router.get(
  '/ledger',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 50 });
    const filter: Record<string, unknown> = {};
    if (query.account) filter.account = query.account;
    if (query.refType) filter.refType = query.refType;
    if (query.q?.trim()) {
      filter.$or = [
        { description: { $regex: query.q.trim(), $options: 'i' } },
        { refNumber: { $regex: query.q.trim(), $options: 'i' } },
      ];
    }
    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [entries, total] = await Promise.all([
      LedgerEntry.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      LedgerEntry.countDocuments(filter),
    ]);
    sendSuccess(res, entries, 200, buildMeta(total, page, limit));
  })
);

router.get(
  '/ledger/export',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const filter: Record<string, unknown> = {};
    if (req.query.from || req.query.to) {
      filter.date = {
        ...(req.query.from ? { $gte: new Date(String(req.query.from)) } : {}),
        ...(req.query.to ? { $lte: new Date(`${String(req.query.to)}T23:59:59.999Z`) } : {}),
      };
    }
    const entries = await LedgerEntry.find(filter).sort({ date: -1 }).limit(10000).lean();
    const csv = toCsv(
      ['date', 'account', 'debit', 'credit', 'description', 'reference', 'refType', 'currency'],
      entries.map((entry) => [
        new Date(entry.date).toISOString(),
        entry.account,
        entry.debit,
        entry.credit,
        entry.description,
        entry.refNumber,
        entry.refType,
        entry.currency,
      ])
    );
    res.set(csvResponseHeaders(`hilaal-ledger-${new Date().toISOString().slice(0, 10)}.csv`));
    res.send(csv);
  })
);

router.get(
  '/expenses',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const query = req.query as Record<string, string>;
    const { page, limit, skip } = parsePagination(query, { page: 1, limit: 25 });
    const filter: Record<string, unknown> = {};
    if (query.category) filter.category = query.category;
    if (query.status) filter.status = query.status;
    if (query.q?.trim()) filter.description = { $regex: query.q.trim(), $options: 'i' };
    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: new Date(query.from) } : {}),
        ...(query.to ? { $lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }

    const [expenses, total, sums] = await Promise.all([
      Expense.find(filter).sort({ date: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(filter),
      Expense.aggregate<{ _id: string; amount: number }>([
        { $match: filter },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
      ]),
    ]);
    sendSuccess(res, expenses, 200, {
      ...buildMeta(total, page, limit),
      byCategory: Object.fromEntries(sums.map((row) => [row._id, row.amount])),
    });
  })
);

const expenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().min(2).max(300),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  date: z.string().optional(),
  paymentMethod: z.string().default('cash'),
  paidTo: z.string().trim().max(160).optional(),
  receiptUrl: z.string().max(500).optional(),
  status: z.enum(['paid', 'pending']).default('paid'),
});

router.post(
  '/expenses',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  validate({ body: expenseSchema }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const expenseNumber = await generateNumber('expense', 'EXP');
    const expense = await Expense.create({
      ...req.body,
      expenseNumber,
      date: req.body.date ? new Date(req.body.date) : new Date(),
      createdBy: req.auth!.user._id,
      createdByName: req.auth!.user.name,
    });

    if (expense.status === 'paid') {
      await postLedger(
        [
          {
            account: `${ACCOUNTS.EXPENSE}:${expense.category}`,
            debit: expense.amount,
            description: expense.description,
          },
          { account: ACCOUNTS.CASH, credit: expense.amount },
        ],
        {
          date: expense.date,
          refType: 'expense',
          refId: expense._id,
          refNumber: expense.expenseNumber,
          currency: settings.currency,
          createdBy: req.auth!.user._id,
        }
      );
    }

    await audit(req, 'expense.create', 'Expense', expense._id, undefined, expense.toObject());
    sendSuccess(res, expense, 201);
  })
);

router.patch(
  '/expenses/:id',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  validate({
    body: z.object({
      description: z.string().trim().min(2).max(300).optional(),
      paidTo: z.string().trim().max(160).optional(),
      receiptUrl: z.string().max(500).optional(),
      date: z.string().optional(),
      status: z.enum(['paid', 'pending']).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw ApiError.notFound('Expense not found');
    const settings = await getSettings();
    const wasPaid = expense.status === 'paid';

    if (req.body.description) expense.description = req.body.description;
    if (req.body.paidTo) expense.paidTo = req.body.paidTo;
    if (req.body.receiptUrl) expense.receiptUrl = req.body.receiptUrl;
    if (req.body.date) expense.date = new Date(req.body.date);
    if (req.body.status) expense.status = req.body.status;
    await expense.save();

    if (!wasPaid && expense.status === 'paid') {
      await postLedger(
        [
          { account: `${ACCOUNTS.EXPENSE}:${expense.category}`, debit: expense.amount, description: expense.description },
          { account: ACCOUNTS.CASH, credit: expense.amount },
        ],
        {
          date: expense.date,
          refType: 'expense',
          refId: expense._id,
          refNumber: expense.expenseNumber,
          currency: settings.currency,
          createdBy: req.auth!.user._id,
        }
      );
    }

    await audit(req, 'expense.update', 'Expense', expense._id);
    sendSuccess(res, expense);
  })
);

router.delete(
  '/expenses/:id',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  asyncHandler(async (req, res) => {
    const expense = await Expense.findById(req.params.id);
    if (!expense) throw ApiError.notFound('Expense not found');
    const settings = await getSettings();

    if (expense.status === 'paid') {
      await postLedger(
        [
          { account: ACCOUNTS.CASH, debit: expense.amount, description: `Reversal ${expense.expenseNumber}` },
          { account: `${ACCOUNTS.EXPENSE}:${expense.category}`, credit: expense.amount },
        ],
        {
          refType: 'expense_reversal',
          refId: expense._id,
          refNumber: expense.expenseNumber,
          currency: settings.currency,
          createdBy: req.auth!.user._id,
        }
      );
    }

    await Expense.deleteOne({ _id: expense._id });
    await audit(req, 'expense.delete', 'Expense', expense._id, expense.toObject());
    sendSuccess(res, { deleted: true });
  })
);

router.post(
  '/other-income',
  requirePermission(PERMISSIONS.FINANCE_WRITE),
  validate({
    body: z.object({
      description: z.string().trim().min(2).max(300),
      amount: z.coerce.number().positive(),
      method: z.string().default('cash'),
      date: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const reference = await generateNumber('income', 'INC');
    await postLedger(
      [
        { account: ACCOUNTS.CASH, debit: req.body.amount, description: req.body.description },
        { account: ACCOUNTS.OTHER_INCOME, credit: req.body.amount, description: req.body.description },
      ],
      {
        date: req.body.date ? new Date(req.body.date) : new Date(),
        refType: 'other_income',
        refNumber: reference,
        currency: settings.currency,
        createdBy: req.auth!.user._id,
      }
    );
    await audit(req, 'finance.other_income', 'LedgerEntry', undefined, undefined, {
      amount: req.body.amount,
      reference,
    });
    sendSuccess(res, { reference }, 201);
  })
);

router.get(
  '/receivables',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const orders = await Order.find({
      paymentStatus: { $in: ['unpaid', 'partial'] },
      status: { $nin: ['cancelled', 'returned'] },
    })
      .populate('customer', 'name phone')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const ids = orders.map((order) => order._id);
    const payments = await Payment.aggregate<{ _id: mongoose.Types.ObjectId; total: number }>([
      { $match: { kind: 'order', reference: { $in: ids }, status: 'confirmed', direction: 'in' } },
      { $group: { _id: '$reference', total: { $sum: '$amount' } } },
    ]);
    const paidMap = new Map(payments.map((row) => [String(row._id), row.total]));

    const rows = orders.map((order) => {
      const paid = paidMap.get(String(order._id)) ?? 0;
      return {
        id: order._id,
        orderNumber: order.orderNumber,
        customer: order.shippingAddress.fullName,
        phone: order.shippingAddress.phone,
        status: order.status,
        total: order.total,
        paid,
        outstanding: Math.round((order.total - paid) * 100) / 100,
        createdAt: order.createdAt,
      };
    });

    sendSuccess(res, {
      rows,
      total: Math.round(rows.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100,
    });
  })
);

router.get(
  '/payables',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (_req, res) => {
    const summary = await payablesSummary();
    const purchases = await Purchase.find({ balance: { $gt: 0 }, status: { $ne: 'cancelled' } })
      .populate('supplier', 'name company phone')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    sendSuccess(res, { ...summary, purchases });
  })
);

router.get(
  '/payment-methods',
  requirePermission(PERMISSIONS.FINANCE_VIEW),
  asyncHandler(async (req, res) => {
    const { from, to } = resolveRange(
      String(req.query.range ?? 'month'),
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    const rows = await Payment.aggregate([
      { $match: { paidAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { method: '$method', status: '$status', direction: '$direction' },
          amount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]);
    sendSuccess(res, rows);
  })
);

export default router;
