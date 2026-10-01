// @vitest-environment jsdom
import { it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ setSession: vi.fn().mockResolvedValue(undefined), setUser: vi.fn() }))
vi.mock('../provider', () => ({ useScaleMule: () => ({ client: { setSession: mocks.setSession }, setUser: mocks.setUser, setError: vi.fn(), authProxyUrl: '/api/auth', requestSecurityCode: vi.fn() }) }))
import { useAuth } from './useAuth'
it('normalizes the manual proxy MFA session before storing it', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, data: { sessionToken: 'confirmed-session', user: { id: 'user', email: 'test@example.invalid' }, userId: 'user' } }) }))
  const { result, unmount } = renderHook(() => useAuth())
  await act(async () => { await result.current.completeMFAChallenge('pending', '123456', 'totp') })
  expect(mocks.setSession).toHaveBeenCalledWith('confirmed-session', 'user')
  unmount()
  vi.unstubAllGlobals()
})
