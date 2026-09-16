// @vitest-environment jsdom
import React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioPlayer, type AudioPlayerSource } from './audio-player'

const source: AudioPlayerSource = {
  url: 'https://media.example/article.mp3',
  duration_ms: 87000,
}
let play: ReturnType<typeof vi.spyOn>
let pause: ReturnType<typeof vi.spyOn>
let load: ReturnType<typeof vi.spyOn>
function metadata(element: HTMLAudioElement, duration = 87) {
  Object.defineProperty(element, 'duration', {
    configurable: true,
    value: duration,
  })
  fireEvent.loadedMetadata(element)
}
function tick(element: HTMLAudioElement, position: number) {
  element.currentTime = position
  fireEvent.timeUpdate(element)
}
function element(container: HTMLElement) {
  return container.querySelector('audio')!
}
beforeEach(() => {
  localStorage.clear()
  play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(function (this: HTMLAudioElement) {
      fireEvent.play(this)
      return Promise.resolve()
    })
  pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(function (this: HTMLAudioElement) {
      fireEvent.pause(this)
    })
  load = vi
    .spyOn(HTMLMediaElement.prototype, 'load')
    .mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe.each(['waveform', 'compact', 'inline'] as const)(
  '%s player',
  (variant) => {
    it('shares play/pause, exact elapsed and speed-adjusted remaining time', async () => {
      const { container } = render(
        <AudioPlayer audio={source} variant={variant} />
      )
      const media = element(container)
      expect(media.preload).toBe('none')
      expect(play).not.toHaveBeenCalled()
      metadata(media)
      fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
      expect(
        screen.getByRole('button', { name: 'Pause narration' })
      ).toBeTruthy()
      tick(media, 47)
      expect(screen.getByText('0:40 remaining')).toBeTruthy()
      fireEvent.click(
        screen.getByRole('button', { name: /Change playback speed/ })
      )
      expect(media.playbackRate).toBe(1.25)
      expect(screen.getByText('0:32 remaining')).toBeTruthy()
      expect(container.textContent).toContain('0:47')
      fireEvent.click(screen.getByRole('button', { name: 'Pause narration' }))
      expect(pause).toHaveBeenCalled()
      expect(
        screen.getByRole('button', { name: 'Play narration' })
      ).toBeTruthy()
    })
  }
)

it('shows a played segment, accessible seek position, and end state', () => {
  const { container } = render(<AudioPlayer audio={source} variant="compact" />)
  const media = element(container)
  metadata(media)
  tick(media, 47)
  const range = screen.getByRole('slider', {
    name: 'Seek narration',
  }) as HTMLInputElement
  expect(range.getAttribute('aria-valuetext')).toBe(
    '0:47 elapsed; 0:40 remaining'
  )
  expect(
    container.querySelector('.sm-audio__seek')?.getAttribute('style')
  ).toContain('54.022')
  fireEvent.change(range, { target: { value: '67' } })
  expect(media.currentTime).toBe(67)
  fireEvent.ended(media)
  expect(screen.getByText('0:00 remaining')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Play narration' })).toBeTruthy()
})

it('does not fabricate a waveform and bounds supplied peak rendering', () => {
  const view = render(<AudioPlayer audio={source} />)
  expect(view.container.querySelector('.sm-audio__waveform')).toBeNull()
  view.rerender(
    <AudioPlayer
      audio={{
        ...source,
        url: source.url + '?v=2',
        waveform_peaks: Array(100000).fill(0.5),
      }}
    />
  )
  expect(
    view.container.querySelectorAll('.sm-audio__waveform span')
  ).toHaveLength(64)
})

it('hydrates persisted speed without overwriting it on mount; tolerates denied storage', () => {
  localStorage.setItem('scalemule:audio:playback-rate', '2')
  const { container } = render(<AudioPlayer audio={source} />)
  expect(element(container).playbackRate).toBe(2)
  expect(localStorage.getItem('scalemule:audio:playback-rate')).toBe('2')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  fireEvent.click(screen.getByRole('button', { name: /Change playback speed/ }))
  expect(element(container).playbackRate).toBe(3)
})

it('handles missing or non-finite duration without invalid seeking', () => {
  const { container } = render(
    <AudioPlayer audio={{ url: source.url, duration_ms: NaN }} />
  )
  metadata(element(container), Infinity)
  expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true)
  expect(screen.getByText('Duration available when played')).toBeTruthy()
})

it('refreshes expired audio only on interaction and resumes after metadata at the same position', async () => {
  const fresh = { ...source, url: source.url + '?fresh=1' }
  const onRefresh = vi.fn().mockResolvedValue(fresh)
  const { container } = render(
    <AudioPlayer
      audio={{ ...source, expires_at: '2000-01-01' }}
      audioKey="article"
      onRefresh={onRefresh}
    />
  )
  const media = element(container)
  metadata(media)
  tick(media, 47)
  expect(onRefresh).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  await waitFor(() => expect(media.src).toBe(fresh.url))
  metadata(media)
  expect(media.currentTime).toBe(47)
  expect(play).toHaveBeenCalled()
})

it('bounds automatic refreshes even when every fresh URL fails', async () => {
  const onRefresh = vi
    .fn()
    .mockResolvedValue({ ...source, url: source.url + '?bad=1' })
  const { container } = render(
    <AudioPlayer audio={source} onRefresh={onRefresh} />
  )
  const media = element(container)
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  fireEvent.error(media)
  await waitFor(() => expect(media.src).toContain('bad=1'))
  fireEvent.error(media)
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'could not be played'
    )
  )
  expect(onRefresh).toHaveBeenCalledTimes(1)
})

