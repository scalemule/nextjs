'use client'

import { useCallback, useEffect, useState } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
import type { ApiError } from '../types'
import type {
  FeedbackItem,
  FeedbackItemInput,
  FeedbackStatus,
  FeedbackType,
} from '../types/feedback'

export interface UseFeedbackOptions {
  /** Optional status filter applied to the list call. */
  status?: FeedbackStatus
  /** Optional type filter. */
  type?: FeedbackType
  /** When false, suppress the initial list fetch (the widget submits without listing). */
  enabled?: boolean
}

export interface UseFeedbackResult {
  /** End-user's own feedback items for the current tenant. Empty when not signed in. */
  items: FeedbackItem[]
  loading: boolean
  error: ApiError | null
  /** Submit a new feedback item. Returns the persisted item on success. */
  submit: (input: FeedbackItemInput) => Promise<FeedbackItem>
  /** Re-fetch the list. */
  refresh: () => Promise<void>
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ScaleMuleApiError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
    }
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Feedback request failed',
  }
}

/**
 * Hook for end-user feedback submission and read-own.
 *
 * Calls go through `client` from `ScaleMuleProvider`, which attaches the
 * configured API key and (when present) the user session token. Tenancy
 * (`x-app-id`) is derived by the gateway from the API key — never set
 * client-side.
 */
export function useFeedback(options: UseFeedbackOptions = {}): UseFeedbackResult {
  const { client } = useScaleMule()
  const { status, type, enabled = true } = options

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (status) params.append('status', status)
      if (type) params.append('type', type)
      const qs = params.toString()
      const path = `/v1/feedback/items${qs ? '?' + qs : ''}`
      const result = await client.get<FeedbackItem[]>(path)
      setItems(Array.isArray(result) ? result : [])
      setError(null)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setLoading(false)
    }
  }, [client, enabled, status, type])

  useEffect(() => {
    refresh()
  }, [refresh])

  const submit = useCallback<UseFeedbackResult['submit']>(
    async (input) => {
      try {
        const created = await client.post<FeedbackItem>('/v1/feedback/submit', input)
        setItems((prev) => [created, ...prev])
        setError(null)
        return created
      } catch (err) {
        const apiErr = toApiError(err)
        setError(apiErr)
        throw err
      }
    },
    [client]
  )

  return { items, loading, error, submit, refresh }
}
