/**
 * Tests for the anonymous-ID propagation through the client-context
 * extraction + header-building utilities. See ../../CHANGELOG entry for
 * the anonymous-ID consolidation work — this file exists to prevent
 * regression on the proxy → gateway forwarding path.
 */
import { describe, it, expect } from 'vitest'
import {
  extractClientContext,
  extractClientContextFromReq,
  buildClientContextHeaders,
} from './context'

function mockRequest(headers: Record<string, string>) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null
      },
    },
  }
}

function mockNodeReq(headers: Record<string, string | string[] | undefined>) {
  return {
    headers,
  }
}

describe('extractClientContext (App Router)', () => {
  it('reads x-anonymous-id off the incoming request', () => {
    const ctx = extractClientContext(
      mockRequest({
        'x-anonymous-id': 'anon-abc-123',
        'x-real-ip': '203.0.113.5',
      })
    )
    expect(ctx.anonymousId).toBe('anon-abc-123')
    expect(ctx.ip).toBe('203.0.113.5')
  })

  it('leaves anonymousId undefined when the header is absent', () => {
    const ctx = extractClientContext(mockRequest({ 'x-real-ip': '203.0.113.5' }))
    expect(ctx.anonymousId).toBeUndefined()
  })
})

describe('extractClientContextFromReq (Pages Router)', () => {
  it('reads x-anonymous-id off Node-style header bag', () => {
    const ctx = extractClientContextFromReq(
      mockNodeReq({
        'x-anonymous-id': 'anon-pages-789',
        'user-agent': 'pagebot/1.0',
      })
    )
    expect(ctx.anonymousId).toBe('anon-pages-789')
    expect(ctx.userAgent).toBe('pagebot/1.0')
  })
})

describe('buildClientContextHeaders', () => {
  it('re-emits x-anonymous-id for the server-to-gateway hop', () => {
    const headers = buildClientContextHeaders({
      ip: '203.0.113.5',
      userAgent: 'foo/1.0',
      anonymousId: 'anon-xyz',
    })
    expect(headers['x-anonymous-id']).toBe('anon-xyz')
    // The IP forwarding shape stays the same — anonymous-id is additive.
    expect(headers['x-sm-forwarded-client-ip']).toBe('203.0.113.5')
    expect(headers['X-Client-User-Agent']).toBe('foo/1.0')
  })

  it('does not emit the header when anonymousId is absent', () => {
    const headers = buildClientContextHeaders({ ip: '203.0.113.5' })
    expect(headers['x-anonymous-id']).toBeUndefined()
  })

  it('returns empty for undefined context', () => {
    expect(buildClientContextHeaders(undefined)).toEqual({})
  })
})

describe('round-trip — extract then re-emit', () => {
  it('forwards the visitor anonymous ID end-to-end', () => {
    // Simulates: browser → proxy route → server-to-gateway call.
    // The browser sets `x-anonymous-id`; the proxy route extracts it;
    // `buildClientContextHeaders` re-emits it on the call to the gateway.
    const ctx = extractClientContext(
      mockRequest({ 'x-anonymous-id': 'visitor-42' })
    )
    const outbound = buildClientContextHeaders(ctx)
    expect(outbound['x-anonymous-id']).toBe('visitor-42')
  })
})
