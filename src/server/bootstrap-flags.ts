/**
 * Server-side flag bootstrapping for Next.js layouts.
 *
 * Evaluates feature flags on the server during SSR so the client
 * has correct values on first render -- no loading flash, no race condition.
 *
 * @example
 * ```ts
 * // app/layout.tsx
 * import { getBootstrapFlags } from '@scalemule/nextjs/server'
 *
 * export default async function RootLayout({ children }) {
 *   const bootstrapFlags = await getBootstrapFlags(['analytics.tracking_enabled'])
 *   return (
 *     <Providers bootstrapFlags={bootstrapFlags}>
 *       {children}
 *     </Providers>
 *   )
 * }
 * ```
 */

import { headers } from 'next/headers'
import { createServerClient } from './client'

// Cache the server client across requests in the same process
let _serverClient: ReturnType<typeof createServerClient> | null = null

function getClient() {
  if (!_serverClient) {
    _serverClient = createServerClient()
  }
  return _serverClient
}

/**
 * Evaluate feature flags server-side for bootstrapping the client provider.
 *
 * Extracts the client IP from request headers (x-forwarded-for, x-real-ip)
 * and passes it as ip_address in the evaluation context so IP-based targeting
 * rules work correctly.
 *
 * Returns a Record that can be passed directly to ScaleMuleProvider's
 * bootstrapFlags prop.
 *
 * @param flagKeys - Array of flag keys to evaluate
 * @param environment - Environment name (default: 'prod')
 * @param extraContext - Additional context attributes to include
 */
export async function getBootstrapFlags(
  flagKeys: string[],
  environment: string = 'prod',
  extraContext: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  try {
    const hdrs = await headers()

    // Extract client IP from standard headers set by load balancers/proxies
    const forwardedFor = hdrs.get('x-forwarded-for')
    const realIp = hdrs.get('x-real-ip') || hdrs.get('x-real-client-ip')
    const clientIp = realIp || (forwardedFor ? forwardedFor.split(',')[0].trim() : undefined)

    const context: Record<string, unknown> = {
      ...extraContext,
    }
    if (clientIp) {
      context.ip_address = clientIp
    }

    const result = await getClient().flags.evaluateBatch(flagKeys, context, environment)
    return result || {}
  } catch {
    // Fail-open: return empty object so the client falls back to defaults
    return {}
  }
}
