'use client'

export { AudioPlayer } from './components/audio-player'
export type {
  AudioPlayerNarration,
  AudioPlayerProps,
  AudioPlayerSource,
  AudioPlayerVariant,
} from './components/audio-player'
// The follow-along highlight engine is exported for sites with their own
// player chrome (e.g. scalemule-web's BlogAudioPlayer): build a
// NarrationHighlighter over the article body, drive it with
// update(currentTimeMs), and honor matchRatio() before enabling.
export {
  NarrationHighlighter,
  narrationHighlightSupported,
  parseTimingsPayload,
  SENTENCE_HIGHLIGHT,
  WORD_HIGHLIGHT,
} from './components/narration-highlight'
export type { NarrationTimings } from './components/narration-highlight'

export { NetworkAudioProvider, NetworkAudioPlayer, ArticleAudioControls, useNetworkAudio,
  useArticleNarration } from './components/network-audio-player'
export type { NetworkAudioProviderProps, NetworkAudioPlayerProps, ArticleAudioControlsProps,
  NetworkAudioContextValue } from './components/network-audio-player'
export { NetworkAudioController } from './network-audio/controller'
export type { NetworkAudioTrack, NetworkAudioSnapshot, ResolveNetworkAudio } from './network-audio/controller'
export type { NetworkPlayerConnection, NetworkPlayerHostOptions, NetworkAudioCommand } from './network-audio/bridge'
