import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X } from 'lucide-react';
import { api, queryString } from '@/lib/api';
import { useDebounced, useDocumentTitle } from '@/lib/hooks';
import { useLanguage } from '@/context/AppProviders';
import { Breadcrumbs, ProductCard, QuickViewModal } from '@/components/Storefront';
import {
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Pagination,
  ProductCardSkeleton,
  Select,
} from '@/components/ui';
import type { Brand, Category, Page, Product } from '@/types';

const SORTS = [
  { value: 'newest', label: 'Newest arrivals' },
  { value: 'popular', label: 'Most popular' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
  { value: 'name', label: 'Name A–Z' },
];

export default function ShopPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('section.viewAll'));
  const [params, setParams] = useSearchParams();
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);

  const page = Number(params.get('page') ?? 1);
  const category = params.get('category') ?? '';
  const brand = params.get('brand') ?? '';
  const sort = params.get('sort') ?? 'newest';
  const minPrice = params.get('minPrice') ?? '';
  const maxPrice = params.get('maxPrice') ?? '';
  const inStock = params.get('inStock') === 'true';
  const onSale = params.get('onSale') === 'true';

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedSearch) update('q', debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<Category[]>('/categories'),
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => api.get<Brand[]>('/brands'),
  });

  const query = useMemo(
    () =>
      queryString({
        page,
        limit: 12,
        q: params.get('q') ?? '',
        category,
        brand,
        sort,
        minPrice,
        maxPrice,
        inStock: inStock || undefined,
        onSale: onSale || undefined,
      }),
    [page, params, category, brand, sort, minPrice, maxPrice, inStock, onSale]
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shop-products', query],
    queryFn: () => api.page<Product>(`/products${query}`),
  });

  const activeCategory = categories?.find((item) => item.slug === category || item._id === category);
  const hasFilters = Boolean(category || brand || minPrice || maxPrice || inStock || onSale);

  const filterPanel = (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Categories</p>
        <div className="space-y-1.5">
          <button
            onClick={() => update('category', null)}
            className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
              !category ? 'bg-ink-900 text-white dark:bg-gold dark:text-ink-950' : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800'
            }`}
          >
            All products
          </button>
          {categories?.map((item) => (
            <button
              key={item._id}
              onClick={() => update('category', item.slug)}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm ${
                category === item.slug
                  ? 'bg-ink-900 text-white dark:bg-gold dark:text-ink-950'
                  : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800'
              }`}
            >
              <span>{item.name}</span>
              <span className="text-[11px] opacity-60">{item.productCount ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Brand</p>
        <Select value={brand} onChange={(event) => update('brand', event.target.value || null)}>
          <option value="">All brands</option>
          {brands?.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Price range</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder="Min"
            value={minPrice}
            onChange={(event) => update('minPrice', event.target.value)}
          />
          <span className="text-ink-300">—</span>
          <Input
            type="number"
            min={0}
            placeholder="Max"
            value={maxPrice}
            onChange={(event) => update('maxPrice', event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Checkbox label="In stock only" checked={inStock} onChange={(value) => update('inStock', value ? 'true' : null)} />
        <Checkbox label="On sale" checked={onSale} onChange={(value) => update('onSale', value ? 'true' : null)} />
      </div>

      {hasFilters && (
        <Button variant="outline" className="w-full" onClick={() => setParams({}, { replace: true })}>
          Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: t('nav.shop'), to: '/products' }, ...(activeCategory ? [{ label: activeCategory.name }] : [])]} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-semibold sm:text-4xl">{activeCategory?.name ?? t('section.viewAll')}</h1>
          <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-300">
            {activeCategory?.description ?? t('hero.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setShowFilters(true)}>
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </Button>
          <Select value={sort} onChange={(event) => update('sort', event.target.value)} className="w-44">
            {SORTS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="surface sticky top-24 p-5">{filterPanel}</div>
        </aside>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-ink-400">
              {data ? `${data.meta.total} product${data.meta.total === 1 ? '' : 's'}` : 'Loading products…'}
            </p>
            {hasFilters && (
              <button
                onClick={() => setParams({}, { replace: true })}
                className="flex items-center gap-1 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>

          {isError ? (
            <ErrorState message="We could not load the products. Please try again." onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {data.items.map((product) => (
                  <ProductCard key={product._id} product={product} onQuickView={setQuickView} />
                ))}
              </div>
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
                onChange={(value) => update('page', String(value))}
                className="mt-8"
              />
            </>
          ) : (
            <EmptyState
              title="No products found"
              description="Try adjusting your search or filters to find what you need."
              action={<Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
            />
          )}
        </div>
      </div>

      {showFilters && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm" aria-label="Close filters" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-y-0 right-0 w-[88%] max-w-sm overflow-y-auto bg-white p-5 shadow-lift dark:bg-ink-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Filters</h2>
              <button onClick={() => setShowFilters(false)} aria-label="Close" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            {filterPanel}
            <Button className="mt-5 w-full" onClick={() => setShowFilters(false)}>
              Show results
            </Button>
          </div>
        </div>
      )}

      <QuickViewModal product={quickView} open={Boolean(quickView)} onClose={() => setQuickView(null)} />
    </div>
  );
}
