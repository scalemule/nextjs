/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseScaleMule } = vi.hoisted(() => ({
  mockUseScaleMule: vi.fn(),
}))

vi.mock('../provider', () => ({
  useScaleMule: mockUseScaleMule,
}))

import { useFeatureFlags } from './useFeatureFlags'

const mockFetch = vi.fn()

vi.stubGlobal('fetch', mockFetch)

describe('useFeatureFlags', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockUseScaleMule.mockReset()

    mockUseScaleMule.mockReturnValue({
      client: { post: vi.fn() },
      publishableKey: 'sm_pb_test',
      gatewayUrl: 'https://api.scalemule.com',
      bootstrapFlags: undefined,
      environment: 'prod',
    })

    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            alpha: {
              flag_id: 'flag-1',
              flag_key: 'alpha',
              environment: 'prod',
              value: true,
              reason: 'default',
            },
          },
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    )
  })

  it('does not refetch when rerendered with an equivalent keys array', async () => {
    const { rerender } = renderHook(
      ({ keys }) => useFeatureFlags({ keys }),
      {
        initialProps: {
          keys: ['alpha'],
        },
      }
    )

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))

    await act(async () => {
      rerender({ keys: ['alpha'] })
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
