import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, MapPin, Package, Search, Truck } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useMoney } from '@/lib/hooks';
import { Breadcrumbs } from '@/components/Storefront';
import { Alert, Button, EmptyState, Field, Input } from '@/components/ui';
import { ORDER_STATUS_LABELS, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui';
import { useLanguage } from '@/context/AppProviders';

const STATUS_TONE: Record<string, 'slate' | 'emerald' | 'amber' | 'rose' | 'blue'> = {
  pending: 'amber',
  confirmed: 'emerald',
  processing: 'amber',
  ready_for_delivery: 'amber',
  shipped: 'blue',
  delivered: 'emerald',
  cancelled: 'rose',
  returned: 'slate',
};
import type { OrderStatus } from '@/types';

interface TrackResult {
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: string;
  total: number;
  createdAt: string;
  deliveredAt?: string;
  items: { name: string; quantity: number; lineTotal: number }[];
  statusHistory: { status: OrderStatus; at: string; byName?: string; note?: string }[];
  shippingAddress: { fullName: string; city: string };
}

const STEPS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'ready_for_delivery', 'shipped', 'delivered'];

export default function OrderTrackPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('track.title'));
  const [params] = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get('order') ?? '');
  const [phone, setPhone] = useState(params.get('phone') ?? '');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const { format } = useMoney();

  const lookup = async () => {
    if (!orderNumber.trim() || !phone.trim()) {
      setError('Enter both your order number and the phone used at checkout.');
      return;
    }
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const data = await api.get<TrackResult | null>(
        `/order-track/${encodeURIComponent(orderNumber.trim())}?phone=${encodeURIComponent(phone.trim())}`
      );
      setResult(data);
    } catch (lookupError) {
      setError(apiErrorMessage(lookupError));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = result ? STEPS.indexOf(result.status) : -1;
  const cancelled = result?.status === 'cancelled' || result?.status === 'returned';

  return (
    <div className="container-page py-10">
      <Breadcrumbs items={[{ label: t('track.title') }]} />
      <div className="mx-auto mt-6 max-w-2xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
            <Truck className="h-6 w-6" />
          </span>
          <h1 className="display mt-4 text-3xl font-semibold">{t('track.title')}</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
            {t('track.subtitle')}
          </p>
        </div>

        <div className="surface mt-6 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('track.orderNumber')} required>
              <Input
                value={orderNumber}
                onChange={(event) => setOrderNumber(event.target.value)}
                placeholder="ORD-2026-00001"
                onKeyDown={(event) => event.key === 'Enter' && lookup()}
              />
            </Field>
            <Field label={t('checkout.phone')} required>
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+252 61 000 0000"
                onKeyDown={(event) => event.key === 'Enter' && lookup()}
              />
            </Field>
          </div>
          {error && (
            <div className="mt-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          )}
          <Button className="mt-4 w-full" loading={loading} onClick={lookup}>
            <Search className="h-4 w-4" /> {t('track.button')}
          </Button>
        </div>

        {searched && !loading && !result && (
          <div className="mt-6">
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="No order found"
              description="Check the order number and phone number and try again. Order numbers look like ORD-2026-00001."
            />
          </div>
        )}

        {result && (
          <div className="surface mt-6 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5 dark:border-ink-800">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-400">Order</p>
                <p className="font-display text-lg font-semibold">{result.orderNumber}</p>
                <p className="text-xs text-ink-400">Placed {formatDate(result.createdAt, true)}</p>
              </div>
              <Badge tone={STATUS_TONE[result.status] ?? 'slate'} className="px-3 py-1 text-xs">
                {ORDER_STATUS_LABELS[result.status]}
              </Badge>
            </div>

            {cancelled ? (
              <div className="p-5">
                <Alert tone="warning" title={`This order is ${result.status}`}>
                  Please contact the shop if you need more information.
                </Alert>
              </div>
            ) : (
              <div className="p-5">
                <div className="relative">
                  {STEPS.map((step, index) => {
                    const done = index <= currentStep;
                    return (
                      <div key={step} className="relative flex gap-4 pb-6 last:pb-0">
                        {index < STEPS.length - 1 && (
                          <span
                            className={`absolute left-[15px] top-8 h-full w-0.5 ${
                              index < currentStep ? 'bg-gold' : 'bg-line dark:bg-ink-800'
                            }`}
                          />
                        )}
                        <span
                          className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                            done ? 'bg-gold text-ink-950' : 'bg-ink-100 text-ink-400 dark:bg-ink-800'
                          }`}
                        >
                          {done ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                        </span>
                        <div className="pt-1">
                          <p className={`text-sm font-medium ${done ? 'text-ink-900 dark:text-white' : 'text-ink-400'}`}>
                            {ORDER_STATUS_LABELS[step]}
                          </p>
                          {(() => {
                            const event = result.statusHistory.find((entry) => entry.status === step);
                            return event ? (
                              <p className="text-xs text-ink-400">
                                {formatDate(event.at, true)}
                                {event.byName ? ` · ${event.byName}` : ''}
                              </p>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-line p-5 dark:border-ink-800">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                    <MapPin className="h-3.5 w-3.5" /> Deliver to
                  </p>
                  <p className="mt-1.5 text-sm font-medium">{result.shippingAddress.fullName}</p>
                  <p className="text-sm text-ink-500 dark:text-ink-300">{result.shippingAddress.city}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Payment</p>
                  <p className="mt-1.5 text-sm font-medium capitalize">{result.paymentStatus}</p>
                  <p className="text-sm text-ink-500 dark:text-ink-300">{format(result.total)}</p>
                </div>
              </div>
              <ul className="mt-4 divide-y divide-line text-sm dark:divide-ink-800">
                {result.items.map((item, index) => (
                  <li key={index} className="flex justify-between py-2">
                    <span className="text-ink-600 dark:text-ink-300">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="font-medium">{format(item.lineTotal)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-ink-400">
          Need help?{' '}
          <Link to="/contact" className="font-medium text-gold-700 hover:underline dark:text-gold-300">
            Contact the shop
          </Link>
        </p>
      </div>
    </div>
  );
}
