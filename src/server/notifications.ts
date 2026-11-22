/**
 * Notification Proxy Routes
 *
 * Drop-in route handlers for Next.js App Router that proxy the signed-in
 * user's in-app notifications to the ScaleMule gateway.
 *
 * @example
 * ```ts
 * // app/api/notifications/[[...action]]/route.ts
 * import { createNotificationRoutes } from '@scalemule/nextjs/server'
 *
 * export const { GET, PATCH, DELETE } = createNotificationRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 * })
 * ```
 *
 * Rules (since 0.1.73):
 *  - A signed-in session is required for every request; nothing is
 *    forwarded without one. The secret key is only ever sent together with
 *    the user's session, which the gateway validates.
 *  - Only these operations are proxied; anything else is a 404:
 *      GET    (empty path)        list (query: unread_only, kind, since, limit, cursor)
 *      GET    unread-count
 *      PATCH  {id}/read
 *      PATCH  read-all
 *      DELETE {id}
 *  - PATCH/DELETE must be same-origin (Fetch Metadata / Origin).
 */

import { getSessionFromRequest } from './cookies'
import { extractClientContext, buildClientContextHeaders } from './context'
import { isSameOriginRequest } from './browser-proxy'
import { isSafePathSegment } from './path-safety'

// ============================================================================
// Types
// ============================================================================

export interface NotificationRoutesConfig {
  /** Server-side secret API key. Sent only with a signed-in user's session. */
  apiKey: string
  /** Gateway URL (e.g., https://api.scalemule.com) */
  gatewayUrl: string
  /** Custom fetch (tests). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

type NotificationMethod = 'GET' | 'PATCH' | 'DELETE'

// Notification ids are UUIDs (the communication service parses them as such).
const NOTIFICATION_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const LIST_QUERY_PARAMS = ['unread_only', 'kind', 'since', 'limit', 'cursor']
const MAX_BODY_BYTES = 16 * 1024

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

/**
 * Allow-list of proxied notification operations. Returns the encoded
 * upstream path below `/v1/notifications` ('' for the list) or null.
 */
export function resolveNotificationTarget(method: string, segments: unknown): string | null {
  const s = segments === undefined ? [] : segments
  if (!Array.isArray(s) || s.length > 2) return null
  if (!s.every(isSafePathSegment)) return null
  if (method === 'GET') {
    if (s.length === 0) return ''
    if (s.length === 1 && s[0] === 'unread-count') return '/unread-count'
    return null
  }
  if (method === 'PATCH') {
    if (s.length === 1 && s[0] === 'read-all') return '/read-all'
    if (s.length === 2 && s[1] === 'read' && NOTIFICATION_ID.test(s[0])) return `/${encodeURIComponent(s[0])}/read`
    return null
  }
  if (method === 'DELETE') {
    if (s.length === 1 && s[0] !== 'read-all' && s[0] !== 'unread-count' && NOTIFICATION_ID.test(s[0])) {
      return `/${encodeURIComponent(s[0])}`
    }
    return null
  }
  return null
}

function listQuery(requestUrl: string): string {
  const incoming = new URL(requestUrl).searchParams
  const out = new URLSearchParams()
  for (const name of LIST_QUERY_PARAMS) {
    const value = incoming.get(name)
    if (value !== null && value.length <= 256) out.set(name, value)
  }
  const query = out.toString()
  return query ? `?${query}` : ''
}

async function readCappedBody(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const all = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    all.set(c, offset)
    offset += c.byteLength
  }
  return new TextDecoder().decode(all)
}

// ============================================================================
// createNotificationRoutes
// ============================================================================

export function createNotificationRoutes(config: NotificationRoutesConfig): {
  GET: RouteHandler
  PATCH: RouteHandler
  DELETE: RouteHandler
} {
  const { apiKey, gatewayUrl } = config
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const gateway = gatewayUrl.replace(/\/+$/, '')

  async function handle(
    request: Request,
    method: NotificationMethod,
    context: { params: Promise<{ action?: string[] }> }
  ): Promise<Response> {
    let segments: unknown
    try {
      segments = (await context?.params)?.action
    } catch {
      return errorResponse('NOT_FOUND', 'Not found', 404)
    }
    const path = resolveNotificationTarget(method, segments)
    if (path === null) return errorResponse('NOT_FOUND', 'Not found', 404)

    if (method !== 'GET' && !isSameOriginRequest(request)) {
      return errorResponse('CSRF_ERROR', 'Cross-site request refused', 403)
    }

    const session = getSessionFromRequest(request)
    if (!session?.sessionToken) return errorResponse('UNAUTHORIZED', 'Authentication required', 401)

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      Authorization: `Bearer ${session.sessionToken}`,
      'Content-Type': 'application/json',
    }
    Object.assign(
      headers,
      buildClientContextHeaders(
        extractClientContext(request as unknown as { headers: { get(name: string): string | null } })
      )
    )

    const init: RequestInit = { method, headers, redirect: 'manual', cache: 'no-store' }
    if (method === 'PATCH') {
      const body = await readCappedBody(request, MAX_BODY_BYTES)
      if (body === null) return errorResponse('PAYLOAD_TOO_LARGE', 'Request body too large', 413)
      if (body) init.body = body
    }

    const query = method === 'GET' && path === '' ? listQuery(request.url) : ''
    let response: Response
    try {
      response = await doFetch(`${gateway}/v1/notifications${path}${query}`, init)
    } catch {
      return errorResponse('UPSTREAM_UNAVAILABLE', 'Notification service unavailable', 502)
    }
    if (response.status >= 300 && response.status < 400) {
      return errorResponse('UPSTREAM_REDIRECT', 'Unexpected upstream redirect', 502)
    }
    if ([204, 205, 304].includes(response.status)) {
      return new Response(null, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
    }
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  }

  function wrap(method: NotificationMethod): RouteHandler {
    return async (request, context) => {
      try {
        return await handle(request, method, context)
      } catch {
        return errorResponse('INTERNAL_ERROR', 'Internal error', 500)
      }
    }
  }

  return { GET: wrap('GET'), PATCH: wrap('PATCH'), DELETE: wrap('DELETE') }
}
