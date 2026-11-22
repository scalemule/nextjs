import { describe, expect, it, vi } from 'vitest'
import { createPushRoutes, resolvePushTarget } from './push'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf'
import { SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'
import { TRAVERSAL_SEGMENTS } from './traversal-payloads.test-fixture'

const SESSION_COOKIE = `${SESSION_COOKIE_NAME}=sess-123; ${USER_ID_COOKIE_NAME}=user-1`
const CSRF = 'csrf-token-abc'
const TOKEN_ID = '019d7453-0000-7000-8000-000000000001'


function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  return new Request(`https://app.example.com/api/push/${path}`, { ...init, headers })
}

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ action: segments }) }
}

function okFetch() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: { ok: true } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  )
}

function routes(fetcher: typeof fetch, overrides: Partial<Parameters<typeof createPushRoutes>[0]> = {}) {
  return createPushRoutes({
    apiKey: 'sm_sk_server_secret',
    gatewayUrl: 'https://api.example.com/',
    publishableKey: 'sm_pb_public',
    fetch: fetcher,
    ...overrides,
  })
}

const csrfHeaders = (extra: Record<string, string> = {}) => ({
  [CSRF_HEADER_NAME]: CSRF,
  'sec-fetch-site': 'same-origin',
  'content-type': 'application/json',
  ...extra,
})
const csrfCookie = (base = SESSION_COOKIE) => `${base}; ${CSRF_COOKIE_NAME}=${CSRF}`

describe('resolvePushTarget', () => {
  it('allows exactly the hook operations', () => {
    expect(resolvePushTarget('GET', ['settings', 'me'])).toEqual({ path: 'settings/me', anonymous: true })
    expect(resolvePushTarget('POST', ['register'])).toEqual({ path: 'register', anonymous: true })
    expect(resolvePushTarget('DELETE', ['tokens', 'by-id', TOKEN_ID])).toEqual({ path: `tokens/by-id/${TOKEN_ID}`, anonymous: true })
    expect(resolvePushTarget('PUT', ['tokens', 'by-id', TOKEN_ID, 'user'])).toEqual({ path: `tokens/by-id/${TOKEN_ID}/user`, anonymous: false })
    expect(resolvePushTarget('DELETE', ['tokens', 'by-id', TOKEN_ID, 'user'])).toEqual({ path: `tokens/by-id/${TOKEN_ID}/user`, anonymous: false })
    expect(resolvePushTarget('PUT', ['tokens', 'by-id', TOKEN_ID, 'notifications'])).toEqual({ path: `tokens/by-id/${TOKEN_ID}/notifications`, anonymous: false })
    expect(resolvePushTarget('GET', ['preferences'])).toEqual({ path: 'preferences', anonymous: false })
    expect(resolvePushTarget('PUT', ['preferences'])).toEqual({ path: 'preferences', anonymous: false })
  })

  it('refuses app-level operations and wrong methods', () => {
    expect(resolvePushTarget('PUT', ['settings', 'me'])).toBeNull()
    expect(resolvePushTarget('GET', ['register'])).toBeNull()
    expect(resolvePushTarget('POST', ['send'])).toBeNull()
    expect(resolvePushTarget('POST', ['send', 'broadcast'])).toBeNull()
    expect(resolvePushTarget('POST', ['send', 'silent'])).toBeNull()
    expect(resolvePushTarget('POST', ['send', 'topic', 'abc'])).toBeNull()
    expect(resolvePushTarget('GET', ['tokens'])).toBeNull()
    expect(resolvePushTarget('GET', ['settings'])).toBeNull()
    expect(resolvePushTarget('GET', ['routing', 'providers'])).toBeNull()
    expect(resolvePushTarget('POST', ['campaigns'])).toBeNull()
    expect(resolvePushTarget('GET', [])).toBeNull()
    expect(resolvePushTarget('GET', undefined)).toBeNull()
    expect(resolvePushTarget('GET', 'settings/me')).toBeNull()
  })

  it('refuses every traversal payload for every method', () => {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      for (const segments of TRAVERSAL_SEGMENTS) {
        expect(resolvePushTarget(method, segments), `${method} ${JSON.stringify(segments)}`).toBeNull()
      }
    }
  })
})

