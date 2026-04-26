'use client'

import { useCallback, useState } from 'react'
import type { ApiError, FileInfo, UploadOptions } from '@scalemule/sdk'
import { useScaleMule } from '../provider'

/**
 * Result of a single {@link useMedia} upload call.
 *
 * The shape is normalized regardless of MIME type — `optimized_url_promise`
 * resolves on image uploads after the photo optimizer finishes; for non-image
 * uploads it resolves to `null` immediately. (Video / audio branches will
 * populate `hls_url_promise` in later phases — today they fall through to
 * generic storage and that field stays `null`.)
 */
export interface MediaUploadResult {
  /** Storage file_id — store this in chat-attachment metadata. */
  file_id: string
  /** Photo service id — null for non-image uploads or when register() failed. */
  photo_id: string | null
  /** Short-lived signed URL to the original bytes (private uploads) or
   * a public CDN URL (when caller passed `is_public: true`). */
  original_view_url: string | null
  /** Resolves once the photo optimizer finishes. `null` for non-image
   * MIME types or when register() failed. */
  optimized_url_promise: Promise<string | null>
  /** Resolves once the video transcoder finishes (Phase 2 / S5b). `null` today. */
  hls_url_promise: Promise<string | null>
  /** The file's MIME type — preserved from the input File / Blob. */
  mime_type: string
  /** Whether the resulting storage object is public-readable. */
  is_public: boolean
}

export interface UseMediaUploadOptions {
  /** Whether the resulting storage object should be public-readable.
   * Default: `false` (private). Public is opt-in for surfaces that
   * genuinely need it (avatars, public listings). Chat / DM uploads
   * should always be private. */
  is_public?: boolean
  /** Display filename (sanitized server-side). */
  filename?: string
  /** Custom metadata attached to the file. */
  metadata?: Record<string, unknown>
  /** Upload progress callback (0-100). */
  onProgress?: (percent: number) => void
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
  /** Force a non-photo path even for image MIME types — useful for
   * generic file uploads where you don't want the photo optimizer
   * to register the file. Default: `false`. */
  skipPhotoRegister?: boolean
}

export interface UseMediaReturn {
  /** Upload a file. MIME-aware: images go through photo register +
   * optimization; everything else goes through generic storage. */
  upload: (file: File | Blob, options?: UseMediaUploadOptions) => Promise<MediaUploadResult>
  /** Cancel an upload by its `file_id`. Deletes the storage object so
   * it doesn't orphan in S3 — useful when a chat composer accepts a
   * file but the user removes it before sending. Idempotent. */
  cancelUpload: (fileId: string) => Promise<void>
  /** Last error from `upload` or `cancelUpload`. */
  error: ApiError | null
  /** True while an upload is in progress. */
  uploading: boolean
}

/**
 * Opinionated, MIME-aware media upload hook.
 *
 * `useMedia()` is the canonical upload primitive for chat / progressive
 * media use. It branches by MIME type:
 *   - `image/*` → `client.photo.uploadViaStorage()` — upload to storage,
 *     then register with the photo service so the on-demand transform
 *     endpoint resolves to optimized variants. The returned
 *     `optimized_url_promise` resolves once the optimizer finishes.
 *   - everything else → `client.storage.uploadPrivate()` — a private,
 *     uncompressed, fail-closed upload to generic storage.
 *
 * **Default visibility is `is_public: false`.** Public is opt-in per call.
 * `useMedia()` does not expose `is_public` via app-level config — visibility
 * is always an explicit per-call surface choice.
 *
 * Compared to `useContent()`:
 *   - `useContent()` is a thin wrapper over generic storage and does not
 *     register photos / videos with their typed services. Use it for plain
 *     file uploads where you don't need optimization or transcoding.
 *   - `useMedia()` defaults to private + no compression, integrates with the
 *     typed media services automatically, and is the right primitive for
 *     anything chat- or media-shaped.
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * import { useMedia, ScaleMuleMedia } from '@scalemule/nextjs';
 *
 * function ChatComposer({ onAttach }) {
 *   const { upload, uploading } = useMedia();
 *
 *   async function handlePick(file: File) {
 *     const result = await upload(file);
 *     onAttach({
 *       file_id: result.file_id,
 *       mime_type: result.mime_type,
 *       optimized_url_promise: result.optimized_url_promise,
 *     });
 *   }
 *
 *   return <input type="file" disabled={uploading}
 *     onChange={(e) => e.target.files?.[0] && handlePick(e.target.files[0])} />;
 * }
 * ```
 *
 * See `docs/MEDIA-UPLOADS.md` in the platform repo for the decision
 * tree and the full anti-patterns list.
 */
