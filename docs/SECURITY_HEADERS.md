# Security headers

`@scalemule/nextjs/server` ships a `buildSecurityHeaders` helper that returns the exact shape Next.js's `headers()` expects in `next.config.ts`. It emits reasonable OWASP-aligned defaults for the top-of-list response headers and exposes knobs for the few fields that typically differ by app.

## Quick start

```ts
// next.config.ts
import { buildSecurityHeaders } from '@scalemule/nextjs/server'

export default {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(),
      },
    ]
  },
}
```

That emits:

| Header | Default value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (1 year, subdomains included) |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-XSS-Protection` | `0` (OWASP-recommended — the legacy IE/Edge filter had known bypasses) |
| `Permissions-Policy` | `camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), publickey-credentials-get=(self), usb=(), serial=(), bluetooth=()` |

## Overriding defaults

Every knob is optional. Pass only the ones you want to change.

```ts
buildSecurityHeaders({
  // Allow the app to be framed by its own subdomains (swap for a CSP
  // frame-ancestors rule when you need finer granularity).
  frameOptions: 'SAMEORIGIN',

  // Tighten the Referrer-Policy for analytics-heavy apps.
  referrerPolicy: 'strict-origin',

  // Allow-list specific camera origins (e.g. the conference SDK host).
  permissionsPolicy: {
    camera: ['https://call.example.com'],
    microphone: ['https://call.example.com'],
    // Spread the default deny-list for anything you don't need to change.
    geolocation: '()',
    payment: '()',
  },

  // Add Content-Security-Policy + Cross-Origin-* without modifying
  // the defaults. `extraHeaders` wins on conflicts.
  extraHeaders: [
    { key: 'Content-Security-Policy', value: "default-src 'self'" },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
  ],
})
```

## Conference / video calls

The default `Permissions-Policy` allows `camera`, `microphone`, and `display-capture` for the self-origin only. This matches `@scalemule/conference`'s in-app requirements — calls originate from your own Next.js pages, not from embedded iframes.

If you host the conference UI in an iframe on another domain, allow-list the iframe's origin:

```ts
buildSecurityHeaders({
  permissionsPolicy: {
    camera: ['self', 'https://your-conference-iframe.example.com'],
    microphone: ['self', 'https://your-conference-iframe.example.com'],
  },
})
```

## HSTS preload

Adding your site to the HSTS preload list requires:

1. `max-age` of at least 31536000 (1 year) — SDK default.
2. `includeSubDomains` directive — SDK default.
3. `preload` directive — **opt in explicitly**.

```ts
buildSecurityHeaders({ hstsPreload: true })
// → Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

**Before turning this on**: read https://hstspreload.org. Reversing a preload requires months of calendar time — you're committing the root domain + every subdomain to HTTPS-only, forever.

## Opting out

Set any of these options to `null` to suppress the corresponding header:

| Option | Suppresses |
|---|---|
| `includeHsts: false` or `hstsMaxAgeSeconds: 0` | `Strict-Transport-Security` |
| `frameOptions: null` | `X-Frame-Options` (use when you're already setting CSP `frame-ancestors`) |
| `contentTypeOptions: null` | `X-Content-Type-Options` |
| `xssProtection: null` | `X-XSS-Protection` |
| `permissionsPolicy: null` | `Permissions-Policy` |

## Route-handler usage

The same helper works inside Route Handlers or middleware when you want to set headers on specific responses:

```ts
import { NextResponse } from 'next/server'
import { buildSecurityHeaders } from '@scalemule/nextjs/server'

export function GET() {
  const response = NextResponse.json({ ok: true })
  for (const { key, value } of buildSecurityHeaders()) {
    response.headers.set(key, value)
  }
  return response
}
```

Prefer the `next.config.ts` `headers()` entry for static coverage across the whole app — it's what the Next.js platform is designed for and it doesn't incur a per-request cost.

## Related

- Safe-redirect validation for auth callbacks: [`validateSafeRedirect`](https://github.com/scalemule/nextjs/blob/main/src/server/redirect.ts) (`@scalemule/nextjs/server`, 0.0.40).
- CSRF + OAuth-state helpers: `generateCSRFToken`, `validateCSRFToken`, `setOAuthState`, `validateOAuthState` — same server entry.
