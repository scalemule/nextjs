import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties, ReactNode } from 'react';

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

/** Article identity is publication-scoped. Media URLs never enter queue checkpoints/messages. */
interface NetworkAudioTrack {
    id: string;
    publicationId: string;
    title: string;
    publicationName?: string;
    articleUrl: string;
    /** Stable canonical story URL/ID shared by syndicated editions. */
    storyId?: string;
    /** An editorial revision, never a routine database updated_at value. */
    revision?: string;
    durationSeconds?: number;
    section?: string;
    publishedAt?: string;
    automatic?: boolean;
}
interface ListeningRecord {
    track: NetworkAudioTrack;
    position: number;
    duration: number;
    ranges: [number, number][];
    updatedAt: number;
    completedAt?: number;
    skippedAt?: number;
}
interface NetworkAudioSnapshot {
    queue: readonly NetworkAudioTrack[];
    index: number;
    position: number;
    duration: number;
    rate: number;
    volume: number;
    status: 'idle' | 'loading' | 'playing' | 'paused' | 'error';
    error: string | null;
    history?: readonly ListeningRecord[];
    autoplayNext?: boolean;
    allowRepeats?: boolean;
    hidden?: boolean;
    historyClearedAt?: number;
    settingsUpdatedAt?: number;
    sessionMinutes?: number;
}
type ResolveNetworkAudio = (track: NetworkAudioTrack, signal: AbortSignal) => Promise<AudioPlayerSource>;
/** One audio element per persistent layout. Safe to construct during SSR; attach on mount. */
declare class NetworkAudioController {
    private resolve;
    private snapshot;
    private listeners;
    private audio;
    private cleanup;
    private request;
    private generation;
    private intent;
    private source;
    private refreshed;
    private resumePosition;
    mergeListeningMemory(memory: {
        rate: number;
        autoplayNext: boolean;
        allowRepeats: boolean;
        settingsUpdatedAt: number;
        historyClearedAt: number;
        history: ListeningRecord[];
    }): void;
    private candidates;
    constructor(resolve: ResolveNetworkAudio);
    setResolver(resolve: ResolveNetworkAudio): void;
    getSnapshot: () => NetworkAudioSnapshot;
    subscribe: (listener: () => void) => () => void;
    private patch;
    attach(audio: HTMLAudioElement): void;
    detach(): void;
    enqueue(track: NetworkAudioTrack): number;
    playTrack(track: NetworkAudioTrack): void;
    select(index: number): void;
    remove(index: number): void;
    private cancel;
    pause(): void;
    clear(): void;
    close(): void;
    setAutoplay(value: boolean): void;
    setRepeats(value: boolean): void;
    forgetHistory(): void;
    restart(): void;
    skip(): void;
    private remember;
    private finish;
    setRecommendations(tracks: NetworkAudioTrack[]): void;
    /** Manual selections retain their order; recommendations are bounded and never replace them. */
    catchUp(minutes?: number): void;
    seek(position: number): void;
    setRate(rate: number): void;
    setVolume(volume: number): void;
    restore(snapshot: NetworkAudioSnapshot): void;
    play(): Promise<void>;
    private load;
    private start;
    private recover;
    private fail;
}

type NetworkAudioCommand = {
    action: 'play' | 'pause' | 'clear' | 'close' | 'skip' | 'restart' | 'forgetHistory';
} | {
    action: 'autoplay' | 'repeats';
    value: boolean;
} | {
    action: 'catchUp';
    value: number;
} | {
    action: 'select' | 'remove' | 'seek' | 'rate' | 'volume';
    value: number;
} | {
    action: 'enqueue' | 'playTrack';
    track: NetworkAudioTrack;
};
interface NetworkPlayerConnection {
    /** Fully qualified, dedicated player route; never the article route. */
    playerUrl: string;
    /** Same namespace on all participating publications. */
    networkId: string;
}
interface NetworkPlayerHostOptions {
    networkId: string;
    /** Exact trusted reader origins; never '*'. Also bounds incoming article URLs. */
    allowedOrigins: readonly string[];
}

