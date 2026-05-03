'use client'

/**
 * useVote — bipolar voting hook for Next.js apps.
 *
 * Reads + writes through the gateway-backed `client` from
 * ScaleMuleProvider. Optimistic updates with single-flight cast queue.
 *
 * Pairs with `<VoteButton />` for the default UI; use the hook directly
 * if you need custom rendering.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useScaleMule } from '../provider'

export interface VoteState {
  /** Caller's current vote: 1 = upvote, -1 = downvote, 0 = no vote. */
  value: 1 | -1 | 0
  up_count: number
  down_count: number
  score: number
}

export interface UseVoteOptions {
  /** Application-defined target type. e.g. "weekmob_post", "gistyo_gist". */
  targetType: string
  targetId: string
  /** Optional seed (from SSR or list query). */
  initialState?: VoteState | null
  /** Refetch even when initialState is provided. Default false. */
  refetchOnMount?: boolean
  /** Skip the initial fetch entirely (anonymous viewers). Default true. */
  enabled?: boolean
}

export interface UseVoteReturn {
  state: VoteState
  isLoading: boolean
  error: Error | null
  /** Cast (or change/clear) the caller's vote with optimistic update. */
  cast: (value: 1 | -1 | 0) => Promise<void>
  /** Refetch the canonical state from the server. */
  refetch: () => Promise<void>
}

const ZERO: VoteState = { value: 0, up_count: 0, down_count: 0, score: 0 }

export function useVote({
  targetType,
  targetId,
  initialState,
  refetchOnMount = false,
  enabled = true,
}: UseVoteOptions): UseVoteReturn {
  const { client } = useScaleMule()
  const [state, setState] = useState<VoteState>(initialState ?? ZERO)
  const [isLoading, setIsLoading] = useState<boolean>(!initialState && enabled)
  const [error, setError] = useState<Error | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)

  const path = `/v1/social/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/vote`

  const refetch = useCallback(async () => {
    if (!enabled) return
    setIsLoading(true)
    setError(null)
    try {
      const data = await client.get<VoteState>(path)
      setState(data)
    } catch (e) {
      setError(e as Error)
    } finally {
      setIsLoading(false)
    }
  }, [client, path, enabled])

  useEffect(() => {
    if (!enabled) return
    if (initialState && !refetchOnMount) return
    void refetch()
  }, [enabled, refetch, initialState, refetchOnMount])

  const cast = useCallback(
    async (value: 1 | -1 | 0) => {
      const prev = state
      const optimistic = applyVote(prev, value)
      setState(optimistic)
      setError(null)

      const send = async () => {
        try {
          const data = await client.put<VoteState>(path, { value })
          setState(data)
        } catch (e) {
          setState(prev)
          setError(e as Error)
        }
      }
      const p = inFlight.current ? inFlight.current.then(send) : send()
      inFlight.current = p
      await p
      if (inFlight.current === p) inFlight.current = null
    },
    [client, path, state],
  )

  return { state, isLoading, error, cast, refetch }
}

/** Optimistic next-state computation; mirrors server aggregate math. */
function applyVote(prev: VoteState, next: 1 | -1 | 0): VoteState {
  let { up_count, down_count } = prev
  if (prev.value === 1) up_count = Math.max(0, up_count - 1)
  if (prev.value === -1) down_count = Math.max(0, down_count - 1)
  if (next === 1) up_count += 1
  if (next === -1) down_count += 1
  return {
    value: next,
    up_count,
    down_count,
    score: up_count - down_count,
  }
}
