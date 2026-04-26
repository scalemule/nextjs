'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { createMoneyClient, type MoneyClient } from '@scalemule/money'
import { ScaleMule, type RealtimeService, type StorageService, type PhotoService } from '@scalemule/sdk'
import { ScaleMuleClient, createClient } from './client'
import type { User, ScaleMuleConfig, ApiError, LoginResponse } from './types'

// ============================================================================
// User Cache (stale-while-revalidate)
// ============================================================================

const USER_CACHE_KEY = 'scalemule_user'

function getCachedUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = localStorage.getItem(USER_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch {
    return null
  }
}

function setCachedUser(user: User | null): void {
  if (typeof window === 'undefined') return
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_CACHE_KEY)
    }
  } catch {}
}

// ============================================================================
// Context Types
// ============================================================================

interface ScaleMuleContextValue {
  /** The API client instance */
  client: ScaleMuleClient
  /** Money client instance sharing the same session token */
  money: MoneyClient
  /** Base SDK realtime service — shared singleton for WebSocket connections */
  realtime: RealtimeService
  /** Base SDK storage service — exposed for `useMedia()` and direct chat-attachment uploads */
  storage: StorageService
  /** Base SDK photo service — exposed for `useMedia()` and `photo.uploadViaStorage()` */
  photo: PhotoService
  /** Current authenticated user */
  user: User | null
  /** Set the current user */
  setUser: (user: User | null) => void
  /** Whether the SDK is initializing */
  initializing: boolean
  /** Last error */
  error: ApiError | null
  /** Set error */
  setError: (error: ApiError | null) => void
  /** Analytics proxy URL (when set, SDK sends events here instead of ScaleMule) */
  analyticsProxyUrl?: string
  /** Auth proxy URL (when set, auth operations route through this proxy) */
  authProxyUrl?: string
  /** Publishable key for browser-safe operations (analytics) */
  publishableKey?: string
  /** Gateway URL for direct API calls */
  gatewayUrl?: string
  /** Configured environment ('dev' or 'prod') */
  environment?: string
  /** Whether the account switcher is enabled */
  enableAccountSwitcher?: boolean
  /** Privacy level for account switcher */
  accountSwitcherPrivacy?: string
  /** Server-evaluated flag values to bootstrap the client (eliminates loading flash) */
  bootstrapFlags?: Record<string, unknown>
}

// ============================================================================
// Context
// ============================================================================

const ScaleMuleContext = createContext<ScaleMuleContextValue | null>(null)

// ============================================================================
// Provider Props
// ============================================================================

export interface ScaleMuleProviderProps extends ScaleMuleConfig {
  children: ReactNode
  /** Called when user logs in */
  onLogin?: (user: User, response: LoginResponse) => void
  /** Called when user logs out */
  onLogout?: () => void
  /** Called on authentication error */
  onAuthError?: (error: ApiError) => void
  /** Server-evaluated flag values to bootstrap the client (eliminates loading flash) */
  bootstrapFlags?: Record<string, unknown>
}

// ============================================================================
// Provider Component
// ============================================================================

