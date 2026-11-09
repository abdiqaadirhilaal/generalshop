import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  ImagePlus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile, queryString } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
import { useDebounced, useMoney } from '@/lib/hooks';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  SearchInput,
  Select,
  TableSkeleton,
  Textarea,
  ImageUpload,
} from '@/components/ui';
import { cn, formatDate, formatNumber, statusTone } from '@/lib/format';
import type { Brand, Category, Page, Product, ProductVariation } from '@/types';

const UNITS = ['piece', 'box', 'kg', 'liter', 'pack', 'dozen', 'meter', 'other'] as const;
const STATUSES = ['active', 'draft', 'archived'] as const;

interface ProductFormState {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  description: string;
  shortDescription: string;
  unit: string;
  costPrice: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  minStockLevel: string;
  images: string[];
  specs: { key: string; value: string }[];
  variationLabel: string;
  variations: ProductVariation[];
  tags: string;
  status: 'active' | 'draft' | 'archived';
  isFeatured: boolean;
}

const emptyForm: ProductFormState = {
  name: '',
  sku: '',
  barcode: '',
  category: '',
  brand: '',
  description: '',
  shortDescription: '',
  unit: 'piece',
  costPrice: '0',
  price: '0',
  compareAtPrice: '',
  stock: '0',
  minStockLevel: '5',
  images: [''],
  specs: [],
  variationLabel: '',
  variations: [],
  tags: '',
  status: 'active',
  isFeatured: false,
};

function toForm(product: Product): ProductFormState {
  return {
    name: product.name,
    sku: product.sku ?? '',
    barcode: product.barcode ?? '',
    category: typeof product.category === 'string' ? product.category : product.category?._id ?? '',
    brand: typeof product.brand === 'string' ? product.brand : product.brand?._id ?? '',
    description: product.description ?? '',
    shortDescription: product.shortDescription ?? '',
    unit: product.unit ?? 'piece',
    costPrice: String(product.costPrice ?? 0),
    price: String(product.price ?? 0),
    compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
    stock: String(product.stock ?? 0),
    minStockLevel: String(product.minStockLevel ?? 5),
    images: product.images?.length ? product.images : [''],
    specs: product.specs?.length ? product.specs : [],
    variationLabel: product.variationLabel ?? '',
    variations: product.variations ?? [],
    tags: (product.tags ?? []).join(', '),
    status: product.status,
    isFeatured: Boolean(product.isFeatured),
  };
}

function categoryName(product: Product) {
  return typeof product.category === 'string' ? '—' : product.category?.name ?? '—';
}

function brandName(product: Product) {
  return typeof product.brand === 'string' ? product.brand : product.brand?.name ?? '—';
}

