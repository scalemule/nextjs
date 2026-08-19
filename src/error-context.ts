/**
 * Signals error context.
 *
 * The platform error envelope is
 * `{ success:false, error:{ code, message, field }, meta:{ timestamp, request_id } }`
 * and the gateway echoes `x-request-id` on every response. This helper lifts
 * that context onto an `ApiError` so `ScaleMuleApiError` can carry it to the
 * caller (and on to `@scalemule/signals` `fromError`).
 *
 * See ADR-2026-08-15 "ScaleMule Signals".
 */

import type { ApiError } from './types'

/** Minimal shape shared by `Headers` and an XHR header-reader shim. */
export interface HeaderReader {
  get(name: string): string | null
}

/**
 * Return a copy of `error` enriched with `requestId`, `traceId` and `problem`
 * when the response supplies them.
 *
 * Always returns a **new** object. The caller's `error` is frequently the very
 * `responseData.error` object we also store as `problem`; mutating it in place
 * would make `error.problem === error`, and that cycle breaks `JSON.stringify`
 * and `structuredClone` for anyone logging or posting the error.
 */
export function withErrorContext(
  error: ApiError,
  responseData: Record<string, unknown> | null | undefined,
  headers?: HeaderReader
): ApiError {
  const enriched: ApiError = { ...error }

  const meta = responseData?.meta as
    | { request_id?: string; trace_id?: string }
    | undefined

  const requestId = meta?.request_id ?? headers?.get('x-request-id') ?? undefined
  if (requestId !== undefined && enriched.requestId === undefined) {
    enriched.requestId = requestId
  }

  const traceId = meta?.trace_id
  if (traceId !== undefined && enriched.traceId === undefined) {
    enriched.traceId = traceId
  }

  const rawError = responseData?.error
  if (
    rawError !== null &&
    typeof rawError === 'object' &&
    enriched.problem === undefined
  ) {
    enriched.problem = rawError
  }

  return enriched
}
