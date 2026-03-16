/**
 * ScaleMule Server-Side SDK
 *
 * For use in Next.js API routes to implement secure HTTP-only cookie authentication.
 * This keeps tokens server-side and never exposes them to the browser.
 *
 * @example
 * ```ts
 * // app/api/auth/login/route.ts
 * import { createServerClient, withSession } from '@scalemule/nextjs/server'
 *
 * const sm = createServerClient()
 *
 * export async function POST(req: Request) {
 *   const { email, password } = await req.json()
 *   const result = await sm.auth.login({ email, password })
 *
 *   if (!result.success) {
 *     return Response.json(result, { status: 401 })
 *   }
 *
 *   // Returns user data + sets HTTP-only cookie (token never sent to browser)
 *   return withSession(result.data, { user: result.data.user })
 * }
 * ```
 */

export { ScaleMuleServer, createServerClient, resolveGatewayUrl } from './client'
export type { ServerConfig } from './client'

export {
  extractClientContext,
  extractClientContextFromReq,
  buildClientContextHeaders,
} from './context'

export {
  withSession,
  clearSession,
  getSession,
  getSessionFromRequest,
  requireSession,
  SESSION_COOKIE_NAME,
  USER_ID_COOKIE_NAME,
} from './cookies'
export type { SessionCookieOptions, SessionData } from './cookies'

export { createAuthRoutes, createAnalyticsRoutes } from './routes'
export type { AuthRoutesConfig, AnalyticsRoutesConfig } from './routes'

export { apiHandler } from './handler'
export type { HandlerContext, HandlerOptions } from './handler'

export { ScaleMuleError, unwrap, errorCodeToStatus } from './errors'

export {
  verifyWebhookSignature,
  parseWebhookEvent,
  registerVideoWebhook,
  createWebhookRoutes,
} from './webhooks'
export type {
  WebhookEvent,
  VideoReadyEvent,
  VideoFailedEvent,
  VideoUploadedEvent,
  VideoTranscodedEvent,
  WebhookRoutesConfig,
} from './webhooks'

export { createWebhookHandler } from './webhook-handler'

export { getBootstrapFlags } from './bootstrap-flags'

export { createAuthMiddleware, withAuth } from './middleware'
export type { AuthMiddlewareConfig } from './middleware'

export {
  generateCSRFToken,
  withCSRFToken,
  validateCSRFToken,
  validateCSRFTokenAsync,
  withCSRFProtection,
  getCSRFToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from './csrf'

export {
  setOAuthState,
  validateOAuthState,
  validateOAuthStateAsync,
  clearOAuthState,
  OAUTH_STATE_COOKIE_NAME,
} from './oauth'

export {
  getAppSecret,
  requireAppSecret,
  getAppSecretOrDefault,
  invalidateSecretCache,
  prefetchSecrets,
  configureSecrets,
} from './secrets'

export {
  getBundle,
  requireBundle,
  getMySqlBundle,
  getPostgresBundle,
  getRedisBundle,
  getS3Bundle,
  getOAuthBundle,
  getSmtpBundle,
  invalidateBundleCache,
  prefetchBundles,
  configureBundles,
} from './bundles'
export type {
  MySqlBundle,
  PostgresBundle,
  RedisBundle,
  S3Bundle,
  OAuthBundle,
  SmtpBundle,
} from './bundles'
