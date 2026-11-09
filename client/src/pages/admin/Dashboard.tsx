import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Boxes,
  ClipboardList,
  Package,
  ShoppingBag,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AppProviders';
import { useMoney } from '@/lib/hooks';
import { AdminPageHeader } from '@/components/AdminLayout';
import { Badge, Button, Card, ErrorState, PageLoader, StatCard, Tabs } from '@/components/ui';
import { ORDER_STATUS_LABELS, formatDate, timeAgo } from '@/lib/format';
import type { FinanceSummary, Order, Product, Sale } from '@/types';

interface Overview extends FinanceSummary {
  productCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  customerCount: number;
  lowStockProducts: Pick<Product, '_id' | 'name' | 'sku' | 'stock' | 'minStockLevel' | 'unit' | 'price' | 'images'>[];
  recentOrders: Order[];
  recentSales: Sale[];
  topProducts: { productId: string; name: string; quantity: number; revenue: number; margin: number }[];
  inventory: { costValue: number; retailValue: number; potentialMargin: number; units: number; skuCount: number };
  currencySymbol: string;
}

interface Insights {
  bestSellers: { _id: string; name: string; soldCount: number; stock: number }[];
  reorderAlerts: { _id: string; name: string; sku: string; stock: number; minStockLevel: number; unit: string }[];
  slowMoving: { _id: string; name: string; sku: string; stock: number; soldCount: number }[];
  declining: { productId: string; name: string; currentQuantity: number; previousQuantity: number; changePercent: number }[];
  revenueTrend: { month: string; revenue: number; profit: number }[];
  note: string;
}

const RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
  { value: 'quarter', label: '90 days' },
  { value: 'year', label: '12 months' },
];

