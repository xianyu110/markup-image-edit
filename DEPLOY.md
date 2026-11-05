# Deployment checklist

This document intentionally contains no account ids, database ids, private emails, webhook infrastructure, or secret values.

## Prepare

- Create your own Cloudflare Worker and D1 database.
- Replace the database id and URL placeholders in `wrangler.jsonc`.
- Keep `.env`, `.env.production`, `.dev.vars`, `.wrangler`, and `.output` out of Git.
- Run `pnpm db:generate`, then apply migrations to your own D1 database.
- Set secrets by name with `wrangler secret put`: `AUTH_SECRET`, `TRYALLAPI_API_KEY`, and the Stripe variables documented in `README.md`.
- Configure your own Stripe webhook for `/api/payment/notify/stripe`.
- Build and deploy with `pnpm cf:deploy`.

## Verify

- Confirm `/`, `/pricing`, `/privacy-policy`, and `/terms-of-service` return HTTP 200.
- Sign in and verify a real image edit with a small test image.
- Check credit deduction and automatic refund behavior.
- Exercise Stripe with Stripe's test mode before accepting live payments.
