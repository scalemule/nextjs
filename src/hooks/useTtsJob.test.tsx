/** @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetJob = vi.fn()

vi.mock('../provider', () => ({
  useScaleMule: () => ({
    tts: {
      getJob: mockGetJob,
    },
  }),
}))

import { useTtsJob } from './useTtsJob'

describe('useTtsJob', () => {
  const readyJob = {
    id: 'job_1',
    access_mode: 'owner_private',
    provider: 'openai',
    voice: 'alloy',
    model: 'gpt-4o-mini-tts',
    format: 'mp3',
    status: 'ready',
    chunk_total: 2,
    chunk_done: 2,
    audio_id: 'audio_1',
    audio: {
      id: 'audio_1',
      status: 'ready',
      access_mode: 'owner_private',
      url: 'https://example.com/audio.mp3',
    },
    created_at: '2026-04-29T00:00:00Z',
    updated_at: '2026-04-29T00:00:02Z',
  } as const

  beforeEach(() => {
    mockGetJob.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('polls until the job becomes ready', async () => {
    mockGetJob
      .mockResolvedValueOnce({
        data: {
          id: 'job_1',
          access_mode: 'owner_private',
          provider: 'openai',
          voice: 'alloy',
          model: 'gpt-4o-mini-tts',
          format: 'mp3',
          status: 'queued',
          chunk_total: 2,
          chunk_done: 0,
          created_at: '2026-04-29T00:00:00Z',
          updated_at: '2026-04-29T00:00:00Z',
        },
        error: null,
      })
      .mockResolvedValue({
        data: readyJob,
        error: null,
      })

    const { result } = renderHook(() => useTtsJob('job_1', { pollIntervalMs: 10 }))

    await waitFor(() => expect(result.current.job?.status).toBe('ready'))
    expect(mockGetJob.mock.calls.length).toBeGreaterThanOrEqual(2)
    await expect(mockGetJob.mock.results[0]?.value).resolves.toMatchObject({
      data: expect.objectContaining({ status: 'queued' }),
    })
  })
})
