/**
 * @scalemule/nextjs — Comprehensive Unit Tests
 *
 * Tests:
 * - Validators (email, password, phone, username, uuid, url, fileSize, fileType, displayName)
 * - Log sanitization
 * - Webhook signature verification
 * - Webhook handler
 * - Cookie helpers (withSession, clearSession, getSessionFromRequest)
 * - Client context extraction
 * - CSRF token generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'

// ─── Validators ───────────────────────────────────────────────────

import {
  validators,
  validateForm,
  sanitizeForLog,
  createSafeLogger,
  phoneCountries,
  normalizePhone,
  composePhone,
} from './validation'

describe('validators.email', () => {
  it('accepts valid emails', () => {
    expect(validators.email('user@example.com')).toBe(true)
    expect(validators.email('test+tag@domain.org')).toBe(true)
    expect(validators.email('user.name@sub.domain.com')).toBe(true)
    expect(validators.email('a@b.cc')).toBe(true)
  })

  it('rejects invalid emails', () => {
    expect(validators.email('')).toBe(false)
    expect(validators.email('notanemail')).toBe(false)
    expect(validators.email('@domain.com')).toBe(false)
    expect(validators.email('user@')).toBe(false)
    expect(validators.email(null as any)).toBe(false)
    expect(validators.email(undefined as any)).toBe(false)
  })

  it('rejects emails exceeding length limits', () => {
    const longLocal = 'a'.repeat(65) + '@example.com'
    expect(validators.email(longLocal)).toBe(false)

    const longEmail = 'a@' + 'b'.repeat(252) + '.com'
    expect(validators.email(longEmail)).toBe(false)
  })
})

describe('validators.password', () => {
  it('accepts valid passwords', () => {
    const result = validators.password('MyP@ssw0rd!')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects short passwords', () => {
    const result = validators.password('short')
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('At least 8 characters required')
  })

  it('rejects empty/null passwords', () => {
    expect(validators.password('').valid).toBe(false)
    expect(validators.password(null as any).valid).toBe(false)
    expect(validators.password(null as any).errors).toContain('Password is required')
  })

  it('rejects passwords over 128 chars', () => {
    const result = validators.password('a'.repeat(129))
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Maximum 128 characters')
  })

  it('calculates strength levels', () => {
    // Weak: short or minimal (score < 2)
    expect(validators.password('abc').strength).toBe('weak')
    expect(validators.password('abcdefgh').strength).toBe('weak') // score=1 (8+ only)
    // Fair: 8+ chars with one more factor (score >= 2)
    expect(validators.password('abcdefghijkl').strength).toBe('fair') // score=2 (8+ and 12+)
    // Good: 8+ chars, mixed case, digit (score >= 3)
    expect(validators.password('Abcdefghij1').strength).toBe('good')
    // Strong: 12+ chars, mixed case, digit, special (score >= 4)
    expect(validators.password('Abcdefghij1!').strength).toBe('strong')
  })
})

describe('validators.phone', () => {
  it('accepts valid E.164 numbers', () => {
    const result = validators.phone('+14155551234')
    expect(result.valid).toBe(true)
    expect(result.formatted).toBe('+14155551234')
    expect(result.error).toBeNull()
  })

  it('strips formatting characters', () => {
    const result = validators.phone('+1 (415) 555-1234')
    expect(result.valid).toBe(true)
    expect(result.formatted).toBe('+14155551234')
  })

  it('suggests country code for US numbers', () => {
    const result = validators.phone('4155551234')
    expect(result.valid).toBe(false)
    expect(result.formatted).toBe('+14155551234')
    expect(result.error).toContain('country code')
  })

  it('rejects empty/invalid', () => {
    expect(validators.phone('').valid).toBe(false)
    expect(validators.phone('abc').valid).toBe(false)
    expect(validators.phone(null as any).valid).toBe(false)
  })

  it('normalizes 00-prefixed international numbers', () => {
    const result = validators.phone('00 44 20 1234 5678')
    expect(result.valid).toBe(true)
    expect(result.formatted).toBe('+442012345678')
  })
})

describe('phone helpers', () => {
  it('exports country codes for picker UIs', () => {
    expect(phoneCountries.length).toBeGreaterThan(10)
    expect(phoneCountries.find((country) => country.code === 'US')?.dialCode).toBe('+1')
  })

  it('normalizes and composes phone numbers', () => {
    expect(normalizePhone('(415) 555-1234')).toBe('+4155551234')
    expect(composePhone('+1', '(415) 555-1234')).toBe('+14155551234')
  })
})

describe('validators.username', () => {
  it('accepts valid usernames', () => {
    expect(validators.username('john_doe').valid).toBe(true)
    expect(validators.username('Alice').valid).toBe(true)
    expect(validators.username('user123').valid).toBe(true)
  })

  it('rejects too short', () => {
    expect(validators.username('ab').valid).toBe(false)
    expect(validators.username('ab').error).toContain('3 characters')
  })

  it('rejects too long', () => {
    expect(validators.username('a'.repeat(31)).valid).toBe(false)
    expect(validators.username('a'.repeat(31)).error).toContain('30 characters')
  })

  it('rejects invalid characters', () => {
    expect(validators.username('user name').valid).toBe(false)
    expect(validators.username('user@name').valid).toBe(false)
    expect(validators.username('user-name').valid).toBe(false)
  })

  it('rejects starting with underscore or number', () => {
    expect(validators.username('_user').valid).toBe(false)
    expect(validators.username('1user').valid).toBe(false)
    expect(validators.username('_user').error).toContain('start with a letter')
  })
})

describe('validators.uuid', () => {
  it('accepts valid UUIDs', () => {
    expect(validators.uuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(validators.uuid('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true)
  })

  it('rejects invalid UUIDs', () => {
    expect(validators.uuid('')).toBe(false)
    expect(validators.uuid('not-a-uuid')).toBe(false)
    expect(validators.uuid('550e8400-e29b-41d4-a716')).toBe(false)
    expect(validators.uuid(null as any)).toBe(false)
  })
})

describe('validators.url', () => {
  it('accepts valid URLs', () => {
    expect(validators.url('https://example.com')).toBe(true)
    expect(validators.url('http://localhost:3000')).toBe(true)
    expect(validators.url('https://api.example.com/v1/users')).toBe(true)
  })

  it('rejects invalid URLs', () => {
    expect(validators.url('')).toBe(false)
    expect(validators.url('not a url')).toBe(false)
    expect(validators.url('ftp://example.com')).toBe(false)
    expect(validators.url(null as any)).toBe(false)
  })
})

describe('validators.fileSize', () => {
  it('accepts valid file sizes', () => {
    expect(validators.fileSize(1024).valid).toBe(true)
    expect(validators.fileSize(50 * 1024 * 1024).valid).toBe(true) // 50MB
  })

  it('rejects empty files', () => {
    expect(validators.fileSize(0).valid).toBe(false)
    expect(validators.fileSize(0).error).toContain('empty')
  })

  it('rejects files over limit', () => {
    expect(validators.fileSize(200 * 1024 * 1024).valid).toBe(false) // 200MB > 100MB
    expect(validators.fileSize(200 * 1024 * 1024).error).toContain('100MB')
  })

  it('respects custom max MB', () => {
    expect(validators.fileSize(6 * 1024 * 1024, 5).valid).toBe(false)
    expect(validators.fileSize(4 * 1024 * 1024, 5).valid).toBe(true)
  })

  it('rejects invalid inputs', () => {
    expect(validators.fileSize(-1).valid).toBe(false)
    expect(validators.fileSize(NaN).valid).toBe(false)
    expect(validators.fileSize(1024, NaN as unknown as number).valid).toBe(false)
  })
})

describe('validators.fileType', () => {
  it('accepts default allowed types', () => {
    expect(validators.fileType('image/jpeg').valid).toBe(true)
    expect(validators.fileType('image/png').valid).toBe(true)
    expect(validators.fileType('application/pdf').valid).toBe(true)
  })

  it('rejects disallowed types', () => {
    expect(validators.fileType('application/exe').valid).toBe(false)
    expect(validators.fileType('text/plain').valid).toBe(false)
  })

  it('supports wildcard matching', () => {
    expect(validators.fileType('image/svg+xml', ['image/*']).valid).toBe(true)
    expect(validators.fileType('video/mp4', ['image/*']).valid).toBe(false)
  })

  it('rejects empty/invalid', () => {
    expect(validators.fileType('').valid).toBe(false)
    expect(validators.fileType(null as any).valid).toBe(false)
  })
})

describe('validators.displayName', () => {
  it('accepts valid display names', () => {
    const result = validators.displayName('Jane Doe')
    expect(result.valid).toBe(true)
    expect(result.sanitized).toBe('Jane Doe')
  })

  it('trims and collapses whitespace', () => {
    const result = validators.displayName('  Jane   Doe  ')
    expect(result.valid).toBe(true)
    expect(result.sanitized).toBe('Jane Doe')
  })

  it('rejects control characters', () => {
    const result = validators.displayName('Jane\x00Doe')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid characters')
  })

  it('rejects empty', () => {
    expect(validators.displayName('').valid).toBe(false)
    expect(validators.displayName(null as any).valid).toBe(false)
  })

  it('truncates at 100 chars', () => {
    const result = validators.displayName('a'.repeat(101))
    expect(result.valid).toBe(false)
    expect(result.sanitized.length).toBe(100)
  })
})

describe('validateForm', () => {
  it('validates multiple fields', () => {
    const result = validateForm(
      { email: 'bad', password: 'short' },
      {
        email: (v) => validators.email(v as string),
        password: (v) => validators.password(v as string),
      }
    )

    expect(result.valid).toBe(false)
    expect(result.errors.email).toBeDefined()
    expect(result.errors.password).toBeDefined()
  })

  it('returns valid when all pass', () => {
    const result = validateForm(
      { email: 'user@example.com', password: 'SecurePass123!' },
      {
        email: (v) => validators.email(v as string),
        password: (v) => validators.password(v as string),
      }
    )

    expect(result.valid).toBe(true)
    expect(Object.keys(result.errors)).toHaveLength(0)
  })
})

// ─── Log Sanitization ─────────────────────────────────────────────

describe('sanitizeForLog', () => {
  it('redacts sensitive keys', () => {
    const data = {
      email: 'user@example.com',
      password: 'secret123',
      api_key: 'sk_live_xxx',
      name: 'Jane',
    }
    const result = sanitizeForLog(data) as Record<string, unknown>

    expect(result.email).toBe('user@example.com')
    expect(result.name).toBe('Jane')
    expect(result.password).toBe('[REDACTED]')
    expect(result.api_key).toBe('[REDACTED]')
  })

  it('redacts nested sensitive keys', () => {
    const data = {
      user: { email: 'a@b.com', access_token: 'tok_xxx' },
    }
    const result = sanitizeForLog(data) as any

    expect(result.user.email).toBe('a@b.com')
    expect(result.user.access_token).toBe('[REDACTED]')
  })

  it('handles arrays', () => {
    const data = [{ password: 'secret' }, { name: 'Jane' }]
    const result = sanitizeForLog(data) as any[]

    expect(result[0].password).toBe('[REDACTED]')
    expect(result[1].name).toBe('Jane')
  })

  it('handles null/undefined/primitives', () => {
    expect(sanitizeForLog(null)).toBeNull()
    expect(sanitizeForLog(undefined)).toBeUndefined()
    expect(sanitizeForLog('hello')).toBe('hello')
    expect(sanitizeForLog(42)).toBe(42)
  })
})

describe('createSafeLogger', () => {
  it('creates logger with prefix', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const log = createSafeLogger('[Test]')

    log.info('Hello', { password: 'secret' })

    expect(consoleSpy).toHaveBeenCalledWith('[Test] Hello', { password: '[REDACTED]' })
    consoleSpy.mockRestore()
  })
})

// ─── Webhook Signature Verification ──────────────────────────────

import { verifyWebhookSignature, parseWebhookEvent } from './server/webhooks'

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret-key'
  const payload = JSON.stringify({ event: 'test', data: {} })

  function createSignature(body: string, key: string): string {
    const sig = createHmac('sha256', key).update(body).digest('hex')
    return `sha256=${sig}`
  }

  it('accepts valid signature', () => {
    const signature = createSignature(payload, secret)
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true)
  })

  it('rejects wrong signature', () => {
    const signature = createSignature(payload, 'wrong-secret')
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(false)
  })

  it('rejects signature without sha256= prefix', () => {
    const sig = createHmac('sha256', secret).update(payload).digest('hex')
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(false)
  })

  it('rejects tampered payload', () => {
    const signature = createSignature(payload, secret)
    const tampered = JSON.stringify({ event: 'tampered', data: {} })
    expect(verifyWebhookSignature(tampered, signature, secret)).toBe(false)
  })

  it('rejects garbage signature', () => {
    expect(verifyWebhookSignature(payload, 'sha256=notahexvalue', secret)).toBe(false)
  })
})

describe('parseWebhookEvent', () => {
  it('parses valid event', () => {
    const payload = JSON.stringify({
      event: 'video.ready',
      timestamp: 1234567890,
      data: { video_id: 'v1' },
    })

    const event = parseWebhookEvent(payload)
    expect(event.event).toBe('video.ready')
    expect(event.timestamp).toBe(1234567890)
    expect(event.data.video_id).toBe('v1')
  })
})

// ─── Webhook Handler ─────────────────────────────────────────────

import { createWebhookHandler } from './server/webhook-handler'

describe('createWebhookHandler', () => {
  const secret = 'handler-secret'

  function createRequest(body: string, signature?: string): Request {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (signature) {
      headers['x-webhook-signature'] = signature
    }
    return new Request('https://example.com/webhooks', {
      method: 'POST',
      headers,
      body,
    })
  }

  function sign(body: string): string {
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    return `sha256=${sig}`
  }

  it('returns 200 for valid event', async () => {
    const handler = createWebhookHandler()
    const body = JSON.stringify({ event: 'test.event', data: {} })
    const req = createRequest(body)

    const res = await handler(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.received).toBe(true)
  })

  it('verifies signature when secret provided', async () => {
    const handler = createWebhookHandler({ secret })
    const body = JSON.stringify({ event: 'test.event', data: {} })

    // Without signature
    const res1 = await handler(createRequest(body))
    expect(res1.status).toBe(401)

    // With valid signature
    const res2 = await handler(createRequest(body, sign(body)))
    expect(res2.status).toBe(200)
  })

  it('rejects invalid signature', async () => {
    const handler = createWebhookHandler({ secret })
    const body = JSON.stringify({ event: 'test', data: {} })

    const res = await handler(createRequest(body, 'sha256=invalid'))
    expect(res.status).toBe(401)
  })

  it('calls matching event handler', async () => {
    const onUpload = vi.fn()
    const handler = createWebhookHandler({
      onEvent: { 'storage.file.uploaded': onUpload },
    })

    const body = JSON.stringify({
      event: 'storage.file.uploaded',
      data: { file_id: 'f1' },
    })
    const res = await handler(createRequest(body))

    expect(res.status).toBe(200)
    expect(onUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'storage.file.uploaded',
        data: { file_id: 'f1' },
      })
    )
  })

  it('does not call unrelated handlers', async () => {
    const onUpload = vi.fn()
    const handler = createWebhookHandler({
      onEvent: { 'storage.file.uploaded': onUpload },
    })

    const body = JSON.stringify({ event: 'other.event', data: {} })
    await handler(createRequest(body))

    expect(onUpload).not.toHaveBeenCalled()
  })

  it('returns 500 on handler error', async () => {
    const handler = createWebhookHandler()
    // Invalid JSON will cause parseWebhookEvent to throw
    const req = createRequest('not json')

    const res = await handler(req)
    expect(res.status).toBe(500)
  })
})

// ─── Cookie Helpers ──────────────────────────────────────────────

import {
  withSession,
  clearSession,
  getSessionFromRequest,
  SESSION_COOKIE_NAME,
  USER_ID_COOKIE_NAME,
} from './server/cookies'

describe('withSession', () => {
  it('creates response with session cookies', () => {
    const loginResponse = {
      session_token: 'tok_abc123',
      user: { id: 'user-1', email: 'a@b.com' },
    }

    const response = withSession(loginResponse as any, { user: loginResponse.user })

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(2)

    const sessionCookie = cookies.find(c => c.startsWith(SESSION_COOKIE_NAME))
    expect(sessionCookie).toBeDefined()
    expect(sessionCookie).toContain('tok_abc123')
    expect(sessionCookie).toContain('HttpOnly')

    const userIdCookie = cookies.find(c => c.startsWith(USER_ID_COOKIE_NAME))
    expect(userIdCookie).toBeDefined()
    expect(userIdCookie).toContain('user-1')
  })

  it('returns response body without token', async () => {
    const loginResponse = {
      session_token: 'secret_token',
      user: { id: 'u1', email: 'a@b.com' },
    }

    const response = withSession(loginResponse as any, { user: loginResponse.user })
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.data.user.id).toBe('u1')
    // Session token should NOT be in the response body
    expect(JSON.stringify(body)).not.toContain('secret_token')
  })

  it('respects custom cookie options', () => {
    const loginResponse = {
      session_token: 'tok',
      user: { id: 'u1' },
    }

    const response = withSession(loginResponse as any, {}, {
      domain: '.example.com',
      maxAge: 86400,
    })

    const cookies = response.headers.getSetCookie()
    const sessionCookie = cookies.find(c => c.startsWith(SESSION_COOKIE_NAME))
    expect(sessionCookie).toContain('Domain=.example.com')
    expect(sessionCookie).toContain('Max-Age=86400')
  })
})

describe('clearSession', () => {
  it('creates response that clears cookies', () => {
    const response = clearSession({ message: 'Logged out' })

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie()
    expect(cookies.length).toBe(2)

    // Both cookies should have Max-Age=0
    cookies.forEach(cookie => {
      expect(cookie).toContain('Max-Age=0')
    })
  })

  it('returns response body', async () => {
    const response = clearSession({ message: 'Logged out' })
    const body = await response.json()

    expect(body.success).toBe(true)
    expect(body.data.message).toBe('Logged out')
  })

  it('supports custom status', async () => {
    const response = clearSession({ error: 'Session expired' }, {}, 401)
    expect(response.status).toBe(401)

    const body = await response.json()
    expect(body.success).toBe(false) // status >= 300
  })
})

describe('getSessionFromRequest', () => {
  it('extracts session from cookies', () => {
    const request = new Request('https://example.com', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=tok_abc; ${USER_ID_COOKIE_NAME}=user-1`,
      },
    })

    const session = getSessionFromRequest(request)
    expect(session).not.toBeNull()
    expect(session!.sessionToken).toBe('tok_abc')
    expect(session!.userId).toBe('user-1')
  })

  it('returns null when no cookies', () => {
    const request = new Request('https://example.com')
    expect(getSessionFromRequest(request)).toBeNull()
  })

  it('returns null when session cookie missing', () => {
    const request = new Request('https://example.com', {
      headers: { cookie: `${USER_ID_COOKIE_NAME}=user-1` },
    })
    expect(getSessionFromRequest(request)).toBeNull()
  })

  it('returns null when user ID cookie missing', () => {
    const request = new Request('https://example.com', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=tok_abc` },
    })
    expect(getSessionFromRequest(request)).toBeNull()
  })

  it('decodes URL-encoded cookie values', () => {
    const request = new Request('https://example.com', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=tok%3Dabc; ${USER_ID_COOKIE_NAME}=user-1`,
      },
    })

    const session = getSessionFromRequest(request)
    expect(session!.sessionToken).toBe('tok=abc')
  })
})

// ─── Client Context Extraction ────────────────────────────────────

import { extractClientContext, extractClientContextFromReq, buildClientContextHeaders } from './server/context'

describe('extractClientContext', () => {
  function mockRequest(headers: Record<string, string>, ip?: string) {
    return {
      headers: {
        get: (name: string) => headers[name.toLowerCase()] ?? null,
      },
      ip,
    }
  }

  it('extracts IP from CF-Connecting-IP (highest priority)', () => {
    const req = mockRequest({
      'cf-connecting-ip': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
    })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('1.2.3.4')
  })

  it('extracts IP from DO-Connecting-IP', () => {
    const req = mockRequest({ 'do-connecting-ip': '10.0.0.1' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('10.0.0.1')
  })

  it('extracts IP from X-Real-IP', () => {
    const req = mockRequest({ 'x-real-ip': '192.168.1.1' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('192.168.1.1')
  })

  it('extracts first IP from X-Forwarded-For', () => {
    const req = mockRequest({ 'x-forwarded-for': '203.0.113.1, 70.41.3.18, 150.172.238.178' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('203.0.113.1')
  })

  it('extracts IP from X-Vercel-Forwarded-For', () => {
    const req = mockRequest({ 'x-vercel-forwarded-for': '100.200.0.1' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('100.200.0.1')
  })

  it('extracts IP from True-Client-IP (Akamai)', () => {
    const req = mockRequest({ 'true-client-ip': '172.16.0.1' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('172.16.0.1')
  })

  it('falls back to request.ip', () => {
    const req = mockRequest({}, '127.0.0.1')
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBe('127.0.0.1')
  })

  it('rejects invalid IP addresses', () => {
    const req = mockRequest({ 'cf-connecting-ip': 'not-an-ip' })
    const ctx = extractClientContext(req)
    expect(ctx.ip).toBeUndefined()
  })

  it('extracts user agent', () => {
    const req = mockRequest({ 'user-agent': 'Mozilla/5.0 Test' })
    const ctx = extractClientContext(req)
    expect(ctx.userAgent).toBe('Mozilla/5.0 Test')
  })

  it('extracts device fingerprint', () => {
    const req = mockRequest({ 'x-device-fingerprint': 'fp_abc123' })
    const ctx = extractClientContext(req)
    expect(ctx.deviceFingerprint).toBe('fp_abc123')
  })

  it('extracts referrer', () => {
    const req = mockRequest({ 'referer': 'https://example.com/page' })
    const ctx = extractClientContext(req)
    expect(ctx.referrer).toBe('https://example.com/page')
  })
})

describe('extractClientContextFromReq', () => {
  function mockReq(headers: Record<string, string | string[] | undefined>, remoteAddress?: string) {
    return {
      headers,
      socket: remoteAddress ? { remoteAddress } : undefined,
    }
  }

  it('extracts IP from CF-Connecting-IP', () => {
    const req = mockReq({ 'cf-connecting-ip': '1.2.3.4' })
    const ctx = extractClientContextFromReq(req)
    expect(ctx.ip).toBe('1.2.3.4')
  })

  it('handles array header values', () => {
    const req = mockReq({ 'cf-connecting-ip': ['1.2.3.4', '5.6.7.8'] })
    const ctx = extractClientContextFromReq(req)
    expect(ctx.ip).toBe('1.2.3.4')
  })

  it('falls back to socket.remoteAddress', () => {
    const req = mockReq({}, '10.0.0.1')
    const ctx = extractClientContextFromReq(req)
    expect(ctx.ip).toBe('10.0.0.1')
  })

  it('extracts user agent and fingerprint', () => {
    const req = mockReq({
      'user-agent': 'TestAgent/1.0',
      'x-device-fingerprint': 'fp_xyz',
      'referer': 'https://test.com',
    })
    const ctx = extractClientContextFromReq(req)
    expect(ctx.userAgent).toBe('TestAgent/1.0')
    expect(ctx.deviceFingerprint).toBe('fp_xyz')
    expect(ctx.referrer).toBe('https://test.com')
  })
})

describe('buildClientContextHeaders', () => {
  it('builds headers from context', () => {
    const headers = buildClientContextHeaders({
      ip: '1.2.3.4',
      userAgent: 'TestAgent',
      deviceFingerprint: 'fp_abc',
      referrer: 'https://example.com',
    })

    expect(headers['x-sm-forwarded-client-ip']).toBe('1.2.3.4')
    expect(headers['X-Client-IP']).toBe('1.2.3.4')
    expect(headers['X-Client-User-Agent']).toBe('TestAgent')
    expect(headers['X-Client-Device-Fingerprint']).toBe('fp_abc')
    expect(headers['X-Client-Referrer']).toBe('https://example.com')
  })

  it('skips undefined fields', () => {
    const headers = buildClientContextHeaders({ ip: '1.2.3.4' })
    expect(headers['x-sm-forwarded-client-ip']).toBe('1.2.3.4')
    expect(headers['X-Client-IP']).toBe('1.2.3.4')
    expect(headers['X-Client-User-Agent']).toBeUndefined()
  })

  it('returns empty for undefined context', () => {
    const headers = buildClientContextHeaders(undefined)
    expect(Object.keys(headers)).toHaveLength(0)
  })
})

// ─── CSRF Token Generation ───────────────────────────────────────

import { generateCSRFToken, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './server/csrf'

describe('CSRF', () => {
  it('generates 64-char hex token', () => {
    const token = generateCSRFToken()
    expect(token).toHaveLength(64)
    expect(/^[0-9a-f]+$/.test(token)).toBe(true)
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateCSRFToken()))
    expect(tokens.size).toBe(100)
  })

  it('exports correct constant names', () => {
    expect(CSRF_COOKIE_NAME).toBe('sm_csrf')
    expect(CSRF_HEADER_NAME).toBe('x-csrf-token')
  })
})

// ─── Cookie Constants ────────────────────────────────────────────

describe('Cookie constants', () => {
  it('exports correct cookie names', () => {
    expect(SESSION_COOKIE_NAME).toBe('sm_session')
    expect(USER_ID_COOKIE_NAME).toBe('sm_user_id')
  })
})
