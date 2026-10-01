# Persistent article and network audio

`@scalemule/nextjs/audio` exports a shared listening queue, a bottom player bar,
article controls and a separate network player host. The audio entry uses only
React at runtime. Existing `AudioPlayer` and `NarrationPlayer` APIs are unchanged.

## Playback boundaries

| Navigation | Behavior |
| --- | --- |
| Client-side navigation under the same provider | The same audio element continues playing. |
| Leaving the narrated article | Highlighting is destroyed; audio continues. |
| Returning to that article | Highlighting resumes at the current clock if enabled. |
| Following a network link in the original reader tab to another participating domain | A previously opened network player window keeps playing. The destination bar reconnects. |
| Full navigation/reload without a network window | The old audio stops. An optional checkpoint restores the queue and position paused. |
| Closing the network window | The reader restores the latest reported queue and position paused, with a Play prompt. |
| Closing the reader tab | The network window can continue independently. |

There is no seamless same-tab, cross-origin audio transfer on the web. An iframe,
service worker, localStorage or BroadcastChannel cannot preserve a destroyed
document's audio element. The separate window is opt-in and must be opened from
a user click. Its initial play may require another click under browser autoplay
policy. Once playing, navigation of its original reader tab does not replace its
audio element. Browser/OS suspension can still interrupt media, especially on
mobile. Test supported browsers before promising uninterrupted listening.

This implementation reconnects the **original reader tab** when readers follow
links between participating sites. Direct address-bar or browser-initiated
cross-site navigation can sever the window relationship: audio continues in the
player window, but the destination bar may not reconnect. Use the player window's
controls in that case. It does not discover unrelated tabs or synchronize devices. COOP headers that
sever `window.opener`, sandbox restrictions and popup blockers can prevent the
connection. Failed initial connections preserve local playback and show a notice.
An unresponsive remote player never triggers automatic local playback, which
could produce two recordings playing together.

## Mount once in the reader layout

Create a client wrapper beneath the persistent app layout. Do not key it by
pathname, put it in a `template.tsx`, or mount it inside an article page.

```tsx
'use client'

import Link from 'next/link'
import { NetworkAudioProvider, NetworkAudioPlayer } from '@scalemule/nextjs/audio'
import '@scalemule/nextjs/audio.css'
import { resolveReaderAuthorizedAudio } from './reader-audio'

export function ListeningLayout({ children }: { children: React.ReactNode }) {
  return (
    <NetworkAudioProvider
      resolveAudio={resolveReaderAuthorizedAudio}
      connection={{
        networkId: 'bay-area-chronicle',
        playerUrl: 'https://bayareachronicle.com/listen',
      }}
    >
      {children}
      <NetworkAudioPlayer
        networkName="Bay Area Chronicle"
        renderArticleLink={track => <Link href={track.articleUrl}>{track.title}</Link>}
      />
    </NetworkAudioProvider>
  )
}
```

`reader-audio` is your application's integration, described below; the SDK does
not provide that module. Define/import the resolver in the client wrapper:
ordinary functions cannot cross from server components to client components.
The existing server layout can render this wrapper around `children`.

Use the router's `Link` for navigation within the site. The player's default
article link opens another tab to avoid unloading local audio. The dedicated
network host always opens article links separately.

## Article controls and highlighting

Replace the page-owned player with shared queue controls. Do not render both
players for the same article.

```tsx
import { ArticleAudioControls } from '@scalemule/nextjs/audio'

<ArticleAudioControls
  track={{
    id: article.id,
    publicationId,
    title: article.title,
    publicationName,
    articleUrl: `${canonical}/news/${encodeURIComponent(article.slug)}`,
  }}
  narration={article.audio?.has_word_timings ? {
    timingsUrl: `/api/narration/${encodeURIComponent(article.slug)}`,
    targetId: 'article-narration-body',
  } : undefined}
/>
```

Keep the existing article body with `id="article-narration-body"`. Mounting an
article never selects or starts its audio. Listen selects it; Add to queue
appends without interrupting playback. Identity is `(publicationId, id)` so IDs
in different publications do not collide. The queue deduplicates entries and
holds up to 100 articles. Finishing an article advances to the next one.
Unavailable audio stops with a retry/choose-another message.

`useArticleNarration(track, narration)` attaches the same behavior to custom
controls. Highlighting is opt-in, applies only to the active article, clears
while the reader document is hidden, and detaches on unmount. The preference
remains in the provider during page navigation; it is not silently stored across
sessions. Missing timings or mismatched article text disable painting without
interrupting audio.

