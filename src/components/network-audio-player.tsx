'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { EMPTY_SNAPSHOT, NetworkAudioController, trackKey, validSnapshot,
  type NetworkAudioSnapshot, type NetworkAudioTrack, type ResolveNetworkAudio } from '../network-audio/controller'
import { hostNetworkPlayer, NetworkPlayerClient, runCommand, type NetworkAudioCommand,
  type NetworkPlayerConnection, type NetworkPlayerHostOptions } from '../network-audio/bridge'
import { NarrationHighlighter, narrationHighlightSupported, parseTimingsPayload } from './narration-highlight'
import type { AudioPlayerNarration } from './audio-player'
import './network-audio-player.css'

export interface NetworkAudioProviderProps {
  children: ReactNode
  /** Resolve through your reader-authorized server route, including publication identity. */
  resolveAudio: ResolveNetworkAudio
  /** Reader pages: enables the opt-in separate player window and remote bottom bar. */
  connection?: NetworkPlayerConnection
  /** Dedicated player route: allows only these reader origins to control its audio. */
  host?: NetworkPlayerHostOptions
  /** Optional sessionStorage checkpoint. Scope by application/network and user; honor consent. Restores paused. */
  checkpointStorageKey?: string
}
export interface NetworkAudioContextValue {
  snapshot: NetworkAudioSnapshot
  remote: boolean
  hosted: boolean
  notice: string | null
  command: (command: NetworkAudioCommand) => void
  openNetworkPlayer?: () => void
  highlightEnabled: boolean
  setHighlightEnabled: (enabled: boolean) => void
}
const Context = createContext<NetworkAudioContextValue | null>(null)
const serverSnapshot = () => EMPTY_SNAPSHOT

/** Mount once in a persistent root layout, outside route keys/templates. */
export function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey }: NetworkAudioProviderProps) {
  if (connection && host) throw new Error('Use connection on reader pages and host on the dedicated player route, not both.')
  const [controller] = useState(() => new NetworkAudioController(resolveAudio))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, serverSnapshot)
  const [remoteSnapshot, setRemoteSnapshot] = useState<NetworkAudioSnapshot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [highlightEnabled, setHighlightEnabled] = useState(false)
  const client = useRef<NetworkPlayerClient | null>(null)
  useEffect(() => { controller.setResolver(resolveAudio) }, [controller, resolveAudio])
  useEffect(() => {
    const audio = document.createElement('audio')
    controller.attach(audio)
    return () => controller.detach()
  }, [controller])
  useEffect(() => {
    if (!checkpointStorageKey) return
    try {
      const data = JSON.parse(sessionStorage.getItem(checkpointStorageKey) ?? 'null')
      if (validSnapshot(data)) controller.restore(data)
    } catch { /* Storage is optional, including in private browsing. */ }
    let lastWrite = 0
    const save = () => {
      try { sessionStorage.setItem(checkpointStorageKey, JSON.stringify(controller.getSnapshot())) }
      catch { /* Playback does not depend on storage access. */ }
    }
    const unsubscribe = controller.subscribe(() => {
      if (Date.now() - lastWrite > 1000) { lastWrite = Date.now(); save() }
    })
    window.addEventListener('pagehide', save)
    return () => { save(); unsubscribe(); window.removeEventListener('pagehide', save) }
  }, [controller, checkpointStorageKey])
  const allowedOrigins = JSON.stringify(host?.allowedOrigins ?? [])
  useEffect(() => {
    if (!host) return
    return hostNetworkPlayer(controller, { networkId: host.networkId, allowedOrigins: JSON.parse(allowedOrigins) })
  }, [controller, host?.networkId, allowedOrigins])
  useEffect(() => {
    if (!connection) return
    const instance = new NetworkPlayerClient(controller, connection, (state, message) => {
      setRemoteSnapshot(state)
      setNotice(message)
    })
    client.current = instance
    return () => { instance.dispose(); client.current = null }
  }, [controller, connection?.playerUrl, connection?.networkId])
  const command = useCallback((value: NetworkAudioCommand) => {
    setNotice(null)
    try {
      if (!client.current?.command(value)) runCommand(controller, value)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The article could not be added.')
    }
  }, [controller])
  const openNetworkPlayer = useCallback(() => client.current?.open(), [])
  const activeSnapshot = remoteSnapshot ?? snapshot
  return <Context.Provider value={{ snapshot: activeSnapshot, remote: remoteSnapshot !== null, hosted: !!host, notice, command,
    openNetworkPlayer: connection ? openNetworkPlayer : undefined, highlightEnabled, setHighlightEnabled }}>
    <NetworkMediaSession />
    {children}
  </Context.Provider>
}

export function useNetworkAudio(): NetworkAudioContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('Mount NetworkAudioProvider above the player and article controls.')
  return context
}

