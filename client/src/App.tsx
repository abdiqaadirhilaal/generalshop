import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { AppProviders, useAuth } from '@/context/AppProviders';
import { AdminLayout } from '@/components/AdminLayout';
import { StorefrontLayout } from '@/components/Storefront';
import { Button, Card, PageLoader } from '@/components/ui';

import HomePage from '@/pages/Home';
import ShopPage from '@/pages/Shop';
import ProductDetailPage from '@/pages/ProductDetail';
import CartPage from '@/pages/Cart';
import CheckoutPage from '@/pages/Checkout';
import OrderTrackPage from '@/pages/OrderTrack';
import AccountPage from '@/pages/Account';
import AuthPage from '@/pages/Auth';
import ContentPageRoute from '@/pages/ContentPage';
import NotFoundPage from '@/pages/NotFound';

import AdminDashboardPage from '@/pages/admin/Dashboard';
import Products from '@/pages/admin/Products';
import Catalog from '@/pages/admin/Catalog';
import Reviews from '@/pages/admin/Reviews';
import Inventory from '@/pages/admin/Inventory';
import POS from '@/pages/admin/POS';
import Orders from '@/pages/admin/Orders';
import Returns from '@/pages/admin/Returns';
import Customers from '@/pages/admin/Customers';
import Suppliers from '@/pages/admin/Suppliers';
import Purchases from '@/pages/admin/Purchases';
import Employees from '@/pages/admin/Employees';
import Finance from '@/pages/admin/Finance';
import Reports from '@/pages/admin/Reports';
import Settings from '@/pages/admin/Settings';
import Audit from '@/pages/admin/Audit';

/* ───────────────────────────── Error boundary ──────────────────────────── */

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[hilaal] unhandled UI error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-canvas px-4 dark:bg-ink-950">
          <Card className="w-full max-w-lg p-8 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <h1 className="mt-5 font-display text-2xl font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-300">
              The page hit an unexpected error. Your data is safe — reload to continue.
            </p>
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-ink-50 p-3 text-left text-[11px] text-ink-500 dark:bg-ink-900 dark:text-ink-300">
              {this.state.error.message}
            </pre>
            <Button className="mt-5" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ──────────────────────────────── Guards ───────────────────────────────── */

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <>{children}</>;
}

function RequireCustomer({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.kind === 'staff') return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

function RequireStaff() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user.kind !== 'staff') return <Navigate to="/" replace />;
  return <Outlet />;
}

function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { has } = useAuth();
  if (!has(permission)) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h2 className="mt-5 font-display text-xl font-semibold">Access restricted</h2>
        <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-300">
          Your role does not include the <code className="rounded bg-ink-100 px-1 py-0.5 text-xs dark:bg-ink-800">{permission}</code>{' '}
          permission. Ask a Super Admin to update your role.
        </p>
      </Card>
    );
  }
  return <>{children}</>;
}

/* ───────────────────────────────── Routes ──────────────────────────────── */

export default function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <BrowserRouter>
          <Routes>
            {/* Storefront */}
            <Route element={<StorefrontLayout />}>
              <Route index element={<HomePage />} />
              <Route path="products" element={<ShopPage />} />
              <Route path="products/:idOrSlug" element={<ProductDetailPage />} />
              <Route path="product/:idOrSlug" element={<ProductDetailPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="checkout" element={<CheckoutPage />} />
              <Route path="track" element={<OrderTrackPage />} />
              <Route path="order-track" element={<OrderTrackPage />} />
              <Route
                path="account"
                element={
                  <RequireAuth>
                    <RequireCustomer>
                      <AccountPage />
                    </RequireCustomer>
                  </RequireAuth>
                }
              />
              <Route path="wishlist" element={<Navigate to="/account?tab=wishlist" replace />} />
              <Route path="account/orders" element={<Navigate to="/account?tab=orders" replace />} />
              <Route path="login" element={<AuthPage mode="login" />} />
              <Route path="register" element={<AuthPage mode="register" />} />
              <Route path="about" element={<ContentPageRoute />} />
              <Route path="contact" element={<ContentPageRoute />} />
              <Route path="faq" element={<ContentPageRoute />} />
              <Route path="privacy" element={<ContentPageRoute />} />
              <Route path="terms" element={<ContentPageRoute />} />
              <Route path="returns" element={<ContentPageRoute />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>

            {/* Admin console */}
            <Route path="admin" element={<RequireStaff />}>
              <Route element={<AdminLayout />}>
                <Route
                  index
                  element={
                    <RequirePermission permission="dashboard:view">
                      <AdminDashboardPage />
                    </RequirePermission>
                  }
                />
                <Route
                  path="products"
                  element={
                    <RequirePermission permission="products:view">
                      <Products />
                    </RequirePermission>
                  }
                />
                <Route
                  path="categories"
                  element={
                    <RequirePermission permission="products:view">
                      <Catalog />
                    </RequirePermission>
                  }
                />
                <Route
                  path="reviews"
                  element={
                    <RequirePermission permission="products:view">
                      <Reviews />
                    </RequirePermission>
                  }
                />
                <Route
                  path="inventory"
                  element={
                    <RequirePermission permission="inventory:view">
                      <Inventory />
                    </RequirePermission>
                  }
                />
                <Route
                  path="pos"
                  element={
                    <RequirePermission permission="pos:use">
                      <POS />
                    </RequirePermission>
                  }
                />
                <Route
                  path="orders"
                  element={
                    <RequirePermission permission="orders:view">
                      <Orders />
                    </RequirePermission>
                  }
                />
                <Route
                  path="returns"
                  element={
                    <RequirePermission permission="returns:view">
                      <Returns />
                    </RequirePermission>
                  }
                />
                <Route
                  path="customers"
                  element={
                    <RequirePermission permission="customers:view">
                      <Customers />
                    </RequirePermission>
                  }
                />
                <Route
                  path="suppliers"
                  element={
                    <RequirePermission permission="suppliers:view">
                      <Suppliers />
                    </RequirePermission>
                  }
                />
                <Route
                  path="purchases"
                  element={
                    <RequirePermission permission="purchases:view">
                      <Purchases />
                    </RequirePermission>
                  }
                />
                <Route
                  path="employees"
                  element={
                    <RequirePermission permission="employees:view">
                      <Employees />
                    </RequirePermission>
                  }
                />
                <Route
                  path="finance"
                  element={
                    <RequirePermission permission="finance:view">
                      <Finance />
                    </RequirePermission>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <RequirePermission permission="reports:view">
                      <Reports />
                    </RequirePermission>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <RequirePermission permission="settings:view">
                      <Settings />
                    </RequirePermission>
                  }
                />
                <Route
                  path="audit"
                  element={
                    <RequirePermission permission="audit:view">
                      <Audit />
                    </RequirePermission>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AppProviders>
    </ErrorBoundary>
  );
}
