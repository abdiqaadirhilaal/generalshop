import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BookOpen,
  CircleDollarSign,
  Download,
  Landmark,
  Plus,
  ReceiptText,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useAuth, useSettings, useToast } from '@/context/AppProviders';
import { useMoney } from '@/lib/hooks';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  TableSkeleton,
  Tabs,
  Textarea,
} from '@/components/ui';
import { formatDate, formatNumber, statusTone, titleCase } from '@/lib/format';
import type { Expense, FinanceSummary, LedgerEntry } from '@/types';

const EXPENSE_CATEGORIES = [
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

const ACCOUNT_OPTIONS = [
  { value: '', label: 'All accounts' },
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money_pending', label: 'Mobile money pending' },
  { value: 'accounts_receivable', label: 'Accounts receivable' },
  { value: 'accounts_payable', label: 'Accounts payable' },
  { value: 'customer_deposits', label: 'Customer deposits' },
  { value: 'sales_revenue', label: 'Sales revenue' },
  { value: 'other_income', label: 'Other income' },
  { value: 'sales_returns', label: 'Sales returns' },
  { value: 'cost_of_goods_sold', label: 'Cost of goods sold' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'tax_payable', label: 'Tax payable' },
  { value: 'owner_equity', label: 'Owner equity' },
];

const REF_TYPES = ['', 'sale', 'order', 'purchase', 'expense', 'expense_reversal', 'other_income', 'return', 'refund', 'payment'];

type SummaryResponse = FinanceSummary & {
  payables: { total: number; suppliers: { _id: string; name: string; company?: string; outstandingBalance: number }[] };
};

interface ReceivableRow {
  id: string;
  orderNumber: string;
  customer: string;
  phone: string;
  status: string;
  total: number;
  paid: number;
  outstanding: number;
  createdAt: string;
}

interface PayablesResponse {
  total: number;
  suppliers: { _id: string; name: string; company?: string; outstandingBalance: number }[];
  purchases: {
    _id: string;
    purchaseNumber: string;
    total: number;
    amountPaid: number;
    balance: number;
    createdAt: string;
    supplier?: { name?: string; company?: string } | string;
  }[];
}

interface PaymentMixRow {
  _id: { method: string; status: string; direction: string };
  amount: number;
  count: number;
}

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'ledger', label: 'Ledger' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'receivables', label: 'Receivables' },
  { value: 'payables', label: 'Payables' },
];

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
];

const emptyExpense = {
  category: 'other' as (typeof EXPENSE_CATEGORIES)[number],
  description: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  paymentMethod: 'cash',
  paidTo: '',
  status: 'paid' as 'paid' | 'pending',
};

