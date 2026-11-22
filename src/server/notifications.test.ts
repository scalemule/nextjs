import { describe, expect, it, vi } from 'vitest'
import { createNotificationRoutes, resolveNotificationTarget } from './notifications'
import { SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'
import { TRAVERSAL_SEGMENTS } from './traversal-payloads.test-fixture'

const SESSION_COOKIE = `${SESSION_COOKIE_NAME}=sess-123; ${USER_ID_COOKIE_NAME}=user-1`
const ID = '019d7453-0000-7000-8000-0000000000aa'

function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  return new Request(`https://app.example.com/api/notifications${path}`, { ...init, headers })
}

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ action: segments.length ? segments : undefined }) }
}

function okFetch() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  )
}

function routes(fetcher: typeof fetch) {
  return createNotificationRoutes({ apiKey: 'sm_sk_server_secret', gatewayUrl: 'https://api.example.com', fetch: fetcher })
}

describe('resolveNotificationTarget', () => {
  it('allows exactly the notification operations', () => {
    expect(resolveNotificationTarget('GET', undefined)).toBe('')
    expect(resolveNotificationTarget('GET', [])).toBe('')
    expect(resolveNotificationTarget('GET', ['unread-count'])).toBe('/unread-count')
    expect(resolveNotificationTarget('PATCH', ['read-all'])).toBe('/read-all')
    expect(resolveNotificationTarget('PATCH', [ID, 'read'])).toBe(`/${ID}/read`)
    expect(resolveNotificationTarget('DELETE', [ID])).toBe(`/${ID}`)
  })

  it('refuses everything else', () => {
    expect(resolveNotificationTarget('GET', [ID])).toBeNull()
    expect(resolveNotificationTarget('DELETE', ['read-all'])).toBeNull()
    expect(resolveNotificationTarget('PATCH', [ID])).toBeNull()
    expect(resolveNotificationTarget('POST', [])).toBeNull()
    expect(resolveNotificationTarget('GET', ['a', 'b', 'c'])).toBeNull()
    for (const method of ['GET', 'PATCH', 'DELETE']) {
      for (const segments of TRAVERSAL_SEGMENTS) {
        expect(resolveNotificationTarget(method, segments), `${method} ${JSON.stringify(segments)}`).toBeNull()
      }
      expect(resolveNotificationTarget(method, ['..', 'read'])).toBeNull()
      expect(resolveNotificationTarget(method, ['../../vault/secrets', 'read'])).toBeNull()
    }
  })
})

describe('createNotificationRoutes', () => {
  it('requires a session: nothing is forwarded without one', async () => {
    const fetcher = okFetch()
    const { GET, PATCH, DELETE } = routes(fetcher as unknown as typeof fetch)
    expect((await GET(request(''), ctx())).status).toBe(401)
    expect((await GET(request('/unread-count'), ctx('unread-count'))).status).toBe(401)
    expect((await PATCH(request('/read-all', { method: 'PATCH' }), ctx('read-all'))).status).toBe(401)
    expect((await DELETE(request(`/${ID}`, { method: 'DELETE' }), ctx(ID))).status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('never forwards a traversal payload', async () => {
    const fetcher = okFetch()
    const { GET, PATCH, DELETE } = routes(fetcher as unknown as typeof fetch)
    for (const segments of TRAVERSAL_SEGMENTS) {
      for (const [handler, method] of [[GET, 'GET'], [PATCH, 'PATCH'], [DELETE, 'DELETE']] as const) {
        const res = await handler(request('/x', { method, cookie: SESSION_COOKIE, headers: { 'sec-fetch-site': 'same-origin' } }), ctx(...segments))
        expect(res.status, `${method} ${JSON.stringify(segments)}`).toBe(404)
      }
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('lists with the session and only the known query parameters', async () => {
    const fetcher = okFetch()
    const { GET } = routes(fetcher as unknown as typeof fetch)
    const res = await GET(request('?unread_only=true&limit=20&evil=../../x&cursor=abc', { cookie: SESSION_COOKIE }), ctx())
    expect(res.status).toBe(200)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/notifications?unread_only=true&limit=20&cursor=abc')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sm_sk_server_secret')
    expect(headers['Authorization']).toBe('Bearer sess-123')
    expect(init.redirect).toBe('manual')
  })

  it('does not forward a query string on non-list routes', async () => {
    const fetcher = okFetch()
    const { GET } = routes(fetcher as unknown as typeof fetch)
    await GET(request('/unread-count?x=1', { cookie: SESSION_COOKIE }), ctx('unread-count'))
    const [url] = fetcher.mock.calls[0] as unknown as [string]
    expect(url).toBe('https://api.example.com/v1/notifications/unread-count')
  })

  it('refuses cross-site writes', async () => {
    const fetcher = okFetch()
    const { PATCH, DELETE } = routes(fetcher as unknown as typeof fetch)
    const cross = { 'sec-fetch-site': 'cross-site' }
    expect((await PATCH(request('/read-all', { method: 'PATCH', cookie: SESSION_COOKIE, headers: cross }), ctx('read-all'))).status).toBe(403)
    expect((await DELETE(request(`/${ID}`, { method: 'DELETE', cookie: SESSION_COOKIE, headers: { origin: 'https://evil.example' } }), ctx(ID))).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('marks one notification read at the encoded path', async () => {
    const fetcher = okFetch()
    const { PATCH } = routes(fetcher as unknown as typeof fetch)
    const res = await PATCH(
      request(`/${ID}/read`, { method: 'PATCH', cookie: SESSION_COOKIE, headers: { 'sec-fetch-site': 'same-origin' } }),
      ctx(ID, 'read')
    )
    expect(res.status).toBe(200)
    const [url] = fetcher.mock.calls[0] as unknown as [string]
    expect(url).toBe(`https://api.example.com/v1/notifications/${ID}/read`)
  })
})
