import { describe, expect, it } from 'vitest'
import { isSessionEndedError } from './session-errors'
import { ScaleMuleApiError } from './types'

describe('isSessionEndedError', () => {
  it('treats a 401 as a session that has ended', () => {
    expect(isSessionEndedError(new ScaleMuleApiError({ code: 'HTTP_401', message: 'x' }, 401))).toBe(true)
  })

  it.each([
    'UNAUTHORIZED',
    'INVALID_SESSION',
    'SESSION_EXPIRED',
    'SESSION_IDLE_EXPIRED',
    'SESSION_ABSOLUTE_EXPIRED',
    'SESSION_REVOKED',
    'TOKEN_EXPIRED',
    'TOKEN_INVALID',
  ])('treats %s as a session that has ended', (code) => {
    expect(isSessionEndedError({ code, message: 'x' })).toBe(true)
  })

  it.each([
    ['a malformed request', { code: 'BAD_REQUEST', message: 'x', status: 400 }],
    ['a rate limit', { code: 'RATE_LIMITED', message: 'x', status: 429 }],
    ['a backend outage', { code: 'HTTP_503', message: 'x', status: 503 }],
    ['a timeout', { code: 'TIMEOUT', message: 'x' }],
    ['a network failure', { code: 'NETWORK_ERROR', message: 'x' }],
    ['a generic refresh failure', { code: 'REFRESH_FAILED', message: 'x' }],
  ])('does not treat %s as a session that has ended', (_label, error) => {
    expect(isSessionEndedError(error)).toBe(false)
  })

  it('ignores non-error values', () => {
    expect(isSessionEndedError(undefined)).toBe(false)
    expect(isSessionEndedError(null)).toBe(false)
    expect(isSessionEndedError('UNAUTHORIZED')).toBe(false)
  })
})
