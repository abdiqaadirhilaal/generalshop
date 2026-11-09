import type mongoose from 'mongoose';
import { LedgerEntry } from '../models/operations.js';
import { round2 } from '../utils/http.js';

export const ACCOUNTS = {
  CASH: 'cash',
  MOBILE_PENDING: 'mobile_money_pending',
  RECEIVABLE: 'accounts_receivable',
  PAYABLE: 'accounts_payable',
  CUSTOMER_DEPOSITS: 'customer_deposits',
  SALES_REVENUE: 'sales_revenue',
  OTHER_INCOME: 'other_income',
  SALES_RETURNS: 'sales_returns',
  COGS: 'cost_of_goods_sold',
  INVENTORY: 'inventory',
  TAX_PAYABLE: 'tax_payable',
  OWNER_EQUITY: 'owner_equity',
  EXPENSE: 'expense',
} as const;

export interface LedgerLine {
  account: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface LedgerContext {
  date?: Date;
  refType?: string;
  refId?: mongoose.Types.ObjectId | string;
  refNumber?: string;
  currency?: string;
  createdBy?: mongoose.Types.ObjectId | string;
  meta?: Record<string, unknown>;
}

/**
 * Posts a balanced set of double-entry lines. Every call is validated so a
 * business event can never create an unbalanced ledger.
 */
export async function postLedger(
  lines: LedgerLine[],
  context: LedgerContext = {},
  session?: mongoose.ClientSession | null
): Promise<void> {
  const cleaned = lines
    .map((line) => ({
      account: line.account,
      debit: round2(line.debit ?? 0),
      credit: round2(line.credit ?? 0),
      description: line.description ?? '',
    }))
    .filter((line) => line.debit > 0 || line.credit > 0);

  if (!cleaned.length) return;

  const totalDebit = round2(cleaned.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = round2(cleaned.reduce((sum, line) => sum + line.credit, 0));

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Unbalanced ledger entry: debits ${totalDebit} vs credits ${totalCredit} (${context.refNumber ?? 'no ref'})`
    );
  }

  await LedgerEntry.insertMany(
    cleaned.map((line) => ({
      date: context.date ?? new Date(),
      account: line.account,
      debit: line.debit,
      credit: line.credit,
      description: line.description || context.refNumber || 'Ledger entry',
      refType: context.refType,
      refId: context.refId,
      refNumber: context.refNumber,
      currency: context.currency ?? 'USD',
      createdBy: context.createdBy,
      meta: context.meta,
    })),
    { session: session ?? undefined }
  );
}

export interface AccountBalance {
  account: string;
  debit: number;
  credit: number;
  balance: number;
}

export async function accountBalances(
  match: Record<string, unknown> = {}
): Promise<Map<string, AccountBalance>> {
  const rows = await LedgerEntry.aggregate<{ _id: string; debit: number; credit: number }>([
    { $match: match },
    {
      $group: {
        _id: '$account',
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]);

  const map = new Map<string, AccountBalance>();
  for (const row of rows) {
    map.set(row._id, {
      account: row._id,
      debit: round2(row.debit),
      credit: round2(row.credit),
      balance: round2(row.debit - row.credit),
    });
  }
  return map;
}

export function debitOf(balances: Map<string, AccountBalance>, account: string): number {
  return balances.get(account)?.debit ?? 0;
}

export function creditOf(balances: Map<string, AccountBalance>, account: string): number {
  return balances.get(account)?.credit ?? 0;
}

export function netDebit(balances: Map<string, AccountBalance>, account: string): number {
  return balances.get(account)?.balance ?? 0;
}
