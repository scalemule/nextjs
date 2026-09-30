/**
 * Server client session refresh — request contract.
 *
 * The auth service rotates the token named in the request body
 * (`{ session_token }`); a body-less refresh is rejected, which used to sign
 * every proxy-mode user out on their first refresh.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScaleMuleServer } from './client'
import { ScaleMuleApiError } from '../types'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ScaleMuleServer auth.refresh', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function server() {
    return new ScaleMuleServer({ apiKey: 'sm_server_key', environment: 'dev' })
  }

  it('sends the session token in the request body', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { data: { session_token: 'rotated', expires_at: '2026-10-01T00:00:00Z' } })
    )

    const result = await server().auth.refresh('current-token')

    expect(result.session_token).toBe('rotated')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api-dev.scalemule.com/v1/auth/refresh')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ session_token: 'current-token' })
    expect(init.headers.Authorization).toBe('Bearer current-token')
  })

  it('carries the HTTP status on a rejected refresh', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'SESSION_IDLE_EXPIRED', message: 'Session expired due to inactivity.' } })
    )

    const err = await server().auth.refresh('stale-token').catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ScaleMuleApiError)
    expect((err as ScaleMuleApiError).code).toBe('SESSION_IDLE_EXPIRED')
    expect((err as ScaleMuleApiError).status).toBe(401)
  })

  it('auto-refreshes a 401 with the token in the body, then retries', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { session_token: 'rotated', expires_at: 'x' } }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { id: 'user-1' } }))

    const user = await server().auth.me('current-token')

    expect(user).toEqual({ id: 'user-1' })
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toBe('https://api-dev.scalemule.com/v1/auth/refresh')
    expect(JSON.parse(refreshInit.body)).toEqual({ session_token: 'current-token' })
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer rotated')
  })
})
