'use client'

import { useCallback, useMemo } from 'react'
import { useScaleMule } from '../provider'
import type {
  User,
  UseAuthReturn,
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  LoginResponseWithMFA,
  ApiError,
  OAuthConfig,
  OAuthStartResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  LinkedAccount,
  OAuthProvider,
  MFAStatus,
  MFASetupRequest,
  MFATOTPSetupResponse,
  MFASMSSetupResponse,
  MFAVerifyRequest,
  MFAMethod,
  PhoneSendCodeRequest,
  PhoneVerifyRequest,
  PhoneLoginRequest,
} from '../types'

/**
 * Authentication hook for ScaleMule
 *
 * Provides login, register, logout, OAuth, MFA, and phone authentication.
 * Automatically manages session tokens and user context.
 *
 * @example
 * ```tsx
 * function LoginPage() {
 *   const { login, startOAuth, loading, error } = useAuth()
 *
 *   // Email/password login
 *   const handleSubmit = async (e) => {
 *     e.preventDefault()
 *     const result = await login({ email, password })
 *
 *     if ('requires_mfa' in result && result.requires_mfa) {
 *       // Redirect to MFA page
 *       setMfaChallenge(result.mfa_challenge)
 *     } else {
 *       // User is logged in
 *       router.push('/dashboard')
 *     }
 *   }
 *
 *   // OAuth login
 *   const handleGoogleLogin = async () => {
 *     const { authorization_url } = await startOAuth({ provider: 'google' })
 *     window.location.href = authorization_url
 *   }
 * }
 * ```
 */
/**
 * Read a cookie value by name from document.cookie
 */
function getCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/**
 * Helper to make a fetch call to the auth proxy and parse the response.
 * Returns the parsed response in { success, data, error } format.
 *
 * Automatically includes CSRF token (double-submit cookie pattern):
 * reads the sm_csrf cookie and sends it as the x-csrf-token header.
 */
