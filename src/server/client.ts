/**
 * Server-Side ScaleMule Client
 *
 * Stateless client for use in Next.js API routes.
 * Does not manage sessions - that's handled by cookies.
 */

import { ScaleMuleApiError } from '../types'
import type {
  ApiError,
  User,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  ListFilesParams,
  ListFilesResponse,
  StorageFile,
  UploadResponse,
  ClientContext,
} from '../types'
import { buildClientContextHeaders } from './context'

// ============================================================================
// Environment Presets
// ============================================================================

type ScaleMuleEnvironment = 'dev' | 'prod'

const GATEWAY_URLS: Record<ScaleMuleEnvironment, string> = {
  dev: 'https://api-dev.scalemule.com',
  prod: 'https://api.scalemule.com',
}

// ============================================================================
// Configuration
// ============================================================================

export interface ServerConfig {
  /** Your ScaleMule API key (use env var, never hardcode) */
  apiKey: string
  /** Environment: 'dev' or 'prod' - automatically sets gateway URL */
  environment?: ScaleMuleEnvironment
  /** Custom gateway URL (overrides environment preset) */
  gatewayUrl?: string
  /** Enable debug logging */
  debug?: boolean
}

function resolveGatewayUrl(config: ServerConfig): string {
  if (config.gatewayUrl) return config.gatewayUrl
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL
  return GATEWAY_URLS[config.environment || 'prod']
}

// ============================================================================
// Server Client
// ============================================================================

export class ScaleMuleServer {
  private apiKey: string
  private gatewayUrl: string
  private debug: boolean

  constructor(config: ServerConfig) {
    this.apiKey = config.apiKey
    this.gatewayUrl = resolveGatewayUrl(config)
    this.debug = config.debug || false
  }

