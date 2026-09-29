// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  alignWords,
  collectDomWords,
  normalizeWord,
  parseTimingsPayload,
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
