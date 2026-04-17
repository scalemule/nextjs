/**
 * Safe-redirect validation for authentication callback URLs.
 *
 * Prevents open-redirect attacks on `returnTo` / `callbackUrl` / `next`
 * params after login / registration / password-reset flows. An attacker
 * who can inject a `?returnTo=https://evil.example` into your login
 * form would otherwise redirect the freshly-authenticated user away
 * from your origin — a classic phishing + credential-harvesting setup.
 *
 * Safe by default — unknown input returns the configured default
 * path. Hosts opt in to external origins explicitly via
 * `allowedOrigins`.
 *
 * Framework-agnostic: no imports from `next/*`. Safe in any
 * Edge / Node / middleware runtime.
 */

export interface SafeRedirectOptions {
  /**
   * Origins (schema + host + optional port) the redirect is allowed
   * to land on. Default `[]` — only same-origin relative paths are
   * allowed. Items are compared case-insensitively after normalizing
   * the scheme and host.
   *
   * Good practice: list only origins that your organization controls
   * and that are reachable over HTTPS.
   *
   * @example
   * ['https://app.example.com', 'https://admin.example.com']
   */
  allowedOrigins?: string[];
  /**
   * Value returned when the input is missing, invalid, or points
   * outside the allowlist. Default `'/'`.
   */
  defaultPath?: string;
  /**
   * Strip the scheme + host from same-origin absolute URLs and
   * return only the path + query + fragment. Default `true` — keeps
   * redirect targets as short relative URLs that route through
   * client-side routing cleanly.
   */
  stripSameOriginHost?: boolean;
}

function normalizeOrigin(origin: string): string | null {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function isSafeSchemeRelative(input: string): boolean {
  // `//host/path` is a schema-relative URL → treat as external. Also
  // reject backslash-starts which some browsers normalize to forward
  // slashes and can be used to bypass naive prefix checks.
  return !(input.startsWith('//') || input.startsWith('\\'));
}

/**
 * Returns a safe-to-use redirect path, falling back to
 * `opts.defaultPath` (default `'/'`) when the input fails validation.
 *
 * Accepts:
 *   - empty / nullish → default
 *   - relative paths like `/foo/bar?x=1#frag` (leading `/` required)
 *   - absolute URLs whose origin is in `allowedOrigins`
 *
 * Rejects everything else, including:
 *   - schema-relative URLs (`//evil.example`)
 *   - backslash-prefixed paths
 *   - `javascript:`, `data:`, `mailto:`, `vbscript:` etc.
 *   - bare hostnames (`example.com/path`)
 *   - malformed URLs
 */
export function validateSafeRedirect(
  input: string | null | undefined,
  opts: SafeRedirectOptions = {},
): string {
  const defaultPath = opts.defaultPath ?? '/';
  if (!input || typeof input !== 'string') return defaultPath;
  const trimmed = input.trim();
  if (!trimmed) return defaultPath;
  if (!isSafeSchemeRelative(trimmed)) return defaultPath;

  // Reject obviously dangerous scheme prefixes before any URL parsing.
  // URL constructor would accept `javascript:` happily; we block it
  // here before it reaches a router.
  const colon = trimmed.indexOf(':');
  if (colon > 0 && colon < 15) {
    const scheme = trimmed.slice(0, colon).toLowerCase();
    if (/^[a-z][a-z0-9+.-]*$/.test(scheme) && scheme !== 'http' && scheme !== 'https') {
      return defaultPath;
    }
  }

  // Relative path: must start with `/` but not `//` (already ruled
  // out above). Also reject `/\…` backslash escape bypasses.
  if (trimmed.startsWith('/')) {
    if (trimmed.length > 1 && trimmed[1] === '\\') return defaultPath;
    return trimmed;
  }

  // Absolute URL: parse + check origin against allowlist.
  const allowed = (opts.allowedOrigins ?? [])
    .map(normalizeOrigin)
    .filter((o): o is string => o !== null);
  try {
    const parsed = new URL(trimmed);
    const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    if (!allowed.includes(origin)) return defaultPath;
    if (opts.stripSameOriginHost !== false) {
      // Return path + search + hash only — client routers handle this
      // more cleanly than an absolute URL back to our own origin.
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    }
    return trimmed;
  } catch {
    return defaultPath;
  }
}

/**
 * Boolean predicate form. Returns `true` when `input` would pass
 * `validateSafeRedirect` with the same options.
 */
export function isSafeRedirect(
  input: string | null | undefined,
  opts: SafeRedirectOptions = {},
): boolean {
  if (!input || typeof input !== 'string') return false;
  const defaultPath = `__unsafe_sentinel_${Math.random()}`;
  const resolved = validateSafeRedirect(input, { ...opts, defaultPath });
  return resolved !== defaultPath;
}
