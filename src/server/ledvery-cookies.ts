import { constantTimeEqual } from './timing'

export const SM_LEDVERY_STATE_COOKIE = 'sm_ledvery_state'
export const SM_LEDVERY_PKCE_VERIFIER_COOKIE = 'sm_ledvery_pkce_verifier'
export const SM_LEDVERY_NONCE_COOKIE = 'sm_ledvery_nonce'
export const SM_LEDVERY_ID_TOKEN_COOKIE = 'sm_ledvery_id_token'
export const SM_LEDVERY_ACCESS_TOKEN_COOKIE = 'sm_ledvery_access_token'

const FLOW_COOKIE_MAX_AGE = 60 * 10 // 10 minutes
const SESSION_COOKIE_MAX_AGE = 60 * 60 // 1 hour cap

function flowCookieOptions(): ResponseCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: FLOW_COOKIE_MAX_AGE,
  }
}

function sessionCookieOptions(maxAge?: number): ResponseCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAge ? Math.min(maxAge, SESSION_COOKIE_MAX_AGE) : SESSION_COOKIE_MAX_AGE,
  }
}

interface ResponseCookieOptions {
  httpOnly: boolean
  secure: boolean
  sameSite: 'strict' | 'lax' | 'none'
  path: string
  maxAge: number
  domain?: string
}

export interface SessionCookieOverrides {
  maxAge?: number
  domain?: string
  path?: string
  sameSite?: 'strict' | 'lax' | 'none'
  secure?: boolean
}

export function setLedveryFlowCookies(
  response: Response,
  params: { state: string; codeVerifier: string; nonce: string }
): void {
  const opts = flowCookieOptions()
  setCookie(response, SM_LEDVERY_STATE_COOKIE, params.state, opts)
  setCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE, params.codeVerifier, opts)
  setCookie(response, SM_LEDVERY_NONCE_COOKIE, params.nonce, opts)
}

export function validateAndConsumeLedveryFlowCookies(
  request: Request,
  callbackState: string | null
): { codeVerifier: string; nonce: string } | string {
  const cookieState = getCookie(request, SM_LEDVERY_STATE_COOKIE)
  const codeVerifier = getCookie(request, SM_LEDVERY_PKCE_VERIFIER_COOKIE)
  const nonce = getCookie(request, SM_LEDVERY_NONCE_COOKIE)

  if (!cookieState) return 'Missing Ledvery state cookie - session may have expired'
  if (!callbackState) return 'Missing state parameter in callback'
  if (!constantTimeEqual(cookieState, callbackState)) return 'Ledvery state mismatch - possible CSRF attack'
  if (!codeVerifier) return 'Missing PKCE verifier cookie'
  if (!nonce) return 'Missing nonce cookie'

  return { codeVerifier, nonce }
}

export interface LedverySessionData {
  idToken: string
  accessToken?: string
  claims: Record<string, unknown>
  expiresAt: string
}

export function setLedverySession(
  response: Response,
  session: LedverySessionData,
  opts?: { storeAccessToken?: boolean; cookies?: SessionCookieOverrides }
): void {
  const cookieOpts = sessionCookieOptions(opts?.cookies?.maxAge)
  if (opts?.cookies?.domain) cookieOpts.domain = opts.cookies.domain
  if (opts?.cookies?.path) cookieOpts.path = opts.cookies.path
  if (opts?.cookies?.sameSite) cookieOpts.sameSite = opts.cookies.sameSite
  if (opts?.cookies?.secure !== undefined) cookieOpts.secure = opts.cookies.secure

  const sessionPayload = JSON.stringify({
    claims: session.claims,
    expiresAt: session.expiresAt,
  })
  setCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE, sessionPayload, cookieOpts)

  if (opts?.storeAccessToken && session.accessToken) {
    setCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE, session.accessToken, cookieOpts)
  }
}

export function getLedverySession(request: Request): LedverySessionData | null {
  const raw = getCookie(request, SM_LEDVERY_ID_TOKEN_COOKIE)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as { claims: Record<string, unknown>; expiresAt: string }
    return {
      idToken: '', // not stored in cookie for size
      claims: parsed.claims,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    return null
  }
}

export function clearLedverySession(response: Response): void {
  deleteCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE)
  deleteCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE)
}

export function clearLedveryFlowCookies(response: Response): void {
  deleteCookie(response, SM_LEDVERY_STATE_COOKIE)
  deleteCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE)
  deleteCookie(response, SM_LEDVERY_NONCE_COOKIE)
}

function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') || ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

function setCookie(response: Response, name: string, value: string, opts: ResponseCookieOptions): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)}`,
  ]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (opts.secure) parts.push('Secure')
  if (opts.domain) parts.push(`Domain=${opts.domain}`)
  response.headers.append('Set-Cookie', parts.join('; '))
}

function deleteCookie(response: Response, name: string): void {
  response.headers.append('Set-Cookie', `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
}
