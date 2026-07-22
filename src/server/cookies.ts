/**
 * Cookie Utilities for Secure Session Management
 *
 * Handles HTTP-only secure cookies for authentication.
 * Tokens are never exposed to the browser.
 */

import { cookies, headers } from 'next/headers'

// ============================================================================
// Constants
// ============================================================================

export const SESSION_COOKIE_NAME = 'sm_session'
export const USER_ID_COOKIE_NAME = 'sm_user_id'
/**
 * Known accounts cookie — stores display metadata (email, name, avatar) for
 * accounts that have logged in on this device. NOT httpOnly so client JS can
 * read it to render the account switcher UI. Contains NO tokens or secrets.
 */
export const KNOWN_ACCOUNTS_COOKIE_NAME = 'sm_known_accounts'

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
  // The clear header must carry the SAME attributes as the set header:
  // in cross-site contexts (e.g. an embedded Zendesk app) browsers reject
  // any Set-Cookie that is not `SameSite=None; Secure`, so a bare
  // Max-Age=0 header is silently dropped and the session cookie survives
  // logout — embedded users could never log out (found 2026-07-19).
  const path = options.path ?? '/'
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  const sameSite = options.sameSite ?? 'lax'
  let cookie = `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=${sameSite}`

  if (secure) {
    cookie += '; Secure'
  }

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
  loginResponse: { session_token: string; user: { id: string } },
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

  if (sessionCookie?.value && userIdCookie?.value) {
    return {
      sessionToken: sessionCookie.value,
      userId: userIdCookie.value,
      expiresAt: new Date(), // Note: actual expiry is managed by ScaleMule backend
    }
  }

  // Bearer fallback for cookieless contexts (e.g. partitioned iframes in
  // embedded apps): the SDK session token is the same credential the cookie
  // carries, presented via headers instead. Custom headers cannot be sent by
  // cross-site forms (they force a CORS preflight), so this path is no more
  // CSRF-exposed than the cookie path.
  const headerStore = await headers()
  return sessionFromAuthHeaders(
    headerStore.get('authorization'),
    headerStore.get('x-sm-user-id'),
  )
}

function sessionFromAuthHeaders(
  authorization: string | null,
  userId: string | null,
): SessionData | null {
  if (!authorization || !userId) return null
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  const token = match?.[1]?.trim()
  if (!token) return null
  return {
    sessionToken: token,
    userId,
    expiresAt: new Date(),
  }
}

/**
 * Get session from a Request object (for edge/middleware)
 *
 * Use this when you need to read cookies from a Request directly.
 */
export function getSessionFromRequest(request: Request): SessionData | null {
  const cookieHeader = request.headers.get('cookie')

  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...rest] = c.trim().split('=')
        return [key, decodeURIComponent(rest.join('='))]
      })
    )

    const sessionToken = cookies[SESSION_COOKIE_NAME]
    const userId = cookies[USER_ID_COOKIE_NAME]

    if (sessionToken && userId) {
      return {
        sessionToken,
        userId,
        expiresAt: new Date(),
      }
    }
  }

  // Bearer fallback — see getSession() for the rationale.
  return sessionFromAuthHeaders(
    request.headers.get('authorization'),
    request.headers.get('x-sm-user-id'),
  )
}

// ============================================================================
// Known Accounts (Account Switcher) — metadata only, NO tokens
// ============================================================================

/**
 * Known account entry stored in cookie.
 * Contains display metadata ONLY — no tokens, no secrets.
 */
export interface KnownAccountEntry {
  userId: string
  email?: string
  fullName?: string
  avatarUrl?: string
  provider?: string
  lastActiveAt: string
  displayLabel?: string
  colorIndex?: number
}

/** Max known accounts to store */
const MAX_KNOWN_ACCOUNTS = 10;

type AccountSwitcherPrivacy = 'full' | 'masked' | 'minimal';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***@***.***';
  const tldDot = domain.lastIndexOf('.');
  const tld = tldDot > 0 ? domain.slice(tldDot) : '';
  const domainBase = tldDot > 0 ? domain.slice(0, tldDot) : domain;
  return `${local[0] || '*'}***@${domainBase[0] || '*'}***${tld}`;
}

function stableColorIndex(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 8;
}

function applyPrivacyToEntry(entry: KnownAccountEntry, privacy: AccountSwitcherPrivacy): KnownAccountEntry {
  switch (privacy) {
    case 'full':
      return entry;
    case 'masked':
      return {
        userId: entry.userId,
        email: entry.email ? maskEmail(entry.email) : undefined,
        fullName: entry.fullName ? `${entry.fullName[0].toUpperCase()}.` : undefined,
        provider: entry.provider,
        lastActiveAt: entry.lastActiveAt,
        colorIndex: stableColorIndex(entry.userId),
      };
    case 'minimal':
      return {
        userId: entry.userId,
        provider: entry.provider,
        lastActiveAt: entry.lastActiveAt,
        displayLabel: 'Account',
        colorIndex: stableColorIndex(entry.userId),
      };
  }
}

/**
 * Add an account to the known accounts cookie.
 * Called after successful login. The cookie is NOT httpOnly so client JS
 * can read it to render the account switcher UI.
 *
 * Appends Set-Cookie headers to an existing Headers object.
 */
