/**
 * Push Notification Proxy Routes
 *
 * Drop-in route handlers for Next.js App Router that proxy the browser push
 * hook (`usePushNotifications`) to the ScaleMule gateway.
 *
 * @example
 * ```ts
 * // app/api/push/[...action]/route.ts
 * import { createPushRoutes } from '@scalemule/nextjs/server'
 *
 * export const { GET, POST, PUT, DELETE } = createPushRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 *   // Needed only for push sign-up before sign-in (anonymous tokens):
 *   publishableKey: process.env.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY,
 * })
 * ```
 *
 * Rules (since 0.1.73):
 *  - Only these operations are proxied; anything else is a 404 and is never
 *    forwarded. The upstream path is built from the validated route, never
 *    from the browser URL:
 *      GET    settings/me                       (anonymous allowed)
 *      POST   register                          (anonymous allowed)
 *      DELETE tokens/by-id/{id}                 (anonymous allowed)
 *      PUT    tokens/by-id/{id}/user            (session required)
 *      DELETE tokens/by-id/{id}/user            (session required)
 *      PUT    tokens/by-id/{id}/notifications   (session required)
 *      GET    preferences, PUT preferences      (session required)
 *  - Sending, broadcasts, topics, campaigns, routing and settings writes are
 *    app-level operations: call them from your own server code, never
 *    through this browser-facing route.
 *  - The secret `apiKey` is sent only together with the signed-in user's
 *    session. Signed-out requests to the anonymous operations use the
 *    publishable key (`publishableKey` or
 *    `NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY`); without one they get 401.
 *  - POST/PUT/DELETE must be same-origin (Fetch Metadata / Origin) and pass
 *    the double-submit CSRF check (`x-csrf-token` header equals the
 *    `sm_csrf` cookie).
 */

import { validateCSRFToken } from './csrf'
import { getSessionFromRequest } from './cookies'
import { extractClientContext, buildClientContextHeaders } from './context'
import { isSameOriginRequest } from './browser-proxy'
import { isSafePathSegment } from './path-safety'

// ============================================================================
// Types
// ============================================================================

export interface PushRoutesConfig {
  /** Server-side secret API key. Sent only with a signed-in user's session. */
  apiKey: string
  /** Gateway URL (e.g., https://api.scalemule.com) */
  gatewayUrl: string
  /**
   * Publishable key (`sm_pb_…`) used for signed-out push sign-up (settings,
   * register, unregister). Defaults to `NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY`.
   * Without one, signed-out requests are refused with 401.
   */
  publishableKey?: string
  /** Enable CSRF validation on POST/PUT/DELETE (default: true) */
  csrf?: boolean
  /** Custom fetch (tests). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

type PushMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface PushTarget {
  /** Upstream path below `/v1/communication/push/`, already encoded. */
  path: string
  /** Whether a signed-out caller may use this operation. */
  anonymous: boolean
}

// Push token ids are UUIDs (the communication service parses them as such).
const TOKEN_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const MAX_BODY_BYTES = 64 * 1024

// ============================================================================
// Helpers
// ============================================================================

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  )
}

function successResponse<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  )
}

/**
 * Allow-list of proxied push operations. Returns null for anything else.
 * Exported for tests and for apps that want to share the same rules.
 */
