import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  History,
  Minus,
  Plus,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
  Trash2,
  UserPlus,
  UserRound,
  X,
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
  Tabs,
  Textarea,
} from '@/components/ui';
import { formatDate, formatNumber, statusTone } from '@/lib/format';
import type { Customer, Page, Product, Sale } from '@/types';

interface CartLine {
  product: Product;
  quantity: number;
  variation?: string;
}

interface PaymentRow {
  method: string;
  amount: string;
  reference: string;
}

function priceFor(line: CartLine) {
  const delta = line.product.variations?.find((variation) => variation.label === line.variation)?.priceDelta ?? 0;
  return line.product.price + delta;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export default function POS() {
  const { has } = useAuth();
  const { settings } = useSettings();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('terminal');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [category, setCategory] = useState('');

  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState('');
  const [note, setNote] = useState('');
  const [loyaltyPoints, setLoyaltyPoints] = useState('');

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const debouncedCustomerSearch = useDebounced(customerSearch);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '' });
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  const [payments, setPayments] = useState<PaymentRow[]>([{ method: 'cash', amount: '', reference: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [receipt, setReceipt] = useState<Sale | null>(null);

  const [historyStatus, setHistoryStatus] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const debouncedHistorySearch = useDebounced(historySearch);
  const [historyPage, setHistoryPage] = useState(1);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  const canDiscount = has('pos:discount');
  const canVoid = has('orders:write');
  const methods = (settings?.paymentMethods ?? []).filter((method) => method.enabled);

  const productsQuery = useQuery({
    queryKey: ['pos-products', debouncedSearch, category],
    queryFn: () =>
      api.get<Product[]>(
        `/pos/products${queryString({ q: debouncedSearch || undefined, category: category || undefined })}`
      ),
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<{ _id: string; name: string }[]>('/admin/catalog/categories/admin'),
  });

  const customerQuery = useQuery({
    queryKey: ['pos-customers', debouncedCustomerSearch],
    queryFn: () => api.page<Customer>(`/customers${queryString({ q: debouncedCustomerSearch, limit: 6 })}`),
    enabled: debouncedCustomerSearch.trim().length > 1,
  });

  const historyParams = {
    page: historyPage,
    limit: 15,
    status: historyStatus || undefined,
    q: debouncedHistorySearch || undefined,
  };
  const historyQuery = useQuery({
    queryKey: ['pos-sales', historyParams],
    queryFn: () => api.page<Sale>(`/pos/sales${queryString(historyParams)}`),
    enabled: tab === 'history',
  });

  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const history = historyQuery.data?.items ?? [];
  const historyMeta = historyQuery.data?.meta;

  const subtotal = useMemo(() => round2(lines.reduce((sum, line) => sum + priceFor(line) * line.quantity, 0)), [lines]);
  const discountValue = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const taxRate = settings?.taxEnabled ? settings.taxRate : 0;
  const taxTotal = round2(((subtotal - discountValue) * taxRate) / 100);
  const total = round2(subtotal - discountValue + taxTotal);
  const redeemPoints = customer ? Math.max(0, Math.floor(Number(loyaltyPoints) || 0)) : 0;
  const redeemValue = settings?.loyalty?.redeemValue ?? 0;
  const loyaltyDiscount = round2(Math.min(redeemPoints * redeemValue, total));
  const payable = round2(total - loyaltyDiscount);
  const tendered = round2(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0));
  const change = round2(Math.max(tendered - payable, 0));
  const remaining = round2(Math.max(payable - tendered, 0));

  useEffect(() => {
    if (methods.length && !methods.some((method) => method.key === payments[0]?.method)) {
      setPayments([{ method: methods[0].key, amount: '', reference: '' }]);
    }
  }, [methods, payments]);

  const addProduct = (product: Product, variation?: string) => {
    setLines((current) => {
      const index = current.findIndex((line) => line.product._id === product._id && line.variation === variation);
      if (index >= 0) {
        const next = [...current];
        const max = product.stock > 0 ? product.stock : Infinity;
        next[index] = { ...next[index], quantity: Math.min(next[index].quantity + 1, max) };
        return next;
      }
      return [...current, { product, quantity: 1, variation }];
    });
  };

  const setQuantity = (productId: string, variation: string | undefined, quantity: number) => {
    setLines((current) =>
      current
        .map((line) => {
          if (line.product._id !== productId || line.variation !== variation) return line;
          const max = line.product.stock > 0 ? line.product.stock : Infinity;
          return { ...line, quantity: Math.max(1, Math.min(quantity, max)) };
        })
        .filter((line) => line.quantity > 0)
    );
  };

  const removeLine = (productId: string, variation?: string) => {
    setLines((current) => current.filter((line) => !(line.product._id === productId && line.variation === variation)));
  };

  const clearSale = () => {
    setLines([]);
    setDiscount('');
    setNote('');
    setLoyaltyPoints('');
    setCustomer(null);
    setCustomerSearch('');
    setPayments([{ method: methods[0]?.key ?? 'cash', amount: '', reference: '' }]);
    setCheckoutError('');
  };

  const fillExact = (index: number) => {
    setPayments((current) =>
      current.map((payment, position) =>
        position === index ? { ...payment, amount: String(Math.max(payable - (tendered - (Number(payment.amount) || 0)), 0).toFixed(2)) } : payment
      )
    );
  };

  const createCustomer = async () => {
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) return error('Name and phone are required.');
    setCreatingCustomer(true);
    try {
      const created = await api.post<Customer>('/pos/customers', {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
        email: newCustomer.email.trim() || undefined,
      });
      setCustomer(created);
      setNewCustomer({ name: '', phone: '', email: '' });
      setCustomerOpen(false);
      success('Customer added to the sale.');
    } catch (createError) {
      error(createError);
    } finally {
      setCreatingCustomer(false);
    }
  };

  const checkout = async () => {
    setCheckoutError('');
    if (!lines.length) return setCheckoutError('Add at least one product to the sale.');
    if (discountValue > 0 && !canDiscount) return setCheckoutError('You do not have permission to apply discounts.');
    if (!payments.length) return setCheckoutError('Record at least one payment.');
    for (const payment of payments) {
      if (!payment.method) return setCheckoutError('Choose a payment method for every row.');
      if (!(Number(payment.amount) > 0)) return setCheckoutError('Every payment amount must be greater than zero.');
      const config = methods.find((method) => method.key === payment.method);
      if (config?.requiresReference && !payment.reference.trim()) {
        return setCheckoutError(`${config.label} requires a transaction reference.`);
      }
    }
    if (remaining > 0.01) return setCheckoutError(`Payments are short by ${money.format(remaining)}.`);

    setSubmitting(true);
    try {
      const sale = await api.post<Sale>('/pos/sales', {
        items: lines.map((line) => ({
          productId: line.product._id,
          quantity: line.quantity,
          variation: line.variation,
        })),
        payments: payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
          reference: payment.reference.trim() || undefined,
        })),
        customerId: customer?._id,
        discountTotal: discountValue,
        note: note.trim() || undefined,
        loyaltyPointsToRedeem: redeemPoints || undefined,
      });
      setReceipt(sale);
      success(`Sale ${sale.saleNumber} completed.`);
      clearSale();
      void queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-sales'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-valuation'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    } catch (checkoutFailure) {
      setCheckoutError(apiErrorMessage(checkoutFailure));
    } finally {
      setSubmitting(false);
    }
  };

  const voidSale = async () => {
    if (!voiding) return;
    setVoidLoading(true);
    try {
      await api.post(`/pos/sales/${voiding._id}/void`);
      success(`Sale ${voiding.saleNumber} voided. Stock has been restored.`);
      setVoiding(null);
      void queryClient.invalidateQueries({ queryKey: ['pos-sales'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    } catch (voidError) {
      error(voidError);
    } finally {
      setVoidLoading(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Sales"
        title="Point of sale"
        description="Ring up walk-in customers, take split payments and print receipts. Stock and the ledger update instantly."
        action={
          <Tabs
            tabs={[
              { value: 'terminal', label: 'Terminal' },
              { value: 'history', label: 'Sales history' },
            ]}
            value={tab}
            onChange={setTab}
          />
        }
      />

      {tab === 'terminal' ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
          <div className="space-y-3">
            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search products by name, SKU or barcode"
                  className="min-w-0 flex-1"
                />
                <Select value={category} onChange={(event) => setCategory(event.target.value)} className="w-auto">
                  <option value="">All categories</option>
                  {categories.map((item) => (
                    <option key={item._id} value={item._id}>{item.name}</option>
                  ))}
                </Select>
              </div>
            </Card>

            {productsQuery.isError ? (
              <Card className="p-6 text-sm text-rose-600">{apiErrorMessage(productsQuery.error)}</Card>
            ) : productsQuery.isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 9 }).map((_, index) => (
                  <Card key={index} className="h-32 animate-pulse bg-ink-100/60 dark:bg-ink-800/40">
                    {null}
                  </Card>
                ))}
              </div>
            ) : products.length === 0 ? (
              <Card>
                <EmptyState icon={<Search className="h-6 w-6" />} title="No products found" description="Try another search term or category." />
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => {
                  const out = product.stock <= 0;
                  return (
                    <button
                      key={product._id}
                      type="button"
                      disabled={out}
                      onClick={() => addProduct(product)}
                      className="surface group flex flex-col overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="relative h-24 bg-ink-100 dark:bg-ink-800">
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-ink-300"><ShoppingCart className="h-6 w-6" /></div>
                        )}
                        <div className="absolute right-2 top-2">
                          <Badge tone={out ? 'rose' : product.stock <= product.minStockLevel ? 'amber' : 'emerald'}>
                            {out ? 'Out' : `${formatNumber(product.stock)} ${product.unit}`}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <p className="line-clamp-2 text-sm font-medium text-ink-900 dark:text-white">{product.name}</p>
                        <p className="mt-0.5 text-[11px] text-ink-400">{product.sku}</p>
                        <div className="mt-auto flex items-center justify-between pt-2">
                          <span className="font-semibold text-ink-900 dark:text-white">{money.format(product.price)}</span>
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-900 text-white group-hover:bg-gold group-hover:text-ink-950 dark:bg-gold dark:text-ink-950">
                            <Plus className="h-4 w-4" />
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Card className="flex h-fit flex-col p-4 xl:sticky xl:top-20">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900 dark:text-white">
                <ShoppingCart className="h-4 w-4" /> Current sale
              </h3>
              {lines.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearSale} icon={<Trash2 className="h-3.5 w-3.5" />}>Clear</Button>
              )}
            </div>

            <div className="mt-3">
              {customer ? (
                <div className="flex items-center justify-between rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-sm dark:border-gold-800 dark:bg-gold-900/20">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-gold-700 dark:text-gold-300" />
                    <div>
                      <p className="font-medium text-ink-900 dark:text-white">{customer.name}</p>
                      <p className="text-xs text-ink-400">{customer.phone} · {formatNumber(customer.loyaltyPoints)} pts</p>
                    </div>
                  </div>
                  <button onClick={() => setCustomer(null)} aria-label="Remove customer" className="text-ink-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={customerSearch}
                      onChange={(event) => setCustomerSearch(event.target.value)}
                      placeholder="Find customer by name or phone"
                    />
                    <Button variant="outline" size="icon" aria-label="New customer" onClick={() => setCustomerOpen(true)}>
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                  {customerQuery.data && customerQuery.data.items.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-line dark:border-ink-800">
                      {customerQuery.data.items.map((item) => (
                        <button
                          key={item._id}
                          onClick={() => { setCustomer(item); setCustomerSearch(''); }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-ink-50 dark:hover:bg-ink-800"
                        >
                          <span>
                            <span className="block font-medium text-ink-800 dark:text-ink-100">{item.name}</span>
                            <span className="text-ink-400">{item.phone}</span>
                          </span>
                          <span className="text-ink-400">{formatNumber(item.loyaltyPoints)} pts</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              {lines.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-ink-400 dark:border-ink-700">
                  Tap a product to start the sale.
                </div>
              ) : (
                lines.map((line) => (
                  <div key={`${line.product._id}-${line.variation ?? ''}`} className="rounded-lg border border-line p-2.5 dark:border-ink-800">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{line.product.name}</p>
                        <p className="text-[11px] text-ink-400">
                          {money.format(priceFor(line))} {line.variation ? `· ${line.variation}` : ''}
                        </p>
                      </div>
                      <button onClick={() => removeLine(line.product._id, line.variation)} aria-label="Remove line" className="text-ink-300 hover:text-rose-600">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {line.product.variations?.length > 0 && (
                      <Select
                        className="mt-1.5 h-8 text-xs"
                        value={line.variation ?? ''}
                        onChange={(event) => {
                          const nextVariation = event.target.value || undefined;
                          setLines((current) =>
                            current.map((item) =>
                              item.product._id === line.product._id && item.variation === line.variation
                                ? { ...item, variation: nextVariation }
                                : item
                            )
                          );
                        }}
                      >
                        <option value="">Standard</option>
                        {line.product.variations.map((variation) => (
                          <option key={variation.label} value={variation.label}>{variation.label}</option>
                        ))}
                      </Select>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-line dark:border-ink-700">
                        <button className="grid h-7 w-7 place-items-center text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setQuantity(line.product._id, line.variation, line.quantity - 1)} aria-label="Decrease quantity">
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-8 text-center text-xs font-medium">{line.quantity}</span>
                        <button className="grid h-7 w-7 place-items-center text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800" onClick={() => setQuantity(line.product._id, line.variation, line.quantity + 1)} aria-label="Increase quantity">
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-sm font-semibold">{money.format(priceFor(line) * line.quantity)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 space-y-2 border-t border-line pt-3 text-sm dark:border-ink-800">
              <div className="flex items-center justify-between text-ink-500 dark:text-ink-300">
                <span>Subtotal</span><span>{money.format(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-500 dark:text-ink-300">Discount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  disabled={!canDiscount}
                  onChange={(event) => setDiscount(event.target.value)}
                  className="h-8 w-24 text-right"
                  placeholder="0.00"
                />
              </div>
              {settings?.taxEnabled && (
                <div className="flex items-center justify-between text-ink-500 dark:text-ink-300">
                  <span>Tax ({settings.taxRate}%)</span><span>{money.format(taxTotal)}</span>
                </div>
              )}
              {customer && (settings?.loyalty?.enabled ?? false) && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink-500 dark:text-ink-300">Redeem points</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={loyaltyPoints}
                    onChange={(event) => setLoyaltyPoints(event.target.value)}
                    className="h-8 w-24 text-right"
                    placeholder="0"
                  />
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-600">
                  <span>Loyalty value</span><span>-{money.format(loyaltyDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2 font-display text-lg font-semibold dark:border-ink-800">
                <span>Total due</span><span>{money.format(payable)}</span>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Payments</p>
                <Button size="sm" variant="ghost" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setPayments([...payments, { method: methods[0]?.key ?? 'cash', amount: '', reference: '' }])}>
                  Split
                </Button>
              </div>
              {payments.map((payment, index) => {
                const config = methods.find((method) => method.key === payment.method);
                return (
                  <div key={index} className="rounded-lg border border-line p-2 dark:border-ink-800">
                    <div className="flex gap-2">
                      <Select
                        value={payment.method}
                        onChange={(event) =>
                          setPayments((current) =>
                            current.map((row, position) => (position === index ? { ...row, method: event.target.value, reference: '' } : row))
                          )
                        }
                        className="h-9 flex-1 text-xs"
                      >
                        {methods.map((method) => (
                          <option key={method.key} value={method.key}>{method.label}</option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payment.amount}
                        onChange={(event) =>
                          setPayments((current) => current.map((row, position) => (position === index ? { ...row, amount: event.target.value } : row)))
                        }
                        className="h-9 w-24 text-right text-xs"
                        placeholder="0.00"
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Fill exact amount" onClick={() => fillExact(index)}>
                        <Banknote className="h-4 w-4" />
                      </Button>
                      {payments.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Remove payment" onClick={() => setPayments(payments.filter((_, position) => position !== index))}>
                          <X className="h-4 w-4 text-rose-500" />
                        </Button>
                      )}
                    </div>
                    {config?.requiresReference && (
                      <Input
                        value={payment.reference}
                        onChange={(event) =>
                          setPayments((current) => current.map((row, position) => (position === index ? { ...row, reference: event.target.value } : row)))
                        }
                        className="mt-2 h-8 text-xs"
                        placeholder="Transaction reference"
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex justify-between text-xs text-ink-400">
                <span>Tendered {money.format(tendered)}</span>
                {change > 0 ? <span className="text-emerald-600">Change {money.format(change)}</span> : <span>Due {money.format(remaining)}</span>}
              </div>
            </div>

            <div className="mt-3">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Sale note (optional)" />
            </div>

            {checkoutError && <div className="mt-3"><Alert tone="danger">{checkoutError}</Alert></div>}

            <Button
              className="mt-3 w-full"
              size="lg"
              loading={submitting}
              disabled={!lines.length}
              icon={<CheckCircle2 className="h-4 w-4" />}
              onClick={() => void checkout()}
            >
              Complete sale · {money.format(payable)}
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <Card className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={historySearch} onChange={(value) => { setHistorySearch(value); setHistoryPage(1); }} placeholder="Search sale or receipt number" className="w-full sm:w-64" />
              <Select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setHistoryPage(1); }} className="w-auto">
                <option value="">All statuses</option>
                {['completed', 'voided', 'refunded', 'partially_refunded'].map((value) => (
                  <option key={value} value={value}>{value.replace('_', ' ')}</option>
                ))}
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                icon={<History className="h-4 w-4" />}
                onClick={() => void downloadFile('/pos/sales/export', 'hilaal-sales.csv').catch(error)}
              >
                Export sales
              </Button>
            </div>
          </Card>

          {historyQuery.isError ? (
            <Card className="p-6 text-sm text-rose-600">{apiErrorMessage(historyQuery.error)}</Card>
          ) : historyQuery.isLoading ? (
            <Card className="p-6 text-center text-sm text-ink-400">Loading sales…</Card>
          ) : history.length === 0 ? (
            <Card>
              <EmptyState icon={<Receipt className="h-6 w-6" />} title="No sales yet" description="Completed POS sales will appear here with receipts." />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Sale</th>
                      <th className="px-4 py-2.5">Cashier</th>
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5 text-right">Items</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {history.map((sale) => (
                      <tr key={sale._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900 dark:text-white">{sale.saleNumber}</p>
                          <p className="text-xs text-ink-400">{sale.receiptNumber}</p>
                        </td>
                        <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{sale.cashierName}</td>
                        <td className="px-4 py-3 text-ink-500 dark:text-ink-300">
                          {typeof sale.customer === 'object' && sale.customer ? sale.customer.name : 'Walk-in'}
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(sale.createdAt, true)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(sale.items.reduce((sum, item) => sum + item.quantity, 0))}</td>
                        <td className="px-4 py-3 text-right font-medium">{money.format(sale.total)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={statusTone(sale.status) as 'emerald' | 'rose' | 'slate' | 'amber'}>{sale.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              icon={<Printer className="h-3.5 w-3.5" />}
                              onClick={() => void downloadFile(`/pos/sales/${sale._id}/receipt`, `${sale.receiptNumber}.pdf`).catch(error)}
                            >
                              Receipt
                            </Button>
                            {canVoid && sale.status === 'completed' && (
                              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setVoiding(sale)}>Void</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
                <Pagination page={historyMeta?.page ?? 1} totalPages={historyMeta?.totalPages ?? 1} total={historyMeta?.total} onChange={setHistoryPage} />
              </div>
            </Card>
          )}
        </>
      )}

      <Modal
        open={customerOpen}
        onClose={() => { if (!creatingCustomer) setCustomerOpen(false); }}
        title="New customer"
        description="Create a customer record for loyalty points and purchase history."
        footer={
          <>
            <Button variant="outline" onClick={() => setCustomerOpen(false)} disabled={creatingCustomer}>Cancel</Button>
            <Button onClick={() => void createCustomer()} loading={creatingCustomer}>Create customer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Full name" required>
            <Input value={newCustomer.name} onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })} />
          </Field>
          <Field label="Phone" required>
            <Input value={newCustomer.phone} onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={newCustomer.email} onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Sale complete"
        description={receipt ? `${receipt.saleNumber} · ${receipt.receiptNumber}` : undefined}
        footer={
          <>
            {receipt && (
              <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => void downloadFile(`/pos/sales/${receipt._id}/receipt`, `${receipt.receiptNumber}.pdf`).catch(error)}>
                Download receipt
              </Button>
            )}
            <Button onClick={() => setReceipt(null)}>New sale</Button>
          </>
        }
      >
        {receipt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line p-4 text-center dark:border-ink-800">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">{money.format(receipt.total)}</p>
              <p className="text-xs text-ink-400">Paid via {receipt.payments.map((payment) => payment.method).join(', ')}</p>
              {receipt.changeGiven > 0 && <p className="mt-1 text-sm text-emerald-600">Change given: {money.format(receipt.changeGiven)}</p>}
            </div>
            <div className="space-y-1 text-sm">
              {receipt.items.map((item, index) => (
                <div key={index} className="flex justify-between">
                  <span className="text-ink-600 dark:text-ink-300">{item.quantity} × {item.name}</span>
                  <span>{money.format(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-line pt-2 text-sm dark:border-ink-800">
              <div className="flex justify-between text-ink-500 dark:text-ink-300"><span>Subtotal</span><span>{money.format(receipt.subtotal)}</span></div>
              {receipt.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount</span><span>-{money.format(receipt.discountTotal)}</span></div>}
              {receipt.taxTotal > 0 && <div className="flex justify-between text-ink-500 dark:text-ink-300"><span>Tax</span><span>{money.format(receipt.taxTotal)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Total</span><span>{money.format(receipt.total)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        onConfirm={() => void voidSale()}
        title="Void sale"
        description={`Void ${voiding?.saleNumber ?? 'this sale'}? Stock will be restored and the ledger reversed. This cannot be undone.`}
        confirmLabel="Void sale"
        danger
        loading={voidLoading}
      />
    </div>
  );
}