export function appendKnownAccountCookie(
  headers: Headers,
  account: KnownAccountEntry,
  existingCookie: string | null,
  options: SessionCookieOptions = {},
  privacy?: AccountSwitcherPrivacy
): void {
  let accounts: Record<string, KnownAccountEntry> = {}

  if (existingCookie) {
    try {
      accounts = JSON.parse(decodeURIComponent(existingCookie))
    } catch {
      /* ignore corrupt cookie */
    }
  }

  // Normalize ALL existing entries through privacy filter (migrates legacy PII)
  const effectivePrivacy = privacy || 'full'
  for (const [userId, entry] of Object.entries(accounts)) {
    accounts[userId] = applyPrivacyToEntry(entry, effectivePrivacy)
  }

  // Apply privacy to the new account before adding
  accounts[account.userId] = applyPrivacyToEntry(account, effectivePrivacy)

  // Evict oldest entries if over MAX_KNOWN_ACCOUNTS
  const entries = Object.entries(accounts)
  if (entries.length > MAX_KNOWN_ACCOUNTS) {
    entries.sort((a, b) => new Date(b[1].lastActiveAt).getTime() - new Date(a[1].lastActiveAt).getTime())
    accounts = Object.fromEntries(entries.slice(0, MAX_KNOWN_ACCOUNTS))
  }

  const maxAge = 365 * 24 * 60 * 60 // 1 year — long-lived, just metadata
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  const sameSite = options.sameSite ?? 'lax'
  const path = options.path ?? '/'

  // NOT httpOnly — client JS needs to read this for the account switcher UI
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`

  if (secure) {
    cookie += '; Secure'
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }

  headers.append('Set-Cookie', cookie)
}

/**
 * Remove a specific account from the known accounts cookie.
 */
export function removeKnownAccountFromCookie(
  headers: Headers,
  userId: string,
  existingCookie: string | null,
  options: SessionCookieOptions = {}
): void {
  let accounts: Record<string, KnownAccountEntry> = {}

  if (existingCookie) {
    try {
      accounts = JSON.parse(decodeURIComponent(existingCookie))
    } catch {
      /* ignore */
    }
  }

  delete accounts[userId]

  const maxAge = 365 * 24 * 60 * 60
  const secure = options.secure ?? process.env.NODE_ENV === 'production'
  const sameSite = options.sameSite ?? 'lax'
  const path = options.path ?? '/'

  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`

  if (secure) {
    cookie += '; Secure'
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }

  headers.append('Set-Cookie', cookie)
}

/**
 * Clear the known accounts cookie entirely.
 */
export function clearKnownAccountsCookie(
  headers: Headers,
  options: SessionCookieOptions = {}
): void {
  const path = options.path ?? '/'
  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=; Path=${path}; Max-Age=0`

  if (options.domain) {
    cookie += `; Domain=${options.domain}`
  }

  headers.append('Set-Cookie', cookie)
}

/**
 * Read known accounts from a Request's cookies.
 */
export function getKnownAccountsFromRequest(request: Request): KnownAccountEntry[] {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return []

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=')
      return [key, decodeURIComponent(rest.join('='))]
    })
  )

  const raw = cookies[KNOWN_ACCOUNTS_COOKIE_NAME]
  if (!raw) return []

  try {
    const accounts = JSON.parse(raw) as Record<string, KnownAccountEntry>
    return Object.values(accounts)
  } catch {
    return []
  }
}

/**
 * Read the raw known accounts cookie value from a Request.
 */
export function getKnownAccountsCookieRaw(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null

  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [key, ...rest] = c.trim().split('=')
      return [key, decodeURIComponent(rest.join('='))]
    })
  )

  return cookies[KNOWN_ACCOUNTS_COOKIE_NAME] || null
}

/**
 * Normalize all entries in the known accounts cookie to the given privacy level.
 * Returns a Set-Cookie header string if any entries changed, or null if nothing changed.
 * Used on /me requests to migrate legacy full-PII cookies to the configured privacy level.
 */
export function normalizeKnownAccountsCookie(
  request: Request,
  privacy: AccountSwitcherPrivacy | undefined,
  options: SessionCookieOptions = {}
): string | null {
  if (!privacy || privacy === 'full') return null;

  const raw = getKnownAccountsCookieRaw(request);
  if (!raw) return null;

  let accounts: Record<string, KnownAccountEntry> = {};
  try { accounts = JSON.parse(raw); } catch { return null; }

  let changed = false;
  for (const [userId, entry] of Object.entries(accounts)) {
    const normalized = applyPrivacyToEntry(entry, privacy);
    if (JSON.stringify(normalized) !== JSON.stringify(entry)) {
      accounts[userId] = normalized;
      changed = true;
    }
  }

  if (!changed) return null;

  // Build cookie header
  const maxAge = 365 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === 'production';
  const sameSite = options.sameSite ?? 'lax';
  const path = options.path ?? '/';

  let cookie = `${KNOWN_ACCOUNTS_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(accounts))}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}`;
  if (secure) cookie += '; Secure';
  if (options.domain) cookie += `; Domain=${options.domain}`;

  return cookie;
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
