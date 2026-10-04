/** @vitest-environment jsdom */

/**
 * useAuth().refreshSession — a failed refresh signs the user out only when
 * the session itself has ended.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ctx } = vi.hoisted(() => ({
  ctx: {
    client: {
      getSessionToken: vi.fn(),
      getUserId: vi.fn(),
      post: vi.fn(),
      setSession: vi.fn(),
      clearSession: vi.fn(),
    },
    user: { id: 'user-1', email: 'alex@example.com' },
    setUser: vi.fn(),
    initializing: false,
    error: null,
    setError: vi.fn(),
    authProxyUrl: undefined as string | undefined,
    enableAccountSwitcher: false,
    accountSwitcherPrivacy: 'masked',
  },
}))

vi.mock('../provider', () => ({
  useScaleMule: () => ctx,
}))

import { useAuth } from './useAuth'
import { ScaleMuleApiError } from '../types'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useAuth().refreshSession', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  describe('proxy mode', () => {
    beforeEach(() => {
      ctx.authProxyUrl = '/api/auth'
    })

    it('signs the user out when the session has ended', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, { success: false, error: { code: 'SESSION_IDLE_EXPIRED', message: 'expired' } })
      )
      const { result } = renderHook(() => useAuth())

      await expect(result.current.refreshSession()).rejects.toMatchObject({ code: 'SESSION_IDLE_EXPIRED' })
      expect(ctx.setUser).toHaveBeenCalledWith(null)
    })

    it('keeps the user signed in when the refresh fails for another reason', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(503, { success: false, error: { code: 'HTTP_503', message: 'unavailable' } })
      )
      const { result } = renderHook(() => useAuth())

      await expect(result.current.refreshSession()).rejects.toMatchObject({ code: 'HTTP_503' })
      expect(ctx.setUser).not.toHaveBeenCalled()
      expect(ctx.setError).toHaveBeenLastCalledWith(expect.objectContaining({ code: 'HTTP_503' }))
    })
  })

  describe('direct mode', () => {
    beforeEach(() => {
      ctx.authProxyUrl = undefined
      ctx.client.getSessionToken.mockReturnValue('current-token')
    })

    it('clears the session when the backend rejects it', async () => {
      ctx.client.post.mockRejectedValue(new ScaleMuleApiError({ code: 'INVALID_SESSION', message: 'invalid' }))
      const { result } = renderHook(() => useAuth())

      await expect(result.current.refreshSession()).rejects.toBeInstanceOf(ScaleMuleApiError)
      expect(ctx.client.clearSession).toHaveBeenCalled()
      expect(ctx.setUser).toHaveBeenCalledWith(null)
    })

    it('keeps the session on a network failure', async () => {
      ctx.client.post.mockRejectedValue(new ScaleMuleApiError({ code: 'NETWORK_ERROR', message: 'offline' }))
      const { result } = renderHook(() => useAuth())

      await expect(result.current.refreshSession()).rejects.toBeInstanceOf(ScaleMuleApiError)
      expect(ctx.client.clearSession).not.toHaveBeenCalled()
      expect(ctx.setUser).not.toHaveBeenCalled()
    })
  })
})
