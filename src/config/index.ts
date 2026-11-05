import { serverEnv } from '@/lib/server-env';

export const AUTH_SECRET_PLACEHOLDER =
  'replace-with-a-long-random-secret';

// Isomorphic env access:
// - Public (client-visible) vars are VITE_-prefixed and read from
//   import.meta.env (statically injected into the client bundle by Vite).
// - Server-only vars (secrets) are read lazily via serverEnv() so Cloudflare
//   Worker bindings (wrangler secrets) resolve even when process.env was empty
//   at module evaluation time.
const metaEnv: Record<string, string | undefined> =
  (import.meta as any).env ?? {};
const procEnv: Record<string, string | undefined> =
  typeof process !== 'undefined' && process.env ? process.env : {};

const publicEnv = (key: string) => metaEnv[key] ?? procEnv[key];

function secret(key: string, fallback = ''): string {
  // Avoid pulling Worker secrets into the client bundle — serverEnv reads
  // process.env / __CF_ENV__ which are empty in the browser.
  if (typeof window !== 'undefined') return '';
  return serverEnv(key) || fallback;
}

export const envConfigs: Record<string, string> = {
  // App (public)
  app_url: publicEnv('VITE_APP_URL') ?? 'http://localhost:3000',
  app_name: publicEnv('VITE_APP_NAME') ?? 'Markup Image Edit',
  app_description: publicEnv('VITE_APP_DESCRIPTION') ?? 'Circle the part of an image you want changed, type what to change, and get a precise AI edit.',
  app_logo: publicEnv('VITE_APP_LOGO') ?? '/logo.svg',

  // Analytics (public)
  google_analytics_id: publicEnv('VITE_GOOGLE_ANALYTICS_ID') ?? '',

  // Database
  database_url: secret('DATABASE_URL'),
  database_auth_token: secret('DATABASE_AUTH_TOKEN'),
  database_provider: secret('DATABASE_PROVIDER') || procEnv.DATABASE_PROVIDER || 'sqlite',
  db_schema: secret('DB_SCHEMA') || 'public',
  db_singleton_enabled: secret('DB_SINGLETON_ENABLED') || 'false',
  db_max_connections: secret('DB_MAX_CONNECTIONS') || '1',

  // Auth
  auth_url: secret('AUTH_URL') || publicEnv('VITE_APP_URL') || '',
  get auth_secret() { return secret('AUTH_SECRET'); },

  // Payment - Stripe
  get stripe_secret_key() { return secret('STRIPE_SECRET_KEY'); },
  get stripe_publishable_key() { return secret('STRIPE_PUBLISHABLE_KEY'); },
  get stripe_signing_secret() { return secret('STRIPE_SIGNING_SECRET'); },

  // Payment - PayPal
  get paypal_client_id() { return secret('PAYPAL_CLIENT_ID'); },
  get paypal_client_secret() { return secret('PAYPAL_CLIENT_SECRET'); },
  get paypal_webhook_id() { return secret('PAYPAL_WEBHOOK_ID'); },
  paypal_environment: secret('PAYPAL_ENVIRONMENT') || 'production',

  // Payment - Alipay
  get alipay_app_id() { return secret('ALIPAY_APP_ID'); },
  get alipay_private_key() { return secret('ALIPAY_PRIVATE_KEY'); },
  get alipay_public_key() { return secret('ALIPAY_PUBLIC_KEY'); },
  alipay_notify_url: secret('ALIPAY_NOTIFY_URL'),

  // Payment - WeChat Pay
  get wechat_app_id() { return secret('WECHAT_APP_ID'); },
  get wechat_mch_id() { return secret('WECHAT_MCH_ID'); },
  get wechat_api_v3_key() { return secret('WECHAT_API_V3_KEY'); },
  get wechat_private_key() { return secret('WECHAT_PRIVATE_KEY'); },
  get wechat_serial_no() { return secret('WECHAT_SERIAL_NO'); },
  wechat_notify_url: secret('WECHAT_NOTIFY_URL'),
  get wechat_platform_cert() { return secret('WECHAT_PLATFORM_CERT'); },

  // Email - Resend
  get resend_api_key() { return secret('RESEND_API_KEY'); },
  get resend_sender_email() {
    return secret('RESEND_SENDER_EMAIL') || secret('RESEND_EMAIL_FROM');
  },

  // Storage - S3/R2
  storage_endpoint: secret('STORAGE_ENDPOINT'),
  storage_region: secret('STORAGE_REGION') || 'auto',
  get storage_access_key() { return secret('STORAGE_ACCESS_KEY'); },
  get storage_secret_key() { return secret('STORAGE_SECRET_KEY'); },
  storage_bucket: secret('STORAGE_BUCKET'),
  storage_public_domain: secret('STORAGE_PUBLIC_DOMAIN'),
  inline_image_max_kb: secret('INLINE_IMAGE_MAX_KB') || '2048',

  // Image editing through TryAllAPI (server-only).
  get tryallapi_api_key() { return secret('TRYALLAPI_API_KEY'); },

  // Locale (public)
  locale: publicEnv('VITE_DEFAULT_LOCALE') ?? 'en',
};
