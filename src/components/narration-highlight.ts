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
 * paints the spoken word and sentence as boxes in an overlay layer
 * behind the text — the article's own DOM is never rewritten.
 *
 * Everything degrades to nothing: no layout APIs (SSR), missing
 * timings, or a body that no longer matches the narration simply means
 * no highlight.
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
// Cards and other explicitly non-spoken content can sit between article
// paragraphs. They must not participate in alignment or consume its look-ahead.
const SKIPPED_CONTENT = '[data-entity-card], [data-sm-narration-skip], [data-sm-narration-layer]'

/** Whitespace-split words of every text node under `root`, in order. */
export function collectDomWords(root: Node): DomWord[] {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */, {
    acceptNode(node: Node) {
      const parent = node.parentElement
      if (parent && SKIPPED_TAGS.has(parent.tagName)) return 2 /* REJECT */
      if (parent?.closest(SKIPPED_CONTENT)) return 2 /* REJECT */
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
 * normalization mismatch, or multi-word subheadings/captions present on
 * only one side). Returns, per timing word, the index of its DOM word
 * or -1.
 */
export function alignWords(timingNorms: string[], domNorms: string[], window = 6): number[] {
  const out = new Array<number>(timingNorms.length).fill(-1)
  const resyncWindow = Math.max(window * 4, 24)
  let j = 0
  let inSync = true
  for (let i = 0; i < timingNorms.length; i++) {
    const target = timingNorms[i]
    if (!target) continue
    const nextTarget = i + 1 < timingNorms.length ? timingNorms[i + 1] : ''
    let found = -1

    if (inSync && j < domNorms.length && domNorms[j] === target) {
      found = j
    } else {
      // Prefer a 2-word anchor within resyncWindow so multi-word captions/edits
      // cannot derail alignment on stray prepositions/articles.
      if (nextTarget) {
        const limit = Math.min(domNorms.length - 1, j + resyncWindow)
        for (let k = j; k < limit; k++) {
          if (domNorms[k] === target && domNorms[k + 1] === nextTarget) {
            found = k
            break
          }
        }
      }
      // Fall back to single-word lookahead within the small window only when
      // currently in sync or at the final timing word.
      if (found === -1 && (inSync || !nextTarget)) {
        const limit = Math.min(domNorms.length, j + window)
        for (let k = j; k < limit; k++) {
          if (domNorms[k] === target) {
            found = k
            break
          }
        }
      }
    }

    if (found === -1) {
      // The timing word is missing from the DOM (or too far); leave it
      // unmatched and require a 2-word anchor to resynchronize.
      inSync = false
      continue
    }
    out[i] = found
    j = found + 1
    inSync = true
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

const UNSTRESSED_FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'and',
  'or', 'by', 'as', 'is', 'was', 'were', 'be', 'are', 'with',
  'from', 'that', 'this',
])

const DASH_TOKENS = new Set(['—', '–', '--'])

function isClauseEnd(sent: [string, number, number, number][], i: number): boolean {
  const n = sent.length
  if (i === n - 1) return true
  const stripped = sent[i][0].replace(/["'\u201d\u2019)\]}]+$/u, '')
  if (DASH_TOKENS.has(stripped)) return true
  if (/[,;:\u2014\u2013]$/u.test(stripped)) {
    if (i + 1 < n && DASH_TOKENS.has(sent[i + 1][0])) return false
    if (i + 2 < n && DASH_TOKENS.has(sent[i + 2][0])) return false
    return true
  }
  return false
}

function rebalanceLegacySentence(
  sent: [string, number, number, number][]
): [string, number, number, number][] {
  const n = sent.length
  const sStart = sent[0][1]
  const sEnd = sent[n - 1][2]
  const sDur = sEnd - sStart
  if (n <= 1 || sDur < 600) return sent

  const clauses: [number, number][] = []
  let startIdx = 0
  for (let i = 0; i < n; i++) {
    if (isClauseEnd(sent, i)) {
      clauses.push([startIdx, i])
      startIdx = i + 1
    }
  }

  const clauseBounds: [number, number][] = clauses.map(([i0, i1]) => [sent[i0][1], sent[i1][2]])
  // Dateline header ("SAN RAMON, Calif. —") over-allocates linear phoneme time to
  // the expanded state abbreviation; shift up to 24% of clause 0 into clause 1.
  if (clauses.length >= 2) {
    const [, i1] = clauses[0]
    if (DASH_TOKENS.has(sent[i1][0]) && i1 <= 5) {
      const c0Dur = clauseBounds[0][1] - clauseBounds[0][0]
      const shift = Math.min(450, c0Dur * 0.24)
      clauseBounds[0][1] -= shift
      clauseBounds[1][0] -= shift
    }
  }

  const out: [string, number, number, number][] = []
  for (let c = 0; c < clauses.length; c++) {
    const [i0, i1] = clauses[c]
    const [cStart, cEnd] = clauseBounds[c]
    const cDur = cEnd - cStart
    const cLen = i1 - i0 + 1
    const pauseMs =
      cLen >= 2 && cDur > 450
        ? Math.min(340, cDur * 0.24)
        : cDur > 300
          ? Math.min(180, cDur * 0.18)
          : 0
    const speechDur = Math.max(cDur - pauseMs, cDur * 0.72)

    const weights: number[] = []
    for (let idx = i0; idx <= i1; idx++) {
      const [w, st, en] = sent[idx]
      const oldD = Math.max(en - st, 40)
      const stripped = w.replace(/["'\u201d\u2019)\]}]+$/u, '')
      const clean = stripped
        .replace(/^["'\u201c\u2018([{]+/u, '')
        .replace(/[.,;:!?\u2014\u2013-]+$/u, '')
        .toLowerCase()
      if (DASH_TOKENS.has(w)) {
        weights.push(30)
      } else {
        let weight = Math.pow(oldD, 0.85)
        if (UNSTRESSED_FUNCTION_WORDS.has(clean) && stripped.toLowerCase() === clean) {
          weight *= 0.58
        }
        weights.push(weight)
      }
    }
    const totW = weights.reduce((a, b) => a + b, 0) || 1
    let cur = cStart
    for (let k = 0; k < cLen; k++) {
      const idx = i0 + k
      const [w, , , si] = sent[idx]
      const wDur = speechDur * (weights[k] / totW)
      const lead = idx > 0 ? Math.min(45, wDur * 0.22) : 0
      const wSt = Math.max(sStart, cur - lead)
      const wEn = cur + wDur
      out.push([w, Math.round(wSt), Math.round(Math.max(wSt, wEn)), si])
      cur = wEn
    }
  }
  return out
}

/**
 * Rebalances legacy linear intra-sentence word timings (where every word is
 * packed end-to-end with zero pause gaps) while leaving waveform-aligned
 * sentences untouched.
 */
export function rebalanceSentenceTimings(
  words: [string, number, number, number][]
): [string, number, number, number][] {
  if (words.length <= 1) return words
  const out: [string, number, number, number][] = []
  let i = 0
  while (i < words.length) {
    let j = i + 1
    const sIdx = words[i][3]
    while (j < words.length && words[j][3] === sIdx) j++
    const sent = words.slice(i, j)
    let hasExplicitGaps = false
    for (let k = 0; k < sent.length - 1; k++) {
      if (sent[k + 1][1] - sent[k][2] >= 25) {
        hasExplicitGaps = true
        break
      }
    }
    if (!hasExplicitGaps && j < words.length && words[j][1] - sent[sent.length - 1][2] >= 25) {
      hasExplicitGaps = true
    }
    const processed = hasExplicitGaps ? sent : rebalanceLegacySentence(sent)
    for (const row of processed) out.push(row)
    i = j
  }
  return out
}

/** A rectangle in the highlight layer's coordinate space. */
export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Merges per-word rectangles into one box per visual line, spanning the
 * gaps between words. Rects whose vertical centers lie within half the
 * smaller height are on the same line.
 */
export function mergeLineBoxes(rects: Box[]): Box[] {
  const lines: Box[] = []
  const sorted = rects
    .filter((r) => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left)
  for (const r of sorted) {
    const center = r.top + r.height / 2
    const line = lines.find((l) => {
      const lc = l.top + l.height / 2
      return Math.abs(lc - center) < Math.min(l.height, r.height) / 2
    })
    if (!line) {
      lines.push({ ...r })
      continue
    }
    const right = Math.max(line.left + line.width, r.left + r.width)
    const bottom = Math.max(line.top + line.height, r.top + r.height)
    line.left = Math.min(line.left, r.left)
    line.top = Math.min(line.top, r.top)
    line.width = right - line.left
    line.height = bottom - line.top
  }
  return lines
}

export function narrationHighlightSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Range !== 'undefined' &&
    typeof Range.prototype.getClientRects === 'function'
  )
}

// Box padding around the text so bands read as a highlighter stroke.
const PAD_X = 2
const PAD_Y = 1
// Minimum interval between programmatic scroll adjustments on word changes.
const AUTO_SCROLL_THROTTLE_MS = 180
// Courtesy pause while the reader is actively scrolling with wheel/touch,
// after which follow-along automatically resumes on subsequent spoken words.
const USER_SCROLL_COOLDOWN_MS = 1200

/**
 * Owns the live highlight for one narration player. Build once per
 * (timings, article body) pair; drive with `update(currentTimeMs)`.
 *
 * Paints into an overlay layer behind the article text (positioned boxes
 * computed from the words' line rectangles) rather than the CSS Custom
 * Highlight API: WebKit leaves stale ::highlight paint behind while the
 * page scrolls, and per-word highlight ranges render as ragged, gapped
 * boxes. Colors come from --sm-narration-sentence / --sm-narration-word
 * on the article body (or any ancestor).
 */
export class NarrationHighlighter {
  private words: [string, number, number, number][]
  private ranges: (Range | null)[]
  private sentenceWords: Map<number, number[]>
  private currentWord = -2
  private currentSentence = -2
  private follow = true
  private userScrolledAt = 0
  private lastScrollAt = 0
  private detachUserScroll: (() => void) | null = null
  private reducedMotion: boolean
  private root: Element
  private layer: HTMLDivElement | null = null
  private sentenceLayer: HTMLDivElement | null = null
  private wordLayer: HTMLDivElement | null = null
  private restoreRootStyle: (() => void) | null = null
  private resizeObserver: ResizeObserver | null = null
  private onWindowResize: (() => void) | null = null

  constructor(root: Element, timings: NarrationTimings) {
    this.root = root
    this.words = rebalanceSentenceTimings(timings.words)
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
    this.sentenceWords = new Map()
    this.words.forEach((w, i) => {
      if (!this.ranges[i]) return
      const list = this.sentenceWords.get(w[3])
      if (list) list.push(i)
      else this.sentenceWords.set(w[3], [i])
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
    const onUserScroll = () => {
      this.userScrolledAt = Date.now()
    }
    const opts = { passive: true } as AddEventListenerOptions
    doc.addEventListener('wheel', onUserScroll, opts)
    doc.addEventListener('touchmove', onUserScroll, opts)
    this.detachUserScroll = () => {
      doc.removeEventListener('wheel', onUserScroll, opts)
      doc.removeEventListener('touchmove', onUserScroll, opts)
    }
  }

  /** Re-engage auto-scroll immediately (the reader pressed the toggle or sought). */
  resumeFollowing() {
    this.follow = true
    this.userScrolledAt = 0
    this.lastScrollAt = 0
    this.currentWord = -2
    this.currentSentence = -2 // force a scroll on the next update
  }

  /** Lazily creates the overlay layer behind the article text. */
  private ensureLayer(): boolean {
    if (this.layer) return true
    const root = this.root as HTMLElement
    const doc = root.ownerDocument
    if (!doc || typeof root.style === 'undefined') return false
    const view = doc.defaultView
    const computed = view?.getComputedStyle(root)
    const previous = { position: root.style.position, isolation: root.style.isolation }
    // The layer is absolutely positioned against the body and sits at
    // z-index -1 inside an isolated stacking context: above the body's own
    // background, below its text.
    if (!computed || computed.position === 'static') root.style.position = 'relative'
    root.style.isolation = 'isolate'
    this.restoreRootStyle = () => {
      root.style.position = previous.position
      root.style.isolation = previous.isolation
    }
    const make = () => {
      const el = doc.createElement('div')
      el.style.position = 'absolute'
      el.style.inset = '0'
      el.style.pointerEvents = 'none'
      return el
    }
    this.layer = make()
    this.layer.setAttribute('aria-hidden', 'true')
    this.layer.setAttribute('data-sm-narration-layer', '')
    this.layer.style.zIndex = '-1'
    this.sentenceLayer = make()
    this.wordLayer = make()
    this.layer.append(this.sentenceLayer, this.wordLayer)
    root.prepend(this.layer)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.repaint())
      this.resizeObserver.observe(root)
    }
    if (view) {
      this.onWindowResize = () => this.repaint()
      view.addEventListener('resize', this.onWindowResize, { passive: true })
    }
    return true
  }

  /** Line boxes for the given word indexes, in layer coordinates. */
  private boxesFor(wordIndexes: number[]): Box[] {
    const root = this.root as HTMLElement
    const origin = root.getBoundingClientRect()
    const rects: Box[] = []
    for (const i of wordIndexes) {
      const range = this.ranges[i]
      if (!range || typeof range.getClientRects !== 'function') continue
      for (const r of Array.from(range.getClientRects())) {
        rects.push({
          left: r.left - origin.left - root.clientLeft + root.scrollLeft,
          top: r.top - origin.top - root.clientTop + root.scrollTop,
          width: r.width,
          height: r.height,
        })
      }
    }
    return mergeLineBoxes(rects)
  }

  private paint(target: HTMLDivElement | null, boxes: Box[], kind: 'sentence' | 'word') {
    if (!target) return
    const doc = target.ownerDocument
    const color =
      kind === 'word'
        ? 'var(--sm-narration-word, rgba(36, 99, 70, 0.32))'
        : 'var(--sm-narration-sentence, rgba(36, 99, 70, 0.12))'
    const nodes = boxes.map((b) => {
      const el = doc.createElement('div')
      el.setAttribute('data-sm-narration', kind)
      el.className = kind === 'word' ? WORD_HIGHLIGHT : SENTENCE_HIGHLIGHT
      el.style.position = 'absolute'
      el.style.left = `${b.left - PAD_X}px`
      el.style.top = `${b.top - PAD_Y}px`
      el.style.width = `${b.width + PAD_X * 2}px`
      el.style.height = `${b.height + PAD_Y * 2}px`
      el.style.borderRadius = '4px'
      el.style.background = color
      return el
    })
    target.replaceChildren(...nodes)
  }

  /** Re-lays out the current highlight (after resize / reflow). */
  private repaint() {
    if (this.currentWord < 0) return
    const sentence = this.words[this.currentWord]?.[3]
    this.paint(this.sentenceLayer, this.boxesFor(this.sentenceWords.get(sentence) ?? []), 'sentence')
    this.paint(this.wordLayer, this.boxesFor([this.currentWord]), 'word')
  }

  update(timeMs: number) {
    if (!narrationHighlightSupported()) return
    const idx = wordIndexAt(this.words, timeMs)
    if (idx === this.currentWord) return
    this.currentWord = idx
    if (idx < 0) {
      this.clear()
      return
    }
    if (!this.ensureLayer()) return
    this.paint(this.wordLayer, this.ranges[idx] ? this.boxesFor([idx]) : [], 'word')

    const sentence = this.words[idx][3]
    const members = this.sentenceWords.get(sentence) ?? []
    if (sentence !== this.currentSentence) {
      this.currentSentence = sentence
      this.paint(this.sentenceLayer, this.boxesFor(members), 'sentence')
    }
    const activeRange = this.ranges[idx] ?? (members.length ? this.ranges[members[0]] : null)
    if (activeRange) this.scrollTo(activeRange)
  }

  private scrollTo(range: Range) {
    if (!this.follow) return
    const now = Date.now()
    if (now - this.userScrolledAt < USER_SCROLL_COOLDOWN_MS) return
    if (now - this.lastScrollAt < AUTO_SCROLL_THROTTLE_MS) return
    try {
      const rect = range.getBoundingClientRect()
      const viewport = window.innerHeight || 0
      if (viewport <= 0) return
      // Only scroll when the active word leaves the comfortable middle band
      // [20% vh, 75% vh], so the page glides smoothly and resumes after manual scrolls.
      if (rect.top < viewport * 0.2 || rect.bottom > viewport * 0.75) {
        this.lastScrollAt = now
        const target = Math.max(0, window.scrollY + rect.top - viewport * 0.35)
        window.scrollTo({ top: target, behavior: this.reducedMotion ? 'auto' : 'smooth' })
      }
    } catch {
      /* Scrolling is a nicety; never let it break playback. */
    }
  }

  clear() {
    this.sentenceLayer?.replaceChildren()
    this.wordLayer?.replaceChildren()
    this.currentWord = -2
    this.currentSentence = -2
  }

  destroy() {
    this.clear()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    if (this.onWindowResize) {
      this.root.ownerDocument?.defaultView?.removeEventListener('resize', this.onWindowResize)
      this.onWindowResize = null
    }
    this.layer?.remove()
    this.layer = this.sentenceLayer = this.wordLayer = null
    this.restoreRootStyle?.()
    this.restoreRootStyle = null
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
