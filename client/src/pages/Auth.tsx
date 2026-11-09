import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Lock, Mail, Phone, UserRound } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api';
import { useAuth, useLanguage } from '@/context/AppProviders';
import { useDocumentTitle } from '@/lib/hooks';
import { BrandMark } from '@/components/Storefront';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t } = useLanguage();
  useDocumentTitle(mode === 'login' ? t('auth.login') : t('auth.register'));
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    address: '',
    city: '',
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const user = await login(form.email, form.password);
        navigate(user.kind === 'staff' ? '/admin' : from, { replace: true });
      } else {
        const user = await register({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          address: form.address || undefined,
          city: form.city || undefined,
        });
        navigate(user.kind === 'staff' ? '/admin' : from, { replace: true });
      }
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-5rem)] lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink-950 p-10 text-white lg:flex">
        <BrandMark light />
        <div>
          <p className="eyebrow text-gold-300">Shop Smarter. Manage Better. Grow Faster.</p>
          <h2 className="display mt-4 max-w-md text-4xl font-semibold leading-tight">
            {mode === 'login' ? 'Welcome back to HILAAL.' : 'Join the HILAAL community.'}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-ink-300">
            {mode === 'login'
              ? 'Sign in to track orders, manage your addresses, earn loyalty points and shop faster.'
              : 'Create an account to save your favourites, follow your orders and collect loyalty points on every purchase.'}
          </p>
          <ul className="mt-8 space-y-3 text-sm text-ink-200">
            {['Order tracking & invoices', 'Saved addresses for faster checkout', 'Loyalty points on every order'].map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-gold text-[11px] font-bold text-ink-950">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-ink-500">© {new Date().getFullYear()} HILAAL General Shop</p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="display text-2xl font-semibold sm:text-3xl">
            {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-300">
            {mode === 'login' ? 'New to HILAAL?' : 'Already have an account?'}{' '}
            <Link
              to={mode === 'login' ? '/register' : '/login'}
              className="font-medium text-gold-700 hover:underline dark:text-gold-300"
            >
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </Link>
          </p>

          {error && (
            <div className="mt-5">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={submit}>
            {mode === 'register' && (
              <>
                <Field label="Full name" required>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <Input
                      className="pl-9"
                      value={form.name}
                      onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
                      placeholder="Amina Yusuf"
                      autoComplete="name"
                    />
                  </div>
                </Field>
                <Field label="Phone number" required>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <Input
                      className="pl-9"
                      value={form.phone}
                      onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))}
                      placeholder="+252 61 000 0000"
                      autoComplete="tel"
                    />
                  </div>
                </Field>
              </>
            )}
            <Field label="Email address" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  className="pl-9"
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </Field>
            <Field
              label="Password"
              required
              hint={mode === 'register' ? 'At least 8 characters, including a letter and a number.' : undefined}
            >
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <Input
                  className="pl-9 pr-10"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm((value) => ({ ...value, password: event.target.value }))}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-400 hover:text-ink-700 dark:hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            {mode === 'register' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Address" hint="Optional">
                  <Input
                    value={form.address}
                    onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))}
                    placeholder="Street, building"
                  />
                </Field>
                <Field label="City" hint="Optional">
                  <Input
                    value={form.city}
                    onChange={(event) => setForm((value) => ({ ...value, city: event.target.value }))}
                  />
                </Field>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === 'login' ? 'Sign in' : 'Create account'} <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-400">
            By continuing you agree to our{' '}
            <Link to="/terms" className="underline hover:text-ink-700 dark:hover:text-white">
              terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline hover:text-ink-700 dark:hover:text-white">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
