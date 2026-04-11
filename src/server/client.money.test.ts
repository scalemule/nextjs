import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateMoneyClient, mockMoneyClient } = vi.hoisted(() => {
  const mockMoneyClient = {
    withAccessToken: vi.fn(),
  }

  return {
    mockMoneyClient,
    mockCreateMoneyClient: vi.fn(() => mockMoneyClient),
  }
})

vi.mock('@scalemule/money', () => ({
  createMoneyClient: mockCreateMoneyClient,
}))

import { ScaleMuleServer } from './client'

describe('ScaleMuleServer money helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('creates the base money client from server config', () => {
    new ScaleMuleServer({
      apiKey: 'sm_server_key',
      environment: 'dev',
    })

    expect(mockCreateMoneyClient).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sm_server_key',
        gatewayUrl: 'https://api-dev.scalemule.com',
        fetch: expect.any(Function),
      })
    )
  })

  it('returns a session-scoped money client through moneyWithSession', () => {
    const scopedClient = { scoped: true }
    mockMoneyClient.withAccessToken.mockReturnValue(scopedClient)

    const server = new ScaleMuleServer({
      apiKey: 'sm_server_key',
      gatewayUrl: 'https://api.scalemule.test',
    })

    expect(server.moneyWithSession('session-token')).toBe(scopedClient)
    expect(mockMoneyClient.withAccessToken).toHaveBeenCalledWith('session-token')
  })
})
