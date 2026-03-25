'use client'

/**
 * usePushNotifications — NextJS hook for browser push notification management
 *
 * Routes all API calls through the same-origin /api/push/* proxy
 * (NOT through the ScaleMule client which sends 'proxy-mode' as x-api-key).
 *
 * @example
 * ```tsx
 * function NotificationPrompt() {
 *   const { isSupported, permission, isSubscribed, subscribe } = usePushNotifications()
 *
 *   if (!isSupported || permission === 'denied') return null
 *   if (isSubscribed) return null
 *
 *   return <button onClick={subscribe}>Enable Notifications</button>
 * }
 * ```
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useScaleMule } from '../provider'
import { WebPushManager } from '@scalemule/sdk'
import type { PushApiFetcher } from '@scalemule/sdk'
import type { ApiError } from '../types'

// ============================================================================
// Types
// ============================================================================

export interface UsePushNotificationsOptions {
  /** Service worker URL (default: '/sw.js') */
  serviceWorkerUrl?: string
  /** Push proxy URL (default: '/api/push') */
  pushProxyUrl?: string
  /** Where the user subscribed (e.g., 'landing_prompt', 'post_signup', 'settings') */
  registrationSource?: string
  /** Called when a push notification is received while app is in foreground */
  onNotification?: (data: unknown) => void
}

export interface UsePushNotificationsReturn {
  /** Whether the browser supports Web Push */
  isSupported: boolean
  /** Current notification permission state */
  permission: NotificationPermission | 'unsupported'
  /** Whether push is currently subscribed */
  isSubscribed: boolean
  /** Whether an operation is in progress */
  isLoading: boolean
  /** Last error */
  error: ApiError | null
  /** Request permission and subscribe to push notifications */
  subscribe: () => Promise<void>
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>
  /** Clear user association (call before logout) */
  disassociateUser: () => Promise<void>
  /** The push token ID from backend registration */
  tokenId: string | null
}

// ============================================================================
// CSRF Helper
// ============================================================================

