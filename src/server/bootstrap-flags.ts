/**
 * Server-side flag bootstrapping for Next.js layouts.
 *
 * Uses @scalemule/sdk FlagClient for local evaluation — ZERO API calls per SSR render.
 * Falls back to legacy evaluateBatch API call if FlagClient init fails.
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
import { FlagClient } from '@scalemule/sdk/flags/server'
import { createServerClient } from './client'

// ============================================================================
// FlagClient pool — one per environment:gatewayUrl combo
// ============================================================================

const _clients = new Map<string, FlagClient>()
const _initPromises = new Map<string, Promise<FlagClient>>()

// Legacy server client for fallback
let _serverClient: ReturnType<typeof createServerClient> | null = null

function getServerClient() {
  if (!_serverClient) {
    _serverClient = createServerClient()
  }
  return _serverClient
}

type ScaleMuleEnvironment = 'dev' | 'prod'

const GATEWAY_URLS: Record<ScaleMuleEnvironment, string> = {
  dev: 'https://api-dev.scalemule.com',
  prod: 'https://api.scalemule.com',
}

function resolveGatewayUrl(): string {
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL
  const env = (process.env.SCALEMULE_ENV || 'prod') as ScaleMuleEnvironment
  return GATEWAY_URLS[env] || GATEWAY_URLS.prod
}

async function getFlagClient(environment: string): Promise<FlagClient> {
  const apiKey = process.env.SCALEMULE_API_KEY!
  const gatewayUrl = resolveGatewayUrl()
  const key = `${environment}:${gatewayUrl}`

  const existing = _clients.get(key)
  if (existing) return existing

  const pending = _initPromises.get(key)
  if (pending) return pending

  const promise = (async () => {
    const client = new FlagClient({ apiKey, environment, gatewayUrl })
    // Race init against a 3s timeout to avoid blocking SSR/liveness probes
    await Promise.race([
      client.init(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FlagClient init timeout')), 3000)
      ),
    ])
    _clients.set(key, client)
    return client
  })()
  _initPromises.set(key, promise)

  try {
    return await promise
  } catch (e) {
    _initPromises.delete(key)
    throw e
  }
}

// ============================================================================
// Graceful shutdown
// ============================================================================

let _shutdownRegistered = false

function ensureShutdownHook(): void {
  if (_shutdownRegistered) return
  _shutdownRegistered = true
  // Guard for Edge Runtime where process.once is unavailable
  if (typeof process !== 'undefined' && typeof process.once === 'function') {
    process.once('SIGTERM', async () => {
      const shutdowns = Array.from(_clients.values()).map((c) => c.shutdown())
      await Promise.allSettled(shutdowns)
    })
  }
}

// ============================================================================
// IP extraction helper
// ============================================================================

function extractClientIp(hdrs: Awaited<ReturnType<typeof headers>>): string | undefined {
  const realIp = hdrs.get('x-real-ip') || hdrs.get('x-real-client-ip')
  const forwardedFor = hdrs.get('x-forwarded-for')
  return realIp || (forwardedFor ? forwardedFor.split(',')[0].trim() : undefined)
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Evaluate feature flags server-side for bootstrapping the client provider.
 *
 * Uses local evaluation via FlagClient (zero network calls per render).
 * Falls back to legacy API if FlagClient is unavailable.
 *
 * @param flagKeys - Array of flag keys to evaluate
 * @param environment - Environment name (default: 'prod')
 * @param extraContext - Additional context attributes to include
 * @param cacheTtlMs - Deprecated (ignored). FlagClient handles caching internally.
 */
export async function getBootstrapFlags(
  flagKeys: string[],
  environment: string = 'prod',
  extraContext: Record<string, unknown> = {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cacheTtlMs: number = 0,
): Promise<Record<string, unknown>> {
  try {
    const client = await getFlagClient(environment)
    ensureShutdownHook()

    const hdrs = await headers()
    const clientIp = extractClientIp(hdrs)
    const context = { ...extraContext } as Record<string, unknown>
    if (clientIp) context.ip_address = clientIp

    return client.evaluateBatch(flagKeys, context)
  } catch {
    // FlagClient init failed — fall back to legacy API call
    try {
      const hdrs = await headers()
      const clientIp = extractClientIp(hdrs)
      const context: Record<string, unknown> = { ...extraContext }
      if (clientIp) context.ip_address = clientIp

      const result = await getServerClient().flags.evaluateBatch(flagKeys, context, environment)
      return result || {}
    } catch {
      // Both paths failed — fail-open with empty object
      return {}
    }
  }
}
