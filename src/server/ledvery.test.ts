import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateAuthorizationUrl = vi.fn()
const mockExchangeCode = vi.fn()

vi.mock('@scalemule/ledvery', () => {
  return {
    LedveryClient: class MockLedveryClient {
      constructor() {
        // no-op
      }
      createAuthorizationUrl = mockCreateAuthorizationUrl
      exchangeCode = mockExchangeCode
    },
  }
})

import { createLedveryRoutes } from './ledvery'

const BASE_CONFIG = {
  issuer: 'https://id.ledvery.com',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://example.com/api/auth/ledvery/callback',
  postLoginRedirect: '/dashboard',
  postLogoutRedirect: '/goodbye',
}

function createRequest(action: string, opts?: {
  cookies?: Record<string, string>
  query?: Record<string, string>
}): Request {
  const url = new URL(`https://example.com/api/auth/ledvery/${action}`)
  if (opts?.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      url.searchParams.set(k, v)
    }
  }
  const cookieHeader = opts?.cookies
    ? Object.entries(opts.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ')
    : ''
  return new Request(url.toString(), {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  })
}

function routeContext(action: string) {
  return { params: Promise.resolve({ action: [action] }) }
}

function getSetCookies(response: Response): string[] {
  const all: string[] = []
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') all.push(value)
  })
  return all
}

function parseCookieName(setCookie: string): string {
  return setCookie.split('=')[0]
}

