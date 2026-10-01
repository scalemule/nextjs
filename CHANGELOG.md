# Changelog

## 0.1.49

- Add `NetworkAudioProvider`, `NetworkAudioPlayer`, `ArticleAudioControls` and a headless controller to the audio entry. A layout-owned audio element keeps playing across article navigation, with a bounded queue, playback controls, an expandable advertisement slot and visible-article highlighting.
- Add an opt-in network player window with exact-origin messaging so the original reader tab can navigate between participating publications while audio stays in the open player. Popup/autoplay restrictions show actionable notices; remote closure restores paused progress.
- Include integration instructions for publication-scoped media resolution, the dedicated player route and optional session checkpoints. Publishing the SDK and adopting it in each site are separate release steps. Account playlists, unrelated-tab discovery, podcast feeds and audio ad insertion remain outside this change.

## 0.1.42

- Preserve visible elapsed and remaining time when a paused player refreshes a source with preload disabled. Playback position is restored when the replacement media becomes ready.
- Add a regression test for the browser reset event before replacement metadata arrives. No new playback or platform API surface.

## 0.1.41

- Add the standalone `@scalemule/nextjs/audio` entry and `audio.css`, with waveform, compact news, and inline list players sharing one controller.
- Distinguish played and remaining audio with a contrast track, seek handle, and explicit remaining time. Support keyboard seeking, persisted speed, optional exclusive playback, and bounded signed-URL recovery that preserves playback position.
- Keep legacy `NarrationPlayer` exports unchanged. No TTS, storage, transcoding, or entitlement API changes; these remain host/platform responsibilities.
- Regenerate existing distribution files from previously merged SDK source alongside the new audio entry.