function NetworkMediaSession() {
  const { snapshot, remote, command } = useNetworkAudio()
  const track = snapshot.queue[snapshot.index]
  useEffect(() => {
    if (remote || !track || !('mediaSession' in navigator)) return
    const mediaSession = navigator.mediaSession
    if (typeof MediaMetadata !== 'undefined') mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.publicationName ?? '' })
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => command({ action: 'play' })], ['pause', () => command({ action: 'pause' })],
      ['seekto', details => { if (details.seekTime != null) command({ action: 'seek', value: details.seekTime }) }],
    ]
    handlers.forEach(([action, handler]) => { try { mediaSession.setActionHandler(action, handler) } catch { /* Optional browser control. */ } })
    return () => {
      handlers.forEach(([action]) => { try { mediaSession.setActionHandler(action, null) } catch { /* Optional browser control. */ } })
      mediaSession.metadata = null
      mediaSession.playbackState = 'none'
    }
  }, [remote, track, command])
  useEffect(() => {
    if (remote || !track || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = snapshot.status === 'playing' ? 'playing' : 'paused'
    if (snapshot.duration > 0) {
      try { navigator.mediaSession.setPositionState({ duration: snapshot.duration, playbackRate: snapshot.rate,
        position: Math.min(snapshot.position, snapshot.duration) }) } catch { /* Not supported by every browser. */ }
    }
  }, [remote, track, snapshot.status, snapshot.position, snapshot.duration, snapshot.rate])
  return null
}

