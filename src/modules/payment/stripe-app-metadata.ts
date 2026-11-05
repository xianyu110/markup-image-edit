/** Optional application id included in Stripe Checkout metadata. */
import { serverEnv } from '@/lib/server-env';

export function getStripeAppMetadata(): string {
  const fromEnv =
    serverEnv('STRIPE_APP_METADATA') ||
    (typeof process !== 'undefined' ? process.env.STRIPE_APP_METADATA : '') ||
    '';
  return String(fromEnv || '').trim();
}
