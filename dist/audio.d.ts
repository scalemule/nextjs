import * as react_jsx_runtime from 'react/jsx-runtime';
import { CSSProperties } from 'react';

interface AudioPlayerSource {
    url: string | null;
    duration_ms?: number | null;
    expires_at?: string | null;
    waveform_peaks?: number[] | null;
    ai_generated?: boolean;
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
    /** Defaults to none: lists do not download every recording on page load. */
    preload?: 'none' | 'metadata';
    /** Called at most once automatically per play attempt. Honor signal to cancel network work. */
    onRefresh?: (signal: AbortSignal) => Promise<AudioPlayerSource>;
    showRefreshButton?: boolean;
    onPlaybackError?: () => void;
    /** Shared with the existing ScaleMule blog player. Set null to disable persistence. */
    playbackRateStorageKey?: string | null;
    exclusivePlayback?: boolean;
}
/** Three layouts, one playback controller. No provider, credentials, polling, or Next.js runtime imports. */
declare function AudioPlayer(props: AudioPlayerProps): react_jsx_runtime.JSX.Element | null;

export { AudioPlayer, type AudioPlayerProps, type AudioPlayerSource, type AudioPlayerVariant };
