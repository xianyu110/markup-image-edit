import { createFileRoute, redirect } from '@tanstack/react-router';

/** Legacy /create → editor */
export const Route = createFileRoute('/create')({
  beforeLoad: () => {
    throw redirect({ href: '/#editor', statusCode: 301 });
  },
});
