/**
 * Ready-Made API Route Handlers
 *
 * Drop-in route handlers for Next.js App Router.
 * Just import and re-export - no custom code needed.
 *
 * @example
 * ```ts
 * // app/api/auth/[...scalemule]/route.ts
 * import { createAuthRoutes } from '@scalemule/nextjs/server'
 *
 * const handlers = createAuthRoutes()
 * export const { GET, POST, DELETE } = handlers
 * ```
 */

import { type NextRequest } from 'next/server'
import { createServerClient, type ServerConfig } from './client'
import { extractClientContext } from './context'
import {
  withSession,
  withRefreshedSession,
  clearSession,
  getSession,
  requireSession,
  type SessionCookieOptions,
} from './cookies'
import { validateCSRFToken } from './csrf'

// ============================================================================
// Types
// ============================================================================

export interface AuthRoutesConfig {
  /** Server client config (optional if using env vars) */
  client?: Partial<ServerConfig>
  /** Cookie options */
  cookies?: SessionCookieOptions
  /** Enable CSRF validation on state-changing requests (POST/DELETE/PATCH) */
  csrf?: boolean
  /** Callbacks */
  onLogin?: (user: { id: string; email: string }) => void | Promise<void>
  onLogout?: () => void | Promise<void>
  onRegister?: (user: { id: string; email: string }) => void | Promise<void>
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ scalemule?: string[] }> }
) => Promise<Response>

// ============================================================================
// Error Response Helper
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
// Route Factory
// ============================================================================

/**
 * Create authentication API route handlers
 *
 * Creates handlers for all auth operations that can be mounted at a catch-all route.
 *
 * @example
 * ```ts
 * // app/api/auth/[...scalemule]/route.ts
 * import { createAuthRoutes } from '@scalemule/nextjs/server'
 *
 * const handlers = createAuthRoutes({
 *   cookies: { domain: '.yourdomain.com' },
 *   onLogin: (user) => console.log('User logged in:', user.email),
 * })
 *
 * export const { GET, POST, DELETE } = handlers
 * ```
 *
 * This creates the following endpoints:
 * - POST /api/auth/register - Register new user
 * - POST /api/auth/login - Login
 * - POST /api/auth/logout - Logout
 * - GET  /api/auth/me - Get current user
 * - POST /api/auth/forgot-password - Request password reset
 * - POST /api/auth/reset-password - Reset password with token
 * - POST /api/auth/verify-email - Verify email
 */
