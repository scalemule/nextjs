'use client'

/**
 * Testing Utilities for ScaleMule SDK
 *
 * Use these in your tests to mock ScaleMule functionality.
 *
 * @example
 * ```tsx
 * import { MockScaleMuleProvider, createMockUser } from '@scalemule/nextjs/testing'
 *
 * test('shows user name when logged in', () => {
 *   render(
 *     <MockScaleMuleProvider user={createMockUser({ full_name: 'John' })}>
 *       <ProfilePage />
 *     </MockScaleMuleProvider>
 *   )
 *   expect(screen.getByText('John')).toBeInTheDocument()
 * })
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from 'react'
import type { User, ApiError, ApiResponse, StorageFile } from './types'

// ============================================================================
// Mock User Factory
// ============================================================================

export interface MockUserOptions {
  id?: string
  email?: string
  email_verified?: boolean
  phone?: string | null
  phone_verified?: boolean
  full_name?: string | null
  username?: string | null
  avatar_url?: string | null
  status?: 'active' | 'suspended' | 'pending_verification'
  created_at?: string
}

export function createMockUser(options: MockUserOptions = {}): User {
  return {
    id: options.id ?? 'mock-user-id-123',
    email: options.email ?? 'test@example.com',
    email_verified: options.email_verified ?? true,
    phone: options.phone ?? null,
    phone_verified: options.phone_verified ?? false,
    full_name: options.full_name ?? 'Test User',
    username: options.username ?? null,
    avatar_url: options.avatar_url ?? null,
    status: options.status ?? 'active',
    created_at: options.created_at ?? new Date().toISOString(),
  }
}

// ============================================================================
// Mock File Factory
// ============================================================================

export interface MockFileOptions {
  id?: string
  filename?: string
  content_type?: string
  size_bytes?: number
  is_public?: boolean
  created_at?: string
  scan_status?: string
  url?: string
}

export function createMockFile(options: MockFileOptions = {}): StorageFile {
  const id = options.id ?? `mock-file-${Math.random().toString(36).slice(2)}`
  return {
    id,
    filename: options.filename ?? 'test-file.jpg',
    content_type: options.content_type ?? 'image/jpeg',
    size_bytes: options.size_bytes ?? 1024,
    is_public: options.is_public ?? false,
    created_at: options.created_at ?? new Date().toISOString(),
    scan_status: options.scan_status ?? 'clean',
    url: options.url ?? `https://storage.scalemule.com/files/${id}`,
  }
}

// ============================================================================
// Mock Client
// ============================================================================

export interface MockClientConfig {
  /** Simulated responses for specific paths */
  responses?: Record<string, ApiResponse<unknown>>
  /** Default delay in ms (simulates network latency) */
  delay?: number
  /** Whether to simulate errors */
  simulateErrors?: boolean
}

export class MockScaleMuleClient {
  private responses: Record<string, ApiResponse<unknown>>
  private delay: number
  private simulateErrors: boolean

  constructor(config: MockClientConfig = {}) {
    this.responses = config.responses ?? {}
    this.delay = config.delay ?? 0
    this.simulateErrors = config.simulateErrors ?? false
  }

  private async simulateDelay(): Promise<void> {
    if (this.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delay))
    }
  }

  async initialize(): Promise<void> {
    await this.simulateDelay()
  }

  async setSession(): Promise<void> {
    await this.simulateDelay()
  }

  async clearSession(): Promise<void> {
    await this.simulateDelay()
  }

  getSessionToken(): string | null {
    return 'mock-session-token'
  }

  getUserId(): string | null {
    return 'mock-user-id'
  }

  isAuthenticated(): boolean {
    return true
  }

  async request<T>(path: string): Promise<ApiResponse<T>> {
    await this.simulateDelay()

    if (this.simulateErrors) {
      return {
        success: false,
        error: { code: 'MOCK_ERROR', message: 'Simulated error' },
      }
    }

    if (this.responses[path]) {
      return this.responses[path] as ApiResponse<T>
    }

    return { success: true, data: {} as T }
  }

  async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path)
  }

  async post<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path)
  }

  async patch<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path)
  }

  async put<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path)
  }

  async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>(path)
  }

  async upload<T>(): Promise<ApiResponse<T>> {
    await this.simulateDelay()
    return { success: true, data: {} as T }
  }
}

// ============================================================================
// Mock Provider
// ============================================================================

interface MockScaleMuleContextValue {
  client: MockScaleMuleClient
  user: User | null
  setUser: (user: User | null) => void
  initializing: boolean
  error: ApiError | null
  setError: (error: ApiError | null) => void
}

const MockScaleMuleContext = createContext<MockScaleMuleContextValue | null>(null)

export interface MockScaleMuleProviderProps {
  children: ReactNode
  /** Initial user (null = not logged in) */
  user?: User | null
  /** Initial loading state */
  initializing?: boolean
  /** Initial error */
  error?: ApiError | null
  /** Mock client config */
  clientConfig?: MockClientConfig
}

/**
 * Mock provider for testing ScaleMule hooks
 *
 * @example
 * ```tsx
 * // Test authenticated state
 * render(
 *   <MockScaleMuleProvider user={createMockUser()}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 *
 * // Test loading state
 * render(
 *   <MockScaleMuleProvider initializing={true}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 *
 * // Test error state
 * render(
 *   <MockScaleMuleProvider error={{ code: 'TEST', message: 'Error' }}>
 *     <MyComponent />
 *   </MockScaleMuleProvider>
 * )
 * ```
 */
export function MockScaleMuleProvider({
  children,
  user: initialUser = null,
  initializing: initialInitializing = false,
  error: initialError = null,
  clientConfig,
}: MockScaleMuleProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser)
  const [error, setError] = useState<ApiError | null>(initialError)

  const client = useMemo(
    () => new MockScaleMuleClient(clientConfig),
    [clientConfig]
  )

  const value = useMemo(
    () => ({
      client,
      user,
      setUser,
      initializing: initialInitializing,
      error,
      setError,
    }),
    [client, user, initialInitializing, error]
  )

  return (
    <MockScaleMuleContext.Provider value={value}>
      {children}
    </MockScaleMuleContext.Provider>
  )
}

/**
 * Hook to use mock context (for testing hook internals)
 */
export function useMockScaleMule(): MockScaleMuleContextValue {
  const context = useContext(MockScaleMuleContext)
  if (!context) {
    throw new Error('useMockScaleMule must be used within MockScaleMuleProvider')
  }
  return context
}
