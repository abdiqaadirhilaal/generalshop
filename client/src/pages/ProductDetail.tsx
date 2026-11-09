import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  ChevronRight,
  Heart,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
} from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useAuth, useCart, useLanguage, useSettings, useToast } from '@/context/AppProviders';
import {
  Breadcrumbs,
  ProductCard,
  ProductImage,
  RatingStars,
  WishlistButton,
  categoryName,
} from '@/components/Storefront';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageLoader,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from '@/components/ui';
import type { Product, Review } from '@/types';

type ProductWithRelated = Product & { related: Product[] };

export default function ProductDetailPage() {
  const { t } = useLanguage();
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { add } = useCart();
  const { settings } = useSettings();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [quantity, setQuantity] = useState(1);
  const [variation, setVariation] = useState<string | undefined>();
  const [activeImage, setActiveImage] = useState(0);
  const [tab, setTab] = useState('description');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: '', comment: '', authorName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const { data: product, isLoading, isError, refetch } = useQuery({
    queryKey: ['product', idOrSlug],
    queryFn: () => api.get<ProductWithRelated | null>(`/products/${idOrSlug}`),
  });

  useDocumentTitle(product?.name);

  const { data: reviews } = useQuery({
    queryKey: ['product-reviews', product?._id, reviewPage],
    queryFn: () => api.page<Review>(`/products/${product!._id}/reviews?page=${reviewPage}&limit=6`),
    enabled: Boolean(product?._id),
  });

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setVariation(product.variations?.find((item) => item.isDefault)?.label ?? product.variations?.[0]?.label);
      setActiveImage(0);
    }
  }, [product]);

  const priceDelta = product?.variations?.find((item) => item.label === variation)?.priceDelta ?? 0;
  const unitPrice = (product?.price ?? 0) + priceDelta;
  const stock = product?.stock ?? 0;
  const soldOut = stock <= 0;

  const discount = useMemo(() => {
    if (!product?.compareAtPrice || product.compareAtPrice <= product.price) return 0;
    return Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
  }, [product]);

  if (isLoading) {
    return (
      <div className="container-page py-10">
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container-page py-16">
        <ErrorState message="We could not load this product." onRetry={() => refetch()} />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<Package className="h-6 w-6" />}
          title="Product not found"
          description="This product may have been removed or is no longer available."
          action={<Button onClick={() => navigate('/products')}>Browse products</Button>}
        />
      </div>
    );
  }

  const addToCart = (goToCheckout = false) => {
    add(product, quantity, variation);
    success(`${product.name} added to your cart`);
    if (goToCheckout) navigate('/checkout');
  };

  const submitReview = async () => {
    if (reviewForm.comment.trim().length < 4) {
      setReviewError('Please write a short review.');
      return;
    }
    setSubmitting(true);
    setReviewError('');
    try {
      await api.post(`/products/${product._id}/reviews`, {
        rating: reviewForm.rating,
        title: reviewForm.title || undefined,
        comment: reviewForm.comment,
        authorName: user ? undefined : reviewForm.authorName,
      });
      success('Thank you! Your review was submitted for moderation.');
      setReviewForm({ rating: 5, title: '', comment: '', authorName: '' });
      await queryClient.invalidateQueries({ queryKey: ['product-reviews', product._id] });
    } catch (submitError) {
      setReviewError(apiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const images = product.images?.length ? product.images : [''];
  const catName = categoryName(product.category);

  return (
    <div className="container-page py-8">
      <Breadcrumbs
        items={[
          { label: 'Shop', to: '/products' },
          ...(catName ? [{ label: catName, to: `/products?category=${typeof product.category === 'string' ? '' : product.category?.slug ?? ''}` }] : []),
          { label: product.name },
        ]}
      />

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.05fr_1fr]">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-ink-50 dark:border-ink-800 dark:bg-ink-900">
            <ProductImage product={{ name: product.name, images: [images[activeImage]] }} />
            {discount > 0 && (
              <span className="absolute left-4 top-4 rounded-full bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white">
                -{discount}%
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={index}
                  onClick={() => setActiveImage(index)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition-colors ${
                    activeImage === index ? 'border-gold' : 'border-line dark:border-ink-800'
                  }`}
                  aria-label={`View image ${index + 1}`}
                >
                  <ProductImage product={{ name: product.name, images: [image] }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {catName && <Badge tone="gold">{catName}</Badge>}
            {product.isFeatured && <Badge tone="ink">Featured</Badge>}
            {product.brand && typeof product.brand !== 'string' && <Badge>{product.brand.name}</Badge>}
          </div>
          <h1 className="display mt-3 text-3xl font-semibold leading-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <RatingStars rating={product.rating} count={product.reviewCount} showValue size="md" />
            <span className="text-xs text-ink-400">SKU {product.sku}</span>
          </div>

          <div className="mt-5 flex items-end gap-3">
            <span className="font-display text-3xl font-semibold tracking-tight text-ink-900 dark:text-white">
              {settings?.currencySymbol ?? '$'}
              {unitPrice.toFixed(2)}
            </span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="pb-1 text-base text-ink-400 line-through">
                {settings?.currencySymbol ?? '$'}
                {product.compareAtPrice.toFixed(2)}
              </span>
            )}
            <span className="pb-1 text-xs text-ink-400">per {product.unit}</span>
          </div>

          <p className="mt-4 text-sm leading-7 text-ink-500 dark:text-ink-300">
            {product.shortDescription || product.description || 'A carefully selected everyday essential.'}
          </p>

          {product.variations?.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[13px] font-medium text-ink-700 dark:text-ink-200">
                {product.variationLabel || 'Choose an option'}
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variations.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setVariation(item.label)}
                    className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                      variation === item.label
                        ? 'border-ink-900 bg-ink-900 text-white dark:border-gold dark:bg-gold dark:text-ink-950'
                        : 'border-line bg-white text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200'
                    }`}
                  >
                    {item.label}
                    {item.priceDelta ? ` (+${settings?.currencySymbol ?? '$'}${item.priceDelta.toFixed(2)})` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex h-11 items-center rounded-lg border border-line dark:border-ink-700">
              <button
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="grid h-full w-10 place-items-center text-ink-500 hover:text-ink-900 disabled:opacity-40 dark:hover:text-white"
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center text-sm font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity((value) => Math.min(stock || 1, value + 1))}
                className="grid h-full w-10 place-items-center text-ink-500 hover:text-ink-900 disabled:opacity-40 dark:hover:text-white"
                disabled={quantity >= stock}
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <Button size="lg" variant="secondary" onClick={() => addToCart()} disabled={soldOut}>
              <ShoppingBag className="h-4 w-4" /> {t('product.addToCart')}
            </Button>
            <Button size="lg" onClick={() => addToCart(true)} disabled={soldOut}>
              {t('checkout.placeOrder')}
            </Button>
            <WishlistButton productId={product._id} className="h-11 w-11 rounded-lg border border-line dark:border-ink-700" />
          </div>

          <div className="mt-3 text-xs">
            {soldOut ? (
              <span className="font-medium text-rose-500">{t('product.soldOut')}</span>
            ) : stock <= product.minStockLevel ? (
              <span className="font-medium text-amber-600">{stock} {t('hero.readyOnShelves')}</span>
            ) : (
              <span className="font-medium text-emerald-600">{t('product.inStock')} · {stock}</span>
            )}
          </div>

          <div className="mt-7 grid gap-3 rounded-xl border border-line bg-white p-4 text-xs text-ink-500 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 text-gold-600" />
              <span>Fast local delivery across the city</span>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-gold-600" />
              <span>Quality-checked, authentic products</span>
            </div>
            <div className="flex items-start gap-2">
              <RefreshCw className="mt-0.5 h-4 w-4 text-gold-600" />
              <span>Easy returns within 7 days</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'description', label: 'Description' },
            { value: 'specs', label: 'Specifications', count: product.specs?.length },
            { value: 'reviews', label: 'Reviews', count: product.reviewCount },
          ]}
        />
        <div className="mt-5">
          {tab === 'description' && (
            <div className="surface p-6 text-sm leading-7 text-ink-600 dark:text-ink-300">
              <p className="whitespace-pre-line">{product.description || 'No description has been provided for this product yet.'}</p>
            </div>
          )}
          {tab === 'specs' && (
            <div className="surface overflow-hidden">
              {product.specs?.length ? (
                <dl className="divide-y divide-line dark:divide-ink-800">
                  {product.specs.map((spec, index) => (
                    <div key={index} className="grid grid-cols-1 gap-1 px-6 py-3 sm:grid-cols-3">
                      <dt className="text-sm font-medium text-ink-700 dark:text-ink-200">{spec.key}</dt>
                      <dd className="text-sm text-ink-500 dark:text-ink-300 sm:col-span-2">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <EmptyState title="No specifications" description="This product does not have detailed specifications listed." />
              )}
            </div>
          )}
          {tab === 'reviews' && (
            <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div className="space-y-4">
                {reviews?.items.length ? (
                  reviews.items.map((review) => (
                    <article key={review._id} className="surface p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-ink-900 dark:text-white">{review.authorName}</p>
                            {review.verifiedPurchase && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                                <BadgeCheck className="h-3.5 w-3.5" /> Verified purchase
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <RatingStars rating={review.rating} />
                            <span className="text-[11px] text-ink-400">
                              {new Date(review.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      {review.title && <p className="mt-3 text-sm font-medium text-ink-800 dark:text-ink-100">{review.title}</p>}
                      <p className="mt-1 text-sm leading-6 text-ink-500 dark:text-ink-300">{review.comment}</p>
                    </article>
                  ))
                ) : (
                  <EmptyState title="No reviews yet" description="Be the first to share your experience with this product." />
                )}
                {reviews && reviews.meta.totalPages > 1 && (
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" size="sm" disabled={reviewPage <= 1} onClick={() => setReviewPage((value) => value - 1)}>
                      Previous
                    </Button>
                    <span className="flex items-center px-2 text-xs text-ink-400">
                      {reviewPage} / {reviews.meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reviewPage >= reviews.meta.totalPages}
                      onClick={() => setReviewPage((value) => value + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="surface h-fit p-5">
                <h3 className="font-display text-lg font-semibold">Write a review</h3>
                <p className="mt-1 text-xs text-ink-400">Reviews are moderated before they appear publicly.</p>
                {reviewError && (
                  <div className="mt-3">
                    <Alert tone="danger">{reviewError}</Alert>
                  </div>
                )}
                <div className="mt-4 space-y-3">
                  <Field label="Rating">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setReviewForm((value) => ({ ...value, rating: star }))}
                          aria-label={`${star} star${star === 1 ? '' : 's'}`}
                        >
                          <Star
                            className={`h-6 w-6 ${star <= reviewForm.rating ? 'fill-gold text-gold' : 'text-ink-300'}`}
                          />
                        </button>
                      ))}
                    </div>
                  </Field>
                  {!user && (
                    <Field label="Your name" required>
                      <Input
                        value={reviewForm.authorName}
                        onChange={(event) => setReviewForm((value) => ({ ...value, authorName: event.target.value }))}
                        placeholder="Amina Yusuf"
                      />
                    </Field>
                  )}
                  <Field label="Title">
                    <Input
                      value={reviewForm.title}
                      onChange={(event) => setReviewForm((value) => ({ ...value, title: event.target.value }))}
                      placeholder="Great quality"
                    />
                  </Field>
                  <Field label="Review" required>
                    <Textarea
                      value={reviewForm.comment}
                      onChange={(event) => setReviewForm((value) => ({ ...value, comment: event.target.value }))}
                      placeholder="Tell others what you think…"
                    />
                  </Field>
                  <Button className="w-full" loading={submitting} onClick={submitReview}>
                    Submit review
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Related */}
      {product.related?.length > 0 && (
        <section className="mt-14">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="display text-2xl font-semibold">You may also like</h2>
            <Link to="/products" className="flex items-center gap-1 text-sm font-medium text-gold-700 hover:underline dark:text-gold-300">
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {product.related.map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
