import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Boxes,
  ClipboardList,
  PackageX,
  Plus,
  Scale,
  SlidersHorizontal,
  Trash2,
  Warehouse,
} from 'lucide-react';
import { api, apiErrorMessage, queryString } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
import { useDebounced, useMoney } from '@/lib/hooks';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
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
import { formatDate, formatNumber, titleCase } from '@/lib/format';
import type { InventoryMovement, Page, Product } from '@/types';

interface Valuation {
  costValue: number;
  retailValue: number;
  potentialMargin: number;
  units: number;
  skuCount: number;
  lowStock: number;
  outOfStock: number;
}

type ActionType = 'stock_in' | 'stock_out' | 'damage' | 'adjust';

const ACTION_LABELS: Record<ActionType, string> = {
  stock_in: 'Stock in',
  stock_out: 'Stock out',
  damage: 'Record damage',
  adjust: 'Adjust to count',
};

const MOVEMENT_TONES: Record<string, 'emerald' | 'rose' | 'amber' | 'blue' | 'slate' | 'gold'> = {
  stock_in: 'emerald',
  purchase: 'emerald',
  return: 'blue',
  sale: 'rose',
  order: 'rose',
  stock_out: 'amber',
  damage: 'rose',
  adjustment: 'gold',
  void: 'slate',
};

function productName(product: InventoryMovement['product']) {
  return typeof product === 'string' ? '—' : product.name;
}

