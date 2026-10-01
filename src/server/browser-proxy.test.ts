import { beforeEach, describe, expect, it, vi } from 'vitest'
const session = vi.hoisted(() => vi.fn())
vi.mock('./cookies', async importOriginal => ({ ...await importOriginal<typeof import('./cookies')>(), getSession: session }))
import { browserProxy } from './browser-proxy'
const config = { publishableKey: 'sm_pb_test_app', client: { gatewayUrl: 'https://api.example.com' }, cookies: { secure: true } }
const fetcher = vi.fn()
function request(path = 'v1/storage/files', extra: RequestInit = {}) {
  return new Request(`https://app.example.com/api/auth/client/${path}`, {
    headers: { 'x-api-key': config.publishableKey, 'sec-fetch-site': 'same-origin', ...Object.fromEntries(new Headers(extra.headers)) },
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')),
  })
}
beforeEach(() => {
  session.mockResolvedValue({ sessionToken: 'cookie-secret', userId: 'user-one' })
  fetcher.mockReset().mockResolvedValue(Response.json({ success: true, data: { files: [] } }))
  vi.stubGlobal('fetch', fetcher)
})
describe('cookie-authenticated browser proxy', () => {
  it('forwards only the configured publishable key and cookie session', async () => {
    const response = await browserProxy(request(undefined, { headers: { Authorization: 'Bearer injected', 'x-app-id': 'other-tenant', 'x-sm-internal-token': 'forged', 'x-sm-forwarded-client-ip': 'fake' } }), ['v1', 'storage', 'files'], config)
    expect(response.status).toBe(200)
    const [url, init] = fetcher.mock.calls[0]
    expect(url.toString()).toBe('https://api.example.com/v1/storage/files')
    expect(init.headers.get('authorization')).toBe('Bearer cookie-secret')
    expect(session).toHaveBeenCalledWith({ allowBearer: false })
    expect(init.headers.get('x-api-key')).toBe(config.publishableKey)
    for (const name of ['cookie', 'x-app-id', 'x-sm-internal-token', 'x-sm-forwarded-client-ip']) expect(init.headers.has(name)).toBe(false)
    expect(init.redirect).toBe('error')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('mints tickets on the configured public gateway, preserving the browser routing path', async () => {
    await browserProxy(request('v1/realtime/ws/ticket', { method: 'POST', headers: { origin: 'https://app.example.com' } }), ['v1', 'realtime', 'ws', 'ticket'], { ...config, browserGatewayUrl: 'https://public.example.com' })
    expect(fetcher.mock.calls[0][0].origin).toBe('https://public.example.com')
    expect(fetcher.mock.calls[0][1].headers.get('origin')).toBe('https://app.example.com')
  })
  it('rejects cross-origin requests and other tenant keys before sending credentials', async () => {
    for (const headers of [{ 'sec-fetch-site': 'cross-site', origin: 'https://attacker.example' }, { 'x-api-key': 'sm_pb_other_app' }, { 'x-api-key': '' }] as Record<string, string>[]) {
      expect((await browserProxy(request(undefined, { headers }), ['v1', 'storage', 'files'], config)).status).toBe(403)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('never uses secret keys or allows platform and session-issuing auth paths', async () => {
    expect((await browserProxy(request(), ['v1', 'storage', 'files'], { ...config, publishableKey: 'sm_sk_server' })).status).toBe(503)
    for (const path of [['v1', 'ops', 'deployments'], ['v1', 'auth', 'login'], ['v1', 'storage', '..', 'auth'], ['v1', 'storage', '%2e%2e'], ['v1', 'storage', 'a/b']]) {
      expect((await browserProxy(request(), path, config)).status).toBe(404)
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires a live cookie session for data requests', async () => {
    session.mockResolvedValue(null)
    expect((await browserProxy(request(), ['v1', 'storage', 'files'], config)).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('consumes rotation into HTTP-only cookies without leaking headers', async () => {
    fetcher.mockResolvedValue(Response.json({ ticket: 'short-lived-ticket' }, { headers: { 'x-rotated-session-token': 'rotated-secret', 'set-cookie': 'upstream=secret' } }))
    const response = await browserProxy(request('v1/realtime/ws/ticket', { method: 'POST' }), ['v1', 'realtime', 'ws', 'ticket'], config)
    expect(response.headers.get('x-rotated-session-token')).toBeNull()
    expect(response.headers.getSetCookie().join(';')).toContain('sm_session=rotated-secret')
    expect(response.headers.getSetCookie().join(';')).toContain('HttpOnly')
    expect(response.headers.getSetCookie().join(';')).not.toContain('upstream=')
    expect(await response.json()).toEqual({ ticket: 'short-lived-ticket' })
  })
  it('consumes OAuth login credentials into a cookie and returns only identity', async () => {
    session.mockResolvedValue(null)
    fetcher.mockResolvedValue(Response.json({ success: true, data: { session_token: 'oauth-secret', refresh_token: 'refresh-secret', user: { id: 'oauth-user' } } }))
    const response = await browserProxy(request('v1/auth/oauth/callback', { method: 'POST' }), ['v1', 'auth', 'oauth', 'callback'], config)
    expect(await response.json()).toEqual({ success: true, data: { authenticated: true, user: { id: 'oauth-user' } } })
    expect(response.headers.getSetCookie().join(';')).toContain('sm_session=oauth-secret')
  })
})

it.each([['PATCH', 'profile'], ['POST', 'change-password'], ['POST', 'change-email'], ['POST', 'delete-account'], ['POST', 'export-data']])('preserves authenticated useUser operation %s %s', async (method, operation) => {
  const response = await browserProxy(request(`v1/auth/${operation}`, { method }), ['v1', 'auth', operation], config)
  expect(response.status).toBe(200)
  expect(fetcher.mock.calls[0][1].headers.get('authorization')).toBe('Bearer cookie-secret')
  if (operation === 'delete-account') {
    expect(response.headers.getSetCookie()).toHaveLength(2)
    expect(response.headers.getSetCookie().every(c => c.includes('Max-Age=0'))).toBe(true)
  }
})

it('preserves anonymous flag evaluation without adding an identity', async () => {
  session.mockResolvedValue(null)
  const response = await browserProxy(request('v1/flags/evaluate/all', { method: 'POST' }), ['v1', 'flags', 'evaluate', 'all'], config)
  expect(response.status).toBe(200)
  expect(fetcher.mock.calls[0][1].headers.has('authorization')).toBe(false)
  expect(fetcher.mock.calls[0][1].headers.get('x-api-key')).toBe(config.publishableKey)
})


it.each([204, 205, 304])('preserves bodyless auth status %s and consumes rotation securely', async (status) => {
  fetcher.mockResolvedValueOnce(new Response(null, { status, headers: { 'x-rotated-session-token': 'replacement-secret' } }))
  const response = await browserProxy(request('v1/auth/me'), ['v1', 'auth', 'me'], config)
  expect(response.status).toBe(status)
  expect(await response.text()).toBe('')
  expect(response.headers.get('x-rotated-session-token')).toBeNull()
  expect(response.headers.getSetCookie().join(';')).toContain('sm_session=replacement-secret')
})

it('clears cookies when account deletion returns 204', async () => {
  fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }))
  const response = await browserProxy(request('v1/auth/delete-account', { method: 'POST' }), ['v1', 'auth', 'delete-account'], config)
  expect(response.status).toBe(204)
  expect(response.headers.getSetCookie()).toHaveLength(2)
  expect(response.headers.getSetCookie().every(c => c.includes('Max-Age=0'))).toBe(true)
})
