/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EMPTY_SNAPSHOT, NetworkAudioController, type NetworkAudioSnapshot, type NetworkAudioTrack } from './controller'
import { hostNetworkPlayer, NetworkPlayerClient } from './bridge'

const origin = 'https://bayareachronicle.com'
const readerOrigin = 'https://walnutcreektimes.com'
const protocol = 'scalemule:network-audio:v1'
const track: NetworkAudioTrack = { id: 'article-a', publicationId: 'publication-a', title: 'A local story', articleUrl: `${readerOrigin}/news/a` }
const state: NetworkAudioSnapshot = { ...EMPTY_SNAPSHOT, queue: [track], index: 0, position: 27, duration: 100, status: 'playing' }
let controller: NetworkAudioController
let dispose = () => {}
beforeEach(() => { vi.useFakeTimers(); controller = new NetworkAudioController(async () => ({ url: 'https://media.example/a.mp3' })) })
afterEach(() => { dispose(); vi.restoreAllMocks(); vi.useRealTimers(); Object.defineProperty(window, 'opener', { configurable: true, value: null }) })
function message(source: Window, from: string, data: object) {
  window.dispatchEvent(new MessageEvent('message', { source, origin: from, data: { protocol, networkId: 'bay-area', ...data } }))
}
it('hands off only after a trusted host replies, then uses the remote controls', () => {
  const target = { postMessage: vi.fn(), focus: vi.fn(), closed: false } as unknown as Window
  vi.spyOn(window, 'open').mockReturnValue(target)
  controller.restore(state)
  const update = vi.fn()
  const client = new NetworkPlayerClient(controller, { networkId: 'bay-area', playerUrl: `${origin}/listen` }, update)
  dispose = () => client.dispose()
  const pause = vi.spyOn(controller, 'pause')
  client.open()
  expect(pause).not.toHaveBeenCalled()
  message(target, 'https://untrusted.example', { kind: 'state', snapshot: state })
  expect(update).not.toHaveBeenCalled()
  message(target, origin, { kind: 'state', snapshot: EMPTY_SNAPSHOT })
  expect(pause).toHaveBeenCalledOnce()
  expect(target.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'adopt', snapshot: expect.objectContaining({ position: 27 }) }), origin)
  client.command({ action: 'seek', value: 34 })
  expect(target.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'command', command: { action: 'seek', value: 34 } }), origin)
  client.open()
  expect(window.open).toHaveBeenCalledOnce()
  expect(target.focus).toHaveBeenCalledOnce()
})
it('reconnects a newly mounted reader, rejects a different source, and restores paused after close', async () => {
  const target = { postMessage: vi.fn(), closed: false } as unknown as Window
  const update = vi.fn()
  const client = new NetworkPlayerClient(controller, { networkId: 'bay-area', playerUrl: `${origin}/listen` }, update)
  dispose = () => client.dispose()
  message(target, origin, { kind: 'state', snapshot: state })
  expect(update).toHaveBeenLastCalledWith(state, null)
  message({} as Window, origin, { kind: 'state', snapshot: EMPTY_SNAPSHOT })
  expect(update).toHaveBeenCalledOnce()
  Object.defineProperty(target, 'closed', { value: true })
  await vi.advanceTimersByTimeAsync(1001)
  expect(controller.getSnapshot()).toMatchObject({ position: 27, status: 'paused' })
  expect(update).toHaveBeenLastCalledWith(null, expect.stringContaining('closed'))
})
it('keeps playback local when blocked, and does not auto-resume during heartbeat delays', async () => {
  vi.spyOn(window, 'open').mockReturnValue(null)
  const update = vi.fn()
  const client = new NetworkPlayerClient(controller, { networkId: 'bay-area', playerUrl: `${origin}/listen` }, update)
  dispose = () => client.dispose()
  client.open()
  expect(update).toHaveBeenLastCalledWith(null, expect.stringContaining('Allow'))
  const target = { closed: false, postMessage: vi.fn() } as unknown as Window
  message(target, origin, { kind: 'state', snapshot: state })
  const play = vi.spyOn(controller, 'play')
  await vi.advanceTimersByTimeAsync(6000)
  expect(play).not.toHaveBeenCalled()
  expect(update).toHaveBeenLastCalledWith(state, expect.stringContaining('Waiting'))
})
it('host checks exact reader source, origin, schema, and article origin before commands', () => {
  const reader = { postMessage: vi.fn(), closed: false } as unknown as Window
  Object.defineProperty(window, 'opener', { configurable: true, value: reader })
  dispose = hostNetworkPlayer(controller, { networkId: 'bay-area', allowedOrigins: [readerOrigin, 'https://lamorindapost.com'] })
  const enqueue = { kind: 'command', command: { action: 'enqueue', track } }
  message(reader, 'https://walnutcreektimes.com.attacker.example', enqueue)
  message({} as Window, readerOrigin, enqueue)
  message(reader, readerOrigin, { kind: 'command', command: { action: 'enqueue', track: { ...track, articleUrl: 'https://untrusted.example/article' } } })
  expect(controller.getSnapshot().queue).toHaveLength(0)
  message(reader, readerOrigin, enqueue)
  expect(controller.getSnapshot().queue).toHaveLength(1)
  message(reader, 'https://lamorindapost.com', { kind: 'command', command: { action: 'rate', value: 1.5 } })
  expect(controller.getSnapshot().rate).toBe(1.5)
  expect(reader.postMessage).toHaveBeenCalledWith(expect.objectContaining({ kind: 'state' }), 'https://lamorindapost.com')
})
