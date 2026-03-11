import { j as StorageAdapter } from './index-jomBa89d.js';

/**
 * ScaleMule API Client
 *
 * Core HTTP client that handles:
 * - Automatic x-api-key header injection
 * - Automatic Authorization: Bearer header injection when authenticated
 * - Session token management
 * - Error handling and response parsing
 */

type ScaleMuleEnvironment = 'dev' | 'prod';
interface ClientConfig {
    /** Your ScaleMule API key */
    apiKey: string;
    /** Your ScaleMule Application ID (required for realtime features) */
    applicationId?: string;
    /** Environment: 'dev' or 'prod' - automatically sets gateway URL */
    environment?: ScaleMuleEnvironment;
    /** Custom gateway URL (overrides environment preset) */
    gatewayUrl?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Custom storage adapter */
    storage?: StorageAdapter;
    /** Enable rate limit queue (automatically queues requests when rate limited) */
    enableRateLimitQueue?: boolean;
    /** Enable offline queue (queues requests when offline, syncs when back online) */
    enableOfflineQueue?: boolean;
    /**
     * Signal that a session will be established asynchronously (e.g. via auth proxy).
     * When true, API requests will wait for the session to be resolved before sending,
     * preventing race conditions where requests fire before the auth token is available.
     */
    pendingSessionInit?: boolean;
}
interface RequestOptions extends RequestInit {
    /** Skip adding auth headers (for public endpoints) */
    skipAuth?: boolean;
    /** Custom timeout in milliseconds */
    timeout?: number;
    /** Number of retry attempts for transient failures (default: 2) */
    retries?: number;
    /** Skip retries */
    skipRetry?: boolean;
}
/**
 * ScaleMule API Client
 *
 * Handles all HTTP communication with the ScaleMule gateway.
 */
declare class ScaleMuleClient {
    private apiKey;
    private applicationId;
    private gatewayUrl;
    private debug;
    private storage;
    private sessionToken;
    private userId;
    private rateLimitQueue;
    private offlineQueue;
    private enableRateLimitQueue;
    private enableOfflineQueue;
    private sessionGate;
    private resolveSessionGate;
    constructor(config: ClientConfig);
    /**
     * Sync offline queue when coming back online
     */
    private syncOfflineQueue;
    /**
     * Check if client is online
     */
    isOnline(): boolean;
    /**
     * Get number of pending offline requests
     */
    getOfflineQueueLength(): number;
    /**
     * Get number of pending rate-limited requests
     */
    getRateLimitQueueLength(): number;
    /**
     * Check if currently rate limited
     */
    isRateLimited(): boolean;
    /**
     * Get the gateway URL
     */
    getGatewayUrl(): string;
    /**
     * Get the application ID (required for realtime features)
     */
    getApplicationId(): string | null;
    /**
     * Signal that a session is being established asynchronously.
     * API requests will wait until resolveSessionPending() is called.
     */
    setSessionPending(): void;
    /**
     * Resolve the pending session gate, allowing queued API requests to proceed.
     * Must be called after setSessionPending(), whether session was established or not.
     */
    resolveSessionPending(): void;
    /**
     * Initialize client by loading persisted session
     */
    initialize(): Promise<void>;
    /**
     * Set session after login
     */
    setSession(token: string, userId: string): Promise<void>;
    /**
     * Clear session on logout
     */
    clearSession(): Promise<void>;
    /**
     * Get current session token
     */
    getSessionToken(): string | null;
    /**
     * Get current user ID
     */
    getUserId(): string | null;
    /**
     * Check if client has an active session
     */
    isAuthenticated(): boolean;
    /**
     * Build headers for a request
     */
    private buildHeaders;
    /**
     * Make an HTTP request to the ScaleMule API
     */
    request<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * GET request
     */
    get<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * POST request with JSON body
     */
    post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * PUT request with JSON body
     */
    put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * PATCH request with JSON body
     */
    patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    /**
     * DELETE request
     */
    delete<T>(path: string, options?: RequestOptions): Promise<T>;
    /**
     * Upload a file using multipart/form-data
     *
     * Automatically includes Authorization: Bearer header for user identity.
     * Supports progress callback via XMLHttpRequest when onProgress is provided.
     */
    upload<T>(path: string, file: File, additionalFields?: Record<string, string>, options?: RequestOptions & {
        onProgress?: (progress: number) => void;
    }): Promise<T>;
    /**
     * Upload with progress using XMLHttpRequest (with retry)
     */
    private uploadWithProgress;
    /**
     * Single upload attempt with progress using XMLHttpRequest
     */
    private singleUploadWithProgress;
}
/**
 * Create a new ScaleMule client instance
 */
declare function createClient(config: ClientConfig): ScaleMuleClient;

export { type ClientConfig, type RequestOptions, ScaleMuleClient, type ScaleMuleEnvironment, createClient };
