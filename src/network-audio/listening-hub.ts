import { mergeMemory, validMemory, type ListeningMemory } from './memory'

// Loaded only by the existing consent bridge, with an explicit publication allowlist.
const script = document.currentScript as HTMLScriptElement | null
const networkId = script?.dataset.network
const origins = new Set((script?.dataset.origins ?? '').split(' ').filter(Boolean))
if (networkId && origins.size) {
  const key = `scalemule:listening-hub:${networkId}:v1`
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window.parent || !origins.has(event.origin)) return
    const data = event.data
    if (!data || data.type !== 'SM_LISTENING_SYNC' || data.networkId !== networkId || typeof data.requestId !== 'string' || data.requestId.length > 100) return
    if (data.memory !== undefined && (!validMemory(data.memory) || !data.memory.history.every((item: ListeningMemory['history'][number]) => origins.has(new URL(item.track.articleUrl).origin)))) return
    let memory: ListeningMemory | null = null
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (validMemory(stored)) memory = stored
      if (data.memory) {
        memory = memory ? mergeMemory(memory, data.memory) : data.memory
        localStorage.setItem(key, JSON.stringify(memory))
      }
    } catch { /* The first-party reader remains functional when third-party storage is blocked. */ }
    event.source?.postMessage({ type: 'SM_LISTENING_STATE', networkId, requestId: data.requestId, memory }, { targetOrigin: event.origin })
  })
}
