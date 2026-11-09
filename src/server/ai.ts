/**
 * AI Facade Proxy Routes — `@scalemule/nextjs/server/ai`
 *
 * A fail-closed, user-delegated proxy for the ScaleMule AI facade (`/v1/ai`).
 * The browser never sees the server API key: the route attaches it together
 * with the signed-in user's session, and the gateway runs the operation as
 * that member within the configured account.
 *
 * @example
 * ```ts
 * // app/api/ai/[...action]/route.ts
 * import { createAiRoutes } from '@scalemule/nextjs/server/ai'
 *
 * export const { GET, POST } = createAiRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 *   accountId: process.env.SCALEMULE_ACCOUNT_ID!,
 * })
 * ```
 *
 * Browser side, point `@scalemule/ai` at the route:
 * ```ts
 * const ai = createAi({
 *   transport: createFetchTransport({
 *     baseUrl: window.location.origin,
 *     headers: () => ({ 'x-csrf-token': readCsrfCookie() }),
 *   }),
 *   basePath: '/api/ai',
 * })
 * ```
 *
 * Rules (ADR-2026-11-08 D4/D7):
 *  - no session cookie → 401, nothing is forwarded
 *  - only `runs`, `runs/{id}`, `runs/{id}/events`, `runs/{id}/cancel`
 *  - the account comes from server config, never from the browser
 *  - forwarded from the browser: body, `x-idempotency-key`, `last-event-id`
 *  - never forwarded: `Origin`, `x-sm-workspace-id`, `x-requested-account-id`,
 *    any `x-app-*` / `x-sm-*` / internal header
 */

import { ScaleMuleAi, createFetchTransport } from '@scalemule/ai'
import type { AiTransport } from '@scalemule/ai'
import { validateCSRFToken } from './csrf'
import { getSessionFromRequest } from './cookies'
import type { SessionData } from './cookies'
import { extractClientContext, buildClientContextHeaders } from './context'

// ============================================================================
// Types
// ============================================================================

export type AiAccountResolver = (
  request: Request,
  session: SessionData
) => string | null | undefined | Promise<string | null | undefined>

export interface AiRoutesConfig {
  /** Server-side secret API key. Never shipped to the browser. */
  apiKey: string
  /** Gateway URL (e.g. https://api.scalemule.com) */
  gatewayUrl: string
  /**
   * Account the signed-in user's runs belong to: a fixed id, or a resolver
   * from the request and session (for multi-account apps). The gateway
   * verifies the user's membership. Omit only when the API key is itself
   * account-bound (workspace-site key).
   */
  accountId?: string | AiAccountResolver
  /** Enable CSRF validation on POST (default: true) */
  csrf?: boolean
  /** Custom fetch (tests). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const MAX_BODY_BYTES = 1_048_576
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,200}$/

// ============================================================================
// Helpers
// ============================================================================

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

type Target =
  | { kind: 'create' }
  | { kind: 'get'; runId: string }
  | { kind: 'events'; runId: string }
  | { kind: 'cancel'; runId: string }

/** Allow-list the proxied surface. Anything else is a 404, never forwarded. */
export function resolveAiTarget(method: string, segments: string[]): Target | null {
  if (segments[0] !== 'runs') return null
  if (segments.length === 1) return method === 'POST' ? { kind: 'create' } : null
  const runId = segments[1]
  if (!runId || !RUN_ID.test(runId)) return null
  if (segments.length === 2) return method === 'GET' ? { kind: 'get', runId } : null
  if (segments.length === 3 && segments[2] === 'events' && method === 'GET') return { kind: 'events', runId }
  if (segments.length === 3 && segments[2] === 'cancel' && method === 'POST') return { kind: 'cancel', runId }
  return null
}

/**
 * `validateCSRFToken` expects a NextRequest (`request.cookies`). Route handlers
 * get one in production; tests and edge shims may pass a plain Request, so
 * read the cookie header directly in that case.
 */
function csrfRequestView(request: Request): import('next/server').NextRequest {
  const maybe = request as unknown as { cookies?: { get(name: string): { value: string } | undefined } }
  if (maybe.cookies && typeof maybe.cookies.get === 'function') {
    return request as unknown as import('next/server').NextRequest
  }
  const jar = new Map<string, string>()
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name) jar.set(name, decodeURIComponent(rest.join('=')))
  }
  return {
    headers: request.headers,
    cookies: { get: (name: string) => (jar.has(name) ? { value: jar.get(name) as string } : undefined) },
  } as unknown as import('next/server').NextRequest
}

async function resolveAccount(
  config: AiRoutesConfig,
  request: Request,
  session: SessionData
): Promise<string | null> {
  if (typeof config.accountId === 'function') {
    const value = await config.accountId(request, session)
    return value ? String(value) : null
  }
  return config.accountId ?? null
}

// ============================================================================
// createAiRoutes
// ============================================================================

