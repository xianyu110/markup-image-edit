# Markup Image Edit — contributor notes

- This is a Cloudflare Workers application for markup-guided image editing.
- Keep `TRYALLAPI_API_KEY` server-side. Never commit real environment files, account ids, database ids, or credentials.
- The only AI request path is `src/core/ai/image-edit.ts`, called by `src/routes/api/edit.ts`.
- Preserve the separate transparent PNG markup layer. It must have the same dimensions as the source image.
- Preserve authentication, credit consumption, task logging, and automatic refunds when changing the edit route.
- Run `pnpm exec tsc --noEmit` and `pnpm cf:build` before committing changes.
