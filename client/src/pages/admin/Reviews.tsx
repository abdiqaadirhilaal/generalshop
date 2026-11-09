import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MessageSquare, Star, Trash2, X } from 'lucide-react';
import { api, apiErrorMessage, queryString } from '@/lib/api';
import { useAuth, useToast } from '@/context/AppProviders';
import { AdminPageHeader } from '@/components/AdminLayout';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Pagination,
  PageLoader,
  Tabs,
} from '@/components/ui';
import { formatDate, statusTone } from '@/lib/format';
import type { Page, Review } from '@/types';

function productOf(review: Review) {
  return typeof review.product === 'string' ? null : review.product;
}

export default function Reviews() {
  const { has } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const canWrite = has('products:write');

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Review | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const params = { page, limit: 12, status: status || undefined };

  const { data, isLoading, isError, error: queryError, refetch } = useQuery({
    queryKey: ['admin-reviews', params],
    queryFn: () => api.page<Review>(`/admin/catalog/reviews${queryString(params)}`),
  });

  const reviews = data?.items ?? [];
  const meta = data?.meta;

  const moderate = async (review: Review, next: 'approved' | 'rejected' | 'pending') => {
    setWorkingId(review._id);
    try {
      await api.patch(`/admin/catalog/reviews/${review._id}`, { status: next });
      success(next === 'approved' ? 'Review approved and published.' : next === 'rejected' ? 'Review rejected.' : 'Review moved back to pending.');
      void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (moderateError) {
      error(moderateError);
    } finally {
      setWorkingId(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/admin/catalog/reviews/${deleting._id}`);
      success('Review deleted.');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-products'] });
    } catch (deleteError) {
      error(deleteError);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="Catalog"
        title="Reviews"
        description="Moderate customer feedback. Only approved reviews appear on the storefront and affect product ratings."
      />

      <Tabs
        tabs={[
          { value: '', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ]}
        value={status}
        onChange={(value) => { setStatus(value); setPage(1); }}
        className="mb-4 max-w-md"
      />

      {isError ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-rose-600">{apiErrorMessage(queryError)}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </Card>
      ) : isLoading ? (
        <PageLoader />
      ) : reviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" />}
            title={status ? `No ${status} reviews` : 'No reviews yet'}
            description="Customer reviews will appear here for moderation."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {reviews.map((review) => {
              const product = productOf(review);
              return (
                <Card key={review._id} className="flex flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={statusTone(review.status) as 'emerald' | 'amber' | 'rose' | 'slate'}>{review.status}</Badge>
                        {review.verifiedPurchase && <Badge tone="blue">Verified purchase</Badge>}
                      </div>
                      <p className="mt-2 font-medium text-ink-900 dark:text-white">{review.authorName}</p>
                      <p className="text-xs text-ink-400">
                        {formatDate(review.createdAt, true)}
                        {product ? (
                          <>
                            {' · '}
                            <Link to={`/product/${product.slug}`} className="hover:text-gold-700 hover:underline">{product.name}</Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={
                            index < review.rating
                              ? 'h-3.5 w-3.5 fill-gold text-gold'
                              : 'h-3.5 w-3.5 text-ink-200 dark:text-ink-700'
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {review.title && <p className="mt-3 text-sm font-medium text-ink-800 dark:text-ink-100">{review.title}</p>}
                  <p className="mt-1 flex-1 text-sm leading-6 text-ink-500 dark:text-ink-300">{review.comment}</p>

                  {canWrite && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3 dark:border-ink-800">
                      {review.status !== 'approved' && (
                        <Button size="sm" variant="outline" icon={<Check className="h-3.5 w-3.5" />} loading={workingId === review._id} onClick={() => void moderate(review, 'approved')}>
                          Approve
                        </Button>
                      )}
                      {review.status !== 'rejected' && (
                        <Button size="sm" variant="outline" icon={<X className="h-3.5 w-3.5" />} loading={workingId === review._id} onClick={() => void moderate(review, 'rejected')}>
                          Reject
                        </Button>
                      )}
                      {review.status !== 'pending' && (
                        <Button size="sm" variant="ghost" onClick={() => void moderate(review, 'pending')} loading={workingId === review._id}>
                          Mark pending
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="ml-auto text-rose-600" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(review)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          <Pagination page={meta?.page ?? 1} totalPages={meta?.totalPages ?? 1} total={meta?.total} onChange={setPage} />
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => void remove()}
        title="Delete review"
        description={`Delete the review by ${deleting?.authorName ?? 'this customer'}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}
