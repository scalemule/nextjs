/**
 * Push Notification Proxy Routes
 *
 * Drop-in route handlers for Next.js App Router that proxy push notification
 * requests to the ScaleMule gateway. Follows the same pattern as createAuthRoutes().
 *
 * @example
 * ```ts
 * // app/api/push/[...action]/route.ts
 * import { createPushRoutes } from '@scalemule/nextjs/server'
 *
 * export const { GET, POST, PUT, DELETE } = createPushRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 * })
 * ```
 */

import { validateCSRFToken } from './csrf'
import { getSessionFromRequest } from './cookies'
import { extractClientContext, buildClientContextHeaders } from './context'

// ============================================================================
// Types
// ============================================================================

export interface PushRoutesConfig {
  /** Server-side secret API key */
  apiKey: string
  /** Gateway URL (e.g., https://api.scalemule.com) */
  gatewayUrl: string
  /** Enable CSRF validation on POST/PUT/DELETE (default: true) */
  csrf?: boolean
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

// ============================================================================
// Helpers
// ============================================================================

function errorResponse(code: string, message: string, status: number): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
}

function successResponse<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { 'Content-Type': 'application/json' } }
  )
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

  async function proxyToGateway(
    request: Request,
    method: string,
    subPath: string
  ): Promise<Response> {
    // Build target URL
    const targetUrl = `${gatewayUrl}/v1/communication/push/${subPath}`

    // Build headers
    const headers: Record<string, string> = {
      'x-api-key': apiKey,
    }

    // Forward session token if present
    const session = getSessionFromRequest(request)
    if (session?.sessionToken) {
      headers['Authorization'] = `Bearer ${session.sessionToken}`
    }

    // Forward client context headers (IP, user-agent) for trust scoring
    const clientContext = extractClientContext(
      request as unknown as { headers: { get(name: string): string | null } }
    )
    const contextHeaders = buildClientContextHeaders(clientContext)
    Object.assign(headers, contextHeaders)

    // Forward workspace header if present
    const workspaceId = request.headers.get('x-sm-workspace-id')
    if (workspaceId) {
      headers['x-sm-workspace-id'] = workspaceId
    }

    // Forward body for non-GET requests
    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    if (method !== 'GET' && method !== 'DELETE') {
      try {
        const body = await request.text()
        if (body) {
          headers['Content-Type'] = 'application/json'
          fetchOptions.body = body
        }
      } catch {
        // No body
      }
    }

    // Make the proxied request
    const response = await fetch(targetUrl, fetchOptions)

    // Convert 204 No Content to JSON envelope
    if (response.status === 204) {
      return successResponse(null)
    }

    // Forward the response with { success, data } envelope wrapping
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const json = await response.json()
      if (response.ok) {
        // Backend already wraps in { success, data } — forward as-is
        return new Response(JSON.stringify(json), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        })
      } else {
        const errMsg = json?.error?.message || json?.message || 'Request failed'
        const errCode = json?.error?.code || json?.code || 'PUSH_ERROR'
        return errorResponse(errCode, errMsg, response.status)
      }
    }

    // Non-JSON response
    const text = await response.text()
    if (response.ok) {
      return successResponse(text)
    }
    return errorResponse('PUSH_ERROR', text || 'Request failed', response.status)
  }

  function extractSubPath(params: { action?: string[] }): string {
    return (params.action || []).join('/')
  }

  const GET: RouteHandler = async (request, context) => {
    try {
      const params = await context?.params
      const subPath = extractSubPath(params || {})
      return proxyToGateway(request, 'GET', subPath)
    } catch (e) {
      return errorResponse('INTERNAL_ERROR', String(e), 500)
    }
  }

  const POST: RouteHandler = async (request, context) => {
    // CSRF validation on state-changing requests
    if (csrf) {
      const csrfError = validateCSRFToken(request as unknown as import('next/server').NextRequest)
      if (csrfError) {
        return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
      }
    }

    try {
      const params = await context?.params
      const subPath = extractSubPath(params || {})
      return proxyToGateway(request, 'POST', subPath)
    } catch (e) {
      return errorResponse('INTERNAL_ERROR', String(e), 500)
    }
  }

  const PUT: RouteHandler = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(request as unknown as import('next/server').NextRequest)
      if (csrfError) {
        return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
      }
    }

    try {
      const params = await context?.params
      const subPath = extractSubPath(params || {})
      return proxyToGateway(request, 'PUT', subPath)
    } catch (e) {
      return errorResponse('INTERNAL_ERROR', String(e), 500)
    }
  }

  const DELETE: RouteHandler = async (request, context) => {
    if (csrf) {
      const csrfError = validateCSRFToken(request as unknown as import('next/server').NextRequest)
      if (csrfError) {
        return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
      }
    }

    try {
      const params = await context?.params
      const subPath = extractSubPath(params || {})
      return proxyToGateway(request, 'DELETE', subPath)
    } catch (e) {
      return errorResponse('INTERNAL_ERROR', String(e), 500)
    }
  }

  return { GET, POST, PUT, DELETE }
}
