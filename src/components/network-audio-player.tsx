'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { EMPTY_SNAPSHOT, LISTENING_QUIET_AFTER_MS, NetworkAudioController, trackKey, validSnapshot,
  type NetworkAudioSnapshot, type NetworkAudioTrack, type ResolveNetworkAudio, type ListeningEvent } from '../network-audio/controller'
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
  /** Use local storage for return visits; never required for current-session playback. */
  checkpointStorage?: 'session' | 'local'
  onListeningEvent?: (event: ListeningEvent) => void
  /** Disable persistence and delete the checkpoint when functional consent is withdrawn. */
  checkpointEnabled?: boolean
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
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  openPlayer: () => void
}
const Context = createContext<NetworkAudioContextValue | null>(null)
const serverSnapshot = () => EMPTY_SNAPSHOT

/** Mount once in a persistent root layout, outside route keys/templates. */
export function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, checkpointStorage = 'session', checkpointEnabled = true, onListeningEvent }: NetworkAudioProviderProps) {
  if (connection && host) throw new Error('Use connection on reader pages and host on the dedicated player route, not both.')
  const [controller] = useState(() => new NetworkAudioController(resolveAudio))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, serverSnapshot)
  const [remoteSnapshot, setRemoteSnapshot] = useState<NetworkAudioSnapshot | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [highlightEnabled, setHighlightEnabled] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const metrics = useRef(onListeningEvent)
  metrics.current = onListeningEvent
  const client = useRef<NetworkPlayerClient | null>(null)
  useEffect(() => { controller.setResolver(resolveAudio) }, [controller, resolveAudio])
  useEffect(() => controller.subscribeEvents(event => metrics.current?.(event)), [controller])
  useEffect(() => {
    const audio = document.createElement('audio')
    controller.attach(audio)
    const pagehide = () => controller.pause()
    window.addEventListener('pagehide', pagehide)
    return () => { window.removeEventListener('pagehide', pagehide); controller.detach() }
  }, [controller])
  useEffect(() => {
    if (!checkpointStorageKey) return
    const storage = () => checkpointStorage === 'local' ? window.localStorage : window.sessionStorage
    if (!checkpointEnabled) {
      try { storage().removeItem(checkpointStorageKey) } catch { /* Storage is optional. */ }
      return
    }
    try {
      const raw = storage().getItem(checkpointStorageKey)
      const data = raw && raw.length < 1000000 ? JSON.parse(raw) : null
      if (validSnapshot(data) && !controller.getSnapshot().queue.length) {
        const tooOld = !!data.lastPlayedAt && Date.now() - data.lastPlayedAt > 30 * LISTENING_QUIET_AFTER_MS
        if (tooOld) storage().removeItem(checkpointStorageKey)
        else controller.restore({ ...data, dismissed: data.dismissed || (!!data.lastPlayedAt && Date.now() - data.lastPlayedAt >= LISTENING_QUIET_AFTER_MS) })
      }
    } catch { /* Storage is optional, including in private browsing. */ }
    let lastWrite = 0
    let saving = false
    const save = () => {
      if (saving) return
      saving = true
      try { storage().setItem(checkpointStorageKey, JSON.stringify(controller.checkpoint())) }
      catch { /* Playback does not depend on storage access. */ }
      finally { saving = false; lastWrite = Date.now() }
    }
    let previous = controller.getSnapshot()
    const unsubscribe = controller.subscribe(() => {
      const next = controller.getSnapshot()
      const urgent = (next.status !== previous.status && next.status !== 'playing')
        || next.dismissed !== previous.dismissed || next.queue !== previous.queue
        || next.rate !== previous.rate || next.volume !== previous.volume
      previous = next
      if (urgent || Date.now() - lastWrite > 1000) save()
    })
    const visibility = () => { if (document.visibilityState === 'hidden') save() }
    const pagehide = () => save()
    window.addEventListener('pagehide', pagehide)
    document.addEventListener('visibilitychange', visibility)
    return () => { save(); unsubscribe(); window.removeEventListener('pagehide', pagehide); document.removeEventListener('visibilitychange', visibility) }
  }, [controller, checkpointStorageKey, checkpointStorage, checkpointEnabled])
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
  const openPlayer = useCallback(() => { command({ action: 'show' }); setExpanded(true) }, [command])
  const activeSnapshot = remoteSnapshot ?? snapshot
  return <Context.Provider value={{ snapshot: activeSnapshot, remote: remoteSnapshot !== null, hosted: !!host, notice, command,
    openNetworkPlayer: connection ? openNetworkPlayer : undefined, highlightEnabled, setHighlightEnabled, expanded, setExpanded, openPlayer }}>
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
  const position = useRef(snapshot.position)
  position.current = snapshot.position
  useEffect(() => {
    if (remote || !track || !('mediaSession' in navigator)) return
    const mediaSession = navigator.mediaSession
    if (typeof MediaMetadata !== 'undefined') mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.publicationName ?? '' })
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => command({ action: 'play' })], ['pause', () => command({ action: 'pause' })],
      ['seekto', details => { if (details.seekTime != null) command({ action: 'seek', value: details.seekTime }) }],
      ['seekbackward', details => command({ action: 'seek', value: position.current - (details.seekOffset ?? 10) })],
      ['seekforward', details => command({ action: 'seek', value: position.current + (details.seekOffset ?? 10) })],
      ['stop', () => command({ action: 'dismiss' })],
      ...(snapshot.index + 1 < snapshot.queue.length ? [['nexttrack', () => command({ action: 'select', value: snapshot.index + 1 })] as [MediaSessionAction, MediaSessionActionHandler]] : []),
    ]
    handlers.forEach(([action, handler]) => { try { mediaSession.setActionHandler(action, handler) } catch { /* Optional browser control. */ } })
    return () => {
      handlers.forEach(([action]) => { try { mediaSession.setActionHandler(action, null) } catch { /* Optional browser control. */ } })
      mediaSession.metadata = null
      mediaSession.playbackState = 'none'
    }
  }, [remote, track, command, snapshot.index, snapshot.queue.length])
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
  const saved = snapshot.history?.find(p => trackKey(p.track) === trackKey(track))
  const position = matching ? snapshot.position : saved?.position ?? 0
  const duration = matching ? snapshot.duration || (track.durationMs ?? 0) / 1000 : saved?.duration || (track.durationMs ?? 0) / 1000
  const completed = saved?.completed || (duration > 0 && position >= duration)
  const remaining = Math.max(0, duration - position) / snapshot.rate
  const label = playing ? 'Pause article' : completed ? 'Listen again' : position > 0 ? 'Resume' : 'Listen'
  return <div className={`sm-network-article ${className}`} aria-label="Article audio">
    <button type="button" onClick={() => command(playing ? { action: 'pause' } : { action: 'playTrack', track })}>
      {label}{!playing && duration > 0 ? ` · ${listeningTime(completed ? duration / snapshot.rate : remaining)}${position > 0 && !completed ? ' left' : ''}` : ''}
    </button>
    {!playing && position > 0 && !completed && <button type="button" onClick={() => command({ action: 'restartTrack', track })}>Start over</button>}
    <button type="button" disabled={queued} onClick={() => command({ action: 'enqueue', track })}>{queued ? 'In your queue' : 'Add to queue'}</button>
    {highlightAvailable && <button type="button" aria-pressed={highlightEnabled} onClick={() => setHighlightEnabled(!highlightEnabled)}>Highlight words</button>}
  </div>
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
export function listeningTime(seconds: number) {
  const rounded = Math.ceil(seconds)
  return rounded < 60 ? `${rounded} sec` : `${Math.floor(rounded / 60)} min${rounded % 60 ? ` ${rounded % 60} sec` : ''}`
}

