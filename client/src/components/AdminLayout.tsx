import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileClock,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Sun,
  Truck,
  UserRound,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, initials, timeAgo } from '@/lib/format';
import { useAuth, useSettings, useTheme, useToast } from '@/context/AppProviders';
import { BrandMark } from './Storefront';
import { Badge, Button } from './ui';
import type { NotificationItem } from '@/types';

/* ─────────────────────────────── Navigation ───────────────────────────── */

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission: string;
  exact?: boolean;
  badge?: 'orders' | 'lowStock';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard:view', exact: true }],
  },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/products', label: 'Products', icon: ShoppingBag, permission: 'products:view' },
      { to: '/admin/categories', label: 'Categories & brands', icon: FolderTree, permission: 'products:view' },
      { to: '/admin/reviews', label: 'Reviews', icon: Star, permission: 'products:view' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { to: '/admin/inventory', label: 'Stock & movements', icon: Warehouse, permission: 'inventory:view', badge: 'lowStock' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { to: '/admin/pos', label: 'Point of sale', icon: CreditCard, permission: 'pos:use' },
      { to: '/admin/orders', label: 'Orders', icon: ClipboardList, permission: 'orders:view', badge: 'orders' },
      { to: '/admin/returns', label: 'Returns & refunds', icon: RotateCcw, permission: 'returns:view' },
    ],
  },
  {
    label: 'People',
    items: [
      { to: '/admin/customers', label: 'Customers', icon: Users, permission: 'customers:view' },
      { to: '/admin/suppliers', label: 'Suppliers', icon: Truck, permission: 'suppliers:view' },
      { to: '/admin/purchases', label: 'Purchases', icon: PackageSearch, permission: 'purchases:view' },
      { to: '/admin/employees', label: 'Employees & roles', icon: UserRound, permission: 'employees:view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/finance', label: 'Finance', icon: ReceiptText, permission: 'finance:view' },
      { to: '/admin/reports', label: 'Reports', icon: BarChart3, permission: 'reports:view' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/settings', label: 'Settings & content', icon: Settings, permission: 'settings:view' },
      { to: '/admin/audit', label: 'Audit logs', icon: FileClock, permission: 'audit:view' },
    ],
  },
];

function pageTitle(pathname: string) {
  const flat = NAV_GROUPS.flatMap((group) => group.items);
  const match = flat.find((item) => (item.exact ? pathname === item.to : pathname.startsWith(item.to)));
  return match?.label ?? 'Admin';
}

/* ─────────────────────────── Notification bell ────────────────────────── */