export default function Products() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const money = useMoney();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [status, setStatus] = useState('');
  const [stock, setStock] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);

  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: { row: number; message: string }[]; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canWrite = has('products:write');
  const canDelete = has('products:delete');

  const params = {
    page,
    limit: 20,
    q: debouncedSearch || undefined,
    category: category || undefined,
    brand: brand || undefined,
    status: status || undefined,
    stock: stock || undefined,
    sort,
  };

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-products', params],
    queryFn: () => api.page<Product>(`/admin/catalog/products${queryString(params)}`),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Category[]>('/admin/catalog/categories/admin'),
  });

  const { data: brands = [] } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get<Brand[]>('/admin/catalog/brands/admin'),
  });

  const products = data?.items ?? [];
  const meta = data?.meta;
  const allSelected = products.length > 0 && products.every((product) => selected.includes(product._id));

  const resetFilters = () => {
    setSearch('');
    setCategory('');
    setBrand('');
    setStatus('');
    setStock('');
    setSort('newest');
    setPage(1);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-brands'] });
  };

  const openCreate = () => {
    setForm({ ...emptyForm, images: [''], category: categories[0]?._id ?? '' });
    setFormError('');
    setCreating(true);
  };

  const openEdit = (product: Product) => {
    setForm(toForm(product));
    setFormError('');
    setEditing(product);
  };

  const closeForm = () => {
    if (saving) return;
    setCreating(false);
    setEditing(null);
  };

  const submit = async () => {
    setFormError('');
    if (!form.name.trim()) return setFormError('Product name is required.');
    if (!form.category) return setFormError('Choose a category.');
    if (!form.price || Number(form.price) < 0) return setFormError('Enter a valid selling price.');

    const body = {
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      category: form.category,
      brand: form.brand || null,
      description: form.description.trim() || undefined,
      shortDescription: form.shortDescription.trim() || undefined,
      unit: form.unit,
      costPrice: Number(form.costPrice) || 0,
      price: Number(form.price) || 0,
      compareAtPrice: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      stock: Number(form.stock) || 0,
      minStockLevel: Number(form.minStockLevel) || 0,
      images: form.images.map((image) => image.trim()).filter(Boolean),
      specs: form.specs.filter((spec) => spec.key.trim() && spec.value.trim()),
      variationLabel: form.variationLabel.trim() || undefined,
      variations: form.variations
        .filter((variation) => variation.label.trim())
        .map((variation) => ({
          label: variation.label.trim(),
          sku: variation.sku?.trim() || undefined,
          priceDelta: Number(variation.priceDelta) || 0,
          isDefault: Boolean(variation.isDefault),
        })),
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: form.status,
      isFeatured: form.isFeatured,
    };

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/admin/catalog/products/${editing._id}`, body);
        success('Product updated.');
      } else {
        await api.post('/admin/catalog/products', body);
        success('Product created.');
      }
      closeForm();
      refresh();
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      const result = await api.delete<{ deleted?: boolean; archived?: boolean; message?: string }>(
        `/admin/catalog/products/${deleting._id}`
      );
      success(result.message ?? (result.archived ? 'Product archived.' : 'Product deleted.'));
      setDeleting(null);
      setSelected((current) => current.filter((id) => id !== deleting._id));
      refresh();
    } catch (removeError) {
      error(removeError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const bulk = async (action: 'archive' | 'activate' | 'draft' | 'delete') => {
    if (!selected.length) return;
    try {
      const result = await api.post<{ updated?: number; deleted?: number; archived?: number }>(
        '/admin/catalog/products/bulk',
        { ids: selected, action }
      );
      success(
        action === 'delete'
          ? `${result.deleted ?? 0} deleted, ${result.archived ?? 0} archived.`
          : `${result.updated ?? 0} products updated.`
      );
      setSelected([]);
      refresh();
    } catch (bulkError) {
      error(bulkError);
    }
  };

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const result = await api.post<{ created: number; updated: number; errors: { row: number; message: string }[]; total: number }>(
        '/admin/catalog/products/import',
        { csv }
      );
      setImportResult(result);
      success(`Import finished: ${result.created} created, ${result.updated} updated.`);
      refresh();
    } catch (importError) {
      error(importError);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const header = 'name,sku,barcode,category,brand,unit,costPrice,price,compareAtPrice,stock,minStockLevel,status,description,images,tags';
    const sample = 'Sample product,,,General,Acme,piece,2.50,4.00,,25,5,active,A short description,,new|featured';
    const blob = new Blob([`${header}\n${sample}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'hilaal-products-template.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const updateForm = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const stats = useMemo(() => {
    const low = products.filter((product) => product.stock > 0 && product.stock <= product.minStockLevel).length;
    const out = products.filter((product) => product.stock <= 0).length;
    return { low, out };
  }, [products]);

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Products"
        description="Manage your catalogue, pricing, stock levels and online visibility."
        action={
          <>
            <Button variant="outline" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void downloadFile('/admin/catalog/products/export', 'hilaal-products.csv').catch(error)}>
              Export CSV
            </Button>
            {canWrite && (
              <Button variant="outline" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
                Import CSV
              </Button>
            )}
            {canWrite && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
                New product
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Products in view</p>
          <p className="mt-1 font-display text-2xl font-semibold">{formatNumber(meta?.total ?? 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Low stock (page)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-amber-600">{formatNumber(stats.low)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-ink-400">Out of stock (page)</p>
          <p className="mt-1 font-display text-2xl font-semibold text-rose-600">{formatNumber(stats.out)}</p>
        </Card>
      </div>

      <Card className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Search name, SKU or barcode" className="w-full sm:w-64" />
          <Select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="w-auto">
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </Select>
          <Select value={brand} onChange={(event) => { setBrand(event.target.value); setPage(1); }} className="w-auto">
            <option value="">All brands</option>
            {brands.map((item) => (
              <option key={item._id} value={item._id}>{item.name}</option>
            ))}
          </Select>
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="w-auto">
            <option value="">Any status</option>
            {STATUSES.map((value) => (
              <option key={value} value={value} className="capitalize">{value}</option>
            ))}
          </Select>
          <Select value={stock} onChange={(event) => { setStock(event.target.value); setPage(1); }} className="w-auto">
            <option value="">Any stock</option>
            <option value="in">In stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-auto">
            <option value="newest">Newest</option>
            <option value="name">Name A–Z</option>
            <option value="stock">Lowest stock</option>
            <option value="price">Highest price</option>
            <option value="popular">Best selling</option>
          </Select>
          {(search || category || brand || status || stock) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} icon={<X className="h-3.5 w-3.5" />}>Clear</Button>
          )}
        </div>
      </Card>

      {selected.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold-200 bg-gold-50 px-3 py-2 text-sm dark:border-gold-800 dark:bg-gold-900/20">
          <span className="font-medium text-gold-800 dark:text-gold-200">{selected.length} selected</span>
          {canWrite && (
            <>
              <Button size="sm" variant="outline" onClick={() => void bulk('activate')}>Activate</Button>
              <Button size="sm" variant="outline" onClick={() => void bulk('draft')}>Set draft</Button>
              <Button size="sm" variant="outline" onClick={() => void bulk('archive')}>Archive</Button>
            </>
          )}
          {canDelete && (
            <Button size="sm" variant="danger" onClick={() => void bulk('delete')}>Delete</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-rose-600">{apiErrorMessage(queryError)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </Card>
      ) : isLoading ? (
        <Card className="p-4"><TableSkeleton rows={8} /></Card>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PackagePlus className="h-6 w-6" />}
            title="No products found"
            description="Adjust your filters or add your first product to get started."
            action={canWrite ? <Button variant="secondary" onClick={openCreate} icon={<Plus className="h-4 w-4" />}>New product</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(event) => setSelected(event.target.checked ? products.map((product) => product._id) : [])}
                      aria-label="Select all products"
                      className="h-4 w-4 rounded border-line accent-gold"
                    />
                  </th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Stock</th>
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {products.map((product) => {
                  const low = product.stock > 0 && product.stock <= product.minStockLevel;
                  const out = product.stock <= 0;
                  return (
                    <tr key={product._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.includes(product._id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked ? [...current, product._id] : current.filter((id) => id !== product._id)
                            )
                          }
                          aria-label={`Select ${product.name}`}
                          className="h-4 w-4 rounded border-line accent-gold"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
                            {product.images?.[0] ? (
                              <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-ink-300"><ImagePlus className="h-4 w-4" /></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink-900 dark:text-white">{product.name}</p>
                            <p className="text-xs text-ink-400">{product.sku} · {brandName(product)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-500 dark:text-ink-300">{categoryName(product)}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('font-medium', out ? 'text-rose-600' : low ? 'text-amber-600' : 'text-ink-700 dark:text-ink-200')}>
                          {formatNumber(product.stock)} {product.unit}
                        </span>
                        <p className="text-[11px] text-ink-400">Min {product.minStockLevel}</p>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <p className="font-medium">{money.format(product.price)}</p>
                        {product.compareAtPrice ? <p className="text-xs text-ink-400 line-through">{money.format(product.compareAtPrice)}</p> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={statusTone(product.status) as 'emerald' | 'amber' | 'slate'}>{product.status}</Badge>
                        {product.isFeatured && <Badge tone="gold" className="ml-1">Featured</Badge>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" aria-label={`Edit ${product.name}`} onClick={() => openEdit(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canDelete && (
                            <Button variant="ghost" size="icon" aria-label={`Delete ${product.name}`} onClick={() => setDeleting(product)}>
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3 pb-3 dark:border-ink-800">
            <Pagination page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} total={meta?.total} onChange={setPage} />
          </div>
        </Card>
      )}

      <Modal
        open={creating || Boolean(editing)}
        onClose={closeForm}
        title={editing ? 'Edit product' : 'New product'}
        description="Prices are stored in the shop currency. Stock changes are recorded as inventory movements."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={closeForm} disabled={saving}>Cancel</Button>
            <Button onClick={() => void submit()} loading={saving}>{editing ? 'Save changes' : 'Create product'}</Button>
          </>
        }
      >
        <div className="space-y-5">
          {formError && <Alert tone="danger">{formError}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name" required className="sm:col-span-2">
              <Input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Basmati Rice 5kg" />
            </Field>
            <Field label="SKU" hint="Leave blank to generate automatically">
              <Input value={form.sku} onChange={(event) => updateForm('sku', event.target.value)} placeholder="HIL-0001" />
            </Field>
            <Field label="Barcode">
              <Input value={form.barcode} onChange={(event) => updateForm('barcode', event.target.value)} />
            </Field>
            <Field label="Category" required>
              <Select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>
                <option value="">Choose a category</option>
                {categories.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Brand">
              <Select value={form.brand} onChange={(event) => updateForm('brand', event.target.value)}>
                <option value="">No brand</option>
                {brands.map((item) => (
                  <option key={item._id} value={item._id}>{item.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit">
              <Select value={form.unit} onChange={(event) => updateForm('unit', event.target.value)}>
                {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(event) => updateForm('status', event.target.value as ProductFormState['status'])}>
                {STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
              </Select>
            </Field>
            <Field label="Selling price" required>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', event.target.value)} />
            </Field>
            <Field label="Compare-at price" hint="Shown as the original price">
              <Input type="number" min="0" step="0.01" value={form.compareAtPrice} onChange={(event) => updateForm('compareAtPrice', event.target.value)} />
            </Field>
            <Field label="Cost price" hint="Used for COGS and margin">
              <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(event) => updateForm('costPrice', event.target.value)} />
            </Field>
            <Field label="Stock on hand" hint={editing ? 'Changing this records a stock adjustment' : 'Creates an opening stock movement'}>
              <Input type="number" min="0" step="1" value={form.stock} onChange={(event) => updateForm('stock', event.target.value)} />
            </Field>
            <Field label="Low stock threshold">
              <Input type="number" min="0" step="1" value={form.minStockLevel} onChange={(event) => updateForm('minStockLevel', event.target.value)} />
            </Field>
            <div className="flex items-end pb-2">
              <Checkbox label="Feature on the homepage" checked={form.isFeatured} onChange={(value) => updateForm('isFeatured', value)} />
            </div>
          </div>

          <Field label="Short description">
            <Input value={form.shortDescription} onChange={(event) => updateForm('shortDescription', event.target.value)} maxLength={300} />
          </Field>
          <Field label="Full description">
            <Textarea value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={4} />
          </Field>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-700 dark:text-ink-200">Images</p>
            <div className="space-y-3">
              {form.images.map((image, index) => (
                <div key={index} className="flex items-start gap-2">
                  <div className="flex-1">
                    <ImageUpload
                      value={image}
                      onChange={(url) => {
                        const next = [...form.images];
                        next[index] = url;
                        updateForm('images', next);
                      }}
                      label={index === 0 ? 'Primary image' : `Image ${index + 1}`}
                    />
                  </div>
                  {form.images.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-7"
                      aria-label="Remove image"
                      onClick={() => updateForm('images', form.images.filter((_, position) => position !== index))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => updateForm('images', [...form.images, ''])}>
                Add image
              </Button>
            </div>
          </div>

          <Field label="Tags" hint="Comma separated, e.g. rice, staple, family-pack">
            <Input value={form.tags} onChange={(event) => updateForm('tags', event.target.value)} />
          </Field>

          <div className="rounded-xl border border-line p-3 dark:border-ink-800">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Variations</p>
                <p className="text-xs text-ink-400">Optional options such as size or pack. Prices are adjusted by the delta.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() =>
                  updateForm('variations', [
                    ...form.variations,
                    { label: '', sku: '', priceDelta: 0, isDefault: form.variations.length === 0 },
                  ])
                }
              >
                Add
              </Button>
            </div>
            {form.variationLabel !== undefined && (
              <Field label="Variation label" className="mb-3">
                <Input value={form.variationLabel} onChange={(event) => updateForm('variationLabel', event.target.value)} placeholder="e.g. Size" />
              </Field>
            )}
            <div className="space-y-2">
              {form.variations.map((variation, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Input
                    className="w-40"
                    placeholder="Label"
                    value={variation.label}
                    onChange={(event) => {
                      const next = [...form.variations];
                      next[index] = { ...next[index], label: event.target.value };
                      updateForm('variations', next);
                    }}
                  />
                  <Input
                    className="w-32"
                    placeholder="SKU"
                    value={variation.sku ?? ''}
                    onChange={(event) => {
                      const next = [...form.variations];
                      next[index] = { ...next[index], sku: event.target.value };
                      updateForm('variations', next);
                    }}
                  />
                  <Input
                    className="w-28"
                    type="number"
                    step="0.01"
                    placeholder="Delta"
                    value={String(variation.priceDelta)}
                    onChange={(event) => {
                      const next = [...form.variations];
                      next[index] = { ...next[index], priceDelta: Number(event.target.value) || 0 };
                      updateForm('variations', next);
                    }}
                  />
                  <Checkbox
                    label="Default"
                    checked={variation.isDefault}
                    onChange={(checked) => {
                      const next = form.variations.map((item, position) => ({
                        ...item,
                        isDefault: checked ? position === index : item.isDefault,
                      }));
                      updateForm('variations', next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove variation"
                    onClick={() => updateForm('variations', form.variations.filter((_, position) => position !== index))}
                  >
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
              {form.variations.length === 0 && <p className="text-xs text-ink-400">No variations yet.</p>}
            </div>
          </div>

          <div className="rounded-xl border border-line p-3 dark:border-ink-800">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Specifications</p>
                <p className="text-xs text-ink-400">Key/value details shown on the product page.</p>
              </div>
              <Button variant="outline" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => updateForm('specs', [...form.specs, { key: '', value: '' }])}>
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {form.specs.map((spec, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    className="w-40"
                    placeholder="Key"
                    value={spec.key}
                    onChange={(event) => {
                      const next = [...form.specs];
                      next[index] = { ...next[index], key: event.target.value };
                      updateForm('specs', next);
                    }}
                  />
                  <Input
                    placeholder="Value"
                    value={spec.value}
                    onChange={(event) => {
                      const next = [...form.specs];
                      next[index] = { ...next[index], value: event.target.value };
                      updateForm('specs', next);
                    }}
                  />
                  <Button variant="ghost" size="icon" aria-label="Remove specification" onClick={() => updateForm('specs', form.specs.filter((_, position) => position !== index))}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              ))}
              {form.specs.length === 0 && <p className="text-xs text-ink-400">No specifications yet.</p>}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => { if (!importing) { setImportOpen(false); setImportResult(null); } }}
        title="Import products from CSV"
        description="Columns: name, sku, barcode, category, brand, unit, costPrice, price, compareAtPrice, stock, minStockLevel, status, description, images, tags."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>Close</Button>
            <Button onClick={() => void runImport()} loading={importing} disabled={!csv.trim()}>Run import</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Alert tone="info">
            Existing SKUs are updated, new rows are created. Categories and brands are matched by name and created when missing. Images and tags are pipe-separated.
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={downloadTemplate}>Download template</Button>
            <Button variant="outline" size="sm" icon={<FileSpreadsheet className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>Choose CSV file</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setCsv(String(reader.result ?? ''));
                reader.readAsText(file);
                event.target.value = '';
              }}
            />
          </div>
          <Field label="CSV content">
            <Textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={10} placeholder="name,sku,category,price,stock…" />
          </Field>
          {importResult && (
            <div className="space-y-2">
              <Alert tone={importResult.errors.length ? 'warning' : 'success'} title="Import summary">
                {importResult.total} rows processed · {importResult.created} created · {importResult.updated} updated · {importResult.errors.length} errors.
              </Alert>
              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-line p-2 text-xs dark:border-ink-800">
                  {importResult.errors.map((item) => (
                    <p key={`${item.row}-${item.message}`} className="py-0.5 text-rose-600">Row {item.row}: {item.message}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete product"
        description={`Delete ${deleting?.name ?? 'this product'}? Products with sales history are archived instead of deleted.`}
        confirmLabel="Delete"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
