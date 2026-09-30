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

let body: HTMLDivElement
let originalRects: typeof Range.prototype.getClientRects | undefined

// jsdom has no layout: give each word range one 60×20 box, two words per
// line, so the overlay can be asserted on.
function stubLayout() {
  originalRects = Range.prototype.getClientRects
  Range.prototype.getClientRects = function (this: Range) {
    const all = body.textContent ?? ''
    const index = all.indexOf(this.toString())
    const word = all.slice(0, index).split(/\s+/).filter(Boolean).length
    const box = { left: (word % 2) * 70, top: Math.floor(word / 2) * 24, width: 60, height: 20 }
    return [box] as unknown as DOMRectList
  }
}

const boxes = (kind: 'word' | 'sentence') =>
  Array.from(body.querySelectorAll<HTMLElement>(`[data-sm-narration="${kind}"]`))

beforeEach(() => {
  stubLayout()
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
  if (originalRects) Range.prototype.getClientRects = originalRects
  else delete (Range.prototype as { getClientRects?: unknown }).getClientRects
})

describe('narration highlight toggle', () => {
  it('is hidden without layout APIs', () => {
    delete (Range.prototype as { getClientRects?: unknown }).getClientRects
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
    expect(boxes('word')).toHaveLength(0)
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
    await waitFor(() => expect(boxes('word')).toHaveLength(1))
    // "world." is word 1 → second slot on the first line.
    expect(boxes('word')[0].style.left).toBe('68px')
    // "Hello world." is one sentence on one line → ONE continuous band
    // spanning both words and the gap (not two per-word boxes).
    expect(boxes('sentence')).toHaveLength(1)
    expect(boxes('sentence')[0].style.width).toBe('134px')
    // The layer sits behind the text inside an isolated body.
    expect(body.querySelector('[data-sm-narration-layer]')?.getAttribute('aria-hidden')).toBe('true')
    expect(body.style.isolation).toBe('isolate')
  })

  it('turning it off clears the paint and persists the choice', async () => {
    render(<AudioPlayer audio={source} narration={narration} />)
    fireEvent.click(screen.getByRole('button', { name: /highlight the text/i }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /turn off follow-along/i })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole('button', { name: /turn off follow-along/i }))
    expect(boxes('word')).toHaveLength(0)
    expect(boxes('sentence')).toHaveLength(0)
    expect(localStorage.getItem('scalemule:audio:highlight')).toBe('0')
  })
})
