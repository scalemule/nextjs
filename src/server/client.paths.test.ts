/**
 * Server client path safety: ids placed in gateway paths are validated and
 * encoded, and no request leaves with a dot segment.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScaleMuleServer } from './client'
import { ScaleMuleApiError } from '../types'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const BAD_IDS = ['..', '.', '../auth/me', '..%2Fauth%2Fme', '%2e%2e', '%252e%252e%252f', 'a\\b', 'a?b', 'a#b', 'a\u0000', '']

describe('ScaleMuleServer path safety', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => jsonResponse(200, { success: true, data: {} }))
    vi.stubGlobal('fetch', fetchMock)
  })

  function server() {
    return new ScaleMuleServer({ apiKey: 'sm_sk_server_key', gatewayUrl: 'https://api.example.com' })
  }

  it('encodes storage and webhook ids', async () => {
    await server().storage.get('019d7453-0000-7000-8000-000000000001')
    await server().storage.delete('user-1', 'файл 🎬')
    await server().webhooks.delete('wh_1')
    await server().webhooks.update('wh 2', { is_enabled: false })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls).toEqual([
      'https://api.example.com/v1/storage/files/019d7453-0000-7000-8000-000000000001/info',
      `https://api.example.com/v1/storage/files/${encodeURIComponent('файл 🎬')}`,
      'https://api.example.com/v1/webhooks/wh_1',
      'https://api.example.com/v1/webhooks/wh%202',
    ])
  })

  it('refuses traversal ids before any request is sent', async () => {
    for (const id of BAD_IDS) {
      await expect(server().storage.get(id), JSON.stringify(id)).rejects.toBeInstanceOf(ScaleMuleApiError)
      await expect(server().storage.delete('user-1', id), JSON.stringify(id)).rejects.toBeInstanceOf(ScaleMuleApiError)
      await expect(server().webhooks.delete(id), JSON.stringify(id)).rejects.toBeInstanceOf(ScaleMuleApiError)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps vault keys with encoded slashes working', async () => {
    await server().secrets.get('webhooks/019d7453')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://api.example.com/v1/vault/secrets/webhooks%2F019d7453')
  })

  it('refuses vault keys that are dot segments', async () => {
    await expect(server().secrets.get('..')).rejects.toBeInstanceOf(ScaleMuleApiError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
