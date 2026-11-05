import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { baseLocale, locales, localizeUrl } from '@/paraglide/runtime.js';

/** Public Markup Image Edit URLs (English only). */
const STATIC_PATHS = [
  '',
  '/pricing',
  '/privacy-policy',
  '/terms-of-service',
];

const EFFECT_PATHS: string[] = [];

type Entry = {
  path: string;
  locale: string;
  lastModified?: string;
};

function urlFor(path: string, locale: string): string {
  try {
    return localizeUrl(`${envConfigs.app_url}${path || '/'}`, {
      locale: locale as (typeof locales)[number],
    }).href;
  } catch {
    const base = (envConfigs.app_url || 'https://markup-image-edit.chatgpt-plus.workers.dev').replace(/\/$/, '');
    return `${base}${path || '/'}`;
  }
}

function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (character) =>
      ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;',
      })[character] ?? character
  );
}

function entryXml(e: Entry): string {
  const loc = urlFor(e.path, e.locale);
  const alternates: string[] = [
  ];
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    e.lastModified
      ? `    <lastmod>${escapeXml(e.lastModified)}</lastmod>`
      : null, ...alternates,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

function xmlResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
      'Cache-Control':
        'private, no-store, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const entries: Entry[] = [...STATIC_PATHS, ...EFFECT_PATHS].flatMap(
            (path) => [{ path, locale: baseLocale }]
          );

          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', ...entries.map(entryXml),
            '</urlset>',
            '',
          ].join('\n');

          return xmlResponse(xml);
        } catch {
          const base = (envConfigs.app_url || 'https://markup-image-edit.chatgpt-plus.workers.dev').replace(
            /\/$/,
            ''
          );
          const fallback = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            `  <url>\n    <loc>${escapeXml(base + '/')}</loc>\n  </url>`,
            '</urlset>',
            '',
          ].join('\n');
          return xmlResponse(fallback);
        }
      },
    },
  },
});
