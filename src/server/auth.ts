/**
 * Pre-configured auth route handlers for 1-line setup.
 *
 * Usage in your Next.js app:
 * ```ts
 * // app/api/auth/[...scalemule]/route.ts
 * export { GET, POST, DELETE, PATCH } from '@scalemule/nextjs/server/auth'
 * ```
 *
 * Configuration via environment variables:
 * - SCALEMULE_API_KEY — API key (required)
 * - SCALEMULE_GATEWAY_URL — Gateway URL (optional, defaults to prod)
 * - SCALEMULE_COOKIE_DOMAIN — Cookie domain (optional)
 *
 * For custom configuration, use createAuthRoutes() from '@scalemule/nextjs/server' instead.
 */

import { createAuthRoutes } from './routes'

const cookieDomain = typeof process !== 'undefined'
  ? process.env.SCALEMULE_COOKIE_DOMAIN
  : undefined

const handlers = createAuthRoutes({
  cookies: cookieDomain ? { domain: cookieDomain } : undefined,
})

export const { GET, POST, DELETE, PATCH } = handlers
