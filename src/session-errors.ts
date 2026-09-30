/**
 * Session-ending error classification, shared by the server auth routes and
 * the client auth hook.
 *
 * A failed auth call only means the session is gone when the backend says so:
 * a 401, or one of the codes it uses for an invalid, expired or revoked
 * session. Anything else — a malformed request, a rate limit, a backend
 * outage, a timeout — says nothing about the session, and must not sign the
 * user out.
 */

const SESSION_ENDED_CODES = new Set([
  'UNAUTHORIZED',
  'INVALID_SESSION',
  'SESSION_EXPIRED',
  'SESSION_IDLE_EXPIRED',
  'SESSION_ABSOLUTE_EXPIRED',
  'SESSION_REVOKED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
])

export function isSessionEndedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { status, code } = error as { status?: unknown; code?: unknown }
  if (status === 401) return true
  return typeof code === 'string' && SESSION_ENDED_CODES.has(code)
}
