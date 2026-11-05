import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { baseLocale } from '@/paraglide/runtime.js';
import { getLocalPosts, mergePosts } from '@/content/posts';

const STATIC_PAGES: { path: string; title: string; description: string }[] = [
 { path: '', title: 'Home / Editor', description: 'Markup Image Edit — upload an image, circle the area, describe the change; GPT Image 2.6 edits only the marked area. 10 credits per edit.' },
 { path: '/pricing', title: 'Pricing', description: 'One-time credit packs: $6.90 (5 edits) · $9.90 (10) · $16.90 (20) · $22.90 (30) · $49.90 (80). Stripe checkout, no subscription.' },
 { path: '/examples/logo-after.webp', title: 'Example: logo word change', description: 'Real result: BREW → ROAST on a coffee logo, only the circled word changed.' },
 { path: '/examples/bottle-after.webp', title: 'Example: product recolor', description: 'Real result: red bottle → matte cobalt blue, scene unchanged.' },
 { path: '/privacy-policy', title: 'Privacy Policy', description: 'Privacy policy' },
 { path: '/terms-of-service', title: 'Terms of Service', description: 'Terms of service' },
];

export const Route = createFileRoute('/llms-full.txt')({
 server: {
 handlers: {
 GET: async () => {
 const app_url = (envConfigs.app_url || 'https://markup-image-edit.chatgpt-plus.workers.dev').replace(
 /\/$/,
 ''
 );
 const app_name = envConfigs.app_name || 'Markup Image Edit';
 const app_description =
 envConfigs.app_description ||
 'Markup Image Edit — circle an area, describe the change, precise AI image edits.';

 const lines: string[] = [
 `# ${app_name}`,
 '',
 `> ${app_description}`,
 '',
 '## Pages',
 '',...STATIC_PAGES.map(
 (p) => `- [${p.title}](${app_url}${p.path}): ${p.description}`
 ),
 '',
 '## Product facts',
 '',
 '- Site: https://markup-image-edit.chatgpt-plus.workers.dev',
 '- Workflow: upload PNG/JPEG/WebP → draw red circle, lasso or brush marks → type an instruction → before/after slider → PNG download',
 '- Model: OpenAI GPT Image 2.6 (Flare or Sunburst) via the image edits endpoint; marks are sent as a separate transparent markup layer, so only the marked area changes',
 '- Not supported as input: SVG (export to PNG first), GIF',
 '- Price: 10 credits per edit; one-time packs from $6.90 for 50 credits; failed edits are refunded',
 '- Upstream model pricing (OpenAI): text input $5/1M tokens, image input $8/1M, image output $30/1M; Flare and Sunburst same price; no Batch half price',
 ];

 let posts = getLocalPosts(baseLocale);
 try {
 const { listPublishedArticles, findPublishedBySlug } =
 await import('@/modules/posts/service');
 const rows = await listPublishedArticles().catch(() => []);
 const dbPosts = rows.map((row) => ({
 slug: row.slug,
 title: row.title || row.slug,
 description: row.description || '',
 createdAt: new Date(row.createdAt).toISOString(),
 source: 'db' as const,
 }));
 posts = mergePosts(dbPosts, posts);

 if (posts.length > 0) {
 lines.push('', '## Blog Posts', '');
 for (const post of posts) {
 lines.push(`### ${post.title}`, '');
 lines.push(`URL: ${app_url}/blog/${post.slug}`);
 if (post.description)
 lines.push(`Description: ${post.description}`);
 lines.push('');
 if (post.source === 'db') {
 const detail = await findPublishedBySlug(post.slug).catch(
 () => null
 );
 if (detail?.content) {
 lines.push(detail.content, '');
 }
 }
 lines.push('---', '');
 }
 }
 } catch {
 if (posts.length > 0) {
 lines.push('', '## Blog Posts', '');
 for (const post of posts) {
 lines.push(`### ${post.title}`, '');
 lines.push(`URL: ${app_url}/blog/${post.slug}`);
 if (post.description)
 lines.push(`Description: ${post.description}`);
 lines.push('', '---', '');
 }
 }
 }

 lines.push('');

 return new Response(lines.join('\n'), {
 status: 200,
 headers: { 'Content-Type': 'text/plain; charset=utf-8' },
 });
 },
 },
 },
});
