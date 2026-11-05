import { getCookieFromHeader } from './lib/cookie';
import {
  deriveUtmFromReferrerHost,
  hostFromReferrerUrl,
  isIgnoredReferrerHost,
  sanitizeReferrerValue,
  sanitizeUtmValue,
} from './modules/payment/attribution';

/**
 * Keep this entry tiny: Nitro evaluates it on every cold isolate, and that
 * evaluation is billed as request CPU. Lazy-load TanStack + Paraglide only
 * when SSR is actually needed so edge-cache HITs stay under Workers Free
 * CPU limits.
 */
let ssrPromise: Promise<{
  handler: { fetch(req: Request): Promise<Response> | Response };
  paraglideMiddleware: (
    req: Request,
    next: () => Promise<Response> | Response
  ) => Promise<Response>;
}> | null = null;

function loadSsr() {
  if (!ssrPromise) {
    ssrPromise = Promise.all([
      import('@tanstack/react-start/server-entry'),
      import('./paraglide/server.js'),
    ]).then(([h, p]) => ({
      handler: h.default as any,
      paraglideMiddleware: p.paraglideMiddleware as any,
    }));
    ssrPromise.catch(() => {
      ssrPromise = null;
    });
  }
  return ssrPromise;
}

async function renderSsr(req: Request): Promise<Response> {
  const { handler, paraglideMiddleware } = await loadSsr();
  return paraglideMiddleware(req, () => handler.fetch(req));
}

/**
 * Pure marketing/click-id params never change the rendered HTML (attribution
 * cookies are set from req.url below), so such URLs can still be served from
 * the edge cache instead of a full SSR.
 */
const TRACKING_PARAM_RE =
  /^(utm_[a-z_]+|fbclid|gclid|gbraid|wbraid|dclid|msclkid|ttclid|twclid|li_fat_id|igshid|yclid|mc_cid|mc_eid|_ga|_gl|srsltid|template)$/i;
function onlyTrackingParams(url: URL): boolean {
  for (const k of url.searchParams.keys()) {
    if (!TRACKING_PARAM_RE.test(k)) return false;
  }
  return true;
}

// On Cloudflare Workers, stash the binding env (D1, ASSETS, …) on globalThis
// so synchronous code paths (e.g. the db() singleton with DATABASE_PROVIDER=d1)
// can reach bindings without threading the request context through every call.
const CF_WORKERS_MODULE = 'cloudflare:workers';
let cfEnvPromise: Promise<void> | null = null;

