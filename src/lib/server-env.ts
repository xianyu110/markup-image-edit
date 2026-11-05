/**
 * Read a server-only env var from process.env or Cloudflare Worker bindings.
 * Module-load snapshots of process.env miss wrangler secrets on Workers;
 * bindings land on globalThis.__CF_ENV__ (see src/server.ts).
 */
export function serverEnv(key: string): string {
  const fromProc =
    typeof process !== 'undefined' && process.env ? process.env[key] : undefined;
  if (typeof fromProc === 'string' && fromProc.length > 0) return fromProc;

  const g = globalThis as any;
  const cf = g?.__CF_ENV__ ?? g?.__env__;
  const fromCf = cf?.[key];
  if (typeof fromCf === 'string' && fromCf.length > 0) return fromCf;

  return '';
}
