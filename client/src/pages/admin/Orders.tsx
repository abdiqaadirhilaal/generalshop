import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileText,
  MessageSquarePlus,
  PackageCheck,
  Receipt,
  Search,
  Truck,
  Wallet,
  X,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useSettings, useToast } from '@/context/AppProviders';
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
  Select,
  TableSkeleton,
  Tabs,
  Textarea,
} from '@/components/ui';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatDate,
  formatNumber,
  statusTone,
  timeAgo,
} from '@/lib/format';
import type { Order, OrderStatus, Page, PaymentRecord } from '@/types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'processing', label: 'Processing' },
  { value: 'ready_for_delivery', label: 'Ready' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returned', label: 'Returned' },
];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'confirmed',
  confirmed: 'processing',
  processing: 'ready_for_delivery',
  ready_for_delivery: 'shipped',
  shipped: 'delivered',
};

type OrderDetail = Order & { payments?: PaymentRecord[]; customer?: { _id: string; name: string; phone: string; customerNumber?: string; totalOrders?: number; totalSpending?: number } | string };

function customerName(order: Order) {
  if (typeof order.customer === 'object' && order.customer) return order.customer.name;
  return order.shippingAddress?.fullName ?? 'Guest';
}

export default function Orders() {
  const { success, error } = useToast();
  const { settings } = useSettings();
  const money = useMoney();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>('pending');
  const [statusNote, setStatusNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [recording, setRecording] = useState(false);

  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const params = {
    page,
    limit: 20,
    status: status || undefined,
    paymentStatus: paymentStatus || undefined,
    q: debouncedSearch || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['admin-orders', params],
    queryFn: () => api.page<Order>(`/orders${queryString(params)}`),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-order', detailId],
    queryFn: () => api.get<OrderDetail>(`/orders/${detailId}`),
    enabled: Boolean(detailId),
  });

  const orders = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta;
  const counts = meta?.counts ?? {};
  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setStatusDraft(detail.status);
    setStatusNote('');
    setPaymentAmount(detail.paymentStatus === 'paid' ? '' : String(Math.max(detail.total - (detail.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0), 0).toFixed(2)));
    setPaymentMethod(detail.paymentMethod || 'cash');
    setPaymentReference('');
    setPaymentNote('');
    setNote('');
  }, [detail]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-order', detailId] });
    void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const changeStatus = async () => {
    if (!detail) return;
    setUpdating(true);
    try {
      await api.patch(`/orders/${detail._id}/status`, { status: statusDraft, note: statusNote.trim() || undefined });
      success(`Order moved to ${ORDER_STATUS_LABELS[statusDraft] ?? statusDraft}.`);
      refresh();
    } catch (updateError) {
      error(updateError);
    } finally {
      setUpdating(false);
    }
  };

  const recordPayment = async () => {
    if (!detail) return;
    if (!paymentAmount || Number(paymentAmount) <= 0) return error('Enter a payment amount greater than zero.');
    setRecording(true);
    try {
      await api.post(`/orders/${detail._id}/payments`, {
        amount: Number(paymentAmount),
        method: paymentMethod,
        reference: paymentReference.trim() || undefined,
        notes: paymentNote.trim() || undefined,
      });
      success('Payment recorded.');
      refresh();
    } catch (paymentError) {
      error(paymentError);
    } finally {
      setRecording(false);
    }
  };

  const addNote = async () => {
    if (!detail || !note.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/orders/${detail._id}/notes`, { text: note.trim() });
      success('Internal note added.');
      setNote('');
      refresh();
    } catch (noteError) {
      error(noteError);
    } finally {
      setAddingNote(false);
    }
  };

  const paymentsTotal = (detail?.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0);
  const next = detail ? NEXT_STATUS[detail.status] : undefined;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Sales"
        title="Orders"
        description="Track online orders from placement to delivery, manage payments and keep customers informed."
        action={
          <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void downloadFile(`/orders/export${queryString({ status })}`, 'hilaal-orders.csv').catch(error)}>
            Export CSV
          </Button>
        }
      />

      <Tabs
        tabs={STATUS_TABS.map((tab) => ({ ...tab, count: tab.value ? counts[tab.value] : undefined }))}
        value={status}
        onChange={(value) => { setStatus(value); setPage(1); }}
        className="mb-3"
      />

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Order number, name or phone"
              className="pl-9"
            />
          </div>
          <Select value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPage(1); }} className="w-auto">
            <option value="">Any payment</option>
            {['unpaid', 'partial', 'paid', 'refunded'].map((value) => (
              <option key={value} value={value}>{PAYMENT_STATUS_LABELS[value] ?? value}</option>
            ))}
          </Select>
          <Input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="w-auto" aria-label="From date" />
          <Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="w-auto" aria-label="To date" />
          {(search || paymentStatus || from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setPaymentStatus(''); setFrom(''); setTo(''); setPage(1); }} icon={<X className="h-3.5 w-3.5" />}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {listQuery.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-rose-600">{apiErrorMessage(listQuery.error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void listQuery.refetch()}>Retry</Button>
        </Card>
      ) : listQuery.isLoading ? (
        <Card className="p-4"><TableSkeleton rows={8} /></Card>
      ) : orders.length === 0 ? (
        <Card>
          <EmptyState icon={<PackageCheck className="h-6 w-6" />} title="No orders found" description="Orders placed on the storefront will appear here." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Placed</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {orders.map((order) => (
                  <tr key={order._id} className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40" onClick={() => setDetailId(order._id)}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 dark:text-white">{order.orderNumber}</p>
                      <p className="text-xs text-ink-400">{order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-800 dark:text-ink-100">{customerName(order)}</p>
                      <p className="text-xs text-ink-400">{order.shippingAddress?.phone}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      {formatDate(order.createdAt, true)}
                      <p className="text-[11px] text-ink-300">{timeAgo(order.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{money.format(order.total)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(order.paymentStatus) as 'emerald' | 'amber' | 'slate' | 'rose'}>
                        {PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(order.status) as 'emerald' | 'amber' | 'blue' | 'rose' | 'slate'}>
                        {ORDER_STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); setDetailId(order._id); }}>
                        Open
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
            <Pagination page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} total={meta?.total} onChange={setPage} />
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? `Order ${detail.orderNumber}` : 'Order details'}
        description={detail ? `${formatDate(detail.createdAt, true)} · ${detail.items.length} items` : undefined}
        size="xl"
        footer={
          <>
            {detail && (
              <Button
                variant="outline"
                icon={<Download className="h-4 w-4" />}
                onClick={() => void downloadFile(`/orders/${detail._id}/invoice`, `${detail.orderNumber}.pdf`).catch(error)}
              >
                Invoice PDF
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>Close</Button>
          </>
        }
      >
        {detailQuery.isLoading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading order…</div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone(detail.status) as 'emerald' | 'amber' | 'blue' | 'rose' | 'slate'}>
                {ORDER_STATUS_LABELS[detail.status] ?? detail.status}
              </Badge>
              <Badge tone={statusTone(detail.paymentStatus) as 'emerald' | 'amber' | 'slate' | 'rose'}>
                {PAYMENT_STATUS_LABELS[detail.paymentStatus] ?? detail.paymentStatus}
              </Badge>
              <Badge tone="slate">{detail.paymentMethod}</Badge>
              {detail.cancelReason && <span className="text-xs text-rose-600">Reason: {detail.cancelReason}</span>}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Shipping</p>
                <p className="font-medium text-ink-900 dark:text-white">{detail.shippingAddress.fullName}</p>
                <p className="text-sm text-ink-500 dark:text-ink-300">{detail.shippingAddress.phone}</p>
                <p className="text-sm text-ink-500 dark:text-ink-300">{detail.shippingAddress.address}, {detail.shippingAddress.city}</p>
                {detail.shippingAddress.notes && <p className="mt-1 text-xs text-ink-400">Note: {detail.shippingAddress.notes}</p>}
                {detail.guestEmail && <p className="mt-1 text-xs text-ink-400">Guest email: {detail.guestEmail}</p>}
              </Card>
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Totals</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-ink-500 dark:text-ink-300">Subtotal</span><span>{money.format(detail.subtotal)}</span></div>
                  {detail.discountTotal > 0 && <div className="flex justify-between text-rose-600"><span>Discount</span><span>-{money.format(detail.discountTotal)}</span></div>}
                  {detail.taxTotal > 0 && <div className="flex justify-between"><span className="text-ink-500 dark:text-ink-300">Tax</span><span>{money.format(detail.taxTotal)}</span></div>}
                  {detail.deliveryFee > 0 && <div className="flex justify-between"><span className="text-ink-500 dark:text-ink-300">Delivery</span><span>{money.format(detail.deliveryFee)}</span></div>}
                  <div className="flex justify-between border-t border-line pt-1 font-semibold dark:border-ink-800"><span>Total</span><span>{money.format(detail.total)}</span></div>
                  <div className="flex justify-between text-xs text-ink-400"><span>Paid</span><span>{money.format(paymentsTotal)}</span></div>
                  <div className="flex justify-between text-xs text-ink-400"><span>Balance</span><span>{money.format(Math.max(detail.total - paymentsTotal, 0))}</span></div>
                </div>
              </Card>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Items</p>
              <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {detail.items.map((item, index) => (
                      <tr key={`${item.sku}-${index}`}>
                        <td className="px-3 py-2">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-xs text-ink-400">{item.sku}{item.variation ? ` · ${item.variation}` : ''}</p>
                        </td>
                        <td className="px-3 py-2 text-right">{formatNumber(item.quantity)} {item.unit}</td>
                        <td className="px-3 py-2 text-right">{money.format(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium">{money.format(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <Truck className="h-3.5 w-3.5" /> Update status
                </p>
                <div className="space-y-2">
                  {next && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      loading={updating && statusDraft === next}
                      onClick={() => { setStatusDraft(next); }}
                    >
                      Next: {ORDER_STATUS_LABELS[next]}
                    </Button>
                  )}
                  <Select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value as OrderStatus)}>
                    {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Select>
                  <Input value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Optional note for the customer timeline" />
                  <Button size="sm" className="w-full" loading={updating} onClick={() => void changeStatus()}>
                    Save status
                  </Button>
                  <p className="text-[11px] text-ink-400">Stock is deducted when an order is confirmed and restored if it is cancelled or returned.</p>
                </div>
              </Card>

              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <Wallet className="h-3.5 w-3.5" /> Record payment
                </p>
                <div className="space-y-2">
                  <Input type="number" min="0" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount" />
                  <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                    {(settings?.paymentMethods ?? []).map((method) => (
                      <option key={method.key} value={method.key}>{method.label}</option>
                    ))}
                  </Select>
                  <Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Reference / transaction ID" />
                  <Input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Optional note" />
                  <Button size="sm" className="w-full" loading={recording} onClick={() => void recordPayment()}>Record payment</Button>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <Receipt className="h-3.5 w-3.5" /> Payments
                </p>
                {(detail.payments ?? []).length === 0 ? (
                  <p className="text-xs text-ink-400">No payments recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.payments ?? []).map((payment) => (
                      <div key={payment._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-900">
                        <div>
                          <p className="font-medium capitalize text-ink-800 dark:text-ink-100">{payment.method}</p>
                          <p className="text-ink-400">{payment.paymentNumber} · {formatDate(payment.paidAt, true)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{money.format(payment.amount)}</p>
                          <Badge tone={statusTone(payment.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>{payment.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <MessageSquarePlus className="h-3.5 w-3.5" /> Internal notes
                </p>
                <div className="space-y-2">
                  <Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} placeholder="Visible to staff only" />
                  <Button size="sm" variant="outline" loading={addingNote} onClick={() => void addNote()}>Add note</Button>
                  {(detail.internalNotes ?? []).length > 0 && (
                    <div className="mt-2 space-y-2">
                      {(detail.internalNotes ?? []).map((item, index) => (
                        <div key={index} className="rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-900">
                          <p className="text-ink-700 dark:text-ink-200">{item.text}</p>
                          <p className="mt-0.5 text-ink-400">{item.byName} · {formatDate(item.at, true)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <FileText className="h-3.5 w-3.5" /> Status history
              </p>
              <div className="space-y-2">
                {detail.statusHistory.map((entry, index) => (
                  <div key={index} className="flex gap-3 text-xs">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />
                    <div>
                      <p className="font-medium text-ink-800 dark:text-ink-100">{ORDER_STATUS_LABELS[entry.status] ?? entry.status}</p>
                      <p className="text-ink-400">{formatDate(entry.at, true)}{entry.byName ? ` · ${entry.byName}` : ''}</p>
                      {entry.note && <p className="text-ink-500 dark:text-ink-300">{entry.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {detail.status !== 'cancelled' && detail.status !== 'returned' && (
              <Alert tone="info">
                To cancel or refund this order, set the status to Cancelled (before delivery) or process a return from the Returns page.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
