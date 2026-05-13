'use client'

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
import type {
  UseAnalyticsReturn,
  UseAnalyticsOptions,
  AnalyticsEvent,
  PageViewData,
  TrackEventResponse,
  UTMParams,
  DeviceInfo,
  ApiError,
} from '../types'

import { DEFAULT_EVENT_DEDUP_MS, shouldDedup } from './event-dedup'

// Generate a UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Session start time storage key
const SESSION_START_KEY = 'sm_session_start'
// Original external referrer storage key (captured once per session)
const SESSION_REFERRER_KEY = 'sm_session_referrer'

// Get item from storage
function getStorageItem(
  storage: Storage | undefined,
  key: string
): string | null {
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

// Set item in storage
function setStorageItem(
  storage: Storage | undefined,
  key: string,
  value: string
): void {
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get or create the session ID synchronously.
 *
 * IMPORTANT: During SSR (server-side rendering), we return null for the ID.
 * This avoids generating random IDs on the server that would be used
 * during hydration instead of the actual stored values.
 *
 * The anonymous ID is no longer owned by this hook — it lives on the
 * ScaleMule client (`@scalemule/sdk`) under the canonical
 * `scalemule_anonymous_id` storage key so a single visitor has exactly
 * one ID across analytics events and auth request headers. The hook
 * reads it via `client.ensureAnonymousId()` during init and
 * `client.getAnonymousId()` thereafter. See PR notes for the prior bug.
 */
function getOrCreateSessionId(
  sessionStorageKey: string
): { sessionId: string | null; sessionStart: number } {
  // During SSR, return null - session ID will be initialized on client
  if (typeof window === 'undefined') {
    return {
      sessionId: null,
      sessionStart: Date.now(),
    }
  }

  const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined

  // Session ID (per-session, stored in sessionStorage)
  let sessionId = getStorageItem(storage, sessionStorageKey)
  let sessionStartStr = getStorageItem(storage, SESSION_START_KEY)
  let sessionStart: number

  if (!sessionId || !sessionStartStr) {
    sessionId = generateUUID()
    sessionStart = Date.now()
    setStorageItem(storage, sessionStorageKey, sessionId)
    setStorageItem(storage, SESSION_START_KEY, sessionStart.toString())
  } else {
    sessionStart = parseInt(sessionStartStr, 10)
  }

  return { sessionId, sessionStart }
}

// Parse UTM params from URL
function parseUtmParams(): UTMParams | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const utm: UTMParams = {}

  // Standard UTM params
  const source = params.get('utm_source')
  const medium = params.get('utm_medium')
  const campaign = params.get('utm_campaign')
  const term = params.get('utm_term')
  const content = params.get('utm_content')
  const adgroup = params.get('utm_adgroup')

  if (source) utm.utm_source = source
  if (medium) utm.utm_medium = medium
  if (campaign) utm.utm_campaign = campaign
  if (term) utm.utm_term = term
  if (content) utm.utm_content = content
  if (adgroup) utm.utm_adgroup = adgroup

  // Click IDs (auto-appended by ad platforms)
  const gclid = params.get('gclid')
  const gbraid = params.get('gbraid')
  const wbraid = params.get('wbraid')
  const fbclid = params.get('fbclid')
  if (gclid) utm.gclid = gclid
  if (gbraid) utm.gbraid = gbraid
  if (wbraid) utm.wbraid = wbraid
  if (fbclid) utm.fbclid = fbclid

  // Google Ads ValueTrack params (from Final URL suffix)
  const gadFields = ['gad_source', 'gad_campaignid', 'gad_adgroupid', 'gad_network', 'gad_matchtype', 'gad_device', 'gad_placement'] as const
  for (const field of gadFields) {
    const val = params.get(field)
    if (val) utm[field] = val
  }

  // Google Ads auto-tagging: infer UTM values from Google click identifiers
  if (
    !utm.utm_source &&
    (gclid || utm.gad_source || wbraid || gbraid)
  ) {
    utm.utm_source = 'google'
    utm.utm_medium = utm.utm_medium || 'cpc'
    if (utm.gad_campaignid && !utm.utm_campaign) {
      utm.utm_campaign = utm.gad_campaignid
    }
  }

  // Facebook Ads auto-tagging: infer UTM values from Facebook click identifier
  if (!utm.utm_source && fbclid) {
    utm.utm_source = 'facebook'
    utm.utm_medium = utm.utm_medium || 'cpc'
  }

  return Object.keys(utm).length > 0 ? utm : null
}

// Detect device info from user agent
function detectDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {}
  }

  const ua = navigator.userAgent
  const info: DeviceInfo = {}

  // Device type
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/iPad|Tablet/i.test(ua)) {
      info.device_type = 'tablet'
    } else {
      info.device_type = 'mobile'
    }
  } else {
    info.device_type = 'desktop'
  }

  // OS detection
  if (/Windows/i.test(ua)) {
    info.os = 'Windows'
    const match = ua.match(/Windows NT (\d+\.\d+)/)
    if (match) info.os_version = match[1]
  } else if (/Mac OS X/i.test(ua)) {
    info.os = 'macOS'
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/)
    if (match) info.os_version = match[1].replace(/_/g, '.')
  } else if (/Android/i.test(ua)) {
    info.os = 'Android'
    const match = ua.match(/Android (\d+(?:\.\d+)*)/)
    if (match) info.os_version = match[1]
  } else if (/iOS|iPhone|iPad|iPod/i.test(ua)) {
    info.os = 'iOS'
    const match = ua.match(/OS (\d+[._]\d+[._]?\d*)/)
    if (match) info.os_version = match[1].replace(/_/g, '.')
  } else if (/Linux/i.test(ua)) {
    info.os = 'Linux'
  }

  // Browser detection
  if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua)) {
    info.browser = 'Chrome'
    const match = ua.match(/Chrome\/(\d+(?:\.\d+)*)/)
    if (match) info.browser_version = match[1]
  } else if (/Safari/i.test(ua) && !/Chrome|Chromium/i.test(ua)) {
    info.browser = 'Safari'
    const match = ua.match(/Version\/(\d+(?:\.\d+)*)/)
    if (match) info.browser_version = match[1]
  } else if (/Firefox/i.test(ua)) {
    info.browser = 'Firefox'
    const match = ua.match(/Firefox\/(\d+(?:\.\d+)*)/)
    if (match) info.browser_version = match[1]
  } else if (/Edg/i.test(ua)) {
    info.browser = 'Edge'
    const match = ua.match(/Edg\/(\d+(?:\.\d+)*)/)
    if (match) info.browser_version = match[1]
  }

  // Screen resolution
  if (typeof screen !== 'undefined') {
    info.screen_resolution = `${screen.width}x${screen.height}`
  }

  // Viewport size
  if (typeof window !== 'undefined') {
    info.viewport_size = `${window.innerWidth}x${window.innerHeight}`
  }

  return info
}

