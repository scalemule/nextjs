/**
 * ScaleMule API Client
 *
 * Core HTTP client that handles:
 * - Automatic x-api-key header injection
 * - Automatic Authorization: Bearer header injection when authenticated
 * - Session token management
 * - Error handling and response parsing
 */

import type { ApiResponse, ApiError, StorageAdapter } from './types'

// ============================================================================
// Environment Presets
// ============================================================================

export type ScaleMuleEnvironment = 'dev' | 'prod'

const GATEWAY_URLS: Record<ScaleMuleEnvironment, string> = {
  dev: 'https://api-dev.scalemule.com',
  prod: 'https://api.scalemule.com',
}

const SESSION_STORAGE_KEY = 'scalemule_session'
const USER_ID_STORAGE_KEY = 'scalemule_user_id'

// Status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])

/**
 * Sleep for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate backoff delay with jitter
 */
function getBackoffDelay(attempt: number, baseDelay = 1000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * 0.3 * exponentialDelay // 30% jitter
  return Math.min(exponentialDelay + jitter, 30000) // Cap at 30s
}

/**
 * Sanitize filename for safe multipart upload
 * Handles Safari/iOS unicode issues and special characters
 */
function sanitizeFilename(filename: string): string {
  // Remove null bytes and control characters
  let sanitized = filename.replace(/[\x00-\x1f\x7f]/g, '')

  // Replace problematic characters that can break multipart parsing
  // These include: quotes, backslash, newlines, and some unicode chars
  sanitized = sanitized
    .replace(/["\\/\n\r]/g, '_')
    // Normalize unicode to NFC form (Safari sometimes sends NFD)
    .normalize('NFC')
    // Remove zero-width characters and BOM
    .replace(/[\u200b-\u200f\ufeff\u2028\u2029]/g, '')

  // Ensure there's at least a filename
  if (!sanitized || sanitized.trim() === '') {
    sanitized = 'unnamed'
  }

  // Truncate to reasonable length (255 bytes max for most filesystems)
  if (sanitized.length > 200) {
    const ext = sanitized.split('.').pop()
    const base = sanitized.substring(0, 190)
    sanitized = ext ? `${base}.${ext}` : base
  }

  return sanitized.trim()
}

// ============================================================================
// Rate Limit Queue
// ============================================================================

interface QueuedRequest<T> {
  execute: () => Promise<ApiResponse<T>>
  resolve: (value: ApiResponse<T>) => void
  reject: (reason: unknown) => void
  priority: number
}

/**
 * Rate limit aware request queue
 * Manages request throttling when hitting rate limits
 */
class RateLimitQueue {
  private queue: QueuedRequest<unknown>[] = []
  private processing = false
  private rateLimitedUntil: number = 0
  private requestsInWindow: number = 0
  private windowStart: number = Date.now()
  private maxRequestsPerWindow: number = 100
  private windowDurationMs: number = 60000 // 1 minute

  /**
   * Add request to queue
   */
  enqueue<T>(execute: () => Promise<ApiResponse<T>>, priority = 0): Promise<ApiResponse<T>> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<ApiResponse<unknown>>,
        resolve: resolve as (value: ApiResponse<unknown>) => void,
        reject,
        priority,
      })
      // Sort by priority (higher first)
      this.queue.sort((a, b) => b.priority - a.priority)
      this.processQueue()
    })
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return
    this.processing = true

    while (this.queue.length > 0) {
      // Check if we're rate limited
      const now = Date.now()
      if (now < this.rateLimitedUntil) {
        const waitTime = this.rateLimitedUntil - now
        await sleep(waitTime)
      }

      // Reset window if needed
      if (now - this.windowStart >= this.windowDurationMs) {
        this.windowStart = now
        this.requestsInWindow = 0
      }

      // Check if we're at the limit
      if (this.requestsInWindow >= this.maxRequestsPerWindow) {
        const waitTime = this.windowDurationMs - (now - this.windowStart)
        await sleep(waitTime)
        this.windowStart = Date.now()
        this.requestsInWindow = 0
      }

      const request = this.queue.shift()
      if (!request) continue

      try {
        this.requestsInWindow++
        const result = await request.execute()

        // Check for rate limit response
        if (!result.success && result.error?.code === 'RATE_LIMITED') {
          // Re-queue the request
          this.queue.unshift(request)
          // Set rate limit delay (default 60s if not specified)
          this.rateLimitedUntil = Date.now() + 60000
        } else {
          request.resolve(result)
        }
      } catch (error) {
        request.reject(error)
      }
    }

    this.processing = false
  }

  /**
   * Update rate limit from response headers
   */
  updateFromHeaders(headers: Headers): void {
    const retryAfter = headers.get('Retry-After')
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10)
      if (!isNaN(seconds)) {
        this.rateLimitedUntil = Date.now() + seconds * 1000
      }
    }

    const remaining = headers.get('X-RateLimit-Remaining')
    if (remaining) {
      const count = parseInt(remaining, 10)
      if (!isNaN(count) && count === 0) {
        const reset = headers.get('X-RateLimit-Reset')
        if (reset) {
          const resetTime = parseInt(reset, 10) * 1000
          if (!isNaN(resetTime)) {
            this.rateLimitedUntil = resetTime
          }
        }
      }
    }
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length
  }

  /**
   * Check if rate limited
   */
  get isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil
  }
}

