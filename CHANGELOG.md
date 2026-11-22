# Changelog

## 0.1.73

- **Security: push and notification routes no longer proxy arbitrary gateway paths.** `createPushRoutes` and `createNotificationRoutes` joined the catch-all segments into the upstream URL without validation and always attached the secret key. Next decodes `%2F` inside a segment, so a request such as `GET /api/push/..%2F..%2Fauth%2Fme` reached any gateway path, with any method, as the app's server. Every app that mounts either factory must upgrade.
  - Both factories now allow-list exact operations and build the upstream path from the validated route only. Push: `GET settings/me`, `POST register`, `DELETE tokens/by-id/{id}` (anonymous allowed), `PUT|DELETE tokens/by-id/{id}/user`, `PUT tokens/by-id/{id}/notifications`, `GET|PUT preferences` (session required). Notifications: list (`GET`, query limited to `unread_only`, `kind`, `since`, `limit`, `cursor`), `GET unread-count`, `PATCH {id}/read`, `PATCH read-all`, `DELETE {id}`, all session required. Ids must be UUIDs. Every other path is a 404 and is never forwarded. Segments that are empty, `.`, `..`, or contain `/`, `\`, `%`, `?`, `#` or control characters are refused.
  - The secret key is sent only together with the signed-in user's session (the gateway rejects an invalid session). Signed-out push sign-up uses the publishable key: pass `publishableKey` or set `NEXT_PUBLIC_SCALEMULE_PUBLISHABLE_KEY` (`sm_pb_…`). Without one, signed-out push requests get 401. Sending, broadcasts, topics, campaigns, routing and push settings writes are no longer reachable through the browser route; call them from your own server code.
  - Writes must be same-origin (`Sec-Fetch-Site`, else `Origin` must match `Host`) in addition to the double-submit CSRF token. `validateCSRFToken` now also reads the cookie from a plain Fetch `Request`. The routes no longer forward the caller's `x-sm-workspace-id`, use `redirect: 'manual'`, cap bodies (push 64 KB, notifications 16 KB) and set `Cache-Control: no-store`.
- **Server client ids are encoded.** `storage.get/delete` and `webhooks.delete/update` validate and `encodeURIComponent` the id, and every server-client request refuses a path with a dot segment (`.`, `..`, `%2e` forms) or a backslash before it is sent. New helpers in `server/path-safety.ts` (`isSafePathSegment`, `encodePathSegment`, `hasUnsafePathSyntax`).

## 0.1.72

- **Current internal ScaleMule packages.** `@scalemule/sdk` ^0.0.83 (was ^0.0.77, which under 0.0.x caret rules meant exactly 0.0.77), `@scalemule/money` ^0.0.4 (was ^0.0.2), `@scalemule/ledvery` ^0.0.2 (was ^0.0.1). Apps on 0.1.71 were still getting SDK 0.0.77 inside this package even when they installed the newest `@scalemule/sdk` themselves. No API changes.

## 0.1.68

- **Live narration media clock & clause-local timing rebalancing.** `NetworkAudioController.getPosition()` exposes the live `HTMLAudioElement.currentTime` directly to `useArticleNarration`'s animation-frame loop during local playback, eliminating `timeupdate`/React-commit latency and cross-domain listening-memory sync resets. `NarrationHighlighter` automatically rebalances legacy linear sentence timings (carving out clause-end comma/dash pauses and discounting unstressed function words) while preserving waveform-aligned sentences that already carry explicit pause gaps. Adopting the patch in each publication remains a separate rollout step.

## 0.1.67

- **Use this instead of 0.1.66.** 0.1.66 on npm was published from a branch that predates 0.1.65's changes. It has the narration fix (#87), but it is **missing `invitation_token` forwarding on register (0.1.65)** and `verifyEmail(token, email?)` (#89). 0.1.67 is built from `main` and includes all three.

## 0.1.66

- **Code verification is bound to the address.** `verifyEmail(token, email?)` (hook, server client and the `/api/auth/verify-email` proxy route) forwards the address a 6-digit code was sent to. ScaleMule then matches the code only against that account. Code-only verification still works, but now has a tight per-app attempt budget. Pass the email whenever you show a code-entry form.

## 0.1.66

- **Follow-along narration alignment & courtesy auto-scroll.** `alignWords` now uses 2-word anchor resynchronization so multi-word captions, subheadings, or inline edits cannot derail highlighting on common stop-words. `NarrationHighlighter` evaluates viewport comfort-band scrolling (`[20% vh, 75% vh]`) on every active word change and replaces the permanent manual-scroll kill-switch with a 1200ms courtesy cooldown so auto-scrolling automatically resumes after the reader stops scrolling.

## 0.1.65

- **Invitation-aware sign-up.** `register({ ..., invitation_token })` (and the `/api/auth/register` proxy route) forwards the token from an account invitation link. When ScaleMule challenges a sign-up, for example from a browser it has never seen, a pending invitation addressed to that email lets the registration through. Invitations never lift a hard block, and the invitation is still accepted separately after sign-in. Requires scalemule-auth with invitation-aware registration; older auth ignores the field.

## 0.1.63

- **Experiments (A/B tests) on flag variants.** `useExperiment(flagKey)` assigns the visitor (sticky on the anonymous id), registers the assignment on the provider, and tracks one `experiment_exposed` per session; `useAnalytics` then attaches `properties.experiments = { flag_key: variant }` to every event, so the analytics experiment report (admin Flags page) attributes engagement, scroll depth, clicks and any goal event to the variant. Server side: `createServerClient().flags.experiment(flagKey, { session_id })` and `analytics.trackExposure(flagKey, variant)`; pass server-made assignments to `<ScaleMuleProvider initialExperiments>`. Requires `@scalemule/sdk` 0.0.77.

## 0.1.59

- Fix proxy-mode session refresh signing users out. The server client's `auth.refresh` now sends `{ session_token }` in the request body, as the auth service requires, so explicit refreshes and the automatic refresh after a 401 no longer fail.
- A failed refresh now signs the user out only when the backend has rejected the session (a 401 or an invalid/expired/revoked session code). The `/api/auth/refresh` route returns `401 { success: false, error }` and clears the cookies in that case; other failures (malformed request, rate limit, outage, timeout) return an error and leave the session intact, instead of clearing the cookies on every failure. `useAuth().refreshSession()` applies the same rule in proxy and direct mode.
- Server-client errors now carry the HTTP status (`ScaleMuleApiError.status`).

## 0.1.52

- Preserve manual proxy MFA session completion and keep code entry available during resend rate limits.

- Strip authentication secrets from automatic analytics URLs, landing pages, and forwarded referrers while preserving advertising attribution parameters.

## 0.1.51

- Complete adaptive email challenges and enrolled MFA in the shared provider, including verification, retry, resend, cancellation, and recovery links. HTTP 202 challenges never create session cookies or enter error telemetry.
- Clear revoked cookies and client state after password recovery; remove the spent reset token from the URL.
- Apps still configure their own public auth URL and verified sender domain. Enforced MFA enrollment and third-party identity-provider recovery remain separate flows.

## 0.1.50

- Preserve the listening queue when a slow network-player window connects after the initial connection notice. The reader keeps playing while waiting and transfers its current queue and position once the host is ready.

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
