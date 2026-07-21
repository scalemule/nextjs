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
import { clearSession, SESSION_COOKIE_NAME, USER_ID_COOKIE_NAME } from './cookies'

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
