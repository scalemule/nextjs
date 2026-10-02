'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { EMPTY_SNAPSHOT, NetworkAudioController, trackKey, storyKey, listeningRecord, validTrack, validSnapshot,
  type NetworkAudioSnapshot, type NetworkAudioTrack, type ResolveNetworkAudio } from '../network-audio/controller'
import { hostNetworkPlayer, NetworkPlayerClient, runCommand, type NetworkAudioCommand,
  type NetworkPlayerConnection, type NetworkPlayerHostOptions } from '../network-audio/bridge'
import { NarrationHighlighter, narrationHighlightSupported, parseTimingsPayload } from './narration-highlight'
import type { AudioPlayerNarration } from './audio-player'
import { persistListening, type ListeningPersistence } from '../network-audio/persistence'
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
  persistence?: ListeningPersistence
  loadRecommendations?: (signal: AbortSignal) => Promise<NetworkAudioTrack[]>
}
export interface NetworkAudioContextValue {
  snapshot: NetworkAudioSnapshot
  remote: boolean
  hosted: boolean
  notice: string | null
  command: (command: NetworkAudioCommand) => void
  openNetworkPlayer?: () => void
  highlightAvailable: boolean
  highlightEnabled: boolean
  setHighlightEnabled: (enabled: boolean) => void
  catchUp?: (minutes: number) => Promise<void>
  recommendationsLoading: boolean
}
const Context = createContext<NetworkAudioContextValue | null>(null)
const NarrationRegistration = createContext<((key: string) => () => void) | null>(null)
const serverSnapshot = () => EMPTY_SNAPSHOT

/** Mount once in a persistent root layout, outside route keys/templates. */
export function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, persistence, loadRecommendations }: NetworkAudioProviderProps) {
  if (connection && host) throw new Error('Use connection on reader pages and host on the dedicated player route, not both.')
  const [controller] = useState(() => new NetworkAudioController(resolveAudio))
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, serverSnapshot)
  const [remoteSnapshot, setRemoteSnapshot] = useState<NetworkAudioSnapshot | null>(null)
  const [recommendationsLoading, setRecommendationsLoading] = useState(false)
  const recommendationRequest = useRef<AbortController | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [highlightEnabled, setHighlightEnabled] = useState(false)
  const [narrationTracks, setNarrationTracks] = useState<ReadonlyMap<symbol, string>>(() => new Map())
  const registerNarration = useCallback((key: string) => {
    const id = Symbol()
    setNarrationTracks(previous => new Map(previous).set(id, key))
    return () => setNarrationTracks(previous => { const next = new Map(previous); next.delete(id); return next })
  }, [])
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
  const persistenceOrigins = JSON.stringify(persistence?.allowedOrigins ?? [])
  useEffect(() => {
    if (persistence) return persistListening(controller, { ...persistence, allowedOrigins: JSON.parse(persistenceOrigins) })
  }, [controller, persistence?.storageKey, persistence?.networkId, persistence?.hubUrl, persistenceOrigins])
  useEffect(() => () => recommendationRequest.current?.abort(), [])
  const catchUp = useCallback(async (minutes: number) => {
    if (!loadRecommendations) return
    recommendationRequest.current?.abort()
    const request = new AbortController()
    recommendationRequest.current = request
    setRecommendationsLoading(true); setNotice(null)
    const timeout = setTimeout(() => request.abort(), 20000)
    try {
      const tracks = await loadRecommendations(request.signal)
      if (request.signal.aborted) return
      controller.setRecommendations(tracks.filter(validTrack))
      controller.catchUp(minutes)
      if (!controller.getSnapshot().queue.length) setNotice('No stories available for this queue. Try a longer session or replay a story from Recently listened.')
    } catch {
      if (recommendationRequest.current === request) setNotice('Could not load your catch-up queue. Your saved queue is still here. Please try again.')
    } finally {
      clearTimeout(timeout)
      if (recommendationRequest.current === request) setRecommendationsLoading(false)
    }
  }, [controller, loadRecommendations])
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
      if (value.action === 'close') setHighlightEnabled(false)
      if (!client.current?.command(value)) runCommand(controller, value)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The article could not be added.')
    }
  }, [controller])
  const openNetworkPlayer = useCallback(() => client.current?.open(), [])
  const activeSnapshot = remoteSnapshot ?? snapshot
  const activeTrack = activeSnapshot.queue[activeSnapshot.index]
  const highlightAvailable = !!activeTrack && [...narrationTracks.values()].includes(trackKey(activeTrack))
  return <Context.Provider value={{ snapshot: activeSnapshot, remote: remoteSnapshot !== null, hosted: !!host, notice, command,
    openNetworkPlayer: connection ? openNetworkPlayer : undefined, highlightAvailable, highlightEnabled, setHighlightEnabled, catchUp: loadRecommendations ? catchUp : undefined, recommendationsLoading }}>
    <NarrationRegistration.Provider value={registerNarration}>
      <NetworkMediaSession />
      {children}
    </NarrationRegistration.Provider>
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
  const registerNarration = useContext(NarrationRegistration)
  const narrationKey = trackKey(track)
  const available = !!narration && supported
  useEffect(() => {
    if (available) return registerNarration?.(narrationKey)
  }, [available, narrationKey, registerNarration])
  const active = snapshot.queue[snapshot.index]
  const matching = !!active && trackKey(active) === trackKey(track)
  const clock = useRef({ snapshot, received: 0 })
  useEffect(() => { clock.current = { snapshot, received: performance.now() } }, [snapshot])
  useEffect(() => {
    if (!narration || !matching || !highlightEnabled || !supported || snapshot.hidden) return
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
  }, [snapshot.hidden, matching, highlightEnabled, supported, narration?.targetId, narration?.timingsUrl, track.id, track.publicationId])
  return { highlightAvailable: !!narration && supported, highlightEnabled, setHighlightEnabled, matching }
}

