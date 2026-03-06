/**
 * Error utilities for ScaleMule API route handlers.
 *
 * ScaleMuleError is a throwable error with HTTP status code.
 * unwrap() converts SDK { data, error } results into throw-on-error.
 * errorCodeToStatus() maps error codes to HTTP status codes.
 */

import type { ApiError } from '../types'

// ============================================================================
// ScaleMuleError
// ============================================================================

/**
 * Throwable error with HTTP status code and machine-readable error code.
 *
 * Throw this from apiHandler() callbacks to return a formatted error response.
 *
 * @example
 * ```ts
 * throw new ScaleMuleError('NOT_FOUND', 'Snap not found', 404)
 * throw new ScaleMuleError('FORBIDDEN', 'Not your snap', 403)
 * ```
 */
export class ScaleMuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ScaleMuleError'
  }
}

// ============================================================================
// Error Code → HTTP Status Mapping
// ============================================================================

/**
 * Maps machine-readable error codes to HTTP status codes.
 *
 * The server already sends status codes on ApiError, so this is a fallback
 * for SDK-generated errors or errors missing a status field.
 */
const CODE_TO_STATUS: Record<string, number> = {
  // Auth (401)
  unauthorized: 401,
  invalid_credentials: 401,
  session_expired: 401,
  token_expired: 401,
  token_invalid: 401,

  // Forbidden (403)
  forbidden: 403,
  email_not_verified: 403,
  phone_not_verified: 403,
  account_locked: 403,
  account_disabled: 403,
  mfa_required: 403,
  csrf_error: 403,
  origin_not_allowed: 403,

  // Not found (404)
  not_found: 404,

  // Conflict (409)
  conflict: 409,
  email_taken: 409,

  // Rate limiting (429)
  rate_limited: 429,
  quota_exceeded: 429,

  // Validation (400)
  validation_error: 400,
  weak_password: 400,
  invalid_email: 400,
  invalid_otp: 400,
  otp_expired: 400,

  // Server (500)
  internal_error: 500,

  // Network — SDK-generated (502/504)
  network_error: 502,
  timeout: 504,
}

export function errorCodeToStatus(code: string): number {
  return CODE_TO_STATUS[code.toLowerCase()] || 400
}

// ============================================================================
// unwrap()
// ============================================================================

/**
 * Result shape accepted by unwrap() for backward compatibility.
 * Compatible with both the base SDK's { data, error } and the
 * Next.js SDK's { success, data, error } response contracts.
 */
type SdkResult<T> = {
  data?: T | null
  error?: ApiError | null
  success?: boolean
}

/**
 * Convert an SDK result into throw-on-error, or pass through a raw value.
 *
 * Since SDK methods now throw on error and return data directly,
 * unwrap() acts as a pass-through for direct values. It still supports
 * the legacy { success, data, error } envelope for backward compatibility.
 *
 * @example
 * ```ts
 * // New style (SDK methods throw on error, return T directly):
 * const user = await sm.auth.me(token)
 *
 * // Legacy style (still works with unwrap):
 * const user = unwrap(legacyResult)
 * ```
 */
export function unwrap<T>(result: T | SdkResult<T>): T {
  // If result looks like a legacy envelope, unwrap it
  if (
    result !== null &&
    result !== undefined &&
    typeof result === 'object' &&
    ('success' in result || 'error' in result) &&
    'data' in result
  ) {
    const envelope = result as SdkResult<T>
    if (envelope.error || envelope.success === false) {
      const err = envelope.error
      const code = err?.code || 'UNKNOWN_ERROR'
      const status = (err as Record<string, unknown> | undefined)?.status as number | undefined
        || errorCodeToStatus(code)
      throw new ScaleMuleError(
        code,
        err?.message || 'An error occurred',
        status,
        (err as Record<string, unknown> | undefined)?.details as Record<string, unknown> | undefined
      )
    }
    return envelope.data as T
  }

  // Direct value pass-through (new SDK style)
  return result as T
}
