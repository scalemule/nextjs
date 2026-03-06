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
  children,
  onLogin,
  onLogout,
  onAuthError,
}: ScaleMuleProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  // Create client instance (memoized to prevent recreating on every render)
  const client = useMemo(
    () =>
      createClient({
        apiKey,
        applicationId,
        environment,
        gatewayUrl,
        debug,
        storage,
      }),
    [apiKey, applicationId, environment, gatewayUrl, debug, storage]
  )

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
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      gatewayUrl: gatewayUrl || (environment === 'dev' ? 'https://api-dev.scalemule.com' : 'https://api.scalemule.com'),
    }),
    [client, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, gatewayUrl, environment]
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
