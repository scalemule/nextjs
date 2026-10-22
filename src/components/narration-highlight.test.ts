// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  alignWords,
  collectDomWords,
  mergeLineBoxes,
  NarrationHighlighter,
  normalizeWord,
  parseTimingsPayload,
  rebalanceSentenceTimings,
  wordIndexAt,
} from './narration-highlight'

describe('normalizeWord', () => {
  it('folds case and strips punctuation', () => {
    expect(normalizeWord('Hello,')).toBe('hello')
    expect(normalizeWord('“quoted.”')).toBe('quoted')
    expect(normalizeWord('co-op')).toBe('coop')
  })

  it('keeps non-latin scripts intact', () => {
    expect(normalizeWord('Привет,')).toBe('привет')
    expect(normalizeWord('你好世界。')).toBe('你好世界')
  })

  it('empties punctuation-only and emoji-only tokens', () => {
    expect(normalizeWord('—')).toBe('')
    expect(normalizeWord('🎉')).toBe('')
  })
})

describe('collectDomWords', () => {
  it('walks text nodes in order and skips script/style', () => {
    const root = document.createElement('div')
    root.innerHTML =
      '<p>First <strong>bold</strong> tail.</p><script>ignored()</script><p>Second para.</p>'
    const words = collectDomWords(root)
    expect(words.map((w) => w.norm)).toEqual(['first', 'bold', 'tail', 'second', 'para'])
    expect(words[0].node.data.slice(words[0].start, words[0].end)).toBe('First')
  })

  it('aligns through long event cards without highlighting their repeated article words', () => {
    const root = document.createElement('div')
    root.innerHTML = '<p>First paragraph.</p><section data-entity-card="event"><h2>Event details</h2>' +
      '<p>Date time venue registration admission directions capacity organizer address.</p>' +
      '<strong>Second paragraph. София 新聞 🎉</strong></section>' +
      '<p>Second paragraph. София 新聞 🎉</p><aside data-sm-narration-skip>Newsletter signup</aside>'
    const words = collectDomWords(root)
    expect(words.map(w => w.norm)).toEqual(['first', 'paragraph', 'second', 'paragraph', 'софия', '新聞'])
    expect(words.every(w => !w.node.parentElement?.closest('[data-entity-card], [data-sm-narration-skip]'))).toBe(true)
    expect(alignWords(['first', 'paragraph', 'second', 'paragraph', 'софия', '新聞'], words.map(w => w.norm)))
      .toEqual([0, 1, 2, 3, 4, 5])
  })
})

describe('alignWords', () => {
  it('matches identical sequences one to one', () => {
    const t = ['a', 'b', 'c']
    expect(alignWords(t, t)).toEqual([0, 1, 2])
  })

  it('skips extra DOM tokens within the window', () => {
    // e.g. an inline caption the narration never spoke
    expect(alignWords(['a', 'b', 'c'], ['a', 'x', 'y', 'b', 'c'])).toEqual([0, 3, 4])
  })

  it('leaves unmatched timing words at -1 without derailing', () => {
    expect(alignWords(['a', 'gone', 'b'], ['a', 'b'])).toEqual([0, -1, 1])
  })

  it('never matches backwards', () => {
    const out = alignWords(['b', 'a'], ['a', 'b'])
    expect(out[0]).toBe(1)
    expect(out[1]).toBe(-1)
  })

  it('resynchronizes across multi-word captions and edits without derailing on stop-words', () => {
    const timing = [
      'the', 'mayor', 'attended', 'in', 'person',
      // 12-word inline caption present in narration timings but stripped from DOM,
      // containing common stop-words ('in', 'the', 'and', 'to') that also appear later in DOM
      'photo', 'of', 'volunteers', 'in', 'the', 'workshop', 'and', 'seniors', 'learning', 'to', 'use', 'phones',
      'her', 'involvement', 'illustrates', 'how', 'the', 'program', 'grew',
    ]
    const dom = [
      'the', 'mayor', 'attended', 'in', 'person',
      // 9-word phrase added in DOM before the next sentence
      'to', 'observe', 'the', 'tutoring', 'firsthand', 'and', 'encourage', 'the', 'volunteers',
      'her', 'involvement', 'illustrates', 'how', 'the', 'program', 'grew',
    ]
    const out = alignWords(timing, dom)
    expect(out.slice(0, 5)).toEqual([0, 1, 2, 3, 4])
    // All 12 caption words remain unmatched (-1) instead of consuming 'to'/'the'/'and' in DOM
    expect(out.slice(5, 17)).toEqual(new Array(12).fill(-1))
    // Resynchronizes cleanly at 'her involvement illustrates...' (dom index 14..20)
    expect(out.slice(17)).toEqual([14, 15, 16, 17, 18, 19, 20])
  })
})

