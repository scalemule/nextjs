import type { AudioPlayerSource } from '../components/audio-player'

/** Article identity is publication-scoped. Media URLs never enter queue checkpoints/messages. */
export interface NetworkAudioTrack {
  id: string
  publicationId: string
  title: string
  publicationName?: string
  articleUrl: string
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
}

export type ResolveNetworkAudio = (
  track: NetworkAudioTrack,
  signal: AbortSignal,
) => Promise<AudioPlayerSource>

export const EMPTY_SNAPSHOT: NetworkAudioSnapshot = {
  queue: [], index: -1, position: 0, duration: 0, rate: 1, volume: 1,
  status: 'idle', error: null,
}
export const trackKey = (track: NetworkAudioTrack) => JSON.stringify([track.publicationId, track.id])
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
}
/** Copy only the public metadata fields; callers cannot accidentally persist credentials. */
const copyTrack = (t: NetworkAudioTrack): NetworkAudioTrack => ({
  id: t.id, publicationId: t.publicationId, title: t.title,
  ...(t.publicationName ? { publicationName: t.publicationName } : {}), articleUrl: t.articleUrl,
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
    && (s.error === null || (typeof s.error === 'string' && s.error.length <= 1000))
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
        if (this.resumePosition === null) this.patch({ position: audio.currentTime })
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
        if (this.snapshot.index + 1 < this.snapshot.queue.length) this.select(this.snapshot.index + 1)
        else { this.intent = false; this.patch({ status: 'paused', position: this.snapshot.duration }) }
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
    const found = this.snapshot.queue.findIndex(t => trackKey(t) === trackKey(track))
    if (found !== -1) return found
    if (this.snapshot.queue.length >= 100) throw new Error('The listening queue holds up to 100 articles.')
    const queue = [...this.snapshot.queue, copyTrack(track)]
    this.patch({ queue, index: this.snapshot.index === -1 ? 0 : this.snapshot.index })
    return queue.length - 1
  }
  playTrack(track: NetworkAudioTrack) {
    const index = this.enqueue(track)
    if (index === this.snapshot.index) void this.play()
    else this.select(index)
  }
  select(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return
    if (index === this.snapshot.index) { void this.play(); return }
    this.cancel()
    this.source = null
    this.patch({ index, position: 0, duration: 0, error: null, status: 'paused' })
    void this.play()
  }
  remove(index: number) {
    if (!Number.isInteger(index) || index < 0 || index >= this.snapshot.queue.length) return
    const wasPlaying = this.intent
    const current = this.snapshot.index
    const queue = this.snapshot.queue.filter((_, i) => i !== index)
    if (index !== current) {
      this.patch({ queue, index: index < current ? current - 1 : current })
      return
    }
    this.cancel()
    this.source = null
    this.patch({ queue, index: queue.length ? Math.min(index, queue.length - 1) : -1, position: 0, duration: 0, status: 'paused', error: null })
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
    const pendingPosition = this.resumePosition
    this.cancel()
    this.resumePosition = pendingPosition
    this.patch({ status: this.snapshot.queue.length ? 'paused' : 'idle' })
  }
  clear() { this.cancel(); this.source = null; this.audio?.removeAttribute('src'); this.patch({ ...EMPTY_SNAPSHOT, rate: this.snapshot.rate, volume: this.snapshot.volume }) }
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
    this.patch({ rate })
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
      status: snapshot.queue.length ? 'paused' : 'idle', error: null })
    if (this.audio) { this.audio.playbackRate = snapshot.rate; this.audio.volume = snapshot.volume }
  }
  async play() {
    if (!this.audio || !this.snapshot.queue[this.snapshot.index] || this.request) return
    this.intent = true
    this.refreshed = false
    this.patch({ error: null })
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