function ensureCloudflareEnv(): Promise<void> {
  if (!cfEnvPromise) {
    cfEnvPromise = import(/* @vite-ignore */ CF_WORKERS_MODULE)
      .then((mod) => {
        (globalThis as any).__CF_ENV__ = mod.env;
        if (mod.env && typeof process !== 'undefined' && process.env) {
          for (const [key, value] of Object.entries(mod.env)) {
            if (typeof value === 'string' && !process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      })
      .catch(() => {
        // Not running on Cloudflare Workers — nothing to stash.
      });
  }
  return cfEnvPromise;
}

const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://plausible.io https://client.crisp.chat https://embed.tawk.to",
    "style-src 'self' 'unsafe-inline' https://client.crisp.chat",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://www.google-analytics.com https://www.googletagmanager.com https://plausible.io https://client.crisp.chat wss://client.relay.crisp.chat https://embed.tawk.to wss://*.tawk.to https://*.googleapis.com https://*.cloudflare.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://www.googletagmanager.com https://tawk.to https://*.tawk.to",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com https://hooks.stripe.com",
    'upgrade-insecure-requests',
  ].join('; '),
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function canonicalHostRedirect(req: Request): Response | null {
  const appUrl =
    (globalThis as any).__CF_ENV__?.VITE_APP_URL ||
    (globalThis as any).__CF_ENV__?.APP_URL ||
    (typeof process !== 'undefined'
      ? process.env.VITE_APP_URL || process.env.APP_URL
      : '') ||
    '';
  if (!appUrl) return null;
  let target: URL;
  try {
    target = new URL(appUrl);
  } catch {
    return null;
  }
  const url = new URL(req.url);
  const host = url.hostname.toLowerCase();
  if (host === target.hostname) return null;
  // Always send www → apex so Google OAuth cookies land on the same host.
  if (host === `www.${target.hostname}`) {
    const location = `${target.origin}${url.pathname}${url.search}`;
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    return new Response(null, {
      status: isGet ? 301 : 308,
      headers: {
        Location: location,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  return null;
}

declare const __BUILD_ID__: string;
const BUILD_ID = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

/** Edge HTML cache for anonymous page views — cuts TTFB after first warm. */
const EDGE_HTML_TTL = 900; // seconds at the edge
const EDGE_CACHED_FILES = new Set([
  '/sitemap.xml',
  '/llms.txt',
  '/llms-full.txt',
  '/robots.txt',
]);
const NO_CACHE_PREFIXES = [
  '/api',
  '/admin',
  '/settings',
  '/auth',
  '/sign-',
  '/login',
  '/checkout',
  '/payment',
  '/oauth',
  '/.well-known',
  '/_',
  '/orders',
  '/generator',
];

function isAiCrawler(req: Request): boolean {
  const ua = (req.headers.get('user-agent') || '').toLowerCase();
  return /gptbot|chatgpt-user|oai-searchbot|claudebot|anthropic|perplexity|google-extended|bytespider|ccbot|amazonbot|cohere-ai|meta-externalagent|facebookbot|applebot-extended/.test(
    ua
  );
}

function isCacheablePageRequest(req: Request, url: URL): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (url.search && !onlyTrackingParams(url)) return false;
  const bare =
    url.pathname.replace(/^\/(zh-hant|zh|es|fr|pt|ko|ru|de|it|ja)(?=\/|$)/, '') ||
    '/';
  if (
    NO_CACHE_PREFIXES.some(
      (p) => bare === p || bare.startsWith(p + '/') || bare.startsWith(p)
    )
  ) {
    if (bare !== '/') return false;
  }
  if (/\.[a-z0-9]{2,5}$/i.test(bare) && !EDGE_CACHED_FILES.has(bare)) {
    return false;
  }
  const cookie = req.headers.get('cookie') || '';
  if (/session_token|better-auth/i.test(cookie)) return false;
  return true;
}

function edgeCacheKey(_req: Request, url: URL): Request {
  const prefixed = /^\/(zh-hant|zh|es|fr|pt|ko|ru|de|it|ja)(\/|$)/.test(
    url.pathname
  );
  const cookieLocale =
    getCookieFromHeader(_req.headers.get('cookie'), 'PARAGLIDE_LOCALE') || '';
  const al = (_req.headers.get('accept-language') || '').slice(0, 2).toLowerCase();
  const variant = prefixed ? '' : `${cookieLocale}.${al}`;
  return new Request(
    `https://edge-cache.markupimageedit.internal/${BUILD_ID}/${variant}${url.pathname}`,
    { method: 'GET' }
  );
}

function edgeCache(): Cache | null {
  const c = (globalThis as any).caches;
  return c && c.default ? (c.default as Cache) : null;
}

/** Cheap 404 for scanner probes — avoid full SSR CPU. */
const PROBE_PATH_RE =
  /(?:^|\/)\.(?!well-known(?:\/|$))[^/]|\.(?:php\d?|aspx?|jsp|cgi|env|bak|old|orig|sql|sqlite|swp|ini|log|tar|gz|zip|rar|7z)$|^\/(?:wp-|wordpress|xmlrpc|phpmyadmin|cgi-bin)|\.\./i;
function probeNotFound(req: Request): Response | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    path = new URL(req.url).pathname;
  }
  if (!PROBE_PATH_RE.test(path)) return null;
  return new Response('Not Found', {
    status: 404,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function appendAttributionCookies(req: Request, response: Response): Response {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, '') || '/';
  if (
    pathname === '/sitemap.xml' ||
    pathname === '/sitemap.txt' ||
    pathname === '/sitemap-min.xml' ||
    pathname === '/sitemap-full.xml' ||
    pathname === '/sitemap-index.xml' ||
    pathname === '/robots.txt' ||
    pathname === '/llms.txt' ||
    pathname === '/llms-full.txt' ||
    pathname === '/ads.txt' ||
    pathname.startsWith('/.well-known/')
  ) {
    return response;
  }
  if (isAiCrawler(req)) {
    return response;
  }

  // Rebuild with mutable headers so we can append Set-Cookie after a cache HIT.
  response = new Response(response.body, response);

  const cookieHeader = req.headers.get('cookie');
  const cookieOpts = 'Max-Age=2592000; Path=/; SameSite=Lax; Secure';
  const utmKeys = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ] as const;
  for (const key of utmKeys) {
    const raw = url.searchParams.get(key);
    if (!raw || getCookieFromHeader(cookieHeader, key)) continue;
    const sanitized = sanitizeUtmValue(raw);
    if (sanitized) {
      response.headers.append('Set-Cookie', `${key}=${sanitized}; ${cookieOpts}`);
    }
  }
  if (!getCookieFromHeader(cookieHeader, 'landing')) {
    const landing = url.pathname.replace(/[^\w.\-\/]/g, '').slice(0, 200);
    if (landing) {
      response.headers.append(
        'Set-Cookie',
        `landing=${encodeURIComponent(landing)}; ${cookieOpts}`
      );
    }
  }
  let firstTouchReferrer = '';
  if (!getCookieFromHeader(cookieHeader, 'referrer')) {
    const referer = req.headers.get('referer') || '';
    if (referer) {
      try {
        const refUrl = new URL(referer);
        const refHost = refUrl.hostname.toLowerCase().replace(/^www\./, '');
        const sameHost =
          refUrl.hostname === url.hostname ||
          refUrl.hostname.endsWith(`.${url.hostname}`);
        if (!sameHost && !isIgnoredReferrerHost(refHost)) {
          firstTouchReferrer = sanitizeReferrerValue(
            `${refUrl.hostname}${refUrl.pathname}`
          );
          if (firstTouchReferrer) {
            response.headers.append(
              'Set-Cookie',
              `referrer=${encodeURIComponent(firstTouchReferrer)}; ${cookieOpts}`
            );
          }
        }
      } catch {
        // ignore malformed Referer
      }
    }
  }
  if (
    !getCookieFromHeader(cookieHeader, 'utm_source') &&
    !url.searchParams.get('utm_source') &&
    firstTouchReferrer
  ) {
    const derived = deriveUtmFromReferrerHost(
      hostFromReferrerUrl(firstTouchReferrer)
    );
    if (derived?.utm_source) {
      response.headers.append(
        'Set-Cookie',
        `utm_source=${derived.utm_source}; ${cookieOpts}`
      );
      if (
        derived.utm_medium &&
        !getCookieFromHeader(cookieHeader, 'utm_medium') &&
        !url.searchParams.get('utm_medium')
      ) {
        response.headers.append(
          'Set-Cookie',
          `utm_medium=${derived.utm_medium}; ${cookieOpts}`
        );
      }
    }
  }

  return response;
}

// Workers Static Assets answer `Range` with a full 200, which makes Safari/iOS
// refuse to play (and stalls seeking). `/media/<path>.mp4` streams the same
// public asset (`/samples/<path>.mp4`) through the Worker with 206 support.
const MEDIA_PREFIX = '/media/';
async function serveRangedMedia(req: Request, url: URL): Promise<Response | null> {
  if (!url.pathname.startsWith(MEDIA_PREFIX) || !url.pathname.endsWith('.mp4')) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405 });
  const rel = url.pathname.slice(MEDIA_PREFIX.length);
  if (!/^[a-z0-9][a-z0-9/_-]*\.mp4$/i.test(rel) || rel.includes('..')) return null;
  const assets = (globalThis as any).__CF_ENV__?.ASSETS as
    | { fetch: (r: Request | string) => Promise<Response> }
    | undefined;
  if (!assets) return null;
  const upstream = await assets.fetch(new Request(new URL(`/samples/${rel}`, url.origin).toString()));
  if (!upstream.ok) return new Response('Not found', { status: 404 });
  const buf = await upstream.arrayBuffer();
  const size = buf.byteLength;
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400',
  });
  const etag = upstream.headers.get('etag');
  if (etag) headers.set('ETag', etag);
  const range = req.headers.get('range');
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) {
    headers.set('Content-Length', String(size));
    return new Response(req.method === 'HEAD' ? null : buf, { status: 200, headers });
  }
  let start: number;
  let end: number;
  if (m[1] === '') {
    const suffix = Math.min(Number(m[2]), size);
    start = size - suffix;
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(req.method === 'HEAD' ? null : buf.slice(start, end + 1), { status: 206, headers });
}


