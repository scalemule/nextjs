# Changelog

## 0.1.46

- Fix proxy-mode session refresh signing users out. The server client's `auth.refresh` now sends `{ session_token }` in the request body, as the auth service requires, so explicit refreshes and the automatic refresh after a 401 no longer fail.
- A failed refresh now signs the user out only when the backend has rejected the session (a 401 or an invalid/expired/revoked session code). The `/api/auth/refresh` route returns `401 { success: false, error }` and clears the cookies in that case; other failures (malformed request, rate limit, outage, timeout) return an error and leave the session intact, instead of the previous `200 { success: true }` with cleared cookies. `useAuth().refreshSession()` applies the same rule in proxy and direct mode.
- Server-client errors now carry the HTTP status (`ScaleMuleApiError.status`).

## 0.1.42

- Preserve visible elapsed and remaining time when a paused player refreshes a source with preload disabled. Playback position is restored when the replacement media becomes ready.
- Add a regression test for the browser reset event before replacement metadata arrives. No new playback or platform API surface.

## 0.1.41

- Add the standalone `@scalemule/nextjs/audio` entry and `audio.css`, with waveform, compact news, and inline list players sharing one controller.
- Distinguish played and remaining audio with a contrast track, seek handle, and explicit remaining time. Support keyboard seeking, persisted speed, optional exclusive playback, and bounded signed-URL recovery that preserves playback position.
- Keep legacy `NarrationPlayer` exports unchanged. No TTS, storage, transcoding, or entitlement API changes; these remain host/platform responsibilities.
- Regenerate existing distribution files from previously merged SDK source alongside the new audio entry.
