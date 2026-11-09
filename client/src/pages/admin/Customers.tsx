import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
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
import type {
  ApiMeta,
  Customer,
  LoyaltyTransaction,
  Order,
  Page,
  Sale,
} from '@/types';

type CustomerMeta = ApiMeta & { totalSpending?: number; totalPoints?: number };
type CustomerDetail = Customer & {
  orders?: Order[];
  sales?: Sale[];
  loyalty?: LoyaltyTransaction[];
};

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  tags: string;
  notes: string;
  status: 'active' | 'inactive' | 'blocked';
}

const emptyForm: CustomerForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  tags: '',
  notes: '',
  status: 'active',
};

export default function Customers() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('customers:write');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [segment, setSegment] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState('');
  const [loyaltyNote, setLoyaltyNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const params = {
    page,
    limit: 20,
    q: debouncedSearch || undefined,
    status: status || undefined,
    segment: segment || undefined,
    tag: tag || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['admin-customers', params],
    queryFn: () => api.page<Customer>(`/customers${queryString(params)}`),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-customer', detailId],
    queryFn: () => api.get<CustomerDetail>(`/customers/${detailId}`),
    enabled: Boolean(detailId),
  });

  const customers = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta as CustomerMeta | undefined;
  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setLoyaltyPoints('');
    setLoyaltyNote('');
  }, [detail]);

  const tags = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((customer) => customer.tags?.forEach((item) => set.add(item)));
    return [...set].sort();
  }, [customers]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-customers'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-customer', detailId] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditing(customer);
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      tags: (customer.tags ?? []).join(', '),
      notes: customer.notes ?? '',
      status: customer.status,
    });
    setFormError('');
    setFormOpen(true);
  };

  const submit = async () => {
    setFormError('');
    if (form.name.trim().length < 2) return setFormError('Enter the customer name.');
    if (form.phone.trim().length < 6) return setFormError('Enter a valid phone number.');

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || '',
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      tags: form.tags
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      notes: form.notes.trim() || undefined,
    };
    if (editing) body.status = form.status;

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/customers/${editing._id}`, body);
        success('Customer updated.');
      } else {
        await api.post('/customers', body);
        success('Customer created.');
      }
      setFormOpen(false);
      refresh();
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const adjustLoyalty = async () => {
    if (!detail) return;
    const points = Math.trunc(Number(loyaltyPoints));
    if (!points) return error('Enter a non-zero number of points.');
    setAdjusting(true);
    try {
      await api.post(`/customers/${detail._id}/loyalty`, {
        points,
        note: loyaltyNote.trim() || undefined,
      });
      success(`Loyalty balance adjusted by ${points > 0 ? '+' : ''}${points}.`);
      setLoyaltyPoints('');
      setLoyaltyNote('');
      refresh();
    } catch (adjustError) {
      error(adjustError);
    } finally {
      setAdjusting(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const result = await api.delete<{ deleted?: boolean; deactivated?: boolean; message?: string }>(
        `/customers/${deleting._id}`
      );
      success(result.message ?? (result.deactivated ? 'Customer deactivated.' : 'Customer deleted.'));
      setDeleting(null);
      refresh();
    } catch (removeError) {
      error(removeError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const update = <K extends keyof CustomerForm>(key: K, value: CustomerForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div>
      <AdminPageHeader
        eyebrow="People"
        title="Customers"
        description="Your customer directory, purchase history, loyalty balances and segments in one place."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void downloadFile('/customers/export', 'hilaal-customers.csv').catch(error)}
            >
              Export CSV
            </Button>
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                New customer
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Customers in view"
          value={formatNumber(meta?.total ?? 0)}
          hint="Matching the current filters"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Lifetime spending"
          value={money.format(meta?.totalSpending ?? 0)}
          hint="Across matching customers"
          icon={<Wallet className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Loyalty points"
          value={formatNumber(meta?.totalPoints ?? 0)}
          hint="Outstanding points in this view"
          icon={<Sparkles className="h-4 w-4" />}
          tone="emerald"
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
            placeholder="Search name, phone, email or number"
            className="w-full sm:w-64"
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="blocked">Blocked</option>
          </Select>
          <Select
            value={segment}
            onChange={(event) => {
              setSegment(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          >
            <option value="">All segments</option>
            <option value="vip">VIP ($200+)</option>
            <option value="repeat">Repeat (3+ orders)</option>
            <option value="new">New (30 days)</option>
          </Select>
          {tags.length > 0 && (
            <Select
              value={tag}
              onChange={(event) => {
                setTag(event.target.value);
                setPage(1);
              }}
              className="w-auto"
            >
              <option value="">Any tag</option>
              {tags.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </Select>
          )}
          {(search || status || segment || tag) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
                setSegment('');
                setTag('');
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
      ) : customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No customers found"
            description="Customers who register or check out will appear here. You can also add one manually."
            action={
              canWrite ? (
                <Button variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                  New customer
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5 text-right">Orders</th>
                  <th className="px-4 py-2.5 text-right">Spending</th>
                  <th className="px-4 py-2.5 text-right">Loyalty</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last purchase</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {customers.map((customer) => (
                  <tr
                    key={customer._id}
                    className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                    onClick={() => setDetailId(customer._id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold-50 text-xs font-semibold text-gold-700 dark:bg-gold-900/30 dark:text-gold-200">
                          {customer.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900 dark:text-white">{customer.name}</p>
                          <p className="text-xs text-ink-400">{customer.customerNumber}</p>
                          {customer.tags?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {customer.tags.slice(0, 3).map((item) => (
                                <Badge key={item} tone="slate">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      <p className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {customer.phone}
                      </p>
                      {customer.email && (
                        <p className="mt-0.5 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {customer.email}
                        </p>
                      )}
                      {customer.city && (
                        <p className="mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {customer.city}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(customer.totalOrders)}</td>
                    <td className="px-4 py-3 text-right font-medium">{money.format(customer.totalSpending)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(customer.loyaltyPoints)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          statusTone(customer.status) as 'emerald' | 'amber' | 'rose' | 'slate'
                        }
                      >
                        {customer.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt, true) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`View ${customer.name}`}
                          onClick={() => setDetailId(customer._id)}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${customer.name}`}
                            onClick={() => openEdit(customer)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${customer.name}`}
                            onClick={() => setDeleting(customer)}
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
              page={meta?.page ?? 1}
              totalPages={meta?.totalPages ?? 1}
              total={meta?.total}
              onChange={setPage}
            />
          </div>
        </Card>
      )}

      {/* Create / edit */}
      <Modal
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        title={editing ? 'Edit customer' : 'New customer'}
        description="Customers are linked to online accounts when the email matches."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              {editing ? 'Save changes' : 'Create customer'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={form.name} onChange={(event) => update('name', event.target.value)} />
            </Field>
            <Field label="Phone" required>
              <Input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            </Field>
            <Field label="City">
              <Input value={form.city} onChange={(event) => update('city', event.target.value)} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(event) => update('address', event.target.value)} />
          </Field>
          <Field label="Tags" hint="Comma separated, e.g. vip, wholesale, family">
            <Input value={form.tags} onChange={(event) => update('tags', event.target.value)} />
          </Field>
          {editing && (
            <Field label="Status">
              <Select value={form.status} onChange={(event) => update('status', event.target.value as CustomerForm['status'])}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blocked">Blocked</option>
              </Select>
            </Field>
          )}
          <Field label="Internal notes">
            <Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      {/* Detail */}
      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? detail.name : 'Customer'}
        description={detail ? `${detail.customerNumber} · joined ${formatDate(detail.createdAt)}` : undefined}
        size="xl"
        footer={
          <>
            {detail && canWrite && (
              <Button
                variant="outline"
                icon={<Pencil className="h-4 w-4" />}
                onClick={() => {
                  setDetailId(null);
                  openEdit(detail);
                }}
              >
                Edit customer
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </>
        }
      >
        {detailQuery.isLoading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading customer…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Orders</p>
                <p className="mt-1 font-display text-xl font-semibold">{formatNumber(detail.totalOrders)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Spending</p>
                <p className="mt-1 font-display text-xl font-semibold">{money.format(detail.totalSpending)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Loyalty points</p>
                <p className="mt-1 font-display text-xl font-semibold">{formatNumber(detail.loyaltyPoints)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Status</p>
                <div className="mt-1">
                  <Badge tone={statusTone(detail.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                    {detail.status}
                  </Badge>
                </div>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Contact</p>
                <p className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-ink-400" /> {detail.phone}
                </p>
                {detail.email && (
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-ink-400" /> {detail.email}
                  </p>
                )}
                {(detail.address || detail.city) && (
                  <p className="mt-1 flex items-start gap-2 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 text-ink-400" />
                    <span>{[detail.address, detail.city].filter(Boolean).join(', ')}</span>
                  </p>
                )}
                {detail.notes && <p className="mt-2 rounded-lg bg-ink-50 p-2 text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-300">{detail.notes}</p>}
              </Card>

              {canWrite && (
                <Card className="p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                    <Sparkles className="h-3.5 w-3.5" /> Adjust loyalty
                  </p>
                  <div className="space-y-2">
                    <Input
                      type="number"
                      step="1"
                      value={loyaltyPoints}
                      onChange={(event) => setLoyaltyPoints(event.target.value)}
                      placeholder="Points (+ earn / - redeem)"
                    />
                    <Input
                      value={loyaltyNote}
                      onChange={(event) => setLoyaltyNote(event.target.value)}
                      placeholder="Reason for the adjustment"
                    />
                    <Button size="sm" className="w-full" loading={adjusting} onClick={() => void adjustLoyalty()}>
                      Apply adjustment
                    </Button>
                  </div>
                </Card>
              )}
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Recent orders</p>
              {(detail.orders ?? []).length === 0 ? (
                <p className="text-sm text-ink-400">No orders yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                      <tr>
                        <th className="px-3 py-2">Order</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-ink-800">
                      {(detail.orders ?? []).map((order) => (
                        <tr key={order._id}>
                          <td className="px-3 py-2">
                            <Link to="/admin/orders" className="font-medium text-gold-700 hover:underline dark:text-gold-300">
                              {order.orderNumber}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-xs text-ink-500 dark:text-ink-300">{formatDate(order.createdAt, true)}</td>
                          <td className="px-3 py-2">
                            <Badge tone={statusTone(order.status) as 'emerald' | 'amber' | 'blue' | 'rose' | 'slate'}>
                              {order.status.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{money.format(order.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Recent POS sales</p>
                {(detail.sales ?? []).length === 0 ? (
                  <p className="text-sm text-ink-400">No in-store sales yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.sales ?? []).map((sale) => (
                      <div key={sale._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-900">
                        <div>
                          <p className="font-medium text-ink-800 dark:text-ink-100">{sale.saleNumber}</p>
                          <p className="text-ink-400">{formatDate(sale.createdAt, true)}</p>
                        </div>
                        <span className="font-semibold">{money.format(sale.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Loyalty history</p>
                {(detail.loyalty ?? []).length === 0 ? (
                  <p className="text-sm text-ink-400">No loyalty activity yet.</p>
                ) : (
                  <div className="space-y-2">
                    {(detail.loyalty ?? []).map((entry) => (
                      <div key={entry._id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-900">
                        <div>
                          <p className="font-medium text-ink-800 dark:text-ink-100">
                            {entry.points > 0 ? '+' : ''}
                            {formatNumber(entry.points)} points
                          </p>
                          <p className="text-ink-400">{entry.note ?? entry.type} · {formatDate(entry.createdAt)}</p>
                        </div>
                        <span className="text-ink-400">Bal {formatNumber(entry.balanceAfter)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Remove customer"
        description={`Remove ${deleting?.name ?? 'this customer'}? Customers with orders or sales are deactivated instead of deleted.`}
        confirmLabel="Remove"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