/** A quiet invitation on the front page; never starts audio on mount. */
export function ListeningInvitation() {
  const { snapshot, command, openPlayer } = useNetworkAudio()
  const track = snapshot.queue[snapshot.index]
  if (!track || !snapshot.dismissed) return null
  const completed = snapshot.history?.find(p => trackKey(p.track) === trackKey(track))?.completed
  return <section className="sm-listening-invitation" aria-label="Saved listening">
    <div><strong>{completed ? 'Listen again' : 'Continue listening'}</strong><p>{track.title}</p>
      <small>{snapshot.duration > 0 && !completed ? `${listeningTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} left` : track.publicationName}</small></div>
    <div className="sm-listening-actions">
      <button type="button" onClick={() => command({ action: 'play' })}>{completed ? 'Listen again' : 'Resume'}</button>
      {!completed && snapshot.position > 0 && <button type="button" onClick={() => command({ action: 'restart' })}>Start over</button>}
      <button type="button" onClick={openPlayer}>View queue</button>
    </div>
  </section>
}

/** A finite, explicit playlist. Replacing the queue happens only on Play stories. */
export function ListeningPlaylist({ tracks, title = "Listen to today’s stories", renderArticleLink }: { tracks: NetworkAudioTrack[]; title?: string; renderArticleLink?: (track: NetworkAudioTrack) => ReactNode }) {
  const { command, snapshot } = useNetworkAudio()
  const id = useId()
  if (!tracks.length) return null
  const knownDuration = tracks.every(track => !!track.durationMs)
  const seconds = tracks.reduce((sum, track) => sum + (track.durationMs ?? 0) / 1000, 0) / snapshot.rate
  return <section className="sm-listening-playlist" aria-labelledby={id}>
    <div className="sm-listening-playlist__heading"><div><h2 id={id}>{title}</h2>
      <p>{tracks.length} {tracks.length === 1 ? 'story' : 'stories'}{knownDuration ? ` · ${listeningTime(seconds)}` : ''}{snapshot.rate !== 1 ? ` at ${snapshot.rate}×` : ''}</p></div>
      <button type="button" onClick={() => command({ action: 'playQueue', tracks })}>Play stories</button></div>
    <ol>{tracks.map(track => <li key={trackKey(track)}>{renderArticleLink ? renderArticleLink(track) : <a href={track.articleUrl}>{track.title}</a>}
      {track.durationMs && <span>{listeningTime(track.durationMs / 1000 / snapshot.rate)}</span>}</li>)}</ol>
    <small>Plays these stories in order, then stops.{snapshot.queue.length > 0 ? ' Play stories replaces your queue; your listening progress is kept.' : ''}</small>
  </section>
}

