import type { ComponentType, SVGProps } from 'react';

import { Link } from '@/core/i18n/navigation';
import { envConfigs } from '@/config';
import { cn } from '@/lib/utils';
import { FooterLanguageLine } from '@/components/footer-language-line';
import { LocaleSelector } from '@/components/locale-selector';

export interface FooterColumn {
 title: string;
 /** external: open in a new tab. Off-site (http) hrefs always open in a new tab. */
 links: { label: string; href: string; external?: boolean }[];
}

/** Off-site URLs render as plain <a>; internal paths use the locale-aware Link. */
const isExternalHref = (href: string) => /^https?:\/\//.test(href);

export interface FooterSocial {
 icon: ComponentType<SVGProps<SVGSVGElement>>;
 href: string;
 label: string;
}

/**
 * Free-listing directory badges (dofollow). New low-authority site: a small
 * set (≤3–5) lives in the homepage footer per the launch/backlink skill; move
 * to /partners once the list grows.
 */
export const DIRECTORY_BADGES: readonly { href: string; src: string; alt: string; width: number; height: number }[] = [
 {
 href: 'https://findaifor.me/?utm_source=markup-image-edit&utm_medium=badge&utm_campaign=footer',
 src: 'https://findaifor.me/badge/featured.svg',
 alt: 'Featured on FindAIForMe',
 width: 200,
 height: 54,
 },
 {
 href: 'https://showmebest.ai',
 src: 'https://showmebest.ai/badge/feature-badge-dark.webp',
 alt: 'Featured on ShowMeBestAI',
 width: 147,
 height: 40,
 },
 {
 href: 'https://twelve.tools',
 src: '/badges/twelve-tools.svg',
 alt: 'Featured on Twelve Tools',
 width: 119,
 height: 32,
 },
 {
 href: 'https://www.toolpilot.ai',
 src: '/badges/toolpilot.png',
 alt: 'Featured on ToolPilot.ai',
 width: 140,
 height: 31,
 },
];

export const POWERED_BY = {
 href: 'https://tryallapi.com/?utm_source=markup-image-edit&utm_medium=footer&utm_campaign=powered_by',
 label: 'Powered by TryAllAPI',
};

export function SiteFooter({
 tagline,
 columns,
 socials,
 copyright,
 languageLine = false,
}: {
 tagline?: string;
 columns?: FooterColumn[];
 socials?: FooterSocial[];
 copyright?: string;
 /** Reference footer style: Language: English · Español · Français */
 languageLine?: boolean;
}) {
 const year = new Date().getFullYear();

 return (
 <footer className="bg-neutral-950 text-neutral-100">
 <div className="mx-auto max-w-7xl px-6 pt-10 pb-6 sm:px-10 sm:pt-12 lg:px-16">
 {tagline && (
 <p className="mb-8 max-w-2xl font-serif text-3xl leading-[1.15] tracking-tight text-neutral-100 italic sm:text-4xl">
 {tagline}
 </p>
 )}

 {columns && columns.length > 0 && (
 <div
 className={cn(
 'grid gap-x-8 gap-y-8 sm:gap-x-12',
 columns.length <= 3
 ? 'grid-cols-1 sm:grid-cols-3'
 : columns.length === 4
 ? 'grid-cols-2 sm:grid-cols-4'
 : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
 )}
 >
 {columns.map((col) => (
 <div key={col.title} className="space-y-5">
 <p className="text-[13px] font-semibold tracking-wide text-neutral-100">
 {col.title}
 </p>
 <ul className="space-y-2">
 {col.links.map((link) => (
 <li key={link.label}>
 {isExternalHref(link.href) ? (
 <a
 href={link.href}
 target="_blank"
 rel="noopener noreferrer"
 className="text-sm text-balance break-words text-neutral-400 transition-colors hover:text-neutral-100"
 >
 {link.label}
 </a>
 ) : (
 <Link
 href={link.href}
 target={link.external ? '_blank' : undefined}
 className="text-sm text-balance break-words text-neutral-400 transition-colors hover:text-neutral-100"
 >
 {link.label}
 </Link>
 )}
 </li>
 ))}
 </ul>
 </div>
 ))}
 </div>
 )}

 {/* Socials + language row */}
 <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
 {socials && socials.length > 0 ? (
 <div className="flex items-center gap-5">
 {socials.map((s) => (
 <a
 key={s.label}
 href={s.href}
 aria-label={s.label}
 target="_blank"
 rel="noopener noreferrer"
 className="text-neutral-300 transition-colors hover:text-neutral-100"
 >
 <s.icon className="size-[18px]" />
 </a>
 ))}
 </div>
 ) : (
 <div />
 )}
 {languageLine ? (
 <FooterLanguageLine className="text-neutral-300 [&_b]:text-neutral-50 [&_button]:text-neutral-300 [&_button]:decoration-neutral-500 [&_span]:text-neutral-500" />
 ) : (
 <LocaleSelector
 variant="pill"
 className="border-neutral-700 text-neutral-200 hover:bg-white/5 hover:text-neutral-50"
 />
 )}
 </div>

 {/* Featured-on badges (small set, dofollow) */}
 {DIRECTORY_BADGES.length > 0 && (
 <div
 className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3"
 aria-label="Featured on"
 >
 {DIRECTORY_BADGES.map((badge) => (
 <a
 key={badge.href}
 href={badge.href}
 target="_blank"
 rel="dofollow noopener"
 className="inline-flex opacity-90 transition-opacity hover:opacity-100"
 >
 <img
 src={badge.src}
 alt={badge.alt}
 width={badge.width}
 height={badge.height}
 loading="lazy"
 decoding="async"
 className="h-8 w-auto max-h-10 object-contain"
 />
 </a>
 ))}
 </div>
 )}

 {/* Bottom bar */}
 <div className="mt-6 flex flex-col gap-3 border-t border-neutral-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
 <a
 href={POWERED_BY.href}
 target="_blank"
 rel="noopener"
 className="text-sm text-balance break-words text-neutral-400 transition-colors hover:text-neutral-100"
 >
 {POWERED_BY.label}
 </a>
 <span className="text-sm text-balance text-neutral-400 sm:text-right">
 {copyright ||
 `© ${year} ${envConfigs.app_name}. All rights reserved.`}
 </span>
 </div>
 </div>
 </footer>
 );
}