type AudioIconName = 'play' | 'pause' | 'queue' | 'check' | 'highlight' | 'next' | 'chevron' | 'external' | 'close'
function AudioIcon({ name }: { name: AudioIconName }) {
  return <svg className="sm-network-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {name === 'play' && <path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none" />}
    {name === 'pause' && <path d="M7 5h3v14H7zm7 0h3v14h-3z" fill="currentColor" stroke="none" />}
    {name === 'queue' && <><path d="M4 6h16M4 12h10M4 18h8m7-5v8m-4-4h8" /></>}
    {name === 'check' && <path d="m5 12 4 4L19 6" />}
    {name === 'highlight' && <><path d="m7 14 7-9 5 4-7 9-5-4Zm0 0-3 5h8M16 3l5 4M3 22h17" /></>}
    {name === 'next' && <><path d="m6 5 10 7-10 7Z" fill="currentColor" stroke="none" /><path d="M19 5v14" /></>}
    {name === 'chevron' && <path d="m7 10 5 5 5-5" />}
    {name === 'external' && <path d="M14 4h6v6m0-6L10 14m10 1v5H4V4h5" />}
    {name === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
  </svg>
}

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]

export interface ArticleAudioControlsProps {
  track: NetworkAudioTrack
  narration?: AudioPlayerNarration
  /** Recording length shown before playback; resolved media supplies the live duration. */
  durationMs?: number | null
  className?: string
}
export function ArticleAudioControls({ track, narration, durationMs, className = '' }: ArticleAudioControlsProps) {
  const { snapshot, command } = useNetworkAudio()
  const { highlightAvailable, highlightEnabled, setHighlightEnabled, matching } = useArticleNarration(track, narration)
  const playing = matching && (snapshot.status === 'playing' || snapshot.status === 'loading')
  const record = listeningRecord(snapshot, track)
  const resume = !record?.completedAt && (matching ? snapshot.position : record?.position ?? 0) > 2
  const updated = !record && snapshot.history?.some(item => item.completedAt && item.track.storyId && item.track.storyId === track.storyId)
  const caption = playing ? 'Pause this story' : record?.completedAt ? 'Listen again' : resume ? 'Resume this story' : 'Listen to this story'
  const queued = snapshot.queue.some(item => storyKey(item) === storyKey(track))
  const duration = matching && snapshot.duration > 0 ? snapshot.duration : (durationMs ?? 0) / 1000
  return <><div className={`sm-network-article ${className}`} role="group" aria-label="Article audio">
    <button type="button" className="sm-network-article__listen" aria-label={caption}
      onClick={() => command(playing ? { action: 'pause' } : { action: 'playTrack', track })}>
      <span className="sm-network-article__disc"><AudioIcon name={playing ? 'pause' : 'play'} /></span>
      <span className="sm-network-article__caption"><span>{caption}</span>{updated && <small>Updated since you listened</small>}
        <span className="sm-network-article__duration">{matching && snapshot.status === 'loading' ? 'Loading audio…' : duration > 0 ? `${formatTime(Math.max(0, duration - (resume ? matching ? snapshot.position : record?.position ?? 0 : 0)) / snapshot.rate)} ${resume ? 'remaining' : 'listening time'}` : 'Article audio'}</span>
      </span>
    </button>
    <div className="sm-network-article__actions">
      <button type="button" aria-label={`Article playback speed ${snapshot.rate}×`} onClick={() => command({ action: 'rate', value: PLAYBACK_RATES.find(rate => rate > snapshot.rate) ?? 1 })}>{snapshot.rate}×</button>
      {resume && <button type="button" onClick={() => { command({ action: 'playTrack', track }); command({ action: 'restart' }) }}>Start over</button>}
      <button type="button" className="sm-network-article__queue" aria-label={queued ? 'Queued' : 'Add to queue'} disabled={queued}
        onClick={() => command({ action: 'enqueue', track })}><AudioIcon name={queued ? 'check' : 'queue'} /><span>{queued ? 'Queued' : 'Queue'}</span></button>
      {highlightAvailable && <button type="button" aria-label="Follow along: highlight words" aria-pressed={highlightEnabled} title="Highlight words as you listen"
        onClick={() => setHighlightEnabled(!highlightEnabled)}><AudioIcon name="highlight" /><span>Follow along</span><span className="sm-network-toggle" aria-hidden="true" /></button>}
    </div>
  </div><ListeningLibrary /></>
}

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
  const { snapshot, remote, hosted, notice, command, openNetworkPlayer, highlightAvailable, highlightEnabled, setHighlightEnabled } = useNetworkAudio()
  const [expanded, setExpanded] = useState(false)
  const [height, setHeight] = useState(0)
  const bar = useRef<HTMLElement>(null)
  const detailsId = useId()
  const track = snapshot.queue[snapshot.index]
  const playing = snapshot.status === 'playing' || snapshot.status === 'loading'
  const nextRate = PLAYBACK_RATES.find(rate => rate > snapshot.rate) ?? 1
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
  if (!track || snapshot.hidden) return notice ? <p role="status">{notice}</p> : null
  return <>
    {fixed && <div aria-hidden="true" style={{ height }} />}
    <section ref={bar} className={`sm-network-player ${fixed ? 'sm-network-player--fixed' : ''} ${className}`} style={style} aria-label="Network audio player">
      <div className="sm-network-player__row">
        <button type="button" className="sm-network-player__play" aria-label={playing ? 'Pause playback' : 'Play playback'} onClick={() => command({ action: playing ? 'pause' : 'play' })}>
          <AudioIcon name={playing ? 'pause' : 'play'} />
        </button>
        <div className="sm-network-player__story"><span>{remote ? 'Playing in network window' : networkName}</span>{!hosted && renderArticleLink ? renderArticleLink(track) : <a href={track.articleUrl} target="_blank" rel="noopener noreferrer">{track.title}</a>}<small>{track.publicationName}</small></div>
        <div className="sm-network-player__timeline">
          <input style={{ '--sm-progress': `${snapshot.duration ? Math.min(100, snapshot.position / snapshot.duration * 100) : 0}%` } as CSSProperties} type="range" min="0" max={snapshot.duration || 0} step="0.1" value={Math.min(snapshot.position, snapshot.duration)} disabled={!snapshot.duration} aria-label="Seek article audio" onChange={e => command({ action: 'seek', value: Number(e.target.value) })} />
          <div><span>{formatTime(snapshot.position)}</span><span className="sm-network-player__remaining" aria-label={`${formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)} remaining`}>{formatTime(Math.max(0, snapshot.duration - snapshot.position) / snapshot.rate)}<span className="sm-network-player__remaining-label"> remaining</span></span></div>
        </div>
        <div className="sm-network-player__shortcuts" role="group" aria-label="Playback shortcuts">
          <button type="button" className="sm-network-player__rate" aria-label={`Playback speed ${snapshot.rate}×. ${nextRate > snapshot.rate ? 'Speed up' : 'Reset'} to ${nextRate}×`}
            title={`Playback speed: ${snapshot.rate}×. Click for ${nextRate}×`} onClick={() => command({ action: 'rate', value: nextRate })}>{snapshot.rate}<span>×</span></button>
          <button type="button" className="sm-network-player__highlight" aria-label="Follow along: highlight article words" aria-pressed={highlightAvailable && highlightEnabled}
            disabled={!highlightAvailable} title={highlightAvailable ? 'Highlight words as you listen' : 'Open the playing article to use word highlighting when available'}
            onClick={() => setHighlightEnabled(!highlightEnabled)}><AudioIcon name="highlight" /><span>Follow along</span></button>
          <button type="button" className="sm-network-player__next" aria-label="Next article" title="Next article"
            onClick={() => command({ action: 'skip' })}><AudioIcon name="next" /></button>
          <button type="button" className="sm-network-player__queue" aria-label={expanded ? 'Close queue' : `Queue (${snapshot.queue.length})`}
            aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}><AudioIcon name="queue" /><span className="sm-network-player__queue-label">{expanded ? 'Close queue' : 'Queue'}</span><span className="sm-network-player__count">{snapshot.queue.length}</span><AudioIcon name="chevron" /></button>
        </div>
        <button type="button" className="sm-network-player__close" aria-label="Close player" title="Pause and close player. Your queue is saved."
          onClick={() => { setExpanded(false); command({ action: 'close' }) }}><AudioIcon name="close" /></button>
      </div>
      {(notice || snapshot.error) && <p role="status" className="sm-network-player__notice">{notice ?? snapshot.error}</p>}
      <div id={detailsId} hidden={!expanded} className="sm-network-player__details">
        <div className="sm-network-player__tools">
          <button type="button" onClick={() => command({ action: 'seek', value: snapshot.position - 15 })}>Back 15 seconds</button>
          <button type="button" onClick={() => command({ action: 'seek', value: snapshot.position + 30 })}>Forward 30 seconds</button>
          <label>Speed <span className="sm-network-player__select"><select value={snapshot.rate} onChange={e => command({ action: 'rate', value: Number(e.target.value) })}>{PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select><AudioIcon name="chevron" /></span></label>
          <label><input type="checkbox" checked={snapshot.autoplayNext !== false} onChange={e => command({ action: 'autoplay', value: e.target.checked })} />Play next automatically</label>
          <label>Volume <input type="range" min="0" max="1" step="0.05" value={snapshot.volume} onChange={e => command({ action: 'volume', value: Number(e.target.value) })} /></label>
          {openNetworkPlayer && <button type="button" onClick={openNetworkPlayer}>{remote ? 'Open player window' : 'Listen across sites'}<AudioIcon name="external" /></button>}
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

/** Shared, compact library: available even when the player is hidden or the queue is empty. */
export function ListeningLibrary({ open = false }: { open?: boolean }) {
  const { snapshot, command, catchUp, recommendationsLoading, remote, notice } = useNetworkAudio()
  const [minutes, setMinutes] = useState(10)
  const recent = (snapshot.history ?? []).filter(item => item.completedAt).slice(0, 20)
  return <details className="sm-listening-library" open={open || undefined}>
    <summary>Your listening <span>{snapshot.queue.length ? `${snapshot.queue.length} queued` : recent.length ? 'Recently listened' : 'Queue & catch up'}</span></summary>
    <div className="sm-listening-library__body">
      {catchUp && !remote && <div className="sm-listening-library__catchup">
        <label>Catch me up in <select aria-label="Catch-up length" value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[5, 10, 20].map(value => <option key={value} value={value}>{value} minutes</option>)}</select></label>
        <button type="button" disabled={recommendationsLoading} onClick={() => void catchUp(minutes)}>{recommendationsLoading ? 'Finding stories…' : 'Build my queue'}</button>
        <small>Unheard stories first, timed at {snapshot.rate}×. Your selections stay first.</small>
      </div>}
      <label className="sm-listening-library__option"><input type="checkbox" checked={snapshot.allowRepeats === true} onChange={e => command({ action: 'repeats', value: e.target.checked })} />Include repeats when I’m caught up</label>
      <label className="sm-listening-library__option"><input type="checkbox" checked={snapshot.autoplayNext !== false} onChange={e => command({ action: 'autoplay', value: e.target.checked })} />Play next automatically</label>
      {notice && <p role="status">{notice}</p>}
      {snapshot.queue.length > 0 && <><h3>Up next</h3><p>{snapshot.queue.length} stories · {formatTime(snapshot.queue.reduce((sum, item, index) => sum + Math.max(0, (item.durationSeconds ?? 0) - (index === snapshot.index ? snapshot.position : 0)) / snapshot.rate, 0))} at {snapshot.rate}×</p><ol>{snapshot.queue.map((item, index) => <li key={trackKey(item)}><button type="button" onClick={() => command({ action: 'select', value: index })}>{item.title}</button><button type="button" aria-label={`Remove ${item.title}`} onClick={() => command({ action: 'remove', value: index })}>Remove</button></li>)}</ol><button type="button" onClick={() => command({ action: 'clear' })}>Clear queue</button></>}
      {recent.length > 0 && <><h3>Recently listened</h3><ol>{recent.map(item => <li key={storyKey(item.track)}><span>{item.track.title}</span><button type="button" aria-label={`Replay ${item.track.title}`} onClick={() => command({ action: 'playTrack', track: { ...item.track, automatic: false } })}>Replay</button></li>)}</ol></>}
      {recent.length > 0 && <button type="button" onClick={() => command({ action: 'forgetHistory' })}>Clear listening history</button>}
      {!snapshot.queue.length && !notice && <p>{recent.length ? 'You’re caught up with your queue.' : 'Add a story or build a catch-up queue to start listening.'}</p>}
    </div>
  </details>
}
