import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewsletterRoutes, newsletterRoute } from './newsletters'

const routes = createNewsletterRoutes({ apiKey: 'sk_test', gatewayUrl: 'https://api.example.com', clientContext: { trustedIpHeader: 'x-real-ip' } })
const ctx = (...action: string[]) => ({ params: Promise.resolve({ action }) })

afterEach(() => vi.unstubAllGlobals())

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response('{"success":true,"data":{"status":"check_email"}}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('newsletterRoute', () => {
  it('allows only the reader routes', () => {
    expect(newsletterRoute('POST', ['lists', 'san-ramon-times', 'subscriptions'])).toBe('lists/san-ramon-times/subscriptions')
    expect(newsletterRoute('POST', ['subscriptions', 'confirm'])).toBe('subscriptions/confirm')
    expect(newsletterRoute('PUT', ['me', 'subscriptions'])).toBe('me/subscriptions')
    expect(newsletterRoute('GET', ['admin', 'overview'])).toBeNull()
    expect(newsletterRoute('POST', ['lists', '../admin', 'subscriptions'])).toBeNull()
    expect(newsletterRoute('POST', ['lists', 'Новини', 'subscriptions'])).toBeNull()
    expect(newsletterRoute('DELETE', ['unsubscribe'])).toBeNull()
  })
})

describe('createNewsletterRoutes', () => {
  it('forwards a sign-up with the reader evidence, session and secret key', async () => {
    const fetchMock = stubFetch()
    const body = JSON.stringify({ email: 'иван@пример.рф', consent: true, origin_ref: '/news/📰' })
    const res = await routes.POST(
      new Request('https://paper.example/api/newsletters/lists/news/subscriptions', {
        method: 'POST',
        body,
        headers: { origin: 'https://paper.example', 'x-real-ip': '203.0.113.7', 'user-agent': 'Mozilla/5.0 Test', cookie: '' },
      }),
      ctx('lists', 'news', 'subscriptions')
    )
    expect(res.status).toBe(200)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/newsletters/lists/news/subscriptions')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk_test')
    expect(headers['x-sm-forwarded-client-ip']).toBe('203.0.113.7')
    expect(headers['X-Client-User-Agent']).toBe('Mozilla/5.0 Test')
    expect(init.body).toBe(body)
  })

  it('rejects cross-site writes and unknown routes without calling the gateway', async () => {
    const fetchMock = stubFetch()
    const cross = await routes.POST(
      new Request('https://paper.example/api/newsletters/unsubscribe', { method: 'POST', body: '{}', headers: { origin: 'https://evil.example' } }),
      ctx('unsubscribe')
    )
    expect(cross.status).toBe(403)
    const unknown = await routes.GET(new Request('https://paper.example/api/newsletters/admin/overview'), ctx('admin', 'overview'))
    expect(unknown.status).toBe(404)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the preference token query string', async () => {
    const fetchMock = stubFetch()
    await routes.GET(new Request(`https://paper.example/api/newsletters/preferences?token=${'a'.repeat(64)}`), ctx('preferences'))
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(`https://api.example.com/v1/newsletters/preferences?token=${'a'.repeat(64)}`)
  })
})
