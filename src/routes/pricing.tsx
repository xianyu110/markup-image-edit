import { createFileRoute } from '@tanstack/react-router';

import { PricingCards, SiteFooterBlock, SiteHeader } from '@/components/markup/landing';
import { CREDITS_PER_EDIT, listPricingProducts, packEditCount } from '@/config/pricing';
import { buildSeoHead, ldJson, localizedAbsoluteUrl } from '@/lib/seo';

export const Route = createFileRoute('/pricing')({
  head: () => {
    const url = localizedAbsoluteUrl('/pricing');
    const description = `Markup Image Edit pricing: every precise AI edit costs ${CREDITS_PER_EDIT} credits. One-time credit packs from $6.90, no subscription, failed edits refunded.`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Markup Image Edit credit packs',
      description,
      brand: { '@type': 'Brand', name: 'Markup Image Edit' },
      offers: listPricingProducts().map((p) => ({
        '@type': 'Offer',
        name: `${packEditCount(p.productId)} edits (${p.credits} credits)`,
        price: (p.priceInCents / 100).toFixed(2),
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url,
      })),
    };
    return buildSeoHead({
      path: '/pricing',
      title: 'Pricing — Markup Image Edit | Pay per precise AI edit',
      description,
      extraMeta: [ldJson(jsonLd)],
    });
  },
  component: PricingPage,
});

function PricingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-extrabold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          Every edit costs {CREDITS_PER_EDIT} credits, whichever model (Flare or Sunburst) and quality you choose. Buy a one-time pack — no subscription. If an edit fails, its credits go straight back to your balance.
        </p>
        <div className="mt-8">
          <PricingCards />
        </div>
        <p className="text-muted-foreground mt-8 text-sm">
          Payments are processed by Stripe. Start an edit in the <a className="underline" href="/#editor">editor</a>; if you are out of credits it will offer these packs and bring you back with your image and marks restored.
        </p>
      </main>
      <SiteFooterBlock />
    </div>
  );
}