describe('wordIndexAt', () => {
  const words: [string, number, number, number][] = [
    ['one', 0, 400, 0],
    ['two', 400, 900, 0],
    ['three', 1000, 1500, 1],
  ]
  it('finds the containing word', () => {
    expect(wordIndexAt(words, 0)).toBe(0)
    expect(wordIndexAt(words, 450)).toBe(1)
    expect(wordIndexAt(words, 1200)).toBe(2)
  })
  it('holds the previous word through gaps and past the end', () => {
    expect(wordIndexAt(words, 950)).toBe(1)
    expect(wordIndexAt(words, 99999)).toBe(2)
  })
  it('is -1 before the first word', () => {
    expect(wordIndexAt([['w', 100, 200, 0]], 50)).toBe(-1)
  })
})

describe('rebalanceSentenceTimings', () => {
  it('carves out clause pauses and function-word discounts on legacy linear sentences', () => {
    const legacy: [string, number, number, number][] = [
      ['a', 7640, 7775, 1],
      ['graduate', 7775, 8446, 1],
      ['of', 8446, 8714, 1],
      ['the', 8714, 8916, 1],
      ['University', 8916, 9721, 1],
      ['of', 9721, 9989, 1],
      ['California,', 9989, 10929, 1],
      ['Santa', 10929, 11398, 1],
      ['Barbara.', 11398, 12002, 1],
    ]
    const rebalanced = rebalanceSentenceTimings(legacy)
    const byWord = Object.fromEntries(rebalanced.map(([w, st, en]) => [w, [st, en]]))
    // "University" and "California," start significantly earlier than their smeared linear start times
    expect(byWord['University'][0]).toBeLessThan(8750)
    expect(byWord['California,'][0]).toBeLessThan(9750)
    // "California," finishes before the comma pause so "Santa" starts after the pause gap
    expect(byWord['Santa'][0] - byWord['California,'][1]).toBeGreaterThanOrEqual(180)
  })

  it('leaves already waveform-aligned sentences (with explicit pause gaps) untouched', () => {
    const aligned: [string, number, number, number][] = [
      ['University', 0, 520, 0],
      ['of', 520, 620, 0],
      ['California,', 620, 1050, 0],
      ['Santa', 1420, 1780, 0],
      ['Barbara.', 1780, 2240, 0],
    ]
    expect(rebalanceSentenceTimings(aligned)).toEqual(aligned)
  })
})

describe('parseTimingsPayload', () => {
  const valid = { version: 1, duration_ms: 700, words: [['hi', 0, 700, 0]] }
  it('accepts the raw object and common envelopes', () => {
    expect(parseTimingsPayload(valid)?.words.length).toBe(1)
    expect(parseTimingsPayload({ timings: valid })?.words.length).toBe(1)
    expect(parseTimingsPayload({ data: { timings: valid } })?.words.length).toBe(1)
  })
  it('rejects wrong versions, empty and malformed words', () => {
    expect(parseTimingsPayload({ version: 2, words: [['hi', 0, 1, 0]] })).toBeNull()
    expect(parseTimingsPayload({ version: 1, words: [] })).toBeNull()
    expect(parseTimingsPayload({ version: 1, words: [['hi', 0, 1]] })).toBeNull()
    expect(parseTimingsPayload(null)).toBeNull()
  })
})

describe('mergeLineBoxes', () => {
  it('merges words on one line into a single band spanning the gaps', () => {
    const boxes = mergeLineBoxes([
      { left: 0, top: 0, width: 40, height: 20 },
      { left: 50, top: 1, width: 30, height: 19 },
      { left: 90, top: 0, width: 20, height: 20 },
    ])
    expect(boxes).toEqual([{ left: 0, top: 0, width: 110, height: 20 }])
  })

  it('keeps separate lines separate', () => {
    const boxes = mergeLineBoxes([
      { left: 0, top: 30, width: 40, height: 20 },
      { left: 0, top: 0, width: 40, height: 20 },
      { left: 50, top: 30, width: 40, height: 20 },
    ])
    expect(boxes).toHaveLength(2)
    expect(boxes[0].top).toBe(0)
    expect(boxes[1]).toEqual({ left: 0, top: 30, width: 90, height: 20 })
  })

  it('drops empty rects', () => {
    expect(mergeLineBoxes([{ left: 0, top: 0, width: 0, height: 20 }])).toEqual([])
  })
})