export function createAuthRoutes(config: AuthRoutesConfig = {}): {
  GET: RouteHandler
  POST: RouteHandler
  DELETE: RouteHandler
  PATCH: RouteHandler
} {
  const sm = createServerClient(config.client)
  const cookieOptions = config.cookies || {}

  // POST handler for most auth operations
  const POST: RouteHandler = async (request, context) => {
    // CSRF validation on state-changing requests
    if (config.csrf) {
      const csrfError = validateCSRFToken(request as NextRequest)
      if (csrfError) {
        return errorResponse('CSRF_ERROR', 'CSRF validation failed', 403)
      }
    }

    const params = await context?.params
    const path = params?.scalemule?.join('/') || ''

    try {
      const body = await request.json().catch(() => ({}))

      switch (path) {
        // ==================== Register ====================
        case 'register': {
          const { email, password, full_name, username, phone } = body

          if (!email || !password) {
            return errorResponse('VALIDATION_ERROR', 'Email and password required', 400)
          }

          const result = await sm.auth.register({ email, password, full_name, username, phone })

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'REGISTER_FAILED',
              result.error?.message || 'Registration failed',
              400
            )
          }

          if (config.onRegister && result.data) {
            await config.onRegister({ id: result.data.id, email: result.data.email })
          }

          return successResponse({ user: result.data, message: 'Registration successful' }, 201)
        }

        // ==================== Login ====================
        case 'login': {
          const { email, password, remember_me } = body

          if (!email || !password) {
            return errorResponse('VALIDATION_ERROR', 'Email and password required', 400)
          }

          const result = await sm.auth.login({ email, password, remember_me })

          if (!result.success || !result.data) {
            const errorCode = result.error?.code || 'LOGIN_FAILED'
            let status = 400
            if (errorCode === 'INVALID_CREDENTIALS' || errorCode === 'UNAUTHORIZED') status = 401
            if (['EMAIL_NOT_VERIFIED', 'PHONE_NOT_VERIFIED', 'ACCOUNT_LOCKED', 'ACCOUNT_DISABLED', 'MFA_REQUIRED'].includes(errorCode)) {
              status = 403
            }
            return errorResponse(
              errorCode,
              result.error?.message || 'Login failed',
              status
            )
          }

          if (config.onLogin) {
            await config.onLogin({
              id: result.data.user.id,
              email: result.data.user.email,
            })
          }

          // Return user with HTTP-only session cookie (no token in response!)
          return withSession(result.data, { user: result.data.user }, cookieOptions)
        }

        // ==================== Logout ====================
        case 'logout': {
          const session = await getSession()

          if (session) {
            await sm.auth.logout(session.sessionToken)
          }

          if (config.onLogout) {
            await config.onLogout()
          }

          return clearSession({ message: 'Logged out successfully' }, cookieOptions)
        }

        // ==================== Forgot Password ====================
        case 'forgot-password': {
          const { email } = body

          if (!email) {
            return errorResponse('VALIDATION_ERROR', 'Email required', 400)
          }

          const result = await sm.auth.forgotPassword(email)

          // Always return success to prevent email enumeration
          return successResponse({ message: 'If an account exists, a reset email has been sent' })
        }

        // ==================== Reset Password ====================
        case 'reset-password': {
          const { token, new_password } = body

          if (!token || !new_password) {
            return errorResponse('VALIDATION_ERROR', 'Token and new password required', 400)
          }

          const result = await sm.auth.resetPassword(token, new_password)

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'RESET_FAILED',
              result.error?.message || 'Password reset failed',
              400
            )
          }

          return successResponse({ message: 'Password reset successful' })
        }

        // ==================== Verify Email ====================
        case 'verify-email': {
          const { token } = body

          if (!token) {
            return errorResponse('VALIDATION_ERROR', 'Token required', 400)
          }

          const result = await sm.auth.verifyEmail(token)

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'VERIFY_FAILED',
              result.error?.message || 'Email verification failed',
              400
            )
          }

          return successResponse({ message: 'Email verified successfully' })
        }

        // ==================== Resend Verification ====================
        // Supports both authenticated (session-based) and unauthenticated (email-based) resend
        case 'resend-verification': {
          const { email } = body
          const session = await getSession()

          if (email) {
            // Email-based resend (no session required — e.g., post-registration)
            const result = await sm.auth.resendVerification(email)
            if (!result.success) {
              return errorResponse(
                result.error?.code || 'RESEND_FAILED',
                result.error?.message || 'Failed to resend verification',
                result.error?.code === 'RATE_LIMITED' ? 429 : 400
              )
            }
            return successResponse({ message: 'Verification email sent' })
          }

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Email or session required', 401)
          }

          const result = await sm.auth.resendVerification(session.sessionToken)
          if (!result.success) {
            return errorResponse(
              result.error?.code || 'RESEND_FAILED',
              result.error?.message || 'Failed to resend verification',
              400
            )
          }

          return successResponse({ message: 'Verification email sent' })
        }

        // ==================== Refresh Session ====================
        case 'refresh': {
          const session = await getSession()

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
          }

          const result = await sm.auth.refresh(session.sessionToken)

          if (!result.success || !result.data) {
            return clearSession(
              { message: 'Session expired' },
              cookieOptions
            )
          }

          return withRefreshedSession(
            result.data.session_token,
            session.userId,
            { message: 'Session refreshed' },
            cookieOptions
          )
        }

        // ==================== Change Password ====================
        case 'change-password': {
          const session = await getSession()

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
          }

          const { current_password, new_password } = body

          if (!current_password || !new_password) {
            return errorResponse('VALIDATION_ERROR', 'Current and new password required', 400)
          }

          const result = await sm.user.changePassword(
            session.sessionToken,
            current_password,
            new_password
          )

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'CHANGE_FAILED',
              result.error?.message || 'Failed to change password',
              400
            )
          }

          return successResponse({ message: 'Password changed successfully' })
        }

        default:
          return errorResponse('NOT_FOUND', `Unknown endpoint: ${path}`, 404)
      }
    } catch (err) {
      console.error('[ScaleMule Auth] Error:', err)
      return errorResponse('SERVER_ERROR', 'Internal server error', 500)
    }
  }

  // GET handler for fetching data
  const GET: RouteHandler = async (request, context) => {
    const params = await context?.params
    const path = params?.scalemule?.join('/') || ''

    try {
      switch (path) {
        // ==================== Get Current User ====================
        case 'me': {
          const session = await getSession()

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
          }

          const result = await sm.auth.me(session.sessionToken)

          if (!result.success || !result.data) {
            // Session invalid, clear cookies
            return clearSession(
              { error: { code: 'SESSION_EXPIRED', message: 'Session expired' } },
              cookieOptions
            )
          }

          return successResponse({ user: result.data })
        }

        // ==================== Get Session Status ====================
        case 'session': {
          const session = await getSession()
          return successResponse({
            authenticated: !!session,
            userId: session?.userId || null,
          })
        }

        default:
          return errorResponse('NOT_FOUND', `Unknown endpoint: ${path}`, 404)
      }
    } catch (err) {
      console.error('[ScaleMule Auth] Error:', err)
      return errorResponse('SERVER_ERROR', 'Internal server error', 500)
    }
  }

  // DELETE handler
  const DELETE: RouteHandler = async (request, context) => {
    const params = await context?.params
    const path = params?.scalemule?.join('/') || ''

    try {
      switch (path) {
        // ==================== Delete Account ====================
        case 'me':
        case 'account': {
          const session = await getSession()

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
          }

          const body = await request.json().catch(() => ({}))
          const { password } = body

          if (!password) {
            return errorResponse('VALIDATION_ERROR', 'Password required', 400)
          }

          const result = await sm.user.deleteAccount(session.sessionToken, password)

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'DELETE_FAILED',
              result.error?.message || 'Failed to delete account',
              400
            )
          }

          return clearSession({ message: 'Account deleted successfully' }, cookieOptions)
        }

        default:
          return errorResponse('NOT_FOUND', `Unknown endpoint: ${path}`, 404)
      }
    } catch (err) {
      console.error('[ScaleMule Auth] Error:', err)
      return errorResponse('SERVER_ERROR', 'Internal server error', 500)
    }
  }

  // PATCH handler for updates
  const PATCH: RouteHandler = async (request, context) => {
    const params = await context?.params
    const path = params?.scalemule?.join('/') || ''

    try {
      switch (path) {
        // ==================== Update Profile ====================
        case 'me':
        case 'profile': {
          const session = await getSession()

          if (!session) {
            return errorResponse('UNAUTHORIZED', 'Authentication required', 401)
          }

          const body = await request.json().catch(() => ({}))
          const { full_name, avatar_url } = body

          const result = await sm.user.update(session.sessionToken, { full_name, avatar_url })

          if (!result.success || !result.data) {
            return errorResponse(
              result.error?.code || 'UPDATE_FAILED',
              result.error?.message || 'Failed to update profile',
              400
            )
          }

          return successResponse({ user: result.data })
        }

        default:
          return errorResponse('NOT_FOUND', `Unknown endpoint: ${path}`, 404)
      }
    } catch (err) {
      console.error('[ScaleMule Auth] Error:', err)
      return errorResponse('SERVER_ERROR', 'Internal server error', 500)
    }
  }

  return { GET, POST, DELETE, PATCH }
}

