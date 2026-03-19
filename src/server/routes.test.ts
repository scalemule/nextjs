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

const mockVerifyEmail = vi.fn()
const mockLogin = vi.fn()
const mockRegister = vi.fn()

vi.mock('./client', () => ({
  createServerClient: () => ({
    auth: {
      register: mockRegister,
      login: mockLogin,
      verifyEmail: mockVerifyEmail,
      logout: vi.fn(),
      me: vi.fn(),
      refresh: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
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
