'use client'

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import './audio-player.css'

export interface AudioPlayerSource {
  url: string | null
  duration_ms?: number | null
  expires_at?: string | null
  waveform_peaks?: number[] | null
  ai_generated?: boolean
}
export type AudioPlayerVariant = 'waveform' | 'compact' | 'inline'
export interface AudioPlayerProps {
  audio: AudioPlayerSource
  /** Stable article/record identity, including the tenant if needed. Changing it resets playback. */
  audioKey?: string
  variant?: AudioPlayerVariant
  label?: string
  className?: string
  style?: CSSProperties
  /** Defaults to none: lists do not download every recording on page load. */
  preload?: 'none' | 'metadata'
  /** Called at most once automatically per play attempt. Honor signal to cancel network work. */
  onRefresh?: (signal: AbortSignal) => Promise<AudioPlayerSource>
  showRefreshButton?: boolean
  onPlaybackError?: () => void
  /** Shared with the existing ScaleMule blog player. Set null to disable persistence. */
  playbackRateStorageKey?: string | null
  exclusivePlayback?: boolean
}

const SPEEDS = [1, 1.25, 1.5, 2, 3]
const PLAY_EVENT = 'scalemule:audio:play'
const positive = (n: number | undefined | null) =>
  n != null && Number.isFinite(n) && n > 0 ? n : 0
const durationOf = (audio: AudioPlayerSource) =>
  positive(audio.duration_ms) / 1000