export function useMedia(): UseMediaReturn {
  const { storage, photo, video } = useScaleMule()

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const upload = useCallback(
    async (file: File | Blob, options?: UseMediaUploadOptions): Promise<MediaUploadResult> => {
      setUploading(true)
      setError(null)

      const isPublic = options?.is_public ?? false
      const mimeType = (file as File).type || 'application/octet-stream'

      // Common UploadOptions for all branches.
      const sharedOpts: UploadOptions = {
        filename: options?.filename,
        metadata: options?.metadata,
        onProgress: options?.onProgress,
        signal: options?.signal,
      }

      try {
        // ────────────────────────────────────────────────────────────────
        // Image branch: upload + register with photo service.
        // Use uploadViaStorage so the photo optimizer picks it up.
        // ────────────────────────────────────────────────────────────────
        if (mimeType.startsWith('image/') && !options?.skipPhotoRegister && !isPublic) {
          const r = await photo.uploadViaStorage(file, sharedOpts)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          return {
            file_id: r.data.file_id,
            photo_id: r.data.photo_id,
            original_view_url: r.data.original_view_url,
            optimized_url_promise: r.data.optimized_url_promise,
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: false,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Video branch: upload + register with video service.
        // video.uploadViaStorage handles the storage upload and follows
        // up with /v1/videos/register so the transcoder picks it up.
        // The hls_url_promise resolves to the HLS master playlist URL
        // once transcoding completes (or null on 30s timeout — caller
        // falls back to original_view_url for immediate playback).
        // ────────────────────────────────────────────────────────────────
        if (mimeType.startsWith('video/') && !isPublic) {
          const r = await video.uploadViaStorage(file, sharedOpts)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          return {
            file_id: r.data.file_id,
            photo_id: null,
            original_view_url: r.data.original_view_url,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: r.data.hls_url_promise,
            mime_type: mimeType,
            is_public: false,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Public-image branch: a public surface (e.g. avatar) doesn't go
        // through uploadViaStorage (which forces is_public: false). Fall
        // through to a regular storage.upload() and skip photo register
        // for now — the public-image-with-optimization combo lands in a
        // later phase.
        // ────────────────────────────────────────────────────────────────
        if (mimeType.startsWith('image/') && isPublic) {
          const r = await storage.upload(file, {
            ...sharedOpts,
            isPublic: true,
            skipCompression: true,
          })
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          const f: FileInfo = r.data
          return {
            file_id: f.id,
            photo_id: null,
            original_view_url: f.url ?? null,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: f.is_public ?? true,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Generic fallthrough (videos, audio, files): private storage
        // upload via uploadPrivate (or storage.upload with isPublic: true).
        // Video / audio branches arrive in Phase 2 / Phase 5 once
        // video.uploadViaStorage and audio.uploadViaStorage land.
        // ────────────────────────────────────────────────────────────────
        const r = isPublic
          ? await storage.upload(file, { ...sharedOpts, isPublic: true, skipCompression: true })
          : await storage.uploadPrivate(file, sharedOpts)
        if (r.error || !r.data) {
          throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
        }
        const f: FileInfo = r.data
        return {
          file_id: f.id,
          photo_id: null,
          original_view_url: f.url ?? null,
          optimized_url_promise: Promise.resolve(null),
          hls_url_promise: Promise.resolve(null),
          mime_type: mimeType,
          is_public: f.is_public ?? isPublic,
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [storage, photo]
  )

  const cancelUpload = useCallback(
    async (fileId: string): Promise<void> => {
      setError(null)
      try {
        const r = await storage.delete(fileId)
        if (r.error) {
          // 404 = already gone, treat as success (idempotent).
          if (r.error.status === 404) return
          throw r.error
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      }
    },
    [storage]
  )

  return { upload, cancelUpload, error, uploading }
}
