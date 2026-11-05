import { createFileRoute, redirect } from '@tanstack/react-router';

/** Legacy /generator → editor on the home page */
export const Route = createFileRoute('/generator')({
  beforeLoad: () => {
    throw redirect({ href: '/#editor', statusCode: 301 });
  },
});
