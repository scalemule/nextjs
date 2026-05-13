'use client'

/**
 * NarrationPlayer — backward-compatibility restore.
 *
 * This component was a public export of `@scalemule/nextjs` through 0.1.24
 * and was removed in 0.1.27 alongside the `useMedia` facade refactor (PR
 * #45). Because at least one shipping consumer (Gistyo) imports it
 * directly, the removal was a public-API regression in a patch-line
 * version bump. This file restores the component with the exact same
 * prop surface and behavior, transcribed from the 0.1.24 published
 * tarball.
 *
 * It is intentionally self-contained: no dependency on the new
 * `useAudio` / `useMedia` hooks. The component manages its own
 * `<audio>` element, scrub bar, waveform rendering, and speed control —
 * exactly as before. If/when a hook-based replacement is offered, this
 * component can be deprecated, but removing it again without a
 * replacement consumers can migrate to is what created this incident.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { TtsAudioInfo } from '@scalemule/sdk'

export type NarrationPlayerAudio = TtsAudioInfo & {
  waveform_peaks?: number[] | null
  ai_generated?: boolean
}

export interface NarrationPlayerProps {
  audio: NarrationPlayerAudio
  className?: string
  providerLabel?: string
  narrationLabel?: string
  refreshing?: boolean
  onRefresh?: () => void | Promise<void>
  showRefreshButton?: boolean
  onPlaybackError?: () => void
}

const SPEEDS = [1, 1.25, 1.5, 2] as const
const EXPIRY_REFRESH_WINDOW_MS = 30_000

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function getNextSpeed(currentSpeed: number): number {
  const currentIndex = SPEEDS.findIndex((speed) => speed === currentSpeed)
  if (currentIndex === -1) return SPEEDS[0]
  return SPEEDS[(currentIndex + 1) % SPEEDS.length]
}

const styles: Record<string, CSSProperties> = {
  root: {
    borderRadius: '1.75rem',
    border: '1px solid rgba(226, 232, 240, 0.8)',
    background: 'linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)',
    padding: '1rem',
    color: '#0f172b',
    boxShadow: '0 22px 70px rgba(4, 12, 24, 0.28)',
  },
  layout: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '1rem',
  },
  playButton: {
    display: 'flex',
    height: '4.5rem',
    width: '4.5rem',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '9999px',
    border: 'none',
    backgroundColor: '#020618',
    color: '#ffffff',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.25)',
    cursor: 'pointer',
  },
  playIcon: { display: 'block', width: '1.75rem', height: '1.75rem', fill: 'currentColor' },
  playIconOffset: { marginLeft: '0.25rem' },
  content: { minWidth: '16rem', flex: '1 1 18rem' },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#62748e',
  },
  metaRight: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  badge: {
    borderRadius: '9999px',
    backgroundColor: '#dbeafe',
    padding: '0.25rem 0.75rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    letterSpacing: '0.24em',
    textTransform: 'uppercase',
    color: '#1447e6',
  },
  scrubber: {
    position: 'relative',
    marginTop: '1rem',
    height: '3rem',
    cursor: 'pointer',
    overflow: 'hidden',
    borderRadius: '1rem',
    backgroundColor: 'rgba(226, 232, 240, 0.9)',
    paddingInline: '0.25rem',
  },
  waveform: {
    pointerEvents: 'none',
    position: 'absolute',
    inset: 0,
    height: '100%',
    width: '100%',
  },
  fallbackTrack: { position: 'absolute', inset: 0, backgroundColor: 'rgba(226, 232, 240, 0.9)' },
  fallbackProgress: {
    position: 'absolute',
    insetBlock: 0,
    left: 0,
    backgroundColor: '#155dfc',
  },
  chipsRow: {
    marginTop: '1rem',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.72rem',
    fontWeight: 500,
    color: '#62748e',
  },
  chipStrong: {
    borderRadius: '9999px',
    border: '1px solid #e2e8f0',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: '0.25rem 0.75rem',
    color: '#334155',
  },
  chipMuted: {
    borderRadius: '9999px',
    border: '1px solid #e2e8f0',
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    padding: '0.25rem 0.75rem',
  },
  controls: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: '0.5rem',
    alignSelf: 'flex-start',
  },
  secondaryButton: {
    borderRadius: '9999px',
    border: '1px solid #cad5e2',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    color: '#334155',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
    cursor: 'pointer',
  },
  refreshButton: {
    borderRadius: '9999px',
    border: '1px solid #cad5e2',
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#334155',
    cursor: 'pointer',
  },
  disabled: { cursor: 'not-allowed', opacity: 0.6 },
}

export function NarrationPlayer({
  audio,
  className,
  providerLabel = 'ScaleMule',
  narrationLabel = 'AI-Narrated',
  refreshing = false,
  onRefresh,
  showRefreshButton = false,
  onPlaybackError,
}: NarrationPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const scrubRef = useRef<HTMLDivElement | null>(null)
  const pendingResumeRef = useRef(false)
  const pendingResumeTimeRef = useRef<number | null>(null)
  const recoveredUrlRef = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(
    audio.duration_ms ? audio.duration_ms / 1000 : 0
  )
  const [speed, setSpeed] = useState<number>(1.5)

  const peaks = useMemo<number[]>(() => {
    if (!Array.isArray(audio.waveform_peaks)) return []
    const sampled = audio.waveform_peaks
      .filter((_, index) => index % 3 === 0)
      .slice(0, 220)
    return sampled.length > 0 ? sampled : audio.waveform_peaks.slice(0, 220)
  }, [audio.waveform_peaks])

  // Reset playback when the source URL changes, optionally resuming from
  // the pending-resume position recorded during a refresh.
  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    recoveredUrlRef.current = null
    const resumeTime = pendingResumeTimeRef.current
    setCurrentTime(resumeTime ?? 0)
    setPlaying(false)
    element.pause()
    try {
      element.currentTime = resumeTime ?? 0
    } catch {
      element.currentTime = 0
    }
    if (pendingResumeRef.current) {
      pendingResumeRef.current = false
      pendingResumeTimeRef.current = null
      element.play().catch(() => {
        setPlaying(false)
        onPlaybackError?.()
      })
      return
    }
    pendingResumeTimeRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audio.url])

  useEffect(() => {
    const element = audioRef.current
    if (!element) return
    element.playbackRate = speed
    // preservesPitch is non-standard but widely supported.
    ;(element as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
  }, [speed])

  function isUrlExpiringSoon(): boolean {
    if (!audio.expires_at) return false
    const expiresAtMs = Date.parse(audio.expires_at)
    if (!Number.isFinite(expiresAtMs)) return false
    return expiresAtMs - Date.now() <= EXPIRY_REFRESH_WINDOW_MS
  }

  async function refreshAndResume(): Promise<boolean> {
    if (!onRefresh || refreshing) return false
    if (recoveredUrlRef.current === (audio.url ?? null)) return false
    recoveredUrlRef.current = audio.url ?? null
    pendingResumeRef.current = true
    pendingResumeTimeRef.current = currentTime
    try {
      await Promise.resolve(onRefresh())
      return true
    } catch {
      pendingResumeRef.current = false
      pendingResumeTimeRef.current = null
      onPlaybackError?.()
      return false
    }
  }

  function togglePlayback(): void {
    const element = audioRef.current
    if (!element) return
    if (element.paused) {
      if (refreshing) {
        pendingResumeRef.current = true
        pendingResumeTimeRef.current = currentTime
        return
      }
      if (onRefresh && isUrlExpiringSoon()) {
        void refreshAndResume()
        return
      }
      element.play().catch(() => {
        setPlaying(false)
        onPlaybackError?.()
      })
      return
    }
    element.pause()
  }

  function seekTo(clientX: number): void {
    const element = audioRef.current
    const scrubber = scrubRef.current
    if (!element || !scrubber || !duration) return
    const bounds = scrubber.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width))
    const nextTime = ratio * duration
    element.currentTime = nextTime
    setCurrentTime(nextTime)
  }

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0
  const expiresLabel = audio.expires_at
    ? new Date(audio.expires_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  if (!audio.url) return null

  return (
    <div className={className} style={styles.root}>
      <audio
        ref={audioRef}
        src={audio.url ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0)
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime)
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (onRefresh) {
            void refreshAndResume().then((didRefresh) => {
              if (!didRefresh) onPlaybackError?.()
            })
            return
          }
          onPlaybackError?.()
        }}
      />
      <div style={styles.layout}>
        <button
          type="button"
          onClick={togglePlayback}
          aria-label={playing ? 'Pause narration' : 'Play narration'}
          style={styles.playButton}
        >
          {playing ? (
            <svg viewBox="0 0 24 24" style={styles.playIcon} aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              style={{ ...styles.playIcon, ...styles.playIconOffset }}
              aria-hidden="true"
            >
              <path d="M7 5.2c0-1.02 1.12-1.65 2-.98l10.2 7.78a1.24 1.24 0 0 1 0 1.98L9 21.76c-.88.67-2-.04-2-1.08V5.2Z" />
            </svg>
          )}
        </button>
        <div style={styles.content}>
          <div style={styles.metaRow}>
            <span>{formatTime(currentTime / speed)}</span>
            <div style={styles.metaRight}>
              <span style={styles.badge}>{narrationLabel}</span>
              <span>{formatTime(duration / speed)}</span>
            </div>
          </div>
          <div
            ref={scrubRef}
            role="slider"
            aria-label="Narration progress"
            aria-valuemin={0}
            aria-valuemax={Math.max(1, Math.floor(duration))}
            aria-valuenow={Math.floor(currentTime)}
            tabIndex={0}
            onClick={(event) => seekTo(event.clientX)}
            style={styles.scrubber}
          >
            {peaks.length > 0 ? (
              <svg
                viewBox={`0 0 ${peaks.length} 40`}
                preserveAspectRatio="none"
                style={styles.waveform}
              >
                {peaks.map((peak, index) => {
                  const height = Math.max(2, Math.round(Math.abs(peak) * 34))
                  const y = (40 - height) / 2
                  const filled = index / peaks.length < progress
                  return (
                    <rect
                      key={`${audio.id}-${index}`}
                      x={index}
                      y={y}
                      width={0.82}
                      height={height}
                      rx={0.4}
                      fill={filled ? '#155dfc' : '#90c5ff'}
                    />
                  )
                })}
              </svg>
            ) : (
              <>
                <div style={styles.fallbackTrack} />
                <div style={{ ...styles.fallbackProgress, width: `${progress * 100}%` }} />
              </>
            )}
          </div>
          <div style={styles.chipsRow}>
            <span style={styles.chipStrong}>Provider: {providerLabel}</span>
            {duration > 0 && (
              <span style={styles.chipMuted}>Length {formatTime(duration / speed)}</span>
            )}
            {expiresLabel && <span style={styles.chipMuted}>Expires {expiresLabel}</span>}
          </div>
        </div>
        <div style={styles.controls}>
          <button
            type="button"
            onClick={() => setSpeed((currentSpeed) => getNextSpeed(currentSpeed))}
            style={styles.secondaryButton}
          >
            {speed}×
          </button>
          {onRefresh && showRefreshButton && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              style={refreshing ? { ...styles.refreshButton, ...styles.disabled } : styles.refreshButton}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