describe('createPushRoutes', () => {
  it('never forwards a traversal payload, signed in or not', async () => {
    const fetcher = okFetch()
    const { GET, POST, PUT, DELETE } = routes(fetcher as unknown as typeof fetch, { csrf: false })
    for (const segments of TRAVERSAL_SEGMENTS) {
      for (const [handler, method] of [[GET, 'GET'], [POST, 'POST'], [PUT, 'PUT'], [DELETE, 'DELETE']] as const) {
        const res = await handler(
          request('x', { method, cookie: SESSION_COOKIE, headers: { 'sec-fetch-site': 'same-origin' } }),
          ctx(...segments)
        )
        expect(res.status, `${method} ${JSON.stringify(segments)}`).toBe(404)
      }
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('signed in: sends the secret key only with the user session, to the exact encoded path', async () => {
    const fetcher = okFetch()
    const { PUT } = routes(fetcher as unknown as typeof fetch)
    const res = await PUT(
      request(`tokens/by-id/${TOKEN_ID}/user`, { method: 'PUT', cookie: csrfCookie(), headers: csrfHeaders(), body: '{}' }),
      ctx('tokens', 'by-id', TOKEN_ID, 'user')
    )
    expect(res.status).toBe(200)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.example.com/v1/communication/push/tokens/by-id/${TOKEN_ID}/user`)
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sm_sk_server_secret')
    expect(headers['Authorization']).toBe('Bearer sess-123')
    expect(init.redirect).toBe('manual')
  })

  it('signed out: anonymous operations use the publishable key, never the secret key', async () => {
    const fetcher = okFetch()
    const { GET } = routes(fetcher as unknown as typeof fetch)
    const res = await GET(request('settings/me'), ctx('settings', 'me'))
    expect(res.status).toBe(200)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/communication/push/settings/me')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sm_pb_public')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('signed out: refuses anonymous operations when no publishable key is configured', async () => {
    const prev = process.env.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY
    delete process.env.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY
    try {
      const fetcher = okFetch()
      const { GET } = routes(fetcher as unknown as typeof fetch, { publishableKey: undefined })
      const res = await GET(request('settings/me'), ctx('settings', 'me'))
      expect(res.status).toBe(401)
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY = prev
    }
  })

  it('signed out: refuses a secret key passed as the publishable key', async () => {
    const fetcher = okFetch()
    const { GET } = routes(fetcher as unknown as typeof fetch, { publishableKey: 'sm_sk_oops' })
    const res = await GET(request('settings/me'), ctx('settings', 'me'))
    expect(res.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('signed out: session-only operations are 401 and not forwarded', async () => {
    const fetcher = okFetch()
    const { PUT, DELETE } = routes(fetcher as unknown as typeof fetch, { csrf: false })
    const sameOrigin = { 'sec-fetch-site': 'same-origin' }
    expect((await PUT(request('x', { method: 'PUT', headers: sameOrigin, body: '{}' }), ctx('tokens', 'by-id', TOKEN_ID, 'user'))).status).toBe(401)
    expect((await DELETE(request('x', { method: 'DELETE', headers: sameOrigin }), ctx('tokens', 'by-id', TOKEN_ID, 'user'))).status).toBe(401)
    expect((await PUT(request('x', { method: 'PUT', headers: sameOrigin, body: '{}' }), ctx('preferences'))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses cross-site writes even with a matching CSRF cookie and header', async () => {
    const fetcher = okFetch()
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const crossSite = await POST(
      request('register', { method: 'POST', cookie: csrfCookie(), headers: csrfHeaders({ 'sec-fetch-site': 'cross-site' }), body: '{}' }),
      ctx('register')
    )
    expect(crossSite.status).toBe(403)
    const foreignOrigin = new Headers(csrfHeaders())
    foreignOrigin.delete('sec-fetch-site')
    foreignOrigin.set('origin', 'https://evil.example')
    const viaOrigin = await POST(
      request('register', { method: 'POST', cookie: csrfCookie(), headers: foreignOrigin, body: '{}' }),
      ctx('register')
    )
    expect(viaOrigin.status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('still requires the double-submit CSRF token on writes', async () => {
    const fetcher = okFetch()
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const res = await POST(
      request('register', { method: 'POST', cookie: SESSION_COOKIE, headers: { 'sec-fetch-site': 'same-origin' }, body: '{}' }),
      ctx('register')
    )
    expect(res.status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not forward caller workspace or forwarding headers', async () => {
    const fetcher = okFetch()
    const { POST } = routes(fetcher as unknown as typeof fetch)
    await POST(
      request('register', {
        method: 'POST',
        cookie: csrfCookie(),
        headers: csrfHeaders({ 'x-sm-workspace-id': 'ws-evil', 'x-app-id': 'other-app' }),
        body: JSON.stringify({ token: 't', platform: 'web' }),
      }),
      ctx('register')
    )
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-sm-workspace-id']).toBeUndefined()
    expect(headers['x-app-id']).toBeUndefined()
    expect(init.body).toBe(JSON.stringify({ token: 't', platform: 'web' }))
  })

  it('refuses oversized bodies and upstream redirects', async () => {
    const fetcher = okFetch()
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const big = await POST(
      request('register', { method: 'POST', cookie: csrfCookie(), headers: csrfHeaders(), body: 'x'.repeat(70 * 1024) }),
      ctx('register')
    )
    expect(big.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()

    const redirecting = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere' } }))
    const { GET } = routes(redirecting as unknown as typeof fetch)
    const res = await GET(request('settings/me', { cookie: SESSION_COOKIE }), ctx('settings', 'me'))
    expect(res.status).toBe(502)
  })
})
