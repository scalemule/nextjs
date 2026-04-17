/**
 * Security-headers helper for Next.js hosts.
 *
 * Returns a shape that drops directly into the `headers()` entry in
 * `next.config.ts` (or the `headers` field of a Route Handler
 * `NextResponse`). Reasonable defaults for the top-of-OWASP headers
 * — HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 * X-XSS-Protection, Permissions-Policy — with knobs for the fields
 * that typically differ by app (HSTS duration, frame ancestors,
 * camera/microphone policies).
 *
 * Framework-agnostic: no imports from `next/*` so the function works
 * in Edge / Node / middleware and is trivially unit-testable.
 */

export interface SecurityHeaderEntry {
  key: string;
  value: string;
}

export interface BuildSecurityHeadersOptions {
  /**
   * HSTS max-age in seconds. Default `31536000` (1 year) — the value
   * required for inclusion on the HSTS preload list. Set to `0` (or
   * pass `includeHsts: false`) to opt out entirely.
   */
  hstsMaxAgeSeconds?: number;
  /** Adds the `includeSubDomains` directive to HSTS. Default `true`. */
  hstsIncludeSubDomains?: boolean;
  /**
   * Adds the `preload` directive to HSTS. Default `false` — only set
   * to `true` after you've read https://hstspreload.org and are ready
   * to commit; reversing it requires months of calendar time.
   */
  hstsPreload?: boolean;
  /** Emit the HSTS header at all. Default `true`. */
  includeHsts?: boolean;

  /**
   * Value for `X-Frame-Options`. Default `'DENY'`. Pass `'SAMEORIGIN'`
   * if your app is framed by its own subdomain. Set to `null` to
   * suppress (e.g. when you're already using `frame-ancestors` in
   * CSP). `SAMEORIGIN` accepts no host parameter; use CSP's
   * `frame-ancestors` for finer-grained framing policy.
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | null;

  /**
   * Value for `Referrer-Policy`. Default `'strict-origin-when-cross-origin'`
   * — same as Next.js's own default, balances analytics with privacy.
   */
  referrerPolicy?:
    | 'no-referrer'
    | 'no-referrer-when-downgrade'
    | 'origin'
    | 'origin-when-cross-origin'
    | 'same-origin'
    | 'strict-origin'
    | 'strict-origin-when-cross-origin'
    | 'unsafe-url';

  /**
   * Permissions-Policy directives. Pass a map of `{ feature: allowlist }`
   * where the allowlist is either an array of origins (string[]) or
   * one of the well-known tokens `'self'` / `'*'` / `'()'` (deny).
   *
   * Default: camera + microphone allowed for `'self'` only (useful
   * for the conference track); geolocation + payment denied; every
   * other common feature left unset (browsers apply their own
   * conservative defaults).
   *
   * Pass `{}` to emit an empty `Permissions-Policy: ` header (rarely
   * useful). Pass `null` to suppress the header entirely.
   */
  permissionsPolicy?: PermissionsPolicyMap | null;

  /**
   * Value for `X-Content-Type-Options`. Default `'nosniff'` — do not
   * override without a specific reason.
   */
  contentTypeOptions?: string | null;

  /**
   * Legacy `X-XSS-Protection`. Default `'0'` (disables the
   * deprecated IE/Edge filter which had known bypass issues —
   * recommended by OWASP + Next.js). Set to `'1; mode=block'` only
   * if you have a specific compliance reason.
   */
  xssProtection?: string | null;

  /**
   * Extra headers to merge into the result. Takes precedence over
   * the computed ones — useful for adding Content-Security-Policy or
   * Cross-Origin-* headers without forcing a new option for each.
   */
  extraHeaders?: SecurityHeaderEntry[];
}

export type PermissionsPolicyValue =
  | readonly string[]
  | 'self'
  | '*'
  | '()';

export type PermissionsPolicyMap = Readonly<
  Record<string, PermissionsPolicyValue>
>;

