// ---------------------------------------------------------------------------
// Client-side event dedup — prevents rapid-fire duplicates from event
// bubbling, double-bound listeners, IntersectionObserver re-fires, etc.
// Shared across all hook instances on the page (module-level singleton).
//
// Keyed on event_name + shallow fingerprint of properties, so two events
// with the same name but different properties (e.g., clicking two different
// CTAs) are NOT deduped — only true duplicates are suppressed.
//
// Memory-safe: hard-capped at DEDUP_MAP_MAX entries. When the cap is reached,
// the oldest entry is evicted before inserting the new one.
// ---------------------------------------------------------------------------

export const DEFAULT_EVENT_DEDUP_MS = 300
export const DEDUP_MAP_MAX = 200

export const _eventLastFired: Map<string, number> | null =
  typeof window !== 'undefined' ? new Map<string, number>() : null

/**
 * Build a dedup key from event name + top-level property values.
 * Primitives are serialised in full (no truncation) so long URLs,
 * IDs, etc. are always distinguished. Nested objects/arrays are
 * collapsed to their type to avoid JSON.stringify cost and
 * key-ordering ambiguity.
 */
export function dedupKey(eventName: string, properties?: Record<string, unknown>): string {
  if (!properties) return eventName
  const keys = Object.keys(properties)
  if (keys.length === 0) return eventName

  let parts = eventName
  for (let i = 0, len = keys.length; i < len; i++) {
    const k = keys[i]
    const v = properties[k]
    if (v === null || v === undefined) {
      parts += `|${k}=`
    } else if (typeof v === 'object') {
      parts += `|${k}=[obj]`
    } else {
      parts += `|${k}=${String(v)}`
    }
  }
  return parts
}

export function shouldDedup(
  eventName: string,
  cooldownMs: number,
  properties?: Record<string, unknown>
): boolean {
  if (!_eventLastFired || cooldownMs <= 0) return false

  const now = Date.now()
  const key = dedupKey(eventName, properties)
  const last = _eventLastFired.get(key)
  if (last !== undefined && now - last < cooldownMs) return true

  // Hard cap: evict oldest entry before inserting
  if (_eventLastFired.size >= DEDUP_MAP_MAX) {
    // Map iterates in insertion order; first key is oldest
    const oldest = _eventLastFired.keys().next().value
    if (oldest !== undefined) _eventLastFired.delete(oldest)
  }

  _eventLastFired.set(key, now)
  return false
}

/** Clear the dedup map. Exported for testing only. */
export function _resetDedupMap(): void {
  _eventLastFired?.clear()
}
