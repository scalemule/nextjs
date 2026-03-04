/**
 * Cookie Utilities for Secure Session Management
 *
 * Handles HTTP-only secure cookies for authentication.
 * Tokens are never exposed to the browser.
 */

import { cookies } from 'next/headers'
import type { LoginResponse, User } from '../types'

// ============================================================================
// Constants
// ============================================================================

export const SESSION_COOKIE_NAME = 'sm_session'
export const USER_ID_COOKIE_NAME = 'sm_user_id'

// Default cookie options (secure by default)
const DEFAULT_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
}

// ============================================================================
// Types
// ============================================================================

export interface SessionCookieOptions {
  /** Cookie max age in seconds (default: 7 days) */
  maxAge?: number
  /** Cookie domain (default: current domain) */
  domain?: string
  /** Cookie path (default: '/') */
  path?: string
  /** SameSite attribute (default: 'lax') */
  sameSite?: 'strict' | 'lax' | 'none'
  /** Whether to use secure cookies (default: true in production) */
  secure?: boolean
}

export interface SessionData {
  sessionToken: string
  userId: string
  expiresAt: Date
}

// ============================================================================
// Cookie Helpers
// ============================================================================

/**
 * Create Set-Cookie header value for session
 */
function createCookieHeader(
  name: string,
  value: string,
  options: SessionCookieOptions = {}
): string {
  const maxAge = options.maxAge ?? 7 * 24 * 60 * 60 // 7 days default
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  const sameSite = options.sameSite ?? 'lax'
  const path = options.path ?? '/'

  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}`

  if (secure) {
    cookie += '; Secure'
  }

  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }

  return cookie
}

/**
 * Create Set-Cookie header to clear a cookie
 */
function createClearCookieHeader(name: string, options: SessionCookieOptions = {}): string {
  const path = options.path ?? '/'
  let cookie = `${name}=; Path=${path}; Max-Age=0; HttpOnly`

  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }

  return cookie
}

// ============================================================================
// Response Helpers
// ============================================================================

/**
 * Create a Response with session cookies set
 *
 * Use this after successful login to set HTTP-only cookies and return user data.
 * The session token is stored in cookies, never sent to the browser in JSON.
 *
 * @example
 * ```ts
 * const result = await sm.auth.login({ email, password })
 * if (result.success) {
 *   return withSession(result.data, { user: result.data.user })
 * }
 * ```
 */
export function withSession<T extends Record<string, unknown>>(
  loginResponse: LoginResponse,
  responseBody: T,
  options: SessionCookieOptions = {}
): Response {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  // Set session token cookie (HTTP-only, never exposed to JS)
  headers.append(
    'Set-Cookie',
    createCookieHeader(SESSION_COOKIE_NAME, loginResponse.session_token, options)
  )

  // Set user ID cookie (HTTP-only, used for storage requests)
  headers.append(
    'Set-Cookie',
    createCookieHeader(USER_ID_COOKIE_NAME, loginResponse.user.id, options)
  )

  // Return response with user data (no tokens!)
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers,
  })
}

/**
 * Create a Response with refreshed session cookies
 *
 * Use this when rotating session tokens from /auth/refresh so refreshed cookies
 * honor the same user-configured cookie policy as login.
 */
export function withRefreshedSession<T extends Record<string, unknown>>(
  sessionToken: string,
  userId: string,
  responseBody: T,
  options: SessionCookieOptions = {}
): Response {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  headers.append(
    'Set-Cookie',
    createCookieHeader(SESSION_COOKIE_NAME, sessionToken, options)
  )
  headers.append(
    'Set-Cookie',
    createCookieHeader(USER_ID_COOKIE_NAME, userId, options)
  )

  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers,
  })
}

/**
 * Create a Response that clears session cookies
 *
 * Use this after logout to clear HTTP-only cookies.
 *
 * @example
 * ```ts
 * await sm.auth.logout(sessionToken)
 * return clearSession({ message: 'Logged out' })
 * ```
 */
export function clearSession<T extends Record<string, unknown>>(
  responseBody: T,
  options: SessionCookieOptions = {},
  status: number = 200
): Response {
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  // Clear both cookies
  headers.append('Set-Cookie', createClearCookieHeader(SESSION_COOKIE_NAME, options))
  headers.append('Set-Cookie', createClearCookieHeader(USER_ID_COOKIE_NAME, options))

  return new Response(JSON.stringify({ success: status < 300, data: responseBody }), {
    status,
    headers,
  })
}

/**
 * Get session data from request cookies
 *
 * Use this in API routes to get the current session.
 * Returns null if no valid session cookie exists.
 *
 * @example
 * ```ts
 * const session = await getSession()
 * if (!session) {
 *   return Response.json({ error: 'Not authenticated' }, { status: 401 })
 * }
 * const user = await sm.auth.me(session.sessionToken)
 * ```
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies()

  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)
  const userIdCookie = cookieStore.get(USER_ID_COOKIE_NAME)

  if (!sessionCookie?.value || !userIdCookie?.value) {
    return null
  }

  return {
    sessionToken: sessionCookie.value,
    userId: userIdCookie.value,
    expiresAt: new Date(), // Note: actual expiry is managed by ScaleMule backend
  }
}

/**
 * Get session from a Request object (for edge/middleware)
 *
 * Use this when you need to read cookies from a Request directly.
 */
export function getSessionFromRequest(request: Request): SessionData | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=')
      return [key, decodeURIComponent(rest.join('='))]
    })
  )

  const sessionToken = cookies[SESSION_COOKIE_NAME]
  const userId = cookies[USER_ID_COOKIE_NAME]

  if (!sessionToken || !userId) {
    return null
  }

  return {
    sessionToken,
    userId,
    expiresAt: new Date(),
  }
}

/**
 * Require authentication - throws Response if not authenticated
 *
 * Use this at the start of protected API routes.
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const session = await requireSession()
 *   // session is guaranteed to exist here
 *   const files = await sm.storage.list(session.userId)
 * }
 * ```
 */
export async function requireSession(): Promise<SessionData> {
  const session = await getSession()

  if (!session) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  return session
}