  /**
   * Make a request to the ScaleMule API
   *
   * @param method - HTTP method
   * @param path - API path (e.g., /v1/auth/login)
   * @param options - Request options
   * @param options.body - Request body (will be JSON stringified)
   * @param options.userId - User ID (passed through for storage operations)
   * @param options.sessionToken - Session token sent as Authorization: Bearer header
   * @param options.clientContext - End user context to forward (IP, user agent, etc.)
   */
  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown
      userId?: string
      sessionToken?: string
      clientContext?: ClientContext
    } = {}
  ): Promise<T> {
    const url = `${this.gatewayUrl}${path}`

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      // Forward client context headers if provided
      ...buildClientContextHeaders(options.clientContext),
    }

    if (options.sessionToken) {
      headers['Authorization'] = `Bearer ${options.sessionToken}`
    }

    if (this.debug) {
      console.log(`[ScaleMule Server] ${method} ${path}`)
      if (options.clientContext) {
        console.log(`[ScaleMule Server] Client context: IP=${options.clientContext.ip}, UA=${options.clientContext.userAgent?.substring(0, 50)}...`)
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      })

      const text = await response.text()
      let responseData: Record<string, unknown> | null = null
      try {
        responseData = text ? JSON.parse(text) : null
      } catch {
        // Non-JSON response
      }

      if (!response.ok) {
        const error: ApiError = responseData?.error as ApiError || {
          code: `HTTP_${response.status}`,
          message: (responseData?.message as string) || text || response.statusText,
        }
        throw new ScaleMuleApiError(error)
      }

      // Unwrap envelope: backend may return { data: T } or raw T
      const data = responseData?.data !== undefined ? responseData.data : responseData
      return data as T
    } catch (err) {
      // Re-throw ScaleMuleApiError as-is
      if (err instanceof ScaleMuleApiError) {
        throw err
      }

      throw new ScaleMuleApiError({
        code: 'SERVER_ERROR',
        message: err instanceof Error ? err.message : 'Request failed',
      })
    }
  }

  // ==========================================================================
  // Auth Methods
  // ==========================================================================

  auth = {
    /**
     * Register a new user
     */
    register: async (data: RegisterRequest, options?: { clientContext?: ClientContext }): Promise<User> => {
      return this.request<User>('POST', '/v1/auth/register', { body: data, clientContext: options?.clientContext })
    },

    /**
     * Login user - returns session token (store in HTTP-only cookie)
     */
    login: async (data: LoginRequest, options?: { clientContext?: ClientContext }): Promise<LoginResponse> => {
      return this.request<LoginResponse>('POST', '/v1/auth/login', { body: data, clientContext: options?.clientContext })
    },

    /**
     * Logout user
     */
    logout: async (sessionToken: string): Promise<void> => {
      return this.request<void>('POST', '/v1/auth/logout', {
        body: { session_token: sessionToken },
      })
    },

    /**
     * Get current user from session token
     */
    me: async (sessionToken: string): Promise<User> => {
      return this.request<User>('GET', '/v1/auth/me', { sessionToken })
    },

    /**
     * Refresh session token
     */
    refresh: async (
      sessionToken: string
    ): Promise<{ session_token: string; expires_at: string }> => {
      return this.request('POST', '/v1/auth/refresh', {
        body: { session_token: sessionToken },
      })
    },

    /**
     * Request password reset email
     */
    forgotPassword: async (email: string, options?: { clientContext?: ClientContext }): Promise<{ message: string }> => {
      return this.request('POST', '/v1/auth/forgot-password', { body: { email }, clientContext: options?.clientContext })
    },

    /**
     * Reset password with token
     */
    resetPassword: async (
      token: string,
      newPassword: string,
      options?: { clientContext?: ClientContext }
    ): Promise<{ message: string }> => {
      return this.request('POST', '/v1/auth/reset-password', {
        body: { token, new_password: newPassword },
        clientContext: options?.clientContext,
      })
    },

    /**
     * Verify email with token
     */
    verifyEmail: async (token: string): Promise<{ message: string }> => {
      return this.request('POST', '/v1/auth/verify-email', { body: { token } })
    },

    /**
     * Resend verification email.
     * Can be called with a session token (authenticated) or email (unauthenticated).
     */
    resendVerification: async (
      sessionTokenOrEmail: string,
      options?: { email?: string },
    ): Promise<{ message: string }> => {
      // If options.email is provided, treat first arg as session token
      // If first arg looks like an email, send email-based (no session required)
      if (options?.email) {
        return this.request('POST', '/v1/auth/resend-verification', {
          sessionToken: sessionTokenOrEmail,
          body: { email: options.email },
        })
      }
      if (sessionTokenOrEmail.includes('@')) {
        return this.request('POST', '/v1/auth/resend-verification', {
          body: { email: sessionTokenOrEmail },
        })
      }
      return this.request('POST', '/v1/auth/resend-verification', {
        sessionToken: sessionTokenOrEmail,
      })
    },
  }

  // ==========================================================================
  // User/Profile Methods
  // ==========================================================================

  user = {
    /**
     * Update user profile
     */
    update: async (
      sessionToken: string,
      data: { full_name?: string; avatar_url?: string }
    ): Promise<User> => {
      return this.request<User>('PATCH', '/v1/auth/profile', {
        sessionToken,
        body: data,
      })
    },

    /**
     * Change password
     */
    changePassword: async (
      sessionToken: string,
      currentPassword: string,
      newPassword: string
    ): Promise<{ message: string }> => {
      return this.request('POST', '/v1/auth/change-password', {
        sessionToken,
        body: { current_password: currentPassword, new_password: newPassword },
      })
    },

    /**
     * Change email
     */
    changeEmail: async (
      sessionToken: string,
      newEmail: string,
      password: string
    ): Promise<{ message: string }> => {
      return this.request('POST', '/v1/auth/change-email', {
        sessionToken,
        body: { new_email: newEmail, password },
      })
    },

    /**
     * Delete account
     */
    deleteAccount: async (
      sessionToken: string,
      password: string
    ): Promise<{ message: string }> => {
      return this.request('DELETE', '/v1/auth/me', {
        sessionToken,
        body: { password },
      })
    },
  }

  // ==========================================================================
  // Storage/Content Methods
  // ==========================================================================

  // ==========================================================================
  // Secrets Methods (Tenant Vault)
  // ==========================================================================

  secrets = {
    /**
     * Get a secret from the tenant vault
     *
     * @example
     * ```typescript
     * const result = await scalemule.secrets.get('ANONYMOUS_USER_SALT')
     * if (result.success) {
     *   console.log('Salt:', result.data.value)
     * }
     * ```
     */
    get: async (key: string): Promise<{ value: string; version: number }> => {
      return this.request<{ value: string; version: number }>('GET', `/v1/vault/secrets/${encodeURIComponent(key)}`)
    },

    /**
     * Set a secret in the tenant vault
     *
     * @example
     * ```typescript
     * await scalemule.secrets.set('ANONYMOUS_USER_SALT', 'my-secret-salt')
     * ```
     */
    set: async (key: string, value: string): Promise<{ value: string; version: number }> => {
      return this.request<{ value: string; version: number }>('PUT', `/v1/vault/secrets/${encodeURIComponent(key)}`, {
        body: { value },
      })
    },

    /**
     * Delete a secret from the tenant vault
     */
    delete: async (key: string): Promise<void> => {
      return this.request<void>('DELETE', `/v1/vault/secrets/${encodeURIComponent(key)}`)
    },

    /**
     * List all secrets in the tenant vault
     */
    list: async (): Promise<{ secrets: Array<{ path: string; version: number }> }> => {
      return this.request<{ secrets: Array<{ path: string; version: number }> }>('GET', '/v1/vault/secrets')
    },

    /**
     * Get secret version history
     */
    versions: async (key: string): Promise<{ versions: Array<{ version: number; created_at: string }> }> => {
      return this.request<{ versions: Array<{ version: number; created_at: string }> }>(
        'GET',
        `/v1/vault/versions/${encodeURIComponent(key)}`
      )
    },

    /**
     * Rollback to a specific version
     */
    rollback: async (key: string, version: number): Promise<{ value: string; version: number }> => {
      return this.request<{ value: string; version: number }>(
        'POST',
        `/v1/vault/actions/rollback/${encodeURIComponent(key)}`,
        { body: { version } }
      )
    },

    /**
     * Rotate a secret (copy current version as new version)
     */
    rotate: async (key: string, newValue: string): Promise<{ value: string; version: number }> => {
      return this.request<{ value: string; version: number }>(
        'POST',
        `/v1/vault/actions/rotate/${encodeURIComponent(key)}`,
        { body: { value: newValue } }
      )
    },
  }

  // ==========================================================================
  // Bundle Methods (Structured Secrets with Inheritance)
  // ==========================================================================

  bundles = {
    /**
     * Get a bundle (structured secret like database credentials)
     *
     * @param key - Bundle key (e.g., 'database/prod')
     * @param resolve - Whether to resolve inheritance (default: true)
     *
     * @example
     * ```typescript
     * const result = await scalemule.bundles.get('database/prod')
     * if (result.success) {
     *   console.log('DB Host:', result.data.data.host)
     * }
     * ```
     */
    get: async <T = Record<string, unknown>>(
      key: string,
      resolve = true
    ): Promise<{ type: string; data: T; version: number; inherits_from?: string }> => {
      const params = new URLSearchParams({ resolve: resolve.toString() })
      return this.request<{ type: string; data: T; version: number; inherits_from?: string }>(
        'GET',
        `/v1/vault/bundles/${encodeURIComponent(key)}?${params}`
      )
    },

    /**
     * Set a bundle (structured secret)
     *
     * @param key - Bundle key
     * @param type - Bundle type: 'mysql', 'postgres', 'redis', 's3', 'oauth', 'smtp', 'generic'
     * @param data - Bundle data (structure depends on type)
     * @param inheritsFrom - Optional parent bundle key for inheritance
     *
     * @example
     * ```typescript
     * // Create a MySQL bundle
     * await scalemule.bundles.set('database/prod', 'mysql', {
     *   host: 'db.example.com',
     *   port: 3306,
     *   username: 'app',
     *   password: 'secret',
     *   database: 'myapp'
     * })
     *
     * // Create a bundle that inherits from another
     * await scalemule.bundles.set('database/staging', 'mysql', {
     *   host: 'staging-db.example.com', // Override just the host
     * }, 'database/prod')
     * ```
     */
    set: async <T = Record<string, unknown>>(
      key: string,
      type: string,
      data: T,
      inheritsFrom?: string
    ): Promise<{ type: string; data: T; version: number }> => {
      return this.request<{ type: string; data: T; version: number }>(
        'PUT',
        `/v1/vault/bundles/${encodeURIComponent(key)}`,
        {
          body: {
            type,
            value: data,
            inherits_from: inheritsFrom,
          },
        }
      )
    },

    /**
     * Delete a bundle
     */
    delete: async (key: string): Promise<void> => {
      return this.request<void>('DELETE', `/v1/vault/bundles/${encodeURIComponent(key)}`)
    },

    /**
     * List all bundles
     */
    list: async (): Promise<{ bundles: Array<{ path: string; type: string; version: number; inherits_from?: string }> }> => {
      return this.request<{ bundles: Array<{ path: string; type: string; version: number; inherits_from?: string }> }>(
        'GET',
        '/v1/vault/bundles'
      )
    },

    /**
     * Get connection URL for a database bundle
     *
     * @example
     * ```typescript
     * const result = await scalemule.bundles.connectionUrl('database/prod')
     * if (result.success) {
     *   const client = mysql.createConnection(result.data.url)
     * }
     * ```
     */
    connectionUrl: async (key: string): Promise<{ url: string }> => {
      return this.request<{ url: string }>(
        'GET',
        `/v1/vault/bundles/${encodeURIComponent(key)}?connection_url=true`
      )
    },
  }

  // ==========================================================================
  // Vault Audit Methods
  // ==========================================================================

  vaultAudit = {
    /**
     * Query audit logs for your tenant's vault operations
     *
     * @example
     * ```typescript
     * const result = await scalemule.vaultAudit.query({
     *   action: 'read',
     *   path: 'database/*',
     *   since: '2026-01-01'
     * })
     * ```
     */
    query: async (options?: {
      action?: 'read' | 'write' | 'delete' | 'list'
      path?: string
      since?: string
      until?: string
      limit?: number
    }): Promise<{ logs: Array<{
      timestamp: string
      action: string
      resource_path: string
      success: boolean
      error_message?: string
    }> }> => {
      const params = new URLSearchParams()
      if (options?.action) params.set('action', options.action)
      if (options?.path) params.set('path', options.path)
      if (options?.since) params.set('since', options.since)
      if (options?.until) params.set('until', options.until)
      if (options?.limit) params.set('limit', options.limit.toString())

      const queryStr = params.toString()
      return this.request<{ logs: Array<{
        timestamp: string
        action: string
        resource_path: string
        success: boolean
        error_message?: string
      }> }>('GET', `/v1/vault/audit${queryStr ? `?${queryStr}` : ''}`)
    },
  }

  storage = {
    /**
     * List user's files
     */
    list: async (
      userId: string,
      params?: ListFilesParams
    ): Promise<ListFilesResponse> => {
      const query = new URLSearchParams()
      if (params?.content_type) query.set('content_type', params.content_type)
      if (params?.search) query.set('search', params.search)
      if (params?.limit) query.set('limit', params.limit.toString())
      if (params?.offset) query.set('offset', params.offset.toString())

      const queryStr = query.toString()
      const path = `/v1/storage/my-files${queryStr ? `?${queryStr}` : ''}`

      return this.request<ListFilesResponse>('GET', path, { userId })
    },

    /**
     * Get file info
     */
    get: async (fileId: string): Promise<StorageFile> => {
      return this.request<StorageFile>('GET', `/v1/storage/files/${fileId}/info`)
    },

    /**
     * Delete file
     */
    delete: async (userId: string, fileId: string): Promise<void> => {
      return this.request<void>('DELETE', `/v1/storage/files/${fileId}`, { userId })
    },

    /**
     * Upload file (from server - use FormData)
     *
     * @param userId - The user ID who owns this file
     * @param file - File data to upload
     * @param options - Upload options
     * @param options.clientContext - End user context to forward (IP, user agent, etc.)
     *
     * @example
     * ```typescript
     * // Forward end user context for proper attribution
     * const result = await scalemule.storage.upload(
     *   userId,
     *   { buffer, filename, contentType },
     *   { clientContext: extractClientContext(request) }
     * )
     * ```
     */
    upload: async (
      userId: string,
      file: {
        buffer: BlobPart
        filename: string
        contentType: string
      },
      options?: {
        clientContext?: ClientContext
      }
    ): Promise<UploadResponse> => {
      const formData = new FormData()
      const blob = new Blob([file.buffer], { type: file.contentType })
      formData.append('file', blob, file.filename)
      formData.append('sm_user_id', userId)

      const url = `${this.gatewayUrl}/v1/storage/upload`

      // Build headers including client context for proper end user attribution
      const headers: Record<string, string> = {
        'x-api-key': this.apiKey,
        'x-user-id': userId,
        ...buildClientContextHeaders(options?.clientContext),
      }

      if (this.debug && options?.clientContext) {
        console.log(`[ScaleMule Server] Upload with client context: IP=${options.clientContext.ip}`)
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
        })

        const text = await response.text()
        let responseData: Record<string, unknown> | null = null
        try {
          responseData = text ? JSON.parse(text) : null
        } catch {
          // Non-JSON response
        }

        if (!response.ok) {
          throw new ScaleMuleApiError(
            (responseData?.error as ApiError) || { code: 'UPLOAD_FAILED', message: text || 'Upload failed' }
          )
        }

        // Unwrap envelope: backend may return { data: T } or raw T
        const data = responseData?.data !== undefined ? responseData.data : responseData
        return data as UploadResponse
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          throw err
        }

        throw new ScaleMuleApiError({
          code: 'UPLOAD_ERROR',
          message: err instanceof Error ? err.message : 'Upload failed',
        })
      }
    },
  }

  // ==========================================================================
  // Analytics Methods
  // ==========================================================================

  // ==========================================================================
  // Webhooks Methods
  // ==========================================================================

  webhooks = {
    /**
     * Create a new webhook subscription
     *
     * @example
     * ```typescript
     * const result = await scalemule.webhooks.create({
     *   webhook_name: 'Video Status Webhook',
     *   url: 'https://myapp.com/api/webhooks/scalemule',
     *   events: ['video.ready', 'video.failed']
     * })
     *
     * // Store the secret for signature verification
     * console.log('Webhook secret:', result.secret)
     * ```
     */
    create: async (data: {
      webhook_name: string
      url: string
      events: string[]
    }): Promise<{ id: string; secret: string; url: string; events: string[] }> => {
      return this.request<{ id: string; secret: string; url: string; events: string[] }>(
        'POST',
        '/v1/webhooks',
        { body: data }
      )
    },

    /**
     * List all webhook subscriptions
     */
    list: async (): Promise<{
      webhooks: Array<{
        id: string
        webhook_name: string
        url: string
        events: string[]
        is_enabled: boolean
      }>
    }> => {
      return this.request<{
        webhooks: Array<{
          id: string
          webhook_name: string
          url: string
          events: string[]
          is_enabled: boolean
        }>
      }>('GET', '/v1/webhooks')
    },

    /**
     * Delete a webhook subscription
     */
    delete: async (id: string): Promise<void> => {
      return this.request<void>('DELETE', `/v1/webhooks/${id}`)
    },

    /**
     * Update a webhook subscription
     */
    update: async (
      id: string,
      data: { url?: string; events?: string[]; is_enabled?: boolean }
    ): Promise<{ id: string; url: string; events: string[] }> => {
      return this.request<{ id: string; url: string; events: string[] }>(
        'PATCH',
        `/v1/webhooks/${id}`,
        { body: data }
      )
    },

    /**
     * Get available webhook event types
     */
    eventTypes: async (): Promise<{
      events: Array<{
        event_name: string
        event_description: string
        payload_schema: Record<string, unknown>
      }>
    }> => {
      return this.request<{
        events: Array<{
          event_name: string
          event_description: string
          payload_schema: Record<string, unknown>
        }>
      }>('GET', '/v1/webhooks/events')
    },
  }

  // ==========================================================================
  // Analytics Methods
  // ==========================================================================

  analytics = {
    /**
     * Track an analytics event
     *
     * IMPORTANT: When calling from server-side code (API routes), always pass
     * clientContext to ensure the real end user's IP is recorded, not the server's IP.
     *
     * @example
     * ```typescript
     * // In an API route
     * import { extractClientContext, createServerClient } from '@scalemule/nextjs/server'
     *
     * export async function POST(request: NextRequest) {
     *   const clientContext = extractClientContext(request)
     *   const scalemule = createServerClient()
     *
     *   await scalemule.analytics.trackEvent({
     *     event_name: 'button_clicked',
     *     properties: { button_id: 'signup' }
     *   }, { clientContext })
     * }
     * ```
     */
    trackEvent: async (
      event: {
        event_name: string
        event_category?: string
        properties?: Record<string, unknown>
        user_id?: string
        session_id?: string
        anonymous_id?: string
        session_duration_seconds?: number
        page_url?: string
        page_title?: string
        referrer?: string
        landing_page?: string
        device_type?: string
        device_brand?: string
        device_model?: string
        browser?: string
        browser_version?: string
        os?: string
        os_version?: string
        screen_resolution?: string
        viewport_size?: string
        utm_source?: string
        utm_medium?: string
        utm_campaign?: string
        utm_term?: string
        utm_content?: string
        client_timestamp?: string
        timestamp?: string
      },
      options?: { clientContext?: ClientContext }
    ): Promise<{ tracked: number; session_id?: string }> => {
      return this.request<{ tracked: number; session_id?: string }>('POST', '/v1/analytics/v2/events', {
        body: event,
        clientContext: options?.clientContext,
      })
    },

    /**
     * Track a page view
     *
     * @example
     * ```typescript
     * await scalemule.analytics.trackPageView({
     *   page_url: 'https://example.com/products',
     *   page_title: 'Products',
     *   referrer: 'https://google.com'
     * }, { clientContext })
     * ```
     */
    trackPageView: async (
      data: {
        page_url: string
        page_title?: string
        referrer?: string
        session_id?: string
        user_id?: string
      },
      options?: { clientContext?: ClientContext }
    ): Promise<{ tracked: number; session_id?: string }> => {
      return this.request<{ tracked: number; session_id?: string }>('POST', '/v1/analytics/v2/events', {
        body: {
          event_name: 'page_viewed',
          event_category: 'navigation',
          page_url: data.page_url,
          properties: {
            page_title: data.page_title,
            referrer: data.referrer,
          },
          session_id: data.session_id,
          user_id: data.user_id,
        },
        clientContext: options?.clientContext,
      })
    },

    /**
     * Track multiple events in a batch (max 100)
     *
     * @example
     * ```typescript
     * await scalemule.analytics.trackBatch([
     *   { event_name: 'item_viewed', properties: { item_id: '123' } },
     *   { event_name: 'item_added_to_cart', properties: { item_id: '123' } }
     * ], { clientContext })
     * ```
     */
    trackBatch: async (
      events: Array<{
        event_name: string
        event_category?: string
        properties?: Record<string, unknown>
        user_id?: string
        session_id?: string
        anonymous_id?: string
        session_duration_seconds?: number
        page_url?: string
        page_title?: string
        referrer?: string
        landing_page?: string
        device_type?: string
        browser?: string
        os?: string
        screen_resolution?: string
        viewport_size?: string
        utm_source?: string
        utm_medium?: string
        utm_campaign?: string
        utm_term?: string
        utm_content?: string
        client_timestamp?: string
        timestamp?: string
      }>,
      options?: { clientContext?: ClientContext }
    ): Promise<{ tracked: number }> => {
      return this.request<{ tracked: number }>('POST', '/v1/analytics/v2/events/batch', {
        body: { events },
        clientContext: options?.clientContext,
      })
    },
  }
}

/**
 * Create a server client with environment-based defaults
 */
export function createServerClient(config?: Partial<ServerConfig>): ScaleMuleServer {
  const apiKey = config?.apiKey || process.env.SCALEMULE_API_KEY

  if (!apiKey) {
    throw new Error(
      'ScaleMule API key is required. Set SCALEMULE_API_KEY environment variable or pass apiKey in config.'
    )
  }

  const environment = (config?.environment ||
    process.env.SCALEMULE_ENV ||
    'prod') as ScaleMuleEnvironment

  return new ScaleMuleServer({
    apiKey,
    environment,
    gatewayUrl: config?.gatewayUrl,
    debug: config?.debug || process.env.SCALEMULE_DEBUG === 'true',
  })
}