interface ListeningPersistence {
    /** Network and reader scope. Change this on account changes. */
    storageKey: string;
    networkId: string;
    hubUrl?: string;
    allowedOrigins: readonly string[];
}

interface NetworkAudioProviderProps {
    children: ReactNode;
    /** Resolve through your reader-authorized server route, including publication identity. */
    resolveAudio: ResolveNetworkAudio;
    /** Reader pages: enables the opt-in separate player window and remote bottom bar. */
    connection?: NetworkPlayerConnection;
    /** Dedicated player route: allows only these reader origins to control its audio. */
    host?: NetworkPlayerHostOptions;
    /** Optional sessionStorage checkpoint. Scope by application/network and user; honor consent. Restores paused. */
    checkpointStorageKey?: string;
    persistence?: ListeningPersistence;
    loadRecommendations?: (signal: AbortSignal) => Promise<NetworkAudioTrack[]>;
}
interface NetworkAudioContextValue {
    snapshot: NetworkAudioSnapshot;
    remote: boolean;
    hosted: boolean;
    notice: string | null;
    command: (command: NetworkAudioCommand) => void;
    openNetworkPlayer?: () => void;
    highlightAvailable: boolean;
    highlightEnabled: boolean;
    setHighlightEnabled: (enabled: boolean) => void;
    catchUp?: (minutes: number) => Promise<void>;
    recommendationsLoading: boolean;
}
/** Mount once in a persistent root layout, outside route keys/templates. */
declare function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, persistence, loadRecommendations }: NetworkAudioProviderProps): react_jsx_runtime.JSX.Element;
declare function useNetworkAudio(): NetworkAudioContextValue;
/** Attach in the article component. Unmount/hidden tab clears only highlighting, never playback. */
declare function useArticleNarration(track: NetworkAudioTrack, narration?: AudioPlayerNarration): {
    highlightAvailable: boolean;
    highlightEnabled: boolean;
    setHighlightEnabled: (enabled: boolean) => void;
    matching: boolean;
};
interface ArticleAudioControlsProps {
    track: NetworkAudioTrack;
    narration?: AudioPlayerNarration;
    /** Recording length shown before playback; resolved media supplies the live duration. */
    durationMs?: number | null;
    className?: string;
}
declare function ArticleAudioControls({ track, narration, durationMs, className }: ArticleAudioControlsProps): react_jsx_runtime.JSX.Element;
interface NetworkAudioPlayerProps {
    networkName?: string;
    /** Render an actual ad or sponsor creative here. The expanded slot is labeled Advertisement. */
    advertisement?: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** Use false on the dedicated player page; readers default to a fixed bottom bar with a measured spacer. */
    fixed?: boolean;
    /** Supply your router's Link for same-site navigation. The host always opens articles separately. */
    renderArticleLink?: (track: NetworkAudioTrack) => ReactNode;
}
declare function NetworkAudioPlayer({ networkName, advertisement, className, style, fixed, renderArticleLink }: NetworkAudioPlayerProps): react_jsx_runtime.JSX.Element | null;
/** Shared, compact library: available even when the player is hidden or the queue is empty. */
declare function ListeningLibrary({ open }: {
    open?: boolean;
}): react_jsx_runtime.JSX.Element;

export { ArticleAudioControls, type ArticleAudioControlsProps, AudioPlayer, type AudioPlayerNarration, type AudioPlayerProps, type AudioPlayerSource, type AudioPlayerVariant, ListeningLibrary, type ListeningPersistence, NarrationHighlighter, type NarrationTimings, type NetworkAudioCommand, type NetworkAudioContextValue, NetworkAudioController, NetworkAudioPlayer, type NetworkAudioPlayerProps, NetworkAudioProvider, type NetworkAudioProviderProps, type NetworkAudioSnapshot, type NetworkAudioTrack, type NetworkPlayerConnection, type NetworkPlayerHostOptions, type ResolveNetworkAudio, SENTENCE_HIGHLIGHT, WORD_HIGHLIGHT, narrationHighlightSupported, parseTimingsPayload, useArticleNarration, useNetworkAudio };