// ============================================================================
// Analytics Route Factory
// ============================================================================

export interface AnalyticsRoutesConfig {
  /** Server client config (optional if using env vars) */
  client?: Partial<ServerConfig>
  /** Called after each event is tracked */
  onEvent?: (event: { event_name: string; session_id?: string }) => void | Promise<void>
  /**
   * When true, this is a simple proxy endpoint that handles events directly
   * without path routing. Use for endpoints like /api/t/e.
   * Default: false (uses catch-all route pattern)
   */
  simpleProxy?: boolean
}

/**
 * Create analytics API route handlers
 *
 * Creates handlers for analytics tracking that can be mounted at a route.
 * AUTOMATICALLY extracts and forwards the real client IP to ScaleMule.
 *
 * @example
 * ```ts
 * // app/api/analytics/[...path]/route.ts (or /api/t/[...path]/route.ts to avoid ad-blockers)
 * import { createAnalyticsRoutes } from '@scalemule/nextjs/server'
 *
 * const handlers = createAnalyticsRoutes()
 * export const { POST } = handlers
 * ```
 *
 * This creates the following endpoints:
 * - POST /api/analytics/event - Track a single event
 * - POST /api/analytics/events - Track a single event (alias)
 * - POST /api/analytics/batch - Track multiple events
 * - POST /api/analytics/page-view - Track a page view
 *
 * Client-side usage:
 * ```ts
 * // Track event
 * fetch('/api/analytics/event', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     event_name: 'button_clicked',
 *     properties: { button_id: 'signup' }
 *   })
 * })
 * ```
 */
