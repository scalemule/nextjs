import { describe, expect, it } from 'vitest';

import { isSafeRedirect, validateSafeRedirect } from './redirect';

describe('validateSafeRedirect', () => {
  it('returns the default path for empty / nullish input', () => {
    expect(validateSafeRedirect(undefined)).toBe('/');
    expect(validateSafeRedirect(null)).toBe('/');
    expect(validateSafeRedirect('')).toBe('/');
    expect(validateSafeRedirect('   ')).toBe('/');
  });

  it('honors a custom default path', () => {
    expect(validateSafeRedirect(undefined, { defaultPath: '/dashboard' })).toBe(
      '/dashboard',
    );
  });

  it('accepts simple same-origin relative paths', () => {
    expect(validateSafeRedirect('/foo')).toBe('/foo');
    expect(validateSafeRedirect('/foo/bar?x=1#frag')).toBe('/foo/bar?x=1#frag');
    expect(validateSafeRedirect('/')).toBe('/');
  });

  it('rejects schema-relative URLs (open-redirect classic)', () => {
    expect(validateSafeRedirect('//evil.example.com/path')).toBe('/');
    expect(validateSafeRedirect('//evil.example.com')).toBe('/');
  });

  it('rejects backslash-prefixed paths some browsers normalize', () => {
    expect(validateSafeRedirect('\\/\\/evil.example.com')).toBe('/');
    expect(validateSafeRedirect('\\evil.example.com')).toBe('/');
    expect(validateSafeRedirect('/\\evil.example.com')).toBe('/');
  });

  it('rejects javascript: and data: schemes', () => {
    expect(validateSafeRedirect('javascript:alert(1)')).toBe('/');
    expect(validateSafeRedirect('JAVASCRIPT:alert(1)')).toBe('/');
    expect(validateSafeRedirect('data:text/html,<script>alert(1)</script>')).toBe(
      '/',
    );
    expect(validateSafeRedirect('mailto:evil@example.com')).toBe('/');
    expect(validateSafeRedirect('vbscript:msgbox(1)')).toBe('/');
  });

  it('rejects bare hostnames (no scheme, no leading slash)', () => {
    expect(validateSafeRedirect('example.com/foo')).toBe('/');
    expect(validateSafeRedirect('foo')).toBe('/');
  });

  it('rejects absolute URLs whose origin is not allow-listed', () => {
    expect(validateSafeRedirect('https://evil.example.com/steal')).toBe('/');
    expect(
      validateSafeRedirect('https://evil.example.com/steal', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe('/');
  });

  it('accepts absolute URLs whose origin is allow-listed', () => {
    expect(
      validateSafeRedirect('https://app.example.com/dashboard?x=1', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe('/dashboard?x=1');
  });

  it('strips same-origin scheme+host by default', () => {
    expect(
      validateSafeRedirect('https://app.example.com/foo#frag', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe('/foo#frag');
  });

  it('keeps absolute URL when stripSameOriginHost=false', () => {
    expect(
      validateSafeRedirect('https://app.example.com/foo?x=1', {
        allowedOrigins: ['https://app.example.com'],
        stripSameOriginHost: false,
      }),
    ).toBe('https://app.example.com/foo?x=1');
  });

  it('origin comparison is case-insensitive', () => {
    expect(
      validateSafeRedirect('HTTPS://APP.example.com/x', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe('/x');
    expect(
      validateSafeRedirect('https://app.example.com/x', {
        allowedOrigins: ['HTTPS://APP.example.COM'],
      }),
    ).toBe('/x');
  });

  it('returns "/" for URLs that fail to parse', () => {
    expect(validateSafeRedirect('http://[invalid')).toBe('/');
  });

  it('handles empty root path on same-origin absolute', () => {
    expect(
      validateSafeRedirect('https://app.example.com', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe('/');
  });

  it('handles port in the allowed origin', () => {
    expect(
      validateSafeRedirect('http://localhost:3000/x', {
        allowedOrigins: ['http://localhost:3000'],
      }),
    ).toBe('/x');
    expect(
      validateSafeRedirect('http://localhost:4000/x', {
        allowedOrigins: ['http://localhost:3000'],
      }),
    ).toBe('/');
  });
});

describe('isSafeRedirect', () => {
  it('matches validateSafeRedirect behavior for safe inputs', () => {
    expect(isSafeRedirect('/foo')).toBe(true);
    expect(
      isSafeRedirect('https://app.example.com/foo', {
        allowedOrigins: ['https://app.example.com'],
      }),
    ).toBe(true);
  });

  it('matches validateSafeRedirect behavior for unsafe inputs', () => {
    expect(isSafeRedirect('')).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
    expect(isSafeRedirect('//evil.example.com')).toBe(false);
    expect(isSafeRedirect('javascript:alert(1)')).toBe(false);
    expect(isSafeRedirect('https://evil.example.com')).toBe(false);
  });
});
