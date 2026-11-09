import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import type { CartLine, Product, ShopSettings, User } from '@/types';
import { LanguageProvider, useLanguage } from './LanguageContext';

export { useLanguage, LanguageProvider } from './LanguageContext';
export type { Language } from './LanguageContext';

/* ───────────────────────────────── Auth ───────────────────────────────── */

interface AuthState {
  user: User | null;
  permissions: string[];
  loading: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
    address?: string;
    city?: string;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateProfile: (input: { name?: string; phone?: string }) => Promise<void>;
  has: (permission: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<{ user: User | null; permissions?: string[] }>('/auth/me');
      setUser(result.user);
      setPermissions(result.permissions ?? result.user?.role?.permissions ?? []);
    } catch {
      setUser(null);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ user: User }>('/auth/login', { email, password });
    setUser(result.user);
    setPermissions(result.user.role?.permissions ?? []);
    return result.user;
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; phone: string; password: string; address?: string; city?: string }) => {
      const result = await api.post<{ user: User }>('/auth/register', input);
      setUser(result.user);
      setPermissions([]);
      return result.user;
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
    setPermissions([]);
  }, []);

  const updateProfile = useCallback(async (input: { name?: string; phone?: string }) => {
    const result = await api.patch<{ user: User }>('/auth/me', input);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      permissions,
      loading,
      isStaff: user?.kind === 'staff',
      login,
      register,
      logout,
      refresh,
      updateProfile,
      has: (permission: string) => permissions.includes(permission),
    }),
    [user, permissions, loading, login, register, logout, refresh, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/* ──────────────────────────────── Settings ─────────────────────────────── */

interface SettingsState {
  settings: ShopSettings | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.get<ShopSettings>('/settings');
      setSettings(result);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ settings, loading, refresh }), [settings, loading, refresh]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used inside SettingsProvider');
  return context;
}

/* ───────────────────────────────── Theme ───────────────────────────────── */

type Theme = 'light' | 'dark';
interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function initialTheme(): Theme {
  const stored = localStorage.getItem('hilaal_theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('hilaal_theme', theme);
  }, [theme]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      toggle: () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
      setTheme: setThemeState,
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider');
  return context;
}

/* ────────────────────────────────── Cart ───────────────────────────────── */

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: Product, quantity?: number, variation?: string) => void;
  remove: (productId: string, variation?: string) => void;
  setQuantity: (productId: string, quantity: number, variation?: string) => void;
  clear: () => void;
  has: (productId: string, variation?: string) => boolean;
}

const CartContext = createContext<CartState | null>(null);

function readCart(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('hilaal_cart') ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(readCart);

  useEffect(() => {
    localStorage.setItem('hilaal_cart', JSON.stringify(lines));
  }, [lines]);

  const add = useCallback((product: Product, quantity = 1, variation?: string) => {
    setLines((current) => {
      const index = current.findIndex(
        (line) => line.product._id === product._id && line.variation === variation
      );
      if (index >= 0) {
        const next = [...current];
        next[index] = {
          ...next[index],
          quantity: Math.min(next[index].quantity + quantity, Math.max(product.stock, 1)),
        };
        return next;
      }
      return [...current, { product, quantity, variation }];
    });
  }, []);

  const remove = useCallback((productId: string, variation?: string) => {
    setLines((current) =>
      current.filter((line) => !(line.product._id === productId && line.variation === variation))
    );
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number, variation?: string) => {
    setLines((current) =>
      current
        .map((line) =>
          line.product._id === productId && line.variation === variation
            ? { ...line, quantity: Math.max(1, Math.min(quantity, Math.max(line.product.stock, 1))) }
            : line
        )
        .filter((line) => line.quantity > 0)
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const subtotal = useMemo(
    () =>
      lines.reduce((sum, line) => {
        const delta = line.product.variations?.find((variation) => variation.label === line.variation)?.priceDelta ?? 0;
        return sum + (line.product.price + delta) * line.quantity;
      }, 0),
    [lines]
  );

  const count = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);

  const value = useMemo<CartState>(
    () => ({
      lines,
      count,
      subtotal,
      add,
      remove,
      setQuantity,
      clear,
      has: (productId, variation) =>
        lines.some((line) => line.product._id === productId && line.variation === variation),
    }),
    [lines, count, subtotal, add, remove, setQuantity, clear]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider');
  return context;
}

/* ───────────────────────────────── Toasts ──────────────────────────────── */

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toast: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (error: unknown) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      counter.current += 1;
      const id = counter.current;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const success = useCallback((message: string) => toast(message, 'success'), [toast]);
  const error = useCallback((value: unknown) => toast(apiErrorMessage(value), 'error'), [toast]);

  const value = useMemo(() => ({ toast, success, error }), [toast, success, error]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end">
        <AnimatePresence initial={false}>
          {toasts.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lift backdrop-blur',
                item.tone === 'success' && 'border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-100',
                item.tone === 'error' && 'border-rose-200 bg-rose-50/95 text-rose-900 dark:border-rose-800 dark:bg-rose-950/90 dark:text-rose-100',
                item.tone === 'info' && 'border-line bg-white/95 text-ink-800 dark:border-ink-700 dark:bg-ink-900/95 dark:text-ink-100'
              )}
              role="status"
            >
              {item.tone === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : item.tone === 'error' ? (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p className="flex-1 leading-5">{item.message}</p>
              <button onClick={() => dismiss(item.id)} aria-label="Dismiss notification" className="opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}

/* ─────────────────────────────── Composition ───────────────────────────── */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <ToastProvider>
            <AuthProvider>
              <SettingsProvider>
                <CartProvider>{children}</CartProvider>
              </SettingsProvider>
            </AuthProvider>
          </ToastProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
