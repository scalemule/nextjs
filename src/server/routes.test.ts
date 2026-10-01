/**
 * Route handler tests — verify-email session cookie behavior
 *
 * Covers the three cases from Phase 0B:
 * 1. Backend returns session_token + user → route sets sm_session and sm_user_id cookies
 * 2. Backend returns no session → route still returns normal success JSON
 * 3. Existing register/login cookie behavior remains unchanged
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScaleMuleApiError } from '../types'
import { SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'

// ─── Mocks ───────────────────────────────────────────────────────

const mockMe = vi.fn()
const mockVerifyEmail = vi.fn()
const mockLogin = vi.fn()
const mockRegister = vi.fn()
const mockSendMfaCode = vi.fn()
const mockCompleteMfa = vi.fn()
const mockResetPassword = vi.fn()
const mockExchangeHandoff = vi.fn()

vi.mock('./client', () => ({
  createServerClient: () => ({
    auth: {
      exchangeSessionHandoff: mockExchangeHandoff,
      register: mockRegister,
      sendMfaCode: mockSendMfaCode,
      completeMfa: mockCompleteMfa,
      login: mockLogin,
      verifyEmail: mockVerifyEmail,
      logout: vi.fn(),
      me: mockMe,
      refresh: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: mockResetPassword,
      resendVerification: vi.fn(),
    },
    user: {
      update: vi.fn(),
      changePassword: vi.fn(),
      deleteAccount: vi.fn(),
    },
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(null),
  }),
}))

import { createAuthRoutes } from './routes'

// ─── Helpers ─────────────────────────────────────────────────────

function createRequest(path: string, body: unknown) {
  return new Request(`https://example.com/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function contextFor(path: string) {
  return { params: Promise.resolve({ scalemule: [path] }) }
}

// ─── verify-email ────────────────────────────────────────────────

describe('verify-email route', () => {
  beforeEach(() => {
    mockVerifyEmail.mockReset()
  })

  it('sets session cookies when backend returns session_token + user', async () => {
    mockVerifyEmail.mockResolvedValue({
      verified: true,
      session_token: 'tok_verify_session',
      user: { id: 'user-123', email: 'test@example.com' },
      expires_at: '2026-04-01T00:00:00Z',
    })

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('verify-email', { token: '123456' }),
      contextFor('verify-email')
    )

    expect(response.status).toBe(200)

    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(2)

    const sessionCookie = cookies.find(c => c.startsWith(SESSION_COOKIE_NAME))
    expect(sessionCookie).toContain('tok_verify_session')
    expect(sessionCookie).toContain('HttpOnly')

    const userIdCookie = cookies.find(c => c.startsWith(USER_ID_COOKIE_NAME))
    expect(userIdCookie).toContain('user-123')

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.verified).toBe(true)
    expect(body.data.user.id).toBe('user-123')
    expect(body.data.message).toBe('Email verified successfully')
  })

  it('returns success without cookies when backend returns no session', async () => {
    mockVerifyEmail.mockResolvedValue({ verified: true })

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('verify-email', { token: '123456' }),
      contextFor('verify-email')
    )

    expect(response.status).toBe(200)

    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(0)

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('Email verified successfully')
  })

  it('returns error when token is missing', async () => {
    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('verify-email', {}),
      contextFor('verify-email')
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns error when verification fails', async () => {
    mockVerifyEmail.mockRejectedValue(
      new ScaleMuleApiError({ code: 'INVALID_TOKEN', message: 'Token expired' })
    )

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('verify-email', { token: 'expired' }),
      contextFor('verify-email')
    )

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error.code).toBe('INVALID_TOKEN')
    expect(body.error.message).toBe('Token expired')
  })

  it('handles backend returning session_token without user gracefully', async () => {
    mockVerifyEmail.mockResolvedValue({
      verified: true,
      session_token: 'tok_orphan',
    })

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('verify-email', { token: '123456' }),
      contextFor('verify-email')
    )

    // Should NOT set cookies — both session_token AND user are required
    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(0)

    const body = await response.json()
    expect(body.data.message).toBe('Email verified successfully')
  })
})

// ─── register + login cookie behavior unchanged ──────────────────

describe('login route cookie behavior', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('sets session cookies on successful login', async () => {
    mockLogin.mockResolvedValue({
      session_token: 'tok_login',
      user: { id: 'u-login', email: 'login@test.com' },
    })

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('login', { email: 'login@test.com', password: 'Pass123!' }),
      contextFor('login')
    )

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(2)

    const sessionCookie = cookies.find(c => c.startsWith(SESSION_COOKIE_NAME))
    expect(sessionCookie).toContain('tok_login')

    const userIdCookie = cookies.find(c => c.startsWith(USER_ID_COOKIE_NAME))
    expect(userIdCookie).toContain('u-login')
  })
})

describe('register route cookie behavior', () => {
  beforeEach(() => {
    mockRegister.mockReset()
    mockLogin.mockReset()
  })

  it('sets session cookies after register + auto-login', async () => {
    mockRegister.mockResolvedValue({
      id: 'u-new',
      email: 'new@test.com',
    })
    mockLogin.mockResolvedValue({
      session_token: 'tok_register',
      user: { id: 'u-new', email: 'new@test.com' },
    })

    const { POST } = createAuthRoutes()
    const response = await POST(
      createRequest('register', { email: 'new@test.com', password: 'Pass123!' }),
      contextFor('register')
    )

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(2)

    const sessionCookie = cookies.find(c => c.startsWith(SESSION_COOKIE_NAME))
    expect(sessionCookie).toContain('tok_register')

    const userIdCookie = cookies.find(c => c.startsWith(USER_ID_COOKIE_NAME))
    expect(userIdCookie).toContain('u-new')
  })
})

describe('adaptive login route', () => {
  it('forwards proof and never sets cookies for a challenge', async () => {
    mockLogin.mockReset()
    mockLogin.mockRejectedValue(new ScaleMuleApiError({ code: 'LOGIN_CHALLENGE_REQUIRED', message: JSON.stringify({ challenge_token: 'proof' }) }))
    const response = await createAuthRoutes().POST(createRequest('login', { email: 'reader@example.com', password: 'correct', challenge_token: 'old', challenge_code: '123456' }), contextFor('login'))
    expect(response.status).toBe(403)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect((await response.json()).error.code).toBe('LOGIN_CHALLENGE_REQUIRED')
    expect(mockLogin.mock.calls[0][0]).toMatchObject({ challenge_token: 'old', challenge_code: '123456' })
  })
})


describe('MFA proxy routes', () => {
  it('preserves incorrect-code and resend-limit errors without setting cookies', async () => {
    for (const [path, mock, code, status] of [
      ['mfa/verify', mockCompleteMfa, 'INVALID_MFA_CODE', 400],
      ['mfa/send-code', mockSendMfaCode, 'CHALLENGE_RATE_LIMITED', 429],
    ] as const) {
      mock.mockRejectedValueOnce(new ScaleMuleApiError({ code, message: 'Try again' }))
      const response = await createAuthRoutes().POST(createRequest(path, { pending_token: 'pending', method: 'email', code: '123456' }), contextFor(path))
      expect(response.status).toBe(status)
      expect((await response.json()).error.code).toBe(code)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  })
  it('completes the session and account switcher without returning extra backend tokens', async () => {
    mockCompleteMfa.mockResolvedValueOnce({ user: { id: 'user-mfa', email: 'test@example.com' }, session_token: 'session', refresh_token: 'private-refresh' })
    const response = await createAuthRoutes({ enableAccountSwitcher: true }).POST(createRequest('mfa/verify', { pending_token: 'pending', method: 'totp', code: '123456' }), contextFor('mfa/verify'))
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie().join(';')).toContain('HttpOnly')
    const data = (await response.json()).data
    expect(data).toMatchObject({ authenticated: true, userId: 'user-mfa' })
    expect(data).not.toHaveProperty('sessionToken')
    expect(data).not.toHaveProperty('session_token')
    expect(data).not.toHaveProperty('refresh_token')
    expect(response.headers.getSetCookie().length).toBeGreaterThan(2)
  })
  it('rejects missing or invalid MFA methods before making upstream requests', async () => {
    mockCompleteMfa.mockClear()
    for (const method of [undefined, 'unknown']) {
      const response = await createAuthRoutes().POST(createRequest('mfa/verify', { pending_token: 'pending', code: '123456', method }), contextFor('mfa/verify'))
      expect(response.status).toBe(400)
    }
    expect(mockCompleteMfa).not.toHaveBeenCalled()
  })
})

it('clears both old cookies only after successful password recovery', async () => {
  const request = () => { const req = createRequest('reset-password', { token: 'proof', new_password: 'new-password' }); req.headers.set('cookie', 'sm_session=old; sm_user_id=user'); return req }
  mockResetPassword.mockResolvedValueOnce({})
  const response = await createAuthRoutes().POST(request(), contextFor('reset-password'))
  expect(response.status).toBe(200)
  for (const name of ['sm_session', 'sm_user_id']) expect(response.headers.getSetCookie().find(c => c.startsWith(name + '='))).toContain('Max-Age=0')
  expect((await response.json()).data.message).toBe('Password reset successful')
  mockResetPassword.mockRejectedValueOnce(new ScaleMuleApiError({ code: 'INVALID_TOKEN', message: 'Expired' }))
  const failed = await createAuthRoutes().POST(request(), contextFor('reset-password'))
  expect(failed.status).toBe(400)
  expect(failed.headers.get('set-cookie')).toBeNull()
})


describe('HTTP-only session boundary', () => {
  it.each(['login', 'register', 'mfa/verify', 'verify-email'])('never exposes session tokens in %s JSON', async (path) => {
    const user = { id: 'private-user', email: 'person@example.invalid' }
    const result = { user, session_token: 'private-session-value', refresh_token: 'private-refresh-value' }
    mockLogin.mockResolvedValue(result)
    mockRegister.mockResolvedValue(user)
    mockCompleteMfa.mockResolvedValue(result)
    mockVerifyEmail.mockResolvedValue(result)
    const response = await createAuthRoutes().POST(createRequest(path, { email: user.email, password: 'test password', pending_token: 'pending', code: '123456', method: 'totp', token: 'email-proof' }), contextFor(path))
    const body = await response.text()
    expect(response.status).toBe(200)
    expect(body).not.toContain('private-session-value')
    expect(body).not.toContain('private-refresh-value')
    expect(body).not.toContain('sessionToken')
    expect(response.headers.getSetCookie().join(';')).toContain('sm_session=private-session-value')
    expect(response.headers.getSetCookie().join(';')).toContain('HttpOnly')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
  it('keeps both existing and rotated /me tokens out of JSON', async () => {
    const { cookies } = await import('next/headers')
    vi.mocked(cookies).mockResolvedValue({ get: (key: string) => ({ value: key === 'sm_session' ? 'existing-secret' : 'user' }) } as never)
    for (const rotated of [false, true]) {
      mockMe.mockImplementation(async (_token, options) => {
        if (rotated) options.onTokenRotated('rotated-secret')
        return { id: 'user', email: 'person@example.invalid' }
      })
      const response = await createAuthRoutes().GET(new Request('https://example.com/api/auth/me'), contextFor('me'))
      const body = await response.text()
      expect(body).not.toContain('existing-secret')
      expect(body).not.toContain('rotated-secret')
      expect(body).not.toContain('sessionToken')
      if (rotated) expect(response.headers.getSetCookie().join(';')).toContain('sm_session=rotated-secret')
    }
    vi.mocked(cookies).mockResolvedValue({ get: () => null } as never)
  })
  it('rejects cross-origin auth and HTML form submissions', async () => {
    for (const headers of [{ 'Content-Type': 'application/json', origin: 'https://attacker.example' }, { 'Content-Type': 'application/x-www-form-urlencoded' }] as Record<string, string>[]) {
      const response = await createAuthRoutes().POST(new Request('https://example.com/api/auth/logout', { method: 'POST', headers }), contextFor('logout'))
      expect(response.status).toBe(403)
    }
  })
})


it('exchanges an iframe handoff into a partitioned cookie without disclosing the token', async () => {
  mockExchangeHandoff.mockResolvedValue({ session_token: 'handoff-session-secret', user_id: 'frame-user' })
  const response = await createAuthRoutes({ handoffAudience: 'https://app.example.com', handoffCookies: { partitioned: true, sameSite: 'none', secure: true } }).POST(createRequest('handoff/exchange', { code: 'single-use-code', audience: 'https://attacker.invalid' }), contextFor('handoff/exchange'))
  expect(mockExchangeHandoff).toHaveBeenCalledWith('single-use-code', 'https://app.example.com')
  expect(await response.json()).toEqual({ success: true, data: { authenticated: true, userId: 'frame-user' } })
  const cookies = response.headers.getSetCookie().join(';')
  expect(cookies).toContain('sm_session=handoff-session-secret')
  expect(cookies).toContain('HttpOnly')
  expect(cookies).toContain('Secure')
  expect(cookies).toContain('Partitioned')
})
