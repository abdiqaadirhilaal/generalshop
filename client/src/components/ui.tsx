import {
  forwardRef,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { apiErrorMessage, uploadImage } from '@/lib/api';
import { cn } from '@/lib/format';

/* ───────────────────────────────── Button ─────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'gold' | 'subtle';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 dark:bg-gold dark:text-ink-950 dark:hover:bg-gold-400',
  secondary:
    'bg-gold text-ink-950 hover:bg-gold-400 active:bg-gold-600 dark:bg-gold-300 dark:hover:bg-gold-200',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-50 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-white',
  outline:
    'border border-line bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:border-ink-500 dark:hover:bg-ink-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800',
  gold: 'bg-gold-100 text-gold-800 hover:bg-gold-200 dark:bg-gold-900/40 dark:text-gold-200 dark:hover:bg-gold-900/60',
  subtle: 'bg-ink-50 text-ink-700 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-sm',
  icon: 'h-9 w-9 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

/* ───────────────────────────────── Fields ─────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      {label && (
        <span className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-ink-700 dark:text-ink-200">
          {label}
          {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600 dark:text-rose-400">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-400 dark:text-ink-400">{hint}</span>
      ) : null}
    </label>
  );
}

const fieldBase =
  'w-full rounded-lg border border-line bg-white px-3 text-sm text-ink-900 placeholder:text-ink-300 transition-colors focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-white dark:placeholder:text-ink-500 dark:focus:border-gold';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, 'h-10', className)} {...props} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-24 py-2.5', className)} {...props} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, 'h-10 pr-8', className)} {...props}>
        {children}
      </select>
    );
  }
);

export function Checkbox({
  label,
  checked,
  onChange,
  description,
  disabled,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5', disabled && 'cursor-not-allowed opacity-60')}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-line text-gold accent-gold focus:ring-gold/30"
      />
      <span>
        <span className="block text-sm text-ink-800 dark:text-ink-100">{label}</span>
        {description && <span className="block text-xs text-ink-400">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || description) && (
        <span>
          {label && <span className="block text-sm font-medium text-ink-800 dark:text-ink-100">{label}</span>}
          {description && <span className="block text-xs text-ink-400">{description}</span>}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-gold' : 'bg-ink-200 dark:bg-ink-700'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5.5' : 'translate-x-0.5'
          )}
          style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </button>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  onEnter?: () => void;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        placeholder={placeholder}
        className={cn(fieldBase, 'h-10 pl-9')}
        aria-label={placeholder}
      />
    </div>
  );
}

/* ───────────────────────────────── Badges ─────────────────────────────── */

type BadgeTone = 'slate' | 'emerald' | 'amber' | 'rose' | 'blue' | 'gold' | 'ink';

const badgeTones: Record<BadgeTone, string> = {
  slate: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  emerald: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
  amber: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800',
  rose: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800',
  gold: 'bg-gold-50 text-gold-700 ring-1 ring-gold-200 dark:bg-gold-900/30 dark:text-gold-200 dark:ring-gold-800',
  ink: 'bg-ink-900 text-white dark:bg-white dark:text-ink-900',
};

export function Badge({
  children,
  tone = 'slate',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
        badgeTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* ───────────────────────────────── Cards ──────────────────────────────── */

export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={cn('surface', className)}>{children}</Tag>;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h2 className="display text-2xl font-semibold sm:text-3xl">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-ink-500 dark:text-ink-300">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'gold' | 'emerald' | 'rose';
}) {
  return (
    <div className="surface relative overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-400">{label}</p>
        {icon && (
          <span
            className={cn(
              'grid h-9 w-9 place-items-center rounded-lg',
              tone === 'gold' && 'bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300',
              tone === 'emerald' && 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
              tone === 'rose' && 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
              tone === 'default' && 'bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-300'
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

/* ───────────────────────────────── Modal ──────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.button
            aria-label="Close dialog"
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className={cn(
              'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-lift dark:border-ink-800 dark:bg-ink-900 sm:rounded-2xl',
              widths[size]
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 dark:border-ink-800">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">{title}</h3>
                {description && <p className="mt-0.5 text-xs text-ink-400">{description}</p>}
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-700 dark:hover:bg-ink-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4 dark:border-ink-800">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', danger ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40' : 'bg-gold-50 text-gold-600 dark:bg-gold-900/30')}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <p className="text-sm leading-6 text-ink-600 dark:text-ink-300">{description}</p>
      </div>
    </Modal>
  );
}

/* ──────────────────────────────── Feedback ────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-gold', className)} />;
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-ink-400">
      <Spinner className="h-6 w-6" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-ink-50 text-ink-300 dark:bg-ink-800 dark:text-ink-500">
        {icon ?? <Search className="h-6 w-6" />}
      </span>
      <h3 className="font-display text-lg font-semibold text-ink-900 dark:text-white">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-6 text-ink-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="surface flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40">
        <AlertTriangle className="h-5 w-5" />
      </span>
      <p className="max-w-md text-sm text-ink-500 dark:text-ink-300">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
    danger: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100',
  };
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-[13px] leading-5 opacity-90">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="surface overflow-hidden">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/* ─────────────────────────────── Pagination ───────────────────────────── */

export function Pagination({
  page,
  totalPages,
  onChange,
  total,
  className,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  total?: number;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
    if (totalPages <= 5) return index + 1;
    if (page <= 3) return index + 1;
    if (page >= totalPages - 2) return totalPages - 4 + index;
    return page - 2 + index;
  });

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 pt-4', className)}>
      <p className="text-xs text-ink-400">
        Page {page} of {totalPages}
        {typeof total === 'number' ? ` · ${total} records` : ''}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pages.map((value) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={cn(
              'h-9 min-w-9 rounded-lg px-2 text-xs font-medium transition-colors',
              value === page
                ? 'bg-ink-900 text-white dark:bg-gold dark:text-ink-950'
                : 'text-ink-500 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-800'
            )}
          >
            {value}
          </button>
        ))}
        <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────────── Tabs ───────────────────────────────── */

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-ink-50 p-1 dark:bg-ink-900', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            value === tab.value
              ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-800 dark:text-white'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white'
          )}
        >
          {tab.label}
          {typeof tab.count === 'number' && <span className="ml-1.5 text-[10px] opacity-60">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────── Image upload ──────────────────────────── */

export function ImageUpload({
  value,
  onChange,
  label = 'Product image',
}: {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium text-ink-700 dark:text-ink-200">{label}</p>
      <div className="flex items-start gap-3">
        <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line bg-ink-50 dark:border-ink-700 dark:bg-ink-900">
          {value ? (
            <img src={value} alt="Preview" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-6 w-6 text-ink-300" />
          )}
        </div>
        <div className="flex-1 space-y-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200">
            <ImagePlus className="h-3.5 w-3.5" />
            {uploading ? 'Uploading…' : 'Upload image'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                setError('');
                try {
                  onChange(await uploadImage(file));
                } catch (uploadError) {
                  setError(apiErrorMessage(uploadError));
                } finally {
                  setUploading(false);
                  event.target.value = '';
                }
              }}
            />
          </label>
          <Input
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value)}
            placeholder="…or paste an image URL"
          />
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Page header ──────────────────────────── */

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        {back}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 dark:text-white">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-400">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
