# @scalemule/nextjs Integration Guide

Complete guide for integrating ScaleMule authentication and storage into a Next.js application.

## Table of Contents

1. [Installation](#installation)
2. [Environment Setup](#environment-setup)
3. [Server-Side Setup (Recommended)](#server-side-setup-recommended)
4. [Client-Side Integration](#client-side-integration)
5. [Authentication Flow](#authentication-flow)
6. [File Storage](#file-storage)
7. [API Reference](#api-reference)
8. [Error Handling](#error-handling)
9. [Complete Examples](#complete-examples)

---

## Installation

```bash
npm install @scalemule/nextjs
```

Or add to package.json:
```json
{
  "dependencies": {
    "@scalemule/nextjs": "^0.0.1"
  }
}
```

---

## Environment Setup

Create environment files with your ScaleMule credentials:

### .env.local (Development)
```bash
# Server-side only (no NEXT_PUBLIC_ prefix)
SCALEMULE_API_KEY=sk_dev_your_dev_key_here
SCALEMULE_ENV=dev
```

### .env.production (Production)
```bash
# Server-side only (no NEXT_PUBLIC_ prefix)
SCALEMULE_API_KEY=sk_prod_your_prod_key_here
SCALEMULE_ENV=prod
```

**Important:** Never use `NEXT_PUBLIC_` prefix for the API key. It must stay server-side only.

---

## Server-Side Setup (Recommended)

This approach uses HTTP-only secure cookies for maximum security. Session tokens are never exposed to the browser.

### Step 1: Create Auth API Routes

Create a single file that handles all authentication endpoints:

```ts
// app/api/auth/[...scalemule]/route.ts
import { createAuthRoutes } from '@scalemule/nextjs/server'

export const { GET, POST, DELETE, PATCH } = createAuthRoutes()
```

This automatically creates these endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (sets HTTP-only cookie) |
| POST | `/api/auth/logout` | Logout (clears cookie) |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/auth/session` | Check if authenticated |
| POST | `/api/auth/forgot-password` | Request password reset email |
| POST | `/api/auth/reset-password` | Reset password with token |
| POST | `/api/auth/verify-email` | Verify email with token |
| POST | `/api/auth/resend-verification` | Resend verification email |
| POST | `/api/auth/refresh` | Refresh session |
| POST | `/api/auth/change-password` | Change password |
| PATCH | `/api/auth/me` | Update profile |
| DELETE | `/api/auth/me` | Delete account |

### Step 2: Create Storage API Routes (Optional)

For file uploads and listing:

```ts
// app/api/storage/[...path]/route.ts
import { createServerClient, getSession } from '@scalemule/nextjs/server'

const sm = createServerClient()

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await params
  const action = path?.[0]

  if (action === 'files' || !action) {
    // GET /api/storage/files - List user's files
    const url = new URL(request.url)
    const result = await sm.storage.list(session.userId, {
      content_type: url.searchParams.get('content_type') || undefined,
      search: url.searchParams.get('search') || undefined,
      limit: parseInt(url.searchParams.get('limit') || '50'),
      offset: parseInt(url.searchParams.get('offset') || '0'),
    })
    return Response.json(result)
  }

  return Response.json({ error: 'Not found' }, { status: 404 })
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Handle file upload
  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) {
    return Response.json({ error: 'No file provided' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await sm.storage.upload(session.userId, {
    buffer,
    filename: file.name,
    contentType: file.type,
  })

  return Response.json(result)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await params
  const fileId = path?.[1] // /api/storage/files/{fileId}

  if (!fileId) {
    return Response.json({ error: 'File ID required' }, { status: 400 })
  }

  const result = await sm.storage.delete(session.userId, fileId)
  return Response.json(result)
}
```

---

## Client-Side Integration

### Auth Helper Functions

Create a client-side auth library:

```ts
// lib/auth.ts

export interface User {
  id: string
  email: string
  email_verified: boolean
  phone: string | null
  phone_verified: boolean
  full_name: string | null
  avatar_url: string | null
  status: 'active' | 'suspended' | 'pending_verification'
  created_at: string
}

export interface AuthResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

// Register a new user
export async function register(data: {
  email: string
  password: string
  full_name?: string
}): Promise<AuthResponse<{ user: User }>> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

// Login
export async function login(data: {
  email: string
  password: string
  remember_me?: boolean
}): Promise<AuthResponse<{ user: User }>> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

// Logout
export async function logout(): Promise<AuthResponse> {
  const res = await fetch('/api/auth/logout', { method: 'POST' })
  return res.json()
}

// Get current user
export async function getUser(): Promise<User | null> {
  const res = await fetch('/api/auth/me')
  if (!res.ok) return null
  const data = await res.json()
  return data.success ? data.data.user : null
}

// Check if authenticated (lightweight)
export async function isAuthenticated(): Promise<boolean> {
  const res = await fetch('/api/auth/session')
  const data = await res.json()
  return data.success && data.data.authenticated
}

// Request password reset
export async function forgotPassword(email: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return res.json()
}

// Reset password with token
export async function resetPassword(
  token: string,
  new_password: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password }),
  })
  return res.json()
}

// Verify email with token
export async function verifyEmail(token: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/verify-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
  return res.json()
}

// Update profile
export async function updateProfile(data: {
  full_name?: string
  avatar_url?: string
}): Promise<AuthResponse<{ user: User }>> {
  const res = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

// Change password
export async function changePassword(
  current_password: string,
  new_password: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password }),
  })
  return res.json()
}

// Delete account
export async function deleteAccount(password: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/me', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return res.json()
}
```

### Storage Helper Functions

```ts
// lib/storage.ts

export interface StorageFile {
  id: string
  filename: string
  content_type: string
  size_bytes: number
  is_public: boolean
  storage_path: string
  created_at: string
  scan_status?: 'pending' | 'clean' | 'flagged' | 'error'
  url?: string
}

export interface ListFilesResponse {
  files: StorageFile[]
  total: number
  limit: number
  offset: number
}

// List user's files
export async function listFiles(params?: {
  content_type?: string
  search?: string
  limit?: number
  offset?: number
}): Promise<ListFilesResponse | null> {
  const query = new URLSearchParams()
  if (params?.content_type) query.set('content_type', params.content_type)
  if (params?.search) query.set('search', params.search)
  if (params?.limit) query.set('limit', params.limit.toString())
  if (params?.offset) query.set('offset', params.offset.toString())

  const res = await fetch(`/api/storage/files?${query}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.success ? data.data : null
}

// Upload a file
export async function uploadFile(file: File): Promise<{
  success: boolean
  data?: { id: string; filename: string; url: string }
  error?: { code: string; message: string }
}> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/storage/files', {
    method: 'POST',
    body: formData,
  })
  return res.json()
}

// Delete a file
export async function deleteFile(fileId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/storage/files/${fileId}`, {
    method: 'DELETE',
  })
  return res.json()
}
```

### Auth Context (Optional)

For React context-based auth state management:

```tsx
// contexts/auth-context.tsx
'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { getUser, login as apiLogin, logout as apiLogout, type User } from '@/lib/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const userData = await getUser()
    setUser(userData)
  }, [])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const login = async (email: string, password: string): Promise<boolean> => {
    const result = await apiLogin({ email, password })
    if (result.success && result.data) {
      setUser(result.data.user)
      return true
    }
    return false
  }

  const logout = async () => {
    await apiLogout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

---

## Authentication Flow

### Registration Flow

```
1. User submits registration form
2. Client calls POST /api/auth/register
3. Server creates user in ScaleMule
4. User receives verification email
5. User clicks verification link
6. Client calls POST /api/auth/verify-email with token
7. User can now login
```

### Login Flow

```
1. User submits login form
2. Client calls POST /api/auth/login
3. Server authenticates with ScaleMule
4. Server sets HTTP-only session cookie
5. Server returns user data (no token!)
6. Client stores user in state
7. Subsequent requests include cookie automatically
```

### Password Reset Flow

```
1. User requests password reset
2. Client calls POST /api/auth/forgot-password
3. User receives reset email
4. User clicks reset link with token
5. Client calls POST /api/auth/reset-password with token + new password
6. User can now login with new password
```

---

## File Storage

### Upload Flow

```
1. User selects file
2. Client creates FormData with file
3. Client calls POST /api/storage/files
4. Server uploads to ScaleMule (includes user ID from session)
5. Server returns file metadata with URL
```

### List Files Flow

```
1. Client calls GET /api/storage/files
2. Server reads user ID from session cookie
3. Server fetches files from ScaleMule filtered by user
4. Server returns file list
```

---

## API Reference

### Server-Side Exports (`@scalemule/nextjs/server`)

#### `createServerClient(config?)`

Creates a server-side ScaleMule client.

```ts
import { createServerClient } from '@scalemule/nextjs/server'

const sm = createServerClient()
// or with explicit config:
const sm = createServerClient({
  apiKey: 'sk_xxx',
  environment: 'dev', // or 'prod'
})
```

**Methods:**

```ts
// Auth
sm.auth.register({ email, password, full_name? })
sm.auth.login({ email, password, remember_me? })
sm.auth.logout(sessionToken)
sm.auth.me(sessionToken)
sm.auth.refresh(sessionToken)
sm.auth.forgotPassword(email)
sm.auth.resetPassword(token, newPassword)
sm.auth.verifyEmail(token)
sm.auth.resendVerification(sessionToken)

// User
sm.user.update(sessionToken, { full_name?, avatar_url? })
sm.user.changePassword(sessionToken, currentPassword, newPassword)
sm.user.changeEmail(sessionToken, newEmail, password)
sm.user.deleteAccount(sessionToken, password)

// Storage
sm.storage.list(userId, { content_type?, search?, limit?, offset? })
sm.storage.get(fileId)
sm.storage.delete(userId, fileId)
sm.storage.upload(userId, { buffer, filename, contentType })
```

#### `createAuthRoutes(config?)`

Creates drop-in route handlers for all auth endpoints.

```ts
import { createAuthRoutes } from '@scalemule/nextjs/server'

export const { GET, POST, DELETE, PATCH } = createAuthRoutes({
  cookies: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
    domain: '.yourdomain.com', // optional
  },
  onLogin: async (user) => { /* called after login */ },
  onLogout: async () => { /* called after logout */ },
  onRegister: async (user) => { /* called after register */ },
})
```

#### `getSession()`

Gets the current session from cookies.

```ts
import { getSession } from '@scalemule/nextjs/server'

const session = await getSession()
// Returns: { sessionToken: string, userId: string } | null
```

#### `requireSession()`

Gets session or throws 401 response.

```ts
import { requireSession } from '@scalemule/nextjs/server'

export async function GET() {
  const session = await requireSession() // Throws if not authenticated
  // session is guaranteed to exist here
}
```

#### `withSession(loginResponse, responseBody, options?)`

Creates a response with session cookies set.

```ts
import { withSession } from '@scalemule/nextjs/server'

const result = await sm.auth.login({ email, password })
return withSession(result.data, { user: result.data.user })
```

#### `clearSession(responseBody, options?)`

Creates a response that clears session cookies.

```ts
import { clearSession } from '@scalemule/nextjs/server'

return clearSession({ message: 'Logged out' })
```

---

## Error Handling

All API responses follow this format:

```ts
// Success
{
  "success": true,
  "data": { ... }
}

// Error
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Not authenticated or session expired |
| `VALIDATION_ERROR` | Invalid input data |
| `NOT_FOUND` | Resource not found |
| `ALREADY_EXISTS` | Resource already exists (e.g., email taken) |
| `INVALID_CREDENTIALS` | Wrong email or password |
| `EMAIL_NOT_VERIFIED` | Email verification required |
| `RATE_LIMITED` | Too many requests |
| `SERVER_ERROR` | Internal server error |

### Client-Side Error Handling

```tsx
const result = await login({ email, password })

if (!result.success) {
  switch (result.error?.code) {
    case 'INVALID_CREDENTIALS':
      setError('Wrong email or password')
      break
    case 'EMAIL_NOT_VERIFIED':
      setError('Please verify your email first')
      break
    case 'RATE_LIMITED':
      setError('Too many attempts. Please wait.')
      break
    default:
      setError(result.error?.message || 'Login failed')
  }
  return
}

// Success - redirect
router.push('/dashboard')
```

---

## Complete Examples

### Login Page

```tsx
// app/login/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/lib/auth'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const remember = formData.get('remember') === 'on'

    const result = await login({ email, password, remember_me: remember })

    if (result.success) {
      router.push('/dashboard')
    } else {
      setError(result.error?.message || 'Login failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-bold">Login</h1>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>
        )}

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="w-full border p-2 rounded"
          />
        </div>

        <div className="flex items-center gap-2">
          <input id="remember" name="remember" type="checkbox" />
          <label htmlFor="remember">Remember me</label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50"
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <div className="text-sm text-center space-y-2">
          <Link href="/forgot-password" className="text-blue-600">
            Forgot password?
          </Link>
          <p>
            Don't have an account?{' '}
            <Link href="/register" className="text-blue-600">
              Register
            </Link>
          </p>
        </div>
      </form>
    </div>
  )
}
```

### Registration Page

```tsx
// app/register/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { register } from '@/lib/auth'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const confirmPassword = formData.get('confirmPassword') as string
    const fullName = formData.get('fullName') as string

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      setLoading(false)
      return
    }

    const result = await register({
      email,
      password,
      full_name: fullName || undefined,
    })

    if (result.success) {
      router.push('/login?registered=true')
    } else {
      setError(result.error?.message || 'Registration failed')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 p-8">
        <h1 className="text-2xl font-bold">Create Account</h1>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded">{error}</div>
        )}

        <div>
          <label htmlFor="fullName">Full Name (optional)</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            className="w-full border p-2 rounded"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Register'}
        </button>

        <p className="text-sm text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600">
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}
```

### File Gallery Page

```tsx
// app/gallery/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getUser } from '@/lib/auth'
import { listFiles, uploadFile, deleteFile, type StorageFile } from '@/lib/storage'

