'use client'

/**
 * Follow-along narration highlighting.
 *
 * The platform's TTS pipeline stores word timings with every narration
 * it synthesizes: `{version: 1, duration_ms, words}` where each word is
 * `[text, start_ms, end_ms, sentence_index]` over the narration script
 * (the article's markdown rendered to plain text). The article body a
 * site renders is HTML from that same markdown, so the two word
 * sequences correspond nearly one-to-one; this module aligns them and
 * paints the spoken word and sentence with the CSS Custom Highlight
 * API — no DOM mutation, no per-word spans.
 *
 * Everything degrades to nothing: unsupported browser (no
 * `CSS.highlights`), missing timings, or a body that no longer matches
 * the narration simply means no highlight.
 */

export interface NarrationTimings {
  version: number
  duration_ms?: number
  /** [text, start_ms, end_ms, sentence_index] */
  words: [string, number, number, number][]
}

export const WORD_HIGHLIGHT = 'sm-narration-word'
export const SENTENCE_HIGHLIGHT = 'sm-narration-sentence'

/** Case/punctuation-insensitive token form used for alignment. */
export function normalizeWord(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

export interface DomWord {
  node: Text
  start: number
  end: number
  norm: string
}

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'])

/** Whitespace-split words of every text node under `root`, in order. */
export function collectDomWords(root: Node): DomWord[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode(node: Node) {
      const parent = node.parentElement
      if (parent && SKIPPED_TAGS.has(parent.tagName)) return 2 /* REJECT */
      return 1 /* ACCEPT */
    },
  })
  const out: DomWord[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node as Text).data
    const matcher = /\S+/g
    for (let m = matcher.exec(text); m; m = matcher.exec(text)) {
      const norm = normalizeWord(m[0])
      if (norm) {
        out.push({ node: node as Text, start: m.index, end: m.index + m[0].length, norm })
      }
    }
  }
  return out
}

/**
 * Greedy sequential alignment with a small look-ahead window on both
 * sides, tolerant of stray tokens (an image caption in the DOM, a
 * normalization mismatch). Returns, per timing word, the index of its
 * DOM word or -1.
 */
export function alignWords(timingNorms: string[], domNorms: string[], window = 6): number[] {
  const out = new Array<number>(timingNorms.length).fill(-1)
  let j = 0
  for (let i = 0; i < timingNorms.length; i++) {
    const target = timingNorms[i]
    if (!target) continue
    let found = -1
    for (let k = j; k < Math.min(domNorms.length, j + window); k++) {
      if (domNorms[k] === target) {
        found = k
        break
      }
    }
    if (found === -1) {
      // The timing word is missing from the DOM (or too far); leave it
      // unmatched but do not advance j, so the next words can still land.
      continue
    }
    out[i] = found
    j = found + 1
  }
  return out
}

/** Binary search: index of the word whose [start, end) contains timeMs,
 * or the nearest previous word; -1 before the first word. */
export function wordIndexAt(words: [string, number, number, number][], timeMs: number): number {
  let lo = 0
  let hi = words.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid][1] <= timeMs) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

interface HighlightRegistry {
  set(name: string, highlight: unknown): void
  delete(name: string): void
}

declare const Highlight: { new (...ranges: AbstractRange[]): unknown }

export function narrationHighlightSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof CSS !== 'undefined' &&
    'highlights' in CSS &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === 'function'
  )
}

/**
 * Owns the live highlight for one narration player. Build once per
 * (timings, article body) pair; drive with `update(currentTimeMs)`.
 */
export class NarrationHighlighter {
  private words: [string, number, number, number][]
  private ranges: (Range | null)[]
  private sentenceRanges: Map<number, Range[]>
  private currentWord = -2
  private currentSentence = -2
  private follow = true
  private detachUserScroll: (() => void) | null = null
  private reducedMotion: boolean

  constructor(root: Element, timings: NarrationTimings) {
    this.words = timings.words
    const domWords = collectDomWords(root)
    const matches = alignWords(
      this.words.map((w) => normalizeWord(w[0])),
      domWords.map((w) => w.norm)
    )
    const doc = root.ownerDocument
    this.ranges = matches.map((m) => {
      if (m === -1) return null
      const w = domWords[m]
      try {
        const range = doc.createRange()
        range.setStart(w.node, w.start)
        range.setEnd(w.node, w.end)
        return range
      } catch {
        return null
      }
    })
    this.sentenceRanges = new Map()
    this.words.forEach((w, i) => {
      const range = this.ranges[i]
      if (!range) return
      const list = this.sentenceRanges.get(w[3])
      if (list) list.push(range)
      else this.sentenceRanges.set(w[3], [range])
    })
    this.reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.attachUserScroll(doc)
  }

