import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Mail, MapPin, Phone, Send } from 'lucide-react';
import { api, apiErrorMessage } from '@/lib/api';
import { useDocumentTitle } from '@/lib/hooks';
import { useSettings, useToast } from '@/context/AppProviders';
import { Breadcrumbs, NewsletterForm } from '@/components/Storefront';
import { Alert, Button, EmptyState, Field, Input, PageLoader, Textarea } from '@/components/ui';
import type { ContentPage } from '@/types';

const TITLES: Record<string, string> = {
  about: 'About HILAAL',
  contact: 'Contact us',
  faq: 'Frequently asked questions',
  privacy: 'Privacy policy',
  terms: 'Terms & conditions',
  returns: 'Returns & refunds',
};

export default function ContentPageRoute() {
  const { slug = 'about' } = useParams<{ slug: string }>();
  useDocumentTitle(TITLES[slug] ?? 'Information');
  const { settings } = useSettings();
  const { success } = useToast();

  const [openSection, setOpenSection] = useState<number | null>(0);
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const { data: page, isLoading } = useQuery({
    queryKey: ['content', slug],
    queryFn: () => api.get<ContentPage | null>(`/content/${slug}`),
  });

  const submitContact = async () => {
    setError('');
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || form.message.trim().length < 5) {
      setError('Please complete your name, email, subject and message.');
      return;
    }
    setSending(true);
    try {
      await api.post('/contact', {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        subject: form.subject,
        message: form.message,
      });
      setSent(true);
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
      success('Your message has been sent. We will get back to you soon.');
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setSending(false);
    }
  };

  if (isLoading) return <PageLoader label="Loading page…" />;

  return (
    <div>
      <div className="border-b border-line bg-white dark:border-ink-800 dark:bg-ink-900">
        <div className="container-page py-10">
          <Breadcrumbs items={[{ label: TITLES[slug] ?? page?.title ?? 'Information' }]} />
          <h1 className="display mt-4 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
            {page?.title ?? TITLES[slug] ?? 'Information'}
          </h1>
          {page?.subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-500 dark:text-ink-300">{page.subtitle}</p>}
        </div>
      </div>

      <div className="container-page py-10">
        {!page ? (
          <EmptyState
            title="Page not available"
            description="This page has not been published yet. Please check back soon."
          />
        ) : (
          <div className={`grid gap-10 ${slug === 'contact' ? 'lg:grid-cols-[1fr_380px]' : 'mx-auto max-w-3xl'}`}>
            <div className="space-y-8">
              {page.body && (
                <div className="prose-hilaal space-y-4 text-[15px] leading-7 text-ink-600 dark:text-ink-300">
                  {page.body.split('\n').filter(Boolean).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              )}

              {page.sections?.length > 0 && (
                <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white dark:divide-ink-800 dark:border-ink-800 dark:bg-ink-900">
                  {page.sections.map((section, index) => (
                    <div key={index}>
                      <button
                        onClick={() => setOpenSection(openSection === index ? null : index)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        aria-expanded={openSection === index}
                      >
                        <span className="text-sm font-semibold text-ink-900 dark:text-white">{section.heading}</span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${
                            openSection === index ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {openSection === index && (
                        <p className="whitespace-pre-line px-5 pb-5 text-sm leading-7 text-ink-500 dark:text-ink-300">
                          {section.body}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {slug === 'about' && (
                <div className="surface p-6">
                  <h2 className="font-display text-xl font-semibold">Stay in the loop</h2>
                  <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-300">
                    New arrivals, seasonal offers and shop news — straight to your inbox.
                  </p>
                  <div className="mt-4 max-w-md">
                    <NewsletterForm />
                  </div>
                </div>
              )}
            </div>

            {slug === 'contact' && (
              <aside className="space-y-5">
                <div className="surface p-5">
                  <h2 className="font-display text-lg font-semibold">Shop details</h2>
                  <ul className="mt-4 space-y-3 text-sm">
                    <li className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 text-gold-600" />
                      <span className="text-ink-600 dark:text-ink-300">{settings?.address ?? 'Hargeisa, Somaliland'}</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Phone className="mt-0.5 h-4 w-4 text-gold-600" />
                      <a href={`tel:${settings?.phone ?? ''}`} className="text-ink-600 hover:underline dark:text-ink-300">
                        {settings?.phone ?? '—'}
                      </a>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <Mail className="mt-0.5 h-4 w-4 text-gold-600" />
                      <a href={`mailto:${settings?.email ?? ''}`} className="text-ink-600 hover:underline dark:text-ink-300">
                        {settings?.email ?? '—'}
                      </a>
                    </li>
                  </ul>
                  {settings?.businessHours && (
                    <p className="mt-4 border-t border-line pt-4 text-xs text-ink-400 dark:border-ink-800">
                      {settings.businessHours}
                    </p>
                  )}
                </div>

                <div className="surface p-5">
                  <h2 className="font-display text-lg font-semibold">Send a message</h2>
                  {sent && (
                    <div className="mt-3">
                      <Alert tone="success">Thank you — your message was received.</Alert>
                    </div>
                  )}
                  {error && (
                    <div className="mt-3">
                      <Alert tone="danger">{error}</Alert>
                    </div>
                  )}
                  <div className="mt-4 space-y-3">
                    <Field label="Name" required>
                      <Input value={form.name} onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))} />
                    </Field>
                    <Field label="Email" required>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
                      />
                    </Field>
                    <Field label="Phone">
                      <Input value={form.phone} onChange={(event) => setForm((value) => ({ ...value, phone: event.target.value }))} />
                    </Field>
                    <Field label="Subject" required>
                      <Input
                        value={form.subject}
                        onChange={(event) => setForm((value) => ({ ...value, subject: event.target.value }))}
                      />
                    </Field>
                    <Field label="Message" required>
                      <Textarea
                        value={form.message}
                        onChange={(event) => setForm((value) => ({ ...value, message: event.target.value }))}
                      />
                    </Field>
                    <Button className="w-full" loading={sending} onClick={submitContact}>
                      <Send className="h-4 w-4" /> Send message
                    </Button>
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
