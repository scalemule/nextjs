/**
 * Refresh route — only a session the backend rejected is cleared.
 *
 * A failed refresh used to answer `200 { success: true }` while clearing the
 * session cookies, so the caller saw success and the user was silently
 * signed out on their next request, whatever the cause of the failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScaleMuleApiError } from '../types'
import { SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'

const mockRefresh = vi.fn()

vi.mock('./client', () => ({
  createServerClient: () => ({
    auth: {
      refresh: mockRefresh,
    },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: (name: string) =>
      name === 'sm_session'
        ? { value: 'current-token' }
        : name === 'sm_user_id'
          ? { value: 'user-1' }
          : undefined,
  }),
  headers: vi.fn().mockResolvedValue({ get: () => null }),
}))

import { createAuthRoutes } from './routes'

function refreshRequest() {
  return new Request('https://example.com/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

const context = { params: Promise.resolve({ scalemule: ['refresh'] }) }

async function refresh() {
  const response = await createAuthRoutes().POST(refreshRequest(), context)
  return { response, body: await response.json(), cookies: response.headers.getSetCookie() }
}

describe('refresh route', () => {
  beforeEach(() => {
    mockRefresh.mockReset()
  })

  it('rotates the session cookie when the backend refreshes the session', async () => {
    mockRefresh.mockResolvedValue({ session_token: 'rotated', expires_at: 'x' })

    const { response, body, cookies } = await refresh()

    expect(mockRefresh).toHaveBeenCalledWith('current-token')
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=rotated`))).toBe(true)
  })

  it('clears the session and reports 401 when the backend rejects the session', async () => {
    mockRefresh.mockRejectedValue(
      new ScaleMuleApiError({ code: 'SESSION_IDLE_EXPIRED', message: 'Session expired due to inactivity.' }, 401)
    )

    const { response, body, cookies } = await refresh()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      success: false,
      error: { code: 'SESSION_IDLE_EXPIRED', message: 'Session expired due to inactivity.' },
    })
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=;`) && c.includes('Max-Age=0'))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${USER_ID_COOKIE_NAME}=;`) && c.includes('Max-Age=0'))).toBe(true)
  })

  it.each([
    ['a malformed request', new ScaleMuleApiError({ code: 'BAD_REQUEST', message: 'bad body' }, 400), 400],
    ['a rate limit', new ScaleMuleApiError({ code: 'RATE_LIMITED', message: 'slow down' }, 429), 429],
    ['a backend outage', new ScaleMuleApiError({ code: 'HTTP_502', message: 'bad gateway' }, 502), 502],
    ['a network failure', new ScaleMuleApiError({ code: 'SERVER_ERROR', message: 'fetch failed' }), 503],
  ])('keeps the session on %s', async (_label, error, status) => {
    mockRefresh.mockRejectedValue(error)

    const { response, body, cookies } = await refresh()

    expect(response.status).toBe(status)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe(error.code)
    expect(cookies).toEqual([])
  })
})
