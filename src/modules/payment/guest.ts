import { eq } from 'drizzle-orm';

import { envConfigs } from '@/config';
import { session as sessionTable, user as userTable } from '@/config/db/schema';
import { db } from '@/core/db';
import {
  isFunnelUtmMarker,
  sanitizeUtmValue,
} from '@/modules/payment/attribution';
import { getUuid } from '@/lib/hash';

const GUEST_EMAIL_DOMAIN = 'markup-image-edit.local';

export function isGuestPlaceholderEmail(
  email: string | null | undefined
): boolean {
  if (!email) return true;
  return (
    email.endsWith(`@${GUEST_EMAIL_DOMAIN}`) &&
    (email.startsWith('guest_') || email.startsWith('temp-'))
  );
}

async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${sigB64}`);
}

export async function findOrCreateGuestUser(params?: {
  email?: string | null;
  name?: string;
  /** First-touch utm_source from landing cookie — never a checkout marker. */
  utmSource?: string | null;
  ip?: string | null;
  locale?: string | null;
}): Promise<{ id: string; email: string; created: boolean }> {
  const emailRaw = (params?.email || '').trim().toLowerCase();
  const email =
    emailRaw && emailRaw.includes('@')
      ? emailRaw
      : `guest_${getUuid().replace(/-/g, '')}@${GUEST_EMAIL_DOMAIN}`;

  // Never persist funnel markers as the marketing channel.
  const rawUtm = sanitizeUtmValue(params?.utmSource || '');
  const utmSource = isFunnelUtmMarker(rawUtm) ? '' : rawUtm;
  const ip = (params?.ip || '').slice(0, 100);
  const locale = (params?.locale || '').replace(/[^\w-]/g, '').slice(0, 10);

  const [existing] = await db()
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (
      utmSource &&
      (!existing.utmSource || existing.utmSource === 'checkout')
    ) {
      patch.utmSource = utmSource;
    }
    if (ip && !existing.ip) patch.ip = ip;
    if (locale && !existing.locale) patch.locale = locale;
    if (Object.keys(patch).length) {
      await db()
        .update(userTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(userTable.id, existing.id));
    }
    return { id: existing.id, email: existing.email, created: false };
  }

  const id = getUuid();
  const now = new Date();
  await db()
    .insert(userTable)
    .values({
      id,
      name: params?.name || 'Guest',
      email,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
      utmSource,
      ip,
      locale,
    });

  return { id, email, created: true };
}

/** Real customer email suitable for orders/notifiers; null if missing/placeholder. */
export function normalizePaidEmail(
  email: string | null | undefined
): string | null {
  const next = (email || '').trim().toLowerCase();
  if (!next || !next.includes('@')) return null;
  if (isGuestPlaceholderEmail(next)) return null;
  return next;
}

/**
 * Replace guest_…@guest.markup-image-edit.local (or temp-) on bb_user with Stripe-collected email.
 * Returns the real email when it was applied (or already present), else null.
 */
export async function updateGuestEmailIfNeeded(
  userId: string,
  currentEmail: string | null | undefined,
  paidEmail: string | null | undefined
): Promise<string | null> {
  const next = normalizePaidEmail(paidEmail);
  if (!next) return null;

  // Prefer live user row over order.userEmail (may lag / stay placeholder).
  let liveEmail = currentEmail;
  try {
    const [row] = await db()
      .select({ email: userTable.email })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    if (row?.email) liveEmail = row.email;
  } catch {
    // fall through with currentEmail
  }

  if (!isGuestPlaceholderEmail(liveEmail)) {
    return normalizePaidEmail(liveEmail) || next;
  }
  if (next === (liveEmail || '').toLowerCase()) return next;

  const [taken] = await db()
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, next))
    .limit(1);
  if (taken && taken.id !== userId) return null;

  await db()
    .update(userTable)
    .set({ email: next, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
  return next;
}

/**
 * Create a better-auth-compatible session row and return a signed Set-Cookie
 * header value so the browser can call authenticated credit/generate APIs.
 */
export async function createGuestSessionCookie(params: {
  userId: string;
  request?: Request;
}): Promise<{ token: string; setCookie: string }> {
  const token = getUuid().replace(/-/g, '') + getUuid().replace(/-/g, '');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const id = getUuid();

  const ip =
    params.request?.headers.get('cf-connecting-ip') ||
    params.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '';
  const userAgent = params.request?.headers.get('user-agent') || '';

  await db()
    .insert(sessionTable)
    .values({
      id,
      token,
      userId: params.userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
      ipAddress: ip.slice(0, 100),
      userAgent: userAgent.slice(0, 500),
    });

  const secret = envConfigs.auth_secret;
  if (!secret) {
    throw new Error('AUTH_SECRET is required to mint guest sessions');
  }

  const signed = await signCookieValue(token, secret);
  const cookieName = '__Secure-better-auth.session_token';
  // Derive Domain from app URL / request host — never hardcode markup-image-edit.local
  // on hosted deployments.
  let cookieDomain = '';
  try {
    const base =
      params.request?.url ||
      envConfigs.app_url ||
      envConfigs.auth_url ||
      '';
    if (base) {
      const host = new URL(base).hostname.toLowerCase();
      if (host && host !== 'localhost' && !host.endsWith('.workers.dev')) {
        const parts = host.split('.');
        cookieDomain =
          parts.length >= 2 ? `.${parts.slice(-2).join('.')}` : `.${host}`;
        // A custom domain are both 2-label;
        // www.x → .x via slice(-2).
      }
    }
  } catch {
    cookieDomain = '';
  }
  const domainPart = cookieDomain ? `; Domain=${cookieDomain}` : '';
  const setCookie = `${cookieName}=${signed}; Max-Age=${7 * 24 * 60 * 60}; Path=/${domainPart}; HttpOnly; Secure; SameSite=Lax`;

  return { token, setCookie };
}