export function resolvePushTarget(method: string, segments: unknown): PushTarget | null {
  if (!Array.isArray(segments) || segments.length === 0 || segments.length > 4) return null
  if (!segments.every(isSafePathSegment)) return null
  const s = segments as string[]
  const key = `${method} ${s.join('/')}`

  if (key === 'GET settings/me') return { path: 'settings/me', anonymous: true }
  if (key === 'POST register') return { path: 'register', anonymous: true }
  if (key === 'GET preferences' || key === 'PUT preferences') return { path: 'preferences', anonymous: false }

  if (s[0] === 'tokens' && s[1] === 'by-id' && s.length >= 3 && TOKEN_ID.test(s[2])) {
    const id = encodeURIComponent(s[2])
    if (s.length === 3 && method === 'DELETE') return { path: `tokens/by-id/${id}`, anonymous: true }
    if (s.length === 4 && s[3] === 'user' && (method === 'PUT' || method === 'DELETE')) {
      return { path: `tokens/by-id/${id}/user`, anonymous: false }
    }
    if (s.length === 4 && s[3] === 'notifications' && method === 'PUT') {
      return { path: `tokens/by-id/${id}/notifications`, anonymous: false }
    }
  }
  return null
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

function defaultPublishableKey(): string | undefined {
  return typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY : undefined
}

// ============================================================================
// createPushRoutes
// ============================================================================

export function createPushRoutes(config: PushRoutesConfig): {
  GET: RouteHandler
  POST: RouteHandler
  PUT: RouteHandler
  DELETE: RouteHandler
} {
  const { apiKey, gatewayUrl, csrf = true } = config
  const doFetch = config.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args))
  const gateway = gatewayUrl.replace(/\/+$/, '')

  async function handle(
    request: Request,
    method: PushMethod,
    context: { params: Promise<{ action?: string[] }> }
  ): Promise<Response> {
    let segments: unknown
    try {
      segments = (await context?.params)?.action
    } catch {
      return errorResponse('NOT_FOUND', 'Not found', 404)
    }
    const target = resolvePushTarget(method, segments)
    if (!target) return errorResponse('NOT_FOUND', 'Not found', 404)

    if (method !== 'GET') {
      if (!isSameOriginRequest(request)) {
        return errorResponse('CSRF_ERROR', 'Cross-site request refused', 403)
      }
      if (csrf) {
        const csrfError = validateCSRFToken(request)
        if (csrfError) return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
      }
    }

    const headers: Record<string, string> = {}
    const session = getSessionFromRequest(request)
    if (session?.sessionToken) {
      // Signed in: the secret key acts only together with the user's session,
      // which the gateway validates (an invalid session is a 401 upstream).
      headers['x-api-key'] = apiKey
      headers['Authorization'] = `Bearer ${session.sessionToken}`
    } else {
      if (!target.anonymous) return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
      const publishableKey = config.publishableKey ?? defaultPublishableKey()
      if (!publishableKey || !publishableKey.startsWith('sm_pb_')) {
        return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
      }
      headers['x-api-key'] = publishableKey
      const origin = request.headers.get('origin')
      if (origin) headers['origin'] = origin
    }

    // Forward client context headers (IP, user-agent) for trust scoring
    Object.assign(
      headers,
      buildClientContextHeaders(
        extractClientContext(request as unknown as { headers: { get(name: string): string | null } })
      )
    )

    const init: RequestInit = { method, headers, redirect: 'manual', cache: 'no-store' }
    if (method === 'POST' || method === 'PUT') {
      const declared = Number(request.headers.get('content-length') ?? '0')
      if (declared > MAX_BODY_BYTES) return errorResponse('PAYLOAD_TOO_LARGE', 'Request body too large', 413)
      const body = await readCappedBody(request, MAX_BODY_BYTES)
      if (body === null) return errorResponse('PAYLOAD_TOO_LARGE', 'Request body too large', 413)
      if (body) {
        headers['Content-Type'] = 'application/json'
        init.body = body
      }
    }

    let response: Response
    try {
      response = await doFetch(`${gateway}/v1/communication/push/${target.path}`, init)
    } catch {
      return errorResponse('UPSTREAM_UNAVAILABLE', 'Push service unavailable', 502)
    }

    if (response.status >= 300 && response.status < 400) {
      return errorResponse('UPSTREAM_REDIRECT', 'Unexpected upstream redirect', 502)
    }
    if (response.status === 204) return successResponse(null)

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      let json: any
      try {
        json = await response.json()
      } catch {
        return errorResponse('PUSH_ERROR', 'Invalid upstream response', 502)
      }
      if (response.ok) {
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }
      const errMsg = json?.error?.message || json?.message || 'Request failed'
      const errCode = json?.error?.code || json?.code || 'PUSH_ERROR'
      return errorResponse(errCode, errMsg, response.status)
    }

    const text = await response.text()
    if (response.ok) return successResponse(text)
    return errorResponse('PUSH_ERROR', 'Request failed', response.status)
  }

  function wrap(method: PushMethod): RouteHandler {
    return async (request, context) => {
      try {
        return await handle(request, method, context)
      } catch {
        return errorResponse('INTERNAL_ERROR', 'Internal error', 500)
      }
    }
  }

  return { GET: wrap('GET'), POST: wrap('POST'), PUT: wrap('PUT'), DELETE: wrap('DELETE') }
}
