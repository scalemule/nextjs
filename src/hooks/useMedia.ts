'use client'

import { useCallback, useState } from 'react'
import type { ApiError, FileInfo, UploadOptions } from '@scalemule/sdk'

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
  const { storage, photo, video, audio, mediaPolicy: providerDefaultPolicy } = useScaleMule()

  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const upload = useCallback(
    async (file: File | Blob, options?: UseMediaUploadOptions): Promise<MediaUploadResult> => {
      setUploading(true)
      setError(null)

      // Resolve visibility — typed `visibility` wins; otherwise
      // derive from legacy `is_public`; otherwise default `private`.
      // Same precedence the storage service applies on the wire, so
      // the SDK and server agree on the resolved value before we
      // decide which branch to take.
      const visibility: Visibility = options?.visibility
        ?? (options?.is_public === true
          ? 'app_public'
          : options?.is_public === false
            ? 'private'
            : 'private')
      const isPublic = visibility !== 'private'
      const isAnonymous = visibility === 'anonymous_visible'
      const mimeType = (file as File).type || 'application/octet-stream'

      // Policy precedence: per-call override > provider default >
      // built-in safe_visible default. Policies that gate release on
      // pipeline completion (safe_public / moderated / compliance) await
      // optimize/transcode before resolving the upload promise.
      const policy: MediaPolicy =
        options?.policy ?? providerDefaultPolicy ?? 'safe_visible'
      const gateOnPipeline =
        policy === 'safe_public' ||
        policy === 'moderated' ||
        policy === 'compliance'

      // Common UploadOptions for all branches.
      const sharedOpts: UploadOptions = {
        filename: options?.filename,
        metadata: options?.metadata,
        onProgress: options?.onProgress,
        signal: options?.signal,
      }

      // The visibility-aware fields (`uploadAnonymous`, the
      // `visibility` UploadOption, `FileInfo.cdn_url`) are added in
      // `@scalemule/sdk` PR #47. Until that version is the min dep
      // here we widen the storage / FileInfo views via a small set of
      // typed aliases so this hook can call them. Once the new SDK
      // version is the floor, drop these and import the real types.
      type StorageWithAnon = typeof storage & {
        uploadAnonymous: (
          f: File | Blob,
          opts?: Omit<UploadOptions, 'visibility' | 'isPublic'>
        ) => ReturnType<typeof storage.upload>
      }
      type UploadOptionsWithVisibility = UploadOptions & { visibility?: Visibility }
      type FileInfoWithVisibility = FileInfo & {
        visibility?: Visibility
        cdn_url?: string
      }
      const storageAnon = storage as StorageWithAnon

      try {
        // ────────────────────────────────────────────────────────────────
        // Anonymous-visible branch (any MIME).
        //
        // Files uploaded with `visibility: 'anonymous_visible'` go
        // directly to storage's anonymous bucket and are served from
        // the unsigned public CDN. The photo / video / audio
        // services don't need to be involved here from the client —
        // their scan subscribers pick anon files up server-side and
        // register them automatically (skipping the bucket-copy
        // step). Returning `cdn_url` is the contract callers rely
        // on — drop directly into `<img src>` / `<video src>`.
        // ────────────────────────────────────────────────────────────────
        if (isAnonymous) {
          const r = await storageAnon.uploadAnonymous(file, sharedOpts)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          const f = r.data as FileInfoWithVisibility
          return {
            file_id: f.id,
            photo_id: null,
            // For anon files, original_view_url is the same unsigned
            // CDN URL — no signed alternative exists. Callers should
            // prefer `cdn_url` (more specific) but `original_view_url`
            // works too for back-compat with code that already reads
            // that field.
            original_view_url: f.cdn_url ?? null,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: true,
            visibility: 'anonymous_visible',
            cdn_url: f.cdn_url ?? null,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Image branch: upload + register with photo service.
        // Use uploadViaStorage so the photo optimizer picks it up.
        // ────────────────────────────────────────────────────────────────
        if (mimeType.startsWith('image/') && !options?.skipPhotoRegister && !isPublic) {
          const r = await photo.uploadViaStorage(file, sharedOpts)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          // Release-gating policies: wait for the optimized variant
          // before resolving the upload promise.
          if (gateOnPipeline) {
            await r.data.optimized_url_promise
          }
          return {
            file_id: r.data.file_id,
            photo_id: r.data.photo_id,
            original_view_url: r.data.original_view_url,
            optimized_url_promise: r.data.optimized_url_promise,
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: false,
            visibility: 'private',
            cdn_url: null,
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
          // Release-gating policies: wait for the HLS playlist before
          // resolving the upload promise.
          if (gateOnPipeline) {
            await r.data.hls_url_promise
          }
          return {
            file_id: r.data.file_id,
            photo_id: null,
            original_view_url: r.data.original_view_url,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: r.data.hls_url_promise,
            mime_type: mimeType,
            is_public: false,
            visibility: 'private',
            cdn_url: null,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Audio branch: upload + register with audio service.
        // audio.uploadViaStorage handles the storage upload and follows
        // up with /v1/audio/register so the audio service tracks
        // ownership + status. Bytes are immediately playable via the
        // storage view URL — codec normalization / waveform peaks land
        // in a future phase. No release-gating today (audio's pipeline
        // is metadata-only, no transcoding to wait on).
        // ────────────────────────────────────────────────────────────────
        if (mimeType.startsWith('audio/') && !isPublic) {
          const r = await audio.uploadViaStorage(file, sharedOpts)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          return {
            file_id: r.data.file_id,
            photo_id: null,
            original_view_url: r.data.original_view_url,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: false,
            visibility: 'private',
            cdn_url: null,
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
            visibility: 'app_public',
            skipCompression: true,
          } as UploadOptionsWithVisibility)
          if (r.error || !r.data) {
            throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
          }
          const f = r.data as FileInfoWithVisibility
          return {
            file_id: f.id,
            photo_id: null,
            original_view_url: f.url ?? null,
            optimized_url_promise: Promise.resolve(null),
            hls_url_promise: Promise.resolve(null),
            mime_type: mimeType,
            is_public: f.is_public ?? true,
            visibility: f.visibility ?? 'app_public',
            cdn_url: f.cdn_url ?? null,
          }
        }

        // ────────────────────────────────────────────────────────────────
        // Generic fallthrough (files, public audio, etc.): private
        // storage upload via uploadPrivate (or storage.upload with
        // isPublic: true). Image / video / audio branches above pick
        // up the typed services; everything else lands here.
        // ────────────────────────────────────────────────────────────────
        const r = isPublic
          ? await storage.upload(file, {
              ...sharedOpts,
              visibility: 'app_public',
              skipCompression: true,
            } as UploadOptionsWithVisibility)
          : await storage.uploadPrivate(file, sharedOpts)
        if (r.error || !r.data) {
          throw r.error ?? { code: 'upload_error', message: 'Upload failed', status: 0 }
        }
        const f = r.data as FileInfoWithVisibility
        return {
          file_id: f.id,
          photo_id: null,
          original_view_url: f.url ?? null,
          optimized_url_promise: Promise.resolve(null),
          hls_url_promise: Promise.resolve(null),
          mime_type: mimeType,
          is_public: f.is_public ?? isPublic,
          visibility: f.visibility ?? (isPublic ? 'app_public' : 'private'),
          cdn_url: f.cdn_url ?? null,
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      } finally {
        setUploading(false)
      }
    },
    [storage, photo, video, audio, providerDefaultPolicy]
  )

  const cancelUpload = useCallback(
    async (fileId: string): Promise<void> => {
      setError(null)
      // Cascade tear-down so an upload that already went through
      // `photo.register()` doesn't leave a photo-namespace S3 copy +
      // photo-DB row behind when the user discards before sending
      // (Finding 6 from the realtime-chat media pipeline review).
      //
      // Photo's DELETE accepts the storage `file_id` directly via the
      // dual-lookup invariant (P0.1) — we don't need to track the
      // photo_id separately. 404 means the photo wasn't registered
      // (non-image uploads), which is fine.
      //
      // Video / audio delete cascades aren't wired yet:
      //   - scalemule-video has no DELETE endpoint today.
      //   - scalemule-audio's delete isn't surfaced on the SDK.
      // Both are tracked as platform follow-ups; storage's TTL sweeper
      // is the backstop for both.
      try {
        // Run photo cascade and storage delete in parallel. Storage
        // delete is the source-of-truth row, so we surface its error.
        const [, storageResult] = await Promise.all([
          photo.delete(fileId).catch(() => undefined),
          storage.delete(fileId),
        ])
        if (storageResult.error) {
          // 404 on storage = already gone, treat as success (idempotent).
          if (storageResult.error.status === 404) return
          throw storageResult.error
        }
      } catch (err) {
        const e = err as ApiError
        setError(e)
        throw e
      }
    },
    [storage, photo]
  )

  return { upload, cancelUpload, error, uploading }
}
