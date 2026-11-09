import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  Banknote,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Globe2,
  Heart,
  Image as ImageIcon,
  Inbox,
  LayoutTemplate,
  Mail,
  MailOpen,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  Store,
  Trash2,
  Users,
} from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuth, useSettings, useToast } from '@/context/AppProviders';
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
  SearchInput,
  Select,
  StatCard,
  TableSkeleton,
  Tabs,
  Textarea,
  Toggle,
} from '@/components/ui';
import { formatDate, titleCase } from '@/lib/format';
import type { ContentPage, HomepageSettings, ShopSettings } from '@/types';

interface ContactMessage {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'resolved';
  createdAt: string;
}

interface NewsletterSubscriber {
  _id: string;
  email: string;
  status: 'subscribed' | 'unsubscribed';
  source: string;
  createdAt: string;
}

interface PageForm {
  slug: string;
  title: string;
  subtitle: string;
  body: string;
  sections: { heading: string; body: string }[];
  isPublished: boolean;
}

const DEFAULT_HOMEPAGE: HomepageSettings = {
  hero: {
    eyebrow: '',
    title: '',
    subtitle: '',
    image: '',
    ctaLabel: 'Shop now',
    ctaLink: '/products',
    secondaryLabel: '',
    secondaryLink: '',
  },
  promoBanners: [],
  sections: {
    featuredCategories: true,
    newArrivals: true,
    bestSellers: true,
    offers: true,
    recommended: true,
    reviews: true,
    newsletter: true,
    promo: true,
  },
};

const SECTION_LABELS: Record<string, { label: string; description: string }> = {
  featuredCategories: { label: 'Featured categories', description: 'Show the category grid below the hero.' },
  newArrivals: { label: 'New arrivals', description: 'Latest products added to the catalogue.' },
  bestSellers: { label: 'Best sellers', description: 'Products ranked by units sold.' },
  offers: { label: 'Offers', description: 'Products with a compare-at price or discount.' },
  recommended: { label: 'Recommended', description: 'Personalised and featured product suggestions.' },
  reviews: { label: 'Customer reviews', description: 'Approved reviews from real customers.' },
  newsletter: { label: 'Newsletter signup', description: 'Collect email subscribers at the bottom of the page.' },
  promo: { label: 'Promo banner', description: 'The highlighted promotional banner block.' },
};

const TABS = [
  { value: 'general', label: 'General' },
  { value: 'payments', label: 'Payments' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'homepage', label: 'Homepage' },
  { value: 'content', label: 'Content pages' },
  { value: 'messages', label: 'Messages' },
  { value: 'newsletter', label: 'Newsletter' },
];

