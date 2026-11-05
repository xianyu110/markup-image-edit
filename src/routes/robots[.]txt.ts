import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';

const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Google-Extended',
];

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const disallowCore = [
          'Disallow: /admin',
          'Disallow: /settings',
          'Disallow: /api/',
        ];
        const body = [
          ...AI_BOTS.flatMap((bot) => [
            `User-agent: ${bot}`,
            'Allow: /', ...disallowCore,
            '',
          ]),
          'User-Agent: *',
          'Allow: /', ...disallowCore,
          'Disallow: /*?*',
          '',
          `Sitemap: ${envConfigs.app_url}/sitemap.xml`,
          '',
          `# LLM-readable site guide: ${envConfigs.app_url}/llms.txt`,
          '',
        ].join('\n');
        return new Response(body, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