async function proxyFetch<T>(
  proxyUrl: string,
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<{ success: boolean; data?: T; error?: ApiError }> {
  const method = options.method || 'POST'
  const headers: Record<string, string> = {}

  if (options.body) {
    headers['Content-Type'] = 'application/json'
  }

  // Include CSRF token on state-changing requests (double-submit cookie pattern)
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = getCookie('sm_csrf')
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken
    }
  }

  const response = await fetch(`${proxyUrl}/${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'include', // Include cookies for session management
  })

  const data = await response.json()
  return data
}

export function useAuth(): UseAuthReturn {
  const { client, user, setUser, initializing, error, setError, authProxyUrl } = useScaleMule()

  // ============================================================================
  // Basic Auth Methods
  // ============================================================================

  /**
   * Register a new user
   */
  const register = useCallback(
    async (data: RegisterRequest): Promise<User> => {
      setError(null)

      if (authProxyUrl) {
        const response = await proxyFetch<{ user: User; message: string }>(
          authProxyUrl, 'register', { body: data }
        )

        if (!response.success || !response.data) {
          const err = response.error || {
            code: 'REGISTER_FAILED',
            message: 'Registration failed',
          }
          setError(err)
          throw err
        }

        return response.data.user
      }

      const response = await client.post<User>('/v1/auth/register', data)

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'REGISTER_FAILED',
          message: 'Registration failed',
        }
        setError(err)
        throw err
      }

      return response.data
    },
    [client, setError, authProxyUrl]
  )

  /**
   * Login with email and password
   * May return MFA challenge if user has MFA enabled
   */
  const login = useCallback(
    async (data: LoginRequest): Promise<LoginResponse | LoginResponseWithMFA> => {
      setError(null)

      if (authProxyUrl) {
        // Proxy mode: session managed by httpOnly cookies
        const response = await proxyFetch<LoginResponse | LoginResponseWithMFA | { user: User }>(
          authProxyUrl, 'login', { body: data }
        )

        if (!response.success || !response.data) {
          const err = response.error || {
            code: 'LOGIN_FAILED',
            message: 'Login failed',
          }
          setError(err)
          throw err
        }

        // Check if MFA is required
        if ('requires_mfa' in response.data && (response.data as LoginResponseWithMFA).requires_mfa) {
          return response.data as LoginResponseWithMFA
        }

        // Proxy sets cookies. Extract user from response.
        const loginData = response.data as LoginResponse | { user: User }
        const responseUser = 'user' in loginData ? loginData.user : null

        if (responseUser) {
          setUser(responseUser)
        }

        return response.data as LoginResponse
      }

      const response = await client.post<LoginResponse | LoginResponseWithMFA>('/v1/auth/login', data)

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'LOGIN_FAILED',
          message: 'Login failed',
        }
        setError(err)
        throw err
      }

      // Check if MFA is required
      if ('requires_mfa' in response.data && response.data.requires_mfa) {
        // Return MFA challenge, don't set session yet
        return response.data as LoginResponseWithMFA
      }

      // Normal login - set session
      const loginData = response.data as LoginResponse
      await client.setSession(loginData.session_token, loginData.user.id)
      setUser(loginData.user)

      return loginData
    },
    [client, setUser, setError, authProxyUrl]
  )

  /**
   * Logout current user
   */
  const logout = useCallback(async (): Promise<void> => {
    setError(null)

    if (authProxyUrl) {
      try {
        await proxyFetch(authProxyUrl, 'logout')
      } catch {
        // Ignore errors - we're logging out anyway
      }
      setUser(null)
      return
    }

    const sessionToken = client.getSessionToken()

    if (sessionToken) {
      try {
        await client.post('/v1/auth/logout', { session_token: sessionToken })
      } catch {
        // Ignore errors - we're logging out anyway
      }
    }

    await client.clearSession()
    setUser(null)
  }, [client, setUser, setError, authProxyUrl])

  /**
   * Request password reset email
   */
  const forgotPassword = useCallback(
    async (email: string): Promise<void> => {
      setError(null)

      const response = authProxyUrl
        ? await proxyFetch(authProxyUrl, 'forgot-password', { body: { email } })
        : await client.post('/v1/auth/forgot-password', { email })

      if (!response.success) {
        const err = response.error || {
          code: 'FORGOT_PASSWORD_FAILED',
          message: 'Failed to send password reset email',
        }
        setError(err)
        throw err
      }
    },
    [client, setError, authProxyUrl]
  )

  /**
   * Reset password with token from email
   */
  const resetPassword = useCallback(
    async (token: string, newPassword: string): Promise<void> => {
      setError(null)

      const response = authProxyUrl
        ? await proxyFetch(authProxyUrl, 'reset-password', { body: { token, new_password: newPassword } })
        : await client.post('/v1/auth/reset-password', { token, new_password: newPassword })

      if (!response.success) {
        const err = response.error || {
          code: 'RESET_PASSWORD_FAILED',
          message: 'Failed to reset password',
        }
        setError(err)
        throw err
      }
    },
    [client, setError, authProxyUrl]
  )

  /**
   * Verify email with token
   */
  const verifyEmail = useCallback(
    async (token: string): Promise<void> => {
      setError(null)

      const response = authProxyUrl
        ? await proxyFetch(authProxyUrl, 'verify-email', { body: { token } })
        : await client.post('/v1/auth/verify-email', { token })

      if (!response.success) {
        const err = response.error || {
          code: 'VERIFY_EMAIL_FAILED',
          message: 'Failed to verify email',
        }
        setError(err)
        throw err
      }

      // Refresh user to get updated email_verified status
      if (user) {
        if (authProxyUrl) {
          const userResponse = await proxyFetch<{ user: User }>(authProxyUrl, 'me', { method: 'GET' })
          if (userResponse.success && userResponse.data?.user) {
            setUser(userResponse.data.user)
          }
        } else {
          const userResponse = await client.get<User>('/v1/auth/me')
          if (userResponse.success && userResponse.data) {
            setUser(userResponse.data)
          }
        }
      }
    },
    [client, user, setUser, setError, authProxyUrl]
  )

  /**
   * Resend email verification
   */
  const resendVerification = useCallback(async (): Promise<void> => {
    setError(null)

    const response = authProxyUrl
      ? await proxyFetch(authProxyUrl, 'resend-verification', { body: user ? {} : undefined })
      : (() => {
          if (!user) {
            const err: ApiError = {
              code: 'NOT_AUTHENTICATED',
              message: 'Must be logged in to resend verification',
            }
            throw err
          }
          return client.post('/v1/auth/resend-verification')
        })()

    const result = await response

    if (!result.success) {
      const err = result.error || {
        code: 'RESEND_FAILED',
        message: 'Failed to resend verification email',
      }
      setError(err)
      throw err
    }
  }, [client, user, setError, authProxyUrl])

  /**
   * Refresh session token
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    setError(null)

    if (authProxyUrl) {
      // Proxy mode: refresh via proxy (cookies handle session)
      const response = await proxyFetch<{ user: User | null; message: string }>(
        authProxyUrl, 'refresh'
      )

      if (!response.success) {
        setUser(null)
        const err = response.error || {
          code: 'REFRESH_FAILED',
          message: 'Session expired',
        }
        setError(err)
        throw err
      }

      if (response.data?.user) {
        setUser(response.data.user)
      }
      return
    }

    const sessionToken = client.getSessionToken()

    if (!sessionToken) {
      const err: ApiError = {
        code: 'NO_SESSION',
        message: 'No active session to refresh',
      }
      setError(err)
      throw err
    }

    const response = await client.post<{ session_token: string; expires_at: string }>(
      '/v1/auth/refresh',
      { session_token: sessionToken }
    )

    if (!response.success || !response.data) {
      await client.clearSession()
      setUser(null)

      const err = response.error || {
        code: 'REFRESH_FAILED',
        message: 'Session expired',
      }
      setError(err)
      throw err
    }

    const userId = client.getUserId()
    if (userId) {
      await client.setSession(response.data.session_token, userId)
    }
  }, [client, setUser, setError, authProxyUrl])

  // ============================================================================
  // OAuth Methods
  // ============================================================================

  /**
   * Start OAuth flow for a provider
   * Returns URL to redirect user to
   *
   * SECURITY NOTE: For production apps, use server-side OAuth routes with
   * setOAuthState/validateOAuthState from '@scalemule/nextjs/server' instead.
   * This ensures OAuth state is stored in httpOnly cookies, preventing XSS attacks.
   *
   * @example Server-side approach (recommended):
   * ```typescript
   * // app/api/auth/oauth/start/route.ts
   * import { setOAuthState } from '@scalemule/nextjs/server'
   *
   * export async function POST(request: NextRequest) {
   *   const result = await sm.auth.startOAuth({ provider: 'google', ... })
   *   return setOAuthState(NextResponse.json(result), result.state)
   * }
   * ```
   */
  const startOAuth = useCallback(
    async (config: OAuthConfig): Promise<OAuthStartResponse> => {
      setError(null)

      const response = await client.post<OAuthStartResponse>('/v1/auth/oauth/start', {
        provider: config.provider,
        redirect_url: config.redirectUrl,
        scopes: config.scopes,
        state: config.state,
      })

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'OAUTH_START_FAILED',
          message: 'Failed to start OAuth flow',
        }
        setError(err)
        throw err
      }

      // Store state for verification after redirect
      // NOTE: For better security, use server-side routes with httpOnly cookies
      // See setOAuthState/validateOAuthState from '@scalemule/nextjs/server'
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('scalemule_oauth_state', response.data.state)
      }

      return response.data
    },
    [client, setError]
  )

  /**
   * Complete OAuth flow after redirect
   *
   * SECURITY NOTE: For production apps, use server-side OAuth callback routes with
   * validateOAuthState/clearOAuthState from '@scalemule/nextjs/server' instead.
   *
   * @example Server-side approach (recommended):
   * ```typescript
   * // app/api/auth/oauth/callback/route.ts
   * import { validateOAuthState, clearOAuthState } from '@scalemule/nextjs/server'
   *
   * export async function GET(request: NextRequest) {
   *   const state = request.nextUrl.searchParams.get('state')
   *   const error = validateOAuthState(request, state)
   *   if (error) return NextResponse.json({ error }, { status: 403 })
   *   // ... complete OAuth flow
   *   return clearOAuthState(response)
   * }
   * ```
   */
  const completeOAuth = useCallback(
    async (request: OAuthCallbackRequest): Promise<OAuthCallbackResponse> => {
      setError(null)

      // Verify state matches what we stored
      // NOTE: For better security, use server-side routes with httpOnly cookies
      if (typeof sessionStorage !== 'undefined') {
        const storedState = sessionStorage.getItem('scalemule_oauth_state')
        if (storedState && storedState !== request.state) {
          const err: ApiError = {
            code: 'OAUTH_STATE_MISMATCH',
            message: 'OAuth state mismatch - possible CSRF attack',
          }
          setError(err)
          throw err
        }
        sessionStorage.removeItem('scalemule_oauth_state')
      }

      const response = await client.post<OAuthCallbackResponse>('/v1/auth/oauth/callback', request)

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'OAUTH_CALLBACK_FAILED',
          message: 'Failed to complete OAuth flow',
        }
        setError(err)
        throw err
      }

      // Set session
      await client.setSession(response.data.session_token, response.data.user.id)
      setUser(response.data.user)

      return response.data
    },
    [client, setUser, setError]
  )

  /**
   * Get list of linked OAuth accounts
   */
  const getLinkedAccounts = useCallback(async (): Promise<LinkedAccount[]> => {
    setError(null)

    const response = await client.get<{ accounts: LinkedAccount[] }>('/v1/auth/oauth/accounts')

    if (!response.success || !response.data) {
      const err = response.error || {
        code: 'GET_ACCOUNTS_FAILED',
        message: 'Failed to get linked accounts',
      }
      setError(err)
      throw err
    }

    return response.data.accounts
  }, [client, setError])

  /**
   * Link a new OAuth account (user must be logged in)
   */
  const linkAccount = useCallback(
    async (config: OAuthConfig): Promise<OAuthStartResponse> => {
      setError(null)

      if (!user) {
        const err: ApiError = {
          code: 'NOT_AUTHENTICATED',
          message: 'Must be logged in to link accounts',
        }
        setError(err)
        throw err
      }

      const response = await client.post<OAuthStartResponse>('/v1/auth/oauth/link', {
        provider: config.provider,
        redirect_url: config.redirectUrl,
        scopes: config.scopes,
      })

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'LINK_ACCOUNT_FAILED',
          message: 'Failed to start account linking',
        }
        setError(err)
        throw err
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('scalemule_oauth_state', response.data.state)
      }

      return response.data
    },
    [client, user, setError]
  )

  /**
   * Unlink an OAuth account
   */
  const unlinkAccount = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      setError(null)

      const response = await client.delete(`/v1/auth/oauth/accounts/${provider}`)

      if (!response.success) {
        const err = response.error || {
          code: 'UNLINK_ACCOUNT_FAILED',
          message: 'Failed to unlink account',
        }
        setError(err)
        throw err
      }
    },
    [client, setError]
  )

  // ============================================================================
  // MFA Methods
  // ============================================================================

  /**
   * Get current MFA status
   */
  const getMFAStatus = useCallback(async (): Promise<MFAStatus> => {
    setError(null)

    const response = await client.get<MFAStatus>('/v1/auth/mfa/status')

    if (!response.success || !response.data) {
      const err = response.error || {
        code: 'GET_MFA_STATUS_FAILED',
        message: 'Failed to get MFA status',
      }
      setError(err)
      throw err
    }

    return response.data
  }, [client, setError])

  /**
   * Start MFA setup for a method
   */
  const setupMFA = useCallback(
    async (request: MFASetupRequest): Promise<MFATOTPSetupResponse | MFASMSSetupResponse> => {
      setError(null)

      const response = await client.post<MFATOTPSetupResponse | MFASMSSetupResponse>(
        '/v1/auth/mfa/setup',
        request
      )

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'MFA_SETUP_FAILED',
          message: 'Failed to setup MFA',
        }
        setError(err)
        throw err
      }

      return response.data
    },
    [client, setError]
  )

  /**
   * Verify and enable MFA
   */
  const verifyMFA = useCallback(
    async (request: MFAVerifyRequest): Promise<void> => {
      setError(null)

      const response = await client.post('/v1/auth/mfa/verify', request)

      if (!response.success) {
        const err = response.error || {
          code: 'MFA_VERIFY_FAILED',
          message: 'Failed to verify MFA code',
        }
        setError(err)
        throw err
      }
    },
    [client, setError]
  )

  /**
   * Complete MFA challenge during login
   */
  const completeMFAChallenge = useCallback(
    async (challengeToken: string, code: string, method: MFAMethod): Promise<LoginResponse> => {
      setError(null)

      const response = await client.post<LoginResponse>('/v1/auth/mfa/challenge', {
        challenge_token: challengeToken,
        code,
        method,
      })

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'MFA_CHALLENGE_FAILED',
          message: 'Failed to complete MFA challenge',
        }
        setError(err)
        throw err
      }

      // Set session after successful MFA
      await client.setSession(response.data.session_token, response.data.user.id)
      setUser(response.data.user)

      return response.data
    },
    [client, setUser, setError]
  )

  /**
   * Disable MFA (requires password)
   */
  const disableMFA = useCallback(
    async (password: string): Promise<void> => {
      setError(null)

      const response = await client.post('/v1/auth/mfa/disable', { password })

      if (!response.success) {
        const err = response.error || {
          code: 'MFA_DISABLE_FAILED',
          message: 'Failed to disable MFA',
        }
        setError(err)
        throw err
      }
    },
    [client, setError]
  )

  /**
   * Regenerate backup codes
   */
  const regenerateBackupCodes = useCallback(
    async (password: string): Promise<string[]> => {
      setError(null)

      const response = await client.post<{ backup_codes: string[] }>('/v1/auth/mfa/backup-codes', {
        password,
      })

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'REGENERATE_CODES_FAILED',
          message: 'Failed to regenerate backup codes',
        }
        setError(err)
        throw err
      }

      return response.data.backup_codes
    },
    [client, setError]
  )

  // ============================================================================
  // Phone Auth Methods
  // ============================================================================

  /**
   * Send verification code to phone
   */
  const sendPhoneCode = useCallback(
    async (request: PhoneSendCodeRequest): Promise<void> => {
      setError(null)

      const response = authProxyUrl
        ? await proxyFetch(authProxyUrl, 'phone/send-code', { body: request })
        : await client.post('/v1/auth/phone/send-code', request)

      if (!response.success) {
        const err = response.error || {
          code: 'SEND_CODE_FAILED',
          message: 'Failed to send verification code',
        }
        setError(err)
        throw err
      }
    },
    [client, setError, authProxyUrl]
  )

  /**
   * Verify phone number
   */
  const verifyPhone = useCallback(
    async (request: PhoneVerifyRequest): Promise<void> => {
      setError(null)

      const response = authProxyUrl
        ? await proxyFetch(authProxyUrl, 'phone/verify', { body: request })
        : await client.post('/v1/auth/phone/verify', request)

      if (!response.success) {
        const err = response.error || {
          code: 'VERIFY_PHONE_FAILED',
          message: 'Failed to verify phone number',
        }
        setError(err)
        throw err
      }

      // Refresh user to get updated phone_verified status
      if (user) {
        if (authProxyUrl) {
          const userResponse = await proxyFetch<{ user: User }>(authProxyUrl, 'me', { method: 'GET' })
          if (userResponse.success && userResponse.data?.user) {
            setUser(userResponse.data.user)
          }
        } else {
          const userResponse = await client.get<User>('/v1/auth/me')
          if (userResponse.success && userResponse.data) {
            setUser(userResponse.data)
          }
        }
      }
    },
    [client, user, setUser, setError, authProxyUrl]
  )

  /**
   * Login with phone number
   */
  const loginWithPhone = useCallback(
    async (request: PhoneLoginRequest): Promise<LoginResponse> => {
      setError(null)

      if (authProxyUrl) {
        const response = await proxyFetch<LoginResponse | { user: User }>(
          authProxyUrl, 'phone/login', { body: request }
        )

        if (!response.success || !response.data) {
          const err = response.error || {
            code: 'PHONE_LOGIN_FAILED',
            message: 'Failed to login with phone',
          }
          setError(err)
          throw err
        }

        const loginData = response.data as LoginResponse | { user: User }
        const responseUser = 'user' in loginData ? loginData.user : null
        if (responseUser) {
          setUser(responseUser)
        }

        return response.data as LoginResponse
      }

      const response = await client.post<LoginResponse>('/v1/auth/phone/login', request)

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'PHONE_LOGIN_FAILED',
          message: 'Failed to login with phone',
        }
        setError(err)
        throw err
      }

      await client.setSession(response.data.session_token, response.data.user.id)
      setUser(response.data.user)

      return response.data
    },
    [client, setUser, setError, authProxyUrl]
  )

  // ============================================================================
  // Return Hook Value
  // ============================================================================

  return useMemo(
    () => ({
      user,
      loading: initializing,
      isAuthenticated: !!user,
      error,
      // Basic auth
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      refreshSession,
      // OAuth
      startOAuth,
      completeOAuth,
      getLinkedAccounts,
      linkAccount,
      unlinkAccount,
      // MFA
      getMFAStatus,
      setupMFA,
      verifyMFA,
      completeMFAChallenge,
      disableMFA,
      regenerateBackupCodes,
      // Phone auth
      sendPhoneCode,
      verifyPhone,
      loginWithPhone,
    }),
    [
      user,
      initializing,
      error,
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      refreshSession,
      startOAuth,
      completeOAuth,
      getLinkedAccounts,
      linkAccount,
      unlinkAccount,
      getMFAStatus,
      setupMFA,
      verifyMFA,
      completeMFAChallenge,
      disableMFA,
      regenerateBackupCodes,
      sendPhoneCode,
      verifyPhone,
      loginWithPhone,
    ]
  )
}
