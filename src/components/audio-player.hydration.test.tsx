/** @vitest-environment jsdom */
import React, { act } from 'react'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AudioPlayer, type AudioPlayerVariant } from './audio-player'
import { NarrationPlayer } from './narration-player'

// Players are server-rendered by every ScaleMule site. If the first client
// render differs from the server HTML, React throws away the whole page's
// server markup (minified error #418) and re-renders it — which, among
// other things, wipes classes set by pre-hydration scripts such as a dark
// theme. The server has no window/Range, so feature detection must never
// change the first render.

const source = {
  url: 'https://media.example/article.mp3',
  duration_ms: 87000,
  has_word_timings: true,
  waveform_peaks: Array.from({ length: 64 }, (_, i) => (i % 7) / 7),
}
const narration = { timingsUrl: '/api/narration/story', targetId: 'article-body' }

// Render as the server would: without the browser APIs feature detection
// looks for.
function serverRender(element: React.ReactElement): string {
  const g = globalThis as Record<string, unknown>
  const saved = { Range: g.Range }
  delete g.Range
  try {
    return renderToString(element)
  } finally {
    g.Range = saved.Range
  }
}

let container: HTMLDivElement | null = null
beforeEach(() => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
  // jsdom has no layout; a real browser has Range.getClientRects.
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
})
afterEach(() => {
  container?.remove()
  container = null
})

async function hydrationErrors(element: React.ReactElement): Promise<string[]> {
  container = document.createElement('div')
  container.innerHTML = serverRender(element)
  document.body.appendChild(container)
  const errors: string[] = []
  let root: ReturnType<typeof hydrateRoot> | undefined
  await act(async () => {
    root = hydrateRoot(container!, element, {
      onRecoverableError: (error) => errors.push(String((error as Error)?.message ?? error)),
    })
  })
  await act(async () => root?.unmount())
  return errors
}

describe('players hydrate without mismatches', () => {
  const variants: AudioPlayerVariant[] = ['waveform', 'compact', 'inline']
  for (const variant of variants) {
    it(`AudioPlayer ${variant} with follow-along narration`, async () => {
      expect(
        await hydrationErrors(
          <AudioPlayer audio={source} audioKey="story" variant={variant} narration={narration} />
        )
      ).toEqual([])
    })
    it(`AudioPlayer ${variant} without narration`, async () => {
      expect(
        await hydrationErrors(<AudioPlayer audio={source} audioKey="story" variant={variant} />)
      ).toEqual([])
    })
  }

  it('NarrationPlayer', async () => {
    expect(
      await hydrationErrors(<NarrationPlayer audio={{ ...source, status: 'ready' } as never} />)
    ).toEqual([])
  })

  it('the follow-along toggle still appears once hydrated', async () => {
    container = document.createElement('div')
    const element = <AudioPlayer audio={source} audioKey="story" narration={narration} />
    container.innerHTML = serverRender(element)
    document.body.appendChild(container)
    expect(container.querySelector('.sm-audio__highlight')).toBeNull()
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container!, element)
    })
    expect(container.querySelector('.sm-audio__highlight')).not.toBeNull()
    await act(async () => root?.unmount())
  })
})