/** Available from the permanent Listen navigation entry, including after closing the bar. */
export function ListeningLibrary({ renderArticleLink }: { renderArticleLink?: (track: NetworkAudioTrack) => ReactNode } = {}) {
  const { snapshot, command, openPlayer } = useNetworkAudio()
  const history = snapshot.history ?? []
  return <section className="sm-listening-library" aria-label="Your listening">
    <ListeningInvitation />
    {snapshot.queue.length > 0 && <button type="button" onClick={openPlayer}>Open player and queue ({snapshot.queue.length})</button>}
    {!snapshot.queue.length && !history.length && <p>Choose Listen on an article, or add a few stories to your queue. Your audio keeps playing as you browse this publication.</p>}
    {history.length > 0 && <><h2>Recently listened</h2><ul>{history.slice(0, 20).map(progress => {
      const current = snapshot.queue[snapshot.index]
      const playing = !!current && trackKey(current) === trackKey(progress.track) && (snapshot.status === 'playing' || snapshot.status === 'loading')
      return <li key={trackKey(progress.track)}>
      <div>{renderArticleLink ? renderArticleLink(progress.track) : <a href={progress.track.articleUrl}>{progress.track.title}</a>}<small>{progress.completed ? 'Finished' : `${listeningTime(Math.max(0, progress.duration - progress.position) / snapshot.rate)} left`}</small></div>
      <button type="button" onClick={() => command(playing ? { action: 'pause' } : { action: 'playTrack', track: progress.track })}>{playing ? 'Pause' : progress.completed ? 'Listen again' : 'Resume'}</button>
      {!progress.completed && progress.position > 0 && <button type="button" onClick={() => command({ action: 'restartTrack', track: progress.track })}>Start over</button>}
    </li>})}</ul></>}
  </section>
}

