/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AudioPlayer, type AudioPlayerSource } from './audio-player'

const source: AudioPlayerSource = {
  url: 'https://media.example/article.mp3',
  duration_ms: 87000,
  has_word_timings: true,
}
const narration = { timingsUrl: '/api/narration/story', targetId: 'article-body' }
const timings = {
  version: 1,
  duration_ms: 1400,
  words: [
    ['Hello', 0, 500, 0] as [string, number, number, number],
    ['world.', 500, 900, 0] as [string, number, number, number],
    ['Second', 900, 1200, 1] as [string, number, number, number],
    ['sentence.', 1200, 1400, 1] as [string, number, number, number],
  ],
}

class FakeHighlight {
  ranges: AbstractRange[]
  constructor(...ranges: AbstractRange[]) {
    this.ranges = ranges
  }
}

let registry: Map<string, unknown>
let body: HTMLDivElement

beforeEach(() => {
  registry = new Map()
  ;(globalThis as Record<string, unknown>).Highlight = FakeHighlight
  ;(globalThis as Record<string, unknown>).CSS = { highlights: registry }
  if (typeof localStorage.getItem !== 'function') {
    const store = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, String(value)),
        removeItem: (key: string) => void store.delete(key),
        clear: () => store.clear(),
      },
    })
  }
  body = document.createElement('div')
  body.id = 'article-body'
  body.innerHTML = '<p>Hello world.</p><p>Second sentence.</p>'
  document.body.appendChild(body)
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ timings }) }))
  )
  try {
    localStorage.clear()
  } catch {
    /* jsdom storage always present here */
  }
})
afterEach(() => {
  cleanup()
  body.remove()
  vi.unstubAllGlobals()
  delete (globalThis as Record<string, unknown>).Highlight
  delete (globalThis as Record<string, unknown>).CSS
})

describe('narration highlight toggle', () => {
  it('is hidden without the browser API', () => {
    delete (globalThis as Record<string, unknown>).CSS
    render(<AudioPlayer audio={source} narration={narration} />)
    expect(screen.queryByRole('button', { name: /highlight the text/i })).toBeNull()
  })

  it('is hidden when the recording has no word timings', () => {
    render(
      <AudioPlayer audio={{ ...source, has_word_timings: false }} narration={narration} />
    )
    expect(screen.queryByRole('button', { name: /highlight the text/i })).toBeNull()
  })

  it('is off by default, fetches timings on enable and paints from the clock', async () => {
    const { container } = render(<AudioPlayer audio={source} narration={narration} />)
    expect(registry.size).toBe(0)
    const toggle = screen.getByRole('button', { name: /highlight the text/i })
    fireEvent.click(toggle)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /turn off follow-along/i })).toBeTruthy()
    )
    expect(fetch).toHaveBeenCalledWith('/api/narration/story', expect.anything())

    const audio = container.querySelector('audio')!
    Object.defineProperty(audio, 'duration', { configurable: true, value: 87 })
    fireEvent.loadedMetadata(audio)
    audio.currentTime = 0.6 // 600ms → "world."
    fireEvent.timeUpdate(audio)
    await waitFor(() => expect(registry.has('sm-narration-word')).toBe(true))
    const word = registry.get('sm-narration-word') as FakeHighlight
    expect((word.ranges[0] as Range).toString()).toBe('world.')
    const sentence = registry.get('sm-narration-sentence') as FakeHighlight
    expect(sentence.ranges.length).toBe(2)
  })

  it('turning it off clears the paint and persists the choice', async () => {
    render(<AudioPlayer audio={source} narration={narration} />)
    fireEvent.click(screen.getByRole('button', { name: /highlight the text/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /turn off follow-along/i })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole('button', { name: /turn off follow-along/i }))
    expect(registry.size).toBe(0)
    expect(localStorage.getItem('scalemule:audio:highlight')).toBe('0')
  })
})
