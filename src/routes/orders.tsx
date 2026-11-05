import { createFileRoute, redirect } from '@tanstack/react-router';

/** Orders / credits live under account settings for Markup Image Edit. */
export const Route = createFileRoute('/orders')({
  beforeLoad: () => {
    throw redirect({ href: '/settings/credits', statusCode: 302 });
  },
});