describe('createLedveryRoutes', () => {
  let routes: ReturnType<typeof createLedveryRoutes>

  beforeEach(() => {
    vi.clearAllMocks()
    routes = createLedveryRoutes(BASE_CONFIG)
  })

  describe('/login', () => {
    it('redirects to the Ledvery authorize URL and sets flow cookies', async () => {
      mockCreateAuthorizationUrl.mockResolvedValue({
        url: 'https://id.ledvery.com/oidc/authorize?client_id=test&state=abc123',
        state: 'abc123',
        codeVerifier: 'verifier-xyz',
        codeChallenge: 'challenge-xyz',
        nonce: 'nonce-456',
      })

      const request = createRequest('login')
      const response = await routes.GET(request, routeContext('login'))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        'https://id.ledvery.com/oidc/authorize?client_id=test&state=abc123'
      )

      const cookies = getSetCookies(response)
      const cookieNames = cookies.map(parseCookieName)
      expect(cookieNames).toContain('sm_ledvery_state')
      expect(cookieNames).toContain('sm_ledvery_pkce_verifier')
      expect(cookieNames).toContain('sm_ledvery_nonce')

      const stateCookie = cookies.find(c => c.startsWith('sm_ledvery_state='))!
      expect(stateCookie).toContain('HttpOnly')
      expect(stateCookie).toContain('SameSite=Lax')
      expect(stateCookie).toContain('Max-Age=600')
    })

    it('stores returnTo in a cookie when provided', async () => {
      mockCreateAuthorizationUrl.mockResolvedValue({
        url: 'https://id.ledvery.com/oidc/authorize?state=s1',
        state: 's1',
        codeVerifier: 'v1',
        codeChallenge: 'c1',
        nonce: 'n1',
      })

      const request = createRequest('login', { query: { returnTo: '/settings' } })
      const response = await routes.GET(request, routeContext('login'))

      const cookies = getSetCookies(response)
      const returnToCookie = cookies.find(c => c.startsWith('sm_ledvery_return_to='))
      expect(returnToCookie).toBeDefined()
      expect(returnToCookie).toContain(encodeURIComponent('/settings'))
    })

    it('rejects absolute URL returnTo (open redirect)', async () => {
      mockCreateAuthorizationUrl.mockResolvedValue({
        url: 'https://id.ledvery.com/oidc/authorize?state=s2',
        state: 's2',
        codeVerifier: 'v2',
        codeChallenge: 'c2',
        nonce: 'n2',
      })

      const request = createRequest('login', { query: { returnTo: 'https://evil.com' } })
      const response = await routes.GET(request, routeContext('login'))

      const cookies = getSetCookies(response)
      const returnToCookie = cookies.find(c => c.startsWith('sm_ledvery_return_to='))
      expect(returnToCookie).toBeUndefined()
    })

    it('rejects protocol-relative returnTo (open redirect)', async () => {
      mockCreateAuthorizationUrl.mockResolvedValue({
        url: 'https://id.ledvery.com/oidc/authorize?state=s3',
        state: 's3',
        codeVerifier: 'v3',
        codeChallenge: 'c3',
        nonce: 'n3',
      })

      const request = createRequest('login', { query: { returnTo: '//evil.com' } })
      const response = await routes.GET(request, routeContext('login'))

      const cookies = getSetCookies(response)
      const returnToCookie = cookies.find(c => c.startsWith('sm_ledvery_return_to='))
      expect(returnToCookie).toBeUndefined()
    })
  })

  describe('/callback', () => {
    it('returns 403 when state cookie is missing', async () => {
      const request = createRequest('callback', {
        query: { code: 'auth-code', state: 'abc123' },
      })
      const response = await routes.GET(request, routeContext('callback'))

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('state_mismatch')
    })

    it('returns 403 when state does not match (constant-time path)', async () => {
      const request = createRequest('callback', {
        query: { code: 'auth-code', state: 'wrong-state' },
        cookies: {
          sm_ledvery_state: 'correct-state',
          sm_ledvery_pkce_verifier: 'verifier',
          sm_ledvery_nonce: 'nonce',
        },
      })
      const response = await routes.GET(request, routeContext('callback'))

      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('state_mismatch')
      expect(body.message).toContain('mismatch')
    })

    it('exchanges code and sets session cookies on success', async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      mockExchangeCode.mockResolvedValue({
        accessToken: 'at-123',
        idToken: 'idt-456',
        claims: {
          iss: 'https://id.ledvery.com',
          sub: 'user-789',
          aud: 'test-client-id',
          exp: Math.floor(expiresAt.getTime() / 1000),
          iat: Math.floor(Date.now() / 1000),
          email: 'user@example.com',
          email_verified: true,
          name: 'Test User',
        },
        expiresAt,
        scope: 'openid email profile',
      })

      const state = 'matching-state'
      const request = createRequest('callback', {
        query: { code: 'auth-code', state },
        cookies: {
          sm_ledvery_state: state,
          sm_ledvery_pkce_verifier: 'my-verifier',
          sm_ledvery_nonce: 'my-nonce',
        },
      })

      const response = await routes.GET(request, routeContext('callback'))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/dashboard')

      expect(mockExchangeCode).toHaveBeenCalledWith({
        code: 'auth-code',
        codeVerifier: 'my-verifier',
        receivedState: state,
        expectedState: state,
        expectedNonce: 'my-nonce',
      })

      const cookies = getSetCookies(response)
      const sessionCookie = cookies.find(c => c.startsWith('sm_ledvery_id_token='))
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie).toContain('HttpOnly')

      // Flow cookies should be cleared
      const clearedCookies = cookies.filter(c => c.includes('Max-Age=0'))
      const clearedNames = clearedCookies.map(parseCookieName)
      expect(clearedNames).toContain('sm_ledvery_state')
      expect(clearedNames).toContain('sm_ledvery_pkce_verifier')
      expect(clearedNames).toContain('sm_ledvery_nonce')
    })

    it('stores access token cookie only when storeAccessToken is true', async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      mockExchangeCode.mockResolvedValue({
        accessToken: 'at-123',
        idToken: 'idt-456',
        claims: { iss: 'https://id.ledvery.com', sub: 'user-789', aud: 'test-client-id', exp: Math.floor(expiresAt.getTime() / 1000), iat: Math.floor(Date.now() / 1000) },
        expiresAt,
        scope: 'openid',
      })

      const state = 'st'
      const configWithAccessToken = { ...BASE_CONFIG, storeAccessToken: true }
      const routesWithAt = createLedveryRoutes(configWithAccessToken)

      const request = createRequest('callback', {
        query: { code: 'c', state },
        cookies: { sm_ledvery_state: state, sm_ledvery_pkce_verifier: 'v', sm_ledvery_nonce: 'n' },
      })
      const response = await routesWithAt.GET(request, routeContext('callback'))
      const cookies = getSetCookies(response)
      const atCookie = cookies.find(c => c.startsWith('sm_ledvery_access_token='))
      expect(atCookie).toBeDefined()
    })

    it('redirects to postLoginRedirect when returnTo cookie is tampered (open redirect)', async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000)
      mockExchangeCode.mockResolvedValue({
        accessToken: 'at-tampered',
        idToken: 'idt-tampered',
        claims: { iss: 'https://id.ledvery.com', sub: 'user-789', aud: 'test-client-id', exp: Math.floor(expiresAt.getTime() / 1000), iat: Math.floor(Date.now() / 1000) },
        expiresAt,
        scope: 'openid',
      })

      const state = 'tampered-state'
      const request = createRequest('callback', {
        query: { code: 'auth-code', state },
        cookies: {
          sm_ledvery_state: state,
          sm_ledvery_pkce_verifier: 'v',
          sm_ledvery_nonce: 'n',
          sm_ledvery_return_to: 'https://evil.com',
        },
      })
      const response = await routes.GET(request, routeContext('callback'))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/dashboard')
    })

    it('returns 403 when code is missing (error from IdP)', async () => {
      const request = createRequest('callback', {
        query: { error: 'access_denied', error_description: 'User denied consent' },
      })
      const response = await routes.GET(request, routeContext('callback'))
      expect(response.status).toBe(403)
      const body = await response.json()
      expect(body.error).toBe('access_denied')
    })
  })

  describe('/session', () => {
    it('returns null session when no cookie is present', async () => {
      const request = createRequest('session')
      const response = await routes.GET(request, routeContext('session'))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.session).toBeNull()
    })

    it('returns session claims when a valid cookie is present', async () => {
      const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString()
      const sessionPayload = JSON.stringify({
        claims: {
          sub: 'user-789',
          email: 'user@example.com',
          email_verified: true,
          name: 'Test User',
          idp: 'google',
        },
        expiresAt,
      })

      const request = createRequest('session', {
        cookies: { sm_ledvery_id_token: sessionPayload },
      })
      const response = await routes.GET(request, routeContext('session'))
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.session).not.toBeNull()
      expect(body.session.sub).toBe('user-789')
      expect(body.session.email).toBe('user@example.com')
      expect(body.session.name).toBe('Test User')
      expect(body.session.idp).toBe('google')
      expect(body.session.expiresAt).toBe(expiresAt)
    })

    it('returns null session when cookie is expired', async () => {
      const expiresAt = new Date(Date.now() - 1000).toISOString()
      const sessionPayload = JSON.stringify({
        claims: { sub: 'user-789' },
        expiresAt,
      })

      const request = createRequest('session', {
        cookies: { sm_ledvery_id_token: sessionPayload },
      })
      const response = await routes.GET(request, routeContext('session'))
      const body = await response.json()
      expect(body.session).toBeNull()
    })
  })

  describe('/logout', () => {
    it('redirects to postLogoutRedirect and clears session cookies', async () => {
      const request = createRequest('logout')
      const response = await routes.GET(request, routeContext('logout'))

      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe('/goodbye')

      const cookies = getSetCookies(response)
      const clearedNames = cookies.filter(c => c.includes('Max-Age=0')).map(parseCookieName)
      expect(clearedNames).toContain('sm_ledvery_id_token')
      expect(clearedNames).toContain('sm_ledvery_access_token')
    })
  })

  describe('unknown route', () => {
    it('returns 404 for unknown actions', async () => {
      const request = createRequest('unknown')
      const response = await routes.GET(request, routeContext('unknown'))
      expect(response.status).toBe(404)
    })
  })
})
