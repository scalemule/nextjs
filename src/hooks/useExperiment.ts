'use client'

import { useEffect, useMemo, useRef } from 'react'
import { experimentVariant, exposureEvent, exposureStorageKey, isVariantKey } from '@scalemule/sdk'
import { useScaleMule } from '../provider'
import { useAnalytics } from './useAnalytics'
import { useFeatureFlags, type FeatureFlagEvaluation } from './useFeatureFlags'
import type { ApiError } from '../types'

export interface UseExperimentOptions {
  /** Flag environment (defaults to the provider's). */
  environment?: string
  /** Extra evaluation context (attributes for targeting rules). The visitor's anonymous id is always sent as `session_id`. */
  context?: Record<string, unknown>
  /** Variant to report while loading or when the flag is off or missing. */
  fallback?: string | null
  /** Set false to skip evaluation (the fallback is returned and nothing is tracked). */
  enabled?: boolean
  /** Set false to skip the `experiment_exposed` event (for example when the server already sent it). */
  trackExposure?: boolean
}

export interface UseExperimentReturn {
  /** The visitor's variant, the fallback while loading, or null when the flag serves no variant. */
  variant: string | null
  loading: boolean
  error: ApiError | null
  evaluation: FeatureFlagEvaluation | null
  refresh: () => Promise<void>
}

/**
 * Assigns the visitor to an experiment (a flag with weighted variants), registers the assignment
 * so every `useAnalytics` event carries `properties.experiments`, and tracks one
 * `experiment_exposed` per session and flag.
 *
 * @example
 * ```tsx
 * const { variant } = useExperiment('checkout_button')
 * return variant === 'green' ? <GreenButton /> : <BlueButton />
 * ```
 */
export function useExperiment(flagKey: string, options: UseExperimentOptions = {}): UseExperimentReturn {
  const { environment, context, fallback = null, enabled = true, trackExposure = true } = options
  const { client, registerExperiment, experiments } = useScaleMule()
  const { trackEvent } = useAnalytics()
  const anonymousId = client.getAnonymousId()
  const evaluationContext = useMemo(
    () => ({ session_id: anonymousId, ...(context ?? {}) }),
    // The anonymous id is stable for the visitor; the caller's context is merged by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anonymousId, JSON.stringify(context ?? {})]
  )
  const { flags, loading, error, refresh } = useFeatureFlags({ keys: [flagKey], environment, context: evaluationContext, enabled })
  const evaluation = flags[flagKey] ?? null
  const variant = loading && !evaluation ? (isVariantKey(fallback) ? fallback : null) : experimentVariant(evaluation) ?? (isVariantKey(fallback) ? fallback : null)

  useEffect(() => {
    if (!enabled || loading) return
    const assigned = experimentVariant(evaluation)
    if (experiments[flagKey] !== (assigned ?? undefined)) registerExperiment(flagKey, assigned)
  }, [enabled, loading, evaluation, flagKey, registerExperiment, experiments])

  const exposedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled || !trackExposure || loading) return
    const assigned = experimentVariant(evaluation)
    if (!assigned || exposedRef.current === assigned) return
    const key = exposureStorageKey(flagKey)
    let already = false
    try { already = typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key) === assigned } catch { /* storage unavailable */ }
    exposedRef.current = assigned
    if (already) return
    try { sessionStorage.setItem(key, assigned) } catch { /* storage unavailable */ }
    void trackEvent(exposureEvent(flagKey, assigned)).catch(() => { /* exposure tracking never breaks the page */ })
  }, [enabled, trackExposure, loading, evaluation, flagKey, trackEvent])

  return { variant, loading, error, evaluation, refresh }
}
