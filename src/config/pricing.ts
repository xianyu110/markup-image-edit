/**
 * Authoritative pricing catalog — Markup Image Edit.
 *
 * Keeps the template's default one-time credit packs (no subscription).
 * Every markup edit costs a fixed CREDITS_PER_EDIT credits; failed edits are
 * refunded automatically. Stripe uses dynamic price_data (no Price IDs).
 */

import { PaymentType } from '@/core/payment/types';

export type PricingPlanInfo = {
  name: string;
  interval: import('@/core/payment/types').PaymentInterval;
  intervalCount: number;
};

export type PricingProduct = {
  productId: string;
  productName: string;
  planName: string;
  description: string;
  type: PaymentType;
  priceInCents: number;
  currency: string;
  credits: number;
  creditsValidDays?: number;
  plan?: PricingPlanInfo;
  resolution?: '480p' | '720p';
};

/** Fixed credits charged per markup edit (any model, any quality). */
export const CREDITS_PER_EDIT = 10;

/** Legacy aliases kept so shared template modules still compile. */
export const CREDITS_720P = CREDITS_PER_EDIT;
export const CREDITS_480P = CREDITS_PER_EDIT;
export const PRICE_720P_USD = 6.9;
export const PRICE_480P_USD = 6.9;

/** Template default packs (prices/credits unchanged), relabelled as edits. */
export const pricingCatalog: Record<string, PricingProduct> = {
  pack_480: {
    productId: 'pack_480',
    productName: 'Starter — 5 edits',
    planName: 'Starter — 5 edits',
    description: '50 credits · 5 markup edits',
    type: PaymentType.ONE_TIME,
    priceInCents: 690,
    currency: 'usd',
    credits: 50,
  },
  pack_1: {
    productId: 'pack_1',
    productName: 'Basic — 10 edits',
    planName: 'Basic — 10 edits',
    description: '100 credits · 10 markup edits',
    type: PaymentType.ONE_TIME,
    priceInCents: 990,
    currency: 'usd',
    credits: 100,
  },
  pack_2: {
    productId: 'pack_2',
    productName: 'Plus — 20 edits',
    planName: 'Plus — 20 edits',
    description: '200 credits · 20 markup edits',
    type: PaymentType.ONE_TIME,
    priceInCents: 1690,
    currency: 'usd',
    credits: 200,
  },
  pack_3: {
    productId: 'pack_3',
    productName: 'Pro — 30 edits',
    planName: 'Pro — 30 edits',
    description: '300 credits · 30 markup edits',
    type: PaymentType.ONE_TIME,
    priceInCents: 2290,
    currency: 'usd',
    credits: 300,
  },
  pack_8: {
    productId: 'pack_8',
    productName: 'Studio — 80 edits',
    planName: 'Studio — 80 edits',
    description: '800 credits · 80 markup edits · best value',
    type: PaymentType.ONE_TIME,
    priceInCents: 4990,
    currency: 'usd',
    credits: 800,
  },
};

export const CHECKOUT_PACK_IDS = new Set(Object.keys(pricingCatalog));

export function getPricingProduct(productId: string): PricingProduct | null {
  if (!productId) return null;
  return pricingCatalog[productId] ?? null;
}

export function listPricingProducts(): PricingProduct[] {
  return Object.values(pricingCatalog);
}

export function formatCreatePrice(_resolution?: '720p' | '480p'): string {
  return `$${PRICE_480P_USD.toFixed(2)}`;
}

/** Number of edits a pack buys. */
export function packVideoCount(productId: string): number {
  const p = pricingCatalog[productId];
  if (!p) return 0;
  return Math.floor(p.credits / CREDITS_PER_EDIT);
}
export const packEditCount = packVideoCount;

export function packUnitPriceUsd(productId: string): number | null {
  const p = pricingCatalog[productId];
  const n = packVideoCount(productId);
  if (!p || n <= 0) return null;
  return p.priceInCents / 100 / n;
}

export function formatPackUnitPrice(productId: string): string {
  const n = packUnitPriceUsd(productId);
  if (n == null) return '';
  return `$${n.toFixed(2)}`;
}

export function defaultPackForResolution(_resolution?: '480p' | '720p'): string {
  return 'pack_480';
}