const subscribeCapabilities = () => () => {}
/** Attach in the article component. Unmount/hidden tab clears only highlighting, never playback. */
export function useArticleNarration(track: NetworkAudioTrack, narration?: AudioPlayerNarration) {
  const { snapshot, highlightEnabled, setHighlightEnabled } = useNetworkAudio()
  const supported = useSyncExternalStore(subscribeCapabilities, narrationHighlightSupported, () => false)
  const active = snapshot.queue[snapshot.index]
  const matching = !!active && trackKey(active) === trackKey(track)
  const clock = useRef({ snapshot, received: 0 })
  useEffect(() => { clock.current = { snapshot, received: performance.now() } }, [snapshot])
  useEffect(() => {
    if (!narration || !matching || !highlightEnabled || !supported) return
    const controller = new AbortController()
    let highlighter: NarrationHighlighter | null = null
    let frame = 0
    const render = () => {
      const { snapshot: current, received } = clock.current
      const elapsed = current.status === 'playing' ? Math.min((performance.now() - received) / 1000, 0.5) * current.rate : 0
      highlighter?.update((current.position + elapsed) * 1000)
      frame = requestAnimationFrame(render)
    }
    const visibility = () => {
      cancelAnimationFrame(frame)
      if (document.visibilityState === 'hidden') highlighter?.clear()
      else if (highlighter) frame = requestAnimationFrame(render)
    }
    const timeout = setTimeout(() => controller.abort(), 15000)
    void (async () => {
      try {
        const response = await fetch(narration.timingsUrl, { signal: controller.signal })
        if (!response.ok) return
        const timings = parseTimingsPayload(await response.json())
        const target = document.getElementById(narration.targetId)
        if (controller.signal.aborted || !timings || !target) return
        highlighter = new NarrationHighlighter(target, timings)
        if (highlighter.matchRatio() < 0.5) { highlighter.destroy(); highlighter = null; return }
        visibility()
      } catch { /* Timings are optional; an unavailable highlight must not stop audio. */ }
      finally { clearTimeout(timeout) }
    })()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      controller.abort(); clearTimeout(timeout); cancelAnimationFrame(frame); highlighter?.destroy()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [matching, highlightEnabled, supported, narration?.targetId, narration?.timingsUrl, track.id, track.publicationId])
  return { highlightAvailable: !!narration && supported, highlightEnabled, setHighlightEnabled, matching }
}

export interface ArticleAudioControlsProps {
  track: NetworkAudioTrack
  narration?: AudioPlayerNarration
  className?: string
}
export function ArticleAudioControls({ track, narration, className = '' }: ArticleAudioControlsProps) {
  const { snapshot, command } = useNetworkAudio()
  const { highlightAvailable, highlightEnabled, setHighlightEnabled, matching } = useArticleNarration(track, narration)
  const playing = matching && (snapshot.status === 'playing' || snapshot.status === 'loading')
  const queued = snapshot.queue.some(item => trackKey(item) === trackKey(track))
  return <div className={`sm-network-article ${className}`} aria-label="Article audio">
    <button type="button" onClick={() => command(playing ? { action: 'pause' } : { action: 'playTrack', track })}>{playing ? 'Pause article' : 'Listen to article'}</button>
    <button type="button" disabled={queued} onClick={() => command({ action: 'enqueue', track })}>{queued ? 'In your queue' : 'Add to queue'}</button>
    {highlightAvailable && <button type="button" aria-pressed={highlightEnabled} onClick={() => setHighlightEnabled(!highlightEnabled)}>Highlight words</button>}
  </div>
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export interface NetworkAudioPlayerProps {
  networkName?: string
  /** Render an actual ad or sponsor creative here. The expanded slot is labeled Advertisement. */
  advertisement?: ReactNode
  className?: string
  style?: CSSProperties
  /** Use false on the dedicated player page; readers default to a fixed bottom bar with a measured spacer. */
  fixed?: boolean
  /** Supply your router's Link for same-site navigation. The host always opens articles separately. */
  renderArticleLink?: (track: NetworkAudioTrack) => ReactNode
}
export function NetworkAudioPlayer({ networkName = 'Your listening queue', advertisement, className = '', style, fixed = true, renderArticleLink }: NetworkAudioPlayerProps) {
  const { snapshot, remote, hosted, notice, command, openNetworkPlayer } = useNetworkAudio()
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(0)
  const bar = useRef<HTMLElement>(null)
  const detailsId = useId()
  const track = snapshot.queue[snapshot.index]
  const playing = snapshot.status === 'playing' || snapshot.status === 'loading'
  useEffect(() => {
    const element = bar.current
    if (!fixed || !element) return
    const measure = () => setHeight(element.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fixed, !!track, expanded, notice, snapshot.error])
  if (!track) return notice ? <p role="status">{notice}</p> : null
  return <>
    {fixed && <div aria-hidden="true" style={{ height }} />}
    <section ref={bar} className={`sm-network-player ${fixed ? 'sm-network-player--fixed' : ''} ${className}`} style={style} aria-label="Network audio player">
      <div className="sm-network-player__row">
        <button type="button" className="sm-network-player__play" aria-label={playing ? 'Pause playback' : 'Play playback'} onClick={() => command({ action: playing ? 'pause' : 'play' })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="M7 3v18l15-9z" />}</svg>
        </button>
        <div className="sm-network-player__story"><span>{remote ? 'Playing in network window' : networkName}</span>{!hosted && renderArticleLink ? renderArticleLink(track) : <a href={track.articleUrl} target="_blank" rel="noopener noreferrer">{track.title}</a>}<small>{track.publicationName}</small></div>
        <div className="sm-network-player__timeline">
          <input type="range" min="0" max={snapshot.duration || 0} step="0.1" value={Math.min(snapshot.position, snapshot.duration)} disabled={!snapshot.duration} aria-label="Seek article audio" onChange={e => command({ action: 'seek', value: Number(e.target.value) })} />
          <div><span>{formatTime(snapshot.position)}</span><span>{formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} remaining</span></div>
        </div>
        <button type="button" disabled={snapshot.index + 1 >= snapshot.queue.length} onClick={() => command({ action: 'select', value: snapshot.index + 1 })}>Next</button>
        <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : `Queue (${snapshot.queue.length})`}</button>
      </div>
      {(notice || snapshot.error) && <p role="status" className="sm-network-player__notice">{notice ?? snapshot.error}</p>}
      <div id={detailsId} hidden={!expanded} className="sm-network-player__details">
        <div className="sm-network-player__tools">
          <button type="button" onClick={() => command({ action: 'seek', value: snapshot.position - 15 })}>Back 15 seconds</button>
          <button type="button" onClick={() => command({ action: 'seek', value: snapshot.position + 30 })}>Forward 30 seconds</button>
          <label>Speed <select value={snapshot.rate} onChange={e => command({ action: 'rate', value: Number(e.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
          <label>Volume <input type="range" min="0" max="1" step="0.05" value={snapshot.volume} onChange={e => command({ action: 'volume', value: Number(e.target.value) })} /></label>
          {openNetworkPlayer && <button type="button" onClick={openNetworkPlayer}>{remote ? 'Open player window' : 'Listen across sites ↗'}</button>}
          <button type="button" onClick={() => command({ action: 'clear' })}>Stop and clear queue</button>
        </div>
        <div className="sm-network-player__expanded">
          <div><h2>Up next</h2><ol>{snapshot.queue.map((item, index) => <li key={trackKey(item)} aria-current={index === snapshot.index ? 'true' : undefined}>
            <button type="button" className="sm-network-player__queue-title" onClick={() => command({ action: 'select', value: index })}>{item.title}<small>{item.publicationName}{index === snapshot.index ? ' — Current article' : ''}</small></button>
            <button type="button" aria-label={`Remove ${item.title} from queue`} onClick={() => command({ action: 'remove', value: index })}>Remove</button>
          </li>)}</ol></div>
          {advertisement && <aside aria-label="Advertisement"><span>Advertisement</span>{advertisement}</aside>}
        </div>
      </div>
    </section>
  </>
}
