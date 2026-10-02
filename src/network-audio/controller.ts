import type { AudioPlayerSource } from '../components/audio-player'

/** Article identity is publication-scoped. Media URLs never enter queue checkpoints/messages. */
export interface NetworkAudioTrack {
  id: string
  publicationId: string
  title: string
  publicationName?: string
  articleUrl: string
  /** Stable canonical story URL/ID shared by syndicated editions. */
  storyId?: string
  /** An editorial revision, never a routine database updated_at value. */
  revision?: string
  durationSeconds?: number
  section?: string
  publishedAt?: string
  automatic?: boolean
}

export interface ListeningRecord {
  track: NetworkAudioTrack
  position: number
  duration: number
  ranges: [number, number][]
  updatedAt: number
  completedAt?: number
  skippedAt?: number
}
export interface NetworkAudioSnapshot {
  queue: readonly NetworkAudioTrack[]
  index: number
  position: number
  duration: number
  rate: number
  volume: number
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'error'
  error: string | null
  history?: readonly ListeningRecord[]
  autoplayNext?: boolean
  allowRepeats?: boolean
  hidden?: boolean
  historyClearedAt?: number
  settingsUpdatedAt?: number
  sessionMinutes?: number
}

export type ResolveNetworkAudio = (
  track: NetworkAudioTrack,
  signal: AbortSignal,
) => Promise<AudioPlayerSource>

export const EMPTY_SNAPSHOT: NetworkAudioSnapshot = {
  queue: [], index: -1, position: 0, duration: 0, rate: 1, volume: 1,
  status: 'idle', error: null, history: [], autoplayNext: true, allowRepeats: false, hidden: false, sessionMinutes: 0,
}
export const trackKey = (track: NetworkAudioTrack) => JSON.stringify([track.publicationId, track.id])
export const storyKey = (track: NetworkAudioTrack) => JSON.stringify([track.storyId ?? trackKey(track), track.revision ?? ''])
export const listeningRecord = (snapshot: NetworkAudioSnapshot, track: NetworkAudioTrack) => snapshot.history?.find(item => storyKey(item.track) === storyKey(track))
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
export function safeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch { return false }
}
export function validTrack(value: unknown): value is NetworkAudioTrack {
  if (!value || typeof value !== 'object') return false
  const t = value as NetworkAudioTrack
  return [t.id, t.publicationId, t.title].every(v => typeof v === 'string' && v.length > 0 && v.length <= 1000)
    && (t.publicationName === undefined || (typeof t.publicationName === 'string' && t.publicationName.length <= 1000))
    && safeHttpUrl(t.articleUrl)
    && [t.storyId, t.revision, t.section, t.publishedAt].every(v => v === undefined || (typeof v === 'string' && v.length <= 4096))
    && (t.durationSeconds === undefined || (finite(t.durationSeconds) && t.durationSeconds > 0 && t.durationSeconds <= 86400))
    && (t.automatic === undefined || typeof t.automatic === 'boolean')
}
/** Copy only the public metadata fields; callers cannot accidentally persist credentials. */
export const copyTrack = (t: NetworkAudioTrack): NetworkAudioTrack => ({
  id: t.id, publicationId: t.publicationId, title: t.title,
  ...(t.publicationName ? { publicationName: t.publicationName } : {}), articleUrl: t.articleUrl,
  ...(t.storyId ? { storyId: t.storyId } : {}), ...(t.revision ? { revision: t.revision } : {}),
  ...(t.durationSeconds ? { durationSeconds: t.durationSeconds } : {}), ...(t.section ? { section: t.section } : {}),
  ...(t.publishedAt ? { publishedAt: t.publishedAt } : {}), ...(t.automatic ? { automatic: true } : {}),
})
export function validSnapshot(value: unknown): value is NetworkAudioSnapshot {
  if (!value || typeof value !== 'object') return false
  const s = value as NetworkAudioSnapshot
  return Array.isArray(s.queue) && s.queue.length <= 100 && s.queue.every(validTrack)
    && new Set(s.queue.map(trackKey)).size === s.queue.length
    && Number.isInteger(s.index) && (s.queue.length ? s.index >= 0 && s.index < s.queue.length : s.index === -1)
    && finite(s.position) && s.position >= 0 && finite(s.duration) && s.duration >= 0
    && finite(s.rate) && s.rate >= 0.5 && s.rate <= 3
    && finite(s.volume) && s.volume >= 0 && s.volume <= 1
    && ['idle', 'loading', 'playing', 'paused', 'error'].includes(s.status)
    && (s.history === undefined || (Array.isArray(s.history) && s.history.length <= 500 && s.history.every(validRecord)))
    && [s.autoplayNext, s.allowRepeats, s.hidden].every(v => v === undefined || typeof v === 'boolean')
    && (s.historyClearedAt === undefined || (finite(s.historyClearedAt) && s.historyClearedAt >= 0 && s.historyClearedAt <= Date.now() + 60000))
    && (s.settingsUpdatedAt === undefined || (finite(s.settingsUpdatedAt) && s.settingsUpdatedAt >= 0 && s.settingsUpdatedAt <= Date.now() + 60000))
    && (s.sessionMinutes === undefined || [0, 5, 10, 20].includes(s.sessionMinutes))
    && (s.error === null || (typeof s.error === 'string' && s.error.length <= 1000))
}

