import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  ChevronDown,
  Heart,
  Instagram,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Moon,
  Package,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  UserRound,
  X,
  Facebook,
  Globe,
  Languages,
  MessageCircle,
  Minus,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, apiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { useAuth, useCart, useLanguage, useSettings, useTheme, useToast } from '@/context/AppProviders';
import { useMoney } from '@/lib/hooks';
import { Button, Input } from './ui';
import type { Category, Product } from '@/types';

/* ─────────────────────────────── Brand mark ────────────────────────────── */

export function BrandMark({ compact, light }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-ink-900 text-gold shadow-soft dark:bg-gold dark:text-ink-950">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path
            d="M16.6 4.6a7.6 7.6 0 1 0 0 14.8A8.8 8.8 0 1 1 16.6 4.6Z"
            fill="currentColor"
            opacity="0.95"
          />
          <circle cx="17.6" cy="8.1" r="1.15" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className={cn('leading-none', light ? 'text-white' : 'text-ink-900 dark:text-white')}>
          <span className="block font-display text-xl font-semibold tracking-[0.18em]">HILAAL</span>
          <span className="mt-1 block text-[8px] font-medium uppercase tracking-[0.3em] text-gold-600 dark:text-gold-300">
            Shop · Manage · Grow
          </span>
        </span>
      )}
    </span>
  );
}

/* ────────────────────────── Language switcher ─────────────────────────── */

export function LanguageSwitcher({ compact, light }: { compact?: boolean; light?: boolean }) {
  const { language, toggleLanguage } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLanguage}
      aria-label={language === 'so' ? 'Switch to English' : 'U beddel Soomaali'}
      title={language === 'so' ? 'Switch to English' : 'U beddel Soomaali'}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors',
        light
          ? 'border-white/20 bg-white/10 text-white hover:bg-white/20'
          : 'border-line text-ink-700 hover:bg-ink-100 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800',
        compact ? 'h-7 px-2 text-[11px]' : 'h-9 px-2.5 text-xs'
      )}
    >
      <Globe className="h-3.5 w-3.5 text-gold" />
      <span className="font-semibold tracking-wide">
        {language === 'so' ? '🇸🇴 SO' : '🇬🇧 EN'}
      </span>
      <span className="hidden xl:inline text-[11px] opacity-75">
        ({language === 'so' ? 'Soomaali' : 'English'})
      </span>
    </button>
  );
}

/* ──────────────────────────────── Rating ──────────────────────────────── */

export function RatingStars({
  rating,
  count,
  size = 'sm',
  showValue = false,
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
  showValue?: boolean;
}) {
  const rounded = Math.round((rating ?? 0) * 2) / 2;
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`Rated ${rating ?? 0} out of 5`}>
      <span className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
              star <= rounded ? 'fill-gold text-gold' : 'fill-transparent text-ink-200 dark:text-ink-700'
            )}
          />
        ))}
      </span>
      {showValue && <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{Number(rating ?? 0).toFixed(1)}</span>}
      {typeof count === 'number' && (
        <span className="text-xs text-ink-400">({count})</span>
      )}
    </span>
  );
}

/* ───────────────────────────────── Price ──────────────────────────────── */

export function Price({
  price,
  compareAtPrice,
  className,
  size = 'md',
}: {
  price: number;
  compareAtPrice?: number | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { format } = useMoney();
  const discounted = Boolean(compareAtPrice && compareAtPrice > price);
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span
        className={cn(
          'font-display font-semibold tracking-tight text-ink-900 dark:text-white',
          size === 'sm' && 'text-sm',
          size === 'md' && 'text-base',
          size === 'lg' && 'text-2xl'
        )}
      >
        {format(price)}
      </span>
      {discounted && (
        <span className={cn('text-ink-400 line-through', size === 'lg' ? 'text-base' : 'text-xs')}>
          {format(compareAtPrice)}
        </span>
      )}
    </span>
  );
}

/* ────────────────────────────── Quick view ────────────────────────────── */