function Sparkbars({ series }: { series: FinanceSummary['series'] }) {
  const values = series.slice(-14);
  const max = Math.max(1, ...values.map((point) => point.revenue));
  if (!values.length) {
    return <p className="py-10 text-center text-xs text-ink-400">No revenue recorded in this period yet.</p>;
  }
  return (
    <div className="flex h-40 items-end gap-1.5">
      {values.map((point) => (
        <div key={point.date} className="group relative flex flex-1 flex-col items-center justify-end">
          <div
            className="w-full rounded-t bg-gold/70 transition-colors group-hover:bg-gold"
            style={{ height: `${Math.max(3, (point.revenue / max) * 100)}%` }}
            title={`${point.date}: ${point.revenue.toFixed(2)}`}
          />
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { format } = useMoney();
  const [range, setRange] = useState('month');

  const overview = useQuery({
    queryKey: ['admin-overview', range],
    queryFn: () => api.get<Overview>(`/dashboard/overview?range=${range}`),
  });
  const insights = useQuery({
    queryKey: ['admin-insights'],
    queryFn: () => api.get<Insights>('/dashboard/insights'),
  });

  if (overview.isLoading) return <PageLoader label="Loading your dashboard…" />;
  if (overview.isError || !overview.data) {
    return <ErrorState message="The dashboard could not be loaded." onRetry={() => overview.refetch()} />;
  }

  const data = overview.data;
  const currency = data.currencySymbol ?? '$';

  return (
    <div>
      <AdminPageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user?.name.split(' ')[0] ?? 'there'}`}
        description="Live performance across sales, stock and money — pulled straight from your database."
        action={
          <Link to="/admin/pos">
            <Button>
              <ShoppingBag className="h-4 w-4" /> Open POS
            </Button>
          </Link>
        }
      />

      <div className="mb-5">
        <Tabs tabs={RANGES} value={range} onChange={setRange} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={format(data.revenue)}
          hint={`${data.ordersDelivered} online · ${data.posSalesCount} POS sales`}
          icon={<TrendingUp className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Net profit"
          value={format(data.netProfit)}
          hint={`Gross ${format(data.grossProfit)} · Expenses ${format(data.expenses)}`}
          icon={<Banknote className="h-4 w-4" />}
          tone={data.netProfit >= 0 ? 'emerald' : 'rose'}
        />
        <StatCard
          label="Cash on hand"
          value={format(data.cashOnHand)}
          hint={`Receivables ${format(data.receivables)}`}
          icon={<Banknote className="h-4 w-4" />}
        />
        <StatCard
          label="Inventory value"
          value={format(data.inventory?.costValue ?? 0)}
          hint={`${data.inventory?.units ?? 0} units · ${data.inventory?.skuCount ?? 0} SKUs`}
          icon={<Boxes className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Products" value={data.productCount} hint={`${data.lowStockCount} low · ${data.outOfStockCount} out`} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Customers" value={data.customerCount} hint={`${data.newCustomers} new this period`} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Orders delivered" value={data.ordersDelivered} hint={`AOV ${format(data.averageOrderValue)}`} icon={<ClipboardList className="h-4 w-4" />} />
        <StatCard
          label="Tax payable"
          value={format(data.taxPayable)}
          hint={`Mobile money pending ${format(data.mobileMoneyPending)}`}
          icon={<Banknote className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Revenue trend</h2>
              <p className="text-xs text-ink-400">Daily recorded revenue for the selected period</p>
            </div>
            <Badge tone="gold">Live ledger</Badge>
          </div>
          <Sparkbars series={data.series} />
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-center dark:border-ink-800">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400">Revenue</p>
              <p className="mt-1 text-sm font-semibold">{format(data.revenue)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400">COGS</p>
              <p className="mt-1 text-sm font-semibold">{format(data.cogs)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-400">Expenses</p>
              <p className="mt-1 text-sm font-semibold">{format(data.expenses)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Needs attention</h2>
            <Link to="/admin/inventory" className="text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
              Inventory
            </Link>
          </div>
          {data.lowStockProducts?.length ? (
            <ul className="mt-4 space-y-3">
              {data.lowStockProducts.slice(0, 6).map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-[11px] text-ink-400">{product.sku}</p>
                  </div>
                  <Badge tone={product.stock <= 0 ? 'rose' : 'amber'}>
                    {product.stock} / {product.minStockLevel} {product.unit}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-400">All active products are above their minimum stock level.</p>
          )}
          <div className="mt-5 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {data.outOfStockCount} product{data.outOfStockCount === 1 ? '' : 's'} out of stock.
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-ink-800">
            <h2 className="font-display text-lg font-semibold">Recent orders</h2>
            <Link to="/admin/orders" className="flex items-center gap-1 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recentOrders.length ? (
            <ul className="divide-y divide-line dark:divide-ink-800">
              {data.recentOrders.map((order) => (
                <li key={order._id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="truncate text-xs text-ink-400">
                      {typeof order.customer === 'object' && order.customer ? order.customer.name : order.shippingAddress?.fullName} ·{' '}
                      {timeAgo(order.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={order.status === 'delivered' ? 'emerald' : order.status === 'cancelled' ? 'rose' : 'amber'}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </Badge>
                    <span className="text-sm font-semibold">{format(order.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-400">No online orders yet.</p>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-ink-800">
            <h2 className="font-display text-lg font-semibold">Recent POS sales</h2>
            <Link to="/admin/pos" className="flex items-center gap-1 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
              Open POS <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {data.recentSales.length ? (
            <ul className="divide-y divide-line dark:divide-ink-800">
              {data.recentSales.map((sale) => (
                <li key={sale._id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{sale.saleNumber}</p>
                    <p className="truncate text-xs text-ink-400">
                      {sale.cashierName} · {formatDate(sale.createdAt, true)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={sale.status === 'completed' ? 'emerald' : 'rose'}>{sale.status}</Badge>
                    <span className="text-sm font-semibold">{format(sale.total)}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-400">No POS sales recorded yet.</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Top products</h2>
          <p className="text-xs text-ink-400">By revenue in the selected period</p>
          {data.topProducts?.length ? (
            <ul className="mt-4 space-y-3">
              {data.topProducts.slice(0, 5).map((product, index) => (
                <li key={product.productId} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-[11px] text-ink-400">{product.quantity} sold</p>
                  </div>
                  <span className="text-xs font-semibold">{format(product.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-400">No product sales in this period.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Reorder alerts</h2>
          <p className="text-xs text-ink-400">Products at or below minimum stock</p>
          {insights.data?.reorderAlerts?.length ? (
            <ul className="mt-4 space-y-3">
              {insights.data.reorderAlerts.slice(0, 5).map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-[11px] text-ink-400">{product.sku}</p>
                  </div>
                  <Badge tone={product.stock <= 0 ? 'rose' : 'amber'}>{product.stock} left</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-400">Nothing to reorder right now.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold">Slow moving</h2>
          <p className="text-xs text-ink-400">In stock but rarely sold</p>
          {insights.data?.slowMoving?.length ? (
            <ul className="mt-4 space-y-3">
              {insights.data.slowMoving.slice(0, 5).map((product) => (
                <li key={product._id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="text-[11px] text-ink-400">{product.stock} in stock</p>
                  </div>
                  <Badge tone="slate">{product.soldCount} sold</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-400">No slow-moving stock detected.</p>
          )}
        </Card>
      </div>

      {insights.data?.note && (
        <p className="mt-6 text-center text-[11px] text-ink-400">{insights.data.note}</p>
      )}
    </div>
  );
}