export function validRecord(value: unknown): value is ListeningRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as ListeningRecord
  return validTrack(r.track) && finite(r.position) && r.position >= 0 && finite(r.duration) && r.duration >= 0
    && finite(r.updatedAt) && r.updatedAt >= 0 && r.updatedAt <= Date.now() + 60000 && [r.completedAt, r.skippedAt].every(v => v === undefined || (finite(v) && v > 0))
    && Array.isArray(r.ranges) && r.ranges.length <= 100 && r.ranges.every(v => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]) && v[0] >= 0 && v[1] >= v[0] && v[1] <= r.duration + 1)
}
function mergeRanges(ranges: [number, number][]): [number, number][] {
  const merged: [number, number][] = []
  for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && start <= last[1] + 0.1) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  // Keep bounded, actual coverage only; never fill gaps to claim completion.
  return merged.slice(-100)
}

/** One audio element per persistent layout. Safe to construct during SSR; attach on mount. */
export class NetworkAudioController {
  private snapshot: NetworkAudioSnapshot = EMPTY_SNAPSHOT
  private listeners = new Set<() => void>()
  private audio: HTMLAudioElement | null = null
  private cleanup: (() => void) | null = null
  private request: AbortController | null = null
  private generation = 0
  private intent = false
  private source: AudioPlayerSource | null = null
  private refreshed = false
  private resumePosition: number | null = null

  mergeListeningMemory(memory: { rate: number; autoplayNext: boolean; allowRepeats: boolean; settingsUpdatedAt: number; historyClearedAt: number; history: ListeningRecord[] }) {
    this.patch({ rate: memory.rate, autoplayNext: memory.autoplayNext, allowRepeats: memory.allowRepeats, settingsUpdatedAt: memory.settingsUpdatedAt, historyClearedAt: memory.historyClearedAt, history: memory.history })
    if (this.audio) this.audio.playbackRate = memory.rate
  }
  private candidates: NetworkAudioTrack[] = []

