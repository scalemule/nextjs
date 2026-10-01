# Persistent publication listening

Mount one `NetworkAudioProvider` in the persistent publication layout, outside
article pages and route keys. Client navigation preserves its audio element.
Article navigation, Listen pages, queue links and history links should use the
site router's `Link` through `renderArticleLink`.

```tsx
<NetworkAudioProvider
  resolveAudio={resolveReaderAuthorizedAudio}
  checkpointStorageKey={`publication-listening:v1:${publicationSlug}`}
  checkpointStorage="local"
  checkpointEnabled={functionalConsent}
  onListeningEvent={handleConsentAwareMetric}
>
  {children}
  <NetworkAudioPlayer
    networkName={publicationName}
    renderArticleLink={track => <Link href={track.articleUrl}>{track.title}</Link>}
  />
</NetworkAudioProvider>
```

Import `@scalemule/nextjs/audio.css`. Define the resolver and callbacks in the
client wrapper; ordinary functions cannot cross the server/client boundary.
All new persistence props are optional. Existing `AudioPlayer` and narration
highlight APIs remain supported.

## Reader behavior

- Article controls show Listen with duration, Resume with remaining time, or
  Listen again for a finished recording. Start over is a separate action.
  Supply `NetworkAudioTrack.durationMs` when known; never estimate a recording.
- Opening another article does not change playback. Add to queue does not play
  it immediately. The finite queue advances on completion and stops at its end.
- Reloading, leaving the site, or returning with browser Back restores paused.
  Visibility changes alone do not pause background listening. Another domain
  has its own player and checkpoint; there is no cross-domain continuity promise.
- Closing pauses, saves and dismisses the bar. `ListeningLibrary` on a permanent
  `/listen` route reopens it. After a day, restore stays discreet; put
  `ListeningInvitation` on the homepage and `ListeningLibrary` on Listen.
- Resume after 30 minutes rewinds three seconds for context. Start over remains
  explicit. Per-article positions survive switching stories and clearing the queue.
- `ListeningPlaylist` previews actual story names and their total recording time.
  Play stories replaces the queue, starts at the beginning and stops at the end.
  The application chooses a bounded, dated set of real playable stories.
- Errors preserve the position. Retry requests a fresh source; automatic media
  recovery is bounded to one retry. A changed source `revision` resets to the
  beginning with an explanation and waits for another click.

The compact bar includes playback, remaining time, back ten seconds, close and
player options. Expanded controls provide seeking, speed, volume where useful,
Start over and upcoming story selection/removal. Headset and lock-screen actions
use Media Session where available; mobile OS background suspension still applies.

## Saved state and consent

Persistence is off unless `checkpointStorageKey` is provided. `checkpointStorage`
defaults to session storage; choose local storage for later visits. Delay supplying
the key until consent is known. `checkpointEnabled={false}` deletes that checkpoint,
stops future writes and leaves current in-memory playback available.

Publications can use a publication-scoped key for public stories saved on this
browser. Account-specific or protected content needs a user-scoped key and clearing
on account changes. Do not promise device synchronization. Disclose the feature in
functional storage settings and the Listen page.

State is bounded to 100 public article identities and history records. History and
inactive checkpoints expire after 30 days. Stored state contains public titles,
article links, recording revision, position, duration, rate, volume and timestamps.
Signed media URLs, tokens, article bodies and analytics identifiers are not stored.
Storage failure never prevents playback. Restoration never calls play.

`onListeningEvent` receives started, resumed, completed and error events after the
corresponding playback transition. The integration must apply its existing
analytics consent and privacy rules. Error events contain no raw error details.

## Reader-authorized audio resolution

`resolveAudio(track, signal)` must honor the abort signal and return a fresh
`AudioPlayerSource`: `url`, optional `duration_ms`, `expires_at`, and `revision`.
Use a stable recording identifier for revision, never a rotating signed URL.
The publication integration hashes the recording path and duration when its public
API does not expose a revision; replacements that reuse both cannot be detected.

Scope the reader route to the deployment's application and publication. Browser
IDs never authorize another tenant. Verify article identity after reading it through
the publication API. Return only authorized public audio using the application's
server-side `SCALEMULE_API_KEY`; never expose internal tokens. Requests time out,
and stale results cannot replace a more recently selected story.

## Styling and verification

Supply an actual creative via `advertisement` for the labeled expanded slot.
Consent and impression tracking remain the application's responsibility.
The fixed bar measures and reserves its height. Customize `--sm-player-paper`,
`--sm-player-ink`, `--sm-player-muted`, `--sm-player-line`, `--sm-player-accent`,
`--sm-player-soft` and `--sm-player-z-index`; typography inherits the site's fonts.

Automated coverage includes same-provider navigation, highlighting lifecycle,
progress, resume age, completion, queue replacement, source revision, failures,
paused restoration, dismissal, consent withdrawal and unavailable storage.
Verify real media in supported desktop and mobile browsers before deployment.

The legacy opt-in `connection` / `host` popup bridge remains available for existing
SDK consumers. Publication listening does not configure it. Do not turn the Listen
route into a second provider or key the persistent provider by pathname.