const emptyPage: PageForm = {
  slug: '',
  title: '',
  subtitle: '',
  body: '',
  sections: [],
  isPublished: true,
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function Settings() {
  const { has } = useAuth();
  const { refresh: refreshPublicSettings } = useSettings();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const canSettings = has('settings:write');
  const canContent = has('content:write');

  const [tab, setTab] = useState('general');
  const [draft, setDraft] = useState<ShopSettings | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const [messageStatus, setMessageStatus] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [messageDetail, setMessageDetail] = useState<ContactMessage | null>(null);

  const [pageForm, setPageForm] = useState<PageForm | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [pageSaving, setPageSaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [deletingPage, setDeletingPage] = useState<ContentPage | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [deletingSubscriber, setDeletingSubscriber] = useState<NewsletterSubscriber | null>(null);
  const [subscriberLoading, setSubscriberLoading] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<ShopSettings>('/admin/settings'),
  });

  const contentQuery = useQuery({
    queryKey: ['admin-content'],
    queryFn: () => api.get<ContentPage[]>('/admin/content'),
    enabled: tab === 'content',
  });

  const messagesQuery = useQuery({
    queryKey: ['admin-messages', messageStatus],
    queryFn: () => api.get<ContactMessage[]>(`/admin/messages${messageStatus ? `?status=${messageStatus}` : ''}`),
    enabled: tab === 'messages',
  });

  const newsletterQuery = useQuery({
    queryKey: ['admin-newsletter'],
    queryFn: () => api.get<NewsletterSubscriber[]>('/admin/newsletter'),
    enabled: tab === 'newsletter',
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const data = settingsQuery.data;
    setDraft({
      ...data,
      homepage: data.homepage ?? DEFAULT_HOMEPAGE,
      loyalty: data.loyalty ?? { enabled: true, pointsPerCurrencyUnit: 1, redeemValue: 0.01 },
      paymentMethods: data.paymentMethods ?? [],
      social: data.social ?? {},
      invoice: data.invoice ?? { prefix: 'INV', footer: '', showLogo: true },
      receipt: data.receipt ?? { prefix: 'RCT', footer: '' },
      notifications: data.notifications ?? {},
    });
  }, [settingsQuery.data]);

  const contentPages = contentQuery.data ?? [];
  const messages = messagesQuery.data ?? [];
  const subscribers = newsletterQuery.data ?? [];

  const filteredMessages = useMemo(() => {
    const term = messageSearch.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter(
      (message) =>
        message.name.toLowerCase().includes(term) ||
        message.email.toLowerCase().includes(term) ||
        message.subject.toLowerCase().includes(term)
    );
  }, [messages, messageSearch]);

  const newMessageCount = messages.filter((message) => message.status === 'new').length;
  const subscribedCount = subscribers.filter((subscriber) => subscriber.status === 'subscribed').length;

  const refreshSettings = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    void refreshPublicSettings();
  };

  const patch = (partial: Partial<ShopSettings>) =>
    setDraft((current) => (current ? { ...current, ...partial } : current));

  const patchHomepage = (partial: Partial<HomepageSettings>) =>
    setDraft((current) =>
      current ? { ...current, homepage: { ...(current.homepage ?? DEFAULT_HOMEPAGE), ...partial } } : current
    );

  const save = async (scope: 'general' | 'payments' | 'loyalty' | 'homepage') => {
    if (!draft) return;
    setSaving(scope);
    try {
      let body: Record<string, unknown> = {};
      if (scope === 'general') {
        body = {
          shopName: draft.shopName,
          logoUrl: draft.logoUrl ?? '',
          address: draft.address,
          phone: draft.phone,
          email: draft.email,
          currency: draft.currency,
          currencySymbol: draft.currencySymbol,
          exchangeRate: draft.exchangeRate,
          taxEnabled: draft.taxEnabled,
          taxRate: draft.taxRate,
          deliveryFee: draft.deliveryFee,
          freeDeliveryThreshold: draft.freeDeliveryThreshold,
          guestCheckout: draft.guestCheckout,
          allowNegativeStock: draft.allowNegativeStock ?? false,
          lowStockAlerts: draft.lowStockAlerts ?? true,
          businessHours: draft.businessHours ?? '',
          social: draft.social ?? {},
          invoice: draft.invoice,
          receipt: draft.receipt,
          notifications: draft.notifications ?? {},
        };
      } else if (scope === 'payments') {
        body = { paymentMethods: draft.paymentMethods };
      } else if (scope === 'loyalty') {
        body = { loyalty: draft.loyalty };
      } else {
        body = { homepage: draft.homepage ?? DEFAULT_HOMEPAGE };
      }

      await api.put('/admin/settings', body);
      success('Settings saved.');
      refreshSettings();
    } catch (saveError) {
      error(saveError);
    } finally {
      setSaving(null);
    }
  };

  const updatePayment = (index: number, partial: Partial<ShopSettings['paymentMethods'][number]>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            paymentMethods: current.paymentMethods.map((method, methodIndex) =>
              methodIndex === index ? { ...method, ...partial } : method
            ),
          }
        : current
    );

  const updateBanner = (index: number, partial: Partial<HomepageSettings['promoBanners'][number]>) =>
    setDraft((current) => {
      if (!current) return current;
      const homepage = current.homepage ?? DEFAULT_HOMEPAGE;
      return {
        ...current,
        homepage: {
          ...homepage,
          promoBanners: homepage.promoBanners.map((banner, bannerIndex) =>
            bannerIndex === index ? { ...banner, ...partial } : banner
          ),
        },
      };
    });

  const addBanner = () =>
    setDraft((current) => {
      if (!current) return current;
      const homepage = current.homepage ?? DEFAULT_HOMEPAGE;
      return {
        ...current,
        homepage: {
          ...homepage,
          promoBanners: [
            ...homepage.promoBanners,
            { title: '', subtitle: '', image: '', link: '/products', cta: 'Shop now', active: true },
          ],
        },
      };
    });

  const removeBanner = (index: number) =>
    setDraft((current) => {
      if (!current) return current;
      const homepage = current.homepage ?? DEFAULT_HOMEPAGE;
      return {
        ...current,
        homepage: {
          ...homepage,
          promoBanners: homepage.promoBanners.filter((_, bannerIndex) => bannerIndex !== index),
        },
      };
    });

  const openEditPage = (page: ContentPage) => {
    setEditingSlug(page.slug);
    setPageForm({
      slug: page.slug,
      title: page.title,
      subtitle: page.subtitle ?? '',
      body: page.body ?? '',
      sections: page.sections ?? [],
      isPublished: page.isPublished,
    });
    setPageError('');
  };

  const openCreatePage = () => {
    setEditingSlug(null);
    setPageForm({ ...emptyPage });
    setPageError('');
  };

  const savePage = async () => {
    if (!pageForm) return;
    setPageError('');
    const slug = slugify(pageForm.slug || pageForm.title);
    if (!slug) return setPageError('Enter a page slug or title.');
    if (pageForm.title.trim().length < 2) return setPageError('Enter a page title.');

    setPageSaving(true);
    try {
      await api.put(`/admin/content/${slug}`, {
        title: pageForm.title.trim(),
        subtitle: pageForm.subtitle.trim() || undefined,
        body: pageForm.body,
        sections: pageForm.sections.filter((section) => section.heading.trim() || section.body.trim()),
        isPublished: pageForm.isPublished,
      });
      success('Content page saved.');
      setPageForm(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-content'] });
    } catch (saveError) {
      setPageError(apiErrorMessage(saveError));
    } finally {
      setPageSaving(false);
    }
  };

  const removePage = async () => {
    if (!deletingPage) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/content/${deletingPage.slug}`);
      success('Content page deleted.');
      setDeletingPage(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-content'] });
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setDeleteLoading(false);
    }
  };

  const markMessage = async (message: ContactMessage, status: ContactMessage['status']) => {
    try {
      await api.patch(`/admin/messages/${message._id}`, { status });
      success(`Message marked as ${status}.`);
      setMessageDetail((current) => (current && current._id === message._id ? { ...current, status } : current));
      void queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
    } catch (markError) {
      error(markError);
    }
  };

  const removeSubscriber = async () => {
    if (!deletingSubscriber) return;
    setSubscriberLoading(true);
    try {
      await api.delete(`/admin/newsletter/${deletingSubscriber._id}`);
      success('Subscriber removed.');
      setDeletingSubscriber(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-newsletter'] });
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setSubscriberLoading(false);
    }
  };

  const homepage = draft?.homepage ?? DEFAULT_HOMEPAGE;
  const settingsLoading = settingsQuery.isLoading || !draft;

  return (
    <div>
      <AdminPageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Shop identity, payments, loyalty, homepage content, support messages and newsletter subscribers."
      />

      <div className="mb-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {settingsQuery.isError && (
        <Card className="mb-4 p-4">
          <Alert tone="danger">{apiErrorMessage(settingsQuery.error)}</Alert>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void settingsQuery.refetch()}>
            Retry
          </Button>
        </Card>
      )}

      {tab === 'general' && (
        settingsLoading ? (
          <Card className="p-4">
            <TableSkeleton rows={8} />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <Store className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Shop identity</h3>
                  <p className="text-xs text-ink-400">Shown across the storefront, invoices and receipts.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Shop name" required>
                  <Input value={draft.shopName} onChange={(event) => patch({ shopName: event.target.value })} />
                </Field>
                <Field label="Contact email" required>
                  <Input type="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} />
                </Field>
                <Field label="Phone">
                  <Input value={draft.phone} onChange={(event) => patch({ phone: event.target.value })} />
                </Field>
                <Field label="Business hours">
                  <Input
                    value={draft.businessHours ?? ''}
                    onChange={(event) => patch({ businessHours: event.target.value })}
                    placeholder="Sat–Thu, 8:00–20:00"
                  />
                </Field>
              </div>
              <Field label="Address" className="mt-4">
                <Input value={draft.address} onChange={(event) => patch({ address: event.target.value })} />
              </Field>
              <div className="mt-4 max-w-xs">
                <ImageUpload
                  label="Shop logo"
                  value={draft.logoUrl}
                  onChange={(url) => patch({ logoUrl: url })}
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <Globe2 className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Currency &amp; checkout</h3>
                  <p className="text-xs text-ink-400">Prices are stored in the base currency and displayed using these rules.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Currency">
                  <Select
                    value={draft.currency}
                    onChange={(event) => {
                      const currency = event.target.value as ShopSettings['currency'];
                      patch({ currency, currencySymbol: currency === 'USD' ? '$' : 'Sh' });
                    }}
                  >
                    <option value="USD">US Dollar (USD)</option>
                    <option value="SOS">Somali Shilling (SOS)</option>
                  </Select>
                </Field>
                <Field label="Currency symbol">
                  <Input value={draft.currencySymbol} onChange={(event) => patch({ currencySymbol: event.target.value })} />
                </Field>
                <Field label="Exchange rate" hint="Base currency units per USD">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.exchangeRate}
                    onChange={(event) => patch({ exchangeRate: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Delivery fee">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.deliveryFee}
                    onChange={(event) => patch({ deliveryFee: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Free delivery threshold" hint="Set to 0 to disable free delivery">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.freeDeliveryThreshold}
                    onChange={(event) => patch({ freeDeliveryThreshold: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Tax rate (%)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={draft.taxRate}
                    onChange={(event) => patch({ taxRate: Number(event.target.value) })}
                  />
                </Field>
                <div className="space-y-3 pt-6">
                  <Toggle
                    label="Enable tax"
                    description="Apply the tax rate to taxable sales."
                    checked={draft.taxEnabled}
                    onChange={(checked) => patch({ taxEnabled: checked })}
                  />
                  <Toggle
                    label="Guest checkout"
                    description="Allow customers to order without an account."
                    checked={draft.guestCheckout}
                    onChange={(checked) => patch({ guestCheckout: checked })}
                  />
                  <Toggle
                    label="Allow negative stock"
                    description="Permit selling beyond available stock. Not recommended."
                    checked={draft.allowNegativeStock ?? false}
                    onChange={(checked) => patch({ allowNegativeStock: checked })}
                  />
                  <Toggle
                    label="Low stock alerts"
                    description="Notify staff when products fall below their reorder level."
                    checked={draft.lowStockAlerts ?? true}
                    onChange={(checked) => patch({ lowStockAlerts: checked })}
                  />
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <Mail className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Documents &amp; social</h3>
                  <p className="text-xs text-ink-400">Invoice and receipt prefixes, footers and social profiles.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Invoice prefix">
                  <Input
                    value={draft.invoice?.prefix ?? 'INV'}
                    onChange={(event) =>
                      patch({ invoice: { ...(draft.invoice ?? { prefix: 'INV', footer: '', showLogo: true }), prefix: event.target.value } })
                    }
                  />
                </Field>
                <Field label="Receipt prefix">
                  <Input
                    value={draft.receipt?.prefix ?? 'RCT'}
                    onChange={(event) =>
                      patch({ receipt: { ...(draft.receipt ?? { prefix: 'RCT', footer: '' }), prefix: event.target.value } })
                    }
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Invoice footer">
                  <Textarea
                    rows={2}
                    value={draft.invoice?.footer ?? ''}
                    onChange={(event) =>
                      patch({ invoice: { ...(draft.invoice ?? { prefix: 'INV', footer: '', showLogo: true }), footer: event.target.value } })
                    }
                  />
                </Field>
                <Field label="Receipt footer">
                  <Textarea
                    rows={2}
                    value={draft.receipt?.footer ?? ''}
                    onChange={(event) =>
                      patch({ receipt: { ...(draft.receipt ?? { prefix: 'RCT', footer: '' }), footer: event.target.value } })
                    }
                  />
                </Field>
              </div>
              <div className="mt-3">
                <Checkbox
                  label="Show logo on invoices"
                  checked={draft.invoice?.showLogo ?? true}
                  onChange={(checked) =>
                    patch({ invoice: { ...(draft.invoice ?? { prefix: 'INV', footer: '', showLogo: true }), showLogo: checked } })
                  }
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Facebook">
                  <Input
                    value={draft.social?.facebook ?? ''}
                    onChange={(event) => patch({ social: { ...(draft.social ?? {}), facebook: event.target.value } })}
                  />
                </Field>
                <Field label="Instagram">
                  <Input
                    value={draft.social?.instagram ?? ''}
                    onChange={(event) => patch({ social: { ...(draft.social ?? {}), instagram: event.target.value } })}
                  />
                </Field>
                <Field label="WhatsApp">
                  <Input
                    value={draft.social?.whatsapp ?? ''}
                    onChange={(event) => patch({ social: { ...(draft.social ?? {}), whatsapp: event.target.value } })}
                  />
                </Field>
                <Field label="TikTok">
                  <Input
                    value={draft.social?.tiktok ?? ''}
                    onChange={(event) => patch({ social: { ...(draft.social ?? {}), tiktok: event.target.value } })}
                  />
                </Field>
              </div>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-900">
              <p className="text-xs text-ink-400">Changes apply to the storefront immediately after saving.</p>
              <Button
                variant="secondary"
                icon={<Save className="h-4 w-4" />}
                loading={saving === 'general'}
                disabled={!canSettings}
                onClick={() => void save('general')}
              >
                Save settings
              </Button>
            </div>
          </div>
        )
      )}

      {tab === 'payments' && (
        settingsLoading ? (
          <Card className="p-4">
            <TableSkeleton rows={8} />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <Banknote className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Payment methods</h3>
                  <p className="text-xs text-ink-400">
                    Mobile money is never auto-verified. Payments stay pending until a staff member confirms them.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {draft.paymentMethods.map((method, index) => (
                  <div key={method.key} className="rounded-xl border border-line p-4 dark:border-ink-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={method.enabled ? 'emerald' : 'slate'}>{method.enabled ? 'Enabled' : 'Disabled'}</Badge>
                        <Badge tone="gold">{method.type.replace(/_/g, ' ')}</Badge>
                        {method.manualVerification && <Badge tone="amber">Manual verification</Badge>}
                        <span className="text-xs text-ink-400">{method.key}</span>
                      </div>
                      <Toggle
                        checked={method.enabled}
                        onChange={(checked) => updatePayment(index, { enabled: checked })}
                      />
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Label">
                        <Input value={method.label} onChange={(event) => updatePayment(index, { label: event.target.value })} />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={method.type}
                          onChange={(event) =>
                            updatePayment(index, { type: event.target.value as typeof method.type })
                          }
                        >
                          <option value="cash">Cash</option>
                          <option value="mobile_money">Mobile money</option>
                          <option value="bank">Bank</option>
                          <option value="card">Card</option>
                          <option value="other">Other</option>
                        </Select>
                      </Field>
                    </div>
                    <Field label="Customer instructions" className="mt-3">
                      <Textarea
                        rows={2}
                        value={method.instructions ?? ''}
                        onChange={(event) => updatePayment(index, { instructions: event.target.value })}
                      />
                    </Field>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Checkbox
                        label="Require a transaction reference"
                        checked={method.requiresReference}
                        onChange={(checked) => updatePayment(index, { requiresReference: checked })}
                      />
                      <Checkbox
                        label="Manual verification"
                        description="Keep payments pending until staff confirm them."
                        checked={method.manualVerification}
                        onChange={(checked) => updatePayment(index, { manualVerification: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="secondary"
                  icon={<Save className="h-4 w-4" />}
                  loading={saving === 'payments'}
                  disabled={!canSettings}
                  onClick={() => void save('payments')}
                >
                  Save payment methods
                </Button>
              </div>
            </Card>
          </div>
        )
      )}

      {tab === 'loyalty' && (
        settingsLoading ? (
          <Card className="p-4">
            <TableSkeleton rows={4} />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <Heart className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Loyalty programme</h3>
                  <p className="text-xs text-ink-400">Reward repeat customers with points on completed purchases.</p>
                </div>
              </div>
              <div className="space-y-4">
                <Toggle
                  label="Enable loyalty points"
                  description="Customers earn and redeem points across the shop and storefront."
                  checked={draft.loyalty.enabled}
                  onChange={(checked) => patch({ loyalty: { ...draft.loyalty, enabled: checked } })}
                />
                <Field label="Points per currency unit" hint="For example, 1 point per $1 spent.">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={draft.loyalty.pointsPerCurrencyUnit}
                    onChange={(event) =>
                      patch({ loyalty: { ...draft.loyalty, pointsPerCurrencyUnit: Number(event.target.value) } })
                    }
                  />
                </Field>
                <Field label="Redemption value per point" hint="Currency value of one point when redeemed.">
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={draft.loyalty.redeemValue}
                    onChange={(event) =>
                      patch({ loyalty: { ...draft.loyalty, redeemValue: Number(event.target.value) } })
                    }
                  />
                </Field>
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    icon={<Save className="h-4 w-4" />}
                    loading={saving === 'loyalty'}
                    disabled={!canSettings}
                    onClick={() => void save('loyalty')}
                  >
                    Save loyalty
                  </Button>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-display text-lg font-semibold">How points work</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-500 dark:text-ink-300">
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Points are awarded only when revenue is recognised, so cancelled orders never earn points.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Customers can choose to redeem points at checkout or in the shop.
                </li>
                <li className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  Every points change is recorded in the customer&apos;s loyalty history.
                </li>
              </ul>
            </Card>
          </div>
        )
      )}

      {tab === 'homepage' && (
        settingsLoading ? (
          <Card className="p-4">
            <TableSkeleton rows={8} />
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                  <LayoutTemplate className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="font-display text-lg font-semibold">Hero</h3>
                  <p className="text-xs text-ink-400">The first thing customers see on the home page.</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Eyebrow">
                  <Input value={homepage.hero.eyebrow} onChange={(event) => patchHomepage({ hero: { ...homepage.hero, eyebrow: event.target.value } })} />
                </Field>
                <Field label="Title">
                  <Input value={homepage.hero.title} onChange={(event) => patchHomepage({ hero: { ...homepage.hero, title: event.target.value } })} />
                </Field>
              </div>
              <Field label="Subtitle" className="mt-4">
                <Textarea
                  rows={2}
                  value={homepage.hero.subtitle}
                  onChange={(event) => patchHomepage({ hero: { ...homepage.hero, subtitle: event.target.value } })}
                />
              </Field>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Primary button label">
                  <Input value={homepage.hero.ctaLabel} onChange={(event) => patchHomepage({ hero: { ...homepage.hero, ctaLabel: event.target.value } })} />
                </Field>
                <Field label="Primary button link">
                  <Input value={homepage.hero.ctaLink} onChange={(event) => patchHomepage({ hero: { ...homepage.hero, ctaLink: event.target.value } })} />
                </Field>
                <Field label="Secondary button label">
                  <Input
                    value={homepage.hero.secondaryLabel ?? ''}
                    onChange={(event) => patchHomepage({ hero: { ...homepage.hero, secondaryLabel: event.target.value } })}
                  />
                </Field>
                <Field label="Secondary button link">
                  <Input
                    value={homepage.hero.secondaryLink ?? ''}
                    onChange={(event) => patchHomepage({ hero: { ...homepage.hero, secondaryLink: event.target.value } })}
                  />
                </Field>
              </div>
              <div className="mt-4 max-w-xs">
                <ImageUpload
                  label="Hero image"
                  value={homepage.hero.image}
                  onChange={(url) => patchHomepage({ hero: { ...homepage.hero, image: url } })}
                />
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg font-semibold">Promo banners</h3>
                  <p className="text-xs text-ink-400">Optional promotional blocks shown on the home page.</p>
                </div>
                <Button variant="outline" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addBanner}>
                  Add banner
                </Button>
              </div>
              {homepage.promoBanners.length === 0 ? (
                <EmptyState
                  icon={<ImageIcon className="h-6 w-6" />}
                  title="No promo banners"
                  description="Add a banner to highlight an offer, season or new collection."
                  action={
                    <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={addBanner}>
                      Add banner
                    </Button>
                  }
                />
              ) : (
                <div className="space-y-3">
                  {homepage.promoBanners.map((banner, index) => (
                    <div key={index} className="rounded-xl border border-line p-4 dark:border-ink-800">
                      <div className="mb-3 flex items-center justify-between">
                        <Badge tone={banner.active ? 'emerald' : 'slate'}>{banner.active ? 'Active' : 'Hidden'}</Badge>
                        <div className="flex items-center gap-2">
                          <Toggle checked={banner.active} onChange={(checked) => updateBanner(index, { active: checked })} />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Remove banner"
                            onClick={() => removeBanner(index)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Title">
                          <Input value={banner.title} onChange={(event) => updateBanner(index, { title: event.target.value })} />
                        </Field>
                        <Field label="Subtitle">
                          <Input value={banner.subtitle} onChange={(event) => updateBanner(index, { subtitle: event.target.value })} />
                        </Field>
                        <Field label="Link">
                          <Input value={banner.link} onChange={(event) => updateBanner(index, { link: event.target.value })} />
                        </Field>
                        <Field label="Button label">
                          <Input value={banner.cta} onChange={(event) => updateBanner(index, { cta: event.target.value })} />
                        </Field>
                      </div>
                      <div className="mt-3 max-w-xs">
                        <ImageUpload
                          label="Banner image"
                          value={banner.image}
                          onChange={(url) => updateBanner(index, { image: url })}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="mb-1 font-display text-lg font-semibold">Homepage sections</h3>
              <p className="mb-4 text-xs text-ink-400">Toggle which blocks appear on the storefront home page.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.entries(SECTION_LABELS).map(([key, meta]) => (
                  <Toggle
                    key={key}
                    label={meta.label}
                    description={meta.description}
                    checked={homepage.sections[key] ?? true}
                    onChange={(checked) => patchHomepage({ sections: { ...homepage.sections, [key]: checked } })}
                  />
                ))}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button
                variant="secondary"
                icon={<Save className="h-4 w-4" />}
                loading={saving === 'homepage'}
                disabled={!canSettings}
                onClick={() => void save('homepage')}
              >
                Save homepage
              </Button>
            </div>
          </div>
        )
      )}

      {tab === 'content' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-semibold">Content pages</h3>
              <p className="text-xs text-ink-400">About, contact, FAQ, privacy, terms and returns content.</p>
            </div>
            {canContent && (
              <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreatePage}>
                New page
              </Button>
            )}
          </div>

          {contentQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(contentQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void contentQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : contentQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : contentPages.length === 0 ? (
            <Card>
              <EmptyState
                icon={<BookOpen className="h-6 w-6" />}
                title="No content pages"
                description="Create the pages customers see in the footer and help menu."
              />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {contentPages.map((page) => (
                <Card key={page._id} className="flex flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="truncate font-display text-base font-semibold">{page.title}</h4>
                      <p className="text-[11px] text-ink-400">/{page.slug}</p>
                    </div>
                    <Badge tone={page.isPublished ? 'emerald' : 'amber'}>
                      {page.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-500 dark:text-ink-300">
                    {page.subtitle || page.body || 'No content yet.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Badge tone="slate">{page.sections?.length ?? 0} sections</Badge>
                    <Badge tone="slate">Updated {formatDate(page.updatedAt)}</Badge>
                  </div>
                  <div className="mt-4 flex justify-end gap-1 border-t border-line pt-3 dark:border-ink-800">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<ExternalLink className="h-3.5 w-3.5" />}
                      onClick={() => window.open(`/${page.slug}`, '_blank', 'noopener')}
                    >
                      View
                    </Button>
                    {canContent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Settings2 className="h-3.5 w-3.5" />}
                        onClick={() => openEditPage(page)}
                      >
                        Edit
                      </Button>
                    )}
                    {canContent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 className="h-3.5 w-3.5 text-rose-500" />}
                        onClick={() => setDeletingPage(page)}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Messages" value={messages.length} hint="Most recent 100" icon={<Inbox className="h-4 w-4" />} />
            <StatCard label="New" value={newMessageCount} hint="Awaiting a reply" icon={<MessageSquare className="h-4 w-4" />} tone="gold" />
            <StatCard label="Resolved" value={messages.filter((message) => message.status === 'resolved').length} hint="Closed conversations" icon={<BadgeCheck className="h-4 w-4" />} tone="emerald" />
          </div>

          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={messageSearch}
                onChange={setMessageSearch}
                placeholder="Search name, email or subject"
                className="w-full sm:w-72"
              />
              <Select
                value={messageStatus}
                onChange={(event) => setMessageStatus(event.target.value)}
                className="w-auto"
              >
                <option value="">Any status</option>
                <option value="new">New</option>
                <option value="read">Read</option>
                <option value="resolved">Resolved</option>
              </Select>
              {messageSearch && (
                <Button variant="ghost" size="sm" onClick={() => setMessageSearch('')}>
                  Clear
                </Button>
              )}
            </div>
          </Card>

          {messagesQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(messagesQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void messagesQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : messagesQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : filteredMessages.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox className="h-6 w-6" />}
                title="No messages"
                description="Messages sent from the contact page will appear here."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">From</th>
                      <th className="px-4 py-2.5">Subject</th>
                      <th className="px-4 py-2.5">Received</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {filteredMessages.map((message) => (
                      <tr
                        key={message._id}
                        className="cursor-pointer hover:bg-ink-50/50 dark:hover:bg-ink-800/40"
                        onClick={() => {
                          setMessageDetail(message);
                          if (message.status === 'new') void markMessage(message, 'read');
                        }}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink-900 dark:text-white">{message.name}</p>
                          <p className="text-xs text-ink-400">{message.email}</p>
                        </td>
                        <td className="max-w-[280px] px-4 py-3">
                          <p className="truncate font-medium">{message.subject}</p>
                          <p className="truncate text-xs text-ink-400">{message.message}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(message.createdAt, true)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={message.status === 'new' ? 'gold' : message.status === 'resolved' ? 'emerald' : 'slate'}>
                            {message.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                            <Button variant="ghost" size="icon" aria-label="Open message" onClick={() => setMessageDetail(message)}>
                              <MailOpen className="h-4 w-4" />
                            </Button>
                            {message.status !== 'resolved' && (
                              <Button variant="ghost" size="sm" onClick={() => void markMessage(message, 'resolved')}>
                                Resolve
                              </Button>
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
        </div>
      )}

      {tab === 'newsletter' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Subscribers" value={subscribers.length} hint="All captured emails" icon={<Users className="h-4 w-4" />} />
            <StatCard label="Subscribed" value={subscribedCount} hint="Receiving campaigns" icon={<Mail className="h-4 w-4" />} tone="emerald" />
            <StatCard label="Unsubscribed" value={subscribers.length - subscribedCount} hint="Opted out" icon={<MailOpen className="h-4 w-4" />} tone="rose" />
          </div>

          {newsletterQuery.isError ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-rose-600">{apiErrorMessage(newsletterQuery.error)}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void newsletterQuery.refetch()}>
                Retry
              </Button>
            </Card>
          ) : newsletterQuery.isLoading ? (
            <Card className="p-4">
              <TableSkeleton rows={6} />
            </Card>
          ) : subscribers.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Mail className="h-6 w-6" />}
                title="No subscribers"
                description="Newsletter signups from the storefront will appear here."
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-line bg-ink-50/60 text-[11px] uppercase tracking-wider text-ink-400 dark:border-ink-800 dark:bg-ink-900/40">
                    <tr>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Source</th>
                      <th className="px-4 py-2.5">Subscribed</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line dark:divide-ink-800">
                    {subscribers.map((subscriber) => (
                      <tr key={subscriber._id} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/40">
                        <td className="px-4 py-3 font-medium">{subscriber.email}</td>
                        <td className="px-4 py-3 capitalize text-ink-500 dark:text-ink-300">{titleCase(subscriber.source)}</td>
                        <td className="px-4 py-3 text-xs text-ink-500 dark:text-ink-300">{formatDate(subscriber.createdAt)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={subscriber.status === 'subscribed' ? 'emerald' : 'slate'}>{subscriber.status}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${subscriber.email}`}
                              onClick={() => setDeletingSubscriber(subscriber)}
                            >
                              <Trash2 className="h-4 w-4 text-rose-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Content page editor */}
      <Modal
        open={Boolean(pageForm)}
        onClose={() => {
          if (!pageSaving) setPageForm(null);
        }}
        title={editingSlug ? 'Edit content page' : 'New content page'}
        description="Content is rendered on the storefront at /slug."
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setPageForm(null)} disabled={pageSaving}>
              Cancel
            </Button>
            <Button onClick={() => void savePage()} loading={pageSaving}>
              Save page
            </Button>
          </>
        }
      >
        {pageForm && (
          <div className="space-y-4">
            {pageError && <Alert tone="danger">{pageError}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug" required hint="Lowercase letters, numbers and hyphens.">
                <Input
                  value={pageForm.slug}
                  disabled={Boolean(editingSlug)}
                  onChange={(event) => setPageForm((current) => (current ? { ...current, slug: event.target.value } : current))}
                  placeholder="about"
                />
              </Field>
              <Field label="Title" required>
                <Input
                  value={pageForm.title}
                  onChange={(event) => setPageForm((current) => (current ? { ...current, title: event.target.value } : current))}
                />
              </Field>
            </div>
            <Field label="Subtitle">
              <Input
                value={pageForm.subtitle}
                onChange={(event) => setPageForm((current) => (current ? { ...current, subtitle: event.target.value } : current))}
              />
            </Field>
            <Field label="Body">
              <Textarea
                rows={5}
                value={pageForm.body}
                onChange={(event) => setPageForm((current) => (current ? { ...current, body: event.target.value } : current))}
              />
            </Field>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-medium text-ink-700 dark:text-ink-200">Sections</p>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() =>
                    setPageForm((current) =>
                      current ? { ...current, sections: [...current.sections, { heading: '', body: '' }] } : current
                    )
                  }
                >
                  Add section
                </Button>
              </div>
              <div className="space-y-3">
                {pageForm.sections.map((section, index) => (
                  <div key={index} className="rounded-lg border border-line p-3 dark:border-ink-800">
                    <div className="mb-2 flex items-center gap-2">
                      <Input
                        value={section.heading}
                        placeholder="Section heading"
                        onChange={(event) =>
                          setPageForm((current) =>
                            current
                              ? {
                                  ...current,
                                  sections: current.sections.map((item, itemIndex) =>
                                    itemIndex === index ? { ...item, heading: event.target.value } : item
                                  ),
                                }
                              : current
                          )
                        }
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove section"
                        onClick={() =>
                          setPageForm((current) =>
                            current
                              ? { ...current, sections: current.sections.filter((_, itemIndex) => itemIndex !== index) }
                              : current
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                    <Textarea
                      rows={3}
                      value={section.body}
                      placeholder="Section body"
                      onChange={(event) =>
                        setPageForm((current) =>
                          current
                            ? {
                                ...current,
                                sections: current.sections.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, body: event.target.value } : item
                                ),
                              }
                            : current
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <Checkbox
              label="Published"
              description="Unpublished pages are hidden from the storefront."
              checked={pageForm.isPublished}
              onChange={(checked) => setPageForm((current) => (current ? { ...current, isPublished: checked } : current))}
            />
          </div>
        )}
      </Modal>

      {/* Message detail */}
      <Modal
        open={Boolean(messageDetail)}
        onClose={() => setMessageDetail(null)}
        title={messageDetail?.subject ?? 'Message'}
        description={messageDetail ? `${messageDetail.name} · ${messageDetail.email}` : undefined}
        size="lg"
        footer={
          <>
            {messageDetail && messageDetail.status !== 'resolved' && (
              <Button
                variant="secondary"
                icon={<BadgeCheck className="h-4 w-4" />}
                onClick={() => void markMessage(messageDetail, 'resolved')}
              >
                Mark resolved
              </Button>
            )}
            <Button variant="outline" onClick={() => setMessageDetail(null)}>
              Close
            </Button>
          </>
        }
      >
        {messageDetail && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={messageDetail.status === 'new' ? 'gold' : messageDetail.status === 'resolved' ? 'emerald' : 'slate'}>
                {messageDetail.status}
              </Badge>
              <Badge tone="slate">{formatDate(messageDetail.createdAt, true)}</Badge>
              {messageDetail.phone && <Badge tone="slate">{messageDetail.phone}</Badge>}
            </div>
            <p className="whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-sm text-ink-700 dark:bg-ink-900 dark:text-ink-200">
              {messageDetail.message}
            </p>
            <Button
              variant="outline"
              icon={<Mail className="h-4 w-4" />}
              onClick={() => window.open(`mailto:${messageDetail.email}?subject=Re: ${encodeURIComponent(messageDetail.subject)}`, '_blank', 'noopener')}
            >
              Reply by email
            </Button>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingPage)}
        onClose={() => setDeletingPage(null)}
        onConfirm={() => void removePage()}
        title="Delete content page"
        description={`Delete the /${deletingPage?.slug ?? ''} page? This removes it from the storefront immediately.`}
        confirmLabel="Delete page"
        danger
        loading={deleteLoading}
      />

      <ConfirmDialog
        open={Boolean(deletingSubscriber)}
        onClose={() => setDeletingSubscriber(null)}
        onConfirm={() => void removeSubscriber()}
        title="Remove subscriber"
        description={`Remove ${deletingSubscriber?.email ?? 'this subscriber'} from the newsletter list?`}
        confirmLabel="Remove"
        danger
        loading={subscriberLoading}
      />
    </div>
  );
}
