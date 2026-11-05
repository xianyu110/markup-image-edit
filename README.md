# Markup Image Edit

Circle a region in an image, describe the change, and let GPT Image 2.6 edit that part while preserving the rest. The browser sends the original image and a separate transparent markup PNG to TryAllAPI's image-edit endpoint.

**Live demo:** https://markup-image-edit.chatgpt-plus.workers.dev

## Use it

1. Open the editor and upload a PNG, JPEG, or WebP image.
2. Draw a red circle, outline, or stroke around the area to change.
3. Describe the desired replacement or adjustment. Choose `gpt-image-2.6-flare` for fast edits or `gpt-image-2.6-sunburst` for detailed edits.
4. Submit the edit, inspect the result, and download it when satisfied.

The app validates raster formats, image dimensions, markup dimensions, and file size before making an edit. Failed upstream edits are automatically refunded to the user's credit balance. Only you can determine whether generated content is suitable for your intended use; obtain permission before editing other people's images.

## Stack

- TanStack Start, React, TypeScript, Vite
- Cloudflare Workers and D1
- Drizzle ORM
- Better Auth
- Stripe Checkout for one-time credit packs
- GPT Image 2.6 via TryAllAPI

## Run locally

Requires Node.js and pnpm.

```bash
pnpm install
cp .env.example .env
# Set AUTH_SECRET and TRYALLAPI_API_KEY in .env; never commit this file.
pnpm dev
```

The default local database is SQLite. `TRYALLAPI_API_KEY` is server-only and is required for image edits. Do not expose it through a `VITE_` variable or commit it to Git.

## Cloudflare Workers deployment

1. Create your own D1 database with `pnpm exec wrangler d1 create your-markup-image-edit-db`.
2. Replace `YOUR_D1_DATABASE_ID` in `wrangler.jsonc` with your database id. Set the application URLs and admin email.
3. Generate an initial migration and apply it to your D1 database:

   ```bash
   pnpm db:generate
   pnpm exec wrangler d1 migrations apply your-markup-image-edit-db --remote
   ```

4. Provide your own secrets through Wrangler, without putting their values in source:

   ```bash
   pnpm exec wrangler secret put AUTH_SECRET
   pnpm exec wrangler secret put TRYALLAPI_API_KEY
   pnpm exec wrangler secret put STRIPE_SECRET_KEY
   pnpm exec wrangler secret put STRIPE_PUBLISHABLE_KEY
   pnpm exec wrangler secret put STRIPE_SIGNING_SECRET
   ```

5. Deploy with `pnpm cf:deploy`.

A local `.env.production` can supply build-time values and deployment credentials; it is intentionally ignored by Git. See `DEPLOY.md` for a sanitized deployment checklist.

## Stripe

Use your own Stripe account, signing secret, and webhook endpoint. The app uses dynamic Checkout line items for its credit packs. Configure the webhook to deliver checkout and subscription events to `/api/payment/notify/stripe` on your deployed Worker. Do not commit Stripe keys or use another site's payment infrastructure.

## Image editing implementation

`src/core/ai/image-edit.ts` builds the multipart request and `src/routes/api/edit.ts` handles authentication, validation, credit consumption, task logging, and refunds. There is no video-generation or alternative AI-provider code in this repository.

## License

MIT. Copyright 2026 xianyu110. See `LICENSE`.
