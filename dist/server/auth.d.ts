/**
 * Pre-configured auth route handlers for 1-line setup.
 *
 * Usage in your Next.js app:
 * ```ts
 * // app/api/auth/[...scalemule]/route.ts
 * export { GET, POST, DELETE, PATCH } from '@scalemule/nextjs/server/auth'
 * ```
 *
 * Configuration via environment variables:
 * - SCALEMULE_API_KEY — API key (required)
 * - SCALEMULE_GATEWAY_URL — Gateway URL (optional, defaults to prod)
 * - SCALEMULE_COOKIE_DOMAIN — Cookie domain (optional)
 *
 * For custom configuration, use createAuthRoutes() from '@scalemule/nextjs/server' instead.
 */
declare const GET: (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;
declare const POST: (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;
declare const DELETE: (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;
declare const PATCH: (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;

export { DELETE, GET, PATCH, POST };
