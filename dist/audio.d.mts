import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties } from 'react';

interface AudioPlayerSource {
    url: string | null;
    duration_ms?: number | null;
    expires_at?: string | null;
    waveform_peaks?: number[] | null;
    ai_generated?: boolean;
    /** Whether narration word timings exist for this recording. */
    has_word_timings?: boolean;
}
/**
 * Follow-along highlighting for article narration. When set (and the
 * recording has word timings), the player shows a highlight toggle —
 * off by default; the reader's choice persists per browser. Enabled,
 * the word and sentence being read are painted via the CSS Custom
 * Highlight API on the element `targetId`, and the page scrolls along
 * gently. `timingsUrl` is fetched lazily on first enable and must
 * return the timings JSON (raw or in a {timings}/{data:{timings}}
 * envelope).
 */
interface AudioPlayerNarration {
    timingsUrl: string;
    targetId: string;
}
type AudioPlayerVariant = 'waveform' | 'compact' | 'inline';
interface AudioPlayerProps {
    audio: AudioPlayerSource;
    /** Stable article/record identity, including the tenant if needed. Changing it resets playback. */
    audioKey?: string;
    variant?: AudioPlayerVariant;
    label?: string;
    className?: string;
    style?: CSSProperties;
    narration?: AudioPlayerNarration;
    /**
     * Defaults to none so a list does not download every recording.
     * A player that does not already know its length uses metadata anyway,
     * so the clock can show before play.
     */
    preload?: 'none' | 'metadata';
    /** Called at most once automatically per play attempt. Honor signal to cancel network work. */
    onRefresh?: (signal: AbortSignal) => Promise<AudioPlayerSource>;
    /**
     * @deprecated No-op. Players never show a manual Refresh control: expired
     * URLs are refreshed silently through `onRefresh`. Kept so existing callers
     * still compile.
     */
    showRefreshButton?: boolean;
    onPlaybackError?: () => void;
    /** Shared with the existing ScaleMule blog player. Set null to disable persistence. */
    playbackRateStorageKey?: string | null;
    exclusivePlayback?: boolean;
}
/** Three layouts, one playback controller. No provider, credentials, polling, or Next.js runtime imports. */
declare function AudioPlayer(props: AudioPlayerProps): react_jsx_runtime.JSX.Element | null;

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
interface NarrationTimings {
    version: number;
    duration_ms?: number;
    /** [text, start_ms, end_ms, sentence_index] */
    words: [string, number, number, number][];
}
declare const WORD_HIGHLIGHT = "sm-narration-word";
declare const SENTENCE_HIGHLIGHT = "sm-narration-sentence";
declare function narrationHighlightSupported(): boolean;
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
declare class NarrationHighlighter {
    private words;
    private ranges;
    private sentenceWords;
    private currentWord;
    private currentSentence;
    private follow;
    private detachUserScroll;
    private reducedMotion;
    private root;
    private layer;
    private sentenceLayer;
    private wordLayer;
    private restoreRootStyle;
    private resizeObserver;
    private onWindowResize;
    constructor(root: Element, timings: NarrationTimings);
    /** Fraction of narration words found in the article body. A low
     * ratio means the body diverged from the script; callers may prefer
     * to hide the toggle below ~0.5. */
    matchRatio(): number;
    private attachUserScroll;
    /** Re-engage auto-scroll (the reader pressed the toggle or sought). */
    resumeFollowing(): void;
    /** Lazily creates the overlay layer behind the article text. */
    private ensureLayer;
    /** Line boxes for the given word indexes, in layer coordinates. */
    private boxesFor;
    private paint;
    /** Re-lays out the current highlight (after resize / reflow). */
    private repaint;
    update(timeMs: number): void;
    private scrollTo;
    clear(): void;
    destroy(): void;
}
/** Parse a fetched timings payload; accepts the raw timings object or
 * common envelopes ({timings}, {data:{timings}}). */
declare function parseTimingsPayload(body: unknown): NarrationTimings | null;

export { AudioPlayer, type AudioPlayerNarration, type AudioPlayerProps, type AudioPlayerSource, type AudioPlayerVariant, NarrationHighlighter, type NarrationTimings, SENTENCE_HIGHLIGHT, WORD_HIGHLIGHT, narrationHighlightSupported, parseTimingsPayload };
