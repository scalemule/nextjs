import { S as ServerConfig } from '../webhook-handler-DrC9rOoh.js';
export { a as ScaleMuleServer, e as VideoFailedEvent, V as VideoReadyEvent, g as VideoTranscodedEvent, f as VideoUploadedEvent, W as WebhookEvent, h as WebhookRoutesConfig, c as createServerClient, i as createWebhookHandler, d as createWebhookRoutes, p as parseWebhookEvent, b as registerVideoWebhook, r as resolveGatewayUrl, v as verifyWebhookSignature } from '../webhook-handler-DrC9rOoh.js';
import { $ as ClientContext, L as LoginResponse, A as ApiError } from '../index-jomBa89d.js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Client Context Extraction Utilities (Next.js)
 *
 * Next.js-specific helpers for extracting end user context from incoming
 * requests so it can be forwarded to ScaleMule when making server-to-server
 * calls. This ensures ScaleMule captures the actual end user's information
 * (IP, user agent, device fingerprint) instead of the server's information.
 *
 * For non-Next.js servers (Express, Fastify, raw Node.js), use the
 * framework-agnostic `extractClientContext()` and `buildClientContextHeaders()`
 * exported directly from `@scalemule/sdk`.
 */

interface NextRequestLike {
    headers: {
        get(name: string): string | null;
    };
    ip?: string;
}
interface IncomingMessageLike {
    headers: Record<string, string | string[] | undefined>;
    socket?: {
        remoteAddress?: string;
    };
}
/**
 * Extract client context from a Next.js App Router request.
 *
 * Use this in App Router API routes (route handlers) to capture
 * the end user's information for forwarding to ScaleMule.
 *
 * Supports all major cloud providers and CDNs:
 * - Cloudflare (CF-Connecting-IP)
 * - DigitalOcean App Platform (DO-Connecting-IP)
 * - Vercel (X-Vercel-Forwarded-For)
 * - Akamai (True-Client-IP)
 * - AWS/nginx (X-Real-IP, X-Forwarded-For)
 *
 * @example
 * ```typescript
 * // app/api/upload/route.ts
 * import { NextRequest, NextResponse } from 'next/server'
 * import { extractClientContext, createServerClient } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const clientContext = extractClientContext(request)
 *   const scalemule = createServerClient()
 *
 *   const result = await scalemule.storage.upload(userId, file, {
 *     clientContext
 *   })
 *
 *   return NextResponse.json(result)
 * }
 * ```
 */
declare function extractClientContext(request: NextRequestLike): ClientContext;
/**
 * Extract client context from a Pages Router API request.
 *
 * Use this in Pages Router API routes to capture the end user's
 * information for forwarding to ScaleMule.
 *
 * @example
 * ```typescript
 * // pages/api/upload.ts
 * import type { NextApiRequest, NextApiResponse } from 'next'
 * import { extractClientContextFromReq, createServerClient } from '@scalemule/nextjs/server'
 *
 * export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *   const clientContext = extractClientContextFromReq(req)
 *   const scalemule = createServerClient()
 *
 *   const result = await scalemule.storage.upload(userId, file, {
 *     clientContext
 *   })
 *
 *   res.json(result)
 * }
 * ```
 */
declare function extractClientContextFromReq(req: IncomingMessageLike): ClientContext;
/**
 * Build headers to forward client context to ScaleMule.
 *
 * This is used internally by the SDK to add authenticated forwarded-IP headers
 * (and legacy compatibility headers) when client context is provided.
 *
 * @internal
 */
declare function buildClientContextHeaders(context: ClientContext | undefined): Record<string, string>;

/**
 * Cookie Utilities for Secure Session Management
 *
 * Handles HTTP-only secure cookies for authentication.
 * Tokens are never exposed to the browser.
 */

declare const SESSION_COOKIE_NAME = "sm_session";
declare const USER_ID_COOKIE_NAME = "sm_user_id";
interface SessionCookieOptions {
    /** Cookie max age in seconds (default: 7 days) */
    maxAge?: number;
    /** Cookie domain (default: current domain) */
    domain?: string;
    /** Cookie path (default: '/') */
    path?: string;
    /** SameSite attribute (default: 'lax') */
    sameSite?: 'strict' | 'lax' | 'none';
    /** Whether to use secure cookies (default: true in production) */
    secure?: boolean;
}
interface SessionData {
    sessionToken: string;
    userId: string;
    expiresAt: Date;
}
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
declare function withSession<T extends Record<string, unknown>>(loginResponse: LoginResponse, responseBody: T, options?: SessionCookieOptions): Response;
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
declare function clearSession<T extends Record<string, unknown>>(responseBody: T, options?: SessionCookieOptions, status?: number): Response;
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
declare function getSession(): Promise<SessionData | null>;
/**
 * Get session from a Request object (for edge/middleware)
 *
 * Use this when you need to read cookies from a Request directly.
 */
