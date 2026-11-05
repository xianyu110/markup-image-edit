import { getCookieFromHeader } from '@/lib/cookie';

const UTM_COOKIE_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const;

/** Hosts that must never become first-touch referrer / derived utm_source. */
const IGNORED_REFERRER_HOSTS =
  /(^|\.)(stripe\.com|checkout\.stripe\.com|billing\.stripe\.com|localhost|workers\.dev)$/i;

export type Attribution = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  referrer: string;
  landing: string;
};

export function sanitizeUtmValue(value: string, max = 100): string {
  return value.replace(/[^\w.\-]/g, '').slice(0, max);
}

export function hostFromReferrerUrl(value: string): string {
  if (!value) return '';
  try {
    const raw = value.includes('://') ? value : `https://${value}`;
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return value
      .split('/')[0]
      .toLowerCase()
      .replace(/^www\./, '')
      .replace(/[^\w.\-]/g, '');
  }
}

export function isIgnoredReferrerHost(host: string): boolean {
  if (!host) return true;
  return IGNORED_REFERRER_HOSTS.test(host);
}

export function sanitizeReferrerValue(value: string, max = 200): string {
  if (!value) return '';
  try {
    const u = new URL(value.includes('://') ? value : `https://${value}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (isIgnoredReferrerHost(host)) return '';
    return `${host}${u.pathname}`.replace(/[^\w.\-\/]/g, '').slice(0, max);
  } catch {
    const host = hostFromReferrerUrl(value);
    if (isIgnoredReferrerHost(host)) return '';
    return value.replace(/[^\w.\-\/:?&=%]/g, '').slice(0, max);
  }
}

/**
 * When landing has no utm_source, derive a channel from an external referrer
 * host (e.g. google.com → organic, chatgpt.com → referral).
 */
export function deriveUtmFromReferrerHost(host: string): {
  utm_source: string;
  utm_medium: string;
} | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (!h || isIgnoredReferrerHost(h)) return null;
  if (/(^|\.)(google|bing|duckduckgo|baidu|yandex|yahoo|sogou|naver|ecosia)\./.test(h) ||
      /^(google|bing|duckduckgo|baidu|yandex|yahoo|sogou|naver|ecosia)\./.test(h) ||
      h === 'google.com' || h === 'bing.com' || h === 'baidu.com') {
    return { utm_source: sanitizeUtmValue(h), utm_medium: 'organic' };
  }
  if (/(^|\.)(t\.co|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|youtube\.com|tiktok\.com|linkedin\.com|weibo\.com|threads\.net)$/.test(h) ||
      h === 't.co' || h === 'x.com' || h === 'facebook.com' || h === 'instagram.com' ||
      h === 'reddit.com' || h === 'youtube.com' || h === 'tiktok.com' || h === 'linkedin.com') {
    return { utm_source: sanitizeUtmValue(h), utm_medium: 'social' };
  }
  return { utm_source: sanitizeUtmValue(h), utm_medium: 'referral' };
}

function readCookie(cookieHeader: string | null, name: string): string {
  let v = getCookieFromHeader(cookieHeader, name) || '';
  try {
    v = decodeURIComponent(v);
  } catch {
    // keep raw
  }
  return v;
}

/** First-touch attribution from cookies set by server.ts on landing. */
export function readAttributionFromRequest(request: Request): Attribution {
  const cookie = request.headers.get('cookie');
  let utm_source = sanitizeUtmValue(readCookie(cookie, 'utm_source'));
  let utm_medium = sanitizeUtmValue(readCookie(cookie, 'utm_medium'));
  const utm_campaign = sanitizeUtmValue(readCookie(cookie, 'utm_campaign'));
  const utm_content = sanitizeUtmValue(readCookie(cookie, 'utm_content'));
  const utm_term = sanitizeUtmValue(readCookie(cookie, 'utm_term'));
  const referrer = sanitizeReferrerValue(
    readCookie(cookie, 'referrer') || readCookie(cookie, 'utm_referrer')
  );

  // Fallback: cookies often only have referrer (organic / in-app browsers).
  // Never invent a source from Stripe return hops.
  if (!utm_source && referrer) {
    const derived = deriveUtmFromReferrerHost(hostFromReferrerUrl(referrer));
    if (derived) {
      utm_source = derived.utm_source;
      if (!utm_medium) utm_medium = derived.utm_medium;
    }
  }

  const landing = sanitizeLandingValue(readCookie(cookie, 'landing'));

  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referrer,
    landing,
  };
}

export function sanitizeLandingValue(value: string, max = 200): string {
  if (!value) return '';
  return value.replace(/[^\w.\-\/]/g, '').slice(0, max);
}

/** Flat string map for Stripe session metadata (omit empty). */
export function attributionToMetadata(
  attr: Attribution
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of UTM_COOKIE_KEYS) {
    if (attr[key]) out[key] = attr[key];
  }
  if (attr.referrer) out.referrer = attr.referrer;
  if (attr.landing) out.landing = attr.landing;
  return out;
}


const FUNNEL_UTM_MARKERS = new Set([
  'checkout',
  'authenticated',
  'checkout_mode',
]);

/** True when utm_source is a funnel marker, not a marketing channel. */
export function isFunnelUtmMarker(value: string): boolean {
  return !value || FUNNEL_UTM_MARKERS.has(value);
}

/**
 * Pull first-touch fields from Stripe (or checkout) metadata for zh_order /
 * zh_user persistence. Funnel markers never become utm_source.
 */
export function attributionFromMetadata(
  meta: Record<string, unknown> | null | undefined
): Attribution {
  const m = meta || {};
  const str = (key: string) =>
    typeof m[key] === 'string' ? (m[key] as string) : '';
  let utm_source = sanitizeUtmValue(str('utm_source'));
  if (isFunnelUtmMarker(utm_source)) utm_source = '';
  let utm_medium = sanitizeUtmValue(str('utm_medium'));
  const utm_campaign = sanitizeUtmValue(str('utm_campaign'));
  const utm_content = sanitizeUtmValue(str('utm_content'));
  const utm_term = sanitizeUtmValue(str('utm_term'));
  const referrer = sanitizeReferrerValue(str('referrer'));
  const landing = sanitizeLandingValue(str('landing'));
  if (!utm_source && referrer) {
    const derived = deriveUtmFromReferrerHost(hostFromReferrerUrl(referrer));
    if (derived) {
      utm_source = derived.utm_source;
      if (!utm_medium) utm_medium = derived.utm_medium;
    }
  }
  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    referrer,
    landing,
  };
}

export { UTM_COOKIE_KEYS };

/** First landing path cookie (pathname only). */
export function readLandingFromRequest(request: Request): string {
  const cookie = request.headers.get('cookie');
  let v = readCookie(cookie, 'landing');
  return v.replace(/[^\w.\-\/]/g, '').slice(0, 200);
}

/** Client IP / CF country / Accept-Language locale for metadata + user row. */
export function readClientGeoFromRequest(request: Request): {
  ip: string;
  country: string;
  locale: string;
} {
  const ip = (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    ''
  ).slice(0, 100);
  const country = (request.headers.get('cf-ipcountry') || '')
    .replace(/[^A-Za-z]/g, '')
    .slice(0, 2)
    .toUpperCase();
  const accept = request.headers.get('accept-language') || '';
  const first = accept.split(',')[0]?.trim() ?? '';
  const locale = (first.split('-')[0]?.trim() ?? '')
    .replace(/[^\w-]/g, '')
    .slice(0, 10);
  return { ip, country, locale };
}
