/**
 * CSRF Protection Utilities
 *
 * Implements the double-submit cookie pattern for CSRF protection.
 *
 * Usage:
 * 1. Generate token on page load and set cookie
 * 2. Include token in request header or body
 * 3. Validate token matches cookie on server
 *
 * @example
 * ```typescript
 * // In your API route:
 * import { validateCSRFToken, CSRF_HEADER_NAME } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const error = validateCSRFToken(request)
 *   if (error) {
 *     return NextResponse.json({ error }, { status: 403 })
 *   }
 *   // ... handle request
 * }
 * ```
 */

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { constantTimeEqual } from './timing'

export const CSRF_COOKIE_NAME = 'sm_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Create a response with CSRF token cookie set.
 * Call this on page loads or when user logs in.
 */
export function withCSRFToken(response: NextResponse, token?: string): NextResponse {
  const csrfToken = token || generateCSRFToken()

  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false, // Must be readable by JavaScript to include in requests
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  })

  return response
}

/**
 * Validate CSRF token from request.
 * Returns error message if invalid, undefined if valid.
 *
 * Checks that:
 * 1. CSRF cookie exists
 * 2. CSRF header or body field exists
 * 3. Values match
 */
export function validateCSRFToken(request: NextRequest): string | undefined {
  // Get token from cookie
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  if (!cookieToken) {
    return 'Missing CSRF cookie'
  }

  // Get token from header (preferred) or will need to parse body
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!headerToken) {
    return 'Missing CSRF token header'
  }

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(cookieToken, headerToken)) {
    return 'CSRF token mismatch'
  }

  return undefined
}

/**
 * Validate CSRF token (async version that can read from body)
 */
export async function validateCSRFTokenAsync(
  request: NextRequest,
  body?: Record<string, unknown>
): Promise<string | undefined> {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value

  if (!cookieToken) {
    return 'Missing CSRF cookie'
  }

  // Try header first
  let requestToken = request.headers.get(CSRF_HEADER_NAME)

  // Fall back to body field
  if (!requestToken && body) {
    requestToken = body.csrf_token as string | undefined ?? body._csrf as string | undefined ?? null
  }

  if (!requestToken) {
    return 'Missing CSRF token'
  }

  if (!constantTimeEqual(cookieToken, requestToken)) {
    return 'CSRF token mismatch'
  }

  return undefined
}

/**
 * Middleware helper to validate CSRF on all state-changing requests
 */
export function withCSRFProtection(
  handler: (request: NextRequest) => Promise<NextResponse> | NextResponse
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // Only validate on state-changing methods
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const error = validateCSRFToken(request)
      if (error) {
        return NextResponse.json(
          { error: 'CSRF validation failed', message: error },
          { status: 403 }
        )
      }
    }

    return handler(request)
  }
}

/**
 * Get CSRF token for the current request (server component).
 * Use this to pass the token to client components.
 */
export async function getCSRFToken(): Promise<string> {
  const cookieStore = await cookies()
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value

  if (!token) {
    token = generateCSRFToken()
  }

  return token
}
