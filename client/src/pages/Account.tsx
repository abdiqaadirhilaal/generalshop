import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Heart,
  Home,
  MapPin,
  Package,
  Plus,
  ReceiptText,
  ShieldCheck,
  Star,
  UserRound,
} from 'lucide-react';
import { api, apiErrorMessage, downloadFile } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
import { useDocumentTitle, useMoney } from '@/lib/hooks';
import { Breadcrumbs, ProductCard, RatingStars } from '@/components/Storefront';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Pagination,
  PageLoader,
  Tabs,
} from '@/components/ui';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDate, statusTone } from '@/lib/format';
import type { CustomerAddress, LoyaltyTransaction, Order, Page, Product, Review } from '@/types';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'orders', label: 'Orders' },
  { value: 'addresses', label: 'Addresses' },
  { value: 'loyalty', label: 'Loyalty' },
  { value: 'wishlist', label: 'Wishlist' },
  { value: 'reviews', label: 'My reviews' },
  { value: 'profile', label: 'Profile' },
];

const emptyAddress = { label: 'Home', fullName: '', phone: '', address: '', city: '', isDefault: false };

export default function AccountPage() {
  useDocumentTitle('My account');
  const { user, updateProfile, logout } = useAuth();
  const { format } = useMoney();
  const { success, error: toastError } = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'overview';

  const [orderPage, setOrderPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [addressModal, setAddressModal] = useState(false);
  const [addressForm, setAddressForm] = useState({ ...emptyAddress });
  const [editingAddress, setEditingAddress] = useState<string | null>(null);
  const [deleteAddress, setDeleteAddress] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: user?.name ?? '', phone: user?.phone ?? '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const setTab = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', value);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    setProfileForm({ name: user?.name ?? '', phone: user?.phone ?? '' });
  }, [user]);

  const orders = useQuery({
    queryKey: ['account-orders', orderPage],
    queryFn: () => api.page<Order>(`/account/orders?page=${orderPage}&limit=8`),
    enabled: tab === 'orders' || tab === 'overview',
  });
  const orderDetail = useQuery({
    queryKey: ['account-order', selectedOrder],
    queryFn: () => api.get<Order>(`/account/orders/${selectedOrder}`),
    enabled: Boolean(selectedOrder),
  });
  const addresses = useQuery({
    queryKey: ['account-addresses'],
    queryFn: () => api.get<CustomerAddress[]>('/account/addresses'),
    enabled: tab === 'addresses',
  });
  const loyalty = useQuery({
    queryKey: ['account-loyalty'],
    queryFn: () => api.get<{ points: number; value: number; enabled: boolean; transactions: LoyaltyTransaction[] }>('/account/loyalty'),
    enabled: tab === 'loyalty' || tab === 'overview',
  });
  const wishlist = useQuery({
    queryKey: ['account-wishlist'],
    queryFn: () => api.get<Product[]>('/account/wishlist'),
    enabled: tab === 'wishlist',
  });
  const reviews = useQuery({
    queryKey: ['account-reviews'],
    queryFn: () => api.get<Review[]>('/account/reviews'),
    enabled: tab === 'reviews',
  });

  const refreshAddresses = () => queryClient.invalidateQueries({ queryKey: ['account-addresses'] });

  const openAddress = (address?: CustomerAddress) => {
    if (address) {
      setEditingAddress(address._id ?? null);
      setAddressForm({
        label: address.label,
        fullName: address.fullName,
        phone: address.phone,
        address: address.address,
        city: address.city,
        isDefault: address.isDefault,
      });
    } else {
      setEditingAddress(null);
      setAddressForm({ ...emptyAddress, fullName: user?.name ?? '', phone: user?.phone ?? '' });
    }
    setAddressModal(true);
  };

  const saveAddress = async () => {
    setSaving(true);
    try {
      if (editingAddress) {
        await api.patch(`/account/addresses/${editingAddress}`, addressForm);
      } else {
        await api.post('/account/addresses', addressForm);
      }
      success(editingAddress ? 'Address updated' : 'Address added');
      setAddressModal(false);
      await refreshAddresses();
    } catch (saveError) {
      toastError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const removeAddress = async () => {
    if (!deleteAddress) return;
    setSaving(true);
    try {
      await api.delete(`/account/addresses/${deleteAddress}`);
      success('Address removed');
      setDeleteAddress(null);
      await refreshAddresses();
    } catch (deleteError) {
      toastError(deleteError);
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await updateProfile(profileForm);
      success('Profile updated');
    } catch (saveError) {
      toastError(saveError);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirm) {
      toastError(new Error('New passwords do not match'));
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      success('Password changed');
      setPasswordForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (passwordError) {
      toastError(passwordError);
    } finally {
      setSaving(false);
    }
  };

  const invoice = async (order: Order) => {
    try {
      await downloadFile(`/account/orders/${order._id}/invoice`, `invoice-${order.orderNumber}.pdf`);
    } catch (downloadError) {
      toastError(downloadError);
    }
  };

  if (!user) return <PageLoader />;

  return (
    <div className="container-page py-8">
      <Breadcrumbs items={[{ label: 'My account' }]} />
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl font-semibold">Hello, {user.name.split(' ')[0]}.</h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">Manage your orders, addresses and preferences.</p>
        </div>
        <Button
          variant="outline"
          onClick={async () => {
            await logout();
          }}
        >
          Sign out
        </Button>
      </div>

      <div className="mt-6">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="surface p-5">
              <p className="text-xs uppercase tracking-wider text-ink-400">Orders placed</p>
              <p className="mt-2 font-display text-2xl font-semibold">{orders.data?.meta.total ?? '—'}</p>
              <button onClick={() => setTab('orders')} className="mt-2 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
                View orders
              </button>
            </div>
            <div className="surface p-5">
              <p className="text-xs uppercase tracking-wider text-ink-400">Loyalty points</p>
              <p className="mt-2 font-display text-2xl font-semibold">{loyalty.data?.points ?? '—'}</p>
              <button onClick={() => setTab('loyalty')} className="mt-2 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
                Worth {loyalty.data ? format(loyalty.data.value) : '—'}
              </button>
            </div>
            <div className="surface p-5">
              <p className="text-xs uppercase tracking-wider text-ink-400">Wishlist</p>
              <p className="mt-2 font-display text-2xl font-semibold">{user.wishlist?.length ?? 0}</p>
              <button onClick={() => setTab('wishlist')} className="mt-2 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
                View saved items
              </button>
            </div>
            <div className="surface p-5">
              <p className="text-xs uppercase tracking-wider text-ink-400">Account</p>
              <p className="mt-2 font-display text-2xl font-semibold capitalize">{user.status}</p>
              <button onClick={() => setTab('profile')} className="mt-2 text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
                Manage profile
              </button>
            </div>

            <div className="surface sm:col-span-2 lg:col-span-4">
              <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-ink-800">
                <h2 className="font-display text-lg font-semibold">Recent orders</h2>
                <button onClick={() => setTab('orders')} className="text-xs font-medium text-gold-700 hover:underline dark:text-gold-300">
                  All orders
                </button>
              </div>
              {orders.isLoading ? (
                <PageLoader />
              ) : orders.data?.items.length ? (
                <ul className="divide-y divide-line dark:divide-ink-800">
                  {orders.data.items.slice(0, 4).map((order) => (
                    <li key={order._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium">{order.orderNumber}</p>
                        <p className="text-xs text-ink-400">{formatDate(order.createdAt, true)}</p>
                      </div>
                      <Badge tone={(statusTone(order.status) as 'slate' | 'emerald' | 'amber' | 'rose' | 'blue')}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                      <p className="text-sm font-semibold">{format(order.total)}</p>
                      <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order._id)}>
                        Details
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon={<Package className="h-6 w-6" />}
                  title="No orders yet"
                  description="When you place an order it will appear here."
                  action={
                    <Link to="/products">
                      <Button>Start shopping</Button>
                    </Link>
                  }
                />
              )}
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="surface overflow-hidden">
            <div className="border-b border-line px-5 py-4 dark:border-ink-800">
              <h2 className="font-display text-lg font-semibold">Your orders</h2>
            </div>
            {orders.isLoading ? (
              <PageLoader />
            ) : orders.data?.items.length ? (
              <>
                <ul className="divide-y divide-line dark:divide-ink-800">
                  {orders.data.items.map((order) => (
                    <li key={order._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{order.orderNumber}</p>
                        <p className="text-xs text-ink-400">
                          {formatDate(order.createdAt)} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="slate">{ORDER_STATUS_LABELS[order.status]}</Badge>
                        <Badge tone={order.paymentStatus === 'paid' ? 'emerald' : 'amber'}>
                          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                        </Badge>
                        <span className="text-sm font-semibold">{format(order.total)}</span>
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrder(order._id)}>
                          View
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => invoice(order)} aria-label="Download invoice">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-4">
                  <Pagination
                    page={orders.data.meta.page}
                    totalPages={orders.data.meta.totalPages}
                    total={orders.data.meta.total}
                    onChange={setOrderPage}
                  />
                </div>
              </>
            ) : (
              <EmptyState
                icon={<Package className="h-6 w-6" />}
                title="No orders yet"
                description="Your order history will appear here after your first purchase."
                action={
                  <Link to="/products">
                    <Button>Browse products</Button>
                  </Link>
                }
              />
            )}
          </div>
        )}

        {tab === 'addresses' && (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Saved addresses</h2>
              <Button size="sm" onClick={() => openAddress()}>
                <Plus className="h-4 w-4" /> Add address
              </Button>
            </div>
            {addresses.isLoading ? (
              <PageLoader />
            ) : addresses.data?.length ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {addresses.data.map((address) => (
                  <div key={address._id} className="surface p-5">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <MapPin className="h-4 w-4 text-gold-600" /> {address.label}
                      </p>
                      {address.isDefault && <Badge tone="gold">Default</Badge>}
                    </div>
                    <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{address.fullName}</p>
                    <p className="text-sm text-ink-500 dark:text-ink-300">{address.address}</p>
                    <p className="text-sm text-ink-500 dark:text-ink-300">{address.city}</p>
                    <p className="mt-1 text-xs text-ink-400">{address.phone}</p>
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openAddress(address)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteAddress(address._id ?? null)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Home className="h-6 w-6" />}
                title="No saved addresses"
                description="Add an address to check out faster next time."
                action={<Button onClick={() => openAddress()}>Add your first address</Button>}
              />
            )}
          </div>
        )}

        {tab === 'loyalty' && (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="surface h-fit p-6 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
                <Star className="h-6 w-6" />
              </span>
              <p className="mt-4 font-display text-4xl font-semibold">{loyalty.data?.points ?? 0}</p>
              <p className="text-xs uppercase tracking-wider text-ink-400">points available</p>
              <p className="mt-3 text-sm text-ink-500 dark:text-ink-300">
                Worth {loyalty.data ? format(loyalty.data.value) : format(0)} at checkout
              </p>
              {loyalty.data && !loyalty.data.enabled && (
                <p className="mt-2 text-xs text-ink-400">Loyalty is currently disabled by the shop.</p>
              )}
            </div>
            <div className="surface overflow-hidden">
              <div className="border-b border-line px-5 py-4 dark:border-ink-800">
                <h2 className="font-display text-lg font-semibold">Points history</h2>
              </div>
              {loyalty.data?.transactions.length ? (
                <ul className="divide-y divide-line dark:divide-ink-800">
                  {loyalty.data.transactions.map((transaction) => (
                    <li key={transaction._id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div>
                        <p className="text-sm font-medium capitalize">{transaction.type}</p>
                        <p className="text-xs text-ink-400">
                          {transaction.note ?? '—'} · {formatDate(transaction.createdAt, true)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${transaction.points >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                          {transaction.points >= 0 ? '+' : ''}
                          {transaction.points}
                        </p>
                        <p className="text-[11px] text-ink-400">Balance {transaction.balanceAfter}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Star className="h-6 w-6" />} title="No points yet" description="Earn points with every completed order." />
              )}
            </div>
          </div>
        )}

        {tab === 'wishlist' && (
          <div>
            <h2 className="mb-4 font-display text-lg font-semibold">Saved products</h2>
            {wishlist.isLoading ? (
              <PageLoader />
            ) : wishlist.data?.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {wishlist.data.map((product) => (
                  <ProductCard key={product._id} product={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Heart className="h-6 w-6" />}
                title="Your wishlist is empty"
                description="Tap the heart on any product to save it for later."
                action={
                  <Link to="/products">
                    <Button>Discover products</Button>
                  </Link>
                }
              />
            )}
          </div>
        )}

        {tab === 'reviews' && (
          <div>
            <h2 className="mb-4 font-display text-lg font-semibold">Your reviews</h2>
            {reviews.isLoading ? (
              <PageLoader />
            ) : reviews.data?.length ? (
              <div className="space-y-3">
                {reviews.data.map((review) => (
                  <article key={review._id} className="surface p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={typeof review.product === 'object' && review.product ? `/products/${review.product.slug}` : '/products'}
                        className="text-sm font-semibold hover:text-gold-700 dark:hover:text-gold-300"
                      >
                        {typeof review.product === 'object' && review.product ? review.product.name : 'Product'}
                      </Link>
                      <Badge tone={review.status === 'approved' ? 'emerald' : review.status === 'rejected' ? 'rose' : 'amber'}>
                        {review.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <RatingStars rating={review.rating} />
                      <span className="text-[11px] text-ink-400">{formatDate(review.createdAt)}</span>
                    </div>
                    {review.title && <p className="mt-2 text-sm font-medium">{review.title}</p>}
                    <p className="mt-1 text-sm text-ink-500 dark:text-ink-300">{review.comment}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState icon={<Star className="h-6 w-6" />} title="No reviews yet" description="Reviews you write will appear here." />
            )}
          </div>
        )}

        {tab === 'profile' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface p-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <UserRound className="h-4 w-4 text-gold-600" /> Personal details
              </h2>
              <div className="mt-4 space-y-4">
                <Field label="Full name">
                  <Input value={profileForm.name} onChange={(event) => setProfileForm((value) => ({ ...value, name: event.target.value }))} />
                </Field>
                <Field label="Phone">
                  <Input value={profileForm.phone} onChange={(event) => setProfileForm((value) => ({ ...value, phone: event.target.value }))} />
                </Field>
                <Field label="Email" hint="Contact the shop to change your email">
                  <Input value={user.email} disabled />
                </Field>
                <Button loading={saving} onClick={saveProfile}>
                  Save changes
                </Button>
              </div>
            </div>
            <div className="surface p-6">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <ShieldCheck className="h-4 w-4 text-gold-600" /> Change password
              </h2>
              <div className="mt-4 space-y-4">
                <Field label="Current password" required>
                  <Input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => setPasswordForm((value) => ({ ...value, currentPassword: event.target.value }))}
                  />
                </Field>
                <Field label="New password" required hint="At least 8 characters with a letter and a number">
                  <Input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => setPasswordForm((value) => ({ ...value, newPassword: event.target.value }))}
                  />
                </Field>
                <Field label="Confirm new password" required>
                  <Input
                    type="password"
                    value={passwordForm.confirm}
                    onChange={(event) => setPasswordForm((value) => ({ ...value, confirm: event.target.value }))}
                  />
                </Field>
                <Button loading={saving} onClick={changePassword}>
                  Update password
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Order detail modal */}
      <Modal
        open={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={orderDetail.data ? `Order ${orderDetail.data.orderNumber}` : 'Order details'}
        size="lg"
        footer={
          orderDetail.data ? (
            <>
              <Button variant="outline" onClick={() => invoice(orderDetail.data!)}>
                <Download className="h-4 w-4" /> Invoice
              </Button>
              <Button onClick={() => setSelectedOrder(null)}>Close</Button>
            </>
          ) : null
        }
      >
        {orderDetail.isLoading ? (
          <PageLoader />
        ) : orderDetail.data ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="slate">{ORDER_STATUS_LABELS[orderDetail.data.status]}</Badge>
              <Badge tone={orderDetail.data.paymentStatus === 'paid' ? 'emerald' : 'amber'}>
                {PAYMENT_STATUS_LABELS[orderDetail.data.paymentStatus]}
              </Badge>
              <span className="text-xs text-ink-400">Placed {formatDate(orderDetail.data.createdAt, true)}</span>
            </div>
            <ul className="divide-y divide-line text-sm dark:divide-ink-800">
              {orderDetail.data.items.map((item, index) => (
                <li key={index} className="flex justify-between gap-3 py-2">
                  <span>
                    {item.name}
                    {item.variation ? ` · ${item.variation}` : ''} × {item.quantity}
                  </span>
                  <span className="font-medium">{format(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 rounded-xl bg-ink-50 p-4 text-sm dark:bg-ink-800">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{format(orderDetail.data.subtotal)}</dd>
              </div>
              {orderDetail.data.discountTotal > 0 && (
                <div className="flex justify-between">
                  <dt>Discount</dt>
                  <dd>-{format(orderDetail.data.discountTotal)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>{format(orderDetail.data.deliveryFee)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold dark:border-ink-700">
                <dt>Total</dt>
                <dd>{format(orderDetail.data.total)}</dd>
              </div>
            </dl>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Delivery address</p>
              <p className="text-sm">{orderDetail.data.shippingAddress.fullName}</p>
              <p className="text-sm text-ink-500 dark:text-ink-300">{orderDetail.data.shippingAddress.address}</p>
              <p className="text-sm text-ink-500 dark:text-ink-300">
                {orderDetail.data.shippingAddress.city} · {orderDetail.data.shippingAddress.phone}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Status history</p>
              <ul className="space-y-2">
                {orderDetail.data.statusHistory.map((event, index) => (
                  <li key={index} className="flex items-center justify-between text-sm">
                    <span>{ORDER_STATUS_LABELS[event.status]}</span>
                    <span className="text-xs text-ink-400">{formatDate(event.at, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Alert tone="danger">Could not load this order.</Alert>
        )}
      </Modal>

      {/* Address modal */}
      <Modal
        open={addressModal}
        onClose={() => setAddressModal(false)}
        title={editingAddress ? 'Edit address' : 'Add address'}
        footer={
          <>
            <Button variant="outline" onClick={() => setAddressModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button loading={saving} onClick={saveAddress}>
              Save address
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label">
            <Input value={addressForm.label} onChange={(event) => setAddressForm((value) => ({ ...value, label: event.target.value }))} />
          </Field>
          <Field label="Full name" required>
            <Input value={addressForm.fullName} onChange={(event) => setAddressForm((value) => ({ ...value, fullName: event.target.value }))} />
          </Field>
          <Field label="Phone" required>
            <Input value={addressForm.phone} onChange={(event) => setAddressForm((value) => ({ ...value, phone: event.target.value }))} />
          </Field>
          <Field label="City" required>
            <Input value={addressForm.city} onChange={(event) => setAddressForm((value) => ({ ...value, city: event.target.value }))} />
          </Field>
          <Field label="Address" required className="sm:col-span-2">
            <Input value={addressForm.address} onChange={(event) => setAddressForm((value) => ({ ...value, address: event.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={addressForm.isDefault}
              onChange={(event) => setAddressForm((value) => ({ ...value, isDefault: event.target.checked }))}
              className="h-4 w-4 accent-gold"
            />
            Set as default delivery address
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteAddress)}
        onClose={() => setDeleteAddress(null)}
        onConfirm={removeAddress}
        title="Remove address"
        description="Are you sure you want to remove this saved address?"
        confirmLabel="Remove"
        danger
        loading={saving}
      />
    </div>
  );
}