  constructor(private resolve: ResolveNetworkAudio) {}
  setResolver(resolve: ResolveNetworkAudio) { this.resolve = resolve }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private patch(patch: Partial<NetworkAudioSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach(listener => listener())
  }
  attach(audio: HTMLAudioElement) {
    this.detach()
    this.audio = audio
    audio.preload = 'metadata'
    audio.playbackRate = this.snapshot.rate
    audio.volume = this.snapshot.volume
    const on = (name: string, fn: () => void) => {
      audio.addEventListener(name, fn)
      return () => audio.removeEventListener(name, fn)
    }
    const off = [
      on('loadedmetadata', () => {
        const duration = finite(audio.duration) && audio.duration > 0 ? audio.duration : this.snapshot.duration
        if (this.resumePosition !== null) {
          audio.currentTime = duration > 0 ? Math.min(this.resumePosition, duration) : this.resumePosition
          this.resumePosition = null
        }
        audio.playbackRate = this.snapshot.rate
        this.patch({ duration, position: audio.currentTime })
      }),
      on('durationchange', () => {
        if (finite(audio.duration) && audio.duration > 0) this.patch({ duration: audio.duration })
      }),
      on('timeupdate', () => {
        if (this.resumePosition === null) { this.patch({ position: audio.currentTime }); this.remember() }
      }),
      on('playing', () => {
        if (!this.intent) { audio.pause(); return }
        this.patch({ status: 'playing', error: null })
        document.dispatchEvent(new CustomEvent('scalemule:audio:play', { detail: audio }))
      }),
      on('pause', () => {
        if (this.snapshot.status === 'playing') this.patch({ status: 'paused' })
      }),
      on('ended', () => {
        if (!this.intent) return
        this.finish()
      }),
      on('error', () => {
        if (this.intent && !this.request) void this.recover()
      }),
    ]
    const exclusive = (event: Event) => {
      if ((event as CustomEvent).detail !== audio) this.pause()
    }
    document.addEventListener('scalemule:audio:play', exclusive)
    this.cleanup = () => { off.forEach(fn => fn()); document.removeEventListener('scalemule:audio:play', exclusive) }
  }
  detach() {
    this.generation++
    this.intent = false
    this.request?.abort()
    this.request = null
    this.cleanup?.()
    this.cleanup = null
    this.audio?.pause()
    this.audio?.removeAttribute('src')
    this.audio = null
    this.source = null
  }
  enqueue(track: NetworkAudioTrack) {
    if (!validTrack(track)) throw new Error('A valid publication, article identity, title and HTTP(S) article URL are required.')
    this.patch({ hidden: false })
    const found = this.snapshot.queue.findIndex(t => storyKey(t) === storyKey(track))
    if (found !== -1) return found
    if (this.snapshot.queue.length >= 100) throw new Error('The listening queue holds up to 100 articles.')
    const queue = [...this.snapshot.queue]
    const automatic = queue.findIndex((item, i) => item.automatic && i > this.snapshot.index)
    const at = !track.automatic && automatic >= 0 ? automatic : queue.length
    queue.splice(at, 0, copyTrack(track))
    const initial = this.snapshot.index === -1
    const record = listeningRecord(this.snapshot, track)
    this.patch({ queue, index: initial ? 0 : this.snapshot.index,
      ...(initial ? { position: record?.completedAt ? 0 : record?.position ?? 0, duration: record?.duration ?? track.durationSeconds ?? 0 } : {}) })
    return at
  }
  playTrack(track: NetworkAudioTrack) {
    const index = this.enqueue(track)
    if (index === this.snapshot.index) void this.play()
    else this.select(index)
  }
  select(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return
    if (index === this.snapshot.index) { void this.play(); return }
    this.remember()
    this.cancel()
    this.source = null
    const record = listeningRecord(this.snapshot, this.snapshot.queue[index])
    this.patch({ index, position: record?.completedAt ? 0 : record?.position ?? 0, duration: record?.duration ?? 0, error: null, status: 'paused', hidden: false })
    void this.play()
  }
  remove(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return
    this.remember()
    const wasPlaying = this.intent
    const current = this.snapshot.index
    const queue = this.snapshot.queue.filter((_, i) => i !== index)
    if (index !== current) {
      this.patch({ queue, index: index < current ? current - 1 : current })
      return
    }
    this.cancel()
    this.source = null
    const nextIndex = queue.length ? Math.min(index, queue.length - 1) : -1
    const nextRecord = nextIndex >= 0 ? listeningRecord(this.snapshot, queue[nextIndex]) : undefined
    this.patch({ queue, index: nextIndex, position: nextRecord?.completedAt ? 0 : nextRecord?.position ?? 0, duration: nextRecord?.duration ?? 0, status: 'paused', error: null })
    if (wasPlaying && queue.length) void this.play()
  }
  private cancel() {
    this.intent = false
    this.generation++
    this.request?.abort()
    this.request = null
    this.resumePosition = null
    this.audio?.pause()
  }
  pause() {
    this.remember()
    const pendingPosition = this.resumePosition
    this.cancel()
    this.resumePosition = pendingPosition
    this.patch({ status: this.snapshot.queue.length ? 'paused' : 'idle' })
  }
  clear() { this.remember(); this.cancel(); this.source = null; this.audio?.removeAttribute('src'); this.patch({ ...this.snapshot, queue: [], index: -1, position: 0, duration: 0, status: 'idle', error: null, hidden: false }) }
  close() { this.pause(); this.patch({ hidden: true }) }
  setAutoplay(value: boolean) { this.patch({ autoplayNext: value, settingsUpdatedAt: Date.now() }) }
  setRepeats(value: boolean) { this.patch({ allowRepeats: value, settingsUpdatedAt: Date.now() }) }
  forgetHistory() { this.patch({ history: [], historyClearedAt: Date.now() }) }
  restart() { this.seek(0); void this.play() }
  skip() {
    this.remember({ skippedAt: Date.now() })
    this.remove(this.snapshot.index)
  }
  private remember(extra: Partial<ListeningRecord> = {}) {
    const track = this.snapshot.queue[this.snapshot.index]
    if (!track || !this.snapshot.duration) return
    const previous = listeningRecord(this.snapshot, track)
    const ranges: [number, number][] = [...(previous?.ranges ?? [])]
    if (this.source && this.audio) for (let i = 0; i < this.audio.played.length; i++) ranges.push([this.audio.played.start(i), Math.min(this.snapshot.duration, this.audio.played.end(i))])
    const record: ListeningRecord = { ...previous, track: copyTrack(track), position: this.snapshot.position,
      duration: this.snapshot.duration, ranges: mergeRanges(ranges), updatedAt: Date.now(), ...extra }
    this.patch({ history: [record, ...(this.snapshot.history ?? []).filter(item => storyKey(item.track) !== storyKey(track))].slice(0, 500) })
  }
  private finish() {
    this.remember()
    const track = this.snapshot.queue[this.snapshot.index]
    const record = track && listeningRecord(this.snapshot, track)
    const coverage = record?.ranges.reduce((sum, [start, end]) => sum + end - start, 0) ?? 0
    if (this.snapshot.duration > 0 && coverage >= this.snapshot.duration * 0.9) this.remember({ completedAt: Date.now(), position: this.snapshot.duration })
    else { this.patch({ position: 0 }); this.remember({ skippedAt: Date.now(), position: 0 }) }
    const autoplay = this.snapshot.autoplayNext !== false
    this.intent = false
    this.remove(this.snapshot.index)
    if (autoplay && this.snapshot.queue.length) void this.play()
  }
  setRecommendations(tracks: NetworkAudioTrack[]) {
    this.candidates = tracks.filter(validTrack).slice(0, 100)
  }
  /** Manual selections retain their order; recommendations are bounded and never replace them. */
  catchUp(minutes = 10) {
    if (![5, 10, 20].includes(minutes)) return
    const active = this.snapshot.queue[this.snapshot.index]
    const manual = this.snapshot.queue.filter(item => !item.automatic || item === active)
    const queueKeys = new Set(manual.map(storyKey))
    const eligible = this.candidates.filter(item => !queueKeys.has(storyKey(item)))
    const unheard = eligible.filter(item => {
      const record = listeningRecord(this.snapshot, item)
      return !record?.completedAt && (!record?.skippedAt || Date.now() - record.skippedAt > 86400000)
    })
    const pool = unheard.length || !this.snapshot.allowRepeats ? unheard : eligible.filter(item => !listeningRecord(this.snapshot, item)?.skippedAt || Date.now() - listeningRecord(this.snapshot, item)!.skippedAt! > 86400000)
    let budget = minutes * 60 - manual.reduce((sum, item) => sum + Math.max(0, (item.durationSeconds ?? 0) - (item === active ? this.snapshot.position : 0)) / this.snapshot.rate, 0)
    const added: NetworkAudioTrack[] = []
    let lastSection = active?.section
    const remaining = [...pool]
    while (remaining.length && added.length + manual.length < 100) {
      let at = remaining.findIndex(item => item.section !== lastSection && (item.durationSeconds ?? Infinity) / this.snapshot.rate <= budget)
      if (at < 0) at = remaining.findIndex(item => (item.durationSeconds ?? Infinity) / this.snapshot.rate <= budget)
      if (at < 0) break
      const [item] = remaining.splice(at, 1)
      if (queueKeys.has(storyKey(item))) continue
      queueKeys.add(storyKey(item)); added.push({ ...copyTrack(item), automatic: true })
      budget -= item.durationSeconds! / this.snapshot.rate; lastSection = item.section
    }
    const queue = [...manual, ...added]
    const firstRecord = !active && queue[0] ? listeningRecord(this.snapshot, queue[0]) : undefined
    this.patch({ queue, index: active ? queue.findIndex(item => trackKey(item) === trackKey(active)) : queue.length ? 0 : -1, hidden: false, sessionMinutes: minutes, ...(!active ? { position: firstRecord?.completedAt ? 0 : firstRecord?.position ?? 0, duration: firstRecord?.duration ?? queue[0]?.durationSeconds ?? 0 } : {}) })
  }
  seek(position: number) {
    if (!finite(position)) return
    const value = Math.max(0, this.snapshot.duration ? Math.min(position, this.snapshot.duration) : position)
    if (this.audio?.readyState && this.source) this.audio.currentTime = value
    else this.resumePosition = value
    this.patch({ position: value })
  }
  setRate(rate: number) {
    if (!finite(rate) || rate < 0.5 || rate > 3) return
    if (this.audio) this.audio.playbackRate = rate
    this.patch({ rate, settingsUpdatedAt: Date.now() })
  }
  setVolume(volume: number) {
    if (!finite(volume) || volume < 0 || volume > 1) return
    if (this.audio) this.audio.volume = volume
    this.patch({ volume })
  }
  restore(snapshot: NetworkAudioSnapshot) {
    if (!validSnapshot(snapshot)) return
    this.cancel()
    this.source = null
    this.patch({ queue: snapshot.queue.map(copyTrack), index: snapshot.index, position: snapshot.position,
      duration: snapshot.duration, rate: snapshot.rate, volume: snapshot.volume,
      status: snapshot.queue.length ? 'paused' : 'idle', error: null,
      history: (snapshot.history ?? []).map(item => ({ track: copyTrack(item.track), position: item.position, duration: item.duration,
        ranges: item.ranges.map(range => [...range] as [number, number]), updatedAt: item.updatedAt,
        ...(item.completedAt ? { completedAt: item.completedAt } : {}), ...(item.skippedAt ? { skippedAt: item.skippedAt } : {}) })),
      autoplayNext: snapshot.autoplayNext !== false, allowRepeats: snapshot.allowRepeats === true, hidden: snapshot.hidden === true,
      historyClearedAt: snapshot.historyClearedAt ?? 0, settingsUpdatedAt: snapshot.settingsUpdatedAt ?? 0, sessionMinutes: snapshot.sessionMinutes ?? 0 })
    if (this.audio) { this.audio.playbackRate = snapshot.rate; this.audio.volume = snapshot.volume }
  }
  async play() {
    if (!this.audio || !this.snapshot.queue[this.snapshot.index] || this.request) return
    this.intent = true
    this.refreshed = false
    this.patch({ error: null, hidden: false })
    const expires = this.source?.expires_at ? Date.parse(this.source.expires_at) : Infinity
    if (!this.source || expires <= Date.now() + 30000) await this.load()
    else {
      if (this.snapshot.duration && this.snapshot.position >= this.snapshot.duration) this.seek(0)
      await this.start(this.generation)
    }
  }
  private async load() {
    const track = this.snapshot.queue[this.snapshot.index]
    if (!track || !this.audio) return
    const generation = ++this.generation
    const request = new AbortController()
    this.request?.abort()
    this.request = request
    this.patch({ status: 'loading', error: null })
    // Bound resolver work even if a host accidentally ignores its signal.
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      const source = await Promise.race([
        this.resolve(track, request.signal),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => { request.abort(); reject(new Error('Audio request timed out')) }, 15000) }),
      ])
      if (generation !== this.generation || request.signal.aborted || !this.audio) return
      if (!safeHttpUrl(source.url)) throw new Error('No playable audio source')
      this.source = source
      this.resumePosition = this.snapshot.position
      this.audio.src = source.url
      this.audio.playbackRate = this.snapshot.rate
      this.audio.volume = this.snapshot.volume
      this.patch({ duration: source.duration_ms && source.duration_ms > 0 ? source.duration_ms / 1000 : 0 })
      this.request = null
      await this.start(generation)
    } catch {
      if (generation === this.generation) this.fail('This article could not be loaded. Try playing it again or choose another article.')
    } finally {
      clearTimeout(timeout)
      if (this.request === request) this.request = null
    }
  }
  private async start(generation: number) {
    if (!this.intent || !this.audio) return
    try { await this.audio.play() }
    catch (error) {
      if (generation !== this.generation || !this.intent) return
      if ((error as { name?: string }).name === 'NotAllowedError') this.fail('Press Play here to continue listening.')
      else await this.recover()
    }
  }
  private async recover() {
    if (this.refreshed) { this.fail('Audio playback stopped. Try playing again or choose another article.'); return }
    this.refreshed = true
    await this.load()
  }
  private fail(error: string) {
    this.intent = false
    this.audio?.pause()
    this.patch({ status: 'error', error })
  }
}
