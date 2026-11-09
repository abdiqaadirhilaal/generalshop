import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Banknote, CheckCircle2, CreditCard, Lock, MapPin, Smartphone, Truck } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth, useCart, useLanguage, useSettings, useToast } from '@/context/AppProviders';
import { useDocumentTitle, useMoney } from '@/lib/hooks';
import { Breadcrumbs, ProductImage } from '@/components/Storefront';
import { Alert, Button, EmptyState, Field, Input, Textarea } from '@/components/ui';
import type { CustomerAddress } from '@/types';

interface PlacedOrder {
  orderNumber: string;
  id: string;
  total: number;
  status: string;
  paymentStatus: string;
}

const METHOD_ICONS: Record<string, typeof Banknote> = {
  cash_on_delivery: Truck,
  cash_at_shop: Banknote,
  evc: Smartphone,
  zaad: Smartphone,
  sahal: Smartphone,
  edahab: Smartphone,
  bank: CreditCard,
  card: CreditCard,
};

export default function CheckoutPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('checkout.title'));
  const { lines, subtotal, clear } = useCart();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { format } = useMoney();
  const { success } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: user?.name ?? '',
    phone: user?.phone ?? '',
    address: '',
    city: '',
    notes: '',
    guestEmail: '',
  });
  const [paymentMethod, setPaymentMethod] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const methods = useMemo(() => settings?.paymentMethods?.filter((method) => method.enabled) ?? [], [settings]);
  const selectedMethod = methods.find((method) => method.key === paymentMethod);

  const { data: addresses } = useQuery({
    queryKey: ['account-addresses'],
    queryFn: () => api.get<CustomerAddress[]>('/account/addresses'),
    enabled: Boolean(user && user.kind === 'customer'),
  });

  useEffect(() => {
    if (!paymentMethod && methods.length) setPaymentMethod(methods[0].key);
  }, [methods, paymentMethod]);

  useEffect(() => {
    if (!user) return;
    const preferred = addresses?.find((entry) => entry.isDefault) ?? addresses?.[0];
    setForm((current) => ({
      ...current,
      fullName: current.fullName || user.name,
      phone: current.phone || user.phone || '',
      address: current.address || preferred?.address || '',
      city: current.city || preferred?.city || '',
    }));
  }, [user, addresses]);

  const deliveryFee =
    (settings?.freeDeliveryThreshold ?? 0) > 0 && subtotal >= (settings?.freeDeliveryThreshold ?? 0)
      ? 0
      : settings?.deliveryFee ?? 0;
  const tax = settings?.taxEnabled ? subtotal * ((settings?.taxRate ?? 0) / 100) : 0;
  const total = subtotal + deliveryFee + tax;

  const submit = async () => {
    setError('');
    if (!form.fullName.trim() || !form.phone.trim() || !form.address.trim() || !form.city.trim()) {
      setError('Please complete your delivery details.');
      return;
    }
    if (!paymentMethod) {
      setError('Please choose a payment method.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.post<PlacedOrder>('/orders', {
        items: lines.map((line) => ({
          productId: line.product._id,
          quantity: line.quantity,
          variation: line.variation,
        })),
        shippingAddress: {
          fullName: form.fullName,
          phone: form.phone,
          address: form.address,
          city: form.city,
          notes: form.notes || undefined,
        },
        paymentMethod,
        guestEmail: user ? undefined : form.guestEmail || undefined,
      });
      clear();
      setPlaced(order);
      success(`Order ${order.orderNumber} placed successfully`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  if (placed) {
    return (
      <div className="container-page py-16">
        <div className="surface mx-auto max-w-xl p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <h1 className="display mt-5 text-2xl font-semibold">Thank you for your order</h1>
          <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-300">
            Your order <span className="font-semibold text-ink-900 dark:text-white">{placed.orderNumber}</span> has been
            received. We will contact you on {form.phone} to confirm delivery.
          </p>
          <div className="mt-5 rounded-xl bg-ink-50 p-4 text-sm dark:bg-ink-800">
            <div className="flex justify-between">
              <span className="text-ink-500 dark:text-ink-300">Order total</span>
              <span className="font-semibold">{format(placed.total)}</span>
            </div>
            <div className="mt-1.5 flex justify-between">
              <span className="text-ink-500 dark:text-ink-300">Payment</span>
              <span className="font-medium capitalize">{selectedMethod?.label ?? paymentMethod}</span>
            </div>
            {selectedMethod?.manualVerification && (
              <p className="mt-3 text-left text-xs text-amber-700 dark:text-amber-300">
                {selectedMethod.instructions ||
                  'Your payment will be verified manually by our team. Please keep your transaction reference handy.'}
              </p>
            )}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/products">
              <Button variant="outline">Continue shopping</Button>
            </Link>
            <Link to="/track">
              <Button>Track your order</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="container-page py-16">
        <EmptyState
          title="Your cart is empty"
          description="Add products to your cart before checking out."
          action={
            <Link to="/products">
              <Button>Browse products</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: t('cart.title'), to: '/cart' }, { label: t('checkout.title') }]} />
      <h1 className="display mt-4 text-3xl font-semibold sm:text-4xl">{t('checkout.title')}</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-300">
        {user ? `Signed in as ${user.email}` : 'Checking out as a guest — you can create an account later.'}
      </p>

      {error && (
        <div className="mt-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="surface p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <MapPin className="h-4 w-4 text-gold-600" /> {t('checkout.details')}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t('checkout.fullName')} required className="sm:col-span-1">
                <Input value={form.fullName} onChange={(event) => setForm((value) => ({ ...value, fullName: event.target.value }))} />
              </Field>
              <Field label={t('checkout.phone')} required>
                <Input
                  value={form.phone}
                  onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))}
                  placeholder="+252 61 000 0000"
                />
              </Field>
              <Field label={t('checkout.address')} required className="sm:col-span-2">
                <Input
                  value={form.address}
                  onChange={(event) => setForm((value) => ({ ...value, address: event.target.value }))}
                  placeholder="Street, building, landmark"
                />
              </Field>
              <Field label={t('checkout.city')} required>
                <Input value={form.city} onChange={(event) => setForm((value) => ({ ...value, city: event.target.value }))} />
              </Field>
              {!user && (
                <Field label={t('checkout.guestEmail')} hint="Optional but recommended">
                  <Input
                    type="email"
                    value={form.guestEmail}
                    onChange={(event) => setForm((value) => ({ ...value, guestEmail: event.target.value }))}
                  />
                </Field>
              )}
              <Field label={t('checkout.notes')} className="sm:col-span-2">
                <Textarea
                  value={form.notes}
                  onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
                  placeholder="Anything we should know about your delivery?"
                  className="min-h-20"
                />
              </Field>
            </div>
          </section>

          <section className="surface p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <CreditCard className="h-4 w-4 text-gold-600" /> {t('checkout.paymentMethod')}
            </h2>
            <div className="mt-4 space-y-2">
              {methods.map((method) => {
                const Icon = METHOD_ICONS[method.key] ?? Banknote;
                return (
                  <label
                    key={method.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      paymentMethod === method.key
                        ? 'border-gold bg-gold-50/60 dark:bg-gold-900/20'
                        : 'border-line hover:border-ink-300 dark:border-ink-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === method.key}
                      onChange={() => setPaymentMethod(method.key)}
                      className="mt-1 h-4 w-4 accent-gold"
                    />
                    <Icon className="mt-0.5 h-5 w-5 text-ink-500 dark:text-ink-300" />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-ink-900 dark:text-white">{method.label}</span>
                      {method.instructions && (
                        <span className="mt-0.5 block text-xs leading-5 text-ink-400">{method.instructions}</span>
                      )}
                      {method.manualVerification && (
                        <span className="mt-1 inline-block text-[11px] font-medium text-amber-600 dark:text-amber-300">
                          Manually verified
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {selectedMethod?.manualVerification && (
              <div className="mt-4">
                <Alert tone="warning" title="Manual verification">
                  After placing your order, our team will verify your {selectedMethod.label} payment before dispatch.
                  {selectedMethod.requiresReference ? ' Keep your transaction reference ready.' : ''}
                </Alert>
              </div>
            )}
          </section>
        </div>

        <aside className="h-fit">
          <div className="surface sticky top-24 p-5">
            <h2 className="font-display text-lg font-semibold">Order summary</h2>
            <div className="mt-4 max-h-64 space-y-3 overflow-y-auto pr-1">
              {lines.map((line) => {
                const delta = line.product.variations?.find((item) => item.label === line.variation)?.priceDelta ?? 0;
                return (
                  <div key={`${line.product._id}-${line.variation ?? ''}`} className="flex gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-ink-50 dark:border-ink-800 dark:bg-ink-800">
                      <ProductImage product={line.product} />
                      <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-ink-900 text-[10px] font-bold text-white dark:bg-gold dark:text-ink-950">
                        {line.quantity}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-medium text-ink-800 dark:text-ink-100">{line.product.name}</p>
                      {line.variation && <p className="text-[11px] text-ink-400">{line.variation}</p>}
                    </div>
                    <p className="text-xs font-semibold">{format((line.product.price + delta) * line.quantity)}</p>
                  </div>
                );
              })}
            </div>
            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-sm dark:border-ink-800">
              <div className="flex justify-between">
                <dt className="text-ink-500 dark:text-ink-300">{t('cart.subtotal')}</dt>
                <dd className="font-medium">{format(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-500 dark:text-ink-300">{t('cart.delivery')}</dt>
                <dd className="font-medium">{deliveryFee === 0 ? t('cart.free') : format(deliveryFee)}</dd>
              </div>
              {settings?.taxEnabled && (
                <div className="flex justify-between">
                  <dt className="text-ink-500 dark:text-ink-300">{t('cart.tax')} ({settings.taxRate}%)</dt>
                  <dd className="font-medium">{format(tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-3 text-base dark:border-ink-800">
                <dt className="font-semibold">{t('cart.total')}</dt>
                <dd className="font-display font-semibold">{format(total)}</dd>
              </div>
            </dl>
            <Button size="lg" className="mt-5 w-full" loading={submitting} onClick={submit}>
              <Lock className="h-4 w-4" /> {t('checkout.placeOrder')} <ArrowRight className="h-4 w-4" />
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
              <Lock className="h-3 w-3" /> Your details are transmitted securely.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