export default function Finance() {
  const { has } = useAuth();
  const { settings } = useSettings();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('finance:write');

  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeParams = { range, from: from || undefined, to: to || undefined };

  // Ledger filters
  const [ledgerAccount, setLedgerAccount] = useState('');
  const [ledgerRefType, setLedgerRefType] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerFrom, setLedgerFrom] = useState('');
  const [ledgerTo, setLedgerTo] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);

  // Expense filters
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseStatus, setExpenseStatus] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expensePage, setExpensePage] = useState(1);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(emptyExpense);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseError, setExpenseError] = useState('');
  const [deletingExpense, setDeletingExpense] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Other income
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [incomeForm, setIncomeForm] = useState({ description: '', amount: '', method: 'cash', date: '' });
  const [incomeSaving, setIncomeSaving] = useState(false);

  const summaryQuery = useQuery({
    queryKey: ['finance-summary', rangeParams],
    queryFn: () => api.get<SummaryResponse>(`/finance/summary${queryString(rangeParams)}`),
    enabled: tab === 'overview' || tab === 'receivables' || tab === 'payables',
  });

  const paymentMixQuery = useQuery({
    queryKey: ['finance-payment-mix', rangeParams],
    queryFn: () => api.get<PaymentMixRow[]>(`/finance/payment-methods${queryString(rangeParams)}`),
    enabled: tab === 'overview',
  });

  const ledgerQuery = useQuery({
    queryKey: ['finance-ledger', { ledgerAccount, ledgerRefType, ledgerSearch, ledgerFrom, ledgerTo, ledgerPage }],
    queryFn: () =>
      api.page<LedgerEntry>(
        `/finance/ledger${queryString({
          account: ledgerAccount || undefined,
          refType: ledgerRefType || undefined,
          q: ledgerSearch || undefined,
          from: ledgerFrom || undefined,
          to: ledgerTo || undefined,
          page: ledgerPage,
          limit: 50,
        })}`
      ),
    enabled: tab === 'ledger',
  });

  const expensesQuery = useQuery({
    queryKey: ['finance-expenses', { expenseCategory, expenseStatus, expenseSearch, expensePage }],
    queryFn: () =>
      api.page<Expense>(
        `/finance/expenses${queryString({
          category: expenseCategory || undefined,
          status: expenseStatus || undefined,
          q: expenseSearch || undefined,
          page: expensePage,
          limit: 25,
        })}`
      ),
    enabled: tab === 'expenses',
  });

  const receivablesQuery = useQuery({
    queryKey: ['finance-receivables'],
    queryFn: () => api.get<{ rows: ReceivableRow[]; total: number }>('/finance/receivables'),
    enabled: tab === 'receivables',
  });

  const payablesQuery = useQuery({
    queryKey: ['finance-payables'],
    queryFn: () => api.get<PayablesResponse>('/finance/payables'),
    enabled: tab === 'payables',
  });

  const summary = summaryQuery.data;
  const payables = summary?.payables;
  const paymentMix = paymentMixQuery.data ?? [];
  const ledger = ledgerQuery.data;
  const expenses = expensesQuery.data;
  const receivables = receivablesQuery.data;
  const payablesData = payablesQuery.data;

  const maxExpense = useMemo(
    () => Math.max(1, ...(summary?.expenseBreakdown ?? []).map((row) => row.amount)),
    [summary]
  );

  const expenseTotal = useMemo(
    () => (summary?.expenseBreakdown ?? []).reduce((sum, row) => sum + row.amount, 0),
    [summary]
  );

  const paymentMethods = useMemo(() => {
    const configured = settings?.paymentMethods?.filter((method) => method.enabled) ?? [];
    if (configured.length > 0) return configured;
    return [
      { key: 'cash', label: 'Cash' },
      { key: 'evc_plus', label: 'EVC Plus' },
      { key: 'zaad', label: 'ZAAD' },
      { key: 'sahal', label: 'Sahal' },
      { key: 'edahab', label: 'eDahab' },
      { key: 'bank_transfer', label: 'Bank transfer' },
    ];
  }, [settings]);

  const refreshFinance = () => {
    void queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
    void queryClient.invalidateQueries({ queryKey: ['finance-payment-mix'] });
    void queryClient.invalidateQueries({ queryKey: ['finance-expenses'] });
    void queryClient.invalidateQueries({ queryKey: ['finance-ledger'] });
    void queryClient.invalidateQueries({ queryKey: ['finance-receivables'] });
    void queryClient.invalidateQueries({ queryKey: ['finance-payables'] });
  };

  const submitExpense = async () => {
    setExpenseError('');
    if (expenseForm.description.trim().length < 2) return setExpenseError('Describe the expense.');
    if (!(Number(expenseForm.amount) > 0)) return setExpenseError('Enter an amount greater than zero.');

    setExpenseSaving(true);
    try {
      await api.post('/finance/expenses', {
        category: expenseForm.category,
        description: expenseForm.description.trim(),
        amount: Number(expenseForm.amount),
        date: expenseForm.date || undefined,
        paymentMethod: expenseForm.paymentMethod,
        paidTo: expenseForm.paidTo.trim() || undefined,
        status: expenseForm.status,
      });
      success('Expense recorded.');
      setExpenseOpen(false);
      setExpenseForm(emptyExpense);
      refreshFinance();
    } catch (submitError) {
      setExpenseError(apiErrorMessage(submitError));
    } finally {
      setExpenseSaving(false);
    }
  };

  const markExpensePaid = async (expense: Expense) => {
    try {
      await api.patch(`/finance/expenses/${expense._id}`, { status: 'paid' });
      success('Expense marked as paid and posted to the ledger.');
      refreshFinance();
    } catch (markError) {
      error(markError);
    }
  };

  const removeExpense = async () => {
    if (!deletingExpense) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/finance/expenses/${deletingExpense._id}`);
      success('Expense deleted and ledger reversed.');
      setDeletingExpense(null);
      refreshFinance();
    } catch (removeError) {
      error(removeError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const submitIncome = async () => {
    if (incomeForm.description.trim().length < 2) return error('Describe the income.');
    if (!(Number(incomeForm.amount) > 0)) return error('Enter an amount greater than zero.');
    setIncomeSaving(true);
    try {
      await api.post('/finance/other-income', {
        description: incomeForm.description.trim(),
        amount: Number(incomeForm.amount),
        method: incomeForm.method,
        date: incomeForm.date || undefined,
      });
      success('Other income recorded.');
      setIncomeOpen(false);
      setIncomeForm({ description: '', amount: '', method: 'cash', date: '' });
      refreshFinance();
    } catch (incomeError) {
      error(incomeError);
    } finally {
      setIncomeSaving(false);
    }
  };

  const ledgerTotals = useMemo(() => {
    const rows = ledger?.items ?? [];
    return {
      debit: rows.reduce((sum, row) => sum + row.debit, 0),
      credit: rows.reduce((sum, row) => sum + row.credit, 0),
    };
  }, [ledger]);

  const payablesTotal = payablesData?.total ?? (typeof summary?.payables === 'number' ? summary.payables : payables?.total ?? 0);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Finance"
        title="Finance"
        description="Revenue, costs, profit, cash position, receivables, payables and the full double-entry ledger."
        action={
          <>
            {canWrite && (
              <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setIncomeOpen(true)}>
                Other income
              </Button>
            )}
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseOpen(true)}>
                Record expense
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
        {(tab === 'overview' || tab === 'receivables' || tab === 'payables') && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={range} onChange={(event) => setRange(event.target.value)} className="w-auto">
              {RANGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-auto" aria-label="From date" />
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-auto" aria-label="To date" />
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
              >
                Clear dates
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === 'overview' && (
        <>
          {summaryQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(summaryQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void summaryQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : summaryQuery.isLoading || !summary ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="Revenue"
                  value={money.format(summary.revenue)}
                  hint={`${formatNumber(summary.totalSales)} sales · ${summary.ordersDelivered} delivered orders`}
                  icon={<TrendingUp className="h-4 w-4" />}
                  tone="gold"
                />
                <StatCard
                  label="Cost of goods"
                  value={money.format(summary.cogs)}
                  hint="Recognised when revenue is recognised"
                  icon={<TrendingDown className="h-4 w-4" />}
                />
                <StatCard
                  label="Gross profit"
                  value={money.format(summary.grossProfit)}
                  hint={summary.revenue > 0 ? `${((summary.grossProfit / summary.revenue) * 100).toFixed(1)}% margin` : 'No revenue yet'}
                  icon={<CircleDollarSign className="h-4 w-4" />}
                  tone="emerald"
                />
                <StatCard
                  label="Net profit"
                  value={money.format(summary.netProfit)}
                  hint={`After ${money.format(summary.expenses)} expenses`}
                  icon={<Landmark className="h-4 w-4" />}
                  tone={summary.netProfit >= 0 ? 'emerald' : 'rose'}
                />
                <StatCard
                  label="Cash on hand"
                  value={money.format(summary.cashOnHand)}
                  hint="Ledger cash account balance"
                  icon={<Wallet className="h-4 w-4" />}
                />
                <StatCard
                  label="Receivables"
                  value={money.format(summary.receivables)}
                  hint="Unpaid customer balances"
                  icon={<ArrowDownRight className="h-4 w-4" />}
                  tone="rose"
                />
                <StatCard
                  label="Payables"
                  value={money.format(payablesTotal)}
                  hint="Owed to suppliers"
                  icon={<ArrowUpRight className="h-4 w-4" />}
                  tone="rose"
                />
                <StatCard
                  label="Mobile money pending"
                  value={money.format(summary.mobileMoneyPending)}
                  hint="Awaiting manual verification"
                  icon={<Banknote className="h-4 w-4" />}
                  tone="gold"
                />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-lg font-semibold">Profit &amp; loss</h3>
                      <p className="text-xs text-ink-400">{formatDate(summary.from)} — {formatDate(summary.to)}</p>
                    </div>
                    <Badge tone={summary.netProfit >= 0 ? 'emerald' : 'rose'}>
                      {summary.netProfit >= 0 ? 'Profitable' : 'Loss'}
                    </Badge>
                  </div>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between border-b border-line pb-2 dark:border-ink-800">
                      <dt className="text-ink-500 dark:text-ink-300">Revenue</dt>
                      <dd className="font-medium">{money.format(summary.revenue)}</dd>
                    </div>
                    <div className="flex justify-between border-b border-line pb-2 dark:border-ink-800">
                      <dt className="text-ink-500 dark:text-ink-300">Cost of goods sold</dt>
                      <dd className="font-medium">− {money.format(summary.cogs)}</dd>
                    </div>
                    <div className="flex justify-between border-b border-line pb-2 font-semibold dark:border-ink-800">
                      <dt>Gross profit</dt>
                      <dd>{money.format(summary.grossProfit)}</dd>
                    </div>
                    <div className="flex justify-between border-b border-line pb-2 dark:border-ink-800">
                      <dt className="text-ink-500 dark:text-ink-300">Operating expenses</dt>
                      <dd className="font-medium">− {money.format(summary.expenses)}</dd>
                    </div>
                    <div className="flex justify-between pt-1 text-base font-semibold">
                      <dt>Net profit</dt>
                      <dd className={summary.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {money.format(summary.netProfit)}
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card className="p-5">
                  <h3 className="mb-1 font-display text-lg font-semibold">Expense breakdown</h3>
                  <p className="mb-4 text-xs text-ink-400">{money.format(expenseTotal)} recorded in this period</p>
                  {(summary.expenseBreakdown ?? []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-400">No expenses in this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {summary.expenseBreakdown.map((row) => (
                        <div key={row.category}>
                          <div className="mb-1 flex justify-between text-xs">
                            <span className="capitalize text-ink-600 dark:text-ink-300">{row.category}</span>
                            <span className="font-medium">{money.format(row.amount)}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                            <div
                              className="h-full rounded-full bg-gold"
                              style={{ width: `${Math.max(4, (row.amount / maxExpense) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-5">
                  <h3 className="mb-1 font-display text-lg font-semibold">Payment mix</h3>
                  <p className="mb-4 text-xs text-ink-400">Confirmed payments received and sent</p>
                  {paymentMixQuery.isLoading ? (
                    <TableSkeleton rows={4} />
                  ) : paymentMix.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-400">No payments in this period.</p>
                  ) : (
                    <div className="space-y-2">
                      {paymentMix.map((row) => (
                        <div
                          key={`${row._id.method}-${row._id.status}-${row._id.direction}`}
                          className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm dark:bg-ink-900"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-medium capitalize">{row._id.method.replace(/_/g, ' ')}</span>
                            <Badge tone={row._id.direction === 'in' ? 'emerald' : 'rose'}>
                              {row._id.direction === 'in' ? 'in' : 'out'}
                            </Badge>
                            <Badge tone={statusTone(row._id.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                              {row._id.status}
                            </Badge>
                          </span>
                          <span className="text-right">
                            <span className="block font-semibold">{money.format(row.amount)}</span>
                            <span className="block text-[11px] text-ink-400">{row.count} payments</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card className="p-5">
                  <h3 className="mb-1 font-display text-lg font-semibold">Daily performance</h3>
                  <p className="mb-4 text-xs text-ink-400">Revenue, cost and profit by day</p>
                  {(summary.series ?? []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-400">No ledger activity in this period.</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wider text-ink-400 dark:bg-ink-900">
                          <tr>
                            <th className="py-2">Date</th>
                            <th className="py-2 text-right">Revenue</th>
                            <th className="py-2 text-right">COGS</th>
                            <th className="py-2 text-right">Expenses</th>
                            <th className="py-2 text-right">Profit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line dark:divide-ink-800">
                          {summary.series.map((row) => (
                            <tr key={row.date}>
                              <td className="py-1.5 text-ink-500 dark:text-ink-300">{formatDate(row.date)}</td>
                              <td className="py-1.5 text-right">{money.format(row.revenue)}</td>
                              <td className="py-1.5 text-right text-ink-400">{money.format(row.cogs)}</td>
                              <td className="py-1.5 text-right text-ink-400">{money.format(row.expenses)}</td>
                              <td className={`py-1.5 text-right font-medium ${row.profit >= 0 ? '' : 'text-rose-500'}`}>
                                {money.format(row.profit)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'ledger' && (
        <>
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={ledgerSearch}
                onChange={(value) => {
                  setLedgerSearch(value);
                  setLedgerPage(1);
                }}
                placeholder="Search description or reference"
                className="w-full sm:w-64"
              />
              <Select
                value={ledgerAccount}
                onChange={(event) => {
                  setLedgerAccount(event.target.value);
                  setLedgerPage(1);
                }}
                className="w-auto max-w-[200px]"
              >
                {ACCOUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Select
                value={ledgerRefType}
                onChange={(event) => {
                  setLedgerRefType(event.target.value);
                  setLedgerPage(1);
                }}
                className="w-auto"
              >
                {REF_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {value ? titleCase(value) : 'All sources'}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={ledgerFrom}
                onChange={(event) => {
                  setLedgerFrom(event.target.value);
                  setLedgerPage(1);
                }}
                className="w-auto"
                aria-label="Ledger from date"
              />
              <Input
                type="date"
                value={ledgerTo}
                onChange={(event) => {
                  setLedgerTo(event.target.value);
                  setLedgerPage(1);
                }}
                className="w-auto"
                aria-label="Ledger to date"
              />
              <Button
                variant="outline"
                size="sm"
                icon={<Download className="h-4 w-4" />}
                onClick={() =>
                  void downloadFile(
                    `/finance/ledger/export${queryString({ from: ledgerFrom || undefined, to: ledgerTo || undefined })}`,
                    'hilaal-ledger.csv'
                  ).catch(error)
                }
              >
                Export
              </Button>
            </div>
          </Card>

          {ledgerQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(ledgerQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void ledgerQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : ledgerQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={10} />
            </Card>
          ) : (ledger?.items ?? []).length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="No ledger entries"
                description="Transactions posted to the ledger will appear here. Try widening the date range."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 text-xs text-ink-400 dark:border-ink-800">
                <span>
                  Showing {formatNumber(ledger?.items.length ?? 0)} of {formatNumber(ledger?.meta.total ?? 0)} entries
                </span>
                <span className="flex gap-4">
                  <span>Debits {money.format(ledgerTotals.debit)}</span>
                  <span>Credits {money.format(ledgerTotals.credit)}</span>
                  <Badge tone={Math.abs(ledgerTotals.debit - ledgerTotals.credit) < 0.01 ? 'emerald' : 'amber'}>
                    {Math.abs(ledgerTotals.debit - ledgerTotals.credit) < 0.01 ? 'Balanced' : 'Page imbalance'}
                  </Badge>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Account</th>
                      <th className="px-4 py-2.5">Description</th>
                      <th className="px-4 py-2.5">Reference</th>
                      <th className="px-4 py-2.5 text-right">Debit</th>
                      <th className="px-4 py-2.5 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {ledger?.items.map((entry) => (
                      <tr key={entry._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500 dark:text-ink-300">
                          {formatDate(entry.date, true)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone="slate">{entry.account.replace(/_/g, ' ')}</Badge>
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-2.5 text-ink-600 dark:text-ink-300">
                          {entry.description ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-ink-400">
                          {entry.refNumber ?? entry.refType ?? '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {entry.debit > 0 ? money.format(entry.debit) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          {entry.credit > 0 ? money.format(entry.credit) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
                <Pagination
                  page={ledger?.meta.page ?? 1}
                  totalPages={ledger?.meta.totalPages ?? 1}
                  total={ledger?.meta.total}
                  onChange={setLedgerPage}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'expenses' && (
        <>
          <Card className="mb-4 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={expenseSearch}
                onChange={(value) => {
                  setExpenseSearch(value);
                  setExpensePage(1);
                }}
                placeholder="Search description"
                className="w-full sm:w-64"
              />
              <Select
                value={expenseCategory}
                onChange={(event) => {
                  setExpenseCategory(event.target.value);
                  setExpensePage(1);
                }}
                className="w-auto"
              >
                <option value="">All categories</option>
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {titleCase(category)}
                  </option>
                ))}
              </Select>
              <Select
                value={expenseStatus}
                onChange={(event) => {
                  setExpenseStatus(event.target.value);
                  setExpensePage(1);
                }}
                className="w-auto"
              >
                <option value="">Any status</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </Select>
              {canWrite && (
                <Button variant="secondary" size="sm" className="ml-auto" icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseOpen(true)}>
                  Record expense
                </Button>
              )}
            </div>
          </Card>

          {expensesQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(expensesQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void expensesQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : expensesQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={8} />
            </Card>
          ) : (expenses?.items ?? []).length === 0 ? (
            <Card>
              <EmptyState
                icon={<ReceiptText className="h-6 w-6" />}
                title="No expenses found"
                description="Record rent, salaries, utilities and other operating costs here."
                action={
                  canWrite ? (
                    <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setExpenseOpen(true)}>
                      Record expense
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Expense</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Paid to</th>
                      <th className="px-4 py-2.5">Method</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {expenses?.items.map((expense) => (
                      <tr key={expense._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900 dark:text-white">{expense.description}</p>
                          <p className="text-xs text-ink-400">{expense.expenseNumber}</p>
                        </td>
                        <td className="px-4 py-3 capitalize">{expense.category}</td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(expense.date)}</td>
                        <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{expense.paidTo ?? '—'}</td>
                        <td className="px-4 py-3 capitalize">{expense.paymentMethod.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-right font-medium">{money.format(expense.amount)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(expense.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                            {expense.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {canWrite && expense.status === 'pending' && (
                              <Button variant="ghost" size="sm" onClick={() => void markExpensePaid(expense)}>
                                Mark paid
                              </Button>
                            )}
                            {canWrite && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${expense.expenseNumber}`}
                                onClick={() => setDeletingExpense(expense)}
                              >
                                <Trash2 className="h-4 w-4 text-rose-500" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
                <Pagination
                  page={expenses?.meta.page ?? 1}
                  totalPages={expenses?.meta.totalPages ?? 1}
                  total={expenses?.meta.total}
                  onChange={setExpensePage}
                />
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'receivables' && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-ink-800">
            <div>
              <h3 className="font-display text-lg font-semibold">Customer receivables</h3>
              <p className="text-xs text-ink-400">Orders that are unpaid or partially paid</p>
            </div>
            <p className="font-display text-xl font-semibold">{money.format(receivables?.total ?? summary?.receivables ?? 0)}</p>
          </div>
          {receivablesQuery.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} />
            </div>
          ) : (receivables?.rows ?? []).length === 0 ? (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="No outstanding receivables" description="Every delivered or active order is fully paid." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-4 py-2.5">Order</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {receivables?.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                      <td className="px-4 py-3 font-medium">{row.orderNumber}</td>
                      <td className="px-4 py-3">
                        <p>{row.customer}</p>
                        <p className="text-xs text-ink-400">{row.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone(row.status) as 'emerald' | 'amber' | 'blue' | 'rose' | 'slate'}>
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{money.format(row.total)}</td>
                      <td className="px-4 py-3 text-right text-ink-500 dark:text-ink-300">{money.format(row.paid)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                        {money.format(row.outstanding)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'payables' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Total payables"
              value={money.format(payablesTotal)}
              hint="Outstanding supplier balances"
              icon={<ArrowUpRight className="h-4 w-4" />}
              tone="rose"
            />
            <StatCard
              label="Suppliers owed"
              value={formatNumber(payablesData?.suppliers.length ?? payables?.suppliers.length ?? 0)}
              hint="Suppliers with a positive balance"
              icon={<Landmark className="h-4 w-4" />}
            />
            <StatCard
              label="Open purchases"
              value={formatNumber(payablesData?.purchases.length ?? 0)}
              hint="Purchase orders with a balance"
              icon={<ReceiptText className="h-4 w-4" />}
              tone="gold"
            />
          </div>

          {payablesQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Supplier balances</h3>
                </div>
                {(payablesData?.suppliers ?? payables?.suppliers ?? []).length === 0 ? (
                  <EmptyState icon={<Landmark className="h-6 w-6" />} title="No supplier balances" description="All supplier invoices are settled." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2.5">Supplier</th>
                          <th className="px-4 py-2.5">Company</th>
                          <th className="px-4 py-2.5 text-right">Outstanding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {(payablesData?.suppliers ?? payables?.suppliers ?? []).map((supplier) => (
                          <tr key={supplier._id}>
                            <td className="px-4 py-3 font-medium">{supplier.name}</td>
                            <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{supplier.company ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                              {money.format(supplier.outstandingBalance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Open purchase invoices</h3>
                </div>
                {(payablesData?.purchases ?? []).length === 0 ? (
                  <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No open purchases" description="Every purchase invoice is fully paid." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2.5">Purchase</th>
                          <th className="px-4 py-2.5">Supplier</th>
                          <th className="px-4 py-2.5">Date</th>
                          <th className="px-4 py-2.5 text-right">Total</th>
                          <th className="px-4 py-2.5 text-right">Paid</th>
                          <th className="px-4 py-2.5 text-right">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {payablesData?.purchases.map((purchase) => {
                          const supplier =
                            typeof purchase.supplier === 'object' ? purchase.supplier?.name ?? '—' : '—';
                          return (
                            <tr key={purchase._id}>
                              <td className="px-4 py-3 font-medium">{purchase.purchaseNumber}</td>
                              <td className="px-4 py-3">{supplier}</td>
                              <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                                {formatDate(purchase.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-right">{money.format(purchase.total)}</td>
                              <td className="px-4 py-3 text-right text-ink-500 dark:text-ink-300">
                                {money.format(purchase.amountPaid)}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-rose-600 dark:text-rose-400">
                                {money.format(purchase.balance)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* Expense modal */}
      <Modal
        open={expenseOpen}
        onClose={() => {
          if (!expenseSaving) setExpenseOpen(false);
        }}
        title="Record expense"
        description="Paid expenses are posted to the ledger immediately."
        footer={
          <>
            <Button variant="outline" onClick={() => setExpenseOpen(false)} disabled={expenseSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitExpense()} loading={expenseSaving}>
              Record expense
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {expenseError && <Alert tone="danger">{expenseError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              <Select
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm((current) => ({ ...current, category: event.target.value as typeof current.category }))
                }
              >
                {EXPENSE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {titleCase(category)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Amount" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={expenseForm.amount}
                onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Description" required>
            <Input
              value={expenseForm.description}
              onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date">
              <Input
                type="date"
                value={expenseForm.date}
                onChange={(event) => setExpenseForm((current) => ({ ...current, date: event.target.value }))}
              />
            </Field>
            <Field label="Payment method">
              <Select
                value={expenseForm.paymentMethod}
                onChange={(event) => setExpenseForm((current) => ({ ...current, paymentMethod: event.target.value }))}
              >
                {paymentMethods.map((method) => (
                  <option key={method.key} value={method.key}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid to">
              <Input
                value={expenseForm.paidTo}
                onChange={(event) => setExpenseForm((current) => ({ ...current, paidTo: event.target.value }))}
                placeholder="Vendor or person"
              />
            </Field>
            <Field label="Status" hint="Pending expenses do not affect the ledger until paid">
              <Select
                value={expenseForm.status}
                onChange={(event) =>
                  setExpenseForm((current) => ({ ...current, status: event.target.value as 'paid' | 'pending' }))
                }
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      {/* Other income modal */}
      <Modal
        open={incomeOpen}
        onClose={() => {
          if (!incomeSaving) setIncomeOpen(false);
        }}
        title="Record other income"
        description="Non-sales income such as rent received or scrap sales."
        footer={
          <>
            <Button variant="outline" onClick={() => setIncomeOpen(false)} disabled={incomeSaving}>
              Cancel
            </Button>
            <Button onClick={() => void submitIncome()} loading={incomeSaving}>
              Record income
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Description" required>
            <Textarea
              value={incomeForm.description}
              onChange={(event) => setIncomeForm((current) => ({ ...current, description: event.target.value }))}
              rows={2}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={incomeForm.amount}
                onChange={(event) => setIncomeForm((current) => ({ ...current, amount: event.target.value }))}
              />
            </Field>
            <Field label="Method">
              <Select
                value={incomeForm.method}
                onChange={(event) => setIncomeForm((current) => ({ ...current, method: event.target.value }))}
              >
                {paymentMethods.map((method) => (
                  <option key={method.key} value={method.key}>
                    {method.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Date">
            <Input
              type="date"
              value={incomeForm.date}
              onChange={(event) => setIncomeForm((current) => ({ ...current, date: event.target.value }))}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingExpense)}
        onClose={() => setDeletingExpense(null)}
        onConfirm={() => void removeExpense()}
        title="Delete expense"
        description={`Delete ${deletingExpense?.expenseNumber ?? 'this expense'}? Paid expenses are reversed in the ledger to keep the books balanced.`}
        confirmLabel="Delete expense"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
