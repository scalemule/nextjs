/**
 * Newsletter Proxy Routes
 *
 * Drop-in App Router handlers that forward newsletter sign-ups, confirmations,
 * unsubscribes and preference changes to scalemule-newsletters with the
 * READER's evidence (IP, browser, device fingerprint, referrer) and session,
 * so the consent ledger records the person who subscribed, not your server.
 * Your secret API key never reaches the browser.
 *
 * @example
 * ```ts
 * // app/api/newsletters/[...action]/route.ts
 * import { createNewsletterRoutes } from '@scalemule/nextjs/server'
 *
 * export const { GET, POST, PUT } = createNewsletterRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 * })
 * ```
 *
 * Browser calls then go to `/api/newsletters/lists/{slug}/subscriptions`,
 * `/api/newsletters/subscriptions/confirm`, `/api/newsletters/unsubscribe`,
 * `/api/newsletters/preferences?token=…` and `/api/newsletters/me/subscriptions`.
 */

import { getSessionFromRequest } from './cookies'
import { extractClientContext, buildClientContextHeaders, type ClientContextOptions } from './context'

export interface NewsletterRoutesConfig {
  /** Server-side secret API key */
  apiKey: string
  /** Gateway URL (e.g., https://api.scalemule.com) */
  gatewayUrl: string
  /** How to read the reader's IP behind your proxy/CDN (see extractClientContext). */
  clientContext?: ClientContextOptions
  /**
   * Reject state-changing requests whose Origin is another site (default
   * true). Sign-ups must come from your own pages.
   */
  requireSameOrigin?: boolean
}

type RouteHandler = (request: Request, context: { params: Promise<{ action?: string[] }> }) => Promise<Response>

const MAX_BODY_BYTES = 16 * 1024
const SLUG = /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/

/** The gateway sub-path for an allowed (method, action) pair, or null. */
export function newsletterRoute(method: string, action: string[]): string | null {
  const path = action.join('/')
  switch (method) {
    case 'GET':
      return ['lists', 'preferences', 'me/subscriptions'].includes(path) ? path : null
    case 'PUT':
      return ['preferences', 'me/subscriptions'].includes(path) ? path : null
    case 'POST':
      if (path === 'subscriptions/confirm' || path === 'unsubscribe') return path
      if (action.length === 3 && action[0] === 'lists' && action[2] === 'subscriptions' && SLUG.test(action[1])) {
        return `lists/${action[1]}/subscriptions`
      }
      return null
    default:
      return null
  }
}

function json(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // non-browser or same-origin navigation without Origin
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

export function createNewsletterRoutes(config: NewsletterRoutesConfig): {
  GET: RouteHandler
  POST: RouteHandler
  PUT: RouteHandler
} {
  const { apiKey, gatewayUrl } = config
  const requireSameOrigin = config.requireSameOrigin ?? true

  async function forward(request: Request, method: 'GET' | 'POST' | 'PUT', action: string[]): Promise<Response> {
    const route = newsletterRoute(method, action)
    if (!route) return json(404, 'NOT_FOUND', 'Not found')
    if (method !== 'GET' && requireSameOrigin && !sameOrigin(request)) {
      return json(403, 'FORBIDDEN', 'Cross-site newsletter requests are not allowed')
    }

    const headers: Record<string, string> = { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
    const session = getSessionFromRequest(request)
    if (session?.sessionToken) headers['Authorization'] = `Bearer ${session.sessionToken}`
    Object.assign(
      headers,
      buildClientContextHeaders(
        extractClientContext(request as unknown as { headers: { get(name: string): string | null } }, config.clientContext)
      )
    )

    const init: RequestInit = { method, headers }
    if (method !== 'GET') {
      const body = await request.text()
      if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
        return json(413, 'PAYLOAD_TOO_LARGE', 'Request body too large')
      }
      if (body) init.body = body
    }
    const search = new URL(request.url).search
    const response = await fetch(`${gatewayUrl}/v1/newsletters/${route}${search}`, init)
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  const handler =
    (method: 'GET' | 'POST' | 'PUT'): RouteHandler =>
    async (request, context) => {
      const params = await context.params
      return forward(request, method, params.action ?? [])
    }

  return { GET: handler('GET'), POST: handler('POST'), PUT: handler('PUT') }
}