// ============================================================================
// Offline Queue
// ============================================================================

interface OfflineQueueItem {
  id: string
  method: string
  path: string
  body?: string
  timestamp: number
}

/**
 * Offline request queue
 * Stores requests when offline and syncs when back online
 */
class OfflineQueue {
  private queue: OfflineQueueItem[] = []
  private storageKey = 'scalemule_offline_queue'
  private isOnline = true
  private onOnline: (() => void) | null = null
  private storage: StorageAdapter

  constructor(storage: StorageAdapter) {
    this.storage = storage
    this.loadFromStorage()
    this.setupOnlineListener()
  }

  /**
   * Setup online/offline event listeners
   */
  private setupOnlineListener(): void {
    if (typeof window === 'undefined') return

    this.isOnline = navigator.onLine

    window.addEventListener('online', () => {
      this.isOnline = true
      if (this.onOnline) this.onOnline()
    })

    window.addEventListener('offline', () => {
      this.isOnline = false
    })
  }

  /**
   * Load queue from storage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const data = await this.storage.getItem(this.storageKey)
      if (data) {
        this.queue = JSON.parse(data)
      }
    } catch {
      // Ignore errors
    }
  }

  /**
   * Save queue to storage
   */
  private async saveToStorage(): Promise<void> {
    try {
      await this.storage.setItem(this.storageKey, JSON.stringify(this.queue))
    } catch {
      // Ignore errors
    }
  }

  /**
   * Add request to offline queue
   */
  async add(method: string, path: string, body?: unknown): Promise<void> {
    const item: OfflineQueueItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      path,
      body: body ? JSON.stringify(body) : undefined,
      timestamp: Date.now(),
    }
    this.queue.push(item)
    await this.saveToStorage()
  }

  /**
   * Get all queued requests
   */
  getAll(): OfflineQueueItem[] {
    return [...this.queue]
  }

  /**
   * Remove a request from queue
   */
  async remove(id: string): Promise<void> {
    this.queue = this.queue.filter((item) => item.id !== id)
    await this.saveToStorage()
  }

  /**
   * Clear all queued requests
   */
  async clear(): Promise<void> {
    this.queue = []
    await this.saveToStorage()
  }

  /**
   * Set callback for when coming back online
   */
  setOnlineCallback(callback: () => void): void {
    this.onOnline = callback
  }

  /**
   * Check if currently online
   */
  get online(): boolean {
    return this.isOnline
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length
  }
}

export interface ClientConfig {
  /** Your ScaleMule API key */
  apiKey: string
  /** Your ScaleMule Application ID (required for realtime features) */
  applicationId?: string
  /** Environment: 'dev' or 'prod' - automatically sets gateway URL */
  environment?: ScaleMuleEnvironment
  /** Custom gateway URL (overrides environment preset) */
  gatewayUrl?: string
  /** Enable debug logging */
  debug?: boolean
  /** Custom storage adapter */
  storage?: StorageAdapter
  /** Enable rate limit queue (automatically queues requests when rate limited) */
  enableRateLimitQueue?: boolean
  /** Enable offline queue (queues requests when offline, syncs when back online) */
  enableOfflineQueue?: boolean
}

/**
 * Resolve gateway URL from config
 * Priority: gatewayUrl > environment > default (prod)
 */
function resolveGatewayUrl(config: ClientConfig): string {
  if (config.gatewayUrl) {
    return config.gatewayUrl
  }
  const env = config.environment || 'prod'
  return GATEWAY_URLS[env]
}