export function createAiRoutes(config: AiRoutesConfig): { GET: RouteHandler; POST: RouteHandler } {
  const { apiKey, gatewayUrl, csrf = true } = config
  const fetcher = config.fetch ?? globalThis.fetch
  if (!apiKey) throw new Error('createAiRoutes: apiKey is required')
  if (!gatewayUrl) throw new Error('createAiRoutes: gatewayUrl is required')
  const base = gatewayUrl.replace(/\/+$/, '')

  async function proxy(request: Request, method: 'GET' | 'POST', segments: string[]): Promise<Response> {
    const target = resolveAiTarget(method, segments)
    if (!target) return errorResponse('NOT_FOUND', 'Unknown AI route', 404)

    // Fail closed: the facade is user-delegated. No session, no call.
    const session = getSessionFromRequest(request)
    if (!session?.sessionToken) {
      return errorResponse('SESSION_REQUIRED', 'Sign in to use AI features', 401)
    }

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      authorization: `Bearer ${session.sessionToken}`,
      accept: target.kind === 'events' ? 'text/event-stream' : 'application/json',
    }
    // IP / user-agent for trust scoring; this helper never copies Origin.
    Object.assign(
      headers,
      buildClientContextHeaders(
        extractClientContext(request as unknown as { headers: { get(name: string): string | null } })
      )
    )
    const accountId = await resolveAccount(config, request, session)
    if (accountId) headers['x-requested-account-id'] = accountId

    let path: string
    const init: RequestInit = { method, headers, redirect: 'error', signal: request.signal }
    switch (target.kind) {
      case 'create': {
        const key = request.headers.get('x-idempotency-key')?.trim() ?? ''
        if (!IDEMPOTENCY_KEY.test(key)) {
          return errorResponse(
            'IDEMPOTENCY_KEY_REQUIRED',
            'Send an x-idempotency-key header generated before the first attempt',
            400
          )
        }
        headers['x-idempotency-key'] = key
        const body = await request.text()
        if (body.length > MAX_BODY_BYTES) return errorResponse('INPUT_INVALID', 'Request body too large', 413)
        if (!body) return errorResponse('INPUT_INVALID', 'A JSON body is required', 400)
        headers['content-type'] = 'application/json'
        init.body = body
        path = '/v1/ai/runs'
        break
      }
      case 'get':
        path = `/v1/ai/runs/${encodeURIComponent(target.runId)}`
        break
      case 'cancel':
        path = `/v1/ai/runs/${encodeURIComponent(target.runId)}/cancel`
        break
      case 'events': {
        const lastEventId = request.headers.get('last-event-id')?.trim()
        if (lastEventId && /^\d{1,10}$/.test(lastEventId)) headers['last-event-id'] = lastEventId
        const after = new URL(request.url).searchParams.get('after')
        path = `/v1/ai/runs/${encodeURIComponent(target.runId)}/events${after && /^\d{1,10}$/.test(after) ? `?after=${after}` : ''}`
        break
      }
    }

    let upstream: Response
    try {
      upstream = await fetcher(`${base}${path}`, init)
    } catch (error) {
      if (request.signal?.aborted) return new Response(null, { status: 499 })
      return errorResponse('UPSTREAM_UNAVAILABLE', `AI facade unreachable: ${String(error)}`, 502)
    }

    if (target.kind === 'events' && upstream.ok && upstream.body) {
      return new Response(upstream.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // JSON passthrough: the gateway envelope already carries code/message/ref.
    const text = await upstream.text()
    const responseHeaders: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    }
    const requestId = upstream.headers.get('x-request-id')
    if (requestId) responseHeaders['x-request-id'] = requestId
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) responseHeaders['Retry-After'] = retryAfter
    return new Response(text, { status: upstream.status, headers: responseHeaders })
  }

  async function segmentsOf(context: { params: Promise<{ action?: string[] }> }): Promise<string[]> {
    const params = await context?.params
    return params?.action ?? []
  }

  const GET: RouteHandler = async (request, context) => {
    try {
      return await proxy(request, 'GET', await segmentsOf(context))
    } catch (error) {
      return errorResponse('INTERNAL_ERROR', String(error), 500)
    }
  }

  const POST: RouteHandler = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(csrfRequestView(request))
      if (csrfError) return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
    }
    try {
      return await proxy(request, 'POST', await segmentsOf(context))
    } catch (error) {
      return errorResponse('INTERNAL_ERROR', String(error), 500)
    }
  }

  return { GET, POST }
}

// ============================================================================
// createServiceAiClient — server-only, service mode
// ============================================================================

export interface ServiceAiClientConfig {
  /** Server-side secret API key (service mode; account-bound keys need no accountId). */
  apiKey: string
  /** Gateway URL */
  gatewayUrl: string
  /** Account the runs belong to (sent as x-requested-account-id). */
  accountId?: string
  /** Custom fetch (tests). */
  fetch?: typeof fetch
  /** Custom transport (overrides gatewayUrl/fetch). */
  transport?: AiTransport
}

/**
 * A `ScaleMuleAi` for server code (route handlers, server actions, jobs).
 * Runs execute in service mode under the key's application and account.
 * Never construct this where the key could reach a browser bundle.
 */
export function createServiceAiClient(config: ServiceAiClientConfig): ScaleMuleAi {
  if (!config.apiKey) throw new Error('createServiceAiClient: apiKey is required')
  const transport =
    config.transport ??
    createFetchTransport({
      baseUrl: config.gatewayUrl,
      fetch: config.fetch,
      headers: () => ({ 'x-api-key': config.apiKey }),
    })
  return new ScaleMuleAi({ transport, accountId: config.accountId })
}

export type { ScaleMuleAi } from '@scalemule/ai'
