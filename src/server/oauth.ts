/**
 * OAuth State Management Utilities
 *
 * Provides secure OAuth state storage using httpOnly cookies instead of sessionStorage.
 * This prevents XSS attacks from stealing OAuth state tokens.
 *
 * Usage:
 * ```typescript
 * // In your OAuth start route:
 * import { setOAuthState } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const result = await sm.auth.startOAuth({ provider: 'google', ... })
 *   return setOAuthState(NextResponse.json(result), result.state)
 * }
 *
 * // In your OAuth callback route:
 * import { validateOAuthState, clearOAuthState } from '@scalemule/nextjs/server'
 *
 * export async function GET(request: NextRequest) {
 *   const state = request.nextUrl.searchParams.get('state')
 *   const error = validateOAuthState(request, state)
 *   if (error) {
 *     return NextResponse.json({ error }, { status: 403 })
 *   }
 *   // ... complete OAuth flow
 *   return clearOAuthState(NextResponse.redirect('/dashboard'))
 * }
 * ```
 */

import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { constantTimeEqual } from './timing'

export const OAUTH_STATE_COOKIE_NAME = 'sm_oauth_state'

/**
 * Set OAuth state in an httpOnly cookie.
 * Call this when starting an OAuth flow.
 */
export function setOAuthState(response: NextResponse, state: string): NextResponse {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Lax allows the cookie to be sent on OAuth redirects
    path: '/',
    maxAge: 60 * 10, // 10 minutes - OAuth flows should complete quickly
  })

  return response
}

/**
 * Validate OAuth state from callback against stored cookie.
 * Returns error message if invalid, undefined if valid.
 */
export function validateOAuthState(request: NextRequest, callbackState: string | null): string | undefined {
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value

  if (!cookieState) {
    return 'Missing OAuth state cookie - session may have expired'
  }

  if (!callbackState) {
    return 'Missing OAuth state in callback'
  }

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(cookieState, callbackState)) {
    return 'OAuth state mismatch - possible CSRF attack'
  }

  return undefined
}

/**
 * Validate OAuth state (async version for Server Components).
 */
export async function validateOAuthStateAsync(callbackState: string | null): Promise<string | undefined> {
  const cookieStore = await cookies()
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value

  if (!cookieState) {
    return 'Missing OAuth state cookie - session may have expired'
  }

  if (!callbackState) {
    return 'Missing OAuth state in callback'
  }

  if (!constantTimeEqual(cookieState, callbackState)) {
    return 'OAuth state mismatch - possible CSRF attack'
  }

  return undefined
}

/**
 * Clear OAuth state cookie after successful authentication.
 */
export function clearOAuthState(response: NextResponse): NextResponse {
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME)
  return response
}
