/**
 * Server-side flag bootstrapping for Next.js layouts.
 *
 * Evaluates feature flags on the server during SSR so the client
 * has correct values on first render -- no loading flash, no race condition.
 *
 * Results are cached in-memory with a configurable TTL (default: 60s) to
 * prevent excessive API calls. Since feature flags change infrequently,
 * a short cache window is fine and avoids hammering the flags service on
 * every page render.
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

// In-memory flag evaluation cache
// Keyed by sorted flag keys + environment, stores result + timestamp
interface CacheEntry {
  result: Record<string, unknown>
  timestamp: number
}

const _flagCache = new Map<string, CacheEntry>()

// Default cache TTL: 60 seconds. Flag values rarely change, and this prevents
// the evaluate/batch endpoint from being called on every single SSR render.
const DEFAULT_CACHE_TTL_MS = 60_000

/**
 * Evaluate feature flags server-side for bootstrapping the client provider.
 *
 * Extracts the client IP from request headers (x-forwarded-for, x-real-ip)
 * and passes it as ip_address in the evaluation context so IP-based targeting
 * rules work correctly.
 *
 * Results are cached in-memory for `cacheTtlMs` milliseconds (default: 60s).
 * Pass `cacheTtlMs: 0` to disable caching.
 *
 * Returns a Record that can be passed directly to ScaleMuleProvider's
 * bootstrapFlags prop.
 *
 * @param flagKeys - Array of flag keys to evaluate
 * @param environment - Environment name (default: 'prod')
 * @param extraContext - Additional context attributes to include
 * @param cacheTtlMs - Cache TTL in milliseconds (default: 60000). Set to 0 to disable.
 */
export async function getBootstrapFlags(
  flagKeys: string[],
  environment: string = 'prod',
  extraContext: Record<string, unknown> = {},
  cacheTtlMs: number = DEFAULT_CACHE_TTL_MS,
): Promise<Record<string, unknown>> {
  try {
    // Build cache key from sorted flag keys + environment
    const cacheKey = [...flagKeys].sort().join('|') + ':' + environment

    // Check cache first (skip if caching disabled)
    if (cacheTtlMs > 0) {
      const cached = _flagCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
        return cached.result
      }
    }

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
    const flagResult = result || {}

    // Store in cache
    if (cacheTtlMs > 0) {
      _flagCache.set(cacheKey, { result: flagResult, timestamp: Date.now() })

      // Evict stale entries to prevent unbounded growth (keep at most 100)
      if (_flagCache.size > 100) {
        const now = Date.now()
        for (const [key, entry] of _flagCache) {
          if (now - entry.timestamp > cacheTtlMs) {
            _flagCache.delete(key)
          }
        }
      }
    }

    return flagResult
  } catch {
    // Fail-open: return empty object so the client falls back to defaults
    return {}
  }
}
