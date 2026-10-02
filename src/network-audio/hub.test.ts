/** @vitest-environment jsdom */
import { it, expect, vi } from 'vitest'
import { mergeMemory, toMemory, validMemory } from './memory'
import { EMPTY_SNAPSHOT } from './controller'
it('merges history per story without losing newer preferences or unrelated stories', () => {
  const track = { id: 'a', publicationId: 'p', title: 'Новости 社区 🎧', articleUrl: 'https://news.example/news/a', storyId: 'canonical' }
  const record = { track, position: 20, duration: 60, ranges: [[0, 20]] as [number, number][], updatedAt: 10 }
  const base = toMemory(EMPTY_SNAPSHOT)
  const local = { ...base, rate: 1.5, settingsUpdatedAt: 20, history: [record] }
  const remote = { ...base, settingsUpdatedAt: 10, history: [{ ...record, position: 60, updatedAt: 30, completedAt: 30, ranges: [[0, 60]] as [number, number][] }] }
  const merged = mergeMemory(local, remote)
  expect(merged.rate).toBe(1.5)
  expect(merged.history).toHaveLength(1)
  expect(merged.history[0].completedAt).toBe(30)
  expect(validMemory({ ...merged, rate: 100 })).toBe(false)
  expect(validMemory({ ...merged, settingsUpdatedAt: Date.now() + 120000 })).toBe(false)
})

it('propagates a clear-history tombstone instead of restoring records from another publication', () => {
  const base = toMemory(EMPTY_SNAPSHOT)
  const track = { id: 'a', publicationId: 'p', title: 'Story', articleUrl: 'https://news.example/news/a' }
  const old = { ...base, history: [{ track, position: 60, duration: 60, ranges: [[0, 60]] as [number, number][], updatedAt: 10, completedAt: 10 }] }
  const cleared = { ...base, historyClearedAt: 20 }
  expect(mergeMemory(cleared, old).history).toEqual([])
  expect(mergeMemory(old, cleared).history).toEqual([])
})