export interface NetworkAudioPlayerProps {
  networkName?: string
  /** Render an actual ad or sponsor creative here. The expanded slot is labeled Advertisement. */
  advertisement?: ReactNode
  className?: string
  style?: CSSProperties
  fixed?: boolean
  renderArticleLink?: (track: NetworkAudioTrack) => ReactNode
}
export function NetworkAudioPlayer({ networkName = 'Your listening queue', advertisement, className = '', style, fixed = true, renderArticleLink }: NetworkAudioPlayerProps) {
  const { snapshot, remote, hosted, notice, command, openNetworkPlayer, expanded, setExpanded } = useNetworkAudio()
  const [height, setHeight] = useState(0)
  const bar = useRef<HTMLElement>(null)
  const expandButton = useRef<HTMLButtonElement>(null)
  const detailsId = useId()
  const track = snapshot.queue[snapshot.index]
  const playing = snapshot.status === 'playing' || snapshot.status === 'loading'
  const visible = !!track && !snapshot.dismissed
  const upcoming = snapshot.queue.slice(snapshot.index + 1)
  const completed = track && snapshot.history?.find(p => trackKey(p.track) === trackKey(track))?.completed
  const playLabel = playing ? 'Pause playback' : snapshot.status === 'error' ? 'Retry playback' : completed ? 'Listen again' : snapshot.position > 0 ? 'Resume playback' : 'Play audio'
  useEffect(() => {
    const element = bar.current
    if (!fixed || !element || !visible) { setHeight(0); return }
    const measure = () => setHeight(element.getBoundingClientRect().height)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fixed, visible, expanded, notice, snapshot.error, snapshot.notice])
  if (!visible || !track) return null
  return <>
    {fixed && <div aria-hidden="true" style={{ height }} />}
    <section ref={bar} className={`sm-network-player ${fixed ? 'sm-network-player--fixed' : ''} ${className}`} style={style} aria-label="Audio player"
      onKeyDown={event => { if (event.key === 'Escape' && expanded) { setExpanded(false); expandButton.current?.focus() } }}>
      <div className="sm-network-player__row">
        <button type="button" className="sm-network-player__play" aria-label={playLabel} onClick={() => command({ action: playing ? 'pause' : 'play' })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="M7 3v18l15-9z" />}</svg>
        </button>
        <div className="sm-network-player__story"><span>{remote ? 'Playing in network window' : track.publicationName || networkName}</span>
          {!hosted && renderArticleLink ? renderArticleLink(track) : <a href={track.articleUrl} target="_blank" rel="noopener noreferrer">{track.title}</a>}
          <small>{snapshot.status === 'loading' ? 'Loading audio…' : snapshot.status === 'error' ? 'Playback stopped' : completed ? 'Finished' : snapshot.duration > 0 ? `${formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} left${playing ? '' : ' · Paused'}` : 'Ready to listen'}</small>
        </div>
        <button type="button" className="sm-network-player__rewind" onClick={() => command({ action: 'seek', value: snapshot.position - 10 })} aria-label="Back ten seconds">↶ 10</button>
        {!expanded && !playing && !completed && snapshot.position > 0 && <button className="sm-network-player__restart" type="button" onClick={() => command({ action: 'restart' })}>Start over</button>}
        <button ref={expandButton} type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>{expanded ? 'Collapse' : upcoming.length ? `Up next (${upcoming.length})` : 'Player options'}</button>
        <button type="button" className="sm-network-player__close" aria-label="Close player and save progress" onClick={() => { command({ action: 'dismiss' }); setExpanded(false) }}>×</button>
      </div>
      {(notice || snapshot.error || snapshot.notice) && <p role="status" className="sm-network-player__notice">{notice ?? snapshot.error ?? snapshot.notice}
        {snapshot.status === 'error' && <button type="button" onClick={() => command({ action: 'play' })}>Retry</button>}</p>}
      <div id={detailsId} hidden={!expanded} className="sm-network-player__details">
        <div className="sm-network-player__timeline">
          <input type="range" min="0" max={snapshot.duration || 0} step="0.1" value={Math.min(snapshot.position, snapshot.duration)} disabled={!snapshot.duration} aria-label="Seek article audio" aria-valuetext={`${formatTime(snapshot.position)} of ${formatTime(snapshot.duration)}`} onChange={e => command({ action: 'seek', value: Number(e.target.value) })} />
          <div><span>{formatTime(snapshot.position)}</span><span>{formatTime(snapshot.duration)}</span></div>
        </div>
        <div className="sm-network-player__tools">
          <button type="button" onClick={() => command({ action: 'restart' })}>Start over</button>
          <button type="button" onClick={() => command({ action: 'seek', value: snapshot.position + 10 })}>Forward ten seconds</button>
          {upcoming.length > 0 && <button type="button" onClick={() => command({ action: 'select', value: snapshot.index + 1 })}>Next story</button>}
          <label>Speed <select aria-label="Playback speed" value={snapshot.rate} onChange={e => command({ action: 'rate', value: Number(e.target.value) })}>{[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select></label>
          <label className="sm-network-player__volume">Volume <input type="range" min="0" max="1" step="0.05" value={snapshot.volume} onChange={e => command({ action: 'volume', value: Number(e.target.value) })} /></label>
          {openNetworkPlayer && <button type="button" onClick={openNetworkPlayer}>{remote ? 'Open player window' : 'Listen across sites ↗'}</button>}
          <button type="button" onClick={() => command({ action: 'clear' })}>Clear queue</button>
        </div>
        <div className="sm-network-player__expanded">
          <div><h2>Up next</h2>{!upcoming.length ? <p>Your queue ends here. Add another article while you browse.</p> : <ol>{upcoming.map((item, offset) => <li key={trackKey(item)}>
            <button type="button" className="sm-network-player__queue-title" onClick={() => command({ action: 'select', value: snapshot.index + 1 + offset })}>{item.title}<small>{item.publicationName}</small></button>
            <button type="button" aria-label={`Remove ${item.title} from queue`} onClick={() => command({ action: 'remove', value: snapshot.index + 1 + offset })}>Remove</button>
          </li>)}</ol>}</div>
          {advertisement && <aside aria-label="Advertisement"><span>Advertisement</span>{advertisement}</aside>}
        </div>
      </div>
    </section>
  </>
}