export interface RequestOptions extends RequestInit {
  /** Skip adding auth headers (for public endpoints) */
  skipAuth?: boolean
  /** Custom timeout in milliseconds */
  timeout?: number
  /** Number of retry attempts for transient failures (default: 2) */
  retries?: number
  /** Skip retries */
  skipRetry?: boolean
}

/**
 * Default storage adapter using localStorage (browser) or in-memory (SSR)
 */
function createDefaultStorage(): StorageAdapter {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && window.localStorage) {
    return {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key),
    }
  }

  // In-memory storage for SSR
  const memoryStorage = new Map<string, string>()
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => { memoryStorage.set(key, value) },
    removeItem: (key) => { memoryStorage.delete(key) },
  }
}

/**
 * ScaleMule API Client
 *
 * Handles all HTTP communication with the ScaleMule gateway.
 */
export class ScaleMuleClient {
  private apiKey: string
  private applicationId: string | null = null
  private gatewayUrl: string
  private debug: boolean
  private storage: StorageAdapter
  private sessionToken: string | null = null
  private userId: string | null = null
  private rateLimitQueue: RateLimitQueue | null = null
  private offlineQueue: OfflineQueue | null = null
  private enableRateLimitQueue: boolean
  private enableOfflineQueue: boolean

  constructor(config: ClientConfig) {
    this.apiKey = config.apiKey
    this.applicationId = config.applicationId || null
    this.gatewayUrl = resolveGatewayUrl(config)
    this.debug = config.debug || false
    this.storage = config.storage || createDefaultStorage()
    this.enableRateLimitQueue = config.enableRateLimitQueue || false
    this.enableOfflineQueue = config.enableOfflineQueue || false

    if (this.enableRateLimitQueue) {
      this.rateLimitQueue = new RateLimitQueue()
    }

    if (this.enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue(this.storage)
      this.offlineQueue.setOnlineCallback(() => this.syncOfflineQueue())
    }
  }

  /**
   * Sync offline queue when coming back online
   */
  private async syncOfflineQueue(): Promise<void> {
    if (!this.offlineQueue) return

    const items = this.offlineQueue.getAll()
    if (this.debug && items.length > 0) {
      console.log(`[ScaleMule] Syncing ${items.length} offline requests`)
    }

    for (const item of items) {
      try {
        await this.request(item.path, {
          method: item.method,
          body: item.body,
          skipRetry: true,
        })
        await this.offlineQueue.remove(item.id)
      } catch (err) {
        if (this.debug) {
          console.error('[ScaleMule] Failed to sync offline request:', err)
        }
        // Stop syncing if we hit an error (might be offline again)
        break
      }
    }
  }

  /**
   * Check if client is online
   */
  isOnline(): boolean {
    if (this.offlineQueue) {
      return this.offlineQueue.online
    }
    return typeof navigator === 'undefined' || navigator.onLine
  }

  /**
   * Get number of pending offline requests
   */
  getOfflineQueueLength(): number {
    return this.offlineQueue?.length || 0
  }

  /**
   * Get number of pending rate-limited requests
   */
  getRateLimitQueueLength(): number {
    return this.rateLimitQueue?.length || 0
  }

  /**
   * Check if currently rate limited
   */
  isRateLimited(): boolean {
    return this.rateLimitQueue?.isRateLimited || false
  }

  /**
   * Get the gateway URL
   */
  getGatewayUrl(): string {
    return this.gatewayUrl
  }

  /**
   * Get the application ID (required for realtime features)
   */
  getApplicationId(): string | null {
    return this.applicationId
  }

  /**
   * Initialize client by loading persisted session
   */
  async initialize(): Promise<void> {
    const token = await this.storage.getItem(SESSION_STORAGE_KEY)
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY)

    if (token) this.sessionToken = token
    if (userId) this.userId = userId

