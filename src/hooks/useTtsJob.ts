'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ApiError, TtsJobStatus } from '@scalemule/sdk'
import { useScaleMule } from '../provider'

export interface UseTtsJobOptions {
  enabled?: boolean
  pollIntervalMs?: number
}

export interface UseTtsJobReturn {
  job: TtsJobStatus | null
  loading: boolean
  error: ApiError | null
  refresh: () => Promise<TtsJobStatus | null>
}

const DEFAULT_POLL_INTERVAL_MS = 2000
const TERMINAL_STATUSES = new Set<TtsJobStatus['status']>(['ready', 'failed'])

export function useTtsJob(jobId: string | null | undefined, options?: UseTtsJobOptions): UseTtsJobReturn {
  const { tts } = useScaleMule()
  const [job, setJob] = useState<TtsJobStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async (): Promise<TtsJobStatus | null> => {
    if (!jobId) {
      setJob(null)
      return null
    }

    setLoading(true)
    setError(null)
    try {
      const result = await tts.getJob(jobId)
      if (!result) {
        const apiError = { code: 'tts_job_error', message: 'Failed to load TTS job', status: 500 }
        setError(apiError)
        return null
      }
      if (result.error || !result.data) {
        const apiError = result.error ?? { code: 'tts_job_error', message: 'Failed to load TTS job', status: 500 }
        setError(apiError)
        return null
      }
      setJob(result.data)
      return result.data
    } finally {
      setLoading(false)
    }
  }, [jobId, tts])

  useEffect(() => {
    if (!jobId || options?.enabled === false) {
      setJob(null)
      setLoading(false)
      return
    }

    let cancelled = false
    let timeoutId: number | null = null

    const poll = async () => {
      const next = await refresh()
      if (cancelled || !next || TERMINAL_STATUSES.has(next.status)) {
        return
      }
      timeoutId = window.setTimeout(poll, options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId != null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [jobId, options?.enabled, options?.pollIntervalMs, refresh])

  return { job, loading, error, refresh }
}
