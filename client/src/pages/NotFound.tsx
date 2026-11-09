import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { useDocumentTitle } from '@/lib/hooks';
import { BrandMark } from '@/components/Storefront';
import { Button } from '@/components/ui';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  return (
    <div className="container-page flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <BrandMark />
      <span className="mt-10 grid h-16 w-16 place-items-center rounded-2xl bg-gold-50 text-gold-600 dark:bg-gold-900/30 dark:text-gold-300">
        <Compass className="h-7 w-7" />
      </span>
      <p className="mt-6 font-display text-5xl font-semibold tracking-tight">404</p>
      <h1 className="mt-2 font-display text-2xl font-semibold">This page could not be found.</h1>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-500 dark:text-ink-300">
        The page you are looking for may have moved or no longer exists. Let us help you get back on track.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back home
          </Button>
        </Link>
        <Link to="/products">
          <Button>Browse the shop</Button>
        </Link>
      </div>
    </div>
  );
}
