/** @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  shouldDedup,
  dedupKey,
  _resetDedupMap,
  _eventLastFired,
  DEDUP_MAP_MAX,
} from './event-dedup'

beforeEach(() => {
  _resetDedupMap()
})

// ---------------------------------------------------------------------------
// dedupKey
// ---------------------------------------------------------------------------
describe('dedupKey', () => {
  it('returns event name alone when no properties', () => {
    expect(dedupKey('click')).toBe('click')
  })

  it('returns event name alone when properties is empty object', () => {
    expect(dedupKey('click', {})).toBe('click')
  })

  it('includes primitive property values in full', () => {
    const key = dedupKey('click', { cta_location: 'sticky_mobile' })
    expect(key).toBe('click|cta_location=sticky_mobile')
  })

  it('does not truncate long strings', () => {
    const longUrl = 'https://www.example.com/' + 'a'.repeat(200)
    const key = dedupKey('page_view', { page_url: longUrl })
    expect(key).toContain(longUrl)
  })

  it('distinguishes URLs that share a long prefix', () => {
    const base = 'https://www.example.com/path/' + 'x'.repeat(100)
    const urlA = base + '?tab=overview'
    const urlB = base + '?tab=settings'
    expect(dedupKey('page_view', { page_url: urlA }))
      .not.toBe(dedupKey('page_view', { page_url: urlB }))
  })

  it('collapses nested objects to [obj]', () => {
    const key = dedupKey('click', { data: { nested: true } })
    expect(key).toBe('click|data=[obj]')
  })

  it('collapses arrays to [obj]', () => {
    const key = dedupKey('click', { ids: [1, 2, 3] })
    expect(key).toBe('click|ids=[obj]')
  })

  it('handles null and undefined values', () => {
    const key = dedupKey('click', { a: null, b: undefined })
    expect(key).toBe('click|a=|b=')
  })

  it('handles numeric and boolean values', () => {
    const key = dedupKey('click', { count: 42, active: true })
    expect(key).toBe('click|count=42|active=true')
  })

  it('includes multiple properties', () => {
    const key = dedupKey('cta_clicked', {
      cta_location: 'hero',
      page_url: 'https://example.com',
    })
    expect(key).toBe('cta_clicked|cta_location=hero|page_url=https://example.com')
  })
})

// ---------------------------------------------------------------------------
// shouldDedup — basic behaviour
// ---------------------------------------------------------------------------
describe('shouldDedup', () => {
  it('allows the first event through', () => {
    expect(shouldDedup('click', 300)).toBe(false)
  })

  it('dedupes same event_name + same properties within cooldown', () => {
    const props = { cta_location: 'upload_zone' }
    expect(shouldDedup('cta_clicked', 300, props)).toBe(false) // first: allowed
    expect(shouldDedup('cta_clicked', 300, props)).toBe(true)  // immediate repeat: deduped
  })

  it('allows same event_name with different primitive properties', () => {
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'sticky_mobile' })).toBe(false)
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'upload_zone' })).toBe(false)
  })

  it('allows same event_name after cooldown expires', async () => {
    const props = { id: 'test' }
    expect(shouldDedup('click', 50, props)).toBe(false)
    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 60))
    expect(shouldDedup('click', 50, props)).toBe(false)
  })

  it('dedupes events with no properties', () => {
    expect(shouldDedup('page_view', 300)).toBe(false)
    expect(shouldDedup('page_view', 300)).toBe(true)
  })

  it('allows different event names even with same properties', () => {
    const props = { source: 'header' }
    expect(shouldDedup('click', 300, props)).toBe(false)
    expect(shouldDedup('hover', 300, props)).toBe(false)
  })

  it('allows page_view events with different URLs', () => {
    expect(shouldDedup('page_view', 300, { page_url: '/home', page_path: '/' })).toBe(false)
    expect(shouldDedup('page_view', 300, { page_url: '/about', page_path: '/about' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shouldDedup — disabled via eventDedupMs: 0
// ---------------------------------------------------------------------------
describe('shouldDedup with cooldownMs=0 (disabled)', () => {
  it('never dedupes when cooldownMs is 0', () => {
    const props = { cta_location: 'upload_zone' }
    expect(shouldDedup('click', 0, props)).toBe(false)
    expect(shouldDedup('click', 0, props)).toBe(false)
    expect(shouldDedup('click', 0, props)).toBe(false)
  })

  it('never dedupes when cooldownMs is negative', () => {
    expect(shouldDedup('click', -1)).toBe(false)
    expect(shouldDedup('click', -1)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shouldDedup — SSR path (no window / _eventLastFired is null)
// ---------------------------------------------------------------------------
describe('shouldDedup SSR path', () => {
  it('_eventLastFired is a Map in jsdom (client)', () => {
    // Sanity check: in jsdom, window exists so the Map is created
    expect(_eventLastFired).toBeInstanceOf(Map)
  })

  // The SSR guard is: if (!_eventLastFired || cooldownMs <= 0) return false
  // When typeof window === 'undefined' (SSR), _eventLastFired is null,
  // so shouldDedup returns false unconditionally. We can't easily simulate
  // that in jsdom, but cooldownMs <= 0 exercises the same early-return path.
  it('returns false unconditionally when dedup is disabled (same code path as SSR)', () => {
    for (let i = 0; i < 10; i++) {
      expect(shouldDedup('rapid_event', 0, { i })).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// shouldDedup — map hard cap
// ---------------------------------------------------------------------------
describe('shouldDedup map cap', () => {
  it('never grows past DEDUP_MAP_MAX entries', () => {
    expect(_eventLastFired).not.toBeNull()

    // Insert DEDUP_MAP_MAX + 50 unique events
    for (let i = 0; i < DEDUP_MAP_MAX + 50; i++) {
      shouldDedup(`event_${i}`, 300)
    }

    expect(_eventLastFired!.size).toBeLessThanOrEqual(DEDUP_MAP_MAX)
  })

  it('exactly equals DEDUP_MAP_MAX after filling', () => {
    for (let i = 0; i < DEDUP_MAP_MAX + 10; i++) {
      shouldDedup(`event_${i}`, 300)
    }

    expect(_eventLastFired!.size).toBe(DEDUP_MAP_MAX)
  })

  it('evicts oldest entry when cap is reached', () => {
    // Fill the map to capacity
    for (let i = 0; i < DEDUP_MAP_MAX; i++) {
      shouldDedup(`event_${i}`, 300)
    }

    // The oldest key should be event_0
    expect(_eventLastFired!.has(dedupKey('event_0'))).toBe(true)

    // Insert one more — should evict event_0
    shouldDedup('new_event', 300)

    expect(_eventLastFired!.has(dedupKey('event_0'))).toBe(false)
    expect(_eventLastFired!.has(dedupKey('new_event'))).toBe(true)
    expect(_eventLastFired!.size).toBe(DEDUP_MAP_MAX)
  })

  it('still dedupes correctly after evictions', () => {
    // Fill past capacity to trigger evictions
    for (let i = 0; i < DEDUP_MAP_MAX + 10; i++) {
      shouldDedup(`event_${i}`, 300)
    }

    // Recent event should still be deduped
    const recentEvent = `event_${DEDUP_MAP_MAX + 9}`
    expect(shouldDedup(recentEvent, 300)).toBe(true)

    // Evicted event should be allowed again (treated as new)
    expect(shouldDedup('event_0', 300)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// shouldDedup — rapid-fire simulation (the actual YouSnaps bug pattern)
// ---------------------------------------------------------------------------
describe('shouldDedup rapid-fire simulation', () => {
  it('allows first event then blocks rapid duplicates', () => {
    const props = { cta_location: 'upload_zone' }
    const results: boolean[] = []

    // Simulate 20 rapid-fire events (same name + same properties)
    for (let i = 0; i < 20; i++) {
      results.push(shouldDedup('cta_clicked', 300, props))
    }

    // First should pass, rest should be deduped
    expect(results[0]).toBe(false)
    expect(results.slice(1).every((r) => r === true)).toBe(true)
  })

  it('allows interleaved different events through', () => {
    // Simulate alternating clicks on two different CTAs
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'sticky_mobile' })).toBe(false)
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'upload_zone' })).toBe(false)
    // Repeats of each should be blocked
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'sticky_mobile' })).toBe(true)
    expect(shouldDedup('cta_clicked', 300, { cta_location: 'upload_zone' })).toBe(true)
  })
})
