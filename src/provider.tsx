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
import {
  ScaleMule,
  type RealtimeService,
  type StorageService,
  type PhotoService,
  type VideoService,
  type AudioService,
  type TtsService,
  type SocialService,
  type SocialPolicyService,
} from '@scalemule/sdk'
import { ScaleMuleClient, createClient } from './client'
import { setSdkTelemetryEndpoint } from './sdk-telemetry'
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
  /** Base SDK video service — exposed for `useMedia()` and `video.uploadViaStorage()` */
  video: VideoService
  /** Base SDK audio service — exposed for `useMedia()` and `audio.uploadViaStorage()` */
  audio: AudioService
  /** Base SDK media facade — shared upload/list/delete surface across apps and scripts. */
  media: unknown
  /** Base SDK TTS service — exposed for `useTtsJob()` and direct narration requests */
  tts: TtsService
  /** Base SDK social graph service — follow graph, posts, feed, likes, and activity */
  social: SocialService
  /** Base SDK social policy service — privacy decisions, requests, blocks, reports */
  socialPolicy: SocialPolicyService
  /**
   * Default media policy for `useMedia()` calls. Set via
   * `<ScaleMuleProvider mediaPolicy="…">`; per-call overrides win.
   * Undefined falls back to `useMedia()`'s built-in `safe_visible` default.
   */
  mediaPolicy?: import('./hooks/useMedia').MediaPolicy
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
  /**
   * The configured `apiKey` value. Exposed so hooks like `useAnalytics`
   * can detect the proxy-mode sentinel (`'proxy-mode'`) and warn when
   * the corresponding proxy route is missing — silently 401'ing on the
   * fallback is the worst possible failure mode for an analytics path.
   * Treat as read-only diagnostic; consumers should not pass it onward.
   */
  apiKey?: string
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
  /**
   * Default media-pipeline policy applied to `useMedia()` calls when no
   * per-call `policy` override is given. Five modes — see
   * `docs/MEDIA-UPLOADS.md` and the {@link import('./hooks/useMedia').MediaPolicy} type.
   *
   * The platform stores the per-app policy in
   * `application_storage_settings.media_policy` (Phase 4 / P3, live in
   * prod). On boot, the provider fetches `GET /v1/storage/policy` (a
   * lightweight `MemberOrEndUser` endpoint added in `@scalemule/sdk@0.0.45`)
   * and uses the returned policy as the effective default.
   *
   * Passing this prop overrides the auto-fetched value — useful for
   * tests or when an app needs to force a specific mode regardless of
   * platform config.
   */
  mediaPolicy?: import('./hooks/useMedia').MediaPolicy
  /**
   * Member-auth bridge. When set, the provider runs in **member mode**:
   *
   *   - Skips the `/v1/auth/me` end-user lookup and the auth-proxy
   *     `/me` flow. Identity is owned upstream (e.g. `MemberAuthProvider`
   *     in `web/scalemule-app`).
   *   - Calls `getToken()` on mount and propagates the returned token
   *     to all three SDK clients (`client`, `baseClient`, `money`) as a
   *     `Bearer` Authorization header. Returning `null` clears the token.
   *   - Re-polls every {@link memberTokenPollMs} milliseconds (default
   *     60s) so cookie rotation in the host platform is picked up
   *     without a full page reload.
   *
   * Use {@link userResolver} alongside this prop to populate `user` from
   * a member-auth endpoint instead of `/v1/auth/me`.
   *
   * Mutually exclusive with `authProxyUrl`. If both are set, `getToken`
   * wins and the auth-proxy path is skipped.
   */
  getToken?: () => string | null | Promise<string | null>
  /**
   * Resolves the `User` shown to the app in member-auth mode. The
   * provider calls this once after the initial token is set; the host
   * platform typically just returns its own `MemberProfile` mapped to
   * the SDK's `User` shape. Optional — if omitted, `user` stays `null`
   * and the host platform is responsible for surfacing identity.
   */
  userResolver?: () => Promise<User | null>
  /**
   * Member-mode token poll interval in milliseconds. Default 60_000
   * (1 minute). Pass `null` to disable polling (only the mount-time
   * read happens).
   */
  memberTokenPollMs?: number | null
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
  telemetryEndpoint,
  publishableKey,
  enableAccountSwitcher,
  accountSwitcherPrivacy,
  children,
  onLogin,
  onLogout,
  onAuthError,
  bootstrapFlags,
  mediaPolicy,
  getToken,
  userResolver,
  memberTokenPollMs,
}: ScaleMuleProviderProps) {
  const memberMode = typeof getToken === 'function'
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  // Wire SDK-level error telemetry: every non-2xx auth-proxy response
  // ships a structured log entry to this endpoint, so caught-and-
  // displayed errors show up in the host platform's logger alongside
  // uncaught crashes.
  useEffect(() => {
    setSdkTelemetryEndpoint(telemetryEndpoint)
    return () => setSdkTelemetryEndpoint(undefined)
  }, [telemetryEndpoint])
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
        // Make outbound API calls wait for the first token to land in any
        // mode where the provider is responsible for populating the
        // session asynchronously: auth-proxy fetch, or member-mode
        // getToken() callback. Resolved in the init effect below.
        pendingSessionInit: !!authProxyUrl || memberMode,
      }),
    [apiKey, applicationId, environment, resolvedGatewayUrl, debug, storage, authProxyUrl, memberMode]
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

  // Auto-fetch the application's `media_policy` so customer apps don't
  // need to mirror it as a prop. Falls back to the prop if the fetch
  // fails or the prop is set explicitly. The endpoint is `MemberOrEndUser`,
  // so any API-keyed end-user *or* member-auth caller can read it.
  // Companion change in `@scalemule/sdk@0.0.45` exposes `storage.getPolicy()`.
  //
  // In member mode we re-run after the init/refresh effects update the
  // baseClient token; `tokenVersion` bumps on each token set so this
  // effect doesn't fire its first request unauthenticated.
  const [fetchedPolicy, setFetchedPolicy] = useState<
    import('./hooks/useMedia').MediaPolicy | undefined
  >(undefined)
  const [tokenVersion, setTokenVersion] = useState(0)
  useEffect(() => {
    // If the consumer pinned a policy explicitly, don't auto-fetch.
    if (mediaPolicy) return
    // Member mode: hold the fetch until the first token has been
    // applied to baseClient (signaled by tokenVersion > 0).
    if (memberMode && tokenVersion === 0) return
    let mounted = true
    void (async () => {
      try {
        // `getPolicy()` lands in @scalemule/sdk@0.0.45; the type narrowing
        // tolerates older base SDKs that don't expose it yet.
        const fn = (
          baseClient.storage as unknown as {
            getPolicy?: () => Promise<{ data?: { media_policy?: string } }>
          }
        ).getPolicy
        if (typeof fn !== 'function') return
        const r = await fn.call(baseClient.storage)
        if (!mounted) return
        const v = r?.data?.media_policy as import('./hooks/useMedia').MediaPolicy | undefined
        if (
          v === 'fast_trusted' ||
          v === 'safe_visible' ||
          v === 'safe_public' ||
          v === 'moderated' ||
          v === 'compliance'
        ) {
          setFetchedPolicy(v)
        }
      } catch {
        // Network / 4xx — silent. useMedia falls back to safe_visible.
      }
    })()
    return () => {
      mounted = false
    }
  }, [baseClient, mediaPolicy, memberMode, tokenVersion])
  const effectiveMediaPolicy = mediaPolicy ?? fetchedPolicy

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

        // Member-auth mode: token comes from a host-platform callback
        // (e.g. a cookie read inside `MemberAuthProvider`). Identity is
        // owned upstream — no /v1/auth/me, no auth-proxy /me. Skip
        // straight to token sync + optional userResolver.
        if (memberMode) {
          try {
            const token = (await Promise.resolve(getToken!())) ?? null
            if (mounted) {
              if (token) {
                client.setSessionToken(token)
                baseClient.setAccessToken(token)
                money.setAccessToken(token)
              } else {
                client.setSessionToken(null)
                baseClient.clearAccessToken()
                money.setAccessToken(undefined)
              }
              // Signal the policy auto-fetch (and any other token-gated
              // effects) that the first token application has happened.
              setTokenVersion((v) => v + 1)
            }

            if (userResolver) {
              try {
                const resolvedUser = await userResolver()
                if (mounted) {
                  setUser(resolvedUser)
                  setCachedUser(resolvedUser)
                }
              } catch (resolveErr) {
                if (mounted && debug) {
                  console.debug('[ScaleMule] userResolver() failed:', resolveErr)
                }
              }
            }
          } catch (memberErr) {
            if (mounted && debug) {
              console.debug('[ScaleMule] getToken() failed:', memberErr)
            }
          } finally {
            client.resolveSessionPending()
          }
          return
        }

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
            // Network/parse error on /me — treat as no session. Better
            // to briefly show the unauthenticated state than to leave
            // a stale cached user on screen with a cookie that may
            // already be invalid; otherwise a transient /me failure
            // (proxy 500, parse error, mid-deploy blip) leaves the app
            // looking logged-in even though no valid session exists.
            if (mounted) {
              setUser(null)
              setCachedUser(null)
              if (debug) {
                console.debug('[ScaleMule] Auth proxy session check failed; clearing cached user')
              }
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
  }, [client, baseClient, money, debug, onAuthError, authProxyUrl, memberMode, getToken, userResolver])

  // Member-mode token refresh: re-poll `getToken()` periodically so cookie
  // rotation in the host platform propagates to the SDK without a full
  // page reload. Only runs in member mode; default cadence 60s; pass
  // `memberTokenPollMs={null}` to disable.
  useEffect(() => {
    if (!memberMode) return
    if (memberTokenPollMs === null) return
    const interval = memberTokenPollMs ?? 60_000
    if (interval <= 0) return

    let cancelled = false
    const id = setInterval(async () => {
      try {
        const token = (await Promise.resolve(getToken!())) ?? null
        if (cancelled) return
        const current = client.getSessionToken()
        if (token === current) return
        if (token) {
          client.setSessionToken(token)
          baseClient.setAccessToken(token)
          money.setAccessToken(token)
        } else {
          client.setSessionToken(null)
          baseClient.clearAccessToken()
          money.setAccessToken(undefined)
          if (debug) {
            console.debug('[ScaleMule] Member token cleared on refresh')
          }
        }
        setTokenVersion((v) => v + 1)
      } catch (err) {
        if (debug) {
          console.debug('[ScaleMule] Member token refresh failed:', err)
        }
      }
    }, interval)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [memberMode, memberTokenPollMs, getToken, client, baseClient, money, debug])

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
      video: baseClient.video,
      audio: baseClient.audio,
      media: (baseClient as ScaleMule & { media: unknown }).media,
      tts: baseClient.tts,
      social: baseClient.social,
      socialPolicy: baseClient.socialPolicy,
      mediaPolicy: effectiveMediaPolicy,
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      apiKey,
      gatewayUrl: resolvedGatewayUrl,
      environment: environment || undefined,
      enableAccountSwitcher,
      accountSwitcherPrivacy,
      bootstrapFlags,
    }),
    [client, money, baseClient, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, apiKey, resolvedGatewayUrl, environment, enableAccountSwitcher, accountSwitcherPrivacy, bootstrapFlags, effectiveMediaPolicy]
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
