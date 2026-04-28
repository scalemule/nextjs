# Auth Proxy Pattern for @scalemule/nextjs

`@scalemule/nextjs` supports two auth shapes:

1. Same-origin auth proxy mode via `createAuthRoutes()`
2. Direct gateway mode via the client talking to `https://api*.scalemule.com/v1/*`

The important detail is that these are not two separate SDKs. In proxy mode, only the auth lifecycle goes through `/api/auth/*`. Once the session is established, the browser client still talks directly to the ScaleMule gateway for normal SDK calls.

## Mode Selection

| Mode | Configure | Browser auth calls | Session authority | Use this when |
|---|---|---|---|---|
| Auth proxy | `createAuthRoutes()` plus `<ScaleMuleProvider authProxyUrl="/api/auth" ...>` | `/api/auth/*` on your own origin | `sm_session` and `sm_user_id` HTTP-only cookies | Recommended for full Next.js apps that want same-origin auth endpoints, cookie-backed auth, and CSRF protection |
| Direct gateway | Omit `authProxyUrl`; call `useAuth()` / `ScaleMuleClient` directly | `https://api.scalemule.com/v1/auth/*` or `https://api-dev.scalemule.com/v1/auth/*` | Client-side SDK session storage | Use when you are intentionally not wiring the route factory and are comfortable with bearer-token auth from the browser |

## What Proxy Mode Actually Proxies

Proxy mode does **not** turn every SDK request into a BFF call.

- `useAuth()` login/register/logout/refresh/me/session calls go through `/api/auth/*`
- `createAuthRoutes()` uses `ScaleMuleServer` to call the real gateway on the server
- After bootstrap, `ScaleMuleClient.request()` still sends direct gateway requests with `x-api-key`
- When a session token is present, those direct requests also send `Authorization: Bearer <token>`
- If the app sets workspace context, the direct client also sends `x-sm-workspace-id`

That split is why proxy mode still needs to seed the browser client with the current session token after `/api/auth/login` or `/api/auth/me`.

## Proxy Mode Bootstrap

Typical setup:

```ts
// app/api/auth/[...scalemule]/route.ts
import { createAuthRoutes } from '@scalemule/nextjs/server'

export const { GET, POST, DELETE, PATCH } = createAuthRoutes({
  csrf: true,
})
```

```tsx
// app/layout.tsx
<ScaleMuleProvider
  apiKey={process.env.NEXT_PUBLIC_SCALEMULE_API_KEY!}
  environment="prod"
  authProxyUrl="/api/auth"
>
  {children}
</ScaleMuleProvider>
```

Initial load in proxy mode:

```text
ScaleMuleProvider(authProxyUrl="/api/auth")
  -> createClient({ pendingSessionInit: true })
  -> child SDK requests wait behind the session gate
  -> fetch("/api/auth/me", { credentials: "include" })
     -> createAuthRoutes().GET("me")
     -> getSession() reads sm_session + sm_user_id
     -> ScaleMuleServer.auth.me() validates the session with the gateway
     <- route returns user + sessionToken (+ rotated token when applicable)
  -> client.setSession(sessionToken, userId)
  -> resolveSessionPending()
  -> normal SDK requests continue with Authorization: Bearer
```

Why `pendingSessionInit` exists:

- `ScaleMuleProvider` passes `pendingSessionInit: !!authProxyUrl` into `createClient()`
- `ScaleMuleClient.request()` waits for that gate before sending any request
- the gate is resolved only after `/api/auth/me` finishes and the client either gets a valid session token or decides there is no session

Without that gate, child components can fire direct API requests before the browser client has a bearer token to attach.

## Generated `/api/auth/*` Responsibilities

The route factory owns the auth lifecycle, not the entire API surface.

| Route | Server-side behavior | Cookie helper behavior |
|---|---|---|
| `POST /api/auth/register` | Calls `sm.auth.register()`, then attempts `sm.auth.login()` for auto-login | `withSession()` sets `sm_session` + `sm_user_id` if auto-login succeeds |
| `POST /api/auth/login` | Calls `sm.auth.login()` | `withSession()` sets `sm_session` + `sm_user_id` and returns `sessionToken` / `userId` in JSON so the browser client can mirror the session |
| `POST /api/auth/logout` | Reads cookies with `getSession()`, calls `sm.auth.logout()` if present | `clearSession()` clears `sm_session` + `sm_user_id` |
| `POST /api/auth/refresh` | Reads cookies with `getSession()`, calls `sm.auth.refresh()` | `withRefreshedSession()` rewrites both cookies with the new session token |
| `GET /api/auth/me` | Reads cookies with `getSession()`, calls `sm.auth.me()` to validate the session, and watches for rotated tokens | `withRefreshedSession()` rewrites cookies when the gateway returns `x-rotated-session-token`; `clearSession()` is used if the session is invalid |
| `GET /api/auth/session` | Reads cookies with `getSession()` only | No gateway round-trip; it reports local cookie presence, not full backend revalidation |
| `PATCH /api/auth/me` and some stateful auth POSTs | Use `getSession()` and call authenticated backend handlers | `withRefreshedSession()` is used when those backend calls rotate the session token |