    if (this.debug) {
      console.log('[ScaleMule] Initialized with session:', !!token)
    }
  }

  /**
   * Set session after login
   */
  async setSession(token: string, userId: string): Promise<void> {
    this.sessionToken = token
    this.userId = userId
    await this.storage.setItem(SESSION_STORAGE_KEY, token)
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId)

    if (this.debug) {
      console.log('[ScaleMule] Session set for user:', userId)
    }
  }

  /**
   * Clear session on logout
   */
  async clearSession(): Promise<void> {
    this.sessionToken = null
    this.userId = null
    await this.storage.removeItem(SESSION_STORAGE_KEY)
    await this.storage.removeItem(USER_ID_STORAGE_KEY)

    if (this.debug) {
      console.log('[ScaleMule] Session cleared')
    }
  }

  /**
   * Get current session token
   */
  getSessionToken(): string | null {
    return this.sessionToken
  }

  /**
   * Get current user ID
   */
  getUserId(): string | null {
    return this.userId
  }

  /**
   * Check if client has an active session
   */
  isAuthenticated(): boolean {
    return this.sessionToken !== null && this.userId !== null
  }

  /**
   * Build headers for a request
   */
  private buildHeaders(options?: RequestOptions): Headers {
    const headers = new Headers(options?.headers)

    // Always include API key
    headers.set('x-api-key', this.apiKey)

    // Include session token as Bearer auth if available and not skipping auth
    // Gateway validates the Bearer token and injects x-user-id downstream
    if (!options?.skipAuth && this.sessionToken) {
      headers.set('Authorization', `Bearer ${this.sessionToken}`)
    }

    // Set content type if not already set and body is present
    if (!headers.has('Content-Type') && options?.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json')
    }

    return headers
  }

  /**
   * Make an HTTP request to the ScaleMule API
   */
  async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.gatewayUrl}${path}`
    const headers = this.buildHeaders(options)
    const maxRetries = options.skipRetry ? 0 : (options.retries ?? 2)
    const timeout = options.timeout || 30000

    if (this.debug) {
      console.log(`[ScaleMule] ${options.method || 'GET'} ${path}`)
    }

    let lastError: ApiError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const text = await response.text()
        const responseData = text ? JSON.parse(text) : null

        if (!response.ok) {
          // Handle API error response
          const error: ApiError = responseData?.error || {
            code: `HTTP_${response.status}`,
            message: responseData?.message || response.statusText,
          }

          // Check if we should retry this status code
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error
            const delay = getBackoffDelay(attempt)
            if (this.debug) {
              console.log(`[ScaleMule] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
            }
            await sleep(delay)
            continue
          }

          if (this.debug) {
            console.error('[ScaleMule] Request failed:', error)
          }

          return { success: false, error }
        }

        // Unwrap envelope: backend may return { data: T } or raw T
        const data = responseData?.data !== undefined ? responseData.data : responseData
        return { success: true, data: data as T }
      } catch (err) {
        clearTimeout(timeoutId)

        const error: ApiError = {
          code: err instanceof Error && err.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Network request failed',
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          lastError = error
          const delay = getBackoffDelay(attempt)
          if (this.debug) {
            console.log(`[ScaleMule] Retrying after error in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
          }
          await sleep(delay)
          continue
        }

        if (this.debug) {
          console.error('[ScaleMule] Network error:', err)
        }

        return { success: false, error }
      }
    }

    // Should not reach here, but return last error if we do
    return { success: false, error: lastError || { code: 'UNKNOWN', message: 'Request failed' } }
  }

  /**
   * GET request
   */
  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  /**
   * POST request with JSON body
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * PUT request with JSON body
   */
  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * PATCH request with JSON body
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  /**
   * DELETE request
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }

  /**
   * Upload a file using multipart/form-data
   *
   * Automatically includes Authorization: Bearer header for user identity.
   * Supports progress callback via XMLHttpRequest when onProgress is provided.
   */
  async upload<T>(
    path: string,
    file: File,
    additionalFields?: Record<string, string>,
    options?: RequestOptions & { onProgress?: (progress: number) => void }
  ): Promise<ApiResponse<T>> {
    // Sanitize filename to handle Safari/iOS unicode issues
    const sanitizedName = sanitizeFilename(file.name)
    const sanitizedFile = sanitizedName !== file.name
      ? new File([file], sanitizedName, { type: file.type })
      : file

    const formData = new FormData()
    formData.append('file', sanitizedFile)

    // Add user ID to form data (required by storage service)
    if (this.userId) {
      formData.append('sm_user_id', this.userId)
    }

    // Add any additional fields
    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        formData.append(key, value)
      }
    }

    const url = `${this.gatewayUrl}${path}`

    if (this.debug) {
      console.log(`[ScaleMule] UPLOAD ${path}`)
    }

    // Use XMLHttpRequest for progress support
    if (options?.onProgress && typeof XMLHttpRequest !== 'undefined') {
      return this.uploadWithProgress<T>(url, formData, options.onProgress)
    }

    // Fall back to fetch with retry logic
    const maxRetries = options?.retries ?? 2
    const headers = new Headers()
    headers.set('x-api-key', this.apiKey)

    if (this.sessionToken) {
      headers.set('Authorization', `Bearer ${this.sessionToken}`)
    }

    let lastError: ApiError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Need to re-create FormData on retry since body is consumed
        const retryFormData = attempt === 0 ? formData : new FormData()
        if (attempt > 0) {
          retryFormData.append('file', sanitizedFile)
          if (this.userId) {
            retryFormData.append('sm_user_id', this.userId)
          }
          if (additionalFields) {
            for (const [key, value] of Object.entries(additionalFields)) {
              retryFormData.append(key, value)
            }
          }
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: retryFormData,
        })

        const uploadText = await response.text()
        const responseData = uploadText ? JSON.parse(uploadText) : null

        if (!response.ok) {
          const error: ApiError = responseData?.error || {
            code: `HTTP_${response.status}`,
            message: responseData?.message || response.statusText,
          }

          // Check if this is a retryable error
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error
            const delay = getBackoffDelay(attempt)
            if (this.debug) {
              console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
            }
            await sleep(delay)
            continue
          }

          return { success: false, error }
        }

        // Unwrap envelope: backend may return { data: T } or raw T
        const data = responseData?.data !== undefined ? responseData.data : responseData
        return { success: true, data: data as T }
      } catch (err) {
        lastError = {
          code: 'UPLOAD_ERROR',
          message: err instanceof Error ? err.message : 'Upload failed',
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          const delay = getBackoffDelay(attempt)
          if (this.debug) {
            console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms (network error)`)
          }
          await sleep(delay)
          continue
        }
      }
    }

    return {
      success: false,
      error: lastError || { code: 'UPLOAD_ERROR', message: 'Upload failed after retries' },
    }
  }

  /**
   * Upload with progress using XMLHttpRequest (with retry)
   */
  private async uploadWithProgress<T>(
    url: string,
    formData: FormData,
    onProgress: (progress: number) => void,
    maxRetries = 2
  ): Promise<ApiResponse<T>> {
    let lastError: ApiError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await this.singleUploadWithProgress<T>(url, formData, onProgress)

      if (result.success) {
        return result
      }

      // Check if this is a retryable error
      const errorCode = result.error?.code || ''
      const isNetworkError = errorCode === 'UPLOAD_ERROR' || errorCode === 'NETWORK_ERROR'
      const isRetryableHttp = errorCode.startsWith('HTTP_') &&
        RETRYABLE_STATUS_CODES.has(parseInt(errorCode.replace('HTTP_', ''), 10))

      if (attempt < maxRetries && (isNetworkError || isRetryableHttp)) {
        lastError = result.error || null
        const delay = getBackoffDelay(attempt)
        if (this.debug) {
          console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`)
        }
        await sleep(delay)
        // Reset progress for retry
        onProgress(0)
        continue
      }

      return result
    }

    return {
      success: false,
      error: lastError || { code: 'UPLOAD_ERROR', message: 'Upload failed after retries' },
    }
  }

  /**
   * Single upload attempt with progress using XMLHttpRequest
   */
  private singleUploadWithProgress<T>(
    url: string,
    formData: FormData,
    onProgress: (progress: number) => void
  ): Promise<ApiResponse<T>> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = Math.round((event.loaded / event.total) * 100)
          onProgress(progress)
        }
      })

      xhr.addEventListener('load', () => {
        try {
          const data = JSON.parse(xhr.responseText)

          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data as ApiResponse<T>)
          } else {
            resolve({
              success: false,
              error: data.error || {
                code: `HTTP_${xhr.status}`,
                message: data.message || 'Upload failed',
              },
            })
          }
        } catch {
          resolve({
            success: false,
            error: { code: 'PARSE_ERROR', message: 'Failed to parse response' },
          })
        }
      })

      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: { code: 'UPLOAD_ERROR', message: 'Upload failed' },
        })
      })

      xhr.addEventListener('abort', () => {
        resolve({
          success: false,
          error: { code: 'UPLOAD_ABORTED', message: 'Upload cancelled' },
        })
      })

      xhr.open('POST', url)
      xhr.setRequestHeader('x-api-key', this.apiKey)
      if (this.sessionToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.sessionToken}`)
      }

      xhr.send(formData)
    })
  }
}

/**
 * Create a new ScaleMule client instance
 */
export function createClient(config: ClientConfig): ScaleMuleClient {
  return new ScaleMuleClient(config)
}
