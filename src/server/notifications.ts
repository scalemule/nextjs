/**
 * Notification Proxy Routes
 *
 * Drop-in route handlers for Next.js App Router that proxy notification
 * requests to the ScaleMule gateway. Follows the same pattern as createPushRoutes().
 *
 * @example
 * ```ts
 * // app/api/notifications/[...action]/route.ts
 * import { createNotificationRoutes } from '@scalemule/nextjs/server'
 *
 * export const { GET, PATCH, DELETE } = createNotificationRoutes({
 *   apiKey: process.env.SCALEMULE_API_KEY!,
 *   gatewayUrl: process.env.SCALEMULE_API_URL!,
 * })
 * ```
 */

import { getSessionFromRequest } from './cookies'
import { extractClientContext, buildClientContextHeaders } from './context'

// ============================================================================
// Types
// ============================================================================

export interface NotificationRoutesConfig {
  /** Server-side secret API key */
  apiKey: string
  /** Gateway URL (e.g., https://api.scalemule.com) */
  gatewayUrl: string
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

// ============================================================================
// createNotificationRoutes
// ============================================================================

export function createNotificationRoutes(config: NotificationRoutesConfig): {
  GET: RouteHandler
  PATCH: RouteHandler
  DELETE: RouteHandler
} {
  const { apiKey, gatewayUrl } = config

  async function proxyToGateway(
    request: Request,
    method: string,
    subPath: string
  ): Promise<Response> {
    const targetUrl = `${gatewayUrl}/v1/notifications/${subPath}`

    const headers: Record<string, string> = {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    }

    // Forward session token
    const session = getSessionFromRequest(request)
    if (session?.sessionToken) {
      headers['Authorization'] = `Bearer ${session.sessionToken}`
    }

    // Forward client context headers
    const clientContext = extractClientContext(
      request as unknown as { headers: { get(name: string): string | null } }
    )
    const contextHeaders = buildClientContextHeaders(clientContext)
    Object.assign(headers, contextHeaders)

    // Forward workspace header
    const workspaceId = request.headers.get('x-sm-workspace-id')
    if (workspaceId) {
      headers['x-sm-workspace-id'] = workspaceId
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    }

    // Forward body for PATCH requests
    if (method === 'PATCH') {
      try {
        const body = await request.text()
        if (body) {
          fetchOptions.body = body
        }
      } catch {
        // No body — that's fine for PATCH /read-all
      }
    }

    // Forward query string for GET requests
    let targetUrlWithQuery = targetUrl
    if (method === 'GET') {
      const url = new URL(request.url)
      if (url.search) {
        targetUrlWithQuery = `${targetUrl}${url.search}`
      }
    }

    const response = await fetch(targetUrlWithQuery, fetchOptions)
    const responseBody = await response.text()

    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Route: GET /api/notifications/[...action]
  const GET: RouteHandler = async (request, context) => {
    const params = await context.params
    const subPath = params.action?.join('/') || ''
    return proxyToGateway(request, 'GET', subPath)
  }

  // Route: PATCH /api/notifications/[...action]
  const PATCH: RouteHandler = async (request, context) => {
    const params = await context.params
    const subPath = params.action?.join('/') || ''
    return proxyToGateway(request, 'PATCH', subPath)
  }

  // Route: DELETE /api/notifications/[...action]
  const DELETE: RouteHandler = async (request, context) => {
    const params = await context.params
    const subPath = params.action?.join('/') || ''
    return proxyToGateway(request, 'DELETE', subPath)
  }

  return { GET, PATCH, DELETE }
}
