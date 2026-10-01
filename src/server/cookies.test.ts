/**
 * Regression tests for session cookie clearing.
 *
 * Background: `createClearCookieHeader` omitted SameSite/Secure, so in
 * cross-site contexts (embedded Zendesk apps) browsers rejected the
 * Max-Age=0 deletion header outright — the session cookie survived logout
 * and users embedded in Zendesk could never sign out (found 2026-07-19).
 * The clear header must mirror the attributes used when setting the cookie.
 */

import { describe, it, expect } from 'vitest'
import { withSession, withRefreshedSession, clearSession, getSessionFromRequest, SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'

function setCookieHeaders(res: Response): string[] {
  // Headers.getSetCookie() is available in the runtimes we target
  return (res.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
}

describe('clearSession cookie attributes', () => {
  it('mirrors SameSite=None + Secure + Domain so cross-site deletion is accepted', () => {
    const res = clearSession(
      { message: 'ok' },
      { sameSite: 'none', secure: true, domain: '.mergeyard.com' }
    )
    const cookies = setCookieHeaders(res)
    expect(cookies).toHaveLength(2)
    for (const name of [SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME]) {
      const header = cookies.find((c) => c.startsWith(`${name}=`))
      expect(header, `${name} clear header`).toBeDefined()
      expect(header).toContain('Max-Age=0')
      expect(header).toContain('SameSite=none')
      expect(header).toContain('Secure')
      expect(header).toContain('Domain=.mergeyard.com')
      expect(header).toContain('HttpOnly')
    }
  })

  it('defaults to SameSite=lax without Domain when no options are given', () => {
    const res = clearSession({ message: 'ok' }, { secure: false })
    for (const header of setCookieHeaders(res)) {
      expect(header).toContain('Max-Age=0')
      expect(header).toContain('SameSite=lax')
      expect(header).not.toContain('Domain=')
    }
  })
})

describe('bearer session fallback', () => {
  it('getSessionFromRequest accepts Authorization Bearer + x-sm-user-id when cookies are absent', () => {
    const req = new Request('https://app.test/api/x', {
      headers: {
        authorization: 'Bearer tok_123',
        'x-sm-user-id': 'user_456',
      },
    })
    const session = getSessionFromRequest(req)
    expect(session?.sessionToken).toBe('tok_123')
    expect(session?.userId).toBe('user_456')
  })

  it('cookies win over bearer headers when both are present', () => {
    const req = new Request('https://app.test/api/x', {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=cookie_tok; ${USER_ID_COOKIE_NAME}=cookie_user`,
        authorization: 'Bearer tok_123',
        'x-sm-user-id': 'user_456',
      },
    })
    const session = getSessionFromRequest(req)
    expect(session?.sessionToken).toBe('cookie_tok')
    expect(session?.userId).toBe('cookie_user')
  })

  it('rejects bearer without user id, and non-bearer authorization', () => {
    expect(
      getSessionFromRequest(
        new Request('https://app.test/x', { headers: { authorization: 'Bearer tok' } })
      )
    ).toBeNull()
    expect(
      getSessionFromRequest(
        new Request('https://app.test/x', {
          headers: { authorization: 'Basic abc', 'x-sm-user-id': 'u' },
        })
      )
    ).toBeNull()
  })
})


it('clears legacy cookies before issuing partitioned sessions and clears both on logout', () => {
  const options = { partitioned: true, sameSite: 'none' as const, secure: true, domain: '.example.com' }
  for (const response of [withSession({ session_token: 'secret', user: { id: 'user' } }, {}, options), withRefreshedSession('rotated', 'user', {}, options)]) {
    const cookies = setCookieHeaders(response)
    expect(cookies).toHaveLength(4)
    for (const cookie of cookies.slice(0, 2)) {
      expect(cookie).toContain('Max-Age=0')
      expect(cookie).not.toContain('Partitioned')
    }
    for (const cookie of cookies.slice(2)) {
      expect(cookie).toContain('Partitioned')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
    }
  }
  const cleared = setCookieHeaders(clearSession({}, options))
  expect(cleared).toHaveLength(4)
  expect(cleared.every(c => c.includes('Max-Age=0'))).toBe(true)
})