export function createAnalyticsRoutes(config: AnalyticsRoutesConfig = {}): {
  POST: RouteHandler
} {
  const sm = createServerClient(config.client)

  /**
   * Handle tracking a single event
   * Extracts all analytics fields and forwards to ScaleMule
   */
  const handleTrackEvent = async (
    body: Record<string, unknown>,
    clientContext: { ip?: string; userAgent?: string }
  ): Promise<Response> => {
    const {
      event_name,
      event_category,
      properties,
      user_id,
      session_id,
      anonymous_id,
      session_duration_seconds,
      page_url,
      page_title,
      referrer,
      landing_page,
      device_type,
      device_brand,
      device_model,
      browser,
      browser_version,
      os,
      os_version,
      screen_resolution,
      viewport_size,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      client_timestamp,
      timestamp, // Legacy field
    } = body as Record<string, string | number | object | undefined>

    if (!event_name) {
      return errorResponse('VALIDATION_ERROR', 'event_name is required', 400)
    }

    const result = await sm.analytics.trackEvent(
      {
        event_name: event_name as string,
        event_category: event_category as string | undefined,
        properties: properties as Record<string, unknown> | undefined,
        user_id: user_id as string | undefined,
        session_id: session_id as string | undefined,
        anonymous_id: anonymous_id as string | undefined,
        session_duration_seconds: session_duration_seconds as number | undefined,
        page_url: page_url as string | undefined,
        page_title: page_title as string | undefined,
        referrer: referrer as string | undefined,
        landing_page: landing_page as string | undefined,
        device_type: device_type as string | undefined,
        device_brand: device_brand as string | undefined,
        device_model: device_model as string | undefined,
        browser: browser as string | undefined,
        browser_version: browser_version as string | undefined,
        os: os as string | undefined,
        os_version: os_version as string | undefined,
        screen_resolution: screen_resolution as string | undefined,
        viewport_size: viewport_size as string | undefined,
        utm_source: utm_source as string | undefined,
        utm_medium: utm_medium as string | undefined,
        utm_campaign: utm_campaign as string | undefined,
        utm_term: utm_term as string | undefined,
        utm_content: utm_content as string | undefined,
        client_timestamp: (client_timestamp || timestamp) as string | undefined,
      },
      { clientContext }
    )

    if (!result.success) {
      return errorResponse(
        result.error?.code || 'TRACK_FAILED',
        result.error?.message || 'Failed to track event',
        400
      )
    }

    if (config.onEvent) {
      await config.onEvent({ event_name: event_name as string, session_id: result.data?.session_id })
    }

    return successResponse({ tracked: result.data?.tracked || 1, session_id: result.data?.session_id })
  }

  const POST: RouteHandler = async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}))

      // CRITICAL: Extract real client IP from request headers
      // This ensures ScaleMule records the actual end user's IP, not the server's IP
      const clientContext = extractClientContext(request as unknown as { headers: { get(name: string): string | null } })

      // For simple proxy mode (e.g., /api/t/e), always handle as single event
      // Skip params access — static routes in Next.js 16+ resolve params to undefined
      if (config.simpleProxy) {
        return handleTrackEvent(body, clientContext)
      }

      // Null-safe params access for catch-all routes (e.g., /api/t/[...scalemule])
      const params = await context?.params
      const path = params?.scalemule?.join('/') || ''

      switch (path) {
        // ==================== Track Single Event ====================
        case 'event':
        case 'events':
        case '': {
          return handleTrackEvent(body, clientContext)
        }

        // ==================== Track Batch Events ====================
        case 'batch': {
          const { events } = body

          if (!Array.isArray(events) || events.length === 0) {
            return errorResponse('VALIDATION_ERROR', 'events array is required', 400)
          }

          if (events.length > 100) {
            return errorResponse('VALIDATION_ERROR', 'Maximum 100 events per batch', 400)
          }

          const result = await sm.analytics.trackBatch(events, { clientContext })

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'BATCH_FAILED',
              result.error?.message || 'Failed to track events',
              400
            )
          }

          return successResponse({ tracked: result.data?.tracked || events.length })
        }

        // ==================== Track Page View ====================
        case 'page-view':
        case 'pageview': {
          const { page_url, page_title, referrer, session_id, user_id } = body

          if (!page_url) {
            return errorResponse('VALIDATION_ERROR', 'page_url is required', 400)
          }

          const result = await sm.analytics.trackPageView(
            { page_url, page_title, referrer, session_id, user_id },
            { clientContext }
          )

          if (!result.success) {
            return errorResponse(
              result.error?.code || 'TRACK_FAILED',
              result.error?.message || 'Failed to track page view',
              400
            )
          }

          if (config.onEvent) {
            await config.onEvent({ event_name: 'page_viewed', session_id: result.data?.session_id })
          }

          return successResponse({ tracked: result.data?.tracked || 1, session_id: result.data?.session_id })
        }

        default:
          return errorResponse('NOT_FOUND', `Unknown endpoint: ${path}`, 404)
      }
    } catch (err) {
      console.error('[ScaleMule Analytics] Error:', err)
      // Return success to not break client - analytics should never fail the app
      return successResponse({ tracked: 0 })
    }
  }

  return { POST }
}
