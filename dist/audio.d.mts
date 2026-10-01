import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties, ReactNode } from 'react';

interface AudioPlayerSource {
    url: string | null;
    /** Stable recording identity. Must not contain signed URLs or credentials. */
    revision?: string | null;
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
    durationMs?: number;
}
interface ListeningProgress {
    track: NetworkAudioTrack;
    position: number;
    duration: number;
    updatedAt: number;
    completed: boolean;
    revision?: string;
}
interface ListeningEvent {
    type: 'started' | 'resumed' | 'completed' | 'error';
    position: number;
    track: NetworkAudioTrack;
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
    history?: readonly ListeningProgress[];
    dismissed?: boolean;
    lastPlayedAt?: number;
    notice?: string | null;
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
    private eventListeners;
    private pendingEvent;
    constructor(resolve: ResolveNetworkAudio);
    setResolver(resolve: ResolveNetworkAudio): void;
    getSnapshot: () => NetworkAudioSnapshot;
    subscribe: (listener: () => void) => () => void;
    subscribeEvents: (listener: (event: ListeningEvent) => void) => () => void;
    private emit;
    private progress;
    private remember;
    /** Capture the live clock before pagehide or a synchronous user navigation. */
    checkpoint(): NetworkAudioSnapshot;
    dismiss(): void;
    show(): void;
    forgetHistory(): void;
    private patch;
    attach(audio: HTMLAudioElement): void;
    detach(): void;
    enqueue(track: NetworkAudioTrack): number;
    playTrack(track: NetworkAudioTrack): void;
    select(index: number, fromBeginning?: boolean): void;
    remove(index: number): void;
    private cancel;
    pause(): void;
    clear(): void;
    restart(track?: NetworkAudioTrack): void;
    playQueue(tracks: readonly NetworkAudioTrack[]): void;
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
    action: 'play' | 'pause' | 'clear' | 'restart' | 'dismiss' | 'show';
} | {
    action: 'select' | 'remove' | 'seek' | 'rate' | 'volume';
    value: number;
} | {
    action: 'enqueue' | 'playTrack';
    track: NetworkAudioTrack;
} | {
    action: 'restartTrack';
    track: NetworkAudioTrack;
} | {
    action: 'playQueue';
    tracks: NetworkAudioTrack[];
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
    /** Use local storage for return visits; never required for current-session playback. */
    checkpointStorage?: 'session' | 'local';
    onListeningEvent?: (event: ListeningEvent) => void;
    /** Disable persistence and delete the checkpoint when functional consent is withdrawn. */
    checkpointEnabled?: boolean;
}
interface NetworkAudioContextValue {
    snapshot: NetworkAudioSnapshot;
    remote: boolean;
    hosted: boolean;
    notice: string | null;
    command: (command: NetworkAudioCommand) => void;
    openNetworkPlayer?: () => void;
    highlightEnabled: boolean;
    setHighlightEnabled: (enabled: boolean) => void;
    expanded: boolean;
    setExpanded: (expanded: boolean) => void;
    openPlayer: () => void;
}
/** Mount once in a persistent root layout, outside route keys/templates. */
declare function NetworkAudioProvider({ children, resolveAudio, connection, host, checkpointStorageKey, checkpointStorage, checkpointEnabled, onListeningEvent }: NetworkAudioProviderProps): react_jsx_runtime.JSX.Element;
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
    className?: string;
}
declare function ArticleAudioControls({ track, narration, className }: ArticleAudioControlsProps): react_jsx_runtime.JSX.Element;
/** A quiet invitation on the front page; never starts audio on mount. */
declare function ListeningInvitation(): react_jsx_runtime.JSX.Element | null;
/** A finite, explicit playlist. Replacing the queue happens only on Play stories. */
declare function ListeningPlaylist({ tracks, title, renderArticleLink }: {
    tracks: NetworkAudioTrack[];
    title?: string;
    renderArticleLink?: (track: NetworkAudioTrack) => ReactNode;
}): react_jsx_runtime.JSX.Element | null;
/** Available from the permanent Listen navigation entry, including after closing the bar. */
declare function ListeningLibrary({ renderArticleLink }?: {
    renderArticleLink?: (track: NetworkAudioTrack) => ReactNode;
}): react_jsx_runtime.JSX.Element;
interface NetworkAudioPlayerProps {
    networkName?: string;
    /** Render an actual ad or sponsor creative here. The expanded slot is labeled Advertisement. */
    advertisement?: ReactNode;
    className?: string;
    style?: CSSProperties;
    fixed?: boolean;
    renderArticleLink?: (track: NetworkAudioTrack) => ReactNode;
}
declare function NetworkAudioPlayer({ networkName, advertisement, className, style, fixed, renderArticleLink }: NetworkAudioPlayerProps): react_jsx_runtime.JSX.Element | null;

export { ArticleAudioControls, type ArticleAudioControlsProps, AudioPlayer, type AudioPlayerNarration, type AudioPlayerProps, type AudioPlayerSource, type AudioPlayerVariant, type ListeningEvent, ListeningInvitation, ListeningLibrary, ListeningPlaylist, type ListeningProgress, NarrationHighlighter, type NarrationTimings, type NetworkAudioCommand, type NetworkAudioContextValue, NetworkAudioController, NetworkAudioPlayer, type NetworkAudioPlayerProps, NetworkAudioProvider, type NetworkAudioProviderProps, type NetworkAudioSnapshot, type NetworkAudioTrack, type NetworkPlayerConnection, type NetworkPlayerHostOptions, type ResolveNetworkAudio, SENTENCE_HIGHLIGHT, WORD_HIGHLIGHT, narrationHighlightSupported, parseTimingsPayload, useArticleNarration, useNetworkAudio };
