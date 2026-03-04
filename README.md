# @scalemule/nextjs

ScaleMule SDK for Next.js applications.

Server-side authentication with HTTP-only cookies, CSRF protection, webhook handling, secrets management, and client-side hooks.

## Install

```bash
npm install @scalemule/nextjs
```

## Auth in 6 Lines

```ts
// app/api/auth/[...scalemule]/route.ts
import { createAuthRoutes } from '@scalemule/nextjs/server'

export const { GET, POST, DELETE, PATCH } = createAuthRoutes()
```

This creates all auth endpoints automatically:
- `POST /api/auth/register` — register + set HTTP-only cookie
- `POST /api/auth/login` — login + set HTTP-only cookie
- `POST /api/auth/logout` — logout + clear cookie
- `GET /api/auth/me` — get current user
- `POST /api/auth/forgot-password` — request password reset
- `POST /api/auth/reset-password` — reset password
- `POST /api/auth/verify-email` — verify email
- `POST /api/auth/resend-verification` — resend verification (session or email-only)
- `POST /api/auth/refresh` — refresh session
- `PATCH /api/auth/me` — update profile
- `DELETE /api/auth/me` — delete account

API keys never reach the browser. Session tokens are HTTP-only cookies.

## Environment Variables

```bash
# .env.local
SCALEMULE_API_KEY=sk_prod_xxx    # server-only, no NEXT_PUBLIC_ prefix
SCALEMULE_ENV=prod               # 'dev' | 'prod'
SCALEMULE_COOKIE_DOMAIN=.yourdomain.com  # optional, for subdomain sharing
```

## Auth Route Options

```ts
export const { GET, POST, DELETE, PATCH } = createAuthRoutes({
  // CSRF validation (recommended for production)
  csrf: true,

  // Cookie configuration
  cookies: {
    domain: '.yourdomain.com',    // share across subdomains
    maxAge: 30 * 24 * 60 * 60,    // 30 days
  },

  // Lifecycle hooks
  onRegister: async (user) => { /* post-registration logic */ },
  onLogin: async (user) => { /* post-login logic */ },
  onLogout: async () => { /* cleanup */ },
})
```

## Webhooks in 10 Lines

```ts
// app/api/webhooks/scalemule/route.ts
import { createWebhookHandler } from '@scalemule/nextjs/server/webhooks'

export const POST = createWebhookHandler({
  secret: process.env.SCALEMULE_WEBHOOK_SECRET,
  onEvent: {
    'storage.file.uploaded': async (event) => {
      console.log('File uploaded:', event.data.file_id)
    },
    'video.transcoding.completed': async (event) => {
      console.log('Video ready:', event.data.video_id)
    },
  },
})
```

HMAC-SHA256 signature verification and 5-minute replay protection included.

## 1-Line Auth Export

For zero-config auth (reads from env vars):

```ts
// app/api/auth/[...scalemule]/route.ts
export { GET, POST, DELETE, PATCH } from '@scalemule/nextjs/server/auth'
```

## Client-Side Provider

```tsx
// app/layout.tsx
import { ScaleMuleProvider } from '@scalemule/nextjs'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <ScaleMuleProvider
          apiKey={process.env.NEXT_PUBLIC_SCALEMULE_API_KEY!}
          environment={process.env.NEXT_PUBLIC_SCALEMULE_ENV as 'dev' | 'prod'}
        >
          {children}
        </ScaleMuleProvider>
      </body>
    </html>
  )
}
```

## Client-Side Hooks

### `useAuth()`

```tsx
'use client'
import { useAuth } from '@scalemule/nextjs'

function LoginPage() {
  const { login, register, logout, user, loading, isAuthenticated, error } = useAuth()

  const handleLogin = async () => {
    await login({ email, password })
  }
}
```

### `useContent()`

```tsx
import { useContent } from '@scalemule/nextjs'

function Gallery() {
  const { files, upload, loading, uploadProgress, refresh, remove } = useContent({ autoFetch: true })

  const handleUpload = async (file: File) => {
    await upload(file, {
      onProgress: (pct) => console.log(`${pct}%`),
    })
  }
}
```

### `useUser()`

```tsx
import { useUser } from '@scalemule/nextjs'

function Settings() {
  const { profile, update, changePassword, changeEmail, deleteAccount, exportData } = useUser()
}
```

### `useRealtime()`

```tsx
import { useRealtime } from '@scalemule/nextjs'

function LiveUpdates() {
  const { status, subscribe } = useRealtime({ autoConnect: true })

  useEffect(() => {
    const unsub = subscribe('notifications', (data) => {
      console.log('New notification:', data)
    })
    return () => unsub()
  }, [subscribe])
}
```

## Server Client

For server-side operations beyond auth (API routes, server components, server actions):

```ts
import { createServerClient } from '@scalemule/nextjs/server'

const sm = createServerClient()

// Storage
const { data } = await sm.storage.getViewUrl(fileId)

// Auth (with session token)
const { data: user } = await sm.auth.me(sessionToken)

// Secrets
const secret = await sm.secrets.get('STRIPE_KEY')

// Vault bundles
const db = await sm.bundles.get('database/primary')
```

## CSRF Protection

### Middleware Setup

```ts
// middleware.ts
import { generateCSRFToken, CSRF_COOKIE_NAME } from '@scalemule/nextjs/server'
import { NextResponse } from 'next/server'

export function middleware(request) {
  const response = NextResponse.next()

  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    const token = generateCSRFToken()
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: false,  // must be readable by JS
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    })
  }

  return response
}
```

### Enable in Auth Routes

```ts
export const { GET, POST, DELETE, PATCH } = createAuthRoutes({
  csrf: true,  // validates x-csrf-token header against cookie
})
```

### Client-Side

```ts
// Read CSRF token from cookie and include in requests
const csrfToken = document.cookie.match(/csrf_token=([^;]+)/)?.[1]

fetch('/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': csrfToken,
  },
  body: JSON.stringify({ email, password }),
})
```

## Secrets & Vault

```ts
import {
  getAppSecret,
  requireAppSecret,
  getMySqlBundle,
  getRedisBundle,
  getS3Bundle,
  getOAuthBundle,
  getBundle,
} from '@scalemule/nextjs/server'

// Simple secrets
const apiKey = await getAppSecret('STRIPE_API_KEY')
const required = await requireAppSecret('WEBHOOK_SECRET')  // throws if missing

// Typed bundles
const db = await getMySqlBundle('database/primary')     // { host, port, user, password, database, connectionUrl }
const redis = await getRedisBundle('cache/main')        // { host, port, password, connectionUrl }
const s3 = await getS3Bundle('storage/uploads')         // { bucket, region, access_key_id, secret_access_key }
const oauth = await getOAuthBundle('google')            // { client_id, client_secret, redirect_uri }

// Generic bundle
const stripe = await getBundle<{ api_key: string; webhook_secret: string }>('external/stripe')
```

Secrets are cached for 5 minutes. Configure with `configureSecrets({ cacheTtlMs, noCache })`.

## Testing

```tsx
import { MockScaleMuleProvider, createMockUser, createMockFile } from '@scalemule/nextjs/testing'
import { render, screen } from '@testing-library/react'

test('shows user name', () => {
  render(
    <MockScaleMuleProvider user={createMockUser({ full_name: 'Jane' })}>
      <ProfilePage />
    </MockScaleMuleProvider>
  )
  expect(screen.getByText('Jane')).toBeInTheDocument()
})
```

## License

MIT - ScaleMule Inc.
