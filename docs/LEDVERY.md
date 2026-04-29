# Ledvery OIDC Integration for @scalemule/nextjs

Drop-in OIDC integration for Next.js apps that use Ledvery as an identity provider.

For the full multi-package guide set, see:
https://github.com/scalemule/ledvery-sdk/blob/main/docs/README.md

## Quick Start

### 1. Install

```bash
npm install @scalemule/nextjs@latest
```

### 2. Create the route handler

```ts
// app/api/auth/ledvery/[...action]/route.ts
import { createLedveryRoutes } from '@scalemule/nextjs/server'

export const { GET, POST } = createLedveryRoutes({
  issuer: process.env.LEDVERY_ISSUER!,
  clientId: process.env.LEDVERY_CLIENT_ID!,
  clientSecret: process.env.LEDVERY_CLIENT_SECRET!,
  redirectUri: `${process.env.APP_URL}/api/auth/ledvery/callback`,
  postLoginRedirect: '/dashboard',
  postLogoutRedirect: '/',
})
```

### 3. Environment variables

```env
# Server-only (never in NEXT_PUBLIC_*)
LEDVERY_ISSUER=https://id.ledvery.com
LEDVERY_CLIENT_ID=your-client-id
LEDVERY_CLIENT_SECRET=your-client-secret
APP_URL=https://your-app.example.com
```

## Routes

| Method | Path | Behavior |
|--------|------|----------|
| GET | `/api/auth/ledvery/login` | 302 -> Ledvery /authorize (sets PKCE flow cookies) |
| GET | `/api/auth/ledvery/callback` | Exchanges code, then 302 -> `returnTo` or `postLoginRedirect` (sets session cookies) |
| GET | `/api/auth/ledvery/session` | 200 JSON `{session: LedverySessionDTO \| null}` |
| GET | `/api/auth/ledvery/logout` | Clears cookies, then 302 -> `postLogoutRedirect` or the configured gateway logout bridge |

## Configuration

```ts
interface LedveryRoutesConfig {
  issuer: string              // Ledvery issuer URL
  clientId: string            // OIDC client ID
  clientSecret?: string       // OIDC client secret (omit for public clients)
  redirectUri: string         // Must match registered redirect_uris
  defaultScope?: string       // Default: 'openid email profile'
  postLoginRedirect?: string  // Default: '/'
  postLogoutRedirect?: string // Default: '/'
  cookies?: SessionCookieOverrides
  storeAccessToken?: boolean  // Default: false (see cookie size note)
  fetch?: typeof fetch        // Override fetch for proxies/edge runtimes
  gatewayUrl?: string         // Optional ScaleMule logout bridge for RP logout
}
```

## Session Shape

`GET /session` returns:

```json
{
  "session": {
    "sub": "user-uuid",
    "email": "user@example.com",
    "email_verified": true,
    "name": "Jane Doe",
    "idp": "google",
    "expiresAt": "2026-04-28T01:00:00.000Z"
  }
}
```

Or `{ "session": null }` when not authenticated or expired.

## Reading the session server-side

```ts
import { getLedverySession } from '@scalemule/nextjs/server'

export async function GET(request: Request) {
  const session = getLedverySession(request)
  if (!session) return Response.json({ error: 'unauthenticated' }, { status: 401 })
  // session.claims contains the decoded ID token claims
}
```

## Cookie Design

**Flow cookies** (10-minute TTL, cleared after callback):
- `sm_ledvery_state` - CSRF protection
- `sm_ledvery_pkce_verifier` - PKCE S256 verifier
- `sm_ledvery_nonce` - replay protection

**Session cookies** (1-hour cap):
- `sm_ledvery_id_token` - serialized ID token + claims + expiry
- `sm_ledvery_access_token` - raw access token (opt-in only)

All cookies are `httpOnly`, `sameSite=lax`, and `secure` in production.

### Cookie Size

`storeAccessToken` defaults to `false`. With only the ID token claims, the
session cookie is typically under 1 KB. Enabling `storeAccessToken` adds the
raw access token (~1-2 KB), which can push total cookies to 3-4 KB. Some CDNs
cap at 4 KB per cookie. Only enable if you need to call Ledvery's `/userinfo`
endpoint server-side.

## Ledvery Session vs. ScaleMule Session

This SDK creates a **Ledvery session** (`sm_ledvery_*` cookies), NOT a
ScaleMule session (`sm_session`). Apps that need ScaleMule auth should continue
using `createAuthRoutes()`. Mapping a Ledvery session into a ScaleMule session
is a separate integration concern.

## Limitations

- **Logout is local by default.** If `gatewayUrl` is unset, `/logout` only
  clears the local Ledvery cookies and redirects to `postLogoutRedirect`. If
  `gatewayUrl` is set, the route can redirect through ScaleMule's Ledvery RP
  logout endpoint and forward `id_token_hint`.
- **No packaged refresh route.** The route factory does not persist
  `refreshToken` values or expose `/refresh`. If you need `offline_access` and
  refresh-token rotation, layer that on top of `@scalemule/ledvery` in your
  own server-side code.
- **No pure-browser mode.** This SDK requires a server-side BFF. Pure SPA apps
  need their own backend or a future `@scalemule/ledvery-react` browser-only mode.
