import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  HeartHandshake,
  Quote,
  ShieldCheck,
  Sparkles,
  Truck,
  Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useLanguage } from '@/context/AppProviders';
import {
  NewsletterForm,
  Price,
  ProductCard,
  ProductImage,
  QuickViewModal,
  RatingStars,
  SectionHeading,
  ViewAllLink,
} from '@/components/Storefront';
import { Button, EmptyState, ProductCardSkeleton, Skeleton } from '@/components/ui';
import type { HomeData, Product } from '@/types';

export default function HomePage() {
  const { t } = useLanguage();
  useDocumentTitle('HILAAL — ' + t('hero.title'));
  const [quickView, setQuickView] = useState<Product | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/home'),
  });

  const sections = data?.sections ?? {};
  const hero = data?.settings?.homepage?.hero;
  const heroImage = useMemo(() => {
    if (hero?.image) return hero.image;
    return data?.newArrivals?.[0]?.images?.[0] ?? data?.bestSellers?.[0]?.images?.[0] ?? '';
  }, [hero?.image, data]);

  if (isError) {
    return (
      <div className="container-page py-24">
        <EmptyState
          title="The shop could not be loaded"
          description="Please check your connection and try again."
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ─────────────────────────────── Hero ─────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-b from-white to-canvas dark:border-ink-800 dark:from-ink-900 dark:to-ink-950">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-ink-200/30 blur-3xl dark:bg-ink-700/20" />
        <div className="container-page relative grid items-center gap-12 py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <p className="eyebrow mb-4 flex items-center gap-2">
              <span className="h-px w-8 bg-gold" /> {hero?.eyebrow ?? t('hero.badge')}
            </p>
            <h1 className="display max-w-xl text-balance text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl">
              {hero?.title ?? t('hero.title')}
            </h1>
            <p className="mt-5 max-w-lg text-[15px] leading-7 text-ink-500 dark:text-ink-300">
              {hero?.subtitle ?? t('hero.subtitle')}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to={hero?.ctaLink ?? '/products'}>
                <Button size="lg" variant="secondary">
                  {hero?.ctaLabel ?? t('hero.cta')} <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to={hero?.secondaryLink ?? '/about'}>
                <Button size="lg" variant="outline">
                  {hero?.secondaryLabel ?? t('hero.secondary')}
                </Button>
              </Link>
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-line pt-6 dark:border-ink-800">
              <div>
                <p className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
                  {data?.stats.products ?? '—'}
                </p>
                <p className="text-xs text-ink-400">{t('hero.inStock')}</p>
              </div>
              <div className="h-9 w-px bg-line dark:bg-ink-800" />
              <div>
                <p className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
                  {data?.stats.categories ?? '—'}
                </p>
                <p className="text-xs text-ink-400">{t('hero.curatedCategories')}</p>
              </div>
              <div className="h-9 w-px bg-line dark:bg-ink-800" />
              <div className="flex items-center gap-2">
                <RatingStars rating={4.9} showValue />
                <p className="text-xs text-ink-400">{data?.stats.reviews ?? 0} {t('hero.reviews')}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="relative mx-auto w-full max-w-lg lg:max-w-none"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] border border-line bg-ink-100 shadow-lift dark:border-ink-700 dark:bg-ink-800">
              {isLoading ? (
                <Skeleton className="h-full w-full rounded-none" />
              ) : heroImage ? (
                <img src={heroImage} alt="HILAAL shop" className="h-full w-full object-cover" />
              ) : (
                <div className="grain flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-100 to-gold-100 dark:from-ink-800 dark:to-ink-700">
                  <Sparkles className="h-16 w-16 text-gold/60" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/70 to-transparent p-6 pt-20">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/60">HILAAL General Shop</p>
                <p className="mt-1 font-display text-xl font-medium text-white">{t('hero.brandSlogan')}</p>
              </div>
            </div>

            <div className="absolute -left-3 top-8 hidden rounded-xl border border-line bg-white/95 p-3 shadow-lift backdrop-blur dark:border-ink-700 dark:bg-ink-900/95 sm:block">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <Truck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-ink-900 dark:text-white">{t('hero.sameDayDelivery')}</p>
                  <p className="text-[10px] text-ink-400">{t('hero.onLocalOrders')}</p>
                </div>
              </div>
            </div>

            <div className="absolute -right-3 bottom-20 hidden rounded-xl border border-line bg-white/95 p-3 shadow-lift backdrop-blur dark:border-ink-700 dark:bg-ink-900/95 sm:block">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300">
                  <BadgeCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold text-ink-900 dark:text-white">{data?.stats.units ?? 0} units</p>
                  <p className="text-[10px] text-ink-400">{t('hero.readyOnShelves')}</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ──────────────────────────── Trust strip ─────────────────────────── */}
      <section className="border-b border-line bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="container-page grid grid-cols-2 gap-px py-5 sm:grid-cols-4">
          {[
            { icon: Truck, title: t('trust.freeDelivery.title'), copy: t('trust.freeDelivery.copy') },
            { icon: ShieldCheck, title: t('trust.verification.title'), copy: t('trust.verification.copy') },
            { icon: Wallet, title: t('trust.payment.title'), copy: t('trust.payment.copy') },
            { icon: HeartHandshake, title: t('trust.support.title'), copy: t('trust.support.copy') },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3 px-2 py-2 sm:px-5">
              <item.icon className="h-5 w-5 shrink-0 text-gold-600 dark:text-gold-300" />
              <div>
                <p className="text-[13px] font-semibold text-ink-800 dark:text-ink-100">{item.title}</p>
                <p className="text-[11px] text-ink-400">{item.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ───────────────────────────── Categories ─────────────────────────── */}
      {sections.featuredCategories !== false && (
        <section className="container-page py-14">
          <SectionHeading
            eyebrow={t('section.browse')}
            title={t('section.everything')}
            description={t('section.everythingDesc')}
            action={<ViewAllLink to="/products" label={t('section.viewAll')} />}
          />
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)
              : (data?.categories ?? []).map((category, index) => (
                  <motion.div
                    key={category._id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.03 }}
                  >
                    <Link
                      to={`/products?category=${category.slug}`}
                      className="group relative block h-40 overflow-hidden rounded-2xl border border-line bg-ink-100 dark:border-ink-800 dark:bg-ink-800"
                    >
                      {category.image ? (
                        <img
                          src={category.image}
                          alt={category.name}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="grain h-full w-full bg-gradient-to-br from-ink-100 to-gold-100 dark:from-ink-800 dark:to-ink-700" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink-950/75 via-ink-950/10 to-transparent" />
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4">
                        <div>
                          <p className="font-display text-base font-semibold text-white">{category.name}</p>
                          <p className="text-[11px] text-white/60">{category.productCount ?? 0} {t('hero.inStock')}</p>
                        </div>
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition-colors group-hover:bg-gold group-hover:text-ink-950">
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
          </div>
        </section>
      )}

      {/* ──────────────────────────── New arrivals ────────────────────────── */}
      {sections.newArrivals !== false && (
        <section className="border-y border-line bg-white py-14 dark:border-ink-800 dark:bg-ink-900">
          <div className="container-page">
            <SectionHeading
              eyebrow={t('section.justIn')}
              title={t('section.newArrivals')}
              description={t('section.newArrivalsDesc')}
              action={<ViewAllLink to="/products?sort=newest" label={t('section.seeNew')} />}
            />
            <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => <ProductCardSkeleton key={index} />)
                : (data?.newArrivals ?? []).slice(0, 4).map((product) => (
                    <ProductCard key={product._id} product={product} onQuickView={setQuickView} />
                  ))}
            </div>
          </div>
        </section>
      )}

      {/* ────────────────────────────── Promo ─────────────────────────────── */}
      {sections.promo !== false && (
        <section className="container-page py-14">
          {data?.promoBanners?.[0] ? (
            <div className="relative overflow-hidden rounded-3xl border border-line bg-ink-900 dark:border-ink-800">
              <div className="grid md:grid-cols-2">
                <div className="flex flex-col justify-center p-8 sm:p-12">
                  <p className="eyebrow mb-3 text-gold-300">{t('section.stayClose')}</p>
                  <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
                    {data.promoBanners[0].title}
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-6 text-white/60">{data.promoBanners[0].subtitle}</p>
                  <div className="mt-6">
                    <Link to={data.promoBanners[0].link || '/products'}>
                      <Button variant="secondary">{data.promoBanners[0].cta || t('hero.cta')}</Button>
                    </Link>
                  </div>
                </div>
                <div className="relative min-h-56">
                  {data.promoBanners[0].image ? (
                    <img src={data.promoBanners[0].image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grain h-full w-full bg-gradient-to-br from-ink-800 to-ink-950" />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-3xl bg-ink-900 px-8 py-12 dark:bg-ink-900 sm:px-12">
              <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative max-w-2xl">
                <p className="eyebrow mb-3 text-gold-300">The HILAAL promise</p>
                <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">
                  {t('hero.brandSlogan')}
                </h2>
                <p className="mt-3 text-sm leading-7 text-white/60">
                  {t('hero.subtitle')}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to="/products">
                    <Button variant="secondary">{t('hero.cta')}</Button>
                  </Link>
                  <Link to="/about">
                    <Button variant="outline" className="border-white/20 bg-transparent text-white hover:border-white/40 hover:bg-white/5">
                      {t('hero.secondary')}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ──────────────────────────── Best sellers ────────────────────────── */}
      {sections.bestSellers !== false && (
        <section className="container-page pb-14">
          <SectionHeading
            eyebrow={t('section.bestSellers')}
            title={t('section.bestSellersTitle')}
            description={t('section.bestSellersDesc')}
            action={<ViewAllLink to="/products?sort=popular" label={t('section.shopBestSellers')} />}
          />
          <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {isLoading
              ? Array.from({ length: 4 }).map((_, index) => <ProductCardSkeleton key={index} />)
              : (data?.bestSellers ?? []).slice(0, 4).map((product) => (
                  <ProductCard key={product._id} product={product} onQuickView={setQuickView} />
                ))}
          </div>
        </section>
      )}

      {/* ────────────────────────────── Offers ────────────────────────────── */}
      {sections.offers !== false && (data?.offers?.length ?? 0) > 0 && (
        <section className="border-y border-line bg-gold-50/50 py-14 dark:border-ink-800 dark:bg-gold-900/10">
          <div className="container-page">
            <SectionHeading
              eyebrow={t('section.onOffer')}
              title={t('section.onOfferTitle')}
              description={t('section.onOfferDesc')}
              action={<ViewAllLink to="/products?onSale=true" label={t('section.allOffers')} />}
            />
            <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {(data?.offers ?? []).slice(0, 4).map((product) => (
                <ProductCard key={product._id} product={product} onQuickView={setQuickView} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ──────────────────────────── Recommended ─────────────────────────── */}
      {sections.recommended !== false && (data?.recommended?.length ?? 0) > 0 && (
        <section className="container-page py-14">
          <SectionHeading
            eyebrow={t('section.recommended')}
            title={t('section.recommendedTitle')}
            description={t('section.recommendedDesc')}
            action={<ViewAllLink to="/products" label={t('section.exploreAll')} />}
          />
          <div className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {(data?.recommended ?? []).slice(0, 4).map((product) => (
              <ProductCard key={product._id} product={product} onQuickView={setQuickView} />
            ))}
          </div>
        </section>
      )}

      {/* ────────────────────────────── Reviews ───────────────────────────── */}
      {sections.reviews !== false && (data?.reviews?.length ?? 0) > 0 && (
        <section className="border-y border-line bg-white py-14 dark:border-ink-800 dark:bg-ink-900">
          <div className="container-page">
            <SectionHeading
              align="center"
              eyebrow={t('section.reviewsEyebrow')}
              title={t('section.reviewsTitle')}
              description={t('section.reviewsDesc')}
            />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {(data?.reviews ?? []).slice(0, 3).map((review) => (
                <figure key={review._id} className="surface flex flex-col p-6">
                  <Quote className="h-6 w-6 text-gold/50" />
                  <blockquote className="mt-3 flex-1 text-sm leading-6 text-ink-600 dark:text-ink-200">
                    “{review.comment}”
                  </blockquote>
                  <figcaption className="mt-5 flex items-center justify-between border-t border-line pt-4 dark:border-ink-800">
                    <div>
                      <p className="text-sm font-semibold text-ink-900 dark:text-white">{review.authorName}</p>
                      <p className="text-[11px] text-ink-400">
                        {typeof review.product === 'string' ? 'Verified customer' : review.product?.name}
                      </p>
                    </div>
                    <RatingStars rating={review.rating} />
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ───────────────────────────── Newsletter ─────────────────────────── */}
      {sections.newsletter !== false && (
        <section className="container-page py-16">
          <div className="grid items-center gap-8 rounded-3xl border border-line bg-white p-8 shadow-soft dark:border-ink-800 dark:bg-ink-900 md:grid-cols-2 sm:p-12">
            <div>
              <p className="eyebrow mb-2">{t('section.stayClose')}</p>
              <h2 className="display text-2xl font-semibold sm:text-3xl">{t('section.stayCloseTitle')}</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-ink-500 dark:text-ink-300">
                {t('section.stayCloseDesc')}
              </p>
              <div className="mt-5 max-w-md">
                <NewsletterForm />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Banknote, label: t('checkout.cashDelivery'), copy: t('trust.payment.copy') },
                { icon: Wallet, label: t('checkout.mobileMoney'), copy: 'EVC Plus, ZAAD, Sahal, eDahab' },
                { icon: ShieldCheck, label: t('trust.verification.title'), copy: t('trust.verification.copy') },
                { icon: HeartHandshake, label: t('trust.support.title'), copy: t('trust.support.copy') },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-line bg-canvas p-4 dark:border-ink-800 dark:bg-ink-950">
                  <item.icon className="h-5 w-5 text-gold-600 dark:text-gold-300" />
                  <p className="mt-2.5 text-[13px] font-semibold text-ink-800 dark:text-ink-100">{item.label}</p>
                  <p className="text-[11px] text-ink-400">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <QuickViewModal product={quickView} open={Boolean(quickView)} onClose={() => setQuickView(null)} />
    </div>
  );
}
