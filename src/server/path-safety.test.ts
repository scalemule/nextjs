import { describe, expect, it } from 'vitest'
import { encodePathSegment, hasUnsafePathSyntax, isSafePathSegment } from './path-safety'

describe('isSafePathSegment', () => {
  it('accepts ordinary ids, including non-ASCII text', () => {
    for (const ok of ['019d7453-0000-7000-8000-000000000001', 'abc_DEF-1', 'файл', '文件', 'clip-🎬', 'a.b', '...x']) {
      expect(isSafePathSegment(ok), ok).toBe(true)
    }
  })

  it('rejects traversal, encoded separators and control characters', () => {
    for (const bad of ['', '.', '..', '../x', 'a/b', 'a\\b', '%2e', '%2E%2E', '..%2F', '%2f', '%5C', '%252e%252e', 'a?b', 'a#b', 'a\u0000', 'a\n', 'a\u007f', 'x'.repeat(257)]) {
      expect(isSafePathSegment(bad), JSON.stringify(bad)).toBe(false)
    }
    expect(isSafePathSegment(undefined)).toBe(false)
    expect(isSafePathSegment(42)).toBe(false)
  })

  it('encodes accepted segments', () => {
    expect(encodePathSegment('файл')).toBe(encodeURIComponent('файл'))
    expect(encodePathSegment('a b+c')).toBe('a%20b%2Bc')
    expect(() => encodePathSegment('..')).toThrow()
  })
})

describe('hasUnsafePathSyntax', () => {
  it('flags literal and percent-encoded dot segments and backslashes', () => {
    for (const bad of ['/v1/x/../y', '/v1/x/./y', '/v1/x/%2e%2e/y', '/v1/x/.%2E/y', '/v1/x/%2e./y', '/v1/x/%2e/y', '/v1\\x', '/v1/%5cx', '/v1/x\u0000']) {
      expect(hasUnsafePathSyntax(bad), bad).toBe(true)
    }
  })

  it('accepts normal paths and ignores the query string', () => {
    for (const ok of ['/v1/storage/files/abc/info', '/v1/vault/secrets/webhooks%2Fabc', '/v1/x/a.b', '/v1/x?next=../y']) {
      expect(hasUnsafePathSyntax(ok), ok).toBe(false)
    }
  })
})
