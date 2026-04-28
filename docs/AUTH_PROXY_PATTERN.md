# Auth Proxy Pattern in @scalemule/nextjs

This document explains the architecture of the ScaleMule authentication proxy and the decision criteria for when to route requests through same-origin API handlers versus calling the ScaleMule gateway directly.

## Overview

ScaleMule provides two primary modes of operation for authentication in Next.js:

1.  **Proxy Mode (Recommended)**: Client-side code calls your own Next.js API routes (e.g., `/api/auth/*`), which then use a server-side ScaleMule client to communicate with the gateway.
2.  **Direct Mode**: Client-side code calls `api.scalemule.com` directly using the ScaleMule SDK.

### Decision Matrix

| Feature | Proxy Mode | Direct Mode |
| :--- | :--- | :--- |
| **Security** | Highest (HTTP-only cookies) | High (Local storage bearer) |
| **CSRF Protection** | Built-in (Same-origin + Double Submit) | Origin-locked at Gateway |
| **Setup Complexity** | 6 lines of code | Zero-config |
| **Cross-Subdomain** | Supported via cookie domain | Supported |
| **API Keys** | Server-side only | Requires NEXT_PUBLIC_API_KEY |
| **Session Persistence** | Automatic (handled by browser) | Manual (handled by SDK) |

---

## Proxy Mode Architecture

In Proxy Mode, your Next.js application acts as a secure intermediary.

```text
[ Browser ] <---(Same-Origin + CSRF)---> [ Next.js API ] <---(Bearer + API Key)---> [ ScaleMule Gateway ]
     |                                        |                                         |
     +--- sm_session (HTTP-only)              +--- SCALEMULE_API_KEY                    +--- User DB
```

### 1. `createAuthRoutes()`

This utility generates standard handlers for the App Router. It abstracts the translation between browser cookies and ScaleMule bearer tokens.

```ts
// app/api/auth/[...scalemule]/route.ts
import { createAuthRoutes } from '@scalemule/nextjs/server'
export const { GET, POST, DELETE, PATCH } = createAuthRoutes()
```

### 2. Cookie Lifecycle

*   `sm_session`: Contains the ScaleMule session token. Marked as `HttpOnly`, `Secure`, and `SameSite=Lax/Strict`. It is never accessible to client-side JavaScript.
*   `sm_user_id`: Contains the UUID of the logged-in user. Accessible to JS for UI personalization.
*   `sm_csrf`: Randomly generated token used for Double-Submit Cookie CSRF protection.

### 3. CSRF Flow

When `csrf: true` is enabled in `createAuthRoutes`:
1.  Server sets an `sm_csrf` cookie (not HttpOnly).
2.  Browser reads the cookie and sends its value in the `x-csrf-token` header.
3.  Server validates that the header matches the cookie.

---

## Session Token Lifecycle & Rotation

ScaleMule uses **Sliding Window Session Rotation** for enhanced security.

### Server-to-Gateway Rotation
When your API route calls a ScaleMule service, the gateway may return a new session token via the `x-rotated-session-token` header. The SDK automatically detects this and updates the browser cookies via the `Set-Cookie` header in the API response.

### 401 Auto-Refresh
If a session token expires, the SDK interceptors will:
1.  Attempt a silent refresh via `/v1/auth/refresh`.
2.  If successful, retry the original request with the new token.
3.  Update the `sm_session` cookie with the new token.

---

## Direct Mode Architecture

In Direct Mode, the browser communicates directly with ScaleMule.

```text
[ Browser (SDK) ] <---(Bearer + Pub Key)---> [ ScaleMule Gateway ]
```

**When to use Direct Mode:**
*   Static sites with no backend (e.g., pure SSG on Vercel/Netlify).
*   Public data fetching where SEO and latency are prioritized over session security.
*   Client-side only features like Realtime subscriptions (WebSockets).

---

## Best Practices

1.  **Keep API Keys Secret**: Never prefix your primary `SCALEMULE_API_KEY` with `NEXT_PUBLIC_`. It should only be used on the server.
2.  **Use `withRefreshedSession`**: If implementing custom API routes, use the `withRefreshedSession` helper to ensure rotated tokens from the gateway reach the browser.
3.  **Bootstrap with `ScaleMuleProvider`**: Always wrap your app in `ScaleMuleProvider`. In Proxy Mode, it will automatically bootstrap the session by calling `/api/auth/me`.

---

## Troubleshooting

*   **401 Unauthorized**: Check if `sm_session` cookie is present and not expired. Ensure `SameSite` settings allow the cookie to be sent.
*   **CSRF Mismatch**: Ensure the `x-csrf-token` header is being sent and matches the `sm_csrf` cookie value.
*   **Shared State Vulnerability**: Never store session tokens in shared global variables or static class properties on the server. Always use request-local storage (e.g., `cookies()` from `next/headers`).