function getCsrfToken(): string {
  if (typeof document === 'undefined') return ''
  const match = document.cookie.match(/(?:^|;\s*)sm_csrf=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : ''
}

// ============================================================================
// Hook
// ============================================================================

export function usePushNotifications(
  options: UsePushNotificationsOptions = {}
): UsePushNotificationsReturn {
  const { serviceWorkerUrl = '/sw.js', pushProxyUrl = '/api/push', registrationSource, onNotification } = options
  const { user } = useScaleMule()

  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const [tokenId, setTokenId] = useState<string | null>(null)

  const onNotificationRef = useRef(onNotification)
  useEffect(() => {
    onNotificationRef.current = onNotification
  }, [onNotification])

  const prevUserRef = useRef<string | null>(null)

  // Build the proxy fetcher
  const fetcher: PushApiFetcher = useMemo(() => {
    async function proxyGet<T>(path: string): Promise<T> {
      const res = await fetch(`${pushProxyUrl}/${path}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Request failed')
      return json.data as T
    }

    async function proxyPost<T>(path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Request failed')
      return json.data as T
    }

    async function proxyPut<T>(path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        body: body ? JSON.stringify(body) : undefined,
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Request failed')
      return json.data as T
    }

    async function proxyDelete(path: string): Promise<void> {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: 'DELETE',
        headers: {
          'x-csrf-token': getCsrfToken(),
        },
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error?.message || 'Request failed')
    }

    return {
      getSettings: () => proxyGet('settings/me'),
      registerToken: (data) => proxyPost('register', data),
      unregisterToken: (id) => proxyDelete(`tokens/by-id/${id}`),
      associateUser: (id) => proxyPut(`tokens/by-id/${id}/user`, {}),
      disassociateUser: (id) => proxyDelete(`tokens/by-id/${id}/user`),
    }
  }, [pushProxyUrl])

  // Build the WebPushManager
  const manager = useMemo(() => {
    if (typeof window === 'undefined') return null
    try {
      return new WebPushManager({ fetcher, serviceWorkerUrl, registrationSource })
    } catch {
      return null
    }
  }, [fetcher, serviceWorkerUrl])

  // Check initial state on mount — detect stale subscriptions
  useEffect(() => {
    if (!manager) return
    const supported = manager.isSupported()
    setIsSupported(supported)
    setPermission(manager.getPermissionState())

    if (supported) {
      // Check if we think we're subscribed but the browser subscription is gone
      // (user revoked permission, cleared site data, etc.)
      const storedTokenId = manager.getTokenId()
      manager.isSubscribed().then((sub) => {
        if (!sub && storedTokenId) {
          // Stale token — browser subscription gone but backend still has our token
          // Deregister from backend to prevent sending to dead subscription
          manager.unsubscribe().catch(() => {})
          setIsSubscribed(false)
          setTokenId(null)
          setPermission(manager.getPermissionState())
        } else {
          setIsSubscribed(sub)
          setTokenId(manager.getTokenId())
        }
      })
    }
  }, [manager])

  // Listen for service worker messages (foreground notifications + subscription changes)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'push-received') {
        onNotificationRef.current?.(event.data.payload)
      }
      if (event.data?.type === 'push-subscription-expired') {
        // Browser invalidated the push subscription (permission revoked, key change, etc.)
        // Clean up: deregister stale token from backend
        if (manager) {
          manager.unsubscribe().catch(() => {})
        }
        setIsSubscribed(false)
        setTokenId(null)
        setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
      }
    }

    navigator.serviceWorker.addEventListener('message', handleMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage)
  }, [manager])

  // Auto-associate when user logs in (anonymous token → user)
  useEffect(() => {
    if (!manager) return
    const currentUserId = user?.id || null
    const prevUserId = prevUserRef.current

    if (currentUserId && !prevUserId && isSubscribed) {
      // User just logged in with an existing subscription — associate
      manager.associateUser().catch(() => {
        // Best effort — don't break the login flow
      })
    }

    prevUserRef.current = currentUserId
  }, [user?.id, manager, isSubscribed])

  const subscribe = useCallback(async () => {
    if (!manager) return
    setIsLoading(true)
    setError(null)

    try {
      const result = await manager.subscribe()
      if (result) {
        setIsSubscribed(true)
        setTokenId(result.tokenId)
        setPermission('granted')
      } else {
        setPermission(manager.getPermissionState())
      }
    } catch (e) {
      setError({
        code: 'PUSH_SUBSCRIBE_ERROR',
        message: e instanceof Error ? e.message : 'Failed to subscribe',
      })
    } finally {
      setIsLoading(false)
    }
  }, [manager])

  const unsubscribe = useCallback(async () => {
    if (!manager) return
    setIsLoading(true)
    setError(null)

    try {
      await manager.unsubscribe()
      setIsSubscribed(false)
      setTokenId(null)
    } catch (e) {
      setError({
        code: 'PUSH_UNSUBSCRIBE_ERROR',
        message: e instanceof Error ? e.message : 'Failed to unsubscribe',
      })
    } finally {
      setIsLoading(false)
    }
  }, [manager])

  /**
   * Clear user association from push token. Must be called BEFORE logout clears
   * the session — the request needs a valid session to prove token ownership.
   *
   * Note: automatic beforeLogout lifecycle is not yet implemented in the provider.
   * Call this explicitly in your logout handler:
   *
   * @example
   * ```tsx
   * const { disassociateUser } = usePushNotifications()
   * const { logout } = useAuth()
   *
   * async function handleLogout() {
   *   await disassociateUser()  // clear push token association first
   *   await logout()            // then clear session
   * }
   * ```
   */
  const disassociateUser = useCallback(async () => {
    if (!manager) return
    try {
      await manager.disassociateUser()
    } catch {
      // Best effort — don't block logout
    }
  }, [manager])

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    disassociateUser,
    tokenId,
  }
}
