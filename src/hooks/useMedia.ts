'use client'

import { useCallback, useState } from 'react'
import type { ApiError } from '@scalemule/sdk'

/**
 * Tri-state file visibility — `'private' | 'app_public' | 'anonymous_visible'`.
 *
 * Locally redeclared here rather than imported from `@scalemule/sdk`
 * so this package can ship before the sdk's `Visibility` export is
 * published. Once `@scalemule/sdk` ≥ the version that exports
 * `Visibility` is the minimum dep version, swap this for an `import
 * type { Visibility } from '@scalemule/sdk'`.
 *
 * Keep the union members in lockstep with the storage migration's
 * ENUM and the SDK's typed export.
 */
export type Visibility = 'private' | 'app_public' | 'anonymous_visible'
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
  /** Whether the resulting storage object is public-readable.
   * Derived from `visibility !== 'private'` for back-compat with
   * callers that still branch on the boolean. */
  is_public: boolean
  /**
   * Resolved tri-state visibility from the storage service. Use this
   * over `is_public` for new code — `is_public: true` covers both
   * `'app_public'` (auth-gated CDN) and `'anonymous_visible'`
   * (unsigned public CDN), which have different delivery contracts.
   */
  visibility: Visibility
  /**
   * Stable unsigned public-CDN URL — populated only when
   * `visibility === 'anonymous_visible'`. Drop directly into
   * `<img src>` on logged-out pages. For other visibilities use
   * `original_view_url` (signed) or the photo transform URL.
   */
  cdn_url: string | null
}

/**
 * Per-app media-pipeline policy. Drives release-gating + processing
 * behavior. **Orthogonal to `is_public`.** See
 * `docs/MEDIA-UPLOADS.md` and ADR-2026-04-26 for the full taxonomy.
 *
 * Today's behavior (Phase 4 v1):
 *   - `fast_trusted` / `safe_visible` (default): upload promise resolves
 *     as soon as the file is uploaded + registered. The post-processing
 *     (scan, optimize, transcode) runs async; callers can observe via
 *     `useFileStatus`.
 *   - `safe_public` / `moderated`: upload promise *waits* for the
 *     optimized image variant (image MIME) or HLS playlist (video MIME)
 *     to become ready before resolving. Acts as the release-gate for
 *     UGC-style apps that should not publish raw bytes.
 *   - `compliance`: today behaves as `safe_public`; Phase 4+ adds the
 *     audit-log + signed-with-purpose URL semantics.
 */
export type MediaPolicy =
  | 'fast_trusted'
  | 'safe_visible'
  | 'safe_public'
  | 'moderated'
  | 'compliance'

export interface UseMediaUploadOptions {
  /**
   * Tri-state visibility (preferred — see {@link Visibility} in
   * `@scalemule/sdk`). Three modes:
   *   - `'private'`           — owner + app members only (DEFAULT)
   *   - `'app_public'`        — readable by any authenticated end-user
   *                             in the same application; same semantics
   *                             the legacy `is_public: true` flag has
   *                             always had
   *   - `'anonymous_visible'` — world-readable on the unsigned public
   *                             CDN. Returned `cdn_url` is safe to drop
   *                             into `<img src>` on a logged-out page.
   *
   * If both `visibility` and `is_public` are passed, `visibility`
   * wins. `'anonymous_visible'` requires the operator to have
   * provisioned the anonymous-delivery bucket — the storage service
   * surfaces 503 `ANONYMOUS_DELIVERY_NOT_CONFIGURED` otherwise (the
   * SDK never silently demotes).
   */
  visibility?: Visibility
  /**
   * Legacy two-state visibility flag. `true` → `app_public`; `false`
   * → `private`. Prefer the typed `visibility` field for new code —
   * `is_public: true` cannot express `anonymous_visible`.
   *
   * Default: `false` (private). Public is opt-in for surfaces that
   * genuinely need it (avatars, public listings). Chat / DM uploads
   * should always be private.
   */
  is_public?: boolean
  /**
   * Per-call media-policy override. Defaults to `safe_visible` (visible
   * immediately at original fidelity; optimized variants swap in async).
   * Set to `safe_public` to make the upload promise *await* the optimized
   * variant (image) or HLS playlist (video) before resolving — useful for
   * broadcast / UGC apps that gate publication on processing complete.
   *
   * The per-app default lives in `application_storage_settings.media_policy`
   * (Phase 4 / P3, live in prod 2026-04-26). Reading the per-app default
   * into `useMedia` defaults lands in a follow-up; today the option is
   * caller-provided per call.
   */
  policy?: MediaPolicy
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

type MediaFacade = {
  upload: (
    file: File | Blob,
    options?: {
      visibility?: Visibility
      isPublic?: boolean
      policy?: MediaPolicy
      filename?: string
      metadata?: Record<string, unknown>
      signal?: AbortSignal
      skipPhotoRegister?: boolean
      onProgress?: (event: { progress?: number }) => void
    },
  ) => Promise<{ data: MediaUploadResult | null; error: ApiError | null }>
  delete: (
    fileId: string,
  ) => Promise<{ data: { deleted: boolean } | null; error: ApiError | null }>
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
  const { media: rawMedia, mediaPolicy: providerDefaultPolicy } = useScaleMule()
  const media = rawMedia as MediaFacade

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const upload = useCallback(
    async (file: File | Blob, options?: UseMediaUploadOptions): Promise<MediaUploadResult> => {
      setUploading(true)
      setError(null)

      // Policy precedence: per-call override > provider default >
      // built-in safe_visible default. Policies that gate release on
      // pipeline completion (safe_public / moderated / compliance) await
      // optimize/transcode before resolving the upload promise.
      const policy: MediaPolicy =
        options?.policy ?? providerDefaultPolicy ?? 'safe_visible'

      try {
        const result = await media.upload(file, {
          visibility: options?.visibility,
          isPublic: options?.is_public,
          policy,
          filename: options?.filename,
          metadata: options?.metadata,
          signal: options?.signal,
          skipPhotoRegister: options?.skipPhotoRegister,
          onProgress: (event) => {
            if (typeof event.progress === 'number') {
              options?.onProgress?.(event.progress)
            }
          },
        })
        if (result.error || !result.data) {
          throw result.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
        }
        return {
          file_id: result.data.file_id,
          photo_id: result.data.photo_id,
          original_view_url: result.data.original_view_url,
          optimized_url_promise: result.data.optimized_url_promise,
          hls_url_promise: result.data.hls_url_promise,
          mime_type: result.data.mime_type,
          is_public: result.data.is_public,
          visibility: result.data.visibility,
          cdn_url: result.data.cdn_url,
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [media, providerDefaultPolicy]
  )

  const cancelUpload = useCallback(
    async (fileId: string): Promise<void> => {
      setError(null)
      try {
        const result = await media.delete(fileId)
        if (result.error) {
          if (result.error.status === 404) return
          throw result.error
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      }
    },
    [media]
  )

  return { upload, cancelUpload, error, uploading }
}
