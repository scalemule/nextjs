/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NetworkAudioController, validSnapshot, type NetworkAudioTrack, type ResolveNetworkAudio } from './controller'

const first: NetworkAudioTrack = { id: 'story-a', publicationId: 'walnut-creek', title: 'City council report', articleUrl: 'https://walnutcreektimes.com/news/council' }
const second: NetworkAudioTrack = { ...first, publicationId: 'lamorinda', articleUrl: 'https://lamorindapost.com/news/council' }
const source = { url: 'https://media.example/article.mp3', duration_ms: 60000 }
let audio: HTMLAudioElement
let controller: NetworkAudioController
let resolve: ReturnType<typeof vi.fn<ResolveNetworkAudio>>
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
function metadata(duration = 60) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration })
  Object.defineProperty(audio, 'readyState', { configurable: true, value: 1 })
  audio.dispatchEvent(new Event('loadedmetadata'))
}
beforeEach(() => {
  audio = document.createElement('audio')
  vi.spyOn(audio, 'play').mockImplementation(async () => { audio.dispatchEvent(new Event('playing')) })
  vi.spyOn(audio, 'pause').mockImplementation(() => { audio.dispatchEvent(new Event('pause')) })
  resolve = vi.fn().mockResolvedValue(source)
  controller = new NetworkAudioController(resolve)
  controller.attach(audio)
})
afterEach(() => { controller.detach(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('persistent audio ownership', () => {
  it('queues without loading, deduplicates by publication and article, and advances on ended', async () => {
    controller.enqueue(first); controller.enqueue(first); controller.enqueue(second)
    expect(resolve).not.toHaveBeenCalled()
    expect(controller.getSnapshot().queue).toHaveLength(2)
    await controller.play()
    metadata()
    expect(controller.getSnapshot().status).toBe('playing')
    audio.currentTime = 13
    audio.dispatchEvent(new Event('timeupdate'))
    controller.enqueue({ ...first, id: 'third' })
    expect(audio.currentTime).toBe(13)
    expect(resolve).toHaveBeenCalledTimes(1)
    audio.dispatchEvent(new Event('ended'))
    await flush()
    expect(controller.getSnapshot().index).toBe(1)
    expect(resolve.mock.calls[1][0].publicationId).toBe('lamorinda')
  })
  it('ignores stale resolution after selecting another publication', async () => {
    let complete!: (value: typeof source) => void
    resolve.mockImplementationOnce(() => new Promise(r => { complete = r }))
    controller.enqueue(first); controller.enqueue(second)
    const old = controller.play()
    const signal = resolve.mock.calls[0][1] as AbortSignal
    controller.select(1)
    await flush()
    expect(signal.aborted).toBe(true)
    complete({ ...source, url: 'https://media.example/stale.mp3' })
    await old
    expect(audio.src).toBe(source.url)
    expect(controller.getSnapshot().index).toBe(1)
  })
  it('pause during resolution cannot be undone by a late response', async () => {
    let complete!: (value: typeof source) => void
    resolve.mockImplementationOnce(() => new Promise(r => { complete = r }))
    controller.enqueue(first)
    const play = controller.play()
    controller.pause()
    complete(source)
    await play
    expect(audio.play).not.toHaveBeenCalled()
    expect(controller.getSnapshot().status).toBe('paused')
  })
  it('keeps current audio when removing preceding or following entries', async () => {
    controller.enqueue(first); controller.enqueue(second); controller.select(1)
    await flush(); metadata()
    audio.currentTime = 17
    audio.dispatchEvent(new Event('timeupdate'))
    controller.remove(0)
    expect(controller.getSnapshot().index).toBe(0)
    expect(controller.getSnapshot().position).toBe(17)
    expect(resolve).toHaveBeenCalledTimes(1)
  })
  it('restores paused, strips unexpected fields, and seeks after metadata', async () => {
    controller.enqueue({ ...first, secret: 'do-not-copy' } as NetworkAudioTrack)
    const saved = { ...controller.getSnapshot(), position: 25, rate: 1.5, volume: 0.4 }
    controller.restore(saved)
    expect(audio.play).not.toHaveBeenCalled()
    expect(JSON.stringify(controller.getSnapshot())).not.toContain('secret')
    await controller.play(); metadata()
    expect(audio.currentTime).toBe(25)
    expect(audio.playbackRate).toBe(1.5)
    expect(audio.volume).toBe(0.4)
  })
  it('refreshes expired media and preserves elapsed time', async () => {
    resolve.mockResolvedValueOnce({ ...source, expires_at: new Date(Date.now() - 1000).toISOString() })
    controller.enqueue(first); await controller.play(); metadata()
    audio.currentTime = 23; audio.dispatchEvent(new Event('timeupdate')); controller.pause()
    await controller.play(); metadata()
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(audio.currentTime).toBe(23)
  })
  it('does not refetch on an autoplay denial', async () => {
    vi.mocked(audio.play).mockRejectedValue(Object.assign(new Error('gesture needed'), { name: 'NotAllowedError' }))
    controller.enqueue(first); await controller.play()
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().error).toContain('Press Play')
  })
  it('bounds media recovery to one retry', async () => {
    vi.mocked(audio.play).mockRejectedValue(new Error('media failed'))
    controller.enqueue(first); await controller.play()
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(controller.getSnapshot().status).toBe('error')
  })
  it('times out an unresponsive resolver without leaving a loading state', async () => {
    vi.useFakeTimers()
    resolve.mockImplementation(() => new Promise(() => {}))
    controller.enqueue(first)
    const pending = controller.play()
    await vi.advanceTimersByTimeAsync(15001)
    await pending
    expect(controller.getSnapshot().status).toBe('error')
    expect((resolve.mock.calls[0][1] as AbortSignal).aborted).toBe(true)
  })
  it('rejects unsafe URLs and unbounded queues or invalid numeric state', () => {
    expect(() => controller.enqueue({ ...first, articleUrl: 'javascript:alert(1)' })).toThrow()
    controller.enqueue(first)
    expect(validSnapshot({ ...controller.getSnapshot(), rate: NaN })).toBe(false)
    for (let i = 1; i < 100; i++) controller.enqueue({ ...first, id: `article-${i}` })
    expect(() => controller.enqueue(second)).toThrow('100')
  })
  it('respects the existing SDK exclusive-playback event', async () => {
    controller.enqueue(first); await controller.play()
    document.dispatchEvent(new CustomEvent('scalemule:audio:play', { detail: document.createElement('audio') }))
    expect(controller.getSnapshot().status).toBe('paused')
  })
})