export default function GalleryPage() {
  const router = useRouter()
  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    async function init() {
      const user = await getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const data = await listFiles({ content_type: 'image/' })
      if (data) {
        setFiles(data.files)
      }
      setLoading(false)
    }
    init()
  }, [router])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const result = await uploadFile(file)

    if (result.success && result.data) {
      // Refresh file list
      const data = await listFiles({ content_type: 'image/' })
      if (data) {
        setFiles(data.files)
      }
    }
    setUploading(false)
  }

  async function handleDelete(fileId: string) {
    if (!confirm('Delete this file?')) return

    await deleteFile(fileId)
    setFiles(files.filter((f) => f.id !== fileId))
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">My Gallery</h1>

      <div className="mb-6">
        <input
          type="file"
          accept="image/*"
          onChange={handleUpload}
          disabled={uploading}
          className="border p-2"
        />
        {uploading && <span className="ml-2">Uploading...</span>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {files.map((file) => (
          <div key={file.id} className="relative group">
            <img
              src={file.url}
              alt={file.filename}
              className="w-full h-48 object-cover rounded"
            />
            <button
              onClick={() => handleDelete(file.id)}
              className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100"
            >
              Delete
            </button>
            <p className="text-sm truncate mt-1">{file.filename}</p>
          </div>
        ))}
      </div>

      {files.length === 0 && (
        <p className="text-gray-500">No files yet. Upload your first image!</p>
      )}
    </div>
  )
}
```

### Protected Layout with Auth Check

```tsx
// app/(protected)/layout.tsx
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const session = cookieStore.get('sm_session')

  if (!session) {
    redirect('/login')
  }

  return <>{children}</>
}
```

---

## Security Checklist

- [ ] API key is stored in server-side env vars only (no `NEXT_PUBLIC_`)
- [ ] Using `createAuthRoutes()` or server-side client
- [ ] Session cookies are HTTP-only (automatic with SDK)
- [ ] HTTPS enabled in production
- [ ] Password minimum length enforced (8 characters)
- [ ] Email verification enabled for sensitive apps
- [ ] Rate limiting configured in ScaleMule dashboard

---

## Troubleshooting

### "Session cookie not being set"
- Ensure you're using `withSession()` helper
- Check that your domain is correct in cookie options
- Verify HTTPS in production (required for secure cookies)

### "Unauthorized errors after login"
- Check that `sm_session` cookie is being sent
- Verify cookie isn't expired
- Ensure `getSession()` is reading the correct cookie name

### "File upload fails"
- Check file size limits in ScaleMule dashboard
- Ensure user is authenticated (session cookie present)
- Verify content-type is allowed

### "CORS errors"
- The SDK uses your own API routes, so CORS shouldn't apply
- If calling ScaleMule directly (not recommended), configure CORS in gateway

---

## Support

For issues with this SDK, contact the ScaleMule team or open an issue at https://github.com/scalemule/nextjs/issues.
