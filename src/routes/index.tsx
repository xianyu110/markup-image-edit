import { createFileRoute } from '@tanstack/react-router';

import { MarkupLanding } from '@/components/markup/landing';
import { EXAMPLES, FAQS, SITE } from '@/components/markup/content';
import { absUrl, buildSeoHead, ldJson, localizedAbsoluteUrl } from '@/lib/seo';

export const Route = createFileRoute('/')({
  head: () => {
    const url = localizedAbsoluteUrl('/');
    const jsonLd = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: SITE.name, url, description: SITE.description, inLanguage: 'en' },
        {
          '@type': 'SoftwareApplication',
          name: SITE.name,
          applicationCategory: 'DesignApplication',
          operatingSystem: 'Web',
          url,
          description: SITE.description,
          image: absUrl('/og.jpg'),
          offers: { '@type': 'Offer', price: '6.90', priceCurrency: 'USD', category: 'one-time' },
        },
        ...EXAMPLES.map((ex) => ({
          '@type': 'ImageObject',
          name: `${ex.title} — AI markup edit result`,
          description: ex.instruction,
          contentUrl: absUrl(ex.after),
        })),
        {
          '@type': 'FAQPage',
          mainEntity: FAQS.map(([q, a]) => ({
            '@type': 'Question',
            name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
          })),
        },
      ],
    };
    return buildSeoHead({
      path: '/',
      title: SITE.title,
      description: SITE.description,
      ogImage: absUrl('/og.jpg'),
      keywords: SITE.keywords,
      extraMeta: [ldJson(jsonLd)],
    });
  },
  component: MarkupLanding,
});