export function QuickViewModal({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const { add } = useCart();
  const { success } = useToast();
  const [quantity, setQuantity] = useState(1);
  const [variation, setVariation] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!product) return;
    setQuantity(1);
    setVariation(product.variations?.find((item) => item.isDefault)?.label ?? product.variations?.[0]?.label);
  }, [product]);

  if (!product) return null;
  const delta = product.variations?.find((item) => item.label === variation)?.priceDelta ?? 0;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.button
            aria-label="Close quick view"
            className="absolute inset-0 bg-ink-950/55 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={product.name}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="relative grid max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-white shadow-lift dark:border-ink-800 dark:bg-ink-900 sm:rounded-2xl md:grid-cols-2"
          >
            <div className="relative aspect-square bg-ink-50 dark:bg-ink-800">
              <ProductImage product={product} />
              <button
                onClick={onClose}
                aria-label="Close quick view"
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-ink-500 shadow-soft backdrop-blur hover:text-ink-900 dark:bg-ink-900/90 dark:text-ink-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col p-6">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{categoryName(product.category)}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">{product.name}</h2>
              <div className="mt-2 flex items-center gap-3">
                <RatingStars rating={product.rating} count={product.reviewCount} showValue />
                <span className="text-xs text-ink-400">{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</span>
              </div>
              <div className="mt-4">
                <Price price={product.price + delta} compareAtPrice={product.compareAtPrice} size="lg" />
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink-500 dark:text-ink-300">
                {product.shortDescription ?? product.description}
              </p>

              {product.variations?.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium text-ink-600 dark:text-ink-300">{product.variationLabel ?? 'Choose an option'}</p>
                  <div className="flex flex-wrap gap-2">
                    {product.variations.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => setVariation(item.label)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          variation === item.label
                            ? 'border-ink-900 bg-ink-900 text-white dark:border-gold dark:bg-gold dark:text-ink-950'
                            : 'border-line text-ink-600 hover:border-ink-300 dark:border-ink-700 dark:text-ink-300'
                        )}
                      >
                        {item.label}
                        {item.priceDelta ? ` (${item.priceDelta > 0 ? '+' : ''}${item.priceDelta})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
                <QuantityStepper value={quantity} onChange={setQuantity} max={Math.max(product.stock, 1)} />
                <Button
                  variant="secondary"
                  disabled={product.stock <= 0}
                  onClick={() => {
                    add(product, quantity, variation);
                    success(`${product.name} added to your cart.`);
                    onClose();
                  }}
                >
                  <ShoppingBag className="h-4 w-4" /> Add to cart
                </Button>
                <Link
                  to={`/products/${product.slug}`}
                  className="text-xs font-medium text-ink-500 underline-offset-4 hover:text-gold-700 hover:underline dark:text-ink-300"
                >
                  View full details
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────── Category label ────────────────────────── */

export function categoryName(category: Product['category']): string {
  if (!category) return 'Uncategorised';
  return typeof category === 'string' ? category : category.name;
}

/* ──────────────────────────── Product imagery ─────────────────────────── */

export function ProductImage({
  product,
  className,
  sizes,
}: {
  product: Pick<Product, 'name' | 'images'>;
  className?: string;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (product.images?.[0] && !failed) {
    return (
      <img
        src={product.images[0]}
        alt={product.name}
        loading="lazy"
        sizes={sizes}
        onError={() => setFailed(true)}
        className={cn('h-full w-full object-cover', className)}
      />
    );
  }
  return (
    <div
      className={cn(
        'grain flex h-full w-full items-center justify-center bg-gradient-to-br from-ink-50 via-white to-gold-50 dark:from-ink-800 dark:via-ink-900 dark:to-ink-800',
        className
      )}
    >
      <span className="font-display text-3xl font-semibold text-ink-300 dark:text-ink-600">
        {product.name?.slice(0, 1)?.toUpperCase() ?? 'H'}
      </span>
    </div>
  );
}

/* ─────────────────────────────── Wishlist ─────────────────────────────── */

export function WishlistButton({ productId, className }: { productId: string; className?: string }) {
  const { user, refresh } = useAuth();
  const { toast, success, error } = useToast();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const active = Boolean(user?.wishlist?.includes(productId));

  return (
    <button
      type="button"
      aria-label={active ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={active}
      disabled={saving}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
          toast('Sign in to save products to your wishlist.', 'info');
          navigate('/login', { state: { from: location.pathname } });
          return;
        }
        setSaving(true);
        try {
          const result = await api.post<{ wishlisted: boolean }>(`/account/wishlist/${productId}`);
          await refresh();
          success(result.wishlisted ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
        } catch (wishlistError) {
          error(apiErrorMessage(wishlistError));
        } finally {
          setSaving(false);
        }
      }}
      className={cn(
        'grid h-9 w-9 place-items-center rounded-full border border-line bg-white/90 text-ink-500 shadow-soft backdrop-blur transition-colors hover:text-rose-500 dark:border-ink-700 dark:bg-ink-900/90 dark:text-ink-300',
        active && 'border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-900 dark:bg-rose-950/50',
        className
      )}
    >
      <Heart className={cn('h-4 w-4', active && 'fill-current')} />
    </button>
  );
}

/* ────────────────────────────── Product card ──────────────────────────── */

export function ProductCard({
  product,
  onQuickView,
  className,
}: {
  product: Product;
  onQuickView?: (product: Product) => void;
  className?: string;
}) {
  const { add } = useCart();
  const { success } = useToast();
  const soldOut = product.stock <= 0;
  const discount =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white transition-all duration-300 hover:-translate-y-1 hover:border-ink-200 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900 dark:hover:border-ink-600',
        className
      )}
    >
      <Link to={`/products/${product.slug}`} className="relative block aspect-[4/3] overflow-hidden bg-ink-50 dark:bg-ink-800">
        <ProductImage
          product={product}
          className="transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
        />
        <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
          {discount > 0 && (
            <span className="rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-950">
              −{discount}%
            </span>
          )}
          {product.isFeatured && (
            <span className="rounded-full bg-ink-900/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur">
              Featured
            </span>
          )}
          {soldOut && (
            <span className="rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-700 shadow">
              Sold out
            </span>
          )}
        </span>
        <WishlistButton productId={product._id} className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-ink-400">{categoryName(product.category)}</p>
        <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-ink-900 dark:text-white">
          <Link to={`/products/${product.slug}`} className="hover:text-gold-700 dark:hover:text-gold-300">
            {product.name}
          </Link>
        </h3>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <RatingStars rating={product.rating} count={product.reviewCount} />
          <span className="text-[11px] text-ink-400">per {product.unit}</span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price price={product.price} compareAtPrice={product.compareAtPrice} />
          <div className="flex items-center gap-1.5">
            {onQuickView && (
              <button
                type="button"
                onClick={() => onQuickView(product)}
                className="hidden h-9 items-center rounded-lg border border-line px-2.5 text-xs font-medium text-ink-600 transition-colors hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800 sm:inline-flex"
              >
                Quick view
              </button>
            )}
            <button
              type="button"
              disabled={soldOut}
              aria-label={`Add ${product.name} to cart`}
              onClick={() => {
                add(product, 1);
                success(`${product.name} added to your cart.`);
              }}
              className="grid h-9 w-9 place-items-center rounded-lg bg-ink-900 text-white transition-colors hover:bg-ink-800 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-400 dark:bg-gold dark:text-ink-950 dark:hover:bg-gold-400 dark:disabled:bg-ink-700 dark:disabled:text-ink-500"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── Quantity stepper ─────────────────────────── */

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = 'md',
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-line bg-white dark:border-ink-700 dark:bg-ink-900',
        size === 'sm' ? 'h-8' : 'h-10'
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          'grid place-items-center text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-40 dark:text-ink-300 dark:hover:text-white',
          size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={cn('min-w-8 text-center text-sm font-semibold tabular-nums', size === 'sm' && 'text-xs')}>{value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn(
          'grid place-items-center text-ink-500 transition-colors hover:text-ink-900 disabled:opacity-40 dark:text-ink-300 dark:hover:text-white',
          size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ─────────────────────────────── Breadcrumbs ──────────────────────────── */

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
      <Link to="/" className="hover:text-ink-700 dark:hover:text-white">
        Home
      </Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="text-ink-300 dark:text-ink-600">/</span>
          {item.to ? (
            <Link to={item.to} className="hover:text-ink-700 dark:hover:text-white">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink-600 dark:text-ink-200">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ──────────────────────────────── Newsletter ──────────────────────────── */

export function NewsletterForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const { success, error } = useToast();

  return (
    <form
      className={cn('flex w-full gap-2', compact ? 'flex-row' : 'flex-col sm:flex-row')}
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await api.post('/newsletter', { email });
          success('You are on the list. Welcome to HILAAL.');
          setEmail('');
        } catch (newsletterError) {
          error(apiErrorMessage(newsletterError));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Your email address"
        aria-label="Email address for newsletter"
        className={cn(compact && 'h-10 bg-white/10 text-white placeholder:text-white/40 dark:bg-white/10')}
      />
      <Button type="submit" variant="secondary" loading={saving} className="shrink-0">
        Subscribe
      </Button>
    </form>
  );
}

/* ───────────────────────────────── Header ─────────────────────────────── */

const NAV_LINKS = [
  { to: '/products', label: 'Shop' },
  { to: '/products?sort=newest', label: 'New arrivals' },
  { to: '/products?onSale=true', label: 'Offers' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function StorefrontHeader() {
  const { user, logout, isStaff } = useAuth();
  const { settings } = useSettings();
  const { count } = useCart();
  const { theme, toggle } = useTheme();
  const { t } = useLanguage();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [scrolled, setScrolled] = useState(false);

  const navLinks = [
    { to: '/products', label: t('nav.shop') },
    { to: '/products?sort=newest', label: t('nav.newArrivals') },
    { to: '/products?onSale=true', label: t('nav.offers') },
    { to: '/about', label: t('nav.about') },
    { to: '/contact', label: t('nav.contact') },
  ];

  const { data: categories } = useQuery({
    queryKey: ['storefront-categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    navigate(`/products?q=${encodeURIComponent(term.trim())}`);
  };

  const threshold = settings?.freeDeliveryThreshold ?? 0;

  return (
    <>
      <div className="bg-ink-950 text-white">
        <div className="container-page flex h-9 items-center justify-between gap-4 text-[11px]">
          <p className="flex items-center gap-1.5 text-white/70">
            <Sparkles className="h-3 w-3 text-gold" />
            {threshold > 0 ? `${t('nav.freeDelivery')} ${settings?.currencySymbol ?? '$'}${threshold}` : t('nav.welcome')}
          </p>
          <div className="flex items-center gap-3 text-white/60">
            {settings?.phone && (
              <a href={`tel:${settings.phone}`} className="hidden hover:text-white sm:inline">
                {settings.phone}
              </a>
            )}
            <span className="hidden text-white/20 sm:inline">|</span>
            <Link to="/order-track" className="hover:text-white">
              {t('nav.trackOrder')}
            </Link>
            <span className="text-white/20">|</span>
            <LanguageSwitcher compact light />
          </div>
        </div>
      </div>

      <header
        className={cn(
          'sticky top-0 z-50 border-b border-transparent bg-canvas/85 backdrop-blur-xl transition-all dark:bg-ink-950/85',
          scrolled && 'border-line shadow-soft dark:border-ink-800'
        )}
      >
        <div className="container-page flex h-16 items-center gap-3">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 lg:hidden"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <Link to="/" aria-label="HILAAL home" className="shrink-0">
            <BrandMark />
          </Link>

          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
                    isActive && link.to === '/products' && !location.search && 'text-ink-900 dark:text-white'
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="group relative">
              <button className="flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white">
                {t('nav.categories')} <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <div className="invisible absolute left-0 top-full w-64 translate-y-2 rounded-xl border border-line bg-white p-2 opacity-0 shadow-lift transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-ink-700 dark:bg-ink-900">
                {(categories ?? []).map((category) => (
                  <Link
                    key={category._id}
                    to={`/products?category=${category.slug}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white"
                  >
                    {category.name}
                    <span className="text-[10px] text-ink-400">{category.productCount ?? 0}</span>
                  </Link>
                ))}
              </div>
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t('nav.search')}
              onClick={() => setSearchOpen((open) => !open)}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={theme === 'dark' ? t('nav.themeLight') : t('nav.themeDark')}
              onClick={toggle}
              className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Link
              to="/wishlist"
              aria-label={t('nav.wishlist')}
              className="hidden h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800 sm:grid"
            >
              <Heart className="h-4 w-4" />
            </Link>

            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((open) => !open)}
                aria-label="Account menu"
                aria-expanded={accountOpen}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
              >
                <UserRound className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {accountOpen && (
                  <>
                    <button className="fixed inset-0 z-40 cursor-default" aria-label="Close account menu" onClick={() => setAccountOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-lift dark:border-ink-700 dark:bg-ink-900"
                    >
                      {user ? (
                        <>
                          <div className="border-b border-line px-3 py-2.5 dark:border-ink-800">
                            <p className="truncate text-sm font-semibold text-ink-900 dark:text-white">{user.name}</p>
                            <p className="truncate text-xs text-ink-400">{user.email}</p>
                          </div>
                          <Link to="/account" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800">
                            <UserRound className="h-4 w-4" /> {t('nav.myAccount')}
                          </Link>
                          <Link to="/account/orders" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800">
                            <Package className="h-4 w-4" /> {t('nav.myOrders')}
                          </Link>
                          {isStaff && (
                            <Link to="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gold-700 hover:bg-gold-50 dark:text-gold-300 dark:hover:bg-gold-900/30">
                              <LayoutDashboard className="h-4 w-4" /> {t('nav.admin')}
                            </Link>
                          )}
                          <button
                            onClick={async () => {
                              await logout();
                              success(t('nav.signOut'));
                              navigate('/');
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            <LogOut className="h-4 w-4" /> {t('nav.signOut')}
                          </button>
                        </>
                      ) : (
                        <>
                          <Link to="/login" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800">
                            <LogIn className="h-4 w-4" /> {t('nav.signIn')}
                          </Link>
                          <Link to="/register" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800">
                            <UserRound className="h-4 w-4" /> {t('nav.register')}
                          </Link>
                          <Link to="/admin" className="mt-1 flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-100 dark:bg-ink-800 dark:text-white dark:hover:bg-ink-700">
                            <LayoutDashboard className="h-4 w-4" /> {t('nav.staffSignIn')}
                          </Link>
                        </>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <Link
              to="/cart"
              className="relative ml-1 inline-flex h-9 items-center gap-2 rounded-lg bg-ink-900 px-3 text-xs font-medium text-white transition-colors hover:bg-ink-800 dark:bg-gold dark:text-ink-950 dark:hover:bg-gold-400"
            >
              <ShoppingBag className="h-4 w-4" />
              <span className="hidden sm:inline">{t('nav.cart')}</span>
              {count > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-ink-950 dark:bg-ink-950 dark:text-gold">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>

        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-line bg-white dark:border-ink-800 dark:bg-ink-900"
            >
              <form onSubmit={submitSearch} className="container-page flex items-center gap-3 py-3">
                <Search className="h-4 w-4 shrink-0 text-ink-400" />
                <input
                  autoFocus
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder={t('nav.searchPlaceholder')}
                  className="h-9 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400 dark:text-white"
                />
                <Button type="submit" size="sm" variant="secondary">
                  {t('nav.search')}
                </Button>
                <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close search" className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800">
                  <X className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-[80] lg:hidden">
            <motion.button
              aria-label="Close menu"
              className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 340, damping: 34 }}
              className="relative flex h-full w-[86%] max-w-sm flex-col bg-white dark:bg-ink-900"
            >
              <div className="flex items-center justify-between border-b border-line px-4 py-4 dark:border-ink-800">
                <BrandMark />
                <button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid h-9 w-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-50 dark:hover:bg-ink-800">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-ink-50/50 p-2.5 dark:border-ink-800 dark:bg-ink-800/40">
                  <span className="text-xs font-medium text-ink-700 dark:text-ink-200">{t('nav.language')}</span>
                  <LanguageSwitcher />
                </div>
                <form onSubmit={submitSearch} className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                  <input
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder={t('nav.searchDrawer')}
                    className="h-10 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm dark:border-ink-700 dark:bg-ink-900"
                  />
                </form>
                <nav className="space-y-1">
                  {navLinks.map((link) => (
                    <Link key={link.to} to={link.to} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800">
                      {link.label}
                    </Link>
                  ))}
                </nav>
                <p className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{t('nav.categories')}</p>
                <div className="mt-1 space-y-0.5">
                  {(categories ?? []).map((category) => (
                    <Link key={category._id} to={`/products?category=${category.slug}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800">
                      {category.name}
                      <span className="text-[10px] text-ink-400">{category.productCount ?? 0}</span>
                    </Link>
                  ))}
                </div>
              </div>
              <div className="border-t border-line p-4 dark:border-ink-800">
                {user ? (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/account')}>
                      {t('nav.myAccount')}
                    </Button>
                    {isStaff && (
                      <Button variant="secondary" className="flex-1" onClick={() => navigate('/admin')}>
                        {t('nav.admin')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => navigate('/login')}>
                      {t('nav.signIn')}
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => navigate('/register')}>
                      {t('nav.register')}
                    </Button>
                  </div>
                )}
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ───────────────────────────────── Footer ─────────────────────────────── */

export function StorefrontFooter() {
  const { settings } = useSettings();
  const { t } = useLanguage();
  const { data: pages } = useQuery({
    queryKey: ['content-pages'],
    queryFn: () => api.get<{ slug: string; title: string }[]>('/content'),
  });

  const social = settings?.social ?? {};

  return (
    <footer className="mt-20 bg-ink-950 text-white">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BrandMark light />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/60">
            {t('footer.description')}
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-xs text-white/60">
            {settings?.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gold" /> {settings.address}
              </span>
            )}
            {settings?.phone && (
              <a href={`tel:${settings.phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone className="h-3.5 w-3.5 text-gold" /> {settings.phone}
              </a>
            )}
            {settings?.email && (
              <a href={`mailto:${settings.email}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Mail className="h-3.5 w-3.5 text-gold" /> {settings.email}
              </a>
            )}
          </div>
          <div className="mt-5 flex items-center gap-2">
            {social.facebook && (
              <a href={social.facebook} aria-label="Facebook" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 hover:border-gold hover:text-gold">
                <Facebook className="h-4 w-4" />
              </a>
            )}
            {social.instagram && (
              <a href={social.instagram} aria-label="Instagram" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 hover:border-gold hover:text-gold">
                <Instagram className="h-4 w-4" />
              </a>
            )}
            {social.whatsapp && (
              <a href={social.whatsapp} aria-label="WhatsApp" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-white/60 hover:border-gold hover:text-gold">
                <MessageCircle className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{t('footer.shop')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            <li><Link to="/products" className="hover:text-gold">{t('section.viewAll')}</Link></li>
            <li><Link to="/products?sort=newest" className="hover:text-gold">{t('nav.newArrivals')}</Link></li>
            <li><Link to="/products?onSale=true" className="hover:text-gold">{t('nav.offers')}</Link></li>
            <li><Link to="/wishlist" className="hover:text-gold">{t('nav.wishlist')}</Link></li>
            <li><Link to="/order-track" className="hover:text-gold">{t('nav.trackOrder')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{t('footer.help')}</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-white/70">
            {(pages ?? []).slice(0, 6).map((page) => (
              <li key={page.slug}>
                <Link to={`/${page.slug}`} className="capitalize hover:text-gold">
                  {page.slug === 'faq' ? 'FAQ' : page.slug}
                </Link>
              </li>
            ))}
            <li><Link to="/contact" className="hover:text-gold">{t('nav.contact')}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">{t('footer.stayInLoop')}</h3>
          <p className="mt-4 text-sm leading-6 text-white/60">{t('footer.newsletterCopy')}</p>
          <div className="mt-4">
            <NewsletterForm compact />
          </div>
          {settings?.businessHours && <p className="mt-4 text-xs text-white/40">{settings.businessHours}</p>}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-white/40 sm:flex-row">
          <p>© {new Date().getFullYear()} {settings?.shopName ?? 'HILAAL'}. {t('footer.rights')}</p>
          <p className="flex flex-wrap items-center justify-center gap-3">
            <span>{t('checkout.cashDelivery')}</span>
            <span className="text-white/20">·</span>
            <span>EVC Plus</span>
            <span className="text-white/20">·</span>
            <span>ZAAD</span>
            <span className="text-white/20">·</span>
            <span>Sahal</span>
            <span className="text-white/20">·</span>
            <span>eDahab</span>
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────────────── Public layout ─────────────────────────── */

export function StorefrontLayout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <StorefrontFooter />
    </div>
  );
}

/* ─────────────────────────────── Section head ─────────────────────────── */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-4',
        align === 'center' && 'flex-col items-center text-center',
        className
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="display text-2xl font-semibold sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-300">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ViewAllLink({ to, label = 'View all' }: { to: string; label?: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-gold-700 dark:text-ink-200 dark:hover:text-gold-300">
      {label} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}