  /** Fraction of narration words found in the article body. A low
   * ratio means the body diverged from the script; callers may prefer
   * to hide the toggle below ~0.5. */
  matchRatio(): number {
    if (this.ranges.length === 0) return 0
    return this.ranges.filter(Boolean).length / this.ranges.length
  }

  private attachUserScroll(doc: Document) {
    const stopFollowing = () => {
      this.follow = false
    }
    const opts = { passive: true } as AddEventListenerOptions
    doc.addEventListener('wheel', stopFollowing, opts)
    doc.addEventListener('touchmove', stopFollowing, opts)
    this.detachUserScroll = () => {
      doc.removeEventListener('wheel', stopFollowing, opts)
      doc.removeEventListener('touchmove', stopFollowing, opts)
    }
  }

  /** Re-engage auto-scroll (the reader pressed the toggle or sought). */
  resumeFollowing() {
    this.follow = true
    this.currentSentence = -2 // force a scroll on the next update
  }

  update(timeMs: number) {
    if (!narrationHighlightSupported()) return
    const idx = wordIndexAt(this.words, timeMs)
    if (idx === this.currentWord) return
    this.currentWord = idx
    const registry = (CSS as unknown as { highlights: HighlightRegistry }).highlights
    if (idx < 0) {
      registry.delete(WORD_HIGHLIGHT)
      registry.delete(SENTENCE_HIGHLIGHT)
      this.currentSentence = -2
      return
    }
    const wordRange = this.ranges[idx]
    if (wordRange) registry.set(WORD_HIGHLIGHT, new Highlight(wordRange))
    else registry.delete(WORD_HIGHLIGHT)

    const sentence = this.words[idx][3]
    if (sentence !== this.currentSentence) {
      this.currentSentence = sentence
      const ranges = this.sentenceRanges.get(sentence) ?? []
      if (ranges.length > 0) {
        registry.set(SENTENCE_HIGHLIGHT, new Highlight(...ranges))
        this.scrollTo(ranges[0])
      } else {
        registry.delete(SENTENCE_HIGHLIGHT)
      }
    }
  }

  private scrollTo(range: Range) {
    if (!this.follow) return
    try {
      const rect = range.getBoundingClientRect()
      const viewport = window.innerHeight || 0
      // Only scroll when the sentence leaves the comfortable middle band,
      // so the page glides rather than twitching on every sentence.
      if (rect.top < viewport * 0.15 || rect.bottom > viewport * 0.7) {
        const target = window.scrollY + rect.top - viewport * 0.3
        window.scrollTo({ top: target, behavior: this.reducedMotion ? 'auto' : 'smooth' })
      }
    } catch {
      /* Scrolling is a nicety; never let it break playback. */
    }
  }

  clear() {
    if (!narrationHighlightSupported()) return
    const registry = (CSS as unknown as { highlights: HighlightRegistry }).highlights
    registry.delete(WORD_HIGHLIGHT)
    registry.delete(SENTENCE_HIGHLIGHT)
    this.currentWord = -2
    this.currentSentence = -2
  }

  destroy() {
    this.clear()
    this.detachUserScroll?.()
    this.detachUserScroll = null
  }
}

/** Parse a fetched timings payload; accepts the raw timings object or
 * common envelopes ({timings}, {data:{timings}}). */
export function parseTimingsPayload(body: unknown): NarrationTimings | null {
  const candidate =
    (body as { timings?: unknown })?.timings ??
    (body as { data?: { timings?: unknown } })?.data?.timings ??
    body
  const t = candidate as NarrationTimings | null
  if (!t || t.version !== 1 || !Array.isArray(t.words) || t.words.length === 0) return null
  const valid = t.words.every(
    (w) =>
      Array.isArray(w) &&
      w.length === 4 &&
      typeof w[0] === 'string' &&
      typeof w[1] === 'number' &&
      typeof w[2] === 'number' &&
      typeof w[3] === 'number'
  )
  return valid ? t : null
}
