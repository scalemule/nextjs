/**
 * Next.js Middleware Helpers
 *
 * Use these in middleware.ts to protect routes server-side.
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createAuthMiddleware } from '@scalemule/nextjs/server'
 *
 * export default createAuthMiddleware({
 *   protectedRoutes: ['/dashboard', '/settings', '/api/user'],
 *   publicRoutes: ['/login', '/register', '/'],
 *   redirectTo: '/login',
 * })
 *
 * export const config = {
 *   matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
 * }
 * ```
 */

import { NextResponse, type NextRequest } from 'next/server'
import { getSessionFromRequest, SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'
import { createServerClient } from './client'

// ============================================================================
// Types
// ============================================================================

export interface AuthMiddlewareConfig {
  /** Routes that require authentication (supports glob patterns) */
  protectedRoutes?: string[]
  /** Routes that are always public (supports glob patterns) */
  publicRoutes?: string[]
  /** Where to redirect unauthenticated users (default: '/login') */
  redirectTo?: string
  /** Where to redirect authenticated users from public-only routes */
  redirectAuthenticated?: string
  /** Routes where authenticated users should be redirected (e.g., login page) */
  authOnlyPublic?: string[]
  /** Skip validation and just check cookie presence (faster) */
  skipValidation?: boolean
  /** Custom handler for unauthorized requests */
  onUnauthorized?: (request: NextRequest) => NextResponse
}

// ============================================================================
// Pattern Matching
// ============================================================================

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
    .replace(/\*/g, '.*') // * matches anything
    .replace(/\?/g, '.') // ? matches single char

  return new RegExp(`^${escaped}$`)
}

/**
 * Check if pathname matches any pattern
 */
function matchesPattern(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Direct match
    if (pattern === pathname) return true
    // Glob pattern
    if (pattern.includes('*') || pattern.includes('?')) {
      return globToRegex(pattern).test(pathname)
    }
    // Prefix match (for /dashboard to match /dashboard/*)
    if (pathname.startsWith(pattern + '/')) return true
    return false
  })
}

// ============================================================================
// Middleware Factory
// ============================================================================

/**
 * Create authentication middleware for Next.js
 *
 * @example
 * ```ts
 * // middleware.ts
 * import { createAuthMiddleware } from '@scalemule/nextjs/server'
 *
 * export default createAuthMiddleware({
 *   protectedRoutes: ['/dashboard/*', '/api/user/*'],
 *   publicRoutes: ['/login', '/register', '/api/auth/*'],
 *   redirectTo: '/login',
 * })
 * ```
 */
export function createAuthMiddleware(config: AuthMiddlewareConfig = {}) {
  const {
    protectedRoutes = [],
    publicRoutes = [],
    authOnlyPublic = [],
    redirectTo = '/login',
    redirectAuthenticated,
    skipValidation = false,
    onUnauthorized,
  } = config

  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const { pathname } = request.nextUrl

    // Skip API routes for auth (they handle their own auth)
    if (pathname.startsWith('/api/auth')) {
      return NextResponse.next()
    }

    // Check if route is explicitly public
    if (publicRoutes.length > 0 && matchesPattern(pathname, publicRoutes)) {
      // Check if authenticated user should be redirected from auth-only public routes
      if (redirectAuthenticated && authOnlyPublic.length > 0 && matchesPattern(pathname, authOnlyPublic)) {
        const session = getSessionFromRequest(request)
        if (session) {
          return NextResponse.redirect(new URL(redirectAuthenticated, request.url))
        }
      }
      return NextResponse.next()
    }

    // Check if route requires authentication
    const requiresAuth = protectedRoutes.length === 0 || matchesPattern(pathname, protectedRoutes)

    if (!requiresAuth) {
      return NextResponse.next()
    }

    // Get session from cookies
    const session = getSessionFromRequest(request)

    if (!session) {
      // No session - redirect or custom handler
      if (onUnauthorized) {
        return onUnauthorized(request)
      }

      const redirectUrl = new URL(redirectTo, request.url)
      redirectUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Optionally validate session with the backend
    if (!skipValidation) {
      try {
        const sm = createServerClient()
        await sm.auth.me(session.sessionToken)
      } catch (error) {
        // Session invalid or network error - fail closed for security (block access)
        // If you need fail-open behavior, use skipValidation: true
        console.error('[ScaleMule Middleware] Session validation failed, blocking request:', error)
        const response = NextResponse.redirect(new URL(redirectTo, request.url))
        response.cookies.delete(SESSION_COOKIE_NAME)
        response.cookies.delete(USER_ID_COOKIE_NAME)
        return response
      }
    }

    // Session valid - continue
    return NextResponse.next()
  }
}

/**
 * Simple authentication check middleware (no validation, just cookie presence)
 *
 * Faster than createAuthMiddleware with full validation.
 * Use when you want quick protection without hitting the backend.
 */
export function withAuth(config: Pick<AuthMiddlewareConfig, 'redirectTo' | 'onUnauthorized'> = {}) {
  const { redirectTo = '/login', onUnauthorized } = config

  return function middleware(request: NextRequest): NextResponse {
    const session = getSessionFromRequest(request)

    if (!session) {
      if (onUnauthorized) {
        return onUnauthorized(request)
      }

      const redirectUrl = new URL(redirectTo, request.url)
      redirectUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    return NextResponse.next()
  }
}
