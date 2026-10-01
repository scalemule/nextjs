/** @vitest-environment jsdom */
import React, { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ArticleAudioControls, NetworkAudioPlayer, NetworkAudioProvider } from './network-audio-player'
import type { NetworkAudioTrack } from '../network-audio/controller'
import { renderToString } from 'react-dom/server'

const track: NetworkAudioTrack = { id: 'a', publicationId: 'news', title: 'Новости · 社区消息 🎧', publicationName: 'Local news', articleUrl: 'https://news.example/news/a' }
const next: NetworkAudioTrack = { ...track, id: 'b', title: 'Another article', articleUrl: 'https://news.example/news/b' }
const resolveAudio = vi.fn(async () => ({ url: 'https://media.example/audio.mp3', duration_ms: 90000 }))
let media: HTMLAudioElement
let originalRects: typeof Range.prototype.getClientRects
beforeEach(() => {
  resolveAudio.mockClear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLAudioElement) {
    media = this
    Object.defineProperty(this, 'duration', { configurable: true, value: 90 })
    fireEvent.loadedMetadata(this)
    fireEvent.playing(this)
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLAudioElement) { fireEvent.pause(this) })
  originalRects = Range.prototype.getClientRects
  Range.prototype.getClientRects = () => [{ left: 0, top: 0, width: 40, height: 20 }] as unknown as DOMRectList
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ timings: { version: 1, words: [['Hello', 0, 1000, 0], ['world', 1000, 2000, 0]] } }) })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Range.prototype.getClientRects = originalRects })

function Reader({ article = track, visible = true }: { article?: NetworkAudioTrack; visible?: boolean }) {
  return <StrictMode><NetworkAudioProvider resolveAudio={resolveAudio}>
    {visible && <div key={article.id}><ArticleAudioControls track={article} narration={{ timingsUrl: '/timings', targetId: 'body' }} /><div id="body">Hello world</div></div>}
    <NetworkAudioPlayer advertisement={<a href="https://sponsor.example">Community sponsor</a>} />
  </NetworkAudioProvider></StrictMode>
}
it('keeps the same audio playing when the article subtree changes or unmounts', async () => {
  const view = render(<Reader />)
  fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pause playback' })).toBeTruthy())
  const original = media
  act(() => { media.currentTime = 18; fireEvent.timeUpdate(media) })
  view.rerender(<Reader article={next} />)
  expect(screen.getByRole('link', { name: track.title })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Add to queue' }))
  expect(screen.getByRole('button', { name: 'Queue (2)' })).toBeTruthy()
  view.rerender(<Reader visible={false} />)
  expect(media).toBe(original)
  expect(media.currentTime).toBe(18)
  expect(resolveAudio).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: 'Pause playback' })).toBeTruthy()
})
it('cleans up highlights after leaving and restores them when returning, without stopping audio', async () => {
  const view = render(<Reader />)
  fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }))
  fireEvent.click(screen.getByRole('button', { name: 'Highlight words' }))
  await waitFor(() => expect(document.querySelector('[data-sm-narration-layer]')).toBeTruthy())
  view.rerender(<Reader article={next} />)
  expect(document.querySelector('[data-sm-narration-layer]')).toBeNull()
  expect(screen.getByRole('button', { name: 'Pause playback' })).toBeTruthy()
  view.rerender(<Reader />)
  await waitFor(() => expect(document.querySelector('[data-sm-narration-layer]')).toBeTruthy())
  expect(resolveAudio).toHaveBeenCalledOnce()
})
it('expands the queue and real sponsor slot without interrupting playback', async () => {
  render(<Reader />)
  fireEvent.click(screen.getByRole('button', { name: 'Listen to article' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Pause playback' })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Queue (1)' }))
  expect(screen.getByRole('complementary', { name: 'Advertisement' })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Speed'), { target: { value: '1.5' } })
  expect(media.playbackRate).toBe(1.5)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))
  expect(screen.queryByRole('complementary', { name: 'Advertisement' })).toBeNull()
  expect(resolveAudio).toHaveBeenCalledOnce()
})
it('renders on the server without accessing browser APIs or fetching media', () => {
  expect(renderToString(<Reader />)).toContain('Listen to article')
  expect(resolveAudio).not.toHaveBeenCalled()
})
