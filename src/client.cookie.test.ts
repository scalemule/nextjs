import { expect, it, vi } from 'vitest'
import { ScaleMuleClient } from './client'
it('erases legacy credentials and never restores or persists a bearer token in cookie mode', async () => {
  const values = new Map([['scalemule_session', 'legacy-secret'], ['scalemule_session_pool', 'pooled-secret'], ['scalemule_active_account', 'old-user']])
  const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  const client = new ScaleMuleClient({ apiKey: 'sm_pb_app', cookieSession: true, gatewayUrl: '/api/auth/client', storage })
  await client.initialize()
  expect(client.getSessionToken()).toBeNull()
  expect(values.has('scalemule_session')).toBe(false)
  expect(values.has('scalemule_session_pool')).toBe(false)
  await client.setSession('must-not-persist', 'user')
  client.setSessionToken('must-not-escape')
  expect(client.getSessionToken()).toBeNull()
  expect(client.isAuthenticated()).toBe(true)
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, data: {} }))
  vi.stubGlobal('fetch', fetcher)
  await client.get('/v1/storage/files')
  expect(fetcher.mock.calls[0][0]).toBe('/api/auth/client/v1/storage/files')
  expect(fetcher.mock.calls[0][1].headers.has('Authorization')).toBe(false)
  await client.clearSession()
  expect(client.isAuthenticated()).toBe(false)
  vi.unstubAllGlobals()
})
