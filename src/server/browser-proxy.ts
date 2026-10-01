/** Cookie-authenticated transport for browser SDK data calls. */
import { getSession, withSession, withRefreshedSession, clearSession, type SessionCookieOptions } from './cookies'
import { resolveGatewayUrl, type ServerConfig } from './client'

export interface BrowserProxyConfig {
  client?: Partial<ServerConfig>
  cookies?: SessionCookieOptions
  /** Publishable application key. Never use a secret key for the browser proxy. */
  publishableKey?: string
  /** Must match the browser realtime gateway so tickets use the same Redis pool. */
  browserGatewayUrl?: string
}

function error(code: string, status: number): Response {
  return Response.json({ success: false, error: { code, message: code === 'UNAUTHORIZED' ? 'Authentication required' : 'Request not permitted' } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

/** Reject browser cross-origin mutations, including SameSite=None iframe sessions. */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  // Fetch Metadata is browser-controlled and survives host-rewriting ingress.
  if (site) return site === 'same-origin' || site === 'none'
  // Next's request URL can use the internal container host. Host is the
  // application's HTTP authority; do not trust X-Forwarded-Host from callers.
  const url = new URL(request.url)
  const host = request.headers.get('host') || url.host
  if (origin) {
    try {
      const source = new URL(origin)
      if (!['http:', 'https:'].includes(source.protocol) || source.host !== host) return false
    } catch { return false }
  }
  return true
}

// Data APIs available with a publishable key + validated user session. Auth and
// platform administration are deliberately absent: those have dedicated routes
// that consume credentials and set cookies without returning session tokens.
const SERVICES = new Set(['storage', 'photo', 'video', 'audio', 'media', 'tts', 'social', 'chat', 'realtime', 'money', 'billing', 'flags', 'notifications', 'search', 'presence', 'conference', 'gallop', 'data', 'forms', 'preferences', 'feedback', 'referrals'])
const AUTH_ROUTES = new Set([
  'GET me', 'GET mfa/status', 'GET oauth/providers',
  'PATCH profile', 'POST change-password', 'POST change-email', 'POST delete-account', 'POST export-data',
  'POST mfa/setup', 'POST mfa/verify', 'POST mfa/disable', 'POST mfa/backup-codes',
  'POST oauth/start', 'POST oauth/callback',
])
const PUBLIC_AUTH_ROUTES = new Set(['POST oauth/start', 'POST oauth/callback'])
// Preserve the SDK's anonymous feature-flag and feedback APIs. The gateway
// still validates the publishable key and each endpoint's tenant policy.
const PUBLIC_DATA_ROUTES = new Set(['POST flags/evaluate', 'POST flags/evaluate/all', 'POST flags/evaluate/batch', 'GET feedback/items', 'POST feedback/submit'])
const MAX_BODY_BYTES = 25 * 1024 * 1024

async function boundedBody(request: Request): Promise<Uint8Array | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return undefined
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}

export async function browserProxy(request: Request, path: string[], config: BrowserProxyConfig): Promise<Response> {
  if (!isSameOriginRequest(request)) return error('CSRF_ERROR', 403)
  const key = config.publishableKey || process.env.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY
  // This custom header also prevents cross-site HTML forms from invoking the
  // proxy. There is no OPTIONS/CORS opt-in and no caller credential forwarding.
  if (!key?.startsWith('sm_pb_')) return error('BROWSER_KEY_NOT_CONFIGURED', 503)
  if (request.headers.get('x-api-key') !== key) return error('CSRF_ERROR', 403)
  const authOperation = `${request.method} ${path.slice(2).join('/')}`
  const authRoute = path[1] === 'auth' && (AUTH_ROUTES.has(authOperation) || (request.method === 'DELETE' && path[2] === 'oauth' && path[3] === 'providers' && path.length === 5))
  if (path[0] !== 'v1' || !(SERVICES.has(path[1]) || authRoute) || path.some(part => !part || part === '.' || part === '..' || /[\\/%\u0000-\u001f]/.test(part))) return error('NOT_FOUND', 404)
  const session = await getSession({ allowBearer: false })
  if (!session && !(authRoute && PUBLIC_AUTH_ROUTES.has(authOperation)) && !PUBLIC_DATA_ROUTES.has(`${request.method} ${path.slice(1).join('/')}`)) return error('UNAUTHORIZED', 401)
  const gateway = resolveGatewayUrl({ apiKey: key, ...config.client, gatewayUrl: config.browserGatewayUrl || process.env.NEXT_PUBLIC_SCALEMULE_GATEWAY_URL || config.client?.gatewayUrl })
  const target = new URL(`${gateway.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`)
  target.search = new URL(request.url).search
  const headers = new Headers({ 'x-api-key': key })
  if (session) headers.set('Authorization', `Bearer ${session.sessionToken}`)
  // Explicit list: never copy Cookie, Authorization, app IDs, forwarding or
  // internal-platform headers supplied by the browser.
  for (const name of ['origin', 'content-type', 'accept', 'user-agent', 'range', 'if-none-match', 'x-idempotency-key', 'x-sm-workspace-id']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  try {
    const body = await boundedBody(request)
    const upstream = await fetch(target, { method: request.method, headers, body: body as BodyInit | undefined, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60_000) })
    const outputHeaders = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Cookie' })
    for (const name of ['content-type', 'content-disposition', 'content-range', 'accept-ranges', 'etag', 'retry-after', 'x-request-id']) {
      const value = upstream.headers.get(name)
      if (value) outputHeaders.set(name, value)
    }
    const rotated = upstream.headers.get('x-rotated-session-token')
    if (rotated && session) {
      const refreshed = withRefreshedSession(rotated, session.userId, {}, config.cookies)
      for (const cookie of refreshed.headers.getSetCookie()) outputHeaders.append('Set-Cookie', cookie)
    }
    if (authRoute) {
      const payload = await upstream.json()
      const data = payload?.data || payload
      if (authOperation === 'POST delete-account' && upstream.ok && payload.success !== false) {
        for (const cookie of clearSession({}, config.cookies).headers.getSetCookie()) outputHeaders.append('Set-Cookie', cookie)
      }
      const token = data?.session_token
      if (typeof token === 'string' && data?.user?.id && upstream.ok && payload.success !== false) {
        const established = withSession({ session_token: token, user: data.user }, {}, config.cookies)
        for (const cookie of established.headers.getSetCookie()) outputHeaders.append('Set-Cookie', cookie)
        data.authenticated = true
      }
      // Auth transport consumes session credentials exclusively on the server.
      if (data && typeof data === 'object') {
        delete data.session_token
        delete data.sessionToken
        delete data.refresh_token
        delete data.access_token
      }
      return Response.json(payload, { status: upstream.status, headers: outputHeaders })
    }
    return new Response(upstream.body, { status: upstream.status, headers: outputHeaders })
  } catch (err) {
    if (err instanceof Error && err.message === 'BODY_TOO_LARGE') return error('BODY_TOO_LARGE', 413)
    // Never log the authenticated request or a transport error containing it.
    console.error('[ScaleMule] Browser proxy upstream request failed')
    return error('UPSTREAM_UNAVAILABLE', 502)
  }
}