function NotificationBell() {
  const { has } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const allowed = has('dashboard:view');

  const { data } = useQuery({
    queryKey: ['admin-notifications'],
    queryFn: () => api.raw<NotificationItem[]>('/dashboard/notifications'),
    enabled: allowed,
    refetchInterval: 60_000,
  });

  const notifications = data?.data ?? [];
  const unread = (data?.meta as { unread?: number } | undefined)?.unread ?? notifications.filter((item) => !item.read).length;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-notifications'] });

  if (!allowed) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-xl border border-line bg-white shadow-lift dark:border-ink-700 dark:bg-ink-900"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-ink-800">
                <p className="text-sm font-semibold text-ink-900 dark:text-white">Notifications</p>
                {unread > 0 && (
                  <button
                    className="text-xs font-medium text-gold-700 hover:underline dark:text-gold-300"
                    onClick={async () => {
                      await api.post('/dashboard/notifications/read-all');
                      await refresh();
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-[360px] overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-400">You are all caught up.</p>
                ) : (
                  notifications.slice(0, 12).map((item) => (
                    <button
                      key={item._id}
                      onClick={async () => {
                        if (!item.read) {
                          await api.post(`/dashboard/notifications/${item._id}/read`);
                          await refresh();
                        }
                        setOpen(false);
                        if (item.link) navigate(item.link);
                      }}
                      className={cn(
                        'flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-ink-50 dark:border-ink-800 dark:hover:bg-ink-800/60',
                        !item.read && 'bg-gold-50/40 dark:bg-gold-900/10'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1 h-2 w-2 shrink-0 rounded-full',
                          item.priority === 'high' ? 'bg-rose-500' : item.read ? 'bg-ink-200 dark:bg-ink-700' : 'bg-gold'
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink-800 dark:text-ink-100">{item.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-400">{item.message}</span>
                        <span className="mt-1 block text-[10px] uppercase tracking-wide text-ink-300">{timeAgo(item.createdAt)}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ──────────────────────────────── Sidebar ─────────────────────────────── */

function SidebarContent({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { has, user } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => has(item.permission)),
      })).filter((group) => group.items.length > 0),
    [has]
  );

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 items-center border-b border-ink-800/60 px-4', collapsed && 'justify-center px-2')}>
        <Link to="/admin" onClick={onNavigate} className="min-w-0">
          {collapsed ? <BrandMark compact /> : <BrandMark light />}
        </Link>
      </div>

      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/30">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      collapsed && 'justify-center px-0',
                      active
                        ? 'bg-gold text-ink-950'
                        : 'text-white/60 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-800/60 p-3">
        <Link
          to="/"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/50 transition-colors hover:bg-white/5 hover:text-white',
            collapsed && 'justify-center px-0'
          )}
          title={collapsed ? 'View shop' : undefined}
        >
          <Store className="h-4 w-4 shrink-0" />
          {!collapsed && <span>View shop</span>}
        </Link>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold/15 text-xs font-semibold text-gold">
              {initials(user?.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-white">{user?.name}</span>
              <span className="block truncate text-[10px] text-white/40">{user?.role?.name ?? 'Staff'}</span>
            </span>
          </div>
        )}
      </div>
      {!collapsed && settings?.shopName && (
        <p className="border-t border-ink-800/60 px-4 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-white/20">
          {settings.shopName} Console
        </p>
      )}
    </div>
  );
}

/* ───────────────────────────────── Layout ─────────────────────────────── */

export function AdminLayout() {
  const { user, logout, isStaff } = useAuth();
  const { theme, toggle } = useTheme();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [location.pathname]);

  const title = pageTitle(location.pathname);

  return (
    <div className="min-h-screen bg-canvas dark:bg-ink-950">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden border-r border-ink-800/60 bg-ink-950 transition-all duration-200 lg:block',
          collapsed ? 'w-[68px]' : 'w-64'
        )}
      >
        <SidebarContent collapsed={collapsed} />
        <button
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-20 grid h-6 w-6 place-items-center rounded-full border border-ink-700 bg-ink-900 text-white/60 hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.button
              className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm"
              aria-label="Close navigation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="relative h-full w-72 bg-ink-950"
            >
              <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="absolute right-3 top-4 grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className={cn('transition-all duration-200', collapsed ? 'lg:pl-[68px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-950/85 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">HILAAL Admin</p>
            <h1 className="truncate font-display text-lg font-semibold leading-tight text-ink-900 dark:text-white">{title}</h1>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/"
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink-600 hover:bg-white dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 sm:inline-flex"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Storefront
            </Link>
            <button
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <NotificationBell />

            <div className="relative ml-1">
              <button
                onClick={() => setAccountOpen((value) => !value)}
                aria-label="Account menu"
                className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-900 text-xs font-semibold text-gold dark:bg-gold dark:text-ink-950">
                  {initials(user?.name)}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block max-w-[130px] truncate text-xs font-semibold text-ink-900 dark:text-white">{user?.name}</span>
                  <span className="block text-[10px] text-ink-400">{user?.role?.name ?? 'Staff'}</span>
                </span>
                <ChevronDown className="hidden h-3.5 w-3.5 text-ink-400 sm:block" />
              </button>

              <AnimatePresence>
                {accountOpen && (
                  <>
                    <button className="fixed inset-0 z-40 cursor-default" aria-label="Close account menu" onClick={() => setAccountOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-lift dark:border-ink-700 dark:bg-ink-900"
                    >
                      <div className="border-b border-line px-3 py-2.5 dark:border-ink-800">
                        <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{user?.name}</p>
                        <p className="truncate text-xs text-ink-400">{user?.email}</p>
                      </div>
                      <Link to="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800">
                        <UserRound className="h-4 w-4" /> My profile
                      </Link>
                      {isStaff && (
                        <Link to="/admin/settings" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800">
                          <ShieldCheck className="h-4 w-4" /> Permissions
                        </Link>
                      )}
                      <button
                        onClick={async () => {
                          await logout();
                          success('Signed out of the admin workspace.');
                          navigate('/');
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/* ───────────────────────────── Shared admin bits ──────────────────────── */

export function AdminPageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-400">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function PermissionNote({ permission }: { permission: string }) {
  return (
    <Badge tone="slate">
      <ShieldCheck className="h-3 w-3" /> Requires {permission}
    </Badge>
  );
}

export function AdminEmptyShortcut({ to, label }: { to: string; label: string }) {
  return (
    <Button variant="secondary" size="sm" onClick={() => (window.location.href = to)}>
      {label}
    </Button>
  );
}