const DEFAULT_PERMISSIONS_POLICY: PermissionsPolicyMap = {
  // Conference track features — allow self-origin only.
  camera: 'self',
  microphone: 'self',
  'display-capture': 'self',
  // Deny-by-default for features the SDK never uses.
  geolocation: '()',
  payment: '()',
  'publickey-credentials-get': 'self',
  usb: '()',
  serial: '()',
  bluetooth: '()',
};

function formatPermissionsDirective(
  feature: string,
  value: PermissionsPolicyValue,
): string {
  if (value === '*') return `${feature}=*`;
  if (value === '()' || (Array.isArray(value) && value.length === 0)) {
    return `${feature}=()`;
  }
  if (value === 'self') return `${feature}=(self)`;
  const origins = value as readonly string[];
  const parts = origins.map((o) => (o === 'self' ? 'self' : `"${o}"`));
  return `${feature}=(${parts.join(' ')})`;
}

/**
 * Build a reasonable-default set of security response headers in the
 * exact shape Next.js `headers()` expects.
 *
 * @example next.config.ts
 * ```ts
 * import { buildSecurityHeaders } from '@scalemule/nextjs/server'
 *
 * export default {
 *   async headers() {
 *     return [
 *       { source: '/:path*', headers: buildSecurityHeaders() },
 *     ]
 *   },
 * }
 * ```
 *
 * @example custom overrides
 * ```ts
 * buildSecurityHeaders({
 *   frameOptions: 'SAMEORIGIN',
 *   permissionsPolicy: {
 *     camera: ['https://trusted.example.com'],
 *     microphone: ['https://trusted.example.com'],
 *   },
 *   extraHeaders: [
 *     { key: 'Content-Security-Policy', value: "default-src 'self'" },
 *   ],
 * })
 * ```
 */
export function buildSecurityHeaders(
  opts: BuildSecurityHeadersOptions = {},
): SecurityHeaderEntry[] {
  const headers: SecurityHeaderEntry[] = [];

  const includeHsts = opts.includeHsts ?? true;
  const hstsMaxAge = opts.hstsMaxAgeSeconds ?? 31_536_000;
  if (includeHsts && hstsMaxAge > 0) {
    const parts = [`max-age=${hstsMaxAge}`];
    if (opts.hstsIncludeSubDomains ?? true) parts.push('includeSubDomains');
    if (opts.hstsPreload ?? false) parts.push('preload');
    headers.push({
      key: 'Strict-Transport-Security',
      value: parts.join('; '),
    });
  }

  const frameOptions = opts.frameOptions === undefined ? 'DENY' : opts.frameOptions;
  if (frameOptions !== null) {
    headers.push({ key: 'X-Frame-Options', value: frameOptions });
  }

  const contentTypeOptions =
    opts.contentTypeOptions === undefined ? 'nosniff' : opts.contentTypeOptions;
  if (contentTypeOptions !== null) {
    headers.push({ key: 'X-Content-Type-Options', value: contentTypeOptions });
  }

  headers.push({
    key: 'Referrer-Policy',
    value: opts.referrerPolicy ?? 'strict-origin-when-cross-origin',
  });

  const xss = opts.xssProtection === undefined ? '0' : opts.xssProtection;
  if (xss !== null) {
    headers.push({ key: 'X-XSS-Protection', value: xss });
  }

  const permissions =
    opts.permissionsPolicy === undefined
      ? DEFAULT_PERMISSIONS_POLICY
      : opts.permissionsPolicy;
  if (permissions !== null) {
    const directives = Object.entries(permissions)
      .map(([feature, value]) => formatPermissionsDirective(feature, value))
      .join(', ');
    headers.push({ key: 'Permissions-Policy', value: directives });
  }

  if (opts.extraHeaders?.length) {
    // Extra headers override earlier ones with the same key.
    const byKey = new Map(headers.map((h) => [h.key.toLowerCase(), h]));
    for (const extra of opts.extraHeaders) {
      byKey.set(extra.key.toLowerCase(), extra);
    }
    return Array.from(byKey.values());
  }

  return headers;
}

/**
 * Exported for tests + callers that want to inspect or extend the
 * default Permissions-Policy map.
 */
export { DEFAULT_PERMISSIONS_POLICY };
