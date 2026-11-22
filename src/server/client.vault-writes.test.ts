/**
 * Vault writes: the server answers with metadata only (never the stored
 * value). The SDK keeps its return shapes, filling `value` / `data` from what
 * the caller passed in (or an explicit GET for rollback), never from a value
 * a server happened to echo.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScaleMuleServer } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const VALUES = ['ascii-secret-123', 'пароль-Ж', '秘密の鍵', 'key-\u{1F511}']

describe('ScaleMuleServer vault writes', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function server() {
    return new ScaleMuleServer({ apiKey: 'sm_sk_server_key', gatewayUrl: 'https://api.example.com' })
  }

  it('secrets.set returns the value the caller passed, with the server version', async () => {
    for (const value of VALUES) {
      fetchMock.mockReset()
      // New server: metadata only.
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { path: 'k', version: 3, secret_type: 'string' }))
      await expect(server().secrets.set('k', value)).resolves.toEqual({ value, version: 3 })
      const [, init] = fetchMock.mock.calls[0]
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body)).toEqual({ value })
    }
  })

  it('secrets.set never returns a value echoed by an older server', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { path: 'k', version: 2, value: 'server-echo' }))
    const result = await server().secrets.set('k', 'caller-value')
    expect(result).toEqual({ value: 'caller-value', version: 2 })
    expect(JSON.stringify(result)).not.toContain('server-echo')
  })

  it('secrets.rotate returns the caller value and the new version', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { path: 'k', new_version: 5, previous_version: 4, rotated_at: '2026-11-22T00:00:00Z' })
    )
    await expect(server().secrets.rotate('k', 'rotated-value')).resolves.toEqual({ value: 'rotated-value', version: 5 })
  })

  it('secrets.rollback reads the restored value back with an explicit GET', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { path: 'k', version: 7, secret_type: 'string' }))
      .mockResolvedValueOnce(jsonResponse(200, { path: 'k', value: 'restored', version: 7 }))
    await expect(server().secrets.rollback('k', 2)).resolves.toEqual({ value: 'restored', version: 7 })
    const calls = fetchMock.mock.calls.map(([url, init]) => `${init.method} ${String(url)}`)
    expect(calls).toEqual([
      'POST https://api.example.com/v1/vault/actions/rollback/k',
      'GET https://api.example.com/v1/vault/secrets/k',
    ])
  })

  it('bundles.set returns the caller type and data, never server fields', async () => {
    const data = { host: 'db.internal', password: 'p@ss-Ж' }
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { path: 'database/prod', bundle_type: 'mysql', version: 4, keys: ['host', 'password'] })
    )
    await expect(server().bundles.set('database/prod', 'mysql', data)).resolves.toEqual({ type: 'mysql', data, version: 4 })

    // Older server that still echoes: the echo is not passed through.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { path: 'g', bundle_type: 'generic', version: 1, value: { token: 'server-echo' }, connection_url: 'x://server-echo' })
    )
    const result = await server().bundles.set('g', 'generic', { token: 'caller' })
    expect(result).toEqual({ type: 'generic', data: { token: 'caller' }, version: 1 })
    expect(JSON.stringify(result)).not.toContain('server-echo')
  })
})
