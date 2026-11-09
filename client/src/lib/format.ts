import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(value: number | null | undefined, symbol = '$', currency?: string) {
  const amount = Number(value ?? 0);
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol}${formatted}${currency && currency !== 'USD' ? ` ${currency}` : ''}`;
}

export function formatNumber(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString('en-US');
}

export function formatDate(value?: string | Date | null, withTime = false) {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function timeAgo(value?: string | Date | null) {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

export function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready_for_delivery: 'Ready for delivery',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  partial: 'Partially paid',
  paid: 'Paid',
  refunded: 'Refunded',
  pending: 'Pending verification',
  confirmed: 'Confirmed',
  failed: 'Failed',
};

export function statusTone(status: string): string {
  switch (status) {
    case 'delivered':
    case 'paid':
    case 'approved':
    case 'received':
    case 'confirmed':
    case 'active':
    case 'completed':
      return 'emerald';
    case 'pending':
    case 'partial':
    case 'processing':
    case 'ready_for_delivery':
    case 'ordered':
    case 'draft':
      return 'amber';
    case 'shipped':
      return 'blue';
    case 'cancelled':
    case 'rejected':
    case 'failed':
    case 'blocked':
    case 'voided':
      return 'rose';
    case 'returned':
    case 'refunded':
    case 'inactive':
      return 'slate';
    default:
      return 'slate';
  }
}

export function initials(name?: string) {
  if (!name) return 'H';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function slugPreview(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
