import { NetworkAudioController, validSnapshot, validTrack, safeHttpUrl,
  type NetworkAudioSnapshot, type NetworkAudioTrack } from './controller'

export type NetworkAudioCommand =
  | { action: 'play' | 'pause' | 'clear' }
  | { action: 'select' | 'remove' | 'seek' | 'rate' | 'volume'; value: number }
  | { action: 'enqueue' | 'playTrack'; track: NetworkAudioTrack }

export interface NetworkPlayerConnection {
  /** Fully qualified, dedicated player route; never the article route. */
  playerUrl: string
  /** Same namespace on all participating publications. */
  networkId: string
}
export interface NetworkPlayerHostOptions {
  networkId: string
  /** Exact trusted reader origins; never '*'. Also bounds incoming article URLs. */
  allowedOrigins: readonly string[]
}
const PROTOCOL = 'scalemule:network-audio:v1'

export function runCommand(controller: NetworkAudioController, command: unknown): boolean {
  if (!command || typeof command !== 'object') return false
  const c = command as NetworkAudioCommand
  switch (c.action) {
    case 'play': void controller.play(); return true
    case 'pause': controller.pause(); return true
    case 'clear': controller.clear(); return true
    case 'enqueue': case 'playTrack':
      if (!validTrack(c.track)) return false
      controller[c.action](c.track); return true
    case 'select': case 'remove': case 'seek': case 'rate': case 'volume':
      if (!Number.isFinite(c.value)) return false
      if (c.action === 'rate') controller.setRate(c.value)
      else if (c.action === 'volume') controller.setVolume(c.value)
      else controller[c.action](c.value)
      return true
    default: return false
  }
}

/** The host lives in a separate top-level document and keeps its original opener through navigation. */
export function hostNetworkPlayer(controller: NetworkAudioController, options: NetworkPlayerHostOptions) {
  const origins = new Set(options.allowedOrigins.map(value => {
    if (!safeHttpUrl(value) || new URL(value).origin !== value) throw new Error('Use exact HTTP(S) origins for the network player.')
    return value
  }))
  const reader = window.opener as Window | null
  if (!reader) return () => {}
  const trackAllowed = (t: NetworkAudioTrack) => origins.has(new URL(t.articleUrl).origin)
  const send = () => {
    if (reader.closed) return
    const data = { protocol: PROTOCOL, networkId: options.networkId, kind: 'state', snapshot: controller.getSnapshot() }
    // The opener can now be on any allowed publication. Only the matching target receives it.
    origins.forEach(origin => reader.postMessage(data, origin))
  }
  const receive = (event: MessageEvent) => {
    if (event.source !== reader || !origins.has(event.origin)) return
    const data = event.data
    if (!data || data.protocol !== PROTOCOL || data.networkId !== options.networkId) return
    try {
      if (data.kind === 'adopt' && validSnapshot(data.snapshot)
        && data.snapshot.queue.every(trackAllowed) && !controller.getSnapshot().queue.length) {
        controller.restore(data.snapshot)
        if (data.play === true) void controller.play()
      } else if (data.kind === 'command') {
        const command = data.command
        if (command && (command.action === 'enqueue' || command.action === 'playTrack')
          && (!validTrack(command.track) || !trackAllowed(command.track))) return
        runCommand(controller, command)
      }
    } catch {
      // Queue limits and invalid commands never interrupt the host's current recording.
      reader.postMessage({ protocol: PROTOCOL, networkId: options.networkId, kind: 'error',
        error: 'The article could not be added. The queue holds up to 100 articles.' }, event.origin)
    }
    send()
  }
  window.addEventListener('message', receive)
  // A heartbeat reconnects the same reader tab after full/cross-origin navigation.
  const timer = window.setInterval(send, 250)
  send()
  return () => { clearInterval(timer); window.removeEventListener('message', receive) }
}

export class NetworkPlayerClient {
  private target: Window | null = null
  private connected = false
  private pending = false
  private handoffRequested = false
  private openedAt = 0
  private lastSeen = 0
  private latest: NetworkAudioSnapshot | null = null
  private origin: string
  private timer: number

  constructor(private controller: NetworkAudioController, private options: NetworkPlayerConnection,
    private update: (snapshot: NetworkAudioSnapshot | null, notice: string | null) => void) {
    if (!safeHttpUrl(options.playerUrl)) throw new Error('The network player needs a fully qualified HTTP(S) URL.')
    this.origin = new URL(options.playerUrl).origin
    window.addEventListener('message', this.receive)
    this.timer = window.setInterval(() => {
      if (this.pending && Date.now() - this.openedAt > 10000) {
        this.pending = false
        this.update(null, 'The network player did not connect. Playback is still on this page.')
      }
      if (this.connected && this.target?.closed) this.disconnect('The network player closed. Press Play to resume here.')
      else if (this.connected && Date.now() - this.lastSeen > 5000) {
        // Keep ownership remote: background tabs may be throttled, and starting local audio would double-play.
        this.update(this.latest, 'Waiting for the network player. Open its window to check playback.')
      }
    }, 1000)
  }
  private receive = (event: MessageEvent) => {
    if (event.origin !== this.origin || !event.source || (this.target && event.source !== this.target)) return
    const data = event.data
    if (!data || data.protocol !== PROTOCOL || data.networkId !== this.options.networkId) return
    if (data.kind === 'error' && this.connected) {
      this.update(this.latest, 'The article could not be added. The queue holds up to 100 articles.')
      return
    }
    if (data.kind !== 'state' || !validSnapshot(data.snapshot)) return
    this.target = event.source as Window
    this.lastSeen = Date.now()
    if (!this.connected) {
      const local = this.controller.getSnapshot()
      // A slow host may become ready after the initial connection notice.
      // Preserve the reader's queue even when that ten-second notice has fired.
      const handoff = this.handoffRequested && !data.snapshot.queue.length && local.queue.length > 0
      this.controller.pause()
      this.connected = true
      this.pending = false
      this.handoffRequested = false
      if (handoff) this.post({ kind: 'adopt', snapshot: local, play: local.status === 'playing' || local.status === 'loading' })
    }
    this.latest = data.snapshot
    this.update(data.snapshot, null)
  }
  private post(data: object) {
    this.target?.postMessage({ protocol: PROTOCOL, networkId: this.options.networkId, ...data }, this.origin)
  }
  open() {
    if (this.target && !this.target.closed) { this.target.focus(); return }
    // Must run synchronously from a user click. Reopening an existing URL would reload and interrupt audio.
    this.target = window.open(this.options.playerUrl, '_blank', 'popup,width=520,height=720')
    if (!this.target || this.target.closed) {
      this.target = null
      this.update(null, 'Allow the network player window to open, then try again. Playback is still on this page.')
      return
    }
    this.pending = true
    this.handoffRequested = true
    this.openedAt = Date.now()
  }
  command(command: NetworkAudioCommand) {
    if (this.connected && this.target?.closed) this.disconnect('The network player closed. Press Play to resume here.')
    if (!this.connected || !this.target || this.target.closed) return false
    this.post({ kind: 'command', command })
    return true
  }
  private disconnect(notice: string) {
    if (this.latest) this.controller.restore(this.latest)
    this.connected = false
    this.handoffRequested = false
    this.target = null
    this.latest = null
    this.update(null, notice)
  }
  dispose() { clearInterval(this.timer); window.removeEventListener('message', this.receive) }
}
