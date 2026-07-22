/**
 * Regression tests for server gateway URL resolution.
 *
 * A cell-resident app that set only SCALEMULE_GATEWAY_URL (not the
 * SCALEMULE_API_URL name the resolver looked for) silently fell back to the
 * default PLATFORM gateway and validated sessions against the wrong cell —
 * every server-side auth call returned SESSION_EXPIRED for a valid cell
 * session (MergeYard, post-multi-cell). These pin the resolution order.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { resolveGatewayUrl } from './client'

const SAVED = {
  api: process.env.SCALEMULE_API_URL,
  gateway: process.env.SCALEMULE_GATEWAY_URL,
}

afterEach(() => {
  if (SAVED.api === undefined) delete process.env.SCALEMULE_API_URL
  else process.env.SCALEMULE_API_URL = SAVED.api
  if (SAVED.gateway === undefined) delete process.env.SCALEMULE_GATEWAY_URL
  else process.env.SCALEMULE_GATEWAY_URL = SAVED.gateway
})

describe('resolveGatewayUrl', () => {
  it('explicit config.gatewayUrl wins over everything', () => {
    process.env.SCALEMULE_API_URL = 'https://api-env.example.com'
    process.env.SCALEMULE_GATEWAY_URL = 'https://gateway-env.example.com'
    expect(
      resolveGatewayUrl({ apiKey: 'k', gatewayUrl: 'https://explicit.example.com' }),
    ).toBe('https://explicit.example.com')
  })

  it('falls back to SCALEMULE_API_URL', () => {
    delete process.env.SCALEMULE_GATEWAY_URL
    process.env.SCALEMULE_API_URL = 'https://api-env.example.com'
    expect(resolveGatewayUrl({ apiKey: 'k' })).toBe('https://api-env.example.com')
  })

  it('falls back to SCALEMULE_GATEWAY_URL when SCALEMULE_API_URL is unset (the MergeYard fix)', () => {
    delete process.env.SCALEMULE_API_URL
    process.env.SCALEMULE_GATEWAY_URL = 'https://api-mergeyard.scalemule.com'
    expect(resolveGatewayUrl({ apiKey: 'k' })).toBe(
      'https://api-mergeyard.scalemule.com',
    )
  })

  it('SCALEMULE_API_URL takes precedence over SCALEMULE_GATEWAY_URL when both set', () => {
    process.env.SCALEMULE_API_URL = 'https://api-env.example.com'
    process.env.SCALEMULE_GATEWAY_URL = 'https://gateway-env.example.com'
    expect(resolveGatewayUrl({ apiKey: 'k' })).toBe('https://api-env.example.com')
  })

  it('uses the environment default when no env vars are set', () => {
    delete process.env.SCALEMULE_API_URL
    delete process.env.SCALEMULE_GATEWAY_URL
    const url = resolveGatewayUrl({ apiKey: 'k', environment: 'prod' })
    expect(url).toMatch(/^https:\/\//)
  })
})
