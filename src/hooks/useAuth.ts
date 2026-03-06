'use client'

import { useCallback, useMemo } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
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

      try {
        return await client.post<User>('/v1/auth/register', data)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }
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

      let loginResult: LoginResponse | LoginResponseWithMFA
      try {
        loginResult = await client.post<LoginResponse | LoginResponseWithMFA>('/v1/auth/login', data)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      // Check if MFA is required
      if ('requires_mfa' in loginResult && loginResult.requires_mfa) {
        // Return MFA challenge, don't set session yet
        return loginResult as LoginResponseWithMFA
      }

      // Normal login - set session
      const loginData = loginResult as LoginResponse
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

      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, 'forgot-password', { body: { email } })
        if (!response.success) {
          const err = response.error || {
            code: 'FORGOT_PASSWORD_FAILED',
            message: 'Failed to send password reset email',
          }
          setError(err)
          throw err
        }
      } else {
        try {
          await client.post('/v1/auth/forgot-password', { email })
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err)
          }
          throw err
        }
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

      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, 'reset-password', { body: { token, new_password: newPassword } })
        if (!response.success) {
          const err = response.error || {
            code: 'RESET_PASSWORD_FAILED',
            message: 'Failed to reset password',
          }
          setError(err)
          throw err
        }
      } else {
        try {
          await client.post('/v1/auth/reset-password', { token, new_password: newPassword })
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err)
          }
          throw err
        }
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

      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, 'verify-email', { body: { token } })
        if (!response.success) {
          const err = response.error || {
            code: 'VERIFY_EMAIL_FAILED',
            message: 'Failed to verify email',
          }
          setError(err)
          throw err
        }
      } else {
        try {
          await client.post('/v1/auth/verify-email', { token })
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err)
          }
          throw err
        }
      }

      // Refresh user to get updated email_verified status
      if (user) {
        if (authProxyUrl) {
          const userResponse = await proxyFetch<{ user: User }>(authProxyUrl, 'me', { method: 'GET' })
          if (userResponse.success && userResponse.data?.user) {
            setUser(userResponse.data.user)
          }
        } else {
          try {
            const userData = await client.get<User>('/v1/auth/me')
            setUser(userData)
          } catch {
            // Ignore refresh errors
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

    if (authProxyUrl) {
      const response = await proxyFetch(authProxyUrl, 'resend-verification', { body: user ? {} : undefined })
      if (!response.success) {
        const err = response.error || {
          code: 'RESEND_FAILED',
          message: 'Failed to resend verification email',
        }
        setError(err)
        throw err
      }
    } else {
      if (!user) {
        const err: ApiError = {
          code: 'NOT_AUTHENTICATED',
          message: 'Must be logged in to resend verification',
        }
        throw err
      }
      try {
        await client.post('/v1/auth/resend-verification')
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }
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

    try {
      const refreshData = await client.post<{ session_token: string; expires_at: string }>(
        '/v1/auth/refresh',
        { session_token: sessionToken }
      )

      const userId = client.getUserId()
      if (userId) {
        await client.setSession(refreshData.session_token, userId)
      }
    } catch (err) {
      await client.clearSession()
      setUser(null)

      if (err instanceof ScaleMuleApiError) {
        setError(err)
      }
      throw err
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

      let oauthData: OAuthStartResponse
      try {
        oauthData = await client.post<OAuthStartResponse>('/v1/auth/oauth/start', {
          provider: config.provider,
          redirect_url: config.redirectUrl,
          scopes: config.scopes,
          state: config.state,
        })
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      // Store state for verification after redirect
      // NOTE: For better security, use server-side routes with httpOnly cookies
      // See setOAuthState/validateOAuthState from '@scalemule/nextjs/server'
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('scalemule_oauth_state', oauthData.state)
      }

      return oauthData
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

      let callbackData: OAuthCallbackResponse
      try {
        callbackData = await client.post<OAuthCallbackResponse>('/v1/auth/oauth/callback', request)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      // Set session
      await client.setSession(callbackData.session_token, callbackData.user.id)
      setUser(callbackData.user)

      return callbackData
    },
    [client, setUser, setError]
  )

  /**
   * Get list of linked OAuth accounts
   */
  const getLinkedAccounts = useCallback(async (): Promise<LinkedAccount[]> => {
    setError(null)

    try {
      const data = await client.get<{ accounts: LinkedAccount[] }>('/v1/auth/oauth/accounts')
      return data.accounts
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        setError(err)
      }
      throw err
    }
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

      let linkData: OAuthStartResponse
      try {
        linkData = await client.post<OAuthStartResponse>('/v1/auth/oauth/link', {
          provider: config.provider,
          redirect_url: config.redirectUrl,
          scopes: config.scopes,
        })
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('scalemule_oauth_state', linkData.state)
      }

      return linkData
    },
    [client, user, setError]
  )

  /**
   * Unlink an OAuth account
   */
  const unlinkAccount = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      setError(null)

      try {
        await client.delete(`/v1/auth/oauth/accounts/${provider}`)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
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

    try {
      return await client.get<MFAStatus>('/v1/auth/mfa/status')
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        setError(err)
      }
      throw err
    }
  }, [client, setError])

  /**
   * Start MFA setup for a method
   */
  const setupMFA = useCallback(
    async (request: MFASetupRequest): Promise<MFATOTPSetupResponse | MFASMSSetupResponse> => {
      setError(null)

      try {
        return await client.post<MFATOTPSetupResponse | MFASMSSetupResponse>(
          '/v1/auth/mfa/setup',
          request
        )
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }
    },
    [client, setError]
  )

  /**
   * Verify and enable MFA
   */
  const verifyMFA = useCallback(
    async (request: MFAVerifyRequest): Promise<void> => {
      setError(null)

      try {
        await client.post('/v1/auth/mfa/verify', request)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
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

      let mfaResult: LoginResponse
      try {
        mfaResult = await client.post<LoginResponse>('/v1/auth/mfa/challenge', {
          challenge_token: challengeToken,
          code,
          method,
        })
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      // Set session after successful MFA
      await client.setSession(mfaResult.session_token, mfaResult.user.id)
      setUser(mfaResult.user)

      return mfaResult
    },
    [client, setUser, setError]
  )

  /**
   * Disable MFA (requires password)
   */
  const disableMFA = useCallback(
    async (password: string): Promise<void> => {
      setError(null)

      try {
        await client.post('/v1/auth/mfa/disable', { password })
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
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

      try {
        const data = await client.post<{ backup_codes: string[] }>('/v1/auth/mfa/backup-codes', {
          password,
        })
        return data.backup_codes
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }
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

      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, 'phone/send-code', { body: request })
        if (!response.success) {
          const err = response.error || {
            code: 'SEND_CODE_FAILED',
            message: 'Failed to send verification code',
          }
          setError(err)
          throw err
        }
      } else {
        try {
          await client.post('/v1/auth/phone/send-code', request)
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err)
          }
          throw err
        }
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

      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, 'phone/verify', { body: request })
        if (!response.success) {
          const err = response.error || {
            code: 'VERIFY_PHONE_FAILED',
            message: 'Failed to verify phone number',
          }
          setError(err)
          throw err
        }
      } else {
        try {
          await client.post('/v1/auth/phone/verify', request)
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err)
          }
          throw err
        }
      }

      // Refresh user to get updated phone_verified status
      if (user) {
        if (authProxyUrl) {
          const userResponse = await proxyFetch<{ user: User }>(authProxyUrl, 'me', { method: 'GET' })
          if (userResponse.success && userResponse.data?.user) {
            setUser(userResponse.data.user)
          }
        } else {
          try {
            const userData = await client.get<User>('/v1/auth/me')
            setUser(userData)
          } catch {
            // Ignore refresh errors
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

      let phoneLoginData: LoginResponse
      try {
        phoneLoginData = await client.post<LoginResponse>('/v1/auth/phone/login', request)
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err)
        }
        throw err
      }

      await client.setSession(phoneLoginData.session_token, phoneLoginData.user.id)
      setUser(phoneLoginData.user)

      return phoneLoginData
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
