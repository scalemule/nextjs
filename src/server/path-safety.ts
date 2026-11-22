/**
 * Path-safety helpers for server routes that build gateway URLs.
 *
 * Next.js decodes each dynamic route segment once, so a request for
 * `/api/push/..%2F..%2Fvault%2Fsecrets` reaches the handler as the segment
 * `../../vault/secrets`. Joined into an upstream URL, `fetch()` resolves the
 * dot segments and the request leaves the intended service. Any handler that
 * sends a server credential must therefore:
 *
 *  1. allow-list the exact upstream operations it proxies,
 *  2. validate every caller-supplied segment with `isSafePathSegment`, and
 *  3. `encodeURIComponent` each segment it places in the upstream path.
 */

// Control characters (C0 + DEL) never belong in a path segment.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/

/**
 * Whether a decoded route segment is safe to place in an upstream path.
 *
 * Rejects: non-strings, empty, `.`, `..`, `/`, `\`, any `%` (an encoded or
 * double-encoded slash, backslash or dot that survived Next's single decode),
 * `?` and `#` (which would end the path), control characters, and segments
 * longer than 256 characters.
 */
export function isSafePathSegment(segment: unknown): segment is string {
  if (typeof segment !== 'string') return false
  if (segment.length === 0 || segment.length > 256) return false
  if (segment === '.' || segment === '..') return false
  if (/[\\/%?#]/.test(segment)) return false
  if (CONTROL.test(segment)) return false
  return true
}

/** Validate then `encodeURIComponent` one segment. Throws on unsafe input. */
export function encodePathSegment(segment: unknown, name = 'path segment'): string {
  if (!isSafePathSegment(segment)) {
    throw new Error(`Invalid ${name}`)
  }
  return encodeURIComponent(segment)
}

/**
 * Whether a request path (before any `?`) contains a dot segment the URL
 * parser would resolve: `.`/`..` or their percent-encoded forms (`%2e`,
 * `.%2e`, `%2e.`, `%2e%2e`, case-insensitive), a backslash, an encoded
 * backslash or a control character.
 */
export function hasUnsafePathSyntax(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0]
  if (pathname.includes('\\') || CONTROL.test(pathname) || /%5c/i.test(pathname)) return true
  return pathname.split('/').some((part) => /^(?:\.|%2e){1,2}$/i.test(part))
}
