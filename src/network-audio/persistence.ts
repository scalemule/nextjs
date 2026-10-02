import { NetworkAudioController, validSnapshot } from './controller'
import { mergeMemory, toMemory, validMemory, type ListeningMemory } from './memory'

export interface ListeningPersistence {
  /** Network and reader scope. Change this on account changes. */
  storageKey: string
  networkId: string
  hubUrl?: string
  allowedOrigins: readonly string[]
}
export function persistListening(controller: NetworkAudioController, options: ListeningPersistence) {
  const allowed = new Set(options.allowedOrigins)
  let ready = false
  let iframe: HTMLIFrameElement | null = null
  let lastWrite = 0
  let lastHubWrite = 0
  let request = 0
  const hubOrigin = options.hubUrl ? new URL(options.hubUrl).origin : null
  try {
    const saved = JSON.parse(localStorage.getItem(options.storageKey) ?? 'null')
    if (validSnapshot(saved) && saved.queue.every(item => allowed.has(new URL(item.articleUrl).origin))) controller.restore(saved)
  } catch { /* Memory-only playback still works with denied/full storage. */ }
  // Link handoff carries only a non-identifying playback preference. Never history or tokens.
  const url = new URL(window.location.href)
  const rate = Number(url.searchParams.get('sm_audio_rate'))
  if (url.searchParams.has('sm_audio_rate')) {
    if (rate >= 0.5 && rate <= 3) controller.setRate(rate)
    url.searchParams.delete('sm_audio_rate')
    window.history.replaceState(window.history.state, '', url)
  }
  const sync = () => {
    if (!ready || !iframe?.contentWindow || !hubOrigin) return
    iframe.contentWindow.postMessage({ type: 'SM_LISTENING_SYNC', networkId: options.networkId,
      requestId: String(++request), memory: toMemory(controller.getSnapshot()) }, hubOrigin)
  }
  const save = () => {
    try { localStorage.setItem(options.storageKey, JSON.stringify(controller.getSnapshot())) }
    catch { /* A quota error must not stop playback. */ }
  }
  let previousQueue = controller.getSnapshot().queue
  let previousCompleted = controller.getSnapshot().history?.[0]?.completedAt
  let previousHidden = controller.getSnapshot().hidden
  let previousClear = controller.getSnapshot().historyClearedAt
  let previousSettings = controller.getSnapshot().settingsUpdatedAt
  const unsubscribe = controller.subscribe(() => {
    const changed = previousSettings !== controller.getSnapshot().settingsUpdatedAt || previousClear !== controller.getSnapshot().historyClearedAt
    const urgent = changed || previousQueue !== controller.getSnapshot().queue || previousCompleted !== controller.getSnapshot().history?.[0]?.completedAt || previousHidden !== controller.getSnapshot().hidden
    previousQueue = controller.getSnapshot().queue
    previousCompleted = controller.getSnapshot().history?.[0]?.completedAt
    previousHidden = controller.getSnapshot().hidden
    previousClear = controller.getSnapshot().historyClearedAt
    previousSettings = controller.getSnapshot().settingsUpdatedAt
    if (urgent || Date.now() - lastWrite > 1000) { lastWrite = Date.now(); save() }
    if (urgent || Date.now() - lastHubWrite > 5000) { lastHubWrite = Date.now(); sync() }
  })
  const receive = (event: MessageEvent) => {
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== hubOrigin) return
    const data = event.data
    if (data?.type !== 'SM_LISTENING_STATE' || data.networkId !== options.networkId || data.requestId !== String(request) || !validMemory(data.memory)) return
    if (!data.memory.history.every((item: ListeningMemory['history'][number]) => allowed.has(new URL(item.track.articleUrl).origin))) return
    controller.mergeListeningMemory(mergeMemory(toMemory(controller.getSnapshot()), data.memory))
  }
  window.addEventListener('message', receive)
  if (options.hubUrl && hubOrigin && allowed.has(hubOrigin)) {
    iframe = document.createElement('iframe')
    iframe.src = options.hubUrl
    iframe.hidden = true
    iframe.title = 'Shared listening preferences'
    iframe.setAttribute('aria-hidden', 'true')
    iframe.onload = () => { ready = true; sync() }
    document.body.appendChild(iframe)
  }
  const decorate = (event: Event) => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
    if (!(anchor instanceof HTMLAnchorElement)) return
    try {
      const target = new URL(anchor.href)
      if (!allowed.has(target.origin) || target.origin === window.location.origin) return
      target.searchParams.set('sm_audio_rate', String(controller.getSnapshot().rate))
      anchor.href = target.toString()
    } catch { /* Non-URL links have no listening handoff. */ }
  }
  const flush = () => { save(); sync() }
  document.addEventListener('click', decorate, true)
  document.addEventListener('auxclick', decorate, true)
  window.addEventListener('pagehide', flush)
  return () => {
    save(); unsubscribe(); iframe?.remove()
    document.removeEventListener('click', decorate, true); document.removeEventListener('auxclick', decorate, true)
    window.removeEventListener('pagehide', flush); window.removeEventListener('message', receive)
  }
}
