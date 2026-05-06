/** @vitest-environment jsdom */

import React from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockBaseClient,
  mockClient,
  mockCreateClient,
  mockCreateMoneyClient,
  mockMoneyClient,
  mockScaleMule,
} = vi.hoisted(() => {
  const mockMoneyClient = {
    setAccessToken: vi.fn(),
  }

  const mockClient = {
    initialize: vi.fn().mockResolvedValue(undefined),
    getSessionToken: vi.fn().mockReturnValue('session-token'),
    isAuthenticated: vi.fn().mockReturnValue(false),
    clearSession: vi.fn().mockResolvedValue(undefined),
    resolveSessionPending: vi.fn(),
    setSession: vi.fn().mockResolvedValue(undefined),
    setSessionToken: vi.fn(),
    get: vi.fn(),
  }

  const mockBaseClient = {
    realtime: { connect: vi.fn() },
    setAccessToken: vi.fn(),
    clearAccessToken: vi.fn(),
    storage: {
      getPolicy: vi.fn().mockResolvedValue({ data: { media_policy: 'safe_visible' } }),
    },
  }

  return {
    mockMoneyClient,
    mockClient,
    mockBaseClient,
    mockCreateClient: vi.fn(() => mockClient),
    mockCreateMoneyClient: vi.fn(() => mockMoneyClient),
    mockScaleMule: vi.fn(function ScaleMuleMock() {
      return mockBaseClient
    }),
  }
})

vi.mock('./client', () => ({
  createClient: mockCreateClient,
  ScaleMuleClient: class {},
}))

vi.mock('@scalemule/money', () => ({
  createMoneyClient: mockCreateMoneyClient,
}))

vi.mock('@scalemule/sdk', () => ({
  ScaleMule: mockScaleMule,
}))

import { ScaleMuleProvider, useMoneyClient } from './provider'

describe('ScaleMuleProvider money integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())

    mockClient.initialize.mockResolvedValue(undefined)
    mockClient.getSessionToken.mockReturnValue('session-token')
    mockClient.isAuthenticated.mockReturnValue(false)
  })

  it('creates a money client with the resolved gateway URL and exposes it via useMoneyClient', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScaleMuleProvider
        apiKey="sm_test_key"
        applicationId="app_test"
        gatewayUrl="https://api.scalemule.test"
      >
        {children}
      </ScaleMuleProvider>
    )

    const { result } = renderHook(() => useMoneyClient(), { wrapper })

    await waitFor(() => {
      expect(mockCreateMoneyClient).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sm_test_key',
          gatewayUrl: 'https://api.scalemule.test',
          accessToken: 'session-token',
          fetch: expect.any(Function),
        })
      )
    })

    expect(result.current).toBe(mockMoneyClient)

    await waitFor(() => {
      expect(mockMoneyClient.setAccessToken).toHaveBeenCalledWith('session-token')
      expect(mockBaseClient.setAccessToken).toHaveBeenCalledWith('session-token')
    })
  })

  it('clears money auth when no session token is present', async () => {
    mockClient.getSessionToken.mockReturnValue(null)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScaleMuleProvider apiKey="sm_test_key" applicationId="app_test" environment="dev">
        {children}
      </ScaleMuleProvider>
    )

    renderHook(() => useMoneyClient(), { wrapper })

    await waitFor(() => {
      expect(mockCreateMoneyClient).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayUrl: 'https://api-dev.scalemule.com',
        })
      )
      expect(mockMoneyClient.setAccessToken).toHaveBeenCalledWith(undefined)
      expect(mockBaseClient.clearAccessToken).toHaveBeenCalled()
    })
  })
})

describe('ScaleMuleProvider member-auth bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockClient.initialize.mockResolvedValue(undefined)
    // Member mode mounts in pendingSessionInit; the init effect resolves it.
    mockClient.getSessionToken.mockReturnValue(null)
    mockClient.isAuthenticated.mockReturnValue(false)
  })

  it('propagates the getToken() result to all three clients on mount', async () => {
    const getToken = vi.fn().mockResolvedValue('member-token-abc')

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScaleMuleProvider
        apiKey="sm_test_key"
        applicationId="app_test"
        environment="prod"
        getToken={getToken}
        memberTokenPollMs={null}
      >
        {children}
      </ScaleMuleProvider>
    )

    renderHook(() => useMoneyClient(), { wrapper })

    await waitFor(() => {
      expect(getToken).toHaveBeenCalled()
      expect(mockClient.setSessionToken).toHaveBeenCalledWith('member-token-abc')
      expect(mockBaseClient.setAccessToken).toHaveBeenCalledWith('member-token-abc')
      expect(mockMoneyClient.setAccessToken).toHaveBeenCalledWith('member-token-abc')
    })

    // Member mode skips /v1/auth/me and the auth-proxy /me path.
    expect(mockClient.get).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
    // Pending session gate is always lifted.
    expect(mockClient.resolveSessionPending).toHaveBeenCalled()
  })

  it('skips token application when getToken() returns null', async () => {
    const getToken = vi.fn().mockResolvedValue(null)

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScaleMuleProvider
        apiKey="sm_test_key"
        applicationId="app_test"
        getToken={getToken}
        memberTokenPollMs={null}
      >
        {children}
      </ScaleMuleProvider>
    )

    renderHook(() => useMoneyClient(), { wrapper })

    await waitFor(() => {
      expect(getToken).toHaveBeenCalled()
      expect(mockClient.setSessionToken).toHaveBeenCalledWith(null)
      expect(mockBaseClient.clearAccessToken).toHaveBeenCalled()
      expect(mockMoneyClient.setAccessToken).toHaveBeenCalledWith(undefined)
      expect(mockClient.resolveSessionPending).toHaveBeenCalled()
    })
  })

  it('invokes userResolver and sets the user when provided', async () => {
    const getToken = vi.fn().mockResolvedValue('member-token-abc')
    const userResolver = vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
    })

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ScaleMuleProvider
        apiKey="sm_test_key"
        applicationId="app_test"
        getToken={getToken}
        userResolver={userResolver}
        memberTokenPollMs={null}
      >
        {children}
      </ScaleMuleProvider>
    )

    renderHook(() => useMoneyClient(), { wrapper })

    await waitFor(() => {
      expect(userResolver).toHaveBeenCalled()
    })
  })
})