export default function Inventory() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('inventory:write');

  const [tab, setTab] = useState('overview');
  const [movementPage, setMovementPage] = useState(1);
  const [movementType, setMovementType] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const debouncedSearch = useDebounced(movementSearch);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [actionOpen, setActionOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('stock_in');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const valuationQuery = useQuery({
    queryKey: ['inventory-valuation'],
    queryFn: () => api.get<Valuation>('/inventory/valuation'),
  });
  const lowStockQuery = useQuery({
    queryKey: ['inventory-low-stock'],
    queryFn: () => api.get<Product[]>('/inventory/low-stock'),
  });
  const productsQuery = useQuery({
    queryKey: ['inventory-product-options'],
    queryFn: () => api.page<Product>(`/admin/catalog/products${queryString({ limit: 200, sort: 'name', status: 'active' })}`),
  });

  const movementParams = {
    page: movementPage,
    limit: 25,
    type: movementType || undefined,
    reference: debouncedSearch || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const movementsQuery = useQuery({
    queryKey: ['inventory-movements', movementParams],
    queryFn: () => api.page<InventoryMovement>(`/inventory/movements${queryString(movementParams)}`),
  });

  const valuation = valuationQuery.data;
  const lowStock = lowStockQuery.data ?? [];
  const products = productsQuery.data?.items ?? [];
  const movements = movementsQuery.data?.items ?? [];
  const meta = movementsQuery.data?.meta;

  const selectedProduct = useMemo(() => products.find((product) => product._id === productId), [products, productId]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-low-stock'] });
    void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
  };

  const openAction = (type: ActionType, product?: Product) => {
    setActionType(type);
    setProductId(product?._id ?? '');
    setQuantity(type === 'adjust' ? String(product?.stock ?? 0) : '1');
    setUnitCost(product ? String(product.costPrice) : '');
    setReason('');
    setNote('');
    setFormError('');
    setActionOpen(true);
  };

  const submitAction = async () => {
    setFormError('');
    if (!productId) return setFormError('Choose a product.');
    if (actionType !== 'adjust' && (!quantity || Number(quantity) <= 0)) return setFormError('Enter a quantity greater than zero.');
    if (actionType === 'adjust' && Number(quantity) < 0) return setFormError('Target quantity cannot be negative.');
    if ((actionType === 'damage' || actionType === 'adjust') && !reason.trim()) {
      return setFormError('A reason is required for this movement.');
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { productId, reason: reason.trim() || undefined, note: note.trim() || undefined };
      if (actionType === 'adjust') {
        body.quantity = Number(quantity);
        await api.post('/inventory/adjust', body);
      } else {
        body.quantity = Number(quantity);
        if (actionType === 'stock_in' && unitCost !== '') body.unitCost = Number(unitCost);
        await api.post(`/inventory/${actionType.replace('_', '-')}`, body);
      }
      success(`${ACTION_LABELS[actionType]} recorded.`);
      setActionOpen(false);
      refresh();
    } catch (actionError) {
      setFormError(apiErrorMessage(actionError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Inventory"
        title="Stock & movements"
        description="Track stock value, low-stock alerts and every inventory change with a full audit trail."
        action={
          canWrite ? (
            <>
              <Button variant="outline" size="sm" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => openAction('adjust')}>
                Adjust
              </Button>
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openAction('stock_in')}>
                Stock in
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Stock cost value"
          value={money.format(valuation?.costValue ?? 0)}
          hint={`${formatNumber(valuation?.units ?? 0)} units on hand`}
          icon={<Warehouse className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Retail value"
          value={money.format(valuation?.retailValue ?? 0)}
          hint={`${formatNumber(valuation?.skuCount ?? 0)} SKUs tracked`}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          label="Potential margin"
          value={money.format(valuation?.potentialMargin ?? 0)}
          hint="Retail value minus cost value"
          icon={<Scale className="h-4 w-4" />}
          tone="emerald"
        />
        <StatCard
          label="Attention needed"
          value={`${formatNumber(valuation?.lowStock ?? 0)} low · ${formatNumber(valuation?.outOfStock ?? 0)} out`}
          hint="Active products at or below threshold"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
        />
      </div>

      <Tabs
        tabs={[
          { value: 'overview', label: 'Low stock', count: lowStock.length },
          { value: 'movements', label: 'Movement history' },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4 max-w-sm"
      />

      {tab === 'overview' ? (
        lowStockQuery.isLoading ? (
          <Card className="p-4"><TableSkeleton rows={6} /></Card>
        ) : lowStock.length === 0 ? (
          <Card>
            <EmptyState icon={<Warehouse className="h-6 w-6" />} title="Stock levels look healthy" description="No active products are at or below their low-stock threshold." />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">On hand</th>
                    <th className="px-4 py-2.5">Threshold</th>
                    <th className="px-4 py-2.5">Cost</th>
                    <th className="px-4 py-2.5">Price</th>
                    {canWrite && <th className="px-4 py-2.5 text-right">Restock</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {lowStock.map((product) => (
                    <tr key={product._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900 dark:text-white">{product.name}</p>
                        <p className="text-xs text-ink-400">{product.sku}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-500 dark:text-ink-300">
                        {typeof product.category === 'string' ? '—' : product.category?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={product.stock <= 0 ? 'rose' : 'amber'}>
                          {formatNumber(product.stock)} {product.unit}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{formatNumber(product.minStockLevel)}</td>
                      <td className="px-4 py-3">{money.format(product.costPrice)}</td>
                      <td className="px-4 py-3">{money.format(product.price)}</td>
                      {canWrite && (
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" icon={<ArrowUpCircle className="h-3.5 w-3.5" />} onClick={() => openAction('stock_in', product)}>
                            Stock in
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <>
          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={movementSearch} onChange={(value) => { setMovementSearch(value); setMovementPage(1); }} placeholder="Search reference number" className="w-full sm:w-56" />
              <Select value={movementType} onChange={(event) => { setMovementType(event.target.value); setMovementPage(1); }} className="w-auto">
                <option value="">All types</option>
                {['stock_in', 'stock_out', 'sale', 'order', 'purchase', 'return', 'adjustment', 'damage', 'void'].map((value) => (
                  <option key={value} value={value}>{titleCase(value)}</option>
                ))}
              </Select>
              <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setMovementPage(1); }} className="w-auto" aria-label="From date" />
              <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setMovementPage(1); }} className="w-auto" aria-label="To date" />
            </div>
          </Card>

          {movementsQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(movementsQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void movementsQuery.refetch()}>Retry</Button>
            </Card>
          ) : movementsQuery.isLoading ? (
            <Card className="p-4"><TableSkeleton rows={8} /></Card>
          ) : movements.length === 0 ? (
            <Card>
              <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No movements found" description="Stock changes, sales, purchases and adjustments will appear here." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right">Change</th>
                      <th className="px-4 py-2.5 text-right">Balance</th>
                      <th className="px-4 py-2.5">Reference</th>
                      <th className="px-4 py-2.5">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {movements.map((movement) => (
                      <tr key={movement._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(movement.createdAt, true)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900 dark:text-white">{productName(movement.product)}</p>
                          <p className="text-xs text-ink-400">{typeof movement.product === 'string' ? '' : movement.product.sku}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone={MOVEMENT_TONES[movement.type] ?? 'slate'}>{titleCase(movement.type)}</Badge>
                          {movement.reason && <p className="mt-0.5 text-[11px] text-ink-400">{movement.reason}</p>}
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${movement.quantity >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {movement.quantity > 0 ? '+' : ''}{formatNumber(movement.quantity)}
                        </td>
                        <td className="px-4 py-3 text-right">{formatNumber(movement.balanceAfter)}</td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{movement.referenceNumber || '—'}</td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                          {typeof movement.user === 'string' ? '—' : movement.user?.name ?? 'System'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
                <Pagination page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} total={meta?.total} onChange={setMovementPage} />
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={actionOpen}
        onClose={() => { if (!saving) setActionOpen(false); }}
        title={ACTION_LABELS[actionType]}
        description={
          actionType === 'adjust'
            ? 'Set the counted quantity. The difference is recorded as an adjustment.'
            : actionType === 'damage'
              ? 'Damaged stock is removed from inventory and recorded for audit.'
              : 'Every change is recorded in the inventory movement log.'
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setActionOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void submitAction()} loading={saving}>{ACTION_LABELS[actionType]}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <Field label="Product" required>
            <Select value={productId} onChange={(event) => {
              setProductId(event.target.value);
              const product = products.find((item) => item._id === event.target.value);
              if (product) {
                setUnitCost(String(product.costPrice));
                if (actionType === 'adjust') setQuantity(String(product.stock));
              }
            }}>
              <option value="">Choose a product</option>
              {products.map((product) => (
                <option key={product._id} value={product._id}>{product.name} · {product.sku}</option>
              ))}
            </Select>
          </Field>
          {selectedProduct && (
            <div className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-300">
              Current stock: <strong>{formatNumber(selectedProduct.stock)} {selectedProduct.unit}</strong> · threshold {selectedProduct.minStockLevel}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={actionType === 'adjust' ? 'Counted quantity' : 'Quantity'} required>
              <Input type="number" min="0" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            {actionType === 'stock_in' && (
              <Field label="Unit cost" hint="Optional. Updates weighted cost when provided.">
                <Input type="number" min="0" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} />
              </Field>
            )}
          </div>
          <Field label="Reason" required={actionType === 'damage' || actionType === 'adjust'}>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={actionType === 'stock_in' ? 'Supplier delivery' : 'e.g. Damaged in transit'} />
          </Field>
          <Field label="Note">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {actionType !== 'stock_in' && (
              <Button size="sm" variant="outline" icon={<ArrowDownCircle className="h-3.5 w-3.5" />} onClick={() => { setActionType('stock_out'); setReason(''); }}>
                Switch to stock out
              </Button>
            )}
            {actionType !== 'damage' && (
              <Button size="sm" variant="outline" icon={<PackageX className="h-3.5 w-3.5" />} onClick={() => { setActionType('damage'); setReason(''); }}>
                Record damage
              </Button>
            )}
            {actionType !== 'adjust' && (
              <Button size="sm" variant="outline" icon={<SlidersHorizontal className="h-3.5 w-3.5" />} onClick={() => setActionType('adjust')}>
                Adjust to count
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
