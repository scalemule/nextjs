# Changelog

## 0.1.41

- Add the standalone `@scalemule/nextjs/audio` entry and `audio.css`, with waveform, compact news, and inline list players sharing one controller.
- Distinguish played and remaining audio with a contrast track, seek handle, and explicit remaining time. Support keyboard seeking, persisted speed, optional exclusive playback, and bounded signed-URL recovery that preserves playback position.
- Keep legacy `NarrationPlayer` exports unchanged. No TTS, storage, transcoding, or entitlement API changes; these remain host/platform responsibilities.
- Regenerate existing distribution files from previously merged SDK source alongside the new audio entry.