export default {
  // Cloudflare Cron Trigger (every 10 minutes) — finalize pending guest tasks
  // (write task_result / idempotent auto-refund on fail).
  async scheduled(
    _event: unknown,
    env: Record<string, unknown>,
    ctx: { waitUntil: (p: Promise<unknown>) => void }
  ): Promise<void> {
    await ensureCloudflareEnv();
    const secret =
      (typeof env?.CRON_SECRET === 'string' && env.CRON_SECRET) ||
      (typeof process !== 'undefined' ? process.env.CRON_SECRET : '') ||
      '';
    const appUrl =
      (typeof env?.VITE_APP_URL === 'string' && env.VITE_APP_URL) ||
      (typeof env?.APP_URL === 'string' && env.APP_URL) ||
      'https://markup-image-edit.chatgpt-plus.workers.dev';
    if (!secret) {
      console.error('[cron] CRON_SECRET missing — skip sweep');
      return;
    }
    ctx.waitUntil(
      fetch(`${appUrl}/api/guest/cron/sweep`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      })
        .then(async (r) => {
          const body = await r.text();
          console.log('[cron] sweep', r.status, body.slice(0, 500));
        })
        .catch((e) => console.error('[cron] sweep failed', e))
    );
  },

  async fetch(
    req: Request,
    _env?: unknown,
    ctx?: { waitUntil: (p: Promise<unknown>) => void }
  ): Promise<Response> {
    await ensureCloudflareEnv();
    const hostRedirect = canonicalHostRedirect(req);
    if (hostRedirect) return hostRedirect;
    const probe = probeNotFound(req);
    if (probe) return probe;

    const reqUrl = new URL(req.url);
    const media = await serveRangedMedia(req, reqUrl);
    if (media) return media;
    const cache = isCacheablePageRequest(req, reqUrl) ? edgeCache() : null;
    const cacheKey = cache ? edgeCacheKey(req, reqUrl) : null;
    let response: Response | undefined;

    if (cache && cacheKey) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const headers = new Headers(hit.headers);
        headers.set(
          'Cache-Control',
          headers.get('x-origin-cache-control') || 'private, max-age=0'
        );
        headers.delete('x-origin-cache-control');
        headers.set('x-edge-cache', 'HIT');
        const body = req.method === 'HEAD' ? null : hit.body;
        response = new Response(body, { status: hit.status, headers });
      }
    }

    if (!response) {
      response = await renderSsr(req);
      const cl = response.headers.get('content-length');
      const emptyBody = response.status === 200 && cl === '0';
      if (
        cache &&
        cacheKey &&
        req.method === 'GET' &&
        !emptyBody &&
        (response.status === 200 ||
          response.status === 301 ||
          response.status === 302 ||
          response.status === 307 ||
          response.status === 308) &&
        !response.headers.has('set-cookie') &&
        (response.status !== 200 ||
          /text\/html|xml|text\/plain/.test(
            response.headers.get('content-type') || ''
          ))
      ) {
        const copy = response.clone();
        const headers = new Headers(copy.headers);
        headers.set(
          'x-origin-cache-control',
          copy.headers.get('cache-control') || 'private, max-age=0'
        );
        headers.set(
          'Cache-Control',
          `public, max-age=${EDGE_CACHED_FILES.has(reqUrl.pathname) ? 3600 : EDGE_HTML_TTL}`
        );
        const put = cache
          .put(cacheKey, new Response(copy.body, { status: copy.status, headers }))
          .catch(() => {});
        if (ctx?.waitUntil) ctx.waitUntil(put);
        else await put;
        response = new Response(response.body, response);
        response.headers.set('x-edge-cache', 'MISS');
      } else {
        response = new Response(response.body, response);
      }
    }

    return appendAttributionCookies(req, response);
  },
};
