'use client'

import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { useFileStatus, type ConversationKind } from '../hooks/useFileStatus'
import { useScaleMule } from '../provider'

export interface ScaleMuleMediaProps {
  /** Storage `file_id` of the media to render. Required. */
  fileId: string
  /** MIME type — drives which element to render. Required. */
  mimeType: string
  /**
   * Optional sender-side optimistic preview. While the upload is in
   * progress (or the recipient hasn't yet observed the message), the
   * component renders this Blob URL. Once `useFileStatus` resolves a
   * scan-clean state and a server-side URL, the component swaps to it.
   */
  blobPreview?: string
  /** Display width hint (CSS pixels). Used for image breakpoint selection. */
  width?: number
  /** Display height hint (CSS pixels). */
  height?: number
  /** Pass-through className for the rendered element. */
  className?: string
  /** Pass-through style. */
  style?: React.CSSProperties
  /** Alt text for `<img>`; aria-label for `<audio>` / `<video>`. */
  alt?: string
  /**
   * Polling interval while waiting for the media pipeline to complete.
   * Defaults to 2000ms; set to `null` to disable polling. Polling stops
   * automatically once scan is clean. When `conversationId` is set the
   * component receives push updates and you can usually pass `null`.
   */
  pollIntervalMs?: number | null
  /**
   * Chat-surface push: when set, the underlying `useFileStatus` hook
   * subscribes to the conversation's realtime channel and refreshes on
   * `file_status_changed` events for this `fileId`. See `useFileStatus`
   * docs for channel naming and bridge behaviour.
   */
  conversationId?: string | null
  /**
   * Conversation kind, controls the channel name prefix
   * (`conversation:{id}` vs `conversation:lr|bc|support:{id}`).
   * Default is `'standard'`.
   */
  conversationKind?: ConversationKind
  /**
   * Render a custom placeholder while waiting for scan / upload. Defaults
   * to a tiny "Loading…" div. Receives the current FileStatus (or null).
   */
  renderPlaceholder?: () => React.ReactNode
  /**
   * Render the "blocked" UI when scan flips to `threat`. Defaults to a
   * "This file was blocked" message. Customize for branding.
   */
  renderBlocked?: () => React.ReactNode
  /**
   * Custom render override. If provided, the component still calls
   * `useFileStatus` but yields rendering to this function. Useful for
   * highly custom presentation (e.g. lightbox triggers, hover overlays).
   */
  renderOverride?: (args: {
    src: string | null
    state: 'preview' | 'pending' | 'ready' | 'blocked' | 'error'
  }) => React.ReactNode
}

/**
 * Progressive-enhancement media renderer.
 *
 * Renders the right element for the given MIME type and progressively
 * upgrades the source URL as the media pipeline advances:
 *
 *   blob preview (if set) → original view URL → optimized variant (image)
 *                                            → HLS playlist (video)
 *
 * Today this is pull-only — `useFileStatus` polls until scan is clean
 * (and the caller can stop polling by passing `pollIntervalMs={null}`).
 * The push variant rides on the chat translation bridge (Phase 3 / P5')
 * and lights up automatically once that ships.
 *
 * For non-Safari browsers, HLS playback requires `hls.js` to be
 * available. The component dynamic-imports it on first need; if the
 * import fails (not installed), it falls back to the original-bytes URL.
 *
 * @example
 * ```tsx
 * <ScaleMuleMedia
 *   fileId={attachment.file_id}
 *   mimeType={attachment.mime_type}
 *   width={520}
 *   blobPreview={pendingPreviewUrl}
 *   alt={attachment.filename}
 * />
 * ```
 */
