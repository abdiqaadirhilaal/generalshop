import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Download,
  FileText,
  Package,
  TrendingUp,
  Users,
  Truck,
  UserCog,
  ReceiptText,
  AlertTriangle,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useToast } from '@/context/AppProviders';
import { useMoney } from '@/lib/hooks';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  StatCard,
  TableSkeleton,
  Tabs,
} from '@/components/ui';
import { formatDate, formatNumber, titleCase } from '@/lib/format';
import type { FinanceSummary } from '@/types';

const REPORT_TABS = [
  { value: 'sales', label: 'Sales & profit' },
  { value: 'products', label: 'Products' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'customers', label: 'Customers' },
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'employees', label: 'Employees' },
  { value: 'expenses', label: 'Expenses' },
];

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'This month' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
];

interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPercent: number;
}

interface SalesReport {
  summary: FinanceSummary;
  currencySymbol: string;
  topProducts: TopProduct[];
  byCashier: { name: string; sales: number; revenue: number }[];
  orderCount: number;
  posCount: number;
  series: { date: string; revenue: number; cogs: number; expenses: number; profit: number }[];
}

interface ProductRow extends TopProduct {
  currentQuantity: number;
  previousQuantity: number;
  stock?: number;
  price?: number;
  costPrice?: number;
  stockValue?: number;
}

interface InventoryReport {
  snapshot: { costValue: number; retailValue: number; potentialMargin: number; units: number; skuCount: number };
  lowStock: {
    _id: string;
    name: string;
    sku: string;
    stock: number;
    minStockLevel: number;
    unit: string;
    costPrice: number;
    price: number;
  }[];
  byCategory: { name?: string; units: number; value: number }[];
}

interface CustomerReport {
  total: number;
  top: { _id: string; name: string; phone: string; totalOrders: number; totalSpending: number; loyaltyPoints: number }[];
  newCustomers: number;
  series: { _id: string; count: number }[];
}

interface SupplierReport {
  payables: { total: number; suppliers: { _id: string; name: string; company?: string; outstandingBalance: number }[] };
  suppliers: {
    _id: string;
    name: string;
    company?: string;
    phone?: string;
    totalPurchases: number;
    outstandingBalance: number;
    status: string;
    purchaseCount: number;
    totalPurchased: number;
  }[];
}

interface EmployeeReport {
  salesByCashier: { _id: string; name: string; sales: number; revenue: number }[];
  activity: { _id: string; name: string; actions: number; lastAction: string }[];
}

interface ExpenseReport {
  rows: { _id: { month: string; account: string }; amount: number }[];
}

