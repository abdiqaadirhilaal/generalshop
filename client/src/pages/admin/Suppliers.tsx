import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Download,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Truck,
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
import type { ApiMeta, Purchase, Supplier } from '@/types';

type SupplierMeta = ApiMeta & { totalOutstanding?: number; totalPurchases?: number };
type SupplierDetail = Supplier & { purchases?: Purchase[] };

interface SupplierForm {
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  productsSupplied: string;
  notes: string;
  status: 'active' | 'inactive';
}

const emptyForm: SupplierForm = {
  name: '',
  company: '',
  phone: '',
  email: '',
  address: '',
  productsSupplied: '',
  notes: '',
  status: 'active',
};

export default function Suppliers() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canWrite = has('suppliers:write');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const params = {
    page,
    limit: 20,
    q: debouncedSearch || undefined,
    status: status || undefined,
  };

  const listQuery = useQuery({
    queryKey: ['admin-suppliers', params],
    queryFn: () => api.page<Supplier>(`/suppliers${queryString(params)}`),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-supplier', detailId],
    queryFn: () => api.get<SupplierDetail>(`/suppliers/${detailId}`),
    enabled: Boolean(detailId),
  });

  const suppliers = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta as SupplierMeta | undefined;
  const detail = detailQuery.data;

  const topSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => b.outstandingBalance - a.outstandingBalance).slice(0, 3),
    [suppliers]
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-suppliers'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-supplier', detailId] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      company: supplier.company ?? '',
      phone: supplier.phone,
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      productsSupplied: (supplier.productsSupplied ?? []).join(', '),
      notes: supplier.notes ?? '',
      status: supplier.status,
    });
    setFormError('');
    setFormOpen(true);
  };

  const submit = async () => {
    setFormError('');
    if (form.name.trim().length < 2) return setFormError('Enter the supplier name.');
    if (form.phone.trim().length < 6) return setFormError('Enter a valid phone number.');

    const body = {
      name: form.name.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim(),
      email: form.email.trim() || '',
      address: form.address.trim() || undefined,
      productsSupplied: form.productsSupplied
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      notes: form.notes.trim() || undefined,
      status: form.status,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/suppliers/${editing._id}`, body);
        success('Supplier updated.');
      } else {
        await api.post('/suppliers', body);
        success('Supplier created.');
      }
      setFormOpen(false);
      refresh();
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const result = await api.delete<{ deleted?: boolean; deactivated?: boolean; message?: string }>(
        `/suppliers/${deleting._id}`
      );
      success(result.message ?? (result.deactivated ? 'Supplier deactivated.' : 'Supplier deleted.'));
      setDeleting(null);
      refresh();
    } catch (removeError) {
      error(removeError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const update = <K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <div>
      <AdminPageHeader
        eyebrow="People"
        title="Suppliers"
        description="Manage your supply partners, purchase history and outstanding balances."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void downloadFile('/suppliers/export', 'hilaal-suppliers.csv').catch(error)}
            >
              Export CSV
            </Button>
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                New supplier
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Suppliers"
          value={formatNumber(meta?.total ?? 0)}
          hint="Matching the current filters"
          icon={<Truck className="h-4 w-4" />}
        />
        <StatCard
          label="Total purchases"
          value={money.format(meta?.totalPurchases ?? 0)}
          hint="Lifetime purchasing volume"
          icon={<Building2 className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Outstanding balance"
          value={money.format(meta?.totalOutstanding ?? 0)}
          hint="Owed to suppliers"
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
            placeholder="Search name, company or phone"
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
          </Select>
          {(search || status) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
          {topSuppliers.length > 0 && (
            <div className="ml-auto hidden items-center gap-2 text-xs text-ink-400 xl:flex">
              <span>Top balances:</span>
              {topSuppliers.map((supplier) => (
                <Badge key={supplier._id} tone={supplier.outstandingBalance > 0 ? 'rose' : 'slate'}>
                  {supplier.name} · {money.format(supplier.outstandingBalance)}
                </Badge>
              ))}
            </div>
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
      ) : suppliers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck className="h-6 w-6" />}
            title="No suppliers found"
            description="Add your first supplier to start recording purchases and payables."
            action={
              canWrite ? (
                <Button variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>
                  New supplier
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Supplier</th>
                  <th className="px-4 py-2.5">Contact</th>
                  <th className="px-4 py-2.5">Products supplied</th>
                  <th className="px-4 py-2.5 text-right">Purchases</th>
                  <th className="px-4 py-2.5 text-right">Outstanding</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {suppliers.map((supplier) => (
                  <tr
                    key={supplier._id}
                    className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                    onClick={() => setDetailId(supplier._id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-50 text-xs font-semibold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
                          {supplier.name.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900 dark:text-white">{supplier.name}</p>
                          <p className="text-xs text-ink-400">{supplier.company || supplier.supplierNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      <p className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {supplier.phone}
                      </p>
                      {supplier.email && (
                        <p className="mt-0.5 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {supplier.email}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {(supplier.productsSupplied ?? []).slice(0, 4).map((item) => (
                          <Badge key={item} tone="slate">
                            {item}
                          </Badge>
                        ))}
                        {(supplier.productsSupplied ?? []).length > 4 && (
                          <Badge tone="slate">+{(supplier.productsSupplied ?? []).length - 4}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{money.format(supplier.totalPurchases)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={supplier.outstandingBalance > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-ink-400'}>
                        {money.format(supplier.outstandingBalance)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(supplier.status) as 'emerald' | 'slate'}>{supplier.status}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Edit ${supplier.name}`}
                            onClick={() => openEdit(supplier)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${supplier.name}`}
                            onClick={() => setDeleting(supplier)}
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

      <Modal
        open={formOpen}
        onClose={() => {
          if (!saving) setFormOpen(false);
        }}
        title={editing ? 'Edit supplier' : 'New supplier'}
        description="Track contacts, supplied products and balances."
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} loading={saving}>
              {editing ? 'Save changes' : 'Create supplier'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && <Alert tone="danger">{formError}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name" required>
              <Input value={form.name} onChange={(event) => update('name', event.target.value)} />
            </Field>
            <Field label="Company">
              <Input value={form.company} onChange={(event) => update('company', event.target.value)} />
            </Field>
            <Field label="Phone" required>
              <Input value={form.phone} onChange={(event) => update('phone', event.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(event) => update('address', event.target.value)} />
          </Field>
          <Field label="Products supplied" hint="Comma separated, e.g. rice, cooking oil, sugar">
            <Input value={form.productsSupplied} onChange={(event) => update('productsSupplied', event.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => update('status', event.target.value as SupplierForm['status'])}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
          <Field label="Internal notes">
            <Textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} rows={3} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={detail ? detail.name : 'Supplier'}
        description={detail ? `${detail.supplierNumber}${detail.company ? ` · ${detail.company}` : ''}` : undefined}
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
                Edit supplier
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailId(null)}>
              Close
            </Button>
          </>
        }
      >
        {detailQuery.isLoading || !detail ? (
          <div className="py-10 text-center text-sm text-ink-400">Loading supplier…</div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Total purchases</p>
                <p className="mt-1 font-display text-xl font-semibold">{money.format(detail.totalPurchases)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Outstanding</p>
                <p className="mt-1 font-display text-xl font-semibold text-rose-600 dark:text-rose-400">
                  {money.format(detail.outstandingBalance)}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Status</p>
                <div className="mt-1">
                  <Badge tone={statusTone(detail.status) as 'emerald' | 'slate'}>{detail.status}</Badge>
                </div>
              </Card>
            </div>

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
              {detail.address && (
                <p className="mt-1 flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 text-ink-400" />
                  <span>{detail.address}</span>
                </p>
              )}
              {detail.notes && (
                <p className="mt-2 rounded-lg bg-ink-50 p-2 text-xs text-ink-500 dark:bg-ink-900 dark:text-ink-300">
                  {detail.notes}
                </p>
              )}
            </Card>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Recent purchases</p>
              {(detail.purchases ?? []).length === 0 ? (
                <p className="text-sm text-ink-400">No purchases recorded yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-line dark:border-ink-800">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:bg-ink-900/40">
                      <tr>
                        <th className="px-3 py-2">Purchase</th>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-ink-800">
                      {(detail.purchases ?? []).map((purchase) => (
                        <tr key={purchase._id}>
                          <td className="px-3 py-2 font-medium">{purchase.purchaseNumber}</td>
                          <td className="px-3 py-2 text-xs text-ink-500 dark:text-ink-300">
                            {formatDate(purchase.createdAt)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={statusTone(purchase.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>
                              {purchase.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">{money.format(purchase.total)}</td>
                          <td className="px-3 py-2 text-right">{money.format(purchase.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Remove supplier"
        description={`Remove ${deleting?.name ?? 'this supplier'}? Suppliers with purchase history are deactivated instead of deleted. Outstanding balances must be settled first.`}
        confirmLabel="Remove"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