Two useful consequences:

- `GET /api/auth/session` is a lightweight "do cookies exist?" check
- `GET /api/auth/me` is the authoritative bootstrap/revalidation call because it hits the backend and can clear stale cookies

## Session Cookie Lifecycle

| Cookie | JS-readable | Written by | Cleared by | Read by |
|---|---|---|---|---|
| `sm_session` | No (`httpOnly`) | `withSession()` and `withRefreshedSession()` | `clearSession()` | `getSession()` and `getSessionFromRequest()` |
| `sm_user_id` | No (`httpOnly`) | `withSession()` and `withRefreshedSession()` | `clearSession()` | `getSession()` and `getSessionFromRequest()` |
| `sm_csrf` | Yes | app middleware or `withCSRFToken()` | normal cookie expiry / overwrite | `proxyFetch()` in the browser and `validateCSRFToken()` on the server |

The session cookies and the browser client stay in sync like this:

```text
POST /api/auth/login
  -> withSession() writes sm_session + sm_user_id
  -> response JSON includes sessionToken + userId
  -> useAuth().login() calls client.setSession(sessionToken, userId)
  -> later direct SDK requests send Authorization: Bearer

GET /api/auth/me or POST /api/auth/refresh
  -> route may call withRefreshedSession() if the token rotated
  -> response JSON includes the latest sessionToken
  -> provider / hook mirrors the rotated token into the browser client
```

## CSRF Double-Submit Flow

Proxy mode can enforce CSRF because the auth endpoints are same-origin.

```text
middleware or route setup
  -> set sm_csrf cookie (JS-readable)

browser auth mutation
  -> proxyFetch() reads sm_csrf from document.cookie
  -> sends x-csrf-token header on POST / PUT / PATCH / DELETE

createAuthRoutes({ csrf: true })
  -> validateCSRFToken()
  -> compare sm_csrf cookie against x-csrf-token
```

Key points:

- the cookie name is `sm_csrf`
- the header name is `x-csrf-token`
- `proxyFetch()` only adds the header on state-changing auth proxy calls
- `validateCSRFToken()` rejects missing-cookie, missing-header, and mismatch cases
- `GET /api/auth/me` and `GET /api/auth/session` do not require the header

`createAuthRoutes({ csrf: true })` validates tokens, but it does **not** mint `sm_csrf` by itself. Your app still needs middleware or another server entry point that sets the cookie.

## Direct Gateway Mode

In direct mode, the client skips `/api/auth/*` and talks to the ScaleMule gateway itself.

Direct mode flow:

```text
useAuth().login()
  -> ScaleMuleClient.post("/v1/auth/login")
  -> gateway returns session_token + user
  -> client.setSession(session_token, user.id)
  -> later requests reuse the stored bearer token
```

Headers on direct browser requests:

| Header | When it is present | Source |
|---|---|---|
| `x-api-key` | Always | `ScaleMuleClient.buildHeaders()` |
| `Authorization: Bearer <token>` | When `client.setSession()` or restored storage has a session token | `ScaleMuleClient.buildHeaders()` |
| `x-sm-workspace-id` | When `client.setWorkspaceContext(id)` has been called | `ScaleMuleClient.buildHeaders()` |

Server-side helper calls use the same gateway directly:

- `ScaleMuleServer.request()` always sends `x-api-key`
- it adds `Authorization: Bearer` when a `sessionToken` option is provided
- it forwards client IP / user-agent context when the route passes `clientContext`

## Which Mode Should Most Next.js Apps Pick?

Pick auth proxy mode when:

- you want `createAuthRoutes()` to own login/logout/refresh/me
- you want HTTP-only `sm_session` and `sm_user_id` cookies
- you want CSRF enforcement with `sm_csrf` + `x-csrf-token`
- you want provider bootstrap to wait on `pendingSessionInit`

Pick direct gateway mode when:

- you are intentionally not shipping `/api/auth/*`
- you want `useAuth()` to call `/v1/auth/*` directly
- you are okay with the SDK session living in client storage instead of server-owned cookies

## Related

- [README auth quick start](../README.md)
- [Integration guide](../INTEGRATION_GUIDE.md)
- [Ledvery routes](./LEDVERY.md)
- [Security headers](./SECURITY_HEADERS.md)
