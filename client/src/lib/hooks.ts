import { useEffect, useMemo, useState } from 'react';
import { useSettings } from '@/context/AppProviders';
import { formatMoney } from './format';

/** Sets the browser tab title. */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · HILAAL`;
  }, [title]);
}

/** Debounces a rapidly changing value (search boxes, filters). */
export function useDebounced<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Currency formatter bound to the live shop settings. */
export function useMoney() {
  const { settings } = useSettings();
  const symbol = settings?.currencySymbol ?? '$';
  const currency = settings?.currency ?? 'USD';
  return useMemo(
    () => ({
      symbol,
      currency,
      format: (value: number | null | undefined) => formatMoney(value, symbol, currency),
    }),
    [symbol, currency]
  );
}

/** Resolves the current page from a URL search param, clamped to a range. */
export function usePageParam(searchParams: URLSearchParams, totalPages = 1) {
  const parsed = Number(searchParams.get('page') ?? '1');
  const page = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  return Math.min(page, Math.max(totalPages, 1));
}

/** Formats an arbitrary record of counts into tab entries. */
export function countTabs(counts: Record<string, number> | undefined) {
  return counts ?? {};
}
