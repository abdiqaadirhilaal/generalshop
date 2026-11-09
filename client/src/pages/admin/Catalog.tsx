import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderTree, ImagePlus, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
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
  ImageUpload,
  Input,
  Modal,
  PageLoader,
  Tabs,
  Textarea,
} from '@/components/ui';
import { formatNumber, statusTone } from '@/lib/format';
import type { Brand, Category } from '@/types';

interface CategoryForm {
  name: string;
  description: string;
  image: string;
  parent: string;
  isActive: boolean;
  sortOrder: string;
}

interface BrandForm {
  name: string;
  description: string;
  logo: string;
  isActive: boolean;
}

const emptyCategory: CategoryForm = {
  name: '',
  description: '',
  image: '',
  parent: '',
  isActive: true,
  sortOrder: '0',
};

const emptyBrand: BrandForm = { name: '', description: '', logo: '', isActive: true };

export default function Catalog() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const canWrite = has('categories:write');

  const [tab, setTab] = useState('categories');

  const [categoryForm, setCategoryForm] = useState<CategoryForm>(emptyCategory);
  const [categoryEditing, setCategoryEditing] = useState<Category | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [categoryDeleting, setCategoryDeleting] = useState<Category | null>(null);
  const [categoryDeleteLoading, setCategoryDeleteLoading] = useState(false);

  const [brandForm, setBrandForm] = useState<BrandForm>(emptyBrand);
  const [brandEditing, setBrandEditing] = useState<Brand | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandError, setBrandError] = useState('');
  const [brandDeleting, setBrandDeleting] = useState<Brand | null>(null);
  const [brandDeleteLoading, setBrandDeleteLoading] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<Category[]>('/admin/catalog/categories/admin'),
  });
  const brandsQuery = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get<Brand[]>('/admin/catalog/brands/admin'),
  });

  const categories = categoriesQuery.data ?? [];
  const brands = brandsQuery.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-brands'] });
    void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
  };

  const openCategoryCreate = () => {
    setCategoryForm(emptyCategory);
    setCategoryEditing(null);
    setCategoryError('');
    setCategoryOpen(true);
  };

  const openCategoryEdit = (category: Category) => {
    setCategoryForm({
      name: category.name,
      description: category.description ?? '',
      image: category.image ?? '',
      parent: typeof category.parent === 'string' ? category.parent : category.parent?._id ?? '',
      isActive: category.isActive,
      sortOrder: String(category.sortOrder ?? 0),
    });
    setCategoryEditing(category);
    setCategoryError('');
    setCategoryOpen(true);
  };

  const saveCategory = async () => {
    if (!categoryForm.name.trim()) return setCategoryError('Category name is required.');
    setCategorySaving(true);
    setCategoryError('');
    const body = {
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim() || undefined,
      image: categoryForm.image.trim() || undefined,
      parent: categoryForm.parent || null,
      isActive: categoryForm.isActive,
      sortOrder: Number(categoryForm.sortOrder) || 0,
    };
    try {
      if (categoryEditing) {
        await api.patch(`/admin/catalog/categories/${categoryEditing._id}`, body);
        success('Category updated.');
      } else {
        await api.post('/admin/catalog/categories', body);
        success('Category created.');
      }
      setCategoryOpen(false);
      refresh();
    } catch (saveError) {
      setCategoryError(apiErrorMessage(saveError));
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteCategory = async () => {
    if (!categoryDeleting) return;
    setCategoryDeleteLoading(true);
    try {
      const result = await api.delete<{ deleted?: boolean; archived?: boolean; message?: string }>(
        `/admin/catalog/categories/${categoryDeleting._id}`
      );
      success(result.message ?? (result.archived ? 'Category deactivated.' : 'Category deleted.'));
      setCategoryDeleting(null);
      refresh();
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setCategoryDeleteLoading(false);
    }
  };

  const openBrandCreate = () => {
    setBrandForm(emptyBrand);
    setBrandEditing(null);
    setBrandError('');
    setBrandOpen(true);
  };

  const openBrandEdit = (brand: Brand) => {
    setBrandForm({
      name: brand.name,
      description: brand.description ?? '',
      logo: brand.logo ?? '',
      isActive: brand.isActive,
    });
    setBrandEditing(brand);
    setBrandError('');
    setBrandOpen(true);
  };

  const saveBrand = async () => {
    if (!brandForm.name.trim()) return setBrandError('Brand name is required.');
    setBrandSaving(true);
    setBrandError('');
    const body = {
      name: brandForm.name.trim(),
      description: brandForm.description.trim() || undefined,
      logo: brandForm.logo.trim() || undefined,
      isActive: brandForm.isActive,
    };
    try {
      if (brandEditing) {
        await api.patch(`/admin/catalog/brands/${brandEditing._id}`, body);
        success('Brand updated.');
      } else {
        await api.post('/admin/catalog/brands', body);
        success('Brand created.');
      }
      setBrandOpen(false);
      refresh();
    } catch (saveError) {
      setBrandError(apiErrorMessage(saveError));
    } finally {
      setBrandSaving(false);
    }
  };

  const deleteBrand = async () => {
    if (!brandDeleting) return;
    setBrandDeleteLoading(true);
    try {
      await api.delete(`/admin/catalog/brands/${brandDeleting._id}`);
      success('Brand deleted.');
      setBrandDeleting(null);
      refresh();
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setBrandDeleteLoading(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Categories & brands"
        description="Organise how products are grouped and filtered across the storefront."
        action={
          canWrite ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus className="h-4 w-4" />}
              onClick={tab === 'categories' ? openCategoryCreate : openBrandCreate}
            >
              New {tab === 'categories' ? 'category' : 'brand'}
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { value: 'categories', label: 'Categories', count: categories.length },
          { value: 'brands', label: 'Brands', count: brands.length },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4 max-w-sm"
      />

      {tab === 'categories' ? (
        categoriesQuery.isLoading ? (
          <PageLoader />
        ) : categoriesQuery.isError ? (
          <Card className="p-6 text-sm text-rose-600">{apiErrorMessage(categoriesQuery.error)}</Card>
        ) : categories.length === 0 ? (
          <Card>
            <EmptyState
              icon={<FolderTree className="h-6 w-6" />}
              title="No categories yet"
              description="Create categories so customers can browse your catalogue."
              action={canWrite ? <Button variant="secondary" onClick={openCategoryCreate}>New category</Button> : undefined}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => (
              <Card key={category._id} className="flex flex-col overflow-hidden">
                <div className="relative h-28 bg-ink-100 dark:bg-ink-800">
                  {category.image ? (
                    <img src={category.image} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-ink-300"><FolderTree className="h-7 w-7" /></div>
                  )}
                  <div className="absolute left-3 top-3 flex gap-1">
                    <Badge tone={category.isActive ? 'emerald' : 'slate'}>{category.isActive ? 'Active' : 'Hidden'}</Badge>
                    {category.parent && (
                      <Badge tone="slate">
                        {typeof category.parent === 'string' ? 'Subcategory' : `Under ${category.parent.name}`}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-base font-semibold text-ink-900 dark:text-white">{category.name}</h3>
                      <p className="text-xs text-ink-400">{formatNumber(category.productCount ?? 0)} products · order {category.sortOrder}</p>
                    </div>
                    {canWrite && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${category.name}`} onClick={() => openCategoryEdit(category)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label={`Delete ${category.name}`} onClick={() => setCategoryDeleting(category)}>
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-500 dark:text-ink-300">{category.description || 'No description yet.'}</p>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : brandsQuery.isLoading ? (
        <PageLoader />
      ) : brandsQuery.isError ? (
        <Card className="p-6 text-sm text-rose-600">{apiErrorMessage(brandsQuery.error)}</Card>
      ) : brands.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tag className="h-6 w-6" />}
            title="No brands yet"
            description="Add brands to group products from the same maker."
            action={canWrite ? <Button variant="secondary" onClick={openBrandCreate}>New brand</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                <tr>
                  <th className="px-4 py-2.5">Brand</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line dark:divide-ink-800">
                {brands.map((brand) => (
                  <tr key={brand._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 overflow-hidden rounded-lg bg-ink-100 dark:bg-ink-800">
                          {brand.logo ? (
                            <img src={brand.logo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-ink-300"><ImagePlus className="h-4 w-4" /></div>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-ink-900 dark:text-white">{brand.name}</p>
                          <p className="text-xs text-ink-400">{brand.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-300">{brand.description || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(brand.isActive ? 'active' : 'inactive') as 'emerald' | 'slate'}>
                        {brand.isActive ? 'active' : 'inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canWrite && (
                          <>
                            <Button variant="ghost" size="icon" aria-label={`Edit ${brand.name}`} onClick={() => openBrandEdit(brand)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label={`Delete ${brand.name}`} onClick={() => setBrandDeleting(brand)}>
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={categoryOpen}
        onClose={() => { if (!categorySaving) setCategoryOpen(false); }}
        title={categoryEditing ? 'Edit category' : 'New category'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setCategoryOpen(false)} disabled={categorySaving}>Cancel</Button>
            <Button onClick={() => void saveCategory()} loading={categorySaving}>{categoryEditing ? 'Save changes' : 'Create category'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {categoryError && <Alert tone="danger">{categoryError}</Alert>}
          <Field label="Name" required>
            <Input value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} rows={3} />
          </Field>
          <ImageUpload value={categoryForm.image} onChange={(url) => setCategoryForm({ ...categoryForm, image: url })} label="Category image" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parent category" hint="Leave empty for a top-level category">
              <select
                value={categoryForm.parent}
                onChange={(event) => setCategoryForm({ ...categoryForm, parent: event.target.value })}
                className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
              >
                <option value="">Top level</option>
                {categories
                  .filter((category) => category._id !== categoryEditing?._id)
                  .map((category) => (
                    <option key={category._id} value={category._id}>{category.name}</option>
                  ))}
              </select>
            </Field>
            <Field label="Sort order">
              <Input type="number" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm({ ...categoryForm, sortOrder: event.target.value })} />
            </Field>
          </div>
          <Checkbox
            label="Visible on the storefront"
            checked={categoryForm.isActive}
            onChange={(value) => setCategoryForm({ ...categoryForm, isActive: value })}
          />
        </div>
      </Modal>

      <Modal
        open={brandOpen}
        onClose={() => { if (!brandSaving) setBrandOpen(false); }}
        title={brandEditing ? 'Edit brand' : 'New brand'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setBrandOpen(false)} disabled={brandSaving}>Cancel</Button>
            <Button onClick={() => void saveBrand()} loading={brandSaving}>{brandEditing ? 'Save changes' : 'Create brand'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {brandError && <Alert tone="danger">{brandError}</Alert>}
          <Field label="Name" required>
            <Input value={brandForm.name} onChange={(event) => setBrandForm({ ...brandForm, name: event.target.value })} />
          </Field>
          <Field label="Description">
            <Textarea value={brandForm.description} onChange={(event) => setBrandForm({ ...brandForm, description: event.target.value })} rows={3} />
          </Field>
          <ImageUpload value={brandForm.logo} onChange={(url) => setBrandForm({ ...brandForm, logo: url })} label="Brand logo" />
          <Checkbox
            label="Active brand"
            checked={brandForm.isActive}
            onChange={(value) => setBrandForm({ ...brandForm, isActive: value })}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(categoryDeleting)}
        onClose={() => setCategoryDeleting(null)}
        onConfirm={() => void deleteCategory()}
        title="Delete category"
        description={`Delete ${categoryDeleting?.name ?? 'this category'}? Categories with products or subcategories are deactivated instead.`}
        confirmLabel="Delete"
        danger
        loading={categoryDeleteLoading}
      />
      <ConfirmDialog
        open={Boolean(brandDeleting)}
        onClose={() => setBrandDeleting(null)}
        onConfirm={() => void deleteBrand()}
        title="Delete brand"
        description={`Delete ${brandDeleting?.name ?? 'this brand'}? Brands used by products cannot be deleted.`}
        confirmLabel="Delete"
        danger
        loading={brandDeleteLoading}
      />
    </div>
  );
}