describe('NarrationHighlighter overlay', () => {
  const original = Range.prototype.getClientRects
  afterEach(() => {
    if (original) Range.prototype.getClientRects = original
    else delete (Range.prototype as { getClientRects?: unknown }).getClientRects
    document.body.innerHTML = ''
  })

  function setup() {
    const root = document.createElement('div')
    root.innerHTML = '<p>One two.</p> <p>Three four.</p>'
    document.body.appendChild(root)
    Range.prototype.getClientRects = function (this: Range) {
      const text = root.textContent ?? ''
      const word = text.slice(0, text.indexOf(this.toString())).split(/\s+/).filter(Boolean).length
      return [{ left: (word % 2) * 50, top: Math.floor(word / 2) * 30, width: 40, height: 20 }] as unknown as DOMRectList
    }
    const h = new NarrationHighlighter(root, {
      version: 1,
      words: [
        ['One', 0, 100, 0],
        ['two.', 100, 200, 0],
        ['Three', 200, 300, 1],
        ['four.', 300, 400, 1],
      ],
    })
    const q = (kind: string) => root.querySelectorAll<HTMLElement>(`[data-sm-narration="${kind}"]`)
    return { root, h, q }
  }

  it('paints one band per sentence line and one word box', () => {
    const { h, q } = setup()
    h.update(150)
    expect(q('sentence')).toHaveLength(1)
    expect(q('sentence')[0].style.width).toBe('94px')
    expect(q('word')).toHaveLength(1)
  })

  it('replaces the previous sentence and word (no stale paint)', () => {
    const { h, q } = setup()
    h.update(150)
    h.update(350)
    expect(q('sentence')).toHaveLength(1)
    expect(q('sentence')[0].style.top).toBe('29px')
    expect(q('word')).toHaveLength(1)
    expect(q('word')[0].style.left).toBe('48px')
  })

  it('destroy removes the layer and restores the root', () => {
    const { root, h } = setup()
    h.update(150)
    expect(root.querySelector('[data-sm-narration-layer]')).not.toBeNull()
    h.destroy()
    expect(root.querySelector('[data-sm-narration-layer]')).toBeNull()
    expect(root.style.isolation).toBe('')
    expect(root.style.position).toBe('')
  })

  it('auto-scrolls when active word leaves viewport comfort band and resumes after manual user scroll', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 200 })

    const { h } = setup()
    const origBounding = Range.prototype.getBoundingClientRect
    Range.prototype.getBoundingClientRect = function (this: Range) {
      const text = this.toString()
      // Place "two." and "four." below 75% of the 800px viewport (bottom > 600)
      const top = text === 'two.' || text === 'four.' ? 680 : 300
      return { left: 0, top, right: 40, bottom: top + 20, width: 40, height: 20, x: 0, y: top, toJSON: () => ({}) }
    }

    try {
      // Word 0 ("One") is inside comfort band (top=300, bottom=320) -> no scroll
      h.update(50)
      expect(scrollToSpy).not.toHaveBeenCalled()

      // Word 1 ("two.") in the SAME sentence wraps below 75% viewport -> scrolls into view!
      vi.advanceTimersByTime(200)
      h.update(150)
      expect(scrollToSpy).toHaveBeenCalledTimes(1)

      // User manually scrolls with wheel -> pauses auto-scroll during active gesture cooldown (1200ms)
      document.dispatchEvent(new Event('wheel'))
      vi.advanceTimersByTime(300)
      h.update(350) // "four." is off-screen, but within 1200ms cooldown
      expect(scrollToSpy).toHaveBeenCalledTimes(1)

      // After user stops scrolling (>1200ms), next word advance automatically resumes auto-scroll
      vi.advanceTimersByTime(1000)
      h.update(150)
      expect(scrollToSpy).toHaveBeenCalledTimes(2)
    } finally {
      Range.prototype.getBoundingClientRect = origBounding
      scrollToSpy.mockRestore()
      vi.useRealTimers()
      h.destroy()
    }
  })
})
