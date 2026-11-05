'use client';

import { localeNames } from '@/config/locale';
import { cn } from '@/lib/utils';
import { getLocale, locales, setLocale } from '@/paraglide/runtime.js';

/** Order matches reference footer: English · Español · Français, then 中文 if present. */
const DISPLAY_ORDER = ['en', 'es', 'fr', 'zh'] as const;

/**
 * Footer language switcher matching reference layout:
 * `Language: English · Español · Français`
 * Current locale is bold; others are underlined links.
 */
export function FooterLanguageLine({
 className,
 label = 'Language',
}: {
 className?: string;
 /** Prefix label — keep English on all locales to match original site chrome */
 label?: string;
}) {
 const current = getLocale();
 const available = DISPLAY_ORDER.filter((code) =>
 (locales as readonly string[]).includes(code)
 );

 return (
 <p
 className={cn(
 'text-sm leading-relaxed text-[#4a3a2c]',
 className
 )}
 >
 <span className="text-[#7b6a57]">{label}: </span>
 {available.map((code, i) => {
 const name = localeNames[code] || code;
 const isCurrent = code === current;
 return (
 <span key={code}>
 {i > 0 ? <span className="text-[#7b6a57]"> · </span> : null}
 {isCurrent ? (
 <b className="font-semibold text-[#21160e]">{name}</b>
 ) : (
 <button
 type="button"
 onClick={() => setLocale(code as typeof current)}
 className="underline decoration-[#21160e]/35 underline-offset-2 transition-colors hover:text-[#21160e] hover:decoration-[#21160e]"
 lang={code}
 >
 {name}
 </button>
 )}
 </span>
 );
 })}
 </p>
 );
}