function time(seconds: number) {
  const s = Math.floor(positive(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Three layouts, one playback controller. No provider, credentials, polling, or Next.js runtime imports. */
export function AudioPlayer(props: AudioPlayerProps) {
  if (!props.audio.url) return null
  return <PlayerSession key={props.audioKey ?? props.audio.url} {...props} />
}

function PlayerSession({
  audio,
  variant = 'waveform',
  label,
  className,
  style,
  preload = 'none',
  onRefresh,
  showRefreshButton = false,
  onPlaybackError,
  playbackRateStorageKey = 'scalemule:audio:playback-rate',
  exclusivePlayback = true,
}: AudioPlayerProps) {
  const media = useRef<HTMLAudioElement>(null)
  const alive = useRef(true)
  const request = useRef<AbortController | null>(null)
  const triedRefresh = useRef(false)
  const intent = useRef(false)
  const resume = useRef<number | null>(null)
  const [source, setSource] = useState(audio)
  const [duration, setDuration] = useState(durationOf(audio))
  const [position, setPosition] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [pendingPlay, setPendingPlay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sliderId = useId()
  const labelId = useId()
  const rate = useRef(1)

  useEffect(() => {
    alive.current = true
    const element = media.current
    return () => {
      alive.current = false
      intent.current = false
      request.current?.abort()
      element?.pause()
    }
  }, [])

  useEffect(() => {
    // A refreshed prop for the same record must not resurrect an older in-flight response.
    request.current?.abort()
    request.current = null
    setBusy(false)
    resume.current = media.current?.currentTime ?? 0
    setSource(audio)
    setDuration(durationOf(audio))
  }, [audio.url, audio.expires_at, audio.duration_ms])

  useEffect(() => {
    if (!playbackRateStorageKey) return
    try {
      const saved = Number(window.localStorage.getItem(playbackRateStorageKey))
      if (SPEEDS.includes(saved)) {
        setSpeed(saved)
        rate.current = saved
      }
    } catch {
      /* Storage is optional (private browsing / restricted iframe). */
    }
  }, [playbackRateStorageKey])

  useEffect(() => {
    if (media.current) {
      media.current.playbackRate = speed
      media.current.preservesPitch = true
    }
  }, [speed, source.url])

  useEffect(() => {
    if (!exclusivePlayback) return
    const stop = (event: Event) => {
      if ((event as CustomEvent).detail !== media.current) {
        intent.current = false
        setPendingPlay(false)
        media.current?.pause()
      }
    }
    document.addEventListener(PLAY_EVENT, stop)
    return () => document.removeEventListener(PLAY_EVENT, stop)
  }, [exclusivePlayback])

  function fail() {
    if (!alive.current) return
    intent.current = false
    setPendingPlay(false)
    setPlaying(false)
    setBusy(false)
    setError('Audio could not be played. Try again.')
    onPlaybackError?.()
  }

  async function play() {
    const element = media.current
    if (!element || !intent.current) return
    try {
      await element.play()
    } catch (e) {
      if (!alive.current || !intent.current) return
      // A browser gesture restriction is not an expired URL; do not fetch/retry it.
      if ((e as { name?: string }).name === 'NotAllowedError') {
        fail()
        return
      }
      await recover()
    }
  }

  async function recover(manual = false) {
    if (!alive.current || request.current) return
    if (!onRefresh || (!manual && triedRefresh.current)) {
      fail()
      return
    }
    triedRefresh.current = true
    const controller = new AbortController()
    request.current = controller
    resume.current = media.current?.currentTime ?? position
    setBusy(true)
    setError(null)
    try {
      const fresh = await onRefresh(controller.signal)
      if (!alive.current || controller.signal.aborted) return
      if (!fresh.url) throw new Error('No audio URL')
      setDuration(durationOf(fresh) || duration)
      if (fresh.url === source.url) {
        // A stable proxy URL may be refreshed too. load() emits metadata before resuming.
        media.current?.load()
      } else {
        setSource(fresh)
      }
    } catch {
      if (!controller.signal.aborted) fail()
    } finally {
      if (request.current === controller) {
        request.current = null
        if (alive.current) setBusy(false)
      }
    }
  }

  function toggle() {
    if (intent.current || playing) {
      intent.current = false
      setPendingPlay(false)
      media.current?.pause()
      return
    }
    intent.current = true
    setPendingPlay(true)
    triedRefresh.current = false
    setError(null)
    // Claim exclusivity before async refresh so another click can cancel this intent.
    if (exclusivePlayback)
      document.dispatchEvent(
        new CustomEvent(PLAY_EVENT, { detail: media.current })
      )
    if (request.current) return
    const expiry = Date.parse(source.expires_at ?? '')
    if (onRefresh && Number.isFinite(expiry) && expiry - Date.now() <= 60_000) {
      void recover()
    } else {
      void play()
    }
  }

  function seek(value: number) {
    if (!media.current || !duration || !Number.isFinite(value)) return
    const target = Math.max(0, Math.min(duration, value))
    try {
      media.current.currentTime = target
      resume.current = target
      setPosition(target)
    } catch {
      /* A browser may not allow seeking until metadata is available. */
    }
  }

  function changeSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(rate.current) + 1) % SPEEDS.length]
    rate.current = next
    setSpeed(next)
    if (playbackRateStorageKey) {
      try {
        window.localStorage.setItem(playbackRateStorageKey, String(next))
      } catch {
        /* Preference persistence is optional. */
      }
    }
  }

  // Bounded, real peak sampling. Missing waveform data gets an honest progress track.
  const peaks = useMemo(() => {
    const input = source.waveform_peaks
    if (!input?.length) return []
    const count = Math.min(64, input.length)
    return Array.from({ length: count }, (_, i) => {
      const value = input[Math.floor((i * input.length) / count)]
      return Number.isFinite(value)
        ? Math.min(1, Math.max(0.08, Math.abs(value)))
        : 0.08
    })
  }, [source.waveform_peaks])
  const current = Math.min(positive(position), duration || Infinity)
  const progress = duration
    ? Math.max(0, Math.min(100, (current / duration) * 100))
    : 0
  const remaining = duration
    ? `${time((duration - current) / speed)} remaining`
    : 'Duration available when played'
  const title =
    label ??
    (source.ai_generated === false
      ? 'Listen to narration'
      : 'Listen to AI narration')

  return (
    <div
      className={`sm-audio sm-audio--${variant}${className ? ` ${className}` : ''}`}
      style={style}
      role="group"
      aria-labelledby={labelId}
      data-audio-variant={variant}
    >
      <audio
        ref={media}
        src={source.url ?? undefined}
        preload={preload}
        onLoadedMetadata={(e) => {
          const element = e.currentTarget
          const total = positive(element.duration) || durationOf(source)
          setDuration(total)
          element.playbackRate = rate.current
          element.preservesPitch = true
          if (resume.current != null) {
            try {
              element.currentTime = Math.min(
                resume.current,
                total || resume.current
              )
            } catch {
              /* Browser has not made this range seekable yet. */
            }
            resume.current = null
          }
          setPosition(positive(element.currentTime))
          if (intent.current) void play()
        }}
        onDurationChange={(e) => {
          const d = positive(e.currentTarget.duration)
          if (d) setDuration(d)
        }}
        onTimeUpdate={(e) => {
          // A paused preload=none source replacement emits a reset before metadata.
          // Keep the reader's saved position visible until the seek can be restored.
          if (e.currentTarget.readyState === 0 && resume.current != null) return
          setPosition(positive(e.currentTarget.currentTime))
        }}
        onPlay={() => {
          intent.current = true
          setPlaying(true)
          setError(null)
          if (exclusivePlayback)
            document.dispatchEvent(
              new CustomEvent(PLAY_EVENT, { detail: media.current })
            )
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          intent.current = false
          setPendingPlay(false)
          setPlaying(false)
          setPosition(duration)
        }}
        onError={() => {
          // Loading/preloading must never start playback or an automatic refresh loop.
          if (intent.current) void recover()
          else if (!request.current) {
            setError('Audio is unavailable. Press play to retry.')
          }
        }}
      />
      <button
        type="button"
        className="sm-audio__play"
        onClick={toggle}
        aria-label={
          playing || (busy && pendingPlay)
            ? 'Pause narration'
            : 'Play narration'
        }
      >
        {playing || (busy && pendingPlay) ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 4v16l12-8z" />
          </svg>
        )}
      </button>
      <div className="sm-audio__content">
        <span className="sm-audio__label" id={labelId}>
          {title}
        </span>
        <div className="sm-audio__times">
          <span>
            {time(current)} <span className="sm-audio__elapsed">elapsed</span>
          </span>
          <span>{remaining}</span>
        </div>
        {variant !== 'inline' && (
          <div
            className="sm-audio__seek"
            style={{ '--sm-audio-progress': `${progress}%` } as CSSProperties}
          >
            {variant === 'waveform' && peaks.length > 0 && (
              <div className="sm-audio__waveform" aria-hidden="true">
                {peaks.map((peak, i) => (
                  <span
                    key={i}
                    style={{
                      height: `${peak * 100}%`,
                      background:
                        ((i + 0.5) / peaks.length) * 100 <= progress
                          ? 'var(--sm-audio-accent)'
                          : 'var(--sm-audio-wave)',
                    }}
                  />
                ))}
              </div>
            )}
            <label className="sm-audio__sr" htmlFor={sliderId}>
              Seek narration
            </label>
            <input
              id={sliderId}
              className="sm-audio__range"
              type="range"
              min="0"
              max={duration || 1}
              step="0.1"
              disabled={!duration}
              value={Math.min(current, duration || 1)}
              aria-valuetext={`${time(current)} elapsed; ${remaining}`}
              onChange={(e) => seek(Number(e.currentTarget.value))}
            />
          </div>
        )}
      </div>
      <div className="sm-audio__actions">
        <button
          type="button"
          className="sm-audio__speed"
          onClick={changeSpeed}
          aria-label={`Change playback speed (current ${speed}×)`}
        >
          {speed}×
        </button>
        {onRefresh && showRefreshButton && (
          <button
            type="button"
            className="sm-audio__refresh"
            disabled={busy}
            onClick={() => void recover(true)}
          >
            Refresh
          </button>
        )}
      </div>
      {(busy || error) && (
        <p className="sm-audio__status" role="status">
          {busy ? 'Refreshing audio…' : error}
        </p>
      )}
    </div>
  )
}
