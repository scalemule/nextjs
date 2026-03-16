'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
import type { ApiError } from '../types'

export interface FeatureFlagEvaluation<T = unknown> {
  flag_id: string
  flag_key: string
  environment: string
  value: T
  reason: string
  matched_rule_id?: string | null
  variant_key?: string | null
  bucket?: number | null
}

export interface UseFeatureFlagsOptions {
  environment?: string
  context?: Record<string, unknown>
  keys?: string[]
  enabled?: boolean
}

export interface UseFeatureFlagsReturn {
  flags: Record<string, FeatureFlagEvaluation>
  loading: boolean
  error: ApiError | null
  refresh: () => Promise<void>
  isEnabled: (flagKey: string, fallback?: boolean) => boolean
  getFlag: <T = unknown>(flagKey: string, fallback?: T) => T
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ScaleMuleApiError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field,
    }
  }

  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Failed to load feature flags',
  }
}

export function useFeatureFlags(options: UseFeatureFlagsOptions = {}): UseFeatureFlagsReturn {
  const smContext = useScaleMule()
  const {
    environment = smContext.environment ?? 'prod',
    context = {},
    keys,
    enabled = true,
  } = options

  const { client, publishableKey, gatewayUrl, bootstrapFlags } = smContext

  // Deprecation warning for keyless usage (once per mount)
  const warnedRef = useRef(false)
  useEffect(() => {
    if (!warnedRef.current && (!keys || keys.length === 0)) {
      warnedRef.current = true
      console.warn(
        'useFeatureFlags: "keys" option should be provided. Calling /evaluate/all without explicit keys is deprecated and will be blocked in a future release. Pass keys: ["flag1", "flag2"].'
      )
    }
  }, [keys])

  // If server-bootstrapped flag values exist, use them as initial state.
  // This eliminates the loading flash — isEnabled() returns the correct value
  // on the very first render, before any client-side fetch completes.
  const initialFlags = useMemo(() => {
    if (!bootstrapFlags) return {}
    const result: Record<string, FeatureFlagEvaluation> = {}
    for (const [key, value] of Object.entries(bootstrapFlags)) {
      if (value && typeof value === 'object' && 'flag_key' in (value as Record<string, unknown>)) {
        result[key] = value as FeatureFlagEvaluation
      }
    }
    return result
  }, [bootstrapFlags])

  const hasBootstrap = Object.keys(initialFlags).length > 0
  const [flags, setFlags] = useState<Record<string, FeatureFlagEvaluation>>(initialFlags)
  const [loading, setLoading] = useState<boolean>(enabled && !hasBootstrap)
  const [error, setError] = useState<ApiError | null>(null)

  const contextRef = useRef<Record<string, unknown>>(context)
  const keysRef = useRef(keys)
  const keysKey = useMemo(() => (keys && keys.length > 0 ? [...keys].sort().join('|') : ''), [keys])

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => {
    keysRef.current = keys
  }, [keys])

  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const currentKeys = keysRef.current
      const payload = currentKeys && currentKeys.length > 0
        ? { flag_keys: currentKeys, environment, context: contextRef.current }
        : { environment, context: contextRef.current }

      const endpoint = currentKeys && currentKeys.length > 0
        ? '/v1/flags/evaluate/batch'
        : '/v1/flags/evaluate/all'

      let result: Record<string, FeatureFlagEvaluation>

      // When publishableKey + gatewayUrl are available, call the gateway directly
      // with the publishable key instead of using the SDK client (which may have
      // apiKey: 'proxy-mode' that the gateway rejects).
      if (publishableKey && gatewayUrl) {
        const response = await fetch(`${gatewayUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publishableKey,
          },
          body: JSON.stringify(payload),
        })
        if (!response.ok) {
          throw new Error(`Flag evaluation failed: ${response.status}`)
        }
        const json = await response.json()
        result = json.data || json || {}
      } else {
        result = await client.post<Record<string, FeatureFlagEvaluation>>(endpoint, payload)
      }

      setFlags(result || {})
      setError(null)
    } catch (err) {
      setError(toApiError(err))
    } finally {
      setLoading(false)
    }
  }, [client, enabled, environment, keysKey, publishableKey, gatewayUrl])

  // Skip the initial client-side fetch when server-bootstrapped flags already
  // cover the requested keys — avoids a redundant evaluate/batch API call on
  // every page load.
  // Only skip when: (a) keys are covered, (b) environment matches the provider's
  // environment, and (c) context has no keys beyond 'ip_address' (the only field
  // the server SSR path injects).
  const bootstrapCoversKeys = useMemo(() => {
    if (!hasBootstrap || !keys || keys.length === 0) return false
    if (!keys.every((k) => k in initialFlags)) return false
    // Environment must match
    if (environment !== (smContext.environment ?? 'prod')) return false
    // Only safe when context is empty or has only ip_address
    const contextKeys = Object.keys(context).filter((k) => k !== 'ip_address')
    if (contextKeys.length > 0) return false
    return true
  }, [hasBootstrap, keys, initialFlags, environment, smContext.environment, context])

  useEffect(() => {
    if (!bootstrapCoversKeys) {
      void refresh()
    }
  }, [refresh, bootstrapCoversKeys])

  const isEnabled = useCallback(
    (flagKey: string, fallback = false): boolean => {
      const evaluation = flags[flagKey]
      if (!evaluation) return fallback
      return typeof evaluation.value === 'boolean' ? evaluation.value : fallback
    },
    [flags]
  )

  const getFlag = useCallback(
    <T,>(flagKey: string, fallback?: T): T => {
      const evaluation = flags[flagKey]
      if (!evaluation) return fallback as T
      return (evaluation.value as T) ?? (fallback as T)
    },
    [flags]
  )

  return {
    flags,
    loading,
    error,
    refresh,
    isEnabled,
    getFlag,
  }
}
