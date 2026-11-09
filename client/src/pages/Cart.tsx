import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart, useLanguage, useSettings } from '@/context/AppProviders';
import { useDocumentTitle, useMoney } from '@/lib/hooks';
import { Breadcrumbs, ProductImage, QuantityStepper } from '@/components/Storefront';
import { Button, EmptyState } from '@/components/ui';

export default function CartPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('cart.title'));
  const { lines, subtotal, setQuantity, remove, count } = useCart();
  const { settings } = useSettings();
  const { format } = useMoney();
  const navigate = useNavigate();

  const deliveryFee =
    subtotal >= (settings?.freeDeliveryThreshold ?? 0) && (settings?.freeDeliveryThreshold ?? 0) > 0
      ? 0
      : settings?.deliveryFee ?? 0;
  const tax = settings?.taxEnabled ? subtotal * ((settings?.taxRate ?? 0) / 100) : 0;
  const total = subtotal + deliveryFee + tax;

  if (!lines.length) {
    return (
      <div className="container-page py-16">
        <Breadcrumbs items={[{ label: t('cart.title') }]} />
        <EmptyState
          icon={<ShoppingBag className="h-6 w-6" />}
          title={t('cart.emptyTitle')}
          description={t('cart.emptyDesc')}
          action={
            <Link to="/products">
              <Button>
                {t('cart.startShopping')} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: t('cart.title') }]} />
      <h1 className="display mt-4 text-3xl font-semibold sm:text-4xl">{t('cart.title')}</h1>
      <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-300">
        {count} {t('hero.readyOnShelves')}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {lines.map((line) => {
            const delta = line.product.variations?.find((item) => item.label === line.variation)?.priceDelta ?? 0;
            const unitPrice = line.product.price + delta;
            return (
              <div
                key={`${line.product._id}-${line.variation ?? ''}`}
                className="surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
              >
                <Link
                  to={`/products/${line.product.slug}`}
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-line bg-ink-50 dark:border-ink-800 dark:bg-ink-800"
                >
                  <ProductImage product={line.product} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/products/${line.product.slug}`}
                    className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-gold-700 dark:text-white dark:hover:text-gold-300"
                  >
                    {line.product.name}
                  </Link>
                  {line.variation && <p className="mt-0.5 text-xs text-ink-400">{line.variation}</p>}
                  <p className="mt-1 text-xs text-ink-400">
                    {format(unitPrice)} · {line.product.unit}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3 sm:hidden">
                    <QuantityStepper
                      size="sm"
                      value={line.quantity}
                      max={Math.max(line.product.stock, 1)}
                      onChange={(value) => setQuantity(line.product._id, value, line.variation)}
                    />
                    <p className="text-sm font-semibold">{format(unitPrice * line.quantity)}</p>
                  </div>
                </div>
                <div className="hidden items-center gap-4 sm:flex">
                  <QuantityStepper
                    size="sm"
                    value={line.quantity}
                    max={Math.max(line.product.stock, 1)}
                    onChange={(value) => setQuantity(line.product._id, value, line.variation)}
                  />
                  <p className="w-20 text-right text-sm font-semibold">{format(unitPrice * line.quantity)}</p>
                  <button
                    onClick={() => remove(line.product._id, line.variation)}
                    className="rounded-lg p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                    aria-label={`Remove ${line.product.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => remove(line.product._id, line.variation)}
                  className="self-end rounded-lg p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-500 sm:hidden"
                  aria-label={`Remove ${line.product.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <aside className="h-fit">
          <div className="surface sticky top-24 p-5">
            <h2 className="font-display text-lg font-semibold">{t('cart.summary')}</h2>
            <dl className="mt-4 space-y-2.5 text-sm">
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

            {settings && settings.freeDeliveryThreshold > 0 && subtotal < settings.freeDeliveryThreshold && (
              <p className="mt-3 rounded-lg bg-gold-50 px-3 py-2 text-xs text-gold-800 dark:bg-gold-900/30 dark:text-gold-200">
                {t('cart.spendMore').replace('{amount}', format(settings.freeDeliveryThreshold - subtotal))}
              </p>
            )}

            <Button size="lg" className="mt-5 w-full" onClick={() => navigate('/checkout')}>
              {t('cart.proceed')} <ArrowRight className="h-4 w-4" />
            </Button>
            <Link
              to="/products"
              className="mt-3 block text-center text-xs font-medium text-ink-400 hover:text-ink-700 dark:hover:text-white"
            >
              {t('cart.continue')}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
