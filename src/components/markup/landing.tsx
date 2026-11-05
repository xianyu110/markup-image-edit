'use client';

import { Check, Circle, Download, MousePointer2, Type } from 'lucide-react';

import { useSession } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';
import { SiteUserMenu } from '@/components/site-user-menu';
import { ThemeToggle } from '@/components/theme-toggle';
import { CREDITS_PER_EDIT, listPricingProducts, packEditCount } from '@/config/pricing';

import { BeforeAfter } from './before-after';
import { EXAMPLES, FAQS, SITE } from './content';
import { MarkupEditor } from './editor';

export function SiteHeader() {
  const { data: session } = useSession();
  const user = session?.user;
  return (
    <header className="border-border bg-background/95 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <img src="/logo.svg" alt="Markup Image Edit logo" width={34} height={34} className="size-[34px]" />
          <span className="text-[1.05rem] font-bold tracking-tight">{SITE.name}</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a href="/#examples" className="text-muted-foreground hover:text-foreground">Examples</a>
          <a href="/#how" className="text-muted-foreground hover:text-foreground">How it works</a>
          <a href="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</a>
          <a href="/#faq" className="text-muted-foreground hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {user ? (
            <SiteUserMenu name={user.name || 'User'} email={user.email} image={user.image} />
          ) : (
            <Link href="/sign-in?callbackUrl=%2F" className="text-muted-foreground hover:text-foreground hidden text-sm sm:inline">
              Sign in
            </Link>
          )}
          <a href="/#editor" className="inline-flex h-9 items-center rounded-full bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700">
            Start editing
          </a>
        </div>
      </div>
    </header>
  );
}

export function SiteFooterBlock() {
  const columns: FooterColumn[] = [
    {
      title: 'Product',
      links: [
        { label: 'Editor', href: '/#editor' },
        { label: 'Examples', href: '/#examples' },
        { label: 'Pricing', href: '/pricing' },
      ],
    },
    {
      title: 'Account',
      links: [
        { label: 'Sign in', href: '/sign-in' },
        { label: 'Credits & billing', href: '/settings/credits' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy policy', href: '/privacy-policy' },
        { label: 'Terms of service', href: '/terms-of-service' },
      ],
    },
  ];
  return <SiteFooter tagline="Circle it. Describe it. Only that part changes." columns={columns} />;
}

export function PricingCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {listPricingProducts().map((p) => {
        const edits = packEditCount(p.productId);
        const featured = p.productId === 'pack_1';
        return (
          <div key={p.productId} className={`rounded-2xl border p-5 ${featured ? 'border-red-500 shadow-lg shadow-red-500/10' : 'border-border'}`}>
            <p className="text-muted-foreground text-sm font-medium">{p.productName.split(' — ')[0]}</p>
            <p className="mt-1 text-3xl font-bold">${(p.priceInCents / 100).toFixed(2)}</p>
            <p className="mt-1 text-sm">
              <b>{edits} edits</b> · {p.credits} credits
            </p>
            <p className="text-muted-foreground mt-1 text-xs">${(p.priceInCents / 100 / edits).toFixed(2)} per edit · one-time</p>
            <a href="/#editor" className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-full bg-neutral-900 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900">
              Use credits in the editor
            </a>
          </div>
        );
      })}
    </div>
  );
}

export function MarkupLanding() {
  return (
    <div className="bg-background text-foreground min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-[1200px] px-4 pt-10 pb-6 sm:px-6 sm:pt-14">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
            <Circle className="size-3.5" /> Markup-guided editing · GPT Image 2.6
          </p>
          <h1 className="max-w-3xl text-4xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Circle what to change. <span className="text-red-600">AI edits only that part.</span>
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
            Upload an image, draw a circle, lasso or brush over the exact area, then type the change — swap a word on a logo, recolor a product, fix a detail. Everything you did not mark stays as it was.
          </p>
          <ul className="text-muted-foreground mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <li className="flex items-center gap-1.5"><Check className="size-4 text-red-600" /> {CREDITS_PER_EDIT} credits per edit</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-red-600" /> No subscription</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-red-600" /> Failed edits refunded</li>
            <li className="flex items-center gap-1.5"><Check className="size-4 text-red-600" /> PNG download</li>
          </ul>
        </section>

        <section id="editor" className="mx-auto max-w-[1200px] scroll-mt-20 px-4 pb-14 sm:px-6">
          <div className="border-border bg-card rounded-3xl border p-4 shadow-sm sm:p-6">
            <MarkupEditor />
          </div>
        </section>

        <section id="examples" className="bg-muted/30 scroll-mt-16 py-14">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Real before / after examples</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl">
              Produced with this editor's exact pipeline. Left: the image with the red markup. Right: drag the slider to compare the original and the edit.
            </p>
            <div className="mt-8 grid gap-10">
              {EXAMPLES.map((ex) => (
                <div key={ex.slug} className="grid items-start gap-4 md:grid-cols-[1fr_1.4fr]">
                  <div>
                    <h3 className="text-xl font-semibold">{ex.title}</h3>
                    <p className="bg-background border-border mt-2 rounded-xl border p-3 text-sm italic">“{ex.instruction}”</p>
                    <img src={ex.marked} alt={`${ex.title} — marked area`} width={800} height={800} loading="lazy" className="mt-3 w-full max-w-sm rounded-xl" />
                    <p className="text-muted-foreground mt-2 text-xs">{ex.note}</p>
                  </div>
                  <BeforeAfter before={ex.before} after={ex.after} beforeAlt={`${ex.title} — before`} afterAlt={`${ex.title} — after`} />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { icon: MousePointer2, t: '1. Upload & mark', d: 'Drop a PNG, JPEG or WebP. Use Circle, Lasso or Brush to draw red marks around the exact area.' },
              { icon: Type, t: '2. Describe the change', d: 'Say what should happen inside the marks: “change BREW to ROAST”, “make the bottle cobalt blue”.' },
              { icon: Download, t: '3. Compare & download', d: 'Drag the before/after slider, download the PNG, or keep editing the result.' },
            ].map((s) => (
              <div key={s.t} className="border-border rounded-2xl border p-5">
                <s.icon className="size-6 text-red-600" />
                <h3 className="mt-3 font-semibold">{s.t}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
          <p className="text-muted-foreground mt-6 max-w-3xl text-sm">
            Under the hood your marks are sent as a separate transparent PNG layer (the <code>markup</code> input of OpenAI's image edits endpoint) together with your original image, so the model sees both the untouched photo and where you pointed.
          </p>
        </section>

        <section id="pricing" className="bg-muted/30 scroll-mt-16 py-14">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Pay per edit</h2>
            <p className="text-muted-foreground mt-2">Every edit costs {CREDITS_PER_EDIT} credits. One-time packs, no subscription.</p>
            <div className="mt-8">
              <PricingCards />
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-[900px] scroll-mt-16 px-4 py-14 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">FAQ</h2>
          <div className="mt-6 divide-y">
            {FAQS.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="cursor-pointer list-none font-semibold">{q}</summary>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooterBlock />
    </div>
  );
}
