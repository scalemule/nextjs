'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiError, FileStatus } from '@scalemule/sdk'
import { useScaleMule } from '../provider'

export interface UseFileStatusOptions {
  /** Storage file_id to read status for. */
  fileId: string | null | undefined
  /**
   * Optional poll interval in milliseconds. If set, the hook re-fetches
   * status every `pollIntervalMs`. Useful while waiting for transcode /
   * optimization to complete. Pass `null` (default) for a one-shot read.
   *
   * Polling stops automatically once `scan.status === 'clean'` AND the
   * caller's expected pipeline is done (`urls.optimized` returns 200 for
   * images, `urls.hls` returns 200 for videos). Today the hook can only
   * detect scan clean — broader pipeline-done detection lands when Phase 3
   * enriches the optimize/transcode response fields.
   */
  pollIntervalMs?: number | null
  /**
   * Disable the hook (don't fetch). Useful when `fileId` is conditional.
   */
  disabled?: boolean
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

/**
 * Subscribes to {@link FileStatus} for a single file. Today this is a
 * pull-only hook — single fetch by default, optional polling.
 *
 * Phase 3 of the realtime-chat media pipeline ADR will add a push variant
 * for chat surfaces — `useFileStatus({ messageId })` will subscribe to
 * `file.status` events on the existing per-conversation realtime channel
 * via the `scalemule-chat` translation bridge (P5'). Until that lands,
 * customers using this hook from chat surfaces should pass `pollIntervalMs`
 * in the 1–3 second range while a media pipeline is expected to be running,
 * then drop the polling once `isReady` is true.
 *
 * @example
 * ```tsx
 * function ChatImage({ fileId }: { fileId: string }) {
 *   const { status, isReady } = useFileStatus({
 *     fileId,
 *     pollIntervalMs: 2000,
 *   });
 *   if (!isReady) return <div>Scanning…</div>;
 *   const src = status?.urls.optimized ?? status?.urls.original;
 *   return <img src={src} />;
 * }
 * ```
 */
export function useFileStatus(options: UseFileStatusOptions): UseFileStatusReturn {
  const { storage } = useScaleMule()
  const { fileId, pollIntervalMs = null, disabled = false } = options

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

  // Optional polling. Stops when scan is clean (the available signal
  // before Phase 3 enriches optimize/transcode).
  useEffect(() => {
    if (!pollIntervalMs || disabled || !fileId) return
    const isClean = status?.scan.status === 'clean'
    if (isClean) return
    const id = setInterval(() => {
      void fetchStatus()
    }, pollIntervalMs)
    return () => clearInterval(id)
  }, [pollIntervalMs, disabled, fileId, status?.scan.status, fetchStatus])

  const isReady = status?.scan.status === 'clean'

  return { status, loading, error, isReady, refresh: fetchStatus }
}