export default function Reports() {
  const { error } = useToast();
  const money = useMoney();

  const [tab, setTab] = useState('sales');
  const [range, setRange] = useState('month');
  const [days, setDays] = useState('30');

  const rangeParams = { range };

  const salesQuery = useQuery({
    queryKey: ['report-sales', range],
    queryFn: () => api.get<SalesReport>(`/dashboard/reports/sales${queryString(rangeParams)}`),
    enabled: tab === 'sales',
  });

  const productsQuery = useQuery({
    queryKey: ['report-products', days],
    queryFn: () => api.get<{ days: number; rows: ProductRow[]; totalProducts: number }>(`/dashboard/reports/products?days=${days}`),
    enabled: tab === 'products',
  });

  const inventoryQuery = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get<InventoryReport>('/dashboard/reports/inventory'),
    enabled: tab === 'inventory',
  });

  const customersQuery = useQuery({
    queryKey: ['report-customers'],
    queryFn: () => api.get<CustomerReport>('/dashboard/reports/customers'),
    enabled: tab === 'customers',
  });

  const suppliersQuery = useQuery({
    queryKey: ['report-suppliers'],
    queryFn: () => api.get<SupplierReport>('/dashboard/reports/suppliers'),
    enabled: tab === 'suppliers',
  });

  const employeesQuery = useQuery({
    queryKey: ['report-employees', range],
    queryFn: () => api.get<EmployeeReport>(`/dashboard/reports/employees${queryString(rangeParams)}`),
    enabled: tab === 'employees',
  });

  const expensesQuery = useQuery({
    queryKey: ['report-expenses', range],
    queryFn: () => api.get<ExpenseReport>(`/dashboard/reports/expenses${queryString(rangeParams)}`),
    enabled: tab === 'expenses',
  });

  const sales = salesQuery.data;
  const products = productsQuery.data;
  const inventory = inventoryQuery.data;
  const customers = customersQuery.data;
  const suppliers = suppliersQuery.data;
  const employees = employeesQuery.data;
  const expenses = expensesQuery.data;

  const expenseMatrix = useMemo(() => {
    const rows = expenses?.rows ?? [];
    const months = [...new Set(rows.map((row) => row._id.month))].sort();
    const accounts = [...new Set(rows.map((row) => row._id.account))].sort();
    const value = (month: string, account: string) =>
      rows.find((row) => row._id.month === month && row._id.account === account)?.amount ?? 0;
    return {
      months,
      accounts,
      value,
      totals: accounts.map((account) => ({
        account,
        total: months.reduce((sum, month) => sum + value(month, account), 0),
      })),
    };
  }, [expenses]);

  const exportCsv = (type: string) =>
    void downloadFile(
      `/dashboard/reports/export${queryString({ type, range, days })}`,
      `hilaal-${type}-report.csv`
    ).catch(error);

  const showRange = ['sales', 'employees', 'expenses'].includes(tab);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Insights"
        title="Reports"
        description="Operational and financial reports computed from live sales, inventory and ledger data."
        action={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportCsv(tab)}>
              Export CSV
            </Button>
            {tab === 'sales' && (
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText className="h-4 w-4" />}
                onClick={() =>
                  void downloadFile(`/dashboard/reports/sales/pdf${queryString(rangeParams)}`, 'hilaal-sales-report.pdf').catch(
                    error
                  )
                }
              >
                Download PDF
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs tabs={REPORT_TABS} value={tab} onChange={setTab} />
        {showRange && (
          <Select value={range} onChange={(event) => setRange(event.target.value)} className="ml-auto w-auto">
            {RANGES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        )}
        {tab === 'products' && (
          <Select value={days} onChange={(event) => setDays(event.target.value)} className="ml-auto w-auto">
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </Select>
        )}
      </div>

      {tab === 'sales' && (
        <>
          {salesQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(salesQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void salesQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : salesQuery.isLoading || !sales ? (
            <Card className="p-4">
              <TableSkeleton rows={8} />
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Revenue" value={money.format(sales.summary.revenue)} hint={`${sales.posCount} POS sales`} icon={<TrendingUp className="h-4 w-4" />} tone="gold" />
                <StatCard label="Gross profit" value={money.format(sales.summary.grossProfit)} hint={`COGS ${money.format(sales.summary.cogs)}`} icon={<BarChart3 className="h-4 w-4" />} tone="emerald" />
                <StatCard label="Net profit" value={money.format(sales.summary.netProfit)} hint={`Expenses ${money.format(sales.summary.expenses)}`} icon={<ReceiptText className="h-4 w-4" />} tone={sales.summary.netProfit >= 0 ? 'emerald' : 'rose'} />
                <StatCard label="Orders delivered" value={formatNumber(sales.orderCount)} hint="Online orders in period" icon={<Package className="h-4 w-4" />} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                    <h3 className="font-display text-lg font-semibold">Top products</h3>
                    <p className="text-xs text-ink-400">Ranked by revenue in the selected period</p>
                  </div>
                  {sales.topProducts.length === 0 ? (
                    <EmptyState icon={<Package className="h-6 w-6" />} title="No product sales" description="No sales were recorded in this period." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                          <tr>
                            <th className="px-4 py-2">Product</th>
                            <th className="px-4 py-2 text-right">Qty</th>
                            <th className="px-4 py-2 text-right">Revenue</th>
                            <th className="px-4 py-2 text-right">Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line dark:divide-ink-800">
                          {sales.topProducts.map((product) => (
                            <tr key={product.productId}>
                              <td className="px-4 py-2">
                                <p className="font-medium">{product.name}</p>
                                <p className="text-xs text-ink-400">{product.sku}</p>
                              </td>
                              <td className="px-4 py-2 text-right">{formatNumber(product.quantity)}</td>
                              <td className="px-4 py-2 text-right">{money.format(product.revenue)}</td>
                              <td className="px-4 py-2 text-right">
                                <span className={product.margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>
                                  {money.format(product.margin)}
                                </span>
                                <span className="ml-1 text-[10px] text-ink-400">({product.marginPercent}%)</span>
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
                    <h3 className="font-display text-lg font-semibold">Sales by cashier</h3>
                    <p className="text-xs text-ink-400">POS performance by team member</p>
                  </div>
                  {sales.byCashier.length === 0 ? (
                    <EmptyState icon={<UserCog className="h-6 w-6" />} title="No POS sales" description="No cashier sales in this period." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                          <tr>
                            <th className="px-4 py-2">Cashier</th>
                            <th className="px-4 py-2 text-right">Sales</th>
                            <th className="px-4 py-2 text-right">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line dark:divide-ink-800">
                          {sales.byCashier.map((cashier) => (
                            <tr key={cashier.name}>
                              <td className="px-4 py-2 font-medium">{cashier.name}</td>
                              <td className="px-4 py-2 text-right">{formatNumber(cashier.sales)}</td>
                              <td className="px-4 py-2 text-right">{money.format(cashier.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Daily revenue &amp; profit</h3>
                </div>
                {sales.series.length === 0 ? (
                  <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No ledger activity" description="Revenue and profit by day will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Date</th>
                          <th className="px-4 py-2 text-right">Revenue</th>
                          <th className="px-4 py-2 text-right">COGS</th>
                          <th className="px-4 py-2 text-right">Expenses</th>
                          <th className="px-4 py-2 text-right">Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {sales.series.map((row) => (
                          <tr key={row.date}>
                            <td className="px-4 py-2 text-xs text-ink-500 dark:text-ink-300">{formatDate(row.date)}</td>
                            <td className="px-4 py-2 text-right">{money.format(row.revenue)}</td>
                            <td className="px-4 py-2 text-right text-ink-400">{money.format(row.cogs)}</td>
                            <td className="px-4 py-2 text-right text-ink-400">{money.format(row.expenses)}</td>
                            <td className={`px-4 py-2 text-right font-medium ${row.profit >= 0 ? '' : 'text-rose-500'}`}>
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
          )}
        </>
      )}

      {tab === 'products' && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 dark:border-ink-800">
            <div>
              <h3 className="font-display text-lg font-semibold">Product performance</h3>
              <p className="text-xs text-ink-400">
                Last {products?.days ?? days} days · {formatNumber(products?.totalProducts ?? 0)} products
              </p>
            </div>
          </div>
          {productsQuery.isError ? (
            <div className="p-6 text-center text-sm text-rose-600">{apiErrorMessage(productsQuery.error)}</div>
          ) : productsQuery.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={8} />
            </div>
          ) : (products?.rows ?? []).length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6" />} title="No product sales" description="No products sold in this period." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-4 py-2">Product</th>
                    <th className="px-4 py-2 text-right">Sold</th>
                    <th className="px-4 py-2 text-right">Prev.</th>
                    <th className="px-4 py-2 text-right">Revenue</th>
                    <th className="px-4 py-2 text-right">Margin</th>
                    <th className="px-4 py-2 text-right">Margin %</th>
                    <th className="px-4 py-2 text-right">Stock</th>
                    <th className="px-4 py-2 text-right">Stock value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {products?.rows.map((row) => (
                    <tr key={row.productId}>
                      <td className="px-4 py-2">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-ink-400">{row.sku}</p>
                      </td>
                      <td className="px-4 py-2 text-right">{formatNumber(row.quantity)}</td>
                      <td className="px-4 py-2 text-right text-ink-400">{formatNumber(row.previousQuantity)}</td>
                      <td className="px-4 py-2 text-right">{money.format(row.revenue)}</td>
                      <td className={`px-4 py-2 text-right ${row.margin >= 0 ? '' : 'text-rose-500'}`}>{money.format(row.margin)}</td>
                      <td className="px-4 py-2 text-right text-xs text-ink-400">{row.marginPercent}%</td>
                      <td className="px-4 py-2 text-right">{formatNumber(row.stock ?? 0)}</td>
                      <td className="px-4 py-2 text-right">{money.format(row.stockValue ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'inventory' && (
        <>
          {inventoryQuery.isLoading || !inventory ? (
            <Card className="p-4">
              <TableSkeleton rows={8} />
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="Stock value (cost)" value={money.format(inventory.snapshot.costValue)} hint={`${formatNumber(inventory.snapshot.units)} units`} icon={<Package className="h-4 w-4" />} />
                <StatCard label="Retail value" value={money.format(inventory.snapshot.retailValue)} hint={`${formatNumber(inventory.snapshot.skuCount)} SKUs`} icon={<TrendingUp className="h-4 w-4" />} tone="gold" />
                <StatCard label="Potential margin" value={money.format(inventory.snapshot.potentialMargin)} hint="Retail minus cost value" icon={<BarChart3 className="h-4 w-4" />} tone="emerald" />
                <StatCard label="Low stock alerts" value={formatNumber(inventory.lowStock.length)} hint="At or below reorder level" icon={<AlertTriangle className="h-4 w-4" />} tone="rose" />
              </div>

              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Low stock</h3>
                </div>
                {inventory.lowStock.length === 0 ? (
                  <EmptyState icon={<Package className="h-6 w-6" />} title="Stock levels healthy" description="No products are at or below their reorder level." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Product</th>
                          <th className="px-4 py-2 text-right">Stock</th>
                          <th className="px-4 py-2 text-right">Reorder level</th>
                          <th className="px-4 py-2 text-right">Cost</th>
                          <th className="px-4 py-2 text-right">Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {inventory.lowStock.map((product) => (
                          <tr key={product._id}>
                            <td className="px-4 py-2">
                              <p className="font-medium">{product.name}</p>
                              <p className="text-xs text-ink-400">{product.sku}</p>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Badge tone={product.stock <= 0 ? 'rose' : 'amber'}>
                                {product.stock} {product.unit}
                              </Badge>
                            </td>
                            <td className="px-4 py-2 text-right">{product.minStockLevel}</td>
                            <td className="px-4 py-2 text-right">{money.format(product.costPrice)}</td>
                            <td className="px-4 py-2 text-right">{money.format(product.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Stock by category</h3>
                </div>
                {inventory.byCategory.length === 0 ? (
                  <EmptyState icon={<Package className="h-6 w-6" />} title="No inventory" description="Add products to see category valuation." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Category</th>
                          <th className="px-4 py-2 text-right">Units</th>
                          <th className="px-4 py-2 text-right">Cost value</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {inventory.byCategory.map((row) => (
                          <tr key={row.name ?? 'uncategorised'}>
                            <td className="px-4 py-2 font-medium">{row.name ?? 'Uncategorised'}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(row.units)}</td>
                            <td className="px-4 py-2 text-right">{money.format(row.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {tab === 'customers' && (
        <>
          {customersQuery.isLoading || !customers ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Total customers" value={formatNumber(customers.total)} icon={<Users className="h-4 w-4" />} />
                <StatCard label="New in 30 days" value={formatNumber(customers.newCustomers)} icon={<TrendingUp className="h-4 w-4" />} tone="emerald" />
                <StatCard
                  label="Top customer spend"
                  value={money.format(customers.top[0]?.totalSpending ?? 0)}
                  hint={customers.top[0]?.name}
                  icon={<Users className="h-4 w-4" />}
                  tone="gold"
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="overflow-hidden">
                  <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                    <h3 className="font-display text-lg font-semibold">Top customers</h3>
                  </div>
                  {customers.top.length === 0 ? (
                    <EmptyState icon={<Users className="h-6 w-6" />} title="No customers yet" description="Customer registrations will appear here." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[420px] text-left text-sm">
                        <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                          <tr>
                            <th className="px-4 py-2">Customer</th>
                            <th className="px-4 py-2 text-right">Orders</th>
                            <th className="px-4 py-2 text-right">Spending</th>
                            <th className="px-4 py-2 text-right">Points</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line dark:divide-ink-800">
                          {customers.top.map((customer) => (
                            <tr key={customer._id}>
                              <td className="px-4 py-2">
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-xs text-ink-400">{customer.phone}</p>
                              </td>
                              <td className="px-4 py-2 text-right">{formatNumber(customer.totalOrders)}</td>
                              <td className="px-4 py-2 text-right">{money.format(customer.totalSpending)}</td>
                              <td className="px-4 py-2 text-right">{formatNumber(customer.loyaltyPoints)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
                <Card className="overflow-hidden">
                  <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                    <h3 className="font-display text-lg font-semibold">New customers by month</h3>
                  </div>
                  {customers.series.length === 0 ? (
                    <EmptyState icon={<Users className="h-6 w-6" />} title="No recent signups" description="Registrations from the last 6 months will appear here." />
                  ) : (
                    <div className="p-4">
                      <div className="space-y-3">
                        {customers.series.map((row) => {
                          const max = Math.max(1, ...customers.series.map((item) => item.count));
                          return (
                            <div key={row._id}>
                              <div className="mb-1 flex justify-between text-xs">
                                <span className="text-ink-500 dark:text-ink-300">{row._id}</span>
                                <span className="font-medium">{row.count}</span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'suppliers' && (
        <>
          {suppliersQuery.isLoading || !suppliers ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard label="Total payables" value={money.format(suppliers.payables.total)} icon={<Truck className="h-4 w-4" />} tone="rose" />
                <StatCard label="Suppliers" value={formatNumber(suppliers.suppliers.length)} icon={<Truck className="h-4 w-4" />} tone="gold" />
              </div>
              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Supplier performance</h3>
                </div>
                {suppliers.suppliers.length === 0 ? (
                  <EmptyState icon={<Truck className="h-6 w-6" />} title="No suppliers" description="Add suppliers and purchases to see performance." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Supplier</th>
                          <th className="px-4 py-2">Phone</th>
                          <th className="px-4 py-2 text-right">Purchases</th>
                          <th className="px-4 py-2 text-right">Total purchased</th>
                          <th className="px-4 py-2 text-right">Outstanding</th>
                          <th className="px-4 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {suppliers.suppliers.map((supplier) => (
                          <tr key={supplier._id}>
                            <td className="px-4 py-2">
                              <p className="font-medium">{supplier.name}</p>
                              <p className="text-xs text-ink-400">{supplier.company}</p>
                            </td>
                            <td className="px-4 py-2 text-xs text-ink-500 dark:text-ink-300">{supplier.phone ?? '—'}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(supplier.purchaseCount)}</td>
                            <td className="px-4 py-2 text-right">{money.format(supplier.totalPurchased)}</td>
                            <td className="px-4 py-2 text-right font-medium text-rose-600 dark:text-rose-400">
                              {money.format(supplier.outstandingBalance)}
                            </td>
                            <td className="px-4 py-2">
                              <Badge tone={supplier.status === 'active' ? 'emerald' : 'slate'}>{supplier.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {tab === 'employees' && (
        <>
          {employeesQuery.isLoading || !employees ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Sales by cashier</h3>
                  <p className="text-xs text-ink-400">POS revenue in the selected period</p>
                </div>
                {employees.salesByCashier.length === 0 ? (
                  <EmptyState icon={<UserCog className="h-6 w-6" />} title="No POS sales" description="Cashier sales will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[380px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Cashier</th>
                          <th className="px-4 py-2 text-right">Sales</th>
                          <th className="px-4 py-2 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {employees.salesByCashier.map((row) => (
                          <tr key={row._id}>
                            <td className="px-4 py-2 font-medium">{row.name}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(row.sales)}</td>
                            <td className="px-4 py-2 text-right">{money.format(row.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              <Card className="overflow-hidden">
                <div className="border-b border-line px-4 py-3 dark:border-ink-800">
                  <h3 className="font-display text-lg font-semibold">Staff activity</h3>
                  <p className="text-xs text-ink-400">Recorded actions from the audit log</p>
                </div>
                {employees.activity.length === 0 ? (
                  <EmptyState icon={<UserCog className="h-6 w-6" />} title="No activity" description="Staff actions will appear here." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-left text-sm">
                      <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                        <tr>
                          <th className="px-4 py-2">Staff</th>
                          <th className="px-4 py-2 text-right">Actions</th>
                          <th className="px-4 py-2">Last action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line dark:divide-ink-800">
                        {employees.activity.map((row) => (
                          <tr key={row._id}>
                            <td className="px-4 py-2 font-medium">{row.name}</td>
                            <td className="px-4 py-2 text-right">{formatNumber(row.actions)}</td>
                            <td className="px-4 py-2 text-xs text-ink-500 dark:text-ink-300">
                              {formatDate(row.lastAction, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {tab === 'expenses' && (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-4 py-3 dark:border-ink-800">
            <h3 className="font-display text-lg font-semibold">Expenses by month</h3>
            <p className="text-xs text-ink-400">Grouped by expense account from the ledger</p>
          </div>
          {expensesQuery.isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={6} />
            </div>
          ) : (expenses?.rows ?? []).length === 0 ? (
            <EmptyState icon={<ReceiptText className="h-6 w-6" />} title="No expenses" description="Expense ledger entries will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-4 py-2">Category</th>
                    {expenseMatrix.months.map((month) => (
                      <th key={month} className="px-4 py-2 text-right">
                        {month}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {expenseMatrix.accounts.map((account) => (
                    <tr key={account}>
                      <td className="px-4 py-2 font-medium">{titleCase(account.replace(/^expense:/, ''))}</td>
                      {expenseMatrix.months.map((month) => (
                        <td key={month} className="px-4 py-2 text-right">
                          {money.format(expenseMatrix.value(month, account))}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-semibold">
                        {money.format(expenseMatrix.totals.find((row) => row.account === account)?.total ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
