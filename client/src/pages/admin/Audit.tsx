import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Download, Eye, Filter, ScrollText, ShieldCheck, UserRound } from 'lucide-react';
import { api, apiErrorMessage, queryString } from '@/lib/api';
import { useToast } from '@/context/AppProviders';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
  StatCard,
  TableSkeleton,
} from '@/components/ui';
import { formatDate, formatNumber, titleCase } from '@/lib/format';
import type { AuditLog, Page } from '@/types';

interface AuditRow extends AuditLog {
  before?: unknown;
  after?: unknown;
  userAgent?: string;
}

const ENTITIES = [
  '',
  'Product',
  'Category',
  'Brand',
  'Order',
  'Sale',
  'Purchase',
  'Supplier',
  'Customer',
  'Expense',
  'Return',
  'ShopSettings',
  'ContentPage',
  'User',
  'Role',
  'Auth',
  'Inventory',
  'Payment',
];

function toneForAction(action: string) {
  if (/delete|remove|cancel|void|reject/i.test(action)) return 'rose' as const;
  if (/create|add|receive|approve|refund|payment/i.test(action)) return 'emerald' as const;
  if (/update|edit|patch|settings|status/i.test(action)) return 'gold' as const;
  return 'slate' as const;
}

export default function Audit() {
  const { success, error } = useToast();
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditRow | null>(null);

  const params = {
    page,
    limit: 30,
    entity: entity || undefined,
    action: action || undefined,
    actor: actor || undefined,
    q: search || undefined,
    from: from || undefined,
    to: to || undefined,
  };

  const query = useQuery({
    queryKey: ['admin-audit', params],
    queryFn: () => api.page<AuditRow>(`/dashboard/audit-logs${queryString(params)}`),
  });

  const logs = query.data?.items ?? [];
  const meta = query.data?.meta;

  const actors = useMemo(() => [...new Set(logs.map((log) => log.actorName))], [logs]);

  const clearFilters = () => {
    setEntity('');
    setAction('');
    setActor('');
    setSearch('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  const hasFilters = Boolean(entity || action || actor || search || from || to);

  const exportCsv = () => {
    const rows = [
      ['Date', 'Actor', 'Email', 'Action', 'Entity', 'Entity ID', 'IP'],
      ...logs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.actorName,
        log.actorEmail ?? '',
        log.action,
        log.entity,
        log.entityId ?? '',
        log.ip ?? '',
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hilaal-audit-log.csv';
    link.click();
    URL.revokeObjectURL(url);
    success('Audit log exported.');
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Security"
        title="Audit log"
        description="Every sensitive change is recorded with the actor, action, entity and before/after payload. Logs are immutable."
        action={
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
            disabled={logs.length === 0}
          >
            Export page CSV
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Entries"
          value={formatNumber(meta?.total ?? 0)}
          hint="Matching the current filters"
          icon={<ScrollText className="h-4 w-4" />}
        />
        <StatCard
          label="Actors on page"
          value={formatNumber(actors.length)}
          hint="Distinct staff members in this view"
          icon={<UserRound className="h-4 w-4" />}
          tone="gold"
        />
        <StatCard
          label="Immutable"
          value="Append-only"
          hint="Entries cannot be edited or deleted"
          icon={<ShieldCheck className="h-4 w-4" />}
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
            placeholder="Search actor or entity ID"
            className="w-full sm:w-60"
          />
          <Select
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setPage(1);
            }}
            className="w-auto max-w-[180px]"
          >
            {ENTITIES.map((value) => (
              <option key={value} value={value}>
                {value || 'Any entity'}
              </option>
            ))}
          </Select>
          <Input
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            placeholder="Action contains…"
            className="w-auto"
            aria-label="Action filter"
          />
          <Input
            value={actor}
            onChange={(event) => {
              setActor(event.target.value);
              setPage(1);
            }}
            placeholder="Actor ID"
            className="w-auto"
            aria-label="Actor ID filter"
          />
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
          {hasFilters && (
            <Button variant="ghost" size="sm" icon={<Filter className="h-3.5 w-3.5" />} onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      {query.isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-rose-600">{apiErrorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </Card>
      ) : query.isLoading ? (
        <Card className="p-4">
          <TableSkeleton rows={10} />
        </Card>
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Activity className="h-6 w-6" />}
            title="No audit entries"
            description="Changes to products, orders, finance and settings will be recorded here."
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
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
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Reference</th>
                  <th className="px-4 py-2.5">IP</th>
                  <th className="px-4 py-2.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {logs.map((log) => (
                  <tr
                    key={log._id}
                    className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                    onClick={() => setDetail(log)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-500 dark:text-ink-300">
                      {formatDate(log.createdAt, true)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-900 dark:text-white">{log.actorName}</p>
                      {log.actorEmail && <p className="text-xs text-ink-400">{log.actorEmail}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={toneForAction(log.action)}>{log.action}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-ink-700 dark:text-ink-200">{titleCase(log.entity)}</span>
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 font-mono text-[11px] text-ink-400">
                      {log.entityId ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-400">{log.ip ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="View audit entry"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetail(log);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? titleCase(detail.action.replace(/[._]/g, ' ')) : 'Audit entry'}
        description={detail ? `${detail.actorName} · ${formatDate(detail.createdAt, true)}` : undefined}
        size="xl"
        footer={
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
          </Button>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Action</p>
                <div className="mt-1">
                  <Badge tone={toneForAction(detail.action)}>{detail.action}</Badge>
                </div>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Entity</p>
                <p className="mt-1 text-sm font-medium">
                  {detail.entity} {detail.entityId ? `· ${detail.entityId}` : ''}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Actor</p>
                <p className="mt-1 text-sm font-medium">{detail.actorName}</p>
                {detail.actorEmail && <p className="text-xs text-ink-400">{detail.actorEmail}</p>}
              </Card>
              <Card className="p-3">
                <p className="text-[11px] uppercase tracking-wider text-ink-400">IP address</p>
                <p className="mt-1 font-mono text-xs">{detail.ip ?? '—'}</p>
              </Card>
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Before</p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-ink-50 p-3 text-[11px] leading-5 text-ink-600 dark:bg-ink-900 dark:text-ink-300">
                {detail.before ? JSON.stringify(detail.before, null, 2) : 'No previous state recorded.'}
              </pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">After</p>
              <pre className="max-h-56 overflow-auto rounded-lg bg-ink-50 p-3 text-[11px] leading-5 text-ink-600 dark:bg-ink-900 dark:text-ink-300">
                {detail.after ? JSON.stringify(detail.after, null, 2) : 'No new state recorded.'}
              </pre>
            </div>
            {detail.userAgent && (
              <p className="text-[11px] text-ink-400">User agent: {detail.userAgent}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
