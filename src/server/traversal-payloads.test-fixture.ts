/** Shared traversal payloads for the proxy route tests (not shipped). */
// Payloads as the handler receives them: Next decodes each segment once, so
// `..%2F..%2Fauth%2Fme` arrives as `../../auth/me` and `%252e` as `%2e`.
export const TRAVERSAL_SEGMENTS: string[][] = [
  ['..'],
  ['.'],
  ['../../auth/me'],
  ['..', '..', 'auth', 'me'],
  ['settings', '..', '..', 'vault', 'secrets'],
  ['..%2F..%2Fauth%2Fme'],
  ['%2e%2e'],
  ['%2E%2E', 'send'],
  ['%252e%252e%252f'],
  ['tokens', 'by-id', '..'],
  ['tokens', 'by-id', '../../../vault/secrets'],
  ['tokens', 'by-id', 'a\\..\\b'],
  ['tokens', 'by-id', '%5c'],
  ['tokens', 'by-id', 'abc?x=1'],
  ['tokens', 'by-id', 'abc#frag'],
  ['tokens', 'by-id', 'abc\u0000'],
  ['tokens', 'by-id', 'abc\n'],
  ['tokens', 'by-id', ''],
  ['register/../send'],
  ['send'],
  ['send', 'broadcast'],
  ['topics'],
  ['tokens'],
]