declare function getSessionFromRequest(request: Request): SessionData | null;
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
declare function requireSession(): Promise<SessionData>;

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

interface AuthRoutesConfig {
    /** Server client config (optional if using env vars) */
    client?: Partial<ServerConfig>;
    /** Cookie options */
    cookies?: SessionCookieOptions;
    /** Enable CSRF validation on state-changing requests (POST/DELETE/PATCH) */
    csrf?: boolean;
    /** Callbacks */
    onLogin?: (user: {
        id: string;
        email: string;
    }) => void | Promise<void>;
    onLogout?: () => void | Promise<void>;
    onRegister?: (user: {
        id: string;
        email: string;
    }) => void | Promise<void>;
}
type RouteHandler = (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;
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
declare function createAuthRoutes(config?: AuthRoutesConfig): {
    GET: RouteHandler;
    POST: RouteHandler;
    DELETE: RouteHandler;
    PATCH: RouteHandler;
};
interface AnalyticsRoutesConfig {
    /** Server client config (optional if using env vars) */
    client?: Partial<ServerConfig>;
    /** Called after each event is tracked */
    onEvent?: (event: {
        event_name: string;
        session_id?: string;
    }) => void | Promise<void>;
    /**
     * When true, this is a simple proxy endpoint that handles events directly
     * without path routing. Use for endpoints like /api/t/e.
     * Default: false (uses catch-all route pattern)
     */
    simpleProxy?: boolean;
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
declare function createAnalyticsRoutes(config?: AnalyticsRoutesConfig): {
    POST: RouteHandler;
};

/**
 * Error utilities for ScaleMule API route handlers.
 *
 * ScaleMuleError is a throwable error with HTTP status code.
 * unwrap() converts SDK { data, error } results into throw-on-error.
 * errorCodeToStatus() maps error codes to HTTP status codes.
 */

/**
 * Throwable error with HTTP status code and machine-readable error code.
 *
 * Throw this from apiHandler() callbacks to return a formatted error response.
 *
 * @example
 * ```ts
 * throw new ScaleMuleError('NOT_FOUND', 'Snap not found', 404)
 * throw new ScaleMuleError('FORBIDDEN', 'Not your snap', 403)
 * ```
 */
declare class ScaleMuleError extends Error {
    readonly code: string;
    readonly status: number;
    readonly details?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, status?: number, details?: Record<string, unknown> | undefined);
}
declare function errorCodeToStatus(code: string): number;
/**
 * Result shape accepted by unwrap() for backward compatibility.
 * Compatible with both the base SDK's { data, error } and the
 * Next.js SDK's { success, data, error } response contracts.
 */
type SdkResult<T> = {
    data?: T | null;
    error?: ApiError | null;
    success?: boolean;
};
/**
 * Convert an SDK result into throw-on-error, or pass through a raw value.
 *
 * Since SDK methods now throw on error and return data directly,
 * unwrap() acts as a pass-through for direct values. It still supports
 * the legacy { success, data, error } envelope for backward compatibility.
 *
 * @example
 * ```ts
 * // New style (SDK methods throw on error, return T directly):
 * const user = await sm.auth.me(token)
 *
 * // Legacy style (still works with unwrap):
 * const user = unwrap(legacyResult)
 * ```
 */
declare function unwrap<T>(result: T | SdkResult<T>): T;

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

type HandlerContext = {
    /** Resolved route params (e.g., { id: '123' }) */
    params: Record<string, string>;
    /** URL search params */
    searchParams: URLSearchParams;
    /** Session data (only present when options.auth is true) */
    session?: SessionData;
};
type HandlerFn = (request: NextRequest, context: HandlerContext) => Promise<Response | Record<string, unknown> | void>;
type HandlerOptions = {
    /** Validate CSRF token before calling handler (default: false) */
    csrf?: boolean;
    /** Require authentication before calling handler (default: false) */
    auth?: boolean;
    /** Override default error response formatting */
    onError?: (error: ScaleMuleError) => Response | undefined;
};
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
declare function apiHandler(handler: HandlerFn, options?: HandlerOptions): (request: NextRequest, routeContext?: {
    params: Promise<Record<string, string | string[]>>;
}) => Promise<Response>;

/**
 * Server-side flag bootstrapping for Next.js layouts.
 *
 * Uses @scalemule/sdk FlagClient for local evaluation — ZERO API calls per SSR render.
 * Falls back to legacy evaluateBatch API call if FlagClient init fails.
 *
 * @example
 * ```ts
 * // app/layout.tsx
 * import { getBootstrapFlags } from '@scalemule/nextjs/server'
 *
 * export default async function RootLayout({ children }) {
 *   const bootstrapFlags = await getBootstrapFlags(['analytics.tracking_enabled'])
 *   return (
 *     <Providers bootstrapFlags={bootstrapFlags}>
 *       {children}
 *     </Providers>
 *   )
 * }
 * ```
 */
/**
 * Evaluate feature flags server-side for bootstrapping the client provider.
 *
 * Uses local evaluation via FlagClient (zero network calls per render).
 * Falls back to legacy API if FlagClient is unavailable.
 *
 * @param flagKeys - Array of flag keys to evaluate
 * @param environment - Environment name (default: 'prod')
 * @param extraContext - Additional context attributes to include
 * @param cacheTtlMs - Deprecated (ignored). FlagClient handles caching internally.
 */
declare function getBootstrapFlags(flagKeys: string[], environment?: string, extraContext?: Record<string, unknown>, cacheTtlMs?: number): Promise<Record<string, unknown>>;

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

interface AuthMiddlewareConfig {
    /** Routes that require authentication (supports glob patterns) */
    protectedRoutes?: string[];
    /** Routes that are always public (supports glob patterns) */
    publicRoutes?: string[];
    /** Where to redirect unauthenticated users (default: '/login') */
    redirectTo?: string;
    /** Where to redirect authenticated users from public-only routes */
    redirectAuthenticated?: string;
    /** Routes where authenticated users should be redirected (e.g., login page) */
    authOnlyPublic?: string[];
    /** Skip validation and just check cookie presence (faster) */
    skipValidation?: boolean;
    /** Custom handler for unauthorized requests */
    onUnauthorized?: (request: NextRequest) => NextResponse;
}
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
declare function createAuthMiddleware(config?: AuthMiddlewareConfig): (request: NextRequest) => Promise<NextResponse>;
/**
 * Simple authentication check middleware (no validation, just cookie presence)
 *
 * Faster than createAuthMiddleware with full validation.
 * Use when you want quick protection without hitting the backend.
 */
declare function withAuth(config?: Pick<AuthMiddlewareConfig, 'redirectTo' | 'onUnauthorized'>): (request: NextRequest) => NextResponse;

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

declare const CSRF_COOKIE_NAME = "sm_csrf";
declare const CSRF_HEADER_NAME = "x-csrf-token";
/**
 * Generate a cryptographically secure CSRF token
 */
declare function generateCSRFToken(): string;
/**
 * Create a response with CSRF token cookie set.
 * Call this on page loads or when user logs in.
 */
declare function withCSRFToken(response: NextResponse, token?: string): NextResponse;
/**
 * Validate CSRF token from request.
 * Returns error message if invalid, undefined if valid.
 *
 * Checks that:
 * 1. CSRF cookie exists
 * 2. CSRF header or body field exists
 * 3. Values match
 */
declare function validateCSRFToken(request: NextRequest): string | undefined;
/**
 * Validate CSRF token (async version that can read from body)
 */
declare function validateCSRFTokenAsync(request: NextRequest, body?: Record<string, unknown>): Promise<string | undefined>;
/**
 * Middleware helper to validate CSRF on all state-changing requests
 */
declare function withCSRFProtection(handler: (request: NextRequest) => Promise<NextResponse> | NextResponse): (request: NextRequest) => Promise<NextResponse>;
/**
 * Get CSRF token for the current request (server component).
 * Use this to pass the token to client components.
 */
declare function getCSRFToken(): Promise<string>;

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

declare const OAUTH_STATE_COOKIE_NAME = "sm_oauth_state";
/**
 * Set OAuth state in an httpOnly cookie.
 * Call this when starting an OAuth flow.
 */
declare function setOAuthState(response: NextResponse, state: string): NextResponse;
/**
 * Validate OAuth state from callback against stored cookie.
 * Returns error message if invalid, undefined if valid.
 */
declare function validateOAuthState(request: NextRequest, callbackState: string | null): string | undefined;
/**
 * Validate OAuth state (async version for Server Components).
 */
declare function validateOAuthStateAsync(callbackState: string | null): Promise<string | undefined>;
/**
 * Clear OAuth state cookie after successful authentication.
 */
declare function clearOAuthState(response: NextResponse): NextResponse;

/**
 * Application Secrets Management
 *
 * Provides cached access to tenant secrets stored in ScaleMule Vault.
 * Use this instead of environment variables for sensitive configuration.
 *
 * Benefits:
 * - Secrets stored securely with AES-256-GCM + AWS KMS encryption
 * - Centralized management via ScaleMule admin dashboard
 * - Automatic caching to minimize API calls
 * - No need to manage k8s secrets yourself
 *
 * @example
 * ```typescript
 * import { getAppSecret } from '@scalemule/nextjs/server'
 *
 * // In your API route or server component:
 * const salt = await getAppSecret('ANONYMOUS_USER_SALT')
 * // Uses cached value on subsequent calls
 * ```
 */
/** Configuration options */
interface SecretsConfig {
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTtlMs?: number;
    /** Disable caching (for testing) */
    noCache?: boolean;
}
/**
 * Configure secrets caching behavior
 *
 * @example
 * ```typescript
 * configureSecrets({ cacheTtlMs: 60000 }) // 1 minute cache
 * ```
 */
declare function configureSecrets(config: SecretsConfig): void;
/**
 * Get a secret from the ScaleMule tenant vault
 *
 * This function automatically caches secrets to minimize API calls.
 * If the secret doesn't exist, returns undefined.
 *
 * @param key - The secret key (e.g., 'ANONYMOUS_USER_SALT')
 * @returns The secret value, or undefined if not found
 *
 * @example
 * ```typescript
 * import { getAppSecret } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const salt = await getAppSecret('ANONYMOUS_USER_SALT')
 *   if (!salt) {
 *     console.warn('ANONYMOUS_USER_SALT not configured in ScaleMule vault')
 *     // Fall back to environment variable or default
 *     salt = process.env.ANONYMOUS_USER_SALT || 'default-salt'
 *   }
 *   // Use the salt...
 * }
 * ```
 */
declare function getAppSecret(key: string): Promise<string | undefined>;
/**
 * Get a secret, throwing if not found
 *
 * Use this when the secret is required and the app cannot function without it.
 *
 * @param key - The secret key
 * @returns The secret value
 * @throws Error if the secret is not found
 *
 * @example
 * ```typescript
 * const salt = await requireAppSecret('ANONYMOUS_USER_SALT')
 * // Throws if not configured
 * ```
 */
declare function requireAppSecret(key: string): Promise<string>;
/**
 * Get a secret with a fallback value
 *
 * Useful for development or when migrating from environment variables.
 *
 * @param key - The secret key
 * @param fallback - Fallback value if secret not found
 * @returns The secret value or fallback
 *
 * @example
 * ```typescript
 * // Fall back to env var if not in vault yet
 * const salt = await getAppSecretOrDefault(
 *   'ANONYMOUS_USER_SALT',
 *   process.env.ANONYMOUS_USER_SALT || 'dev-salt'
 * )
 * ```
 */
declare function getAppSecretOrDefault(key: string, fallback: string): Promise<string>;
/**
 * Invalidate cached secret (force refresh on next access)
 *
 * @param key - The secret key to invalidate, or undefined to clear all
 */
declare function invalidateSecretCache(key?: string): void;
/**
 * Prefetch secrets into cache
 *
 * Call this during app startup to warm the cache.
 *
 * @param keys - Array of secret keys to prefetch
 *
 * @example
 * ```typescript
 * // In your app initialization:
 * await prefetchSecrets(['ANONYMOUS_USER_SALT', 'WEBHOOK_SECRET'])
 * ```
 */
declare function prefetchSecrets(keys: string[]): Promise<void>;

/**
 * Application Bundles Management
 *
 * Bundles are structured secrets like database credentials, S3 configs, etc.
 * They support inheritance - child bundles can inherit from parent bundles
 * and override specific fields.
 *
 * @example
 * ```typescript
 * import { getBundle, getMySqlBundle } from '@scalemule/nextjs/server'
 *
 * // Get a generic bundle
 * const config = await getBundle<{ apiKey: string }>('external/stripe')
 *
 * // Get a typed MySQL bundle
 * const db = await getMySqlBundle('database/prod')
 * const connection = mysql.createConnection(db.connectionUrl)
 * ```
 */
interface MySqlBundle {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl_mode?: string;
}
interface PostgresBundle {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    ssl_mode?: string;
}
interface RedisBundle {
    host: string;
    port: number;
    password?: string;
    database?: number;
    ssl?: boolean;
}
interface S3Bundle {
    bucket: string;
    region: string;
    access_key_id: string;
    secret_access_key: string;
    endpoint?: string;
}
interface OAuthBundle {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    scopes?: string[];
}
interface SmtpBundle {
    host: string;
    port: number;
    username: string;
    password: string;
    from_email: string;
    from_name?: string;
    encryption?: 'none' | 'tls' | 'starttls';
}
/** Configuration options */
interface BundlesConfig {
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTtlMs?: number;
    /** Disable caching (for testing) */
    noCache?: boolean;
}
/**
 * Configure bundles caching behavior
 */
declare function configureBundles(config: BundlesConfig): void;
/**
 * Get a bundle from the ScaleMule vault
 *
 * @param key - The bundle key (e.g., 'database/prod')
 * @param resolve - Whether to resolve inheritance (default: true)
 * @returns The bundle data, or undefined if not found
 *
 * @example
 * ```typescript
 * const stripe = await getBundle<{ apiKey: string }>('external/stripe')
 * if (stripe) {
 *   const client = new Stripe(stripe.apiKey)
 * }
 * ```
 */
declare function getBundle<T = Record<string, unknown>>(key: string, resolve?: boolean): Promise<T | undefined>;
/**
 * Get a bundle, throwing if not found
 */
declare function requireBundle<T = Record<string, unknown>>(key: string, resolve?: boolean): Promise<T>;
/**
 * Get a MySQL bundle with connection URL
 *
 * @example
 * ```typescript
 * const db = await getMySqlBundle('database/prod')
 * const connection = mysql.createConnection(db.connectionUrl)
 * ```
 */
declare function getMySqlBundle(key: string): Promise<(MySqlBundle & {
    connectionUrl: string;
}) | undefined>;
/**
 * Get a PostgreSQL bundle with connection URL
 */
declare function getPostgresBundle(key: string): Promise<(PostgresBundle & {
    connectionUrl: string;
}) | undefined>;
/**
 * Get a Redis bundle with connection URL
 */
declare function getRedisBundle(key: string): Promise<(RedisBundle & {
    connectionUrl: string;
}) | undefined>;
/**
 * Get an S3 bundle
 */
declare function getS3Bundle(key: string): Promise<S3Bundle | undefined>;
/**
 * Get an OAuth bundle
 */
declare function getOAuthBundle(key: string): Promise<OAuthBundle | undefined>;
/**
 * Get an SMTP bundle
 */
declare function getSmtpBundle(key: string): Promise<SmtpBundle | undefined>;
/**
 * Invalidate cached bundle (force refresh on next access)
 *
 * @param key - The bundle key to invalidate, or undefined to clear all
 */
declare function invalidateBundleCache(key?: string): void;
/**
 * Prefetch bundles into cache
 *
 * @param keys - Array of bundle keys to prefetch
 */
declare function prefetchBundles(keys: string[]): Promise<void>;

export { type AnalyticsRoutesConfig, type AuthMiddlewareConfig, type AuthRoutesConfig, CSRF_COOKIE_NAME, CSRF_HEADER_NAME, type HandlerContext, type HandlerOptions, type MySqlBundle, OAUTH_STATE_COOKIE_NAME, type OAuthBundle, type PostgresBundle, type RedisBundle, type S3Bundle, SESSION_COOKIE_NAME, ScaleMuleError, ServerConfig, type SessionCookieOptions, type SessionData, type SmtpBundle, USER_ID_COOKIE_NAME, apiHandler, buildClientContextHeaders, clearOAuthState, clearSession, configureBundles, configureSecrets, createAnalyticsRoutes, createAuthMiddleware, createAuthRoutes, errorCodeToStatus, extractClientContext, extractClientContextFromReq, generateCSRFToken, getAppSecret, getAppSecretOrDefault, getBootstrapFlags, getBundle, getCSRFToken, getMySqlBundle, getOAuthBundle, getPostgresBundle, getRedisBundle, getS3Bundle, getSession, getSessionFromRequest, getSmtpBundle, invalidateBundleCache, invalidateSecretCache, prefetchBundles, prefetchSecrets, requireAppSecret, requireBundle, requireSession, setOAuthState, unwrap, validateCSRFToken, validateCSRFTokenAsync, validateOAuthState, validateOAuthStateAsync, withAuth, withCSRFProtection, withCSRFToken, withSession };
