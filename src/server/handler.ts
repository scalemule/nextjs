/**
 * API Route Handler Wrapper
 *
 * Eliminates error handling boilerplate in Next.js API routes.
 * Catches ScaleMuleError, thrown Response objects, and unexpected errors,
 * returning properly formatted JSON responses.
 *
 * @example
 * ```ts
 * import { apiHandler, unwrap, ScaleMuleError } from '@scalemule/nextjs/server'
 *
 * export const POST = apiHandler(async (req, { params, searchParams }) => {
 *   const { phone } = await req.json()
 *   if (!phone) throw new ScaleMuleError('VALIDATION_ERROR', 'Phone required', 400)
 *
 *   const data = unwrap(await sm.auth.sendPhoneOtp({ phone, purpose: 'verify_phone' }))
 *   return { message: 'OTP sent', expires_in_seconds: data.expires_in_seconds }
 * }, { csrf: true })
 * ```
 */

import type { NextRequest } from 'next/server'
import { ScaleMuleError } from './errors'
import { validateCSRFToken } from './csrf'
import { requireSession } from './cookies'
import type { SessionData } from './cookies'

// ============================================================================
// Types
// ============================================================================

export type HandlerContext = {
  /** Resolved route params (e.g., { id: '123' }) */
  params: Record<string, string>
  /** URL search params */
  searchParams: URLSearchParams
  /** Session data (only present when options.auth is true) */
  session?: SessionData
}

type HandlerFn = (
  request: NextRequest,
  context: HandlerContext
) => Promise<Response | Record<string, unknown> | void>

export type HandlerOptions = {
  /** Validate CSRF token before calling handler (default: false) */
  csrf?: boolean
  /** Require authentication before calling handler (default: false) */
  auth?: boolean
  /** Override default error response formatting */
  onError?: (error: ScaleMuleError) => Response | undefined
}

// ============================================================================
// apiHandler
// ============================================================================

/**
 * Wrap a Next.js API route handler with automatic error handling.
 *
 * - Catches `ScaleMuleError` (from `unwrap()` or manual throws) → JSON error response
 * - Catches thrown `Response` objects (from `requireSession()`) → passes through
 * - Catches unexpected errors → 500 JSON response
 * - Optionally validates CSRF tokens and requires authentication
 * - Auto-wraps returned objects in `{ success: true, data }` responses
 *
 * @example
 * ```ts
 * // Simple route
 * export const GET = apiHandler(async (req) => {
 *   const items = unwrap(await sm.data.query('items'))
 *   return { items }
 * })
 *
 * // With CSRF + auth
 * export const DELETE = apiHandler(async (req, { params, session }) => {
 *   const snap = unwrap(await sm.data.get('snaps', params.id))
 *   if (snap.userId !== session!.userId) throw new ScaleMuleError('FORBIDDEN', 'Not yours', 403)
 *   unwrap(await sm.data.delete('snaps', params.id))
 *   return { deleted: true }
 * }, { csrf: true, auth: true })
 * ```
 */
export function apiHandler(handler: HandlerFn, options?: HandlerOptions) {
  return async (
    request: NextRequest,
    routeContext?: { params: Promise<Record<string, string | string[]>> }
  ) => {
    try {
      // CSRF validation
      if (options?.csrf) {
        const csrfError = validateCSRFToken(request)
        if (csrfError) {
          throw new ScaleMuleError('CSRF_ERROR', csrfError, 403)
        }
      }

      // Auth check
      let session: SessionData | undefined
      if (options?.auth) {
        // requireSession() throws a Response if not authenticated
        session = await requireSession()
      }

      // Resolve dynamic route params (Next.js 15+ returns Promise)
      const rawParams = routeContext?.params ? await routeContext.params : {}
      const params: Record<string, string> = {}
      for (const [key, val] of Object.entries(rawParams)) {
        params[key] = Array.isArray(val) ? val.join('/') : val
      }

      const context: HandlerContext = {
        params,
        searchParams: request.nextUrl.searchParams,
        session,
      }

      const result = await handler(request, context)

      // Handler returned a Response — pass through unchanged
      if (result instanceof Response) return result

      // Handler returned a data object — wrap in success envelope
      if (result !== undefined) {
        return Response.json({ success: true, data: result }, { status: 200 })
      }

      // Handler returned void — 204 No Content
      return new Response(null, { status: 204 })

    } catch (error) {
      // ScaleMuleError → formatted JSON error response
      if (error instanceof ScaleMuleError) {
        if (options?.onError) {
          const custom = options.onError(error)
          if (custom) return custom
        }
        return Response.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: error.status }
        )
      }

      // Thrown Response (from requireSession, etc.) — pass through
      if (error instanceof Response) return error

      // Unexpected error — log and return 500
      console.error('Unhandled API error:', error)
      return Response.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500 }
      )
    }
  }
}
