import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  Eye,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  Undo2,
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
  Checkbox,
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
import type { Order, Page, Sale } from '@/types';

type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded';

interface ReturnItem {
  product: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  restock: boolean;
  condition?: string;
}

interface ReturnRow {
  _id: string;
  returnNumber: string;
  type: 'order' | 'sale';
  order?: { _id: string; orderNumber: string; total: number; status: string } | string;
  sale?: { _id: string; saleNumber: string; total: number; status: string } | string;
  customer?: { name: string; phone: string } | string;
  customerName: string;
  items: ReturnItem[];
  reason: string;
  status: ReturnStatus;
  refundAmount: number;
  refundMethod?: string;
  restocked: boolean;
  notes?: string;
  processedByName?: string;
  history?: { status: string; at: string; byName?: string; note?: string }[];
  createdAt: string;
}

interface DraftItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  available: number;
  unitPrice: number;
  restock: boolean;
  condition: string;
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'requested', label: 'Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'received', label: 'Received' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'rejected', label: 'Rejected' },
];

function referenceLabel(record: ReturnRow) {
  if (typeof record.order === 'object' && record.order) return record.order.orderNumber;
  if (typeof record.sale === 'object' && record.sale) return record.sale.saleNumber;
  return '—';
}

export default function Returns() {
  const { has } = useAuth();
  const { settings } = useSettings();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('returns:write');
  const canUsePos = has('pos:use');

  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [page, setPage] = useState(1);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<'order' | 'sale'>('order');
  const [referenceSearch, setReferenceSearch] = useState('');
  const debouncedReference = useDebounced(referenceSearch, 300);
  const [selectedReference, setSelectedReference] = useState<{ id: string; label: string; items: DraftItem[] } | null>(null);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [actioning, setActioning] = useState<{ record: ReturnRow; action: 'approve' | 'reject' | 'receive' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [refunding, setRefunding] = useState<ReturnRow | null>(null);
  const [refundForm, setRefundForm] = useState({ amount: '', method: 'cash', notes: '' });
  const [refundLoading, setRefundLoading] = useState(false);

  const params = {
    page,
    limit: 20,
    status: status || undefined,
    type: type || undefined,
    q: debouncedSearch || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['admin-returns', params],
    queryFn: () => api.page<ReturnRow>(`/returns${queryString(params)}`),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-return', detailId],
    queryFn: () => api.get<ReturnRow>(`/returns/${detailId}`),
    enabled: Boolean(detailId),
  });

  const orderSearchQuery = useQuery({
    queryKey: ['return-order-search', debouncedReference],
    queryFn: () => api.page<Order>(`/orders${queryString({ q: debouncedReference, limit: 8 })}`),
    enabled: createOpen && createType === 'order' && debouncedReference.trim().length > 0,
  });

  const saleSearchQuery = useQuery({
    queryKey: ['return-sale-search', debouncedReference],
    queryFn: () => api.page<Sale>(`/pos/sales${queryString({ q: debouncedReference, limit: 8 })}`),
    enabled: createOpen && createType === 'sale' && canUsePos && debouncedReference.trim().length > 0,
  });

  const records = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta;
  const detail = detailQuery.data;

  const paymentMethods = useMemo(() => {
    const configured = settings?.paymentMethods?.filter((method) => method.enabled) ?? [];
    if (configured.length > 0) return configured;
    return [
      { key: 'cash', label: 'Cash' },
      { key: 'evc_plus', label: 'EVC Plus' },
      { key: 'zaad', label: 'ZAAD' },
      { key: 'sahal', label: 'Sahal' },
      { key: 'edahab', label: 'eDahab' },
    ];
  }, [settings]);

  const draftTotal = draftItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  useEffect(() => {
    if (!createOpen) {
      setSelectedReference(null);
      setDraftItems([]);
      setReason('');
      setNotes('');
      setFormError('');
      setReferenceSearch('');
    }
  }, [createOpen]);

  useEffect(() => {
    setSelectedReference(null);
    setDraftItems([]);
    setReferenceSearch('');
  }, [createType]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-returns'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-return', detailId] });
  };

  const chooseOrder = (order: Order) => {
    setSelectedReference({ id: order._id, label: order.orderNumber, items: [] });
    setDraftItems(
      (order.items ?? []).map((item) => ({
        productId: item.product,
        name: item.name,
        sku: item.sku,
        quantity: 1,
        available: item.quantity,
        unitPrice: item.unitPrice,
        restock: true,
        condition: '',
      }))
    );
    setReferenceSearch('');
  };

  const chooseSale = (sale: Sale) => {
    setSelectedReference({ id: sale._id, label: sale.saleNumber, items: [] });
    setDraftItems(
      (sale.items ?? []).map((item) => ({
        productId: item.product,
        name: item.name,
        sku: item.sku,
        quantity: 1,
        available: item.quantity,
        unitPrice: item.unitPrice,
        restock: true,
        condition: '',
      }))
    );
    setReferenceSearch('');
  };

  const updateDraft = (productId: string, patch: Partial<DraftItem>) =>
    setDraftItems((current) => current.map((item) => (item.productId === productId ? { ...item, ...patch } : item)));

  const submitReturn = async () => {
    setFormError('');
    if (!selectedReference) return setFormError('Choose the order or sale being returned.');
    const items = draftItems.filter((item) => item.quantity > 0);
    if (items.length === 0) return setFormError('Select at least one item to return.');
    if (items.some((item) => item.quantity > item.available)) {
      return setFormError('A return quantity exceeds the quantity purchased.');
    }
    if (reason.trim().length < 3) return setFormError('Enter a reason for the return.');

    setSaving(true);
    try {
      const record = await api.post<ReturnRow>('/returns', {
        type: createType,
        referenceId: selectedReference.id,
        items: items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          restock: item.restock,
          condition: item.condition.trim() || undefined,
        })),
        reason: reason.trim(),
        notes: notes.trim() || undefined,
      });
      success(`Return ${record.returnNumber} created.`);
      setCreateOpen(false);
      refresh();
      setDetailId(record._id);
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async () => {
    if (!actioning) return;
    setActionLoading(true);
    try {
      await api.post(`/returns/${actioning.record._id}/${actioning.action}`);
      const labels = { approve: 'approved', reject: 'rejected', receive: 'received' } as const;
      success(`Return ${actioning.record.returnNumber} ${labels[actioning.action]}.`);
      setActioning(null);
      refresh();
    } catch (actionError) {
      error(actionError);
    } finally {
      setActionLoading(false);
    }
  };

  const openRefund = (record: ReturnRow) => {
    setRefunding(record);
    setRefundForm({
      amount: record.refundAmount ? record.refundAmount.toFixed(2) : '',
      method: paymentMethods[0]?.key ?? 'cash',
      notes: '',
    });
  };

  const submitRefund = async () => {
    if (!refunding) return;
    const amount = Number(refundForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return error('Enter a valid refund amount.');
    setRefundLoading(true);
    try {
      await api.post(`/returns/${refunding._id}/refund`, {
        amount,
        method: refundForm.method,
        notes: refundForm.notes.trim() || undefined,
      });
      success('Refund recorded and posted to the ledger.');
      setRefunding(null);
      refresh();
    } catch (refundError) {
      error(refundError);
    } finally {
      setRefundLoading(false);
    }
  };

  const requestedCount = records.filter((record) => record.status === 'requested').length;

  return (
    <div>
      <AdminPageHeader
        eyebrow="After-sales"
        title="Returns & refunds"
        description="Handle customer returns, restore stock and record refunds with a complete audit trail."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void downloadFile('/returns/export', 'hilaal-returns.csv').catch(error)}
            >
              Export CSV
            </Button>
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                New return
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Returns in view"
          value={formatNumber(meta?.total ?? 0)}
          hint="Matching the current filters"
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <StatCard
          label="Awaiting decision"
          value={formatNumber(requestedCount)}
          hint="Requested returns on this page"
          icon={<Undo2 className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Refund value on page"
          value={money.format(records.reduce((sum, record) => sum + record.refundAmount, 0))}
          hint="Total value of listed returns"
          icon={<Wallet className="h-4 w-4" />}
          tone="rose"
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
            placeholder="Search return number or customer"
            className="w-full sm:w-64"
          />
          <Select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Orders &amp; sales</option>
            <option value="order">Online orders</option>
            <option value="sale">POS sales</option>
          </Select>
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            {STATUS_TABS.map((tab) => (
              <option key={tab.value} value={tab.value}>
                {tab.label}
              </option>
            ))}
          </Select>
          {(search || type || status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setType('');
                setStatus('');
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
      ) : records.length === 0 ? (
        <Card>
          <EmptyState
            icon={<RotateCcw className="h-6 w-6" />}
            title="No returns found"
            description="Create a return from a delivered order or a completed POS sale."
            action={
              canWrite ? (
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                  New return
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Return</th>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Reason</th>
                  <th className="px-4 py-2.5 text-right">Items</th>
                  <th className="px-4 py-2.5 text-right">Refund</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {records.map((record) => (
                  <tr
                    key={record._id}
                    className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                    onClick={() => setDetailId(record._id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 dark:text-white">{record.returnNumber}</p>
                      <p className="text-xs capitalize text-ink-400">
                        {record.type} · {formatDate(record.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{referenceLabel(record)}</td>
                    <td className="px-4 py-3">{record.customerName}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{record.reason}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(record.items?.length ?? 0)}</td>
                    <td className="px-4 py-3 text-right font-medium">{money.format(record.refundAmount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(record.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                        {record.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${record.returnNumber}`}
                          onClick={() => setDetailId(record._id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canWrite && record.status === 'requested' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Approve ${record.returnNumber}`}
                              onClick={() => setActioning({ record, action: 'approve' })}
                            >
                              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Reject ${record.returnNumber}`}
                              onClick={() => setActioning({ record, action: 'reject' })}
                            >
                              <XCircle className="h-4 w-4 text-rose-500" />
                            </Button>
                          </>
                        )}
                        {canWrite && record.status === 'approved' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Receive ${record.returnNumber}`}
                            onClick={() => setActioning({ record, action: 'receive' })}
                          >
                            <PackageCheck className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        {canWrite && (record.status === 'approved' || record.status === 'received') && record.refundAmount > 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Refund ${record.returnNumber}`}
                            onClick={() => openRefund(record)}
                          >
                            <Wallet className="h-4 w-4 text-gold-600" />
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

      {/* Create return */}
      <Modal
        open={createOpen}
        onClose={() => {
          if (!saving) setCreateOpen(false);
        }}
        title="New return"
        description="Returns start as requested. Approve, receive and refund to complete the flow."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitReturn()} loading={saving} disabled={!selectedReference}>
              Create return
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="flex gap-1 rounded-lg bg-ink-50 p-1 dark:bg-ink-900">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${
                createType === 'order' ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white' : 'text-ink-500'
              }`}
              onClick={() => setCreateType('order')}
            >
              Online order
            </button>
            <button
              type="button"
              disabled={!canUsePos}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                createType === 'sale' ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white' : 'text-ink-500'
              }`}
              onClick={() => setCreateType('sale')}
            >
              POS sale
            </button>
          </div>
          {!canUsePos && (
            <p className="text-xs text-ink-400">You need the point-of-sale permission to look up POS sales.</p>
          )}

          <Field label={createType === 'order' ? 'Order number' : 'Sale number'} required>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input
                value={referenceSearch}
                onChange={(event) => setReferenceSearch(event.target.value)}
                placeholder={createType === 'order' ? 'Search by order number…' : 'Search by sale or receipt number…'}
                className="pl-9"
              />
              {referenceSearch && (
                <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-line bg-white shadow-lift dark:border-ink-700 dark:bg-ink-900">
                  {createType === 'order' && (orderSearchQuery.data?.items ?? []).map((order) => (
                    <button
                      key={order._id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800"
                      onClick={() => chooseOrder(order)}
                    >
                      <span>
                        <span className="block font-medium">{order.orderNumber}</span>
                        <span className="block text-xs text-ink-400">
                          {order.shippingAddress?.fullName} · {formatDate(order.createdAt)}
                        </span>
                      </span>
                      <span className="text-xs">{money.format(order.total)}</span>
                    </button>
                  ))}
                  {createType === 'sale' && canUsePos && (saleSearchQuery.data?.items ?? []).map((sale) => (
                    <button
                      key={sale._id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800"
                      onClick={() => chooseSale(sale)}
                    >
                      <span>
                        <span className="block font-medium">{sale.saleNumber}</span>
                        <span className="block text-xs text-ink-400">
                          {sale.cashierName} · {formatDate(sale.createdAt)}
                        </span>
                      </span>
                      <span className="text-xs">{money.format(sale.total)}</span>
                    </button>
                  ))}
                  {((createType === 'order' && orderSearchQuery.isFetching) ||
                    (createType === 'sale' && saleSearchQuery.isFetching)) && (
                    <p className="px-3 py-2 text-xs text-ink-400">Searching…</p>
                  )}
                </div>
              )}
            </div>
            {selectedReference && (
              <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm dark:bg-ink-900">
                <span>
                  Selected: <strong>{selectedReference.label}</strong>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedReference(null);
                    setDraftItems([]);
                  }}
                >
                  Change
                </Button>
              </div>
            )}
          </Field>

          {draftItems.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Purchased</th>
                    <th className="px-3 py-2">Return qty</th>
                    <th className="px-3 py-2">Condition</th>
                    <th className="px-3 py-2 text-center">Restock</th>
                    <th className="px-3 py-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {draftItems.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-ink-900 dark:text-white">{item.name}</p>
                        <p className="text-xs text-ink-400">{item.sku}</p>
                      </td>
                      <td className="px-3 py-2 text-center">{item.available}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={item.available}
                          value={item.quantity}
                          onChange={(event) =>
                            updateDraft(item.productId, {
                              quantity: Math.max(0, Math.min(item.available, Number(event.target.value))),
                            })
                          }
                          className="h-9 w-20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={item.condition}
                          onChange={(event) => updateDraft(item.productId, { condition: event.target.value })}
                          placeholder="Good, damaged…"
                          className="h-9 w-32"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={item.restock}
                          onChange={(event) => updateDraft(item.productId, { restock: event.target.checked })}
                          className="h-4 w-4 accent-gold"
                          aria-label={`Restock ${item.name}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {money.format(item.quantity * item.unitPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {draftItems.length > 0 && (
            <div className="flex justify-end text-sm">
              <div className="w-56 space-y-1 rounded-lg bg-ink-50 p-3 dark:bg-ink-900">
                <div className="flex justify-between text-ink-500 dark:text-ink-300">
                  <span>Refund estimate</span>
                  <span className="font-semibold text-ink-900 dark:text-white">{money.format(draftTotal)}</span>
                </div>
                <p className="text-[11px] text-ink-400">The server recalculates using original prices.</p>
              </div>
            </div>
          )}

          <Field label="Reason" required>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Damaged, wrong item, changed mind…" />
          </Field>
          <Field label="Notes">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
        </div>
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? detail.returnNumber : 'Return'}
        description={detail ? `${detail.type === 'order' ? 'Order' : 'Sale'} ${referenceLabel(detail)} · ${formatDate(detail.createdAt)}` : undefined}
        size="xl"
        footer={
          <>
            {detail && canWrite && detail.status === 'requested' && (
              <>
                <Button
                  variant="outline"
                  icon={<XCircle className="h-4 w-4" />}
                  onClick={() => setActioning({ record: detail, action: 'reject' })}
                >
                  Reject
                </Button>
                <Button
                  variant="secondary"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  onClick={() => setActioning({ record: detail, action: 'approve' })}
                >
                  Approve
                </Button>
              </>
            )}
            {detail && canWrite && detail.status === 'approved' && (
              <Button variant="secondary" icon={<PackageCheck className="h-4 w-4" />} onClick={() => setActioning({ record: detail, action: 'receive' })}>
                Receive items
              </Button>
            )}
            {detail && canWrite && (detail.status === 'approved' || detail.status === 'received') && detail.refundAmount > 0 && (
              <Button variant="secondary" icon={<Wallet className="h-4 w-4" />} onClick={() => openRefund(detail)}>
                Record refund
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </>
        }
      >
        {detailQuery.isLoading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading return…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Status</p>
                <div className="mt-1">
                  <Badge tone={statusTone(detail.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>{detail.status}</Badge>
                </div>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Refund value</p>
                <p className="mt-1 font-display text-xl font-semibold">{money.format(detail.refundAmount)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Customer</p>
                <p className="mt-1 truncate text-sm font-medium">{detail.customerName}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Restocked</p>
                <p className="mt-1 text-sm font-medium">{detail.restocked ? 'Yes' : 'No'}</p>
              </Card>
            </div>

            <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                  <tr>
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit price</th>
                    <th className="px-3 py-2 text-right">Value</th>
                    <th className="px-3 py-2">Restock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line dark:divide-ink-800">
                  {detail.items.map((item) => (
                    <tr key={`${item.product}-${item.name}`}>
                      <td className="px-3 py-2">
                        <p className="font-medium">{item.name}</p>
                        {item.condition && <p className="text-xs text-ink-400">{item.condition}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(item.quantity)}</td>
                      <td className="px-3 py-2 text-right">{money.format(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {money.format(item.lineTotal ?? item.unitPrice * item.quantity)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={item.restock ? 'emerald' : 'slate'}>{item.restock ? 'Yes' : 'No'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Details</p>
                <p className="text-ink-600 dark:text-ink-300">Reason: {detail.reason}</p>
                {detail.notes && <p className="mt-1 text-ink-500 dark:text-ink-300">{detail.notes}</p>}
                {detail.processedByName && (
                  <p className="mt-1 text-xs text-ink-400">Processed by {detail.processedByName}</p>
                )}
                {detail.refundMethod && (
                  <p className="mt-1 text-xs text-ink-400">Refund method: {detail.refundMethod.replace(/_/g, ' ')}</p>
                )}
              </Card>
              <Card className="p-4 text-sm">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">History</p>
                {(detail.history ?? []).length === 0 ? (
                  <p className="text-xs text-ink-400">No history recorded.</p>
                ) : (
                  <ol className="space-y-2">
                    {(detail.history ?? []).map((entry, index) => (
                      <li key={`${entry.status}-${index}`} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold" />
                        <span>
                          <span className="block capitalize text-ink-800 dark:text-ink-100">{entry.status}</span>
                          <span className="block text-[11px] text-ink-400">
                            {formatDate(entry.at, true)}
                            {entry.byName ? ` · ${entry.byName}` : ''}
                          </span>
                          {entry.note && <span className="block text-[11px] text-ink-400">{entry.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        )}
      </Modal>

      {/* Refund modal */}
      <Modal
        open={Boolean(refunding)}
        onClose={() => {
          if (!refundLoading) setRefunding(null);
        }}
        title="Record refund"
        description={refunding ? `${refunding.returnNumber} · maximum ${money.format(refunding.refundAmount)}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setRefunding(null)} disabled={refundLoading}>
              Cancel
            </Button>
            <Button onClick={() => void submitRefund()} loading={refundLoading}>
              Record refund
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
              value={refundForm.amount}
              onChange={(event) => setRefundForm((current) => ({ ...current, amount: event.target.value }))}
            />
          </Field>
          <Field label="Refund method">
            <Select
              value={refundForm.method}
              onChange={(event) => setRefundForm((current) => ({ ...current, method: event.target.value }))}
            >
              {paymentMethods.map((method) => (
                <option key={method.key} value={method.key}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea
              value={refundForm.notes}
              onChange={(event) => setRefundForm((current) => ({ ...current, notes: event.target.value }))}
              rows={2}
            />
          </Field>
          <Alert tone="warning">
            Recording a refund posts to the ledger and cannot be undone. Only refund the amount actually paid.
          </Alert>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(actioning)}
        onClose={() => setActioning(null)}
        onConfirm={() => void runAction()}
        title={
          actioning?.action === 'approve'
            ? 'Approve return'
            : actioning?.action === 'reject'
              ? 'Reject return'
              : 'Receive returned items'
        }
        description={
          actioning?.action === 'approve'
            ? `Approve ${actioning.record.returnNumber}? You can receive the items and issue a refund next.`
            : actioning?.action === 'reject'
              ? `Reject ${actioning?.record.returnNumber ?? 'this return'}? This cannot be undone.`
              : `Receive ${actioning?.record.returnNumber ?? 'this return'}? Items marked for restock will be added back to inventory.`
        }
        confirmLabel={actioning?.action === 'approve' ? 'Approve' : actioning?.action === 'reject' ? 'Reject' : 'Receive items'}
        danger={actioning?.action === 'reject'}
        loading={actionLoading}
      />

      <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        Stock is only restored when a return is received, never when it is requested or approved.
      </div>
    </div>
  );
}