/**
 * Analytics hook for ScaleMule
 *
 * Provides event tracking, page views, and user identification.
 * Automatically handles session management, UTM capture, and device detection.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { trackEvent, trackPageView } = useAnalytics()
 *
 *   // Track page views automatically on mount
 *   useEffect(() => {
 *     trackPageView()
 *   }, [trackPageView])
 *
 *   // Track custom events
 *   const handleClick = async () => {
 *     await trackEvent({
 *       event_name: 'button_clicked',
 *       event_category: 'engagement',
 *       properties: { button_id: 'cta_signup' }
 *     })
 *   }
 *
 *   return <button onClick={handleClick}>Sign Up</button>
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Full tracking with user identification
 * function App() {
 *   const { trackEvent, identify, reset } = useAnalytics()
 *   const { user, login, logout } = useAuth()
 *
 *   // Identify user after login
 *   const handleLogin = async (credentials) => {
 *     const result = await login(credentials)
 *     await identify(result.user.id, { email: result.user.email })
 *   }
 *
 *   // Reset on logout
 *   const handleLogout = async () => {
 *     await logout()
 *     reset()
 *   }
 * }
 * ```
 */
export function useAnalytics(options: UseAnalyticsOptions = {}): UseAnalyticsReturn {
  const {
    autoTrackPageViews = false, // Let users control this
    autoCaptureUtmParams,
    autoCapturUtmParams,
    autoGenerateSessionId = true,
    sessionStorageKey = 'sm_session_id',
    // anonymousStorageKey is intentionally ignored — see UseAnalyticsOptions.
    // Anonymous ID now lives on the ScaleMule client under the canonical
    // `scalemule_anonymous_id` key (PR consolidating the contract). Reading
    // an override here would re-fragment a visitor's identity between
    // analytics events and auth request headers.
    useV2 = true,
    eventDedupMs = DEFAULT_EVENT_DEDUP_MS,
  } = options
  const shouldAutoCaptureUtmParams = autoCaptureUtmParams ?? autoCapturUtmParams ?? true

  const { client, user, analyticsProxyUrl, publishableKey, gatewayUrl } = useScaleMule()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [utmParams, setUtmParams] = useState<UTMParams | null>(null)

  // Use refs for IDs to prevent function reference changes when IDs initialize.
  // This is critical: if we used state, the trackEvent/trackPageView callbacks
  // would get new references when IDs change, causing consumer useEffects to
  // re-run and send duplicate events.
  const sessionIdRef = useRef<string | null>(null)
  const anonymousIdRef = useRef<string | null>(null)
  const sessionStartRef = useRef<number>(Date.now())
  const originalReferrerRef = useRef<string | null>(null)
  const idsReadyRef = useRef(false)

  // State for external access (consumers can read these)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [anonymousId, setAnonymousId] = useState<string | null>(null)

  const initialized = useRef(false)
  const landingPage = useRef<string | null>(null)
  const eventQueue = useRef<AnalyticsEvent[]>([])

  // Initialize IDs on client mount (after hydration)
  // This runs once after hydration and properly reads from storage
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    if (!autoGenerateSessionId) {
      idsReadyRef.current = true
      return
    }

    const ids = getOrCreateSessionId(sessionStorageKey)

    // Update refs (used internally for tracking)
    sessionIdRef.current = ids.sessionId
    sessionStartRef.current = ids.sessionStart

    // Session ID is sync — publish to external state immediately.
    setSessionId(ids.sessionId)

    // Resolve the anonymous ID via the ScaleMule client. This single source
    // of truth (canonical `scalemule_anonymous_id` localStorage key) is also
    // what gets sent as `x-anonymous-id` on direct-mode auth requests and
    // forwarded by the auth proxy — so analytics events and the visitor's
    // header identity stay in sync. We flush the queued event buffer only
    // after the anon-ID has resolved, otherwise queued events would fire
    // with a null anonymousIdRef and the backend would treat them as
    // anonymous-id-less.
    let cancelled = false
    const flushQueuedEvents = () => {
      if (eventQueue.current.length === 0) return
      const queue = eventQueue.current
      eventQueue.current = []
      setTimeout(() => {
        for (const event of queue) {
          sendEventRef.current?.(event)
        }
      }, 0)
    }
    client
      .ensureAnonymousId()
      .then((anonId) => {
        if (cancelled) return
        anonymousIdRef.current = anonId
        setAnonymousId(anonId)
        idsReadyRef.current = true
        flushQueuedEvents()
      })
      .catch(() => {
        if (cancelled) return
        // Storage unavailable (private mode, etc). Mark IDs ready anyway
        // so trackEvent doesn't block; events will fire without anon_id
        // and the backend tolerates that.
        idsReadyRef.current = true
        flushQueuedEvents()
      })

    return () => {
      cancelled = true
    }
  }, [autoGenerateSessionId, sessionStorageKey, client])

  // Capture UTM params, landing page, and original referrer
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Capture UTM params
    if (shouldAutoCaptureUtmParams) {
      const utm = parseUtmParams()
      if (utm) setUtmParams(utm)
    }

    // Store landing page
    if (!landingPage.current) {
      landingPage.current = window.location.href
    }

    // Capture original external referrer (once per session)
    // This preserves the original traffic source even after internal navigation
    const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : undefined
    const storedReferrer = getStorageItem(storage, SESSION_REFERRER_KEY)

    if (storedReferrer) {
      // Use stored referrer from earlier in session
      originalReferrerRef.current = storedReferrer
    } else if (document.referrer) {
      // Check if referrer is external (different domain)
      try {
        const referrerUrl = new URL(document.referrer)
        const currentUrl = new URL(window.location.href)
        if (referrerUrl.hostname !== currentUrl.hostname) {
          // External referrer - store it
          originalReferrerRef.current = document.referrer
          setStorageItem(storage, SESSION_REFERRER_KEY, document.referrer)
        }
      } catch {
        // Invalid URL, ignore
      }
    }
  }, [shouldAutoCaptureUtmParams])

  // Reference to the internal send function (will be set below)
  const sendEventRef = useRef<((event: AnalyticsEvent) => void) | null>(null)

  // Get device info
  const getDeviceInfo = useCallback((): DeviceInfo => {
    return detectDeviceInfo()
  }, [])

  // Build full event with all context
  // Uses refs for IDs to keep this callback stable
  const buildFullEvent = useCallback(
    (event: AnalyticsEvent): Record<string, unknown> => {
      const device = getDeviceInfo()
      const fullEvent: Record<string, unknown> = {
        event_name: event.event_name,
        event_category: event.event_category,
        properties: event.properties,
        // Use refs for IDs - they're always current, and this keeps the callback stable
        session_id: event.session_id || sessionIdRef.current,
        anonymous_id: event.anonymous_id || anonymousIdRef.current,
        user_id: event.user_id || user?.id,
        client_timestamp: event.client_timestamp || new Date().toISOString(),

        // Device info
        device_type: device.device_type,
        device_brand: device.device_brand,
        device_model: device.device_model,
        os: device.os,
        os_version: device.os_version,
        browser: device.browser,
        browser_version: device.browser_version,
        screen_resolution: device.screen_resolution,
        viewport_size: device.viewport_size,

        // UTM params
        ...(utmParams || {}),

        // Landing page (first page visited)
        landing_page: landingPage.current,

        // Session duration in seconds
        session_duration_seconds: Math.floor((Date.now() - sessionStartRef.current) / 1000),
      }

      // Add page info if in browser
      if (typeof window !== 'undefined') {
        fullEvent.page_url = window.location.href
        fullEvent.page_title = document.title
        // Send both referrer values — let the backend analytics decide what to use.
        // referrer: the confirmed external referrer captured on session start
        // document_referrer: the raw browser document.referrer (may be self-referral after redirects)
        fullEvent.referrer = originalReferrerRef.current || undefined
        fullEvent.document_referrer = document.referrer || undefined
      }

      return fullEvent
    },
    // Note: sessionId/anonymousId removed - we use refs to keep this stable
    [user, utmParams, getDeviceInfo]
  )

  /**
   * Internal function to send an event (called when IDs are ready)
   * Uses refs for IDs to keep callback reference stable
   */
  const sendEvent = useCallback(
    async (event: AnalyticsEvent): Promise<TrackEventResponse> => {
      const fullEvent = buildFullEvent(event)
      const payload = JSON.stringify(fullEvent)

      // If proxy URL is configured, send events there instead of ScaleMule directly
      if (analyticsProxyUrl) {
        // Use sendBeacon for same-origin proxy — survives page navigation,
        // tab close, and mobile app backgrounding. Falls back to keepalive fetch.
        const sent =
          typeof navigator !== 'undefined' &&
          typeof navigator.sendBeacon === 'function' &&
          navigator.sendBeacon(
            analyticsProxyUrl,
            new Blob([payload], { type: 'application/json' })
          )

        if (!sent) {
          fetch(analyticsProxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch((err) => {
            console.debug('[ScaleMule Analytics] Proxy tracking failed:', err)
          })
        }

        return { tracked: 1, session_id: sessionIdRef.current || undefined }
      }

      // If publishable key is available, make direct browser-to-API calls
      // Publishable keys are origin-locked and safe for browser use
      if (publishableKey && gatewayUrl) {
        const endpoint = useV2 ? '/v1/analytics/v2/events' : '/v1/analytics/events'

        // keepalive ensures the request survives page navigation/tab close
        fetch(`${gatewayUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': publishableKey,
          },
          body: payload,
          keepalive: true,
        }).catch((err) => {
          console.debug('[ScaleMule Analytics] Direct tracking failed:', err)
        })

        return { tracked: 1, session_id: sessionIdRef.current || undefined }
      }

      // Fall back to client (requires API key exposed to browser)
      const endpoint = useV2 ? '/v1/analytics/v2/events' : '/v1/analytics/events'

      return await client.post<TrackEventResponse>(endpoint, fullEvent)
    },
    // Note: sessionId removed - we use ref to keep this stable
    [client, buildFullEvent, useV2, analyticsProxyUrl, publishableKey, gatewayUrl]
  )

  // Store send function in ref for queue flush
  sendEventRef.current = sendEvent

  /**
   * Track a custom event
   *
   * When analyticsProxyUrl is configured, sends events to the proxy.
   * Otherwise sends directly to ScaleMule via the client.
   *
   * If IDs aren't ready yet (during SSR/initial hydration), events are
   * queued and sent once IDs are initialized.
   *
   * This callback has a stable reference - it won't change when IDs initialize,
   * preventing consumer useEffects from re-running and sending duplicate events.
   */
  const trackEvent = useCallback(
    async (event: AnalyticsEvent): Promise<TrackEventResponse> => {
      // Dedup: suppress rapid-fire identical events (e.g., from event bubbling,
      // double-bound click handlers, or IntersectionObserver re-fires).
      // Only suppresses events with the same name AND same properties.
      if (shouldDedup(event.event_name, eventDedupMs, event.properties)) {
        return { tracked: 0, session_id: sessionIdRef.current || undefined }
      }

      setError(null)
      setLoading(true)

      try {
        // If IDs aren't ready, queue the event for later
        // Using ref to avoid callback reference changing when IDs initialize
        if (!idsReadyRef.current) {
          eventQueue.current.push(event)
          setLoading(false)
          return { tracked: 0, session_id: undefined } // Will be sent when ready
        }

        return await sendEvent(event)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      } finally {
        setLoading(false)
      }
    },
    // Note: idsReady removed - we use ref to keep callback stable
    [sendEvent, eventDedupMs]
  )

  /**
   * Track a page view
   */
  const trackPageView = useCallback(
    async (data?: PageViewData): Promise<TrackEventResponse> => {
      const pageEvent: AnalyticsEvent = {
        event_name: 'page_viewed',
        event_category: 'navigation',
        properties: {
          ...(data?.properties || {}),
          page_url: data?.page_url || (typeof window !== 'undefined' ? window.location.href : undefined),
          page_title: data?.page_title || (typeof document !== 'undefined' ? document.title : undefined),
          referrer: data?.referrer || originalReferrerRef.current || undefined,
        },
      }

      return trackEvent(pageEvent)
    },
    [trackEvent]
  )

  /**
   * Track multiple events in a batch
   *
   * When analyticsProxyUrl is configured, sends each event to the proxy.
   * When publishableKey is available, sends directly with the publishable key.
   * Otherwise sends directly to ScaleMule via the client.
   */
  const trackBatch = useCallback(
    async (events: AnalyticsEvent[]): Promise<TrackEventResponse> => {
      setError(null)
      setLoading(true)

      try {
        const fullEvents = events.map((event) => buildFullEvent(event))

        // If proxy URL is configured, send events there
        if (analyticsProxyUrl) {
          for (const event of fullEvents) {
            const payload = JSON.stringify(event)
            const sent =
              typeof navigator !== 'undefined' &&
              typeof navigator.sendBeacon === 'function' &&
              navigator.sendBeacon(
                analyticsProxyUrl,
                new Blob([payload], { type: 'application/json' })
              )

            if (!sent) {
              fetch(analyticsProxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true,
              }).catch((err) => {
                console.debug('[ScaleMule Analytics] Proxy batch tracking failed:', err)
              })
            }
          }

          setLoading(false)
          return { tracked: events.length, session_id: sessionIdRef.current || undefined }
        }

        // If publishable key is available, make direct browser-to-API calls
        if (publishableKey && gatewayUrl) {
          const endpoint = useV2 ? '/v1/analytics/v2/events/batch' : '/v1/analytics/events/batch'

          fetch(`${gatewayUrl}${endpoint}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': publishableKey,
            },
            body: JSON.stringify({ events: fullEvents }),
            keepalive: true,
          }).catch((err) => {
            console.debug('[ScaleMule Analytics] Direct batch tracking failed:', err)
          })

          setLoading(false)
          return { tracked: events.length, session_id: sessionIdRef.current || undefined }
        }

        // Fall back to client
        const endpoint = useV2 ? '/v1/analytics/v2/events/batch' : '/v1/analytics/events/batch'

        return await client.post<TrackEventResponse>(endpoint, {
          events: fullEvents,
        })
      } finally {
        setLoading(false)
      }
    },
    // Note: sessionId removed - we use ref to keep callback stable
    [client, buildFullEvent, useV2, analyticsProxyUrl, publishableKey, gatewayUrl]
  )

  /**
   * Identify user for analytics
   */
  const identify = useCallback(
    async (userId: string, traits?: Record<string, unknown>): Promise<void> => {
      // Track an identify event to merge anonymous with user
      await trackEvent({
        event_name: 'user_identified',
        event_category: 'identity',
        user_id: userId,
        properties: {
          ...(traits || {}),
          previous_anonymous_id: anonymousIdRef.current,
        },
      })
    },
    // Note: anonymousId removed - we use ref
    [trackEvent]
  )

  /**
   * Reset analytics session (on logout)
   */
  const reset = useCallback(() => {
    // Generate new session ID and reset session start time
    const newSessionId = generateUUID()
    const newSessionStart = Date.now()

    // Update both ref (for tracking) and state (for external access)
    sessionIdRef.current = newSessionId
    sessionStartRef.current = newSessionStart
    setSessionId(newSessionId)

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(sessionStorageKey, newSessionId)
      sessionStorage.setItem(SESSION_START_KEY, newSessionStart.toString())
      // Clear original referrer so a new one can be captured
      sessionStorage.removeItem(SESSION_REFERRER_KEY)
    }

    // Reset original referrer ref
    originalReferrerRef.current = null

    // Keep anonymous ID for cross-session tracking
    // but clear UTM params as they're campaign-specific
    setUtmParams(null)
  }, [sessionStorageKey])

  /**
   * Manually set UTM parameters
   */
  const setUtmParamsManual = useCallback((params: UTMParams) => {
    setUtmParams(params)
  }, [])

  return useMemo(
    () => ({
      loading,
      error,
      sessionId,
      anonymousId,
      utmParams,
      trackEvent,
      trackPageView,
      trackBatch,
      identify,
      reset,
      setUtmParams: setUtmParamsManual,
      getDeviceInfo,
    }),
    [
      loading,
      error,
      sessionId,
      anonymousId,
      utmParams,
      trackEvent,
      trackPageView,
      trackBatch,
      identify,
      reset,
      setUtmParamsManual,
      getDeviceInfo,
    ]
  )
}
