/**
 * ScaleMule Signals error-context tests.
 *
 * The platform error envelope is
 * `{ success:false, error:{ code, message, field }, meta:{ timestamp, request_id } }`
 * and the gateway echoes `x-request-id` on every response. These tests pin the
 * additive context the Next.js SDK surfaces — on `ScaleMuleApiError` for calls
 * it makes, and as `meta.request_id` on the JSON `apiHandler()` returns — so
 * `@scalemule/signals` `fromError` can attribute a failure to a field and
 * correlate it with a request id end to end.
 *
 * See ADR-2026-08-15 "ScaleMule Signals".
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCreateMoneyClient } = vi.hoisted(() => ({
  mockCreateMoneyClient: vi.fn(() => ({ withAccessToken: vi.fn() })),
}))

vi.mock('@scalemule/money', () => ({ createMoneyClient: mockCreateMoneyClient }))

import { withErrorContext } from './error-context'
import { ScaleMuleApiError } from './types'
import { ScaleMuleError, unwrap } from './server/errors'
import { apiHandler } from './server/handler'
import { NextRequest } from 'next/server'
import { ScaleMuleServer } from './server/client'

function headers(map: Record<string, string> = {}) {
  return new Headers(map)
}

// ============================================================================
// withErrorContext
// ============================================================================

describe('withErrorContext', () => {
  it('lifts request id, trace id and the raw problem off the envelope', () => {
    const rawError = { code: 'validation_error', message: 'Bad email', field: 'email' }
    const body = {
      success: false,
      error: rawError,
      meta: { timestamp: '2026-08-15T10:00:00Z', request_id: 'req_body', trace_id: 'trace_1' },
    }

    const enriched = withErrorContext(rawError, body, headers())

    expect(enriched.requestId).toBe('req_body')
    expect(enriched.traceId).toBe('trace_1')
    expect(enriched.problem).toBe(rawError)
    expect(enriched.code).toBe('validation_error')
    expect(enriched.field).toBe('email')
  })

  it('never mutates the caller error into a self-referencing object', () => {
    // `error` and `responseData.error` are the same object at the call sites,
    // so an in-place `error.problem = responseData.error` would create a cycle
    // and break JSON.stringify for anyone logging the failure.
    const rawError = { code: 'not_found', message: 'Gone' }
    const body = { error: rawError }

    const enriched = withErrorContext(rawError, body, headers())

    expect(enriched).not.toBe(rawError)
    expect(rawError).toEqual({ code: 'not_found', message: 'Gone' })
    expect(() => JSON.stringify(enriched)).not.toThrow()
  })

  it('falls back to the x-request-id header when meta is absent', () => {
    const enriched = withErrorContext(
      { code: 'forbidden', message: 'No' },
      { error: { code: 'forbidden', message: 'No' } },
      headers({ 'x-request-id': 'req_header' })
    )

    expect(enriched.requestId).toBe('req_header')
    expect(enriched.traceId).toBeUndefined()
  })

  it('prefers meta.request_id over the x-request-id header', () => {
    const enriched = withErrorContext(
      { code: 'forbidden', message: 'No' },
      { error: { code: 'forbidden', message: 'No' }, meta: { request_id: 'req_body_wins' } },
      headers({ 'x-request-id': 'req_header_loses' })
    )

    expect(enriched.requestId).toBe('req_body_wins')
  })

  it('adds nothing when the response carries no context', () => {
    const enriched = withErrorContext({ code: 'HTTP_500', message: 'boom' }, null, headers())

    expect(enriched).toEqual({ code: 'HTTP_500', message: 'boom' })
  })
})

// ============================================================================
// ScaleMuleApiError
// ============================================================================

describe('ScaleMuleApiError', () => {
  it('carries requestId, traceId and problem through the constructor', () => {
    const problem = { code: 'conflict', message: 'Taken', field: 'username' }
    const err = new ScaleMuleApiError(
      { ...problem, requestId: 'req_1', traceId: 'trace_1', problem },
      409
    )

    expect(err.code).toBe('conflict')
    expect(err.message).toBe('Taken')
    expect(err.field).toBe('username')
    expect(err.status).toBe(409)
    expect(err.requestId).toBe('req_1')
    expect(err.traceId).toBe('trace_1')
    expect(err.problem).toBe(problem)
  })

  it('leaves the new fields undefined for a bare error', () => {
    const err = new ScaleMuleApiError({ code: 'unknown', message: 'x' })

    expect(err.requestId).toBeUndefined()
    expect(err.traceId).toBeUndefined()
    expect(err.problem).toBeUndefined()
  })
})

// ============================================================================
// Server client
// ============================================================================

describe('ScaleMuleServer request errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function server() {
    return new ScaleMuleServer({ apiKey: 'sm_server_key', gatewayUrl: 'https://api.test' })
  }

  it('attaches Signals context to a thrown ScaleMuleApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'validation_error', message: 'Bad email', field: 'email' },
            meta: { request_id: 'req_server', trace_id: 'trace_server' },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      )
    )

    const err = await server()
      .auth.me('token')
      .catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ScaleMuleApiError)
    const apiErr = err as ScaleMuleApiError
    expect(apiErr.code).toBe('validation_error')
    expect(apiErr.field).toBe('email')
    expect(apiErr.requestId).toBe('req_server')
    expect(apiErr.traceId).toBe('trace_server')
    expect(apiErr.problem).toEqual({
      code: 'validation_error',
      message: 'Bad email',
      field: 'email',
    })
  })

  it('falls back to the x-request-id response header', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: { code: 'not_found', message: 'Gone' } }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_hdr' },
        })
      )
    )

    const err = (await server()
      .auth.me('token')
      .catch((e: unknown) => e)) as ScaleMuleApiError

    expect(err.requestId).toBe('req_hdr')
  })
})

// ============================================================================
// unwrap() + apiHandler()
// ============================================================================

describe('ScaleMuleError request id propagation', () => {
  it('unwrap() lifts request_id off the envelope meta', () => {
    const err = (() => {
      try {
        unwrap({
          success: false,
          data: null,
          error: { code: 'not_found', message: 'Snap not found' },
          meta: { request_id: 'req_env' },
        })
      } catch (e) {
        return e as ScaleMuleError
      }
    })()

    expect(err).toBeInstanceOf(ScaleMuleError)
    expect(err!.code).toBe('not_found')
    expect(err!.status).toBe(404)
    expect(err!.requestId).toBe('req_env')
  })

  it('unwrap() prefers a request id already on the error object', () => {
    const err = (() => {
      try {
        unwrap({
          success: false,
          data: null,
          error: { code: 'not_found', message: 'x', requestId: 'req_on_error' },
          meta: { request_id: 'req_on_meta' },
        })
      } catch (e) {
        return e as ScaleMuleError
      }
    })()

    expect(err!.requestId).toBe('req_on_error')
  })

  it('apiHandler() echoes meta.request_id when the error carries one', async () => {
    const handler = apiHandler(async () => {
      throw new ScaleMuleError('not_found', 'Snap not found', 404, undefined, 'req_echo')
    })

    const res = await handler(new NextRequest('https://example.com/api/snaps/1'), undefined)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({
      success: false,
      error: { code: 'not_found', message: 'Snap not found' },
      meta: { request_id: 'req_echo' },
    })
  })

  it('apiHandler() omits meta entirely when there is no request id', async () => {
    const handler = apiHandler(async () => {
      throw new ScaleMuleError('validation_error', 'Phone required', 400)
    })

    const res = await handler(new NextRequest('https://example.com/api/snaps'), undefined)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({
      success: false,
      error: { code: 'validation_error', message: 'Phone required' },
    })
    expect('meta' in body).toBe(false)
  })
})