export function ScaleMuleMedia(props: ScaleMuleMediaProps): React.ReactElement | null {
  const {
    fileId,
    mimeType,
    blobPreview,
    width,
    height,
    className,
    style,
    alt,
    pollIntervalMs = 2000,
    conversationId = null,
    conversationKind,
    renderPlaceholder,
    renderBlocked,
    renderOverride,
  } = props

  const { gatewayUrl } = useScaleMule()
  const { status, isReady } = useFileStatus({
    fileId,
    pollIntervalMs,
    conversationId,
    conversationKind,
  })

  // Resolve relative URLs (e.g. `/v1/photos/{id}/transform`) against the
  // configured gateway origin. Customer apps that don't proxy /v1/* would
  // otherwise hit their own origin and 404 (Finding 3 from the
  // realtime-chat media pipeline review).
  const absoluteUrl = React.useCallback(
    (url: string | null | undefined): string | null => {
      if (!url) return null
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
        return url
      }
      if (!gatewayUrl) return url
      const base = gatewayUrl.endsWith('/') ? gatewayUrl.slice(0, -1) : gatewayUrl
      const path = url.startsWith('/') ? url : `/${url}`
      return `${base}${path}`
    },
    [gatewayUrl]
  )

  // ──────────────────────────────────────────────────────────────────────
  // State machine
  // ──────────────────────────────────────────────────────────────────────
  const isImage = mimeType.startsWith('image/')
  const isVideo = mimeType.startsWith('video/')
  const isAudio = mimeType.startsWith('audio/')

  // The "best available" source URL given current pipeline state.
  // Order:
  //   - Threat: null (placeholder rendered separately)
  //   - Optimized image variant if available + ready
  //   - HLS video if available + ready
  //   - Original view URL once scan is clean
  //   - Blob preview (sender-side optimistic)
  //   - null otherwise (placeholder)
  const src = useMemo<string | null>(() => {
    const scan = status?.scan.status
    if (scan === 'threat' || scan === 'quarantined') return null

    // Pre-status (first render) — fall back to a sender-side blob preview
    // if available. After F1, status returns a presigned `urls.original`
    // immediately (no scan gate), so this branch only fires for the
    // ~one frame before the first fetch completes.
    if (!status) {
      return blobPreview ?? null
    }

    // status.urls.optimized / .hls are now only set when the typed-service
    // pipeline reports done (storage status gate, F1+F2 server). When
    // present, they're always preferable. Otherwise, render the
    // presigned `urls.original` — which is direct-to-CDN and not
    // scan-gated, so it works pre-scan-clean.
    if (isImage && status.urls.optimized) return absoluteUrl(status.urls.optimized)
    if (isVideo && status.urls.hls) return absoluteUrl(status.urls.hls)
    if (status.urls.original) return absoluteUrl(status.urls.original)

    // Last resort: still no URLs. Show blob preview if we have one.
    return blobPreview ?? null
  }, [status, isImage, isVideo, blobPreview, absoluteUrl])

  const renderState: 'preview' | 'pending' | 'ready' | 'blocked' | 'error' = useMemo(() => {
    const scan = status?.scan.status
    if (scan === 'threat' || scan === 'quarantined') return 'blocked'
    // "ready" once we have any usable server URL — original is fine for
    // the first paint, optimized/hls swap in later when the pipeline
    // finishes. The earlier scan-clean gate over-blocked: it kept the
    // component on the loading placeholder even when status had a
    // presigned original URL ready to render.
    if (status?.urls.original) return 'ready'
    if (isReady) return 'ready'
    if (blobPreview) return 'preview'
    return 'pending'
  }, [status?.scan.status, status?.urls.original, isReady, blobPreview])

  // ──────────────────────────────────────────────────────────────────────
  // HLS lazy-load (video only, non-Safari)
  // ──────────────────────────────────────────────────────────────────────
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    if (!isVideo) return
    if (!src) return
    if (!src.endsWith('.m3u8')) return
    const el = videoRef.current
    if (!el) return

    // Native HLS (Safari, iOS) — just set src and go.
    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = src
      return
    }

    // Other browsers: try hls.js
    let cancelled = false
    let hls: { destroy: () => void } | null = null
    void (async () => {
      try {
        // Dynamic-import; absent dependency falls through to fallback.
        // hls.js is an optional peer — this resolves at runtime if the
        // consumer installed it. The string template tricks TS into
        // skipping module resolution at compile time.
        const moduleName = 'hls.js'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import(/* @vite-ignore */ /* webpackIgnore: true */ moduleName).catch(
          () => null
        )
        if (cancelled || !mod) return
        const Hls = mod.default ?? mod
        if (Hls.isSupported()) {
          hls = new Hls()
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          ;(hls as any).loadSource(src)
          ;(hls as any).attachMedia(el)
        } else {
          // hls.js not supported either — set src; user may see an error.
          el.src = src
        }
      } catch {
        // Swallow — caller can supply renderOverride for custom handling.
      }
    })()

    return () => {
      cancelled = true
      if (hls) hls.destroy()
    }
  }, [isVideo, src])

  // ──────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────
  // Blocked state is enforced BEFORE renderOverride. A consumer override
  // could otherwise paper over the SDK's quarantine UI by rendering its
  // own fallback URL when `src` happens to be null — exactly the
  // post-hoc-quarantine bypass we want to prevent.
  // Consumers that need fully custom handling for blocked content can
  // still supply `renderBlocked`, which IS honored here.
  if (renderState === 'blocked') {
    return (
      <>
        {renderBlocked
          ? renderBlocked()
          : (
            <div
              role="alert"
              className={className}
              style={{ padding: 12, color: '#a00', ...style }}
            >
              This file was blocked.
            </div>
          )}
      </>
    )
  }

  if (renderOverride) {
    return <>{renderOverride({ src, state: renderState })}</>
  }

  if (renderState === 'pending' && !src) {
    return (
      <>
        {renderPlaceholder
          ? renderPlaceholder()
          : (
            <div
              role="status"
              aria-busy
              className={className}
              style={{ padding: 12, color: '#666', ...style }}
            >
              Loading…
            </div>
          )}
      </>
    )
  }

  if (isImage) {
    // Image: render with <img>. The optimized URL (when present) returns
    // a transformed variant; consumers can pass `width`/`height` for the
    // photo service to size it server-side via query params.
    const finalSrc =
      src && status?.urls.optimized && (width || height)
        ? appendQuery(src, {
            width: width ? String(width) : undefined,
            height: height ? String(height) : undefined,
            fit: 'cover',
          })
        : src
    return (
      <img
        src={finalSrc ?? undefined}
        alt={alt ?? ''}
        width={width}
        height={height}
        className={className}
        style={style}
      />
    )
  }

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        // For non-HLS sources, set src directly so React mounts it. The
        // useEffect above takes over when src ends with .m3u8.
        src={src && !src.endsWith('.m3u8') ? src : undefined}
        controls
        playsInline
        preload="metadata"
        className={className}
        style={style}
        aria-label={alt}
        width={width}
        height={height}
      />
    )
  }

  if (isAudio) {
    return (
      <audio
        src={src ?? undefined}
        controls
        preload="metadata"
        className={className}
        style={style}
        aria-label={alt}
      />
    )
  }

  // Fallback for unknown / generic file MIME types — a download link.
  return (
    <a
      href={src ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
    >
      {alt ?? 'Download file'}
    </a>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function appendQuery(url: string, params: Record<string, string | undefined>): string {
  const filtered = Object.entries(params).filter(([, v]) => v != null && v !== '')
  if (filtered.length === 0) return url
  const sep = url.includes('?') ? '&' : '?'
  const qs = new URLSearchParams(filtered as [string, string][]).toString()
  return url + sep + qs
}
