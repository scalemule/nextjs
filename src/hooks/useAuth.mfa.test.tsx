// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ clearSession: vi.fn().mockResolvedValue(undefined), setSession: vi.fn().mockResolvedValue(undefined), setCookieSession: vi.fn(), usesCookieSession: vi.fn(() => false), setUser: vi.fn() }))
vi.mock('../provider', () => ({ useScaleMule: () => ({ client: mocks, setUser: mocks.setUser, setError: vi.fn(), authProxyUrl: '/api/auth', requestSecurityCode: vi.fn() }) }))
import { useAuth } from './useAuth'
it('normalizes the manual proxy MFA session before storing it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, data: { sessionToken: 'confirmed-session', user: { id: 'user', email: 'test@example.invalid' }, userId: 'user' } }) }))
  const { result, unmount } = renderHook(() => useAuth())
  await act(async () => { await result.current.completeMFAChallenge('pending', '123456', 'totp') })
  expect(mocks.setSession).toHaveBeenCalledWith('confirmed-session', 'user')
  unmount()
  vi.unstubAllGlobals()
})

it('completes proxy MFA without receiving or persisting a session token', async () => {
  mocks.setSession.mockClear()
  mocks.usesCookieSession.mockReturnValue(true)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, data: { authenticated: true, user: { id: 'cookie-user', email: 'test@example.invalid' }, userId: 'cookie-user' } }) }))
  const { result, unmount } = renderHook(() => useAuth())
  await act(async () => { await result.current.completeMFAChallenge('pending', '123456', 'totp') })
  expect(mocks.setCookieSession).toHaveBeenCalledWith('cookie-user')
  expect(mocks.setSession).not.toHaveBeenCalled()
  unmount()
  vi.unstubAllGlobals()
})

it('proxy logout clears legacy client credentials as well as server cookies', async () => {
  mocks.clearSession.mockClear()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, data: {} }) }))
  const { result, unmount } = renderHook(() => useAuth())
  await act(async () => { await result.current.logout() })
  expect(mocks.clearSession).toHaveBeenCalledOnce()
  expect(mocks.setUser).toHaveBeenCalledWith(null)
  unmount()
  vi.unstubAllGlobals()
})
