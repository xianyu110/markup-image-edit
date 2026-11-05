/**
 * Shared SEO head helpers — self-canonical + per-page hreflang for every locale.
 */
import { envConfigs } from '@/config';
import {
  baseLocale,
  getLocale,
  locales,
  localizeUrl,
  type Locale,
} from '@/paraglide/runtime.js';

export type SeoHeadOptions = {
  /** Path without locale prefix, e.g. `/pricing` or `/tools/photo-to-video`. Use `` for home. */
  path: string;
  title: string;
  description: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
  /** Extra meta entries (Open Graph overrides, JSON-LD via `script:ld+json`, etc.) */
  extraMeta?: Record<string, unknown>[];
  keywords?: string;
};

function appOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return (envConfigs.app_url || 'https://markup-image-edit.chatgpt-plus.workers.dev').replace(/\/$/, '');
}

/** Absolute URL for a path in a given locale (self-canonical when locale = current). */
export function localizedAbsoluteUrl(
  path: string,
  locale: string = getLocale()
): string {
  const origin = appOrigin();
  const bare = path === '/' || path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
  const absolute = bare === '/' ? `${origin}/` : `${origin}${bare}`;
  try {
    return localizeUrl(absolute, {
      locale: locale as Locale,
    }).href;
  } catch {
    if (locale === baseLocale || locale === 'en') return absolute;
    const prefix = `/${locale}`;
    if (bare === '/') return `${origin}${prefix}`;
    return `${origin}${prefix}${bare}`;
  }
}

/** English-only site: canonical always points at the base-locale URL; no hreflang alternates. */
export function localeAlternateLinks(path: string, _locale: string = getLocale()) {
  const canonical = localizedAbsoluteUrl(path, baseLocale);
  return {
    canonical,
    links: [{ rel: 'canonical' as const, href: canonical }],
  };
}

/** Build TanStack route `head()` meta + links for a public page. */
export function buildSeoHead(opts: SeoHeadOptions) {
  const locale = getLocale();
  const { canonical, links } = localeAlternateLinks(opts.path, locale);
  const ogImage = opts.ogImage || `${appOrigin()}/og.jpg`;
  const ogType = opts.ogType || 'website';

  const meta: Record<string, unknown>[] = [
    { title: opts.title },
    { name: 'description', content: opts.description },
    { property: 'og:type', content: ogType },
    { property: 'og:url', content: canonical },
    { property: 'og:title', content: opts.title },
    { property: 'og:description', content: opts.description },
    { property: 'og:image', content: ogImage },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: 'Markup Image Edit — circle an area, describe the change, get a precise AI image edit' },
    { property: 'og:site_name', content: 'Markup Image Edit' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: opts.title },
    { name: 'twitter:description', content: opts.description },
    { name: 'twitter:image', content: ogImage },
  ];

  if (opts.keywords) {
    meta.splice(2, 0, { name: 'keywords', content: opts.keywords });
  }
  if (opts.noindex) {
    meta.push({ name: 'robots', content: 'noindex, follow' });
  }
  if (opts.extraMeta?.length) {
    meta.push(...opts.extraMeta);
  }

  return { meta, links };
}

export function absUrl(path: string): string {
  const origin = appOrigin();
  if (path.startsWith('http')) return path;
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function ldJson(data: unknown): Record<string, unknown> {
  return { 'script:ld+json': data } as Record<string, unknown>;
}
