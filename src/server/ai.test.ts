import { describe, expect, it, vi } from 'vitest'
import { createAiRoutes, createServiceAiClient, resolveAiTarget } from './ai'
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './csrf'
import { SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'

const SESSION_COOKIE = `${SESSION_COOKIE_NAME}=sess-123; ${USER_ID_COOKIE_NAME}=user-1`

function request(path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  return new Request(`https://app.example.com/api/ai/${path}`, { ...init, headers })
}

function ctx(...segments: string[]) {
  return { params: Promise.resolve({ action: segments }) }
}

function upstreamJson(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_abc', ...headers },
    })
  )
}

function routes(fetcher: typeof fetch, overrides: Partial<Parameters<typeof createAiRoutes>[0]> = {}) {
  return createAiRoutes({
    apiKey: 'sk_server',
    gatewayUrl: 'https://api.example.com/',
    accountId: 'acct-config',
    csrf: false,
    fetch: fetcher,
    ...overrides,
  })
}

describe('resolveAiTarget', () => {
  it('allows only the facade surface', () => {
    expect(resolveAiTarget('POST', ['runs'])).toEqual({ kind: 'create' })
    expect(resolveAiTarget('GET', ['runs'])).toBeNull()
    expect(resolveAiTarget('GET', ['runs', 'r1'])).toEqual({ kind: 'get', runId: 'r1' })
    expect(resolveAiTarget('POST', ['runs', 'r1'])).toBeNull()
    expect(resolveAiTarget('GET', ['runs', 'r1', 'events'])).toEqual({ kind: 'events', runId: 'r1' })
    expect(resolveAiTarget('POST', ['runs', 'r1', 'cancel'])).toEqual({ kind: 'cancel', runId: 'r1' })
    expect(resolveAiTarget('GET', ['runs', 'r1', 'cancel'])).toBeNull()
    expect(resolveAiTarget('POST', ['runs', '../admin', 'cancel'])).toBeNull()
  })

  it('allow-lists the operation selection routes with the option-key grammar', () => {
    expect(resolveAiTarget('GET', ['operations'])).toEqual({ kind: 'operations' })
    expect(resolveAiTarget('POST', ['operations'])).toBeNull()
    expect(resolveAiTarget('PUT', ['operations', 'summarize', 'preference'])).toEqual({ kind: 'preference', method: 'PUT', operation: 'summarize' })
    expect(resolveAiTarget('DELETE', ['operations', 'summarize', 'preference'])).toEqual({ kind: 'preference', method: 'DELETE', operation: 'summarize' })
    expect(resolveAiTarget('GET', ['operations', 'summarize', 'preference'])).toBeNull()
    expect(resolveAiTarget('GET', ['operations', 'summarize', 'settings'])).toEqual({ kind: 'settings', method: 'GET', operation: 'summarize' })
    expect(resolveAiTarget('PUT', ['operations', 'summarize', 'settings'])).toEqual({ kind: 'settings', method: 'PUT', operation: 'summarize' })
    expect(resolveAiTarget('DELETE', ['operations', 'summarize', 'settings'])).toBeNull()
    expect(resolveAiTarget('PUT', ['operations', 'Summarize', 'preference'])).toBeNull()
    expect(resolveAiTarget('PUT', ['operations', '../admin', 'preference'])).toBeNull()
    expect(resolveAiTarget('PUT', ['operations', 'summarize', 'preference', 'x'])).toBeNull()
    expect(resolveAiTarget('GET', ['operations', 'summarize'])).toBeNull()
    expect(resolveAiTarget('GET', [])).toBeNull()
  })
})