it('does not refresh or autoplay on a preload error', () => {
  const onRefresh = vi.fn()
  const { container } = render(
    <AudioPlayer audio={source} preload="metadata" onRefresh={onRefresh} />
  )
  fireEvent.error(element(container))
  expect(onRefresh).not.toHaveBeenCalled()
  expect(play).not.toHaveBeenCalled()
})

it('deduplicates error bursts and handles rejected refresh without an unhandled promise', async () => {
  const onRefresh = vi.fn().mockRejectedValue(new Error('offline'))
  const onPlaybackError = vi.fn()
  const { container } = render(
    <AudioPlayer
      audio={source}
      onRefresh={onRefresh}
      onPlaybackError={onPlaybackError}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  fireEvent.error(element(container))
  fireEvent.error(element(container))
  await waitFor(() => expect(onPlaybackError).toHaveBeenCalledTimes(1))
  expect(onRefresh).toHaveBeenCalledTimes(1)
})

it('reloads a refreshed stable URL without losing position or starting paused audio', async () => {
  const onRefresh = vi.fn().mockResolvedValue(source)
  const { container } = render(
    <AudioPlayer audio={source} onRefresh={onRefresh} showRefreshButton />
  )
  const media = element(container)
  metadata(media)
  tick(media, 47)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(1))
  media.currentTime = 0
  metadata(media)
  expect(media.currentTime).toBe(47)
  expect(play).not.toHaveBeenCalled()
})

it('aborts in-flight refresh and ignores its result after article change', async () => {
  let resolve!: (audio: AudioPlayerSource) => void
  let signal: AbortSignal | undefined
  const onRefresh = vi.fn((s: AbortSignal) => {
    signal = s
    return new Promise<AudioPlayerSource>((r) => {
      resolve = r
    })
  })
  const view = render(
    <AudioPlayer
      audio={{ ...source, expires_at: '2000-01-01' }}
      audioKey="old"
      onRefresh={onRefresh}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  view.rerender(
    <AudioPlayer
      audio={{ ...source, url: 'https://media.example/new.mp3' }}
      audioKey="new"
      onRefresh={onRefresh}
    />
  )
  expect(signal?.aborted).toBe(true)
  await act(async () =>
    resolve({ ...source, url: 'https://media.example/old-fresh.mp3' })
  )
  expect(element(view.container).src).toBe('https://media.example/new.mp3')
  expect(play).not.toHaveBeenCalled()
})

it('keeps a cancelled refresh paused when another player starts', async () => {
  let resolve!: (audio: AudioPlayerSource) => void
  const onRefresh = vi.fn(
    () =>
      new Promise<AudioPlayerSource>((r) => {
        resolve = r
      })
  )
  const { container } = render(
    <>
      <AudioPlayer
        audio={{ ...source, expires_at: '2000-01-01' }}
        onRefresh={onRefresh}
      />
      <AudioPlayer
        audio={{ ...source, url: 'https://media.example/second.mp3' }}
      />
    </>
  )
  fireEvent.click(screen.getAllByRole('button', { name: 'Play narration' })[0])
  fireEvent.click(screen.getAllByRole('button', { name: 'Play narration' })[0])
  await act(async () =>
    resolve({ ...source, url: 'https://media.example/refreshed.mp3' })
  )
  const first = container.querySelectorAll('audio')[0]
  metadata(first)
  expect(play).toHaveBeenCalledTimes(1)
})

it('reports gesture-denied play without fetching a replacement URL', async () => {
  play.mockRejectedValue(
    new DOMException('Gesture required', 'NotAllowedError')
  )
  const onRefresh = vi.fn()
  render(<AudioPlayer audio={source} onRefresh={onRefresh} />)
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  await waitFor(() => expect(screen.getByRole('status')).toBeTruthy())
  expect(onRefresh).not.toHaveBeenCalled()
})

it('lets a reader cancel pending playback while refresh finishes', async () => {
  let resolve!: (audio: AudioPlayerSource) => void
  const onRefresh = vi.fn(
    () =>
      new Promise<AudioPlayerSource>((r) => {
        resolve = r
      })
  )
  const { container } = render(
    <AudioPlayer
      audio={{ ...source, expires_at: '2000-01-01' }}
      onRefresh={onRefresh}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Play narration' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pause narration' }))
  expect(screen.getByRole('button', { name: 'Play narration' })).toBeTruthy()
  await act(async () =>
    resolve({ ...source, url: 'https://media.example/new.mp3' })
  )
  metadata(element(container))
  expect(play).not.toHaveBeenCalled()
})

it('keeps the saved position visible while a refreshed paused source waits for metadata', async () => {
  const onRefresh = vi.fn().mockResolvedValue({ ...source, url: source.url + '?new=1' })
  const { container } = render(<AudioPlayer audio={source} onRefresh={onRefresh} showRefreshButton />)
  const media = element(container)
  metadata(media)
  tick(media, 47)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(media.src).toContain('new=1'))
  // Chromium resets currentTime even though preload=none has not loaded replacement metadata.
  Object.defineProperty(media, 'readyState', { configurable: true, value: 0 })
  tick(media, 0)
  expect(screen.getByText('0:40 remaining')).toBeTruthy()
  expect(container.textContent).toContain('0:47')
  metadata(media)
  expect(media.currentTime).toBe(47)
  expect(play).not.toHaveBeenCalled()
})
