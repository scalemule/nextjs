import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PERMISSIONS_POLICY,
  buildSecurityHeaders,
} from './security-headers';

function keys(headers: { key: string }[]): string[] {
  return headers.map((h) => h.key);
}

function valueOf(headers: { key: string; value: string }[], key: string): string | undefined {
  return headers.find((h) => h.key === key)?.value;
}

describe('buildSecurityHeaders', () => {
  it('emits the OWASP baseline by default', () => {
    const out = buildSecurityHeaders();
    expect(keys(out)).toEqual(
      expect.arrayContaining([
        'Strict-Transport-Security',
        'X-Frame-Options',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'X-XSS-Protection',
        'Permissions-Policy',
      ]),
    );
  });

  it('uses a 1-year HSTS max-age with includeSubDomains', () => {
    const out = buildSecurityHeaders();
    expect(valueOf(out, 'Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('adds the preload directive when hstsPreload=true', () => {
    const out = buildSecurityHeaders({ hstsPreload: true });
    expect(valueOf(out, 'Strict-Transport-Security')).toContain('preload');
  });

  it('drops HSTS entirely when includeHsts=false', () => {
    const out = buildSecurityHeaders({ includeHsts: false });
    expect(keys(out)).not.toContain('Strict-Transport-Security');
  });

  it('drops HSTS when hstsMaxAgeSeconds=0', () => {
    const out = buildSecurityHeaders({ hstsMaxAgeSeconds: 0 });
    expect(keys(out)).not.toContain('Strict-Transport-Security');
  });

  it('frameOptions=null suppresses the header', () => {
    const out = buildSecurityHeaders({ frameOptions: null });
    expect(keys(out)).not.toContain('X-Frame-Options');
  });

  it('frameOptions=SAMEORIGIN honors the override', () => {
    const out = buildSecurityHeaders({ frameOptions: 'SAMEORIGIN' });
    expect(valueOf(out, 'X-Frame-Options')).toBe('SAMEORIGIN');
  });

  it('Referrer-Policy defaults to strict-origin-when-cross-origin', () => {
    expect(valueOf(buildSecurityHeaders(), 'Referrer-Policy')).toBe(
      'strict-origin-when-cross-origin',
    );
  });

  it('X-XSS-Protection defaults to "0" per OWASP guidance', () => {
    expect(valueOf(buildSecurityHeaders(), 'X-XSS-Protection')).toBe('0');
  });

  it('X-Content-Type-Options defaults to nosniff', () => {
    expect(valueOf(buildSecurityHeaders(), 'X-Content-Type-Options')).toBe(
      'nosniff',
    );
  });

  it('emits Permissions-Policy with camera/microphone=(self) by default', () => {
    const v = valueOf(buildSecurityHeaders(), 'Permissions-Policy');
    expect(v).toContain('camera=(self)');
    expect(v).toContain('microphone=(self)');
    expect(v).toContain('geolocation=()');
  });

  it('honors a custom Permissions-Policy map', () => {
    const v = valueOf(
      buildSecurityHeaders({
        permissionsPolicy: {
          camera: ['https://trusted.example.com'],
          microphone: 'self',
          geolocation: '*',
        },
      }),
      'Permissions-Policy',
    );
    expect(v).toContain('camera=("https://trusted.example.com")');
    expect(v).toContain('microphone=(self)');
    expect(v).toContain('geolocation=*');
  });

  it('permissionsPolicy=null suppresses the header', () => {
    const out = buildSecurityHeaders({ permissionsPolicy: null });
    expect(keys(out)).not.toContain('Permissions-Policy');
  });

  it('extraHeaders override built-in ones with the same key', () => {
    const out = buildSecurityHeaders({
      extraHeaders: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'",
        },
      ],
    });
    expect(valueOf(out, 'X-Frame-Options')).toBe('SAMEORIGIN');
    expect(valueOf(out, 'Content-Security-Policy')).toBe(
      "default-src 'self'",
    );
  });

  it('extraHeaders merge is case-insensitive on the key', () => {
    const out = buildSecurityHeaders({
      extraHeaders: [{ key: 'x-frame-options', value: 'SAMEORIGIN' }],
    });
    // No duplicate; the existing DENY is replaced with SAMEORIGIN.
    const frameHeaders = out.filter(
      (h) => h.key.toLowerCase() === 'x-frame-options',
    );
    expect(frameHeaders).toHaveLength(1);
    expect(frameHeaders[0].value).toBe('SAMEORIGIN');
  });

  it('defaults shape is Next.js headers()-compatible', () => {
    const out = buildSecurityHeaders();
    for (const h of out) {
      expect(typeof h.key).toBe('string');
      expect(typeof h.value).toBe('string');
      expect(h.key.length).toBeGreaterThan(0);
      expect(h.value.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_PERMISSIONS_POLICY is exported and readable', () => {
    expect(DEFAULT_PERMISSIONS_POLICY.camera).toBe('self');
    expect(DEFAULT_PERMISSIONS_POLICY.geolocation).toBe('()');
  });
});