## Resolve audio in the correct publication

`resolveAudio(track, signal)` returns an `AudioPlayerSource`. The provider calls
it when playing, when a signed URL is near expiry, or once during media recovery.
Honor the signal and return a fresh reader-authorized source:

```ts
type ResolveNetworkAudio = (
  track: NetworkAudioTrack,
  signal: AbortSignal,
) => Promise<{
  url: string | null
  duration_ms?: number | null
  expires_at?: string | null
}>
```

Connect this callback to the application's existing public article-read API.
Include publication identity and verify it server-side against the application's
permitted publications. A browser-supplied publication ID is not authorization.
All database/API access must retain the existing application/tenant boundary.

For different customer applications, resolve through each publication's reader
API using that application's server-side `SCALEMULE_API_KEY`. Allow only configured
publication origins and construct a known reader route; never proxy arbitrary
browser-provided URLs. Cross-origin public reader routes must allow the network
host's exact origin via CORS. Protected articles need an authorized integration;
do not depend on third-party cookies. Return only authorized media, never internal
platform tokens. The SDK does not invent an API endpoint or generate narration.

Signed URLs are resolved again as needed and never enter queue checkpoints or
cross-window messages. Those contain only publication/article IDs, public
titles/links and playback state. Requests time out after 15 seconds; stale
responses cannot replace a newer article. Media recovery is bounded to one retry
per play attempt. Autoplay denial presents a Play prompt.

## Host `/listen` on the network site

This route is an application integration requirement: the SDK does not create or
deploy routes. Mount a **host provider instead of the reader provider** here.
Do not nest a host inside an already mounted reader provider. Use separate layout
groups, or switch the root provider's mode for the dedicated player route.

```tsx
<NetworkAudioProvider
  resolveAudio={resolveReaderAuthorizedNetworkAudio}
  host={{
    networkId: 'bay-area-chronicle',
    allowedOrigins: [
      'https://bayareachronicle.com',
      'https://walnutcreektimes.com',
      'https://lamorindapost.com',
    ],
  }}
>
  <h1>Your listening queue</h1>
  <p>Keep this window open while you browse the network.</p>
  <NetworkAudioPlayer fixed={false} networkName="Bay Area Chronicle" />
</NetworkAudioProvider>
```

Add every participating reader origin explicitly, including `www` only if it
actually serves reader pages. The host checks exact origin, opener identity,
network namespace, payload schema and article URL origin. The reader checks the
host origin and pins its window reference. No wildcard `postMessage` targets
are used. Every reader site needs the provider and connection configuration;
the host allowlist alone does not install a player on those sites.

## Ads, customization and saved progress

Pass an actual creative or ad component through `advertisement`. The expanded
slot is labeled “Advertisement”; no advertiser or impression is invented. Ad
selection, reader consent and impression tracking stay in the host's existing
ad integration. This is a visual slot, not audio ad insertion.

The bar measures its height and reserves bottom space. It supports narrow
screens, keyboard controls, volume, speed, seek, skipping forward/backward,
queue selection/removal and clearing the queue. Media Session play/pause/seek is
registered where supported. Customize `--sm-player-paper`, `--sm-player-ink`,
`--sm-player-muted`, `--sm-player-line`, `--sm-player-accent`, `--sm-player-soft`,
and `--sm-player-z-index`. Typography inherits `--font-editorial` and
`--font-inter`. Supply an appropriate palette for dark themes.

Persistence is off by default. Where reader preferences permit it, set
`checkpointStorageKey` to an application/network **and user-scoped** key.
Session storage retains a bounded metadata-only queue and position in that tab.
It restores paused. Clear/change the key on account changes. This is not an
account playlist or a podcast RSS feed: it provides continuous article listening
within the browser session.

## Verify before a network release

The automated suite covers article unmounts, highlighting cleanup/return, queue
advancement, publication identity, stale/aborted requests, signed URL refresh,
autoplay denial, bounded recovery, blocked popups, exact origin/source checks,
remote reconnect and host closure. Also test real media in supported browsers:
start in the reader, open the network window, follow an actual network link in
the original tab to another allowed origin, control playback from the destination,
and close the host. Browser automation that changes the address directly does not
exercise the same window relationship as clicking a site link.
Verify ad consent and publication authorization in the actual applications.
Release the SDK, integrate layouts/routes/resolvers in the participating sites,
then deploy through their existing release process. These SDK changes alone do
not change live publications.

Browser references: [window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open),
[postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage),
[BroadcastChannel/storage partitioning](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API),
[autoplay policy](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
