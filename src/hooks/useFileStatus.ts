'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError, FileStatus } from '@scalemule/sdk'
import { useScaleMule } from '../provider'

/**
 * Conversation kinds recognized by the chat realtime channel naming scheme.
 * Matches `broadcast_to_conversation` in `ms/scalemule-chat/src/realtime.rs`.
 */
export type ConversationKind = 'standard' | 'large_room' | 'broadcast' | 'support'

export interface UseFileStatusOptions {
  /** Storage file_id to read status for. */
  fileId: string | null | undefined
  /**
   * Optional poll interval in milliseconds. If set, the hook re-fetches
   * status every `pollIntervalMs` until scan goes clean. Useful for
   * non-chat surfaces or as a fallback alongside `conversationId` push.
   */
  pollIntervalMs?: number | null
  /** Disable the hook (don't fetch). Useful when `fileId` is conditional. */
  disabled?: boolean
  /**
   * Chat-surface push variant: subscribe to the conversation's realtime
   * channel and refresh when a `file_status_changed` event arrives for
   * `fileId`. Auth rides the existing per-conversation channel ACL.
   */
  conversationId?: string | null
  /**
   * Conversation kind, controls the channel name prefix:
   *   - `standard` (default) → `conversation:{id}`
   *   - `large_room` → `conversation:lr:{id}`
   *   - `broadcast` → `conversation:bc:{id}`
   *   - `support` → `conversation:support:{id}`
   *
   * If you only have a `messageId`, look up the conversation first via
   * `client.chat.getMessage(messageId)` and pass the result here.
   */
  conversationKind?: ConversationKind
}

export interface UseFileStatusReturn {
  /** The latest status response, or null on first render / disabled. */
  status: FileStatus | null
  /** True while a fetch is in flight. */
  loading: boolean
  /** Last error, or null. */
  error: ApiError | null
  /**
   * Convenience: scan is clean. For images/videos, this means the file
   * is *safe to render*; the optimized / HLS variants may still be
   * processing. The caller should attempt the constructed URLs and
   * fall back to `urls.original` if the pipeline-specific URL 404s.
   */
  isReady: boolean
  /** Force-refresh the status. Promise resolves when the new state is committed. */
  refresh: () => Promise<void>
}

function conversationChannel(kind: ConversationKind, id: string): string {
  switch (kind) {
    case 'large_room':
      return `conversation:lr:${id}`
    case 'broadcast':
      return `conversation:bc:${id}`
    case 'support':
      return `conversation:support:${id}`
    case 'standard':
    default:
      return `conversation:${id}`
  }
}

/**
 * Subscribes to {@link FileStatus} for a single file.
 *
 * Three call shapes:
 *
 * 1. **Pull-only** — `useFileStatus({ fileId })` plus optional `pollIntervalMs`.
 *    One-shot fetch; useful for non-chat surfaces or static reads.
 *
 * 2. **Chat-surface push** — `useFileStatus({ fileId, conversationId, conversationKind? })`.
 *    Subscribes to the conversation channel and refreshes when
 *    `file_status_changed` arrives for this `fileId`. The chat service's
 *    media-status bridge fans photo/video lifecycle events into the per-conversation
 *    channel; the hook drops events for other files and dedupes against polling.
 *
 * 3. **Push + slow poll fallback** — combine `conversationId` with `pollIntervalMs`
 *    if you want belt-and-suspenders for environments where the websocket may drop.
 *
 * The `surface: 'profile'` push variant (private-user channel) is deferred until
 * the realtime SDK exposes private-channel subscription by user.
 *
 * @example Chat surface (push)
 * ```tsx
 * function ChatImage({ fileId, conversationId }: { fileId: string; conversationId: string }) {
 *   const { status, isReady } = useFileStatus({ fileId, conversationId });
 *   if (!isReady) return <div>Scanning…</div>;
 *   const src = status?.urls.optimized ?? status?.urls.original;
 *   return <img src={src} />;
 * }
 * ```
 *
 * @example Non-chat surface (pull + poll)
 * ```tsx
 * const { status, isReady } = useFileStatus({ fileId, pollIntervalMs: 2000 });
 * ```
 */
export function useFileStatus(options: UseFileStatusOptions): UseFileStatusReturn {
  const { storage, realtime } = useScaleMule()
  const {
    fileId,
    pollIntervalMs = null,
    disabled = false,
    conversationId = null,
    conversationKind = 'standard',
  } = options

  const [status, setStatus] = useState<FileStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  // Avoid stale closures + double-firing in StrictMode.
  const requestSeqRef = useRef(0)

  const fetchStatus = useCallback(async (): Promise<void> => {
    if (!fileId || disabled) return
    const seq = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const r = await storage.getFileStatus(fileId)
      // Drop stale responses if a newer fetch fired in between.
      if (seq !== requestSeqRef.current) return
      if (r.error || !r.data) {
        setError(r.error)
        return
      }
      setStatus(r.data)
    } catch (err) {
      if (seq !== requestSeqRef.current) return
      setError(err as ApiError)
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [storage, fileId, disabled])

  // Initial fetch on mount / fileId change.
  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  // Optional polling. Stops when scan is clean.
  useEffect(() => {
    if (!pollIntervalMs || disabled || !fileId) return
    const isClean = status?.scan.status === 'clean'
    if (isClean) return
    const id = setInterval(() => {
      void fetchStatus()
    }, pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, disabled, fileId, status?.scan.status, fetchStatus])

  // Chat-surface push subscription. Re-fetch when a file_status_changed
  // event arrives for our file_id on the conversation channel.
  useEffect(() => {
    if (!conversationId || !fileId || disabled) return
    const channel = conversationChannel(conversationKind, conversationId)
    const unsub = realtime.subscribe(channel, (data: unknown) => {
      // RealtimeService delivers either the inner data or the full envelope
      // depending on backend wrapping; handle both shapes.
      const payload = data as
        | { event?: string; data?: { file_id?: string } }
        | { file_id?: string; kind?: string }
        | null
        | undefined
      if (!payload) return
      const inner =
        'data' in payload && payload.data
          ? (payload.data as { file_id?: string })
          : (payload as { file_id?: string })
      const evt = (payload as { event?: string }).event
      if (evt && evt !== 'file_status_changed') return
      if (inner.file_id !== fileId) return
      void fetchStatus()
    })
    return unsub
  }, [realtime, conversationId, conversationKind, fileId, disabled, fetchStatus])

  const isReady = status?.scan.status === 'clean'

  return { status, loading, error, isReady, refresh: fetchStatus }
}
