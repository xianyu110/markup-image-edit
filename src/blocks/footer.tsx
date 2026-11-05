import { m } from '@/paraglide/messages.js';
import { SiteFooter, type FooterColumn } from '@/components/site-footer';

export function Footer() {
  const columns: FooterColumn[] = [
    {
      title: m['landing.footer.feature'](),
      links: [
        {
          label: m['landing.footer.settings'](),
          href: '/settings',
          external: true,
        },
        { label: m['landing.footer.admin'](), href: '/admin', external: true },
      ],
    },
    {
      title: m['landing.footer.legal'](),
      links: [
        { label: m['landing.footer.privacy'](), href: '/privacy-policy' },
        { label: m['landing.footer.terms'](), href: '/terms-of-service' },
      ],
    },
  ];


  return (
    <SiteFooter
      tagline={m['landing.footer.tagline']()}
      columns={columns}
    />
  );
}
