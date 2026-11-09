import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  Eye,
  PackageCheck,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useAuth, useSettings, useToast } from '@/context/AppProviders';
import { useDebounced, useMoney } from '@/lib/hooks';
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
  Textarea,
} from '@/components/ui';
import { formatDate, formatNumber, statusTone } from '@/lib/format';
import type { Page, Product, Purchase, Supplier } from '@/types';

type PurchaseRow = Purchase & {
  paymentStatus?: 'unpaid' | 'partial' | 'paid';
  createdBy?: { name: string } | string;
  supplier: { _id: string; name: string; company?: string; phone?: string; email?: string; outstandingBalance?: number } | string;
};

interface LineItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  stock: number;
}

const emptyForm = {
  supplierId: '',
  expectedAt: '',
  notes: '',
  status: 'ordered' as 'draft' | 'ordered',
};

export default function Purchases() {
  const { has } = useAuth();
  const { settings } = useSettings();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('purchases:write');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<LineItem[]>([]);
  const [taxTotal, setTaxTotal] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const debouncedProductSearch = useDebounced(productSearch, 250);

  const [paying, setPaying] = useState<PurchaseRow | null>(null);
  const [payment, setPayment] = useState({ amount: '', method: 'cash', reference: '', notes: '' });
  const [payLoading, setPayLoading] = useState(false);

  const [receiving, setReceiving] = useState<PurchaseRow | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseRow | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);

  const params = {
    page,
    limit: 20,
    q: debouncedSearch || undefined,
    status: status || undefined,
    paymentStatus: paymentStatus || undefined,
    supplier: supplierId || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['admin-purchases', params],
    queryFn: () => api.page<PurchaseRow>(`/purchases${queryString(params)}`),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-purchase', detailId],
    queryFn: () => api.get<PurchaseRow>(`/purchases/${detailId}`),
    enabled: Boolean(detailId),
  });

  const suppliersQuery = useQuery({
    queryKey: ['admin-suppliers-lite'],
    queryFn: () => api.page<Supplier>('/suppliers?limit=200&status=active'),
  });

  const productsQuery = useQuery({
    queryKey: ['purchase-product-search', debouncedProductSearch],
    queryFn: () =>
      api.page<Product>(
        `/admin/catalog/products${queryString({
          q: debouncedProductSearch || undefined,
          limit: 8,
          status: 'active',
        })}`
      ),
    enabled: createOpen,
  });

  const purchases = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta;
  const suppliers = suppliersQuery.data?.items ?? [];
  const products = productsQuery.data?.items ?? [];
  const detail = detailQuery.data;

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const tax = Number(taxTotal) || 0;
    return { subtotal, tax, total: subtotal + tax };
  }, [items, taxTotal]);

  const outstanding = useMemo(
    () => purchases.reduce((sum, purchase) => sum + (purchase.balance ?? 0), 0),
    [purchases]
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

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-purchases'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-purchase', detailId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-suppliers-lite'] });
  };

  const openCreate = () => {
    setForm(emptyForm);
    setItems([]);
    setTaxTotal('0');
    setFormError('');
    setProductSearch('');
    setCreateOpen(true);
  };

  const addProduct = (product: Product) => {
    setItems((current) => {
      if (current.some((item) => item.productId === product._id)) return current;
      return [
        ...current,
        {
          productId: product._id,
          name: product.name,
          sku: product.sku,
          unit: product.unit,
          quantity: 1,
          unitCost: product.costPrice ?? 0,
          stock: product.stock,
        },
      ];
    });
    setProductSearch('');
  };

  const updateItem = (productId: string, patch: Partial<LineItem>) =>
    setItems((current) => current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)));

  const removeItem = (productId: string) => setItems((current) => current.filter((item) => item.productId !== productId));

  const submit = async () => {
    setFormError('');
    if (!form.supplierId) return setFormError('Choose a supplier.');
    if (items.length === 0) return setFormError('Add at least one product.');
    if (items.some((item) => item.quantity <= 0)) return setFormError('Quantities must be greater than zero.');

    setSaving(true);
    try {
      const created = await api.post<Purchase>('/purchases', {
        supplierId: form.supplierId,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitCost: item.unitCost,
        })),
        taxTotal: Number(taxTotal) || 0,
        expectedAt: form.expectedAt || undefined,
        notes: form.notes.trim() || undefined,
        status: form.status,
      });
      success(`Purchase ${created.purchaseNumber} created.`);
      setCreateOpen(false);
      refresh();
      setDetailId(created._id);
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (purchase: PurchaseRow) => {
    setPaying(purchase);
    setPayment({
      amount: purchase.balance > 0 ? purchase.balance.toFixed(2) : '',
      method: paymentMethods[0]?.key ?? 'cash',
      reference: '',
      notes: '',
    });
  };

  const submitPayment = async () => {
    if (!paying) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) return error('Enter a valid payment amount.');
    if (amount > paying.balance) return error('Payment cannot exceed the outstanding balance.');

    setPayLoading(true);
    try {
      await api.post(`/purchases/${paying._id}/payments`, {
        amount,
        method: payment.method,
        reference: payment.reference.trim() || undefined,
        notes: payment.notes.trim() || undefined,
      });
      success('Purchase payment recorded.');
      setPaying(null);
      refresh();
    } catch (paymentError) {
      error(paymentError);
    } finally {
      setPayLoading(false);
    }
  };

  const receive = async () => {
    if (!receiving) return;
    setReceiveLoading(true);
    try {
      await api.post(`/purchases/${receiving._id}/receive`);
      success(`Stock received for ${receiving.purchaseNumber}.`);
      setReceiving(null);
      refresh();
    } catch (receiveError) {
      error(receiveError);
    } finally {
      setReceiveLoading(false);
    }
  };

  const cancel = async () => {
    if (!cancelling) return;
    setCancelLoading(true);
    try {
      await api.post(`/purchases/${cancelling._id}/cancel`);
      success(`Purchase ${cancelling.purchaseNumber} cancelled.`);
      setCancelling(null);
      refresh();
    } catch (cancelError) {
      error(cancelError);
    } finally {
      setCancelLoading(false);
    }
  };

  const supplierName = (purchase: PurchaseRow) =>
    typeof purchase.supplier === 'object' && purchase.supplier ? purchase.supplier.name : '—';

  return (
    <div>
      <AdminPageHeader
        eyebrow="Purchasing"
        title="Purchases"
        description="Record supplier orders, receive stock into inventory and track payables."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void downloadFile('/purchases/export', 'hilaal-purchases.csv').catch(error)}
            >
              Export CSV
            </Button>
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                New purchase
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Purchases in view"
          value={formatNumber(meta?.total ?? 0)}
          hint="Matching the current filters"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
        <StatCard
          label="Outstanding on page"
          value={money.format(outstanding)}
          hint="Unpaid balance of listed purchases"
          icon={<Wallet className="h-4 w-4" />}
          tone="rose"
        />
        <StatCard
          label="Suppliers"
          value={formatNumber(suppliers.length)}
          hint="Active suppliers available to order from"
          icon={<Truck className="h-4 w-4" />}
          tone="gold"
        />
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search purchase number"
            className="w-full sm:w-56"
          />
          <Select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setPage(1);
            }}
            className="w-auto max-w-[180px]"
          >
            <option value="">Any supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier._id} value={supplier._id}>
                {supplier.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="ordered">Ordered</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </Select>
          <Select
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Any payment</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
          </Select>
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="w-auto"
            aria-label="From date"
          />
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="w-auto"
            aria-label="To date"
          />
          {(search || supplierId || status || paymentStatus || from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setSupplierId('');
                setStatus('');
                setPaymentStatus('');
                setFrom('');
                setTo('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {listQuery.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-rose-600">{apiErrorMessage(listQuery.error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void listQuery.refetch()}>
            Retry
          </Button>
        </Card>
      ) : listQuery.isLoading ? (
        <Card className="p-4">
          <TableSkeleton rows={8} />
        </Card>
      ) : purchases.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShoppingCart className="h-6 w-6" />}
            title="No purchases found"
            description="Create a purchase order to restock inventory and track supplier balances."
            action={
              canWrite ? (
                <Button variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                  New purchase
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Purchase</th>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Balance</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {purchases.map((purchase) => (
                  <tr
                    key={purchase._id}
                    className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                    onClick={() => setDetailId(purchase._id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 dark:text-white">{purchase.purchaseNumber}</p>
                      {purchase.expectedAt && (
                        <p className="text-xs text-ink-400">Expected {formatDate(purchase.expectedAt)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-800 dark:text-ink-100">{supplierName(purchase)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      {formatDate(purchase.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(purchase.items?.length ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-medium">{money.format(purchase.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={purchase.balance > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink-400'}>
                        {money.format(purchase.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(purchase.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                        {purchase.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(purchase.paymentStatus ?? 'unpaid') as 'emerald' | 'amber' | 'rose' | 'slate'}>
                        {(purchase.paymentStatus ?? 'unpaid').replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${purchase.purchaseNumber}`}
                          onClick={() => setDetailId(purchase._id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canWrite && !purchase.stockReceived && purchase.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Receive ${purchase.purchaseNumber}`}
                            onClick={() => setReceiving(purchase)}
                          >
                            <PackageCheck className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {canWrite && purchase.balance > 0 && purchase.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Record payment for ${purchase.purchaseNumber}`}
                            onClick={() => openPayment(purchase)}
                          >
                            <Wallet className="h-4 w-4 text-gold-600" />
                          </Button>
                        )}
                        {canWrite && !purchase.stockReceived && purchase.amountPaid === 0 && purchase.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Cancel ${purchase.purchaseNumber}`}
                            onClick={() => setCancelling(purchase)}
                          >
                            <XCircle className="h-4 w-4 text-rose-500" />
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
              page={meta?.page ?? 1}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              onChange={setPage}
            />
          </div>
        </Card>
      )}

      {/* Create purchase */}
      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        title="New purchase"
        description="Order stock from a supplier. Receiving the purchase increases inventory."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              Create purchase
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier" required>
              <Select value={form.supplierId} onChange={(event) => setForm((current) => ({ ...current, supplierId: event.target.value }))}>
                <option value="">Choose supplier…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier._id} value={supplier._id}>
                    {supplier.name}
                    {supplier.company ? ` — ${supplier.company}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expected delivery">
              <Input
                type="date"
                value={form.expectedAt}
                onChange={(event) => setForm((current) => ({ ...current, expectedAt: event.target.value }))}
              />
            </Field>
            <Field label="Create as">
              <Select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'draft' | 'ordered' }))}
              >
                <option value="ordered">Ordered</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-700 dark:text-ink-200">Products</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Search products by name or SKU…"
                className="pl-9"
              />
              {productSearch && products.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lift dark:border-ink-700 dark:bg-ink-900">
                  {products.map((product) => (
                    <button
                      key={product._id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800"
                      onClick={() => addProduct(product)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink-900 dark:text-white">{product.name}</span>
                        <span className="block text-xs text-ink-400">
                          {product.sku} · stock {product.stock} {product.unit}
                        </span>
                      </span>
                      <span className="text-xs text-ink-400">{money.format(product.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
              {productSearch && !productsQuery.isLoading && products.length === 0 && (
                <p className="mt-2 text-xs text-ink-400">No products match that search.</p>
              )}
            </div>

            {items.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-line dark:border-ink-800">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Unit cost</th>
                      <th className="px-3 py-2 text-right">Line total</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {items.map((item) => (
                      <tr key={item.productId}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink-900 dark:text-white">{item.name}</p>
                          <p className="text-xs text-ink-400">
                            {item.sku} · {item.unit} · stock {item.stock}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(event) => updateItem(item.productId, { quantity: Number(event.target.value) })}
                            className="h-9 w-20"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unitCost}
                            onChange={(event) => updateItem(item.productId, { unitCost: Number(event.target.value) })}
                            className="h-9 w-28"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {money.format(item.quantity * item.unitCost)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => removeItem(item.productId)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tax / additional costs">
              <Input type="number" min={0} step="0.01" value={taxTotal} onChange={(event) => setTaxTotal(event.target.value)} />
            </Field>
            <div className="space-y-1 rounded-lg bg-ink-50 p-3 text-sm dark:bg-ink-900">
              <div className="flex justify-between text-ink-500 dark:text-ink-300">
                <span>Subtotal</span>
                <span>{money.format(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-ink-500 dark:text-ink-300">
                <span>Tax</span>
                <span>{money.format(totals.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold text-ink-900 dark:border-ink-800 dark:text-white">
                <span>Total</span>
                <span>{money.format(totals.total)}</span>
              </div>
            </div>
          </div>

          <Field label="Notes">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              rows={2}
              placeholder="Delivery instructions, invoice reference…"
            />
          </Field>
        </div>
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? detail.purchaseNumber : 'Purchase'}
        description={detail ? `${supplierName(detail)} · ${formatDate(detail.createdAt)}` : undefined}
        size="xl"
        footer={
          <>
            {detail && canWrite && !detail.stockReceived && detail.status !== 'cancelled' && (
              <Button variant="outline" icon={<PackageCheck className="h-4 w-4" />} onClick={() => setReceiving(detail)}>
                Receive stock
              </Button>
            )}
            {detail && canWrite && detail.balance > 0 && detail.status !== 'cancelled' && (
              <Button variant="secondary" icon={<Wallet className="h-4 w-4" />} onClick={() => openPayment(detail)}>
                Record payment
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </>
        }
      >
        {detailQuery.isLoading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading purchase…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Total</p>
                <p className="mt-1 font-display text-xl font-semibold">{money.format(detail.total)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Paid</p>
                <p className="mt-1 font-display text-xl font-semibold">{money.format(detail.amountPaid)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Balance</p>
                <p className="mt-1 font-display text-xl font-semibold text-rose-600 dark:text-rose-400">
                  {money.format(detail.balance)}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Status</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={statusTone(detail.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>{detail.status}</Badge>
                  <Badge tone={statusTone(detail.paymentStatus ?? 'unpaid') as 'emerald' | 'amber' | 'rose' | 'slate'}>
                    {(detail.paymentStatus ?? 'unpaid').replace(/_/g, ' ')}
                  </Badge>
                </div>
              </Card>
            </div>

            {detail.stockReceived && (
              <Alert tone="success" title="Stock received">
                Inventory was updated when this purchase was received{detail.receivedAt ? ` on ${formatDate(detail.receivedAt)}` : ''}.
              </Alert>
            )}

            <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    <th className="px-3 py-2 text-right">Line total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {detail.items.map((item) => (
                    <tr key={`${item.product}-${item.sku}`}>
                      <td className="px-3 py-2 font-medium">{item.name}</td>
                      <td className="px-3 py-2 text-xs text-ink-400">{item.sku}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>
                      <td className="px-3 py-2 text-right">{money.format(item.unitCost)}</td>
                      <td className="px-3 py-2 text-right font-medium">{money.format(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Summary</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-ink-500 dark:text-ink-300">
                    <span>Subtotal</span>
                    <span>{money.format(detail.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-ink-500 dark:text-ink-300">
                    <span>Tax / additional</span>
                    <span>{money.format(detail.taxTotal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold dark:border-ink-800">
                    <span>Total</span>
                    <span>{money.format(detail.total)}</span>
                  </div>
                </div>
              </Card>
              <Card className="p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Details</p>
                <p className="text-ink-500 dark:text-ink-300">Supplier: {supplierName(detail)}</p>
                {detail.expectedAt && (
                  <p className="text-ink-500 dark:text-ink-300">Expected: {formatDate(detail.expectedAt)}</p>
                )}
                {detail.notes && <p className="mt-1 text-ink-500 dark:text-ink-300">{detail.notes}</p>}
                {detail.createdBy && (
                  <p className="mt-1 text-xs text-ink-400">
                    Created by {typeof detail.createdBy === 'string' ? detail.createdBy : detail.createdBy.name}
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment */}
      <Modal
        open={Boolean(paying)}
        onClose={() => {
          if (!payLoading) setPaying(null);
        }}
        title="Record supplier payment"
        description={paying ? `${paying.purchaseNumber} · balance ${money.format(paying.balance)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setPaying(null)} disabled={payLoading}>
              Cancel
            </Button>
            <Button onClick={() => void submitPayment()} loading={payLoading}>
              Record payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Amount" required>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={payment.amount}
              onChange={(event) => setPayment((current) => ({ ...current, amount: event.target.value }))}
            />
          </Field>
          <Field label="Method">
            <Select
              value={payment.method}
              onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value }))}
            >
              {paymentMethods.map((method) => (
                <option key={method.key} value={method.key}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" hint="Transaction ID for mobile money or bank payments">
            <Input
              value={payment.reference}
              onChange={(event) => setPayment((current) => ({ ...current, reference: event.target.value }))}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={payment.notes}
              onChange={(event) => setPayment((current) => ({ ...current, notes: event.target.value }))}
              rows={2}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(receiving)}
        onClose={() => setReceiving(null)}
        onConfirm={() => void receive()}
        title="Receive stock"
        description={`Receive all items for ${receiving?.purchaseNumber ?? 'this purchase'}? Inventory will increase immediately and this cannot be undone.`}
        confirmLabel="Receive stock"
        loading={receiveLoading}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        onConfirm={() => void cancel()}
        title="Cancel purchase"
        description={`Cancel ${cancelling?.purchaseNumber ?? 'this purchase'}? This is only possible before stock is received and before any payment is recorded.`}
        confirmLabel="Cancel purchase"
        danger
        loading={cancelLoading}
      />

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Receiving a purchase records inventory movements and updates the supplier ledger automatically.
      </div>
    </div>
  );
}