describe('createAiRoutes', () => {
  it('rejects requests without a session before touching the gateway', async () => {
    const fetcher = upstreamJson(200, {})
    const { GET, POST } = routes(fetcher as unknown as typeof fetch)
    const get = await GET(request('runs/r1'), ctx('runs', 'r1'))
    const post = await POST(
      request('runs', { method: 'POST', body: '{}', headers: { 'x-idempotency-key': 'k' } }),
      ctx('runs')
    )
    expect(get.status).toBe(401)
    expect(post.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('does not accept a browser bearer token in place of the session cookie', async () => {
    const fetcher = upstreamJson(200, {})
    const { GET } = routes(fetcher as unknown as typeof fetch)
    const response = await GET(
      request('runs/r1', { headers: { authorization: 'Bearer attacker-token', 'x-sm-user-id': 'user-9' } }),
      ctx('runs', 'r1')
    )
    expect(response.status).toBe(401)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects oversized bodies by declared and actual byte length', async () => {
    const fetcher = upstreamJson(202, {})
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const declared = await POST(
      request('runs', { method: 'POST', cookie: SESSION_COOKIE, body: '{}', headers: { 'x-idempotency-key': 'k', 'content-length': String(2 * 1024 * 1024) } }),
      ctx('runs')
    )
    expect(declared.status).toBe(413)
    const actual = await POST(
      request('runs', { method: 'POST', cookie: SESSION_COOKIE, body: JSON.stringify({ text: '😀'.repeat(300_000) }), headers: { 'x-idempotency-key': 'k' } }),
      ctx('runs')
    )
    expect(actual.status).toBe(413)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('returns 404 for anything outside the allow-list without forwarding', async () => {
    const fetcher = upstreamJson(200, {})
    const { GET, POST } = routes(fetcher as unknown as typeof fetch)
    expect((await GET(request('runs', { cookie: SESSION_COOKIE }), ctx('runs'))).status).toBe(404)
    expect((await GET(request('offerings', { cookie: SESSION_COOKIE }), ctx('offerings'))).status).toBe(404)
    expect((await GET(request('operations/summarize', { cookie: SESSION_COOKIE }), ctx('operations', 'summarize'))).status).toBe(404)
    expect(
      (await POST(request('runs/r1/approve', { method: 'POST', cookie: SESSION_COOKIE }), ctx('runs', 'r1', 'approve'))).status
    ).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('proxies a create with server credentials and only the allowed browser headers', async () => {
    const fetcher = upstreamJson(202, { success: true, data: { id: 'r1', status: 'queued' } }, { 'retry-after': '2' })
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const response = await POST(
      request('runs', {
        method: 'POST',
        cookie: SESSION_COOKIE,
        body: JSON.stringify({ operation: 'summarize', input: { text: 'hi' } }),
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': 'ai_1',
          origin: 'https://evil.example.com',
          'x-sm-workspace-id': 'forged-ws',
          'x-requested-account-id': 'forged-acct',
          'x-app-id': 'forged-app',
          'x-sm-internal-token': 'forged',
          'x-forwarded-for': '203.0.113.9',
          'user-agent': 'TestBrowser/1.0',
        },
      }),
      ctx('runs')
    )
    expect(response.status).toBe(202)
    expect(response.headers.get('x-request-id')).toBe('req_abc')
    expect(response.headers.get('retry-after')).toBe('2')
    expect(await response.json()).toEqual({ success: true, data: { id: 'r1', status: 'queued' } })

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/ai/runs')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('error')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk_server')
    expect(headers['authorization']).toBe('Bearer sess-123')
    expect(headers['x-requested-account-id']).toBe('acct-config')
    expect(headers['x-idempotency-key']).toBe('ai_1')
    expect(headers['content-type']).toBe('application/json')
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
    for (const forbidden of ['origin', 'x-sm-workspace-id', 'x-app-id', 'x-sm-internal-token', 'cookie']) {
      expect(lower[forbidden]).toBeUndefined()
    }
    expect(init.body).toBe(JSON.stringify({ operation: 'summarize', input: { text: 'hi' } }))
  })

  it('requires an idempotency key on create', async () => {
    const fetcher = upstreamJson(202, {})
    const { POST } = routes(fetcher as unknown as typeof fetch)
    const response = await POST(request('runs', { method: 'POST', cookie: SESSION_COOKIE, body: '{}' }), ctx('runs'))
    expect(response.status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('resolves the account per request and never from the browser', async () => {
    const fetcher = upstreamJson(200, { success: true, data: {} })
    const resolver = vi.fn(async (_request: Request, session: { userId: string }) => `acct-for-${session.userId}`)
    const { GET } = routes(fetcher as unknown as typeof fetch, { accountId: resolver })
    await GET(request('runs/r1', { cookie: SESSION_COOKIE, headers: { 'x-requested-account-id': 'forged' } }), ctx('runs', 'r1'))
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-requested-account-id']).toBe('acct-for-user-1')
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it('passes event streams through untouched and forwards Last-Event-ID', async () => {
    const payload = 'id: 2\nevent: running\ndata: {"sequence":2}\n\nevent: end\ndata: terminal\n\n'
    const fetcher = vi.fn(async () =>
      new Response(new TextEncoder().encode(payload), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    )
    const { GET } = routes(fetcher as unknown as typeof fetch)
    const response = await GET(
      request('runs/r1/events?after=1', { cookie: SESSION_COOKIE, headers: { 'last-event-id': '1' } }),
      ctx('runs', 'r1', 'events')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(await response.text()).toBe(payload)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/ai/runs/r1/events?after=1')
    expect((init.headers as Record<string, string>)['last-event-id']).toBe('1')
    expect((init.headers as Record<string, string>)['accept']).toBe('text/event-stream')
  })

  it('enforces CSRF on POST by default', async () => {
    const fetcher = upstreamJson(202, {})
    const { POST } = createAiRoutes({ apiKey: 'sk', gatewayUrl: 'https://api.example.com', accountId: 'a', fetch: fetcher as unknown as typeof fetch })
    const denied = await POST(
      request('runs', { method: 'POST', cookie: SESSION_COOKIE, body: '{}', headers: { 'x-idempotency-key': 'k' } }),
      ctx('runs')
    )
    expect(denied.status).toBe(403)
    const allowed = await POST(
      request('runs/r1/cancel', {
        method: 'POST',
        cookie: `${SESSION_COOKIE}; ${CSRF_COOKIE_NAME}=tok`,
        headers: { [CSRF_HEADER_NAME]: 'tok' },
      }),
      ctx('runs', 'r1', 'cancel')
    )
    expect(allowed.status).toBe(202)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('proxies operation selection calls with server credentials and the session bearer', async () => {
    const fetcher = upstreamJson(200, { success: true, data: { operation: 'summarize', selected: 'fast' } })
    const { GET, PUT, DELETE } = routes(fetcher as unknown as typeof fetch)
    const list = await GET(request('operations?account=other&x=y', { cookie: SESSION_COOKIE }), ctx('operations'))
    expect(list.status).toBe(200)
    const getSettings = await GET(request('operations/summarize/settings', { cookie: SESSION_COOKIE }), ctx('operations', 'summarize', 'settings'))
    expect(getSettings.status).toBe(200)
    const put = await PUT(
      request('operations/summarize/preference', { method: 'PUT', body: JSON.stringify({ option: 'fast' }), cookie: SESSION_COOKIE, headers: { authorization: 'Bearer attacker' } }),
      ctx('operations', 'summarize', 'preference')
    )
    expect(put.status).toBe(200)
    const del = await DELETE(request('operations/summarize/preference', { method: 'DELETE', cookie: SESSION_COOKIE }), ctx('operations', 'summarize', 'preference'))
    expect(del.status).toBe(200)
    const settings = await PUT(
      request('operations/summarize/settings', { method: 'PUT', body: JSON.stringify({ default_option: null }), cookie: SESSION_COOKIE }),
      ctx('operations', 'summarize', 'settings')
    )
    expect(settings.status).toBe(200)
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET https://api.example.com/v1/ai/operations',
      'GET https://api.example.com/v1/ai/operations/summarize/settings',
      'PUT https://api.example.com/v1/ai/operations/summarize/preference',
      'DELETE https://api.example.com/v1/ai/operations/summarize/preference',
      'PUT https://api.example.com/v1/ai/operations/summarize/settings',
    ])
    for (const [, init] of calls) {
      const headers = init.headers as Record<string, string>
      expect(headers['x-api-key']).toBe('sk_server')
      expect(headers.authorization).toBe('Bearer sess-123')
      expect(headers['x-requested-account-id']).toBe('acct-config')
    }
    expect(calls[2][1].body).toBe(JSON.stringify({ option: 'fast' }))
    expect(calls[3][1].body).toBeUndefined()
    expect(calls[4][1].body).toBe(JSON.stringify({ default_option: null }))
  })

  it('requires a JSON body on PUT and enforces CSRF on PUT and DELETE by default', async () => {
    const fetcher = upstreamJson(200, {})
    const open = routes(fetcher as unknown as typeof fetch)
    const empty = await open.PUT(request('operations/summarize/preference', { method: 'PUT', cookie: SESSION_COOKIE }), ctx('operations', 'summarize', 'preference'))
    expect(empty.status).toBe(400)
    const guarded = routes(fetcher as unknown as typeof fetch, { csrf: true })
    const noToken = await guarded.PUT(
      request('operations/summarize/preference', { method: 'PUT', body: '{"option":"fast"}', cookie: SESSION_COOKIE }),
      ctx('operations', 'summarize', 'preference')
    )
    expect(noToken.status).toBe(403)
    const noTokenDelete = await guarded.DELETE(request('operations/summarize/preference', { method: 'DELETE', cookie: SESSION_COOKIE }), ctx('operations', 'summarize', 'preference'))
    expect(noTokenDelete.status).toBe(403)
    const withToken = await guarded.DELETE(
      request('operations/summarize/preference', { method: 'DELETE', cookie: `${SESSION_COOKIE}; ${CSRF_COOKIE_NAME}=tok`, headers: { [CSRF_HEADER_NAME]: 'tok' } }),
      ctx('operations', 'summarize', 'preference')
    )
    expect(withToken.status).toBe(200)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('maps upstream network failures to 502 without leaking the key', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { GET } = routes(fetcher as unknown as typeof fetch)
    const response = await GET(request('runs/r1', { cookie: SESSION_COOKIE }), ctx('runs', 'r1'))
    expect(response.status).toBe(502)
    const text = await response.text()
    expect(text).not.toContain('sk_server')
  })
})

describe('createServiceAiClient', () => {
  it('sends the server key and account in service mode', async () => {
    const fetcher = upstreamJson(201, {
      success: true,
      data: { id: 'r1', operation: 'summarize', version: 1, status: 'succeeded', attempt: 1, created_at: 't', output_expired: false, cancel_requested: false, output: { summary: 's', format: 'brief', truncated: false } },
    })
    const ai = createServiceAiClient({ apiKey: 'sk_service', gatewayUrl: 'https://api.example.com', accountId: 'acct-svc', fetch: fetcher as unknown as typeof fetch })
    const result = await ai.summarize({ text: 'hello' })
    expect(result.data?.summary).toBe('s')
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/ai/runs')
    const headers = init.headers as Headers
    expect(headers.get('x-api-key')).toBe('sk_service')
    expect(headers.get('x-requested-account-id')).toBe('acct-svc')
    expect(headers.get('authorization')).toBeNull()
  })
})