export function ScaleMuleProvider({
  apiKey,
  applicationId,
  environment,
  gatewayUrl,
  debug,
  storage,
  analyticsProxyUrl,
  authProxyUrl,
  publishableKey,
  enableAccountSwitcher,
  accountSwitcherPrivacy,
  children,
  onLogin,
  onLogout,
  onAuthError,
  bootstrapFlags,
}: ScaleMuleProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)
  const resolvedGatewayUrl =
    gatewayUrl ||
    (environment === 'dev' ? 'https://api-dev.scalemule.com' : 'https://api.scalemule.com')

  // Create client instance (memoized to prevent recreating on every render)
  // In auth proxy mode, set pendingSessionInit so API requests wait for the
  // session token before sending (prevents race conditions with child effects)
  const client = useMemo(
    () =>
      createClient({
        apiKey,
        applicationId,
        environment,
        gatewayUrl: resolvedGatewayUrl,
        debug,
        storage,
        pendingSessionInit: !!authProxyUrl,
      }),
    [apiKey, applicationId, environment, resolvedGatewayUrl, debug, storage, authProxyUrl]
  )

  const money = useMemo(
    () =>
      createMoneyClient({
        apiKey,
        gatewayUrl: resolvedGatewayUrl,
        environment,
        accessToken: client.getSessionToken() || undefined,
        fetch: globalThis.fetch.bind(globalThis),
      }),
    [apiKey, resolvedGatewayUrl, environment, client]
  )

  // Create a base SDK ScaleMule instance for realtime WebSocket support.
  // The NextJS ScaleMuleClient is a separate class that can't be used with
  // ServiceModule (which requires the base SDK client type). This base instance
  // provides the RealtimeService with correct protocol handling.
  const baseClient = useMemo(() => {
    return new ScaleMule({
      apiKey,
      applicationId,
      baseUrl: resolvedGatewayUrl,
      environment,
      debug,
    })
  }, [apiKey, applicationId, environment, resolvedGatewayUrl, debug])

  // Keep realtime and money clients in sync with the NextJS session token.
  useEffect(() => {
    const token = client.getSessionToken()
    if (token) {
      baseClient.setAccessToken(token)
      money.setAccessToken(token)
    } else {
      baseClient.clearAccessToken()
      money.setAccessToken(undefined)
    }
  }, [client, baseClient, money, user]) // re-sync when user changes (login/logout)

  // Initialize client and restore session on mount
  // Uses stale-while-revalidate: if a cached user exists, render immediately
  // and validate the session in the background.
  useEffect(() => {
    let mounted = true

    async function initialize() {
      try {
        await client.initialize()

        // Restore cached user for instant rendering
        const cachedUser = getCachedUser()

        // Auth proxy mode: session is managed by httpOnly cookies
        if (authProxyUrl) {
          // If we have a cached user, show content immediately (no spinner)
          if (cachedUser && mounted) {
            setUser(cachedUser)
            setInitializing(false)
          }

          // Revalidate session in the background
          try {
            const response = await fetch(`${authProxyUrl}/me`, {
              credentials: 'include',
            })
            const data = await response.json()

            if (mounted) {
              if (data.success && data.data?.user) {
                setUser(data.data.user)
                setCachedUser(data.data.user)
                // Set the session token on the client so API calls include Authorization header
                if (data.data.sessionToken) {
                  await client.setSession(data.data.sessionToken, data.data.userId || '')
                }
              } else {
                // Session invalid — clear cached user
                setUser(null)
                setCachedUser(null)
              }
            }
          } catch {
            // Network error — keep cached user if available
            if (mounted && debug) {
              console.debug('[ScaleMule] Auth proxy session check failed')
            }
          } finally {
            // Always resolve the session gate so API requests can proceed,
            // whether the session was established or not
            client.resolveSessionPending()
          }
        } else if (client.isAuthenticated()) {
          // Direct mode: validate session via client
          if (cachedUser && mounted) {
            setUser(cachedUser)
            setInitializing(false)
          }

          try {
            const userData = await client.get<User>('/v1/auth/me')

            if (mounted) {
              setUser(userData)
              setCachedUser(userData)
            }
          } catch (authErr) {
            if (mounted) {
              // Session invalid, clear it
              setUser(null)
              setCachedUser(null)
              await client.clearSession()
              if (onAuthError && authErr && typeof authErr === 'object' && 'code' in authErr) {
                onAuthError(authErr as { code: string; message: string })
              }
            }
          }
        } else if (cachedUser) {
          // No session but stale cache — clear it
          setCachedUser(null)
        }
      } catch (err) {
        if (mounted && debug) {
          console.error('[ScaleMule] Initialization error:', err)
        }
      } finally {
        if (mounted) {
          setInitializing(false)
        }
      }
    }

    initialize()

    return () => {
      mounted = false
    }
  }, [client, debug, onAuthError, authProxyUrl])

  // Wrap setUser to trigger callbacks and sync user cache
  const handleSetUser = useCallback(
    (newUser: User | null) => {
      setUser(newUser)
      setCachedUser(newUser)
      if (newUser === null && onLogout) {
        onLogout()
      }
    },
    [onLogout]
  )

  // Context value
  const value = useMemo(
    () => ({
      client,
      money,
      realtime: baseClient.realtime,
      storage: baseClient.storage,
      photo: baseClient.photo,
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      gatewayUrl: resolvedGatewayUrl,
      environment: environment || undefined,
      enableAccountSwitcher,
      accountSwitcherPrivacy,
      bootstrapFlags,
    }),
    [client, money, baseClient, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, resolvedGatewayUrl, environment, enableAccountSwitcher, accountSwitcherPrivacy, bootstrapFlags]
  )

  return (
    <ScaleMuleContext.Provider value={value}>
      {children}
    </ScaleMuleContext.Provider>
  )
}

// ============================================================================
// Hook to access context
// ============================================================================

export function useScaleMule(): ScaleMuleContextValue {
  const context = useContext(ScaleMuleContext)

  if (!context) {
    throw new Error(
      'useScaleMule must be used within a ScaleMuleProvider. ' +
        'Make sure to wrap your app with <ScaleMuleProvider>.'
    )
  }

  return context
}

// ============================================================================
// Hook to access just the client (for lower-level access)
// ============================================================================

export function useScaleMuleClient(): ScaleMuleClient {
  const { client } = useScaleMule()
  return client
}

export function useMoneyClient(): MoneyClient {
  const { money } = useScaleMule()
  return money
}

export const useMoney = useMoneyClient
