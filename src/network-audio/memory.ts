import { validRecord, copyTrack, storyKey, type ListeningRecord, type NetworkAudioSnapshot } from './controller'

/** Deliberately contains no account IDs, credentials, media URLs or queue ownership. */
export interface ListeningMemory {
  version: 1
  rate: number
  autoplayNext: boolean
  allowRepeats: boolean
  historyClearedAt: number
  settingsUpdatedAt: number
  history: ListeningRecord[]
}
export function validMemory(value: unknown): value is ListeningMemory {
  if (!value || typeof value !== 'object') return false
  const v = value as ListeningMemory
  return v.version === 1 && Number.isFinite(v.rate) && v.rate >= 0.5 && v.rate <= 3
    && typeof v.autoplayNext === 'boolean' && typeof v.allowRepeats === 'boolean'
    && Number.isFinite(v.historyClearedAt) && v.historyClearedAt >= 0 && v.historyClearedAt <= Date.now() + 60000
    && Number.isFinite(v.settingsUpdatedAt) && v.settingsUpdatedAt >= 0 && v.settingsUpdatedAt <= Date.now() + 60000
    && Array.isArray(v.history) && v.history.length <= 500 && v.history.every(validRecord)
}
export function toMemory(snapshot: NetworkAudioSnapshot): ListeningMemory {
  return { version: 1, rate: snapshot.rate, autoplayNext: snapshot.autoplayNext !== false,
    allowRepeats: snapshot.allowRepeats === true, settingsUpdatedAt: snapshot.settingsUpdatedAt ?? 0, historyClearedAt: snapshot.historyClearedAt ?? 0,
    history: (snapshot.history ?? []).map(item => ({ ...item, track: copyTrack(item.track) })) }
}
export function mergeMemory(local: ListeningMemory, remote: ListeningMemory): ListeningMemory {
  const historyClearedAt = Math.max(local.historyClearedAt, remote.historyClearedAt)
  const records = new Map<string, ListeningRecord>()
  for (const item of [...remote.history, ...local.history]) {
    if (item.updatedAt <= historyClearedAt) continue
    const key = storyKey(item.track)
    const previous = records.get(key)
    if (!previous || item.updatedAt >= previous.updatedAt) records.set(key, item)
  }
  return { ...(remote.settingsUpdatedAt > local.settingsUpdatedAt ? remote : local),
    historyClearedAt, history: [...records.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 500) }
}
