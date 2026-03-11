import { R as RegisterRequest, $ as ClientContext, U as User, l as LoginRequest, L as LoginResponse, c as ListFilesParams, T as ListFilesResponse, N as StorageFile, W as UploadResponse } from './index-jomBa89d.js';

/**
 * Server-Side ScaleMule Client
 *
 * Stateless client for use in Next.js API routes.
 * Does not manage sessions - that's handled by cookies.
 */

type ScaleMuleEnvironment = 'dev' | 'prod';
interface ServerConfig {
    /** Your ScaleMule API key (use env var, never hardcode) */
    apiKey: string;
    /** Environment: 'dev' or 'prod' - automatically sets gateway URL */
    environment?: ScaleMuleEnvironment;
    /** Custom gateway URL (overrides environment preset) */
    gatewayUrl?: string;
    /** Enable debug logging */
    debug?: boolean;
}
declare class ScaleMuleServer {
    private apiKey;
    private gatewayUrl;
    private debug;
    constructor(config: ServerConfig);
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
    private request;
    auth: {
        /**
         * Register a new user
         */
        register: (data: RegisterRequest, options?: {
            clientContext?: ClientContext;
        }) => Promise<User>;
        /**
         * Login user - returns session token (store in HTTP-only cookie)
         */
        login: (data: LoginRequest, options?: {
            clientContext?: ClientContext;
        }) => Promise<LoginResponse>;
        /**
         * Logout user
         */
        logout: (sessionToken: string) => Promise<void>;
        /**
         * Get current user from session token
         */
        me: (sessionToken: string) => Promise<User>;
        /**
         * Refresh session token
         */
        refresh: (sessionToken: string) => Promise<{
            session_token: string;
            expires_at: string;
        }>;
        /**
         * Request password reset email
         */
        forgotPassword: (email: string, options?: {
            clientContext?: ClientContext;
        }) => Promise<{
            message: string;
        }>;
        /**
         * Reset password with token
         */
        resetPassword: (token: string, newPassword: string, options?: {
            clientContext?: ClientContext;
        }) => Promise<{
            message: string;
        }>;
        /**
         * Verify email with token
         */
        verifyEmail: (token: string) => Promise<{
            message: string;
        }>;
        /**
         * Resend verification email.
         * Can be called with a session token (authenticated) or email (unauthenticated).
         */
        resendVerification: (sessionTokenOrEmail: string, options?: {
            email?: string;
        }) => Promise<{
            message: string;
        }>;
    };
    user: {
        /**
         * Update user profile
         */
        update: (sessionToken: string, data: {
            full_name?: string;
            avatar_url?: string;
        }) => Promise<User>;
        /**
         * Change password
         */
        changePassword: (sessionToken: string, currentPassword: string, newPassword: string) => Promise<{
            message: string;
        }>;
        /**
         * Change email
         */
        changeEmail: (sessionToken: string, newEmail: string, password: string) => Promise<{
            message: string;
        }>;
        /**
         * Delete account
         */
        deleteAccount: (sessionToken: string, password: string) => Promise<{
            message: string;
        }>;
    };
    secrets: {
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
        get: (key: string) => Promise<{
            value: string;
            version: number;
        }>;
        /**
         * Set a secret in the tenant vault
         *
         * @example
         * ```typescript
         * await scalemule.secrets.set('ANONYMOUS_USER_SALT', 'my-secret-salt')
         * ```
         */
        set: (key: string, value: string) => Promise<{
            value: string;
            version: number;
        }>;
        /**
         * Delete a secret from the tenant vault
         */
        delete: (key: string) => Promise<void>;
        /**
         * List all secrets in the tenant vault
         */
        list: () => Promise<{
            secrets: Array<{
                path: string;
                version: number;
            }>;
        }>;
        /**
         * Get secret version history
         */
        versions: (key: string) => Promise<{
            versions: Array<{
                version: number;
                created_at: string;
            }>;
        }>;
        /**
         * Rollback to a specific version
         */
        rollback: (key: string, version: number) => Promise<{
            value: string;
            version: number;
        }>;
        /**
         * Rotate a secret (copy current version as new version)
         */
        rotate: (key: string, newValue: string) => Promise<{
            value: string;
            version: number;
        }>;
    };
    bundles: {
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
        get: <T = Record<string, unknown>>(key: string, resolve?: boolean) => Promise<{
            type: string;
            data: T;
            version: number;
            inherits_from?: string;
        }>;
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
        set: <T = Record<string, unknown>>(key: string, type: string, data: T, inheritsFrom?: string) => Promise<{
            type: string;
            data: T;
            version: number;
        }>;
        /**
         * Delete a bundle
         */
        delete: (key: string) => Promise<void>;
        /**
         * List all bundles
         */
        list: () => Promise<{
            bundles: Array<{
                path: string;
                type: string;
                version: number;
                inherits_from?: string;
            }>;
        }>;
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
        connectionUrl: (key: string) => Promise<{
            url: string;
        }>;
    };
    vaultAudit: {
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
        query: (options?: {
            action?: "read" | "write" | "delete" | "list";
            path?: string;
            since?: string;
            until?: string;
            limit?: number;
        }) => Promise<{
            logs: Array<{
                timestamp: string;
                action: string;
                resource_path: string;
                success: boolean;
                error_message?: string;
            }>;
        }>;
    };
    storage: {
        /**
         * List user's files
         */
        list: (userId: string, params?: ListFilesParams) => Promise<ListFilesResponse>;
        /**
         * Get file info
         */
        get: (fileId: string) => Promise<StorageFile>;
        /**
         * Delete file
         */
        delete: (userId: string, fileId: string) => Promise<void>;
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
        upload: (userId: string, file: {
            buffer: BlobPart;
            filename: string;
            contentType: string;
        }, options?: {
            clientContext?: ClientContext;
        }) => Promise<UploadResponse>;
    };
    webhooks: {
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
        create: (data: {
            webhook_name: string;
            url: string;
            events: string[];
        }) => Promise<{
            id: string;
            secret: string;
            url: string;
            events: string[];
        }>;
        /**
         * List all webhook subscriptions
         */
        list: () => Promise<{
            webhooks: Array<{
                id: string;
                webhook_name: string;
                url: string;
                events: string[];
                is_enabled: boolean;
            }>;
        }>;
        /**
         * Delete a webhook subscription
         */
        delete: (id: string) => Promise<void>;
        /**
         * Update a webhook subscription
         */
        update: (id: string, data: {
            url?: string;
            events?: string[];
            is_enabled?: boolean;
        }) => Promise<{
            id: string;
            url: string;
            events: string[];
        }>;
        /**
         * Get available webhook event types
         */
        eventTypes: () => Promise<{
            events: Array<{
                event_name: string;
                event_description: string;
                payload_schema: Record<string, unknown>;
            }>;
        }>;
    };
    analytics: {
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
        trackEvent: (event: {
            event_name: string;
            event_category?: string;
            properties?: Record<string, unknown>;
            user_id?: string;
            session_id?: string;
            anonymous_id?: string;
            session_duration_seconds?: number;
            page_url?: string;
            page_title?: string;
            referrer?: string;
            landing_page?: string;
            device_type?: string;
            device_brand?: string;
            device_model?: string;
            browser?: string;
            browser_version?: string;
            os?: string;
            os_version?: string;
            screen_resolution?: string;
            viewport_size?: string;
            utm_source?: string;
            utm_medium?: string;
            utm_campaign?: string;
            utm_term?: string;
            utm_content?: string;
            client_timestamp?: string;
            timestamp?: string;
        }, options?: {
            clientContext?: ClientContext;
        }) => Promise<{
            tracked: number;
            session_id?: string;
        }>;
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
        trackPageView: (data: {
            page_url: string;
            page_title?: string;
            referrer?: string;
            session_id?: string;
            user_id?: string;
        }, options?: {
            clientContext?: ClientContext;
        }) => Promise<{
            tracked: number;
            session_id?: string;
        }>;
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
        trackBatch: (events: Array<{
            event_name: string;
            event_category?: string;
            properties?: Record<string, unknown>;
            user_id?: string;
            session_id?: string;
            anonymous_id?: string;
            session_duration_seconds?: number;
            page_url?: string;
            page_title?: string;
            referrer?: string;
            landing_page?: string;
            device_type?: string;
            browser?: string;
            os?: string;
            screen_resolution?: string;
            viewport_size?: string;
            utm_source?: string;
            utm_medium?: string;
            utm_campaign?: string;
            utm_term?: string;
            utm_content?: string;
            client_timestamp?: string;
            timestamp?: string;
        }>, options?: {
            clientContext?: ClientContext;
        }) => Promise<{
            tracked: number;
        }>;
    };
}
/**
 * Create a server client with environment-based defaults
 */
declare function createServerClient(config?: Partial<ServerConfig>): ScaleMuleServer;

/**
 * ScaleMule Webhook Helpers
 *
 * Provides utilities for webhook signature verification and route handlers
 * for video processing events and other ScaleMule webhooks.
 *
 * @example
 * ```typescript
 * // app/api/webhooks/scalemule/route.ts
 * import { createWebhookRoutes } from '@scalemule/nextjs/server'
 *
 * export const { POST } = createWebhookRoutes({
 *   secret: process.env.SCALEMULE_WEBHOOK_SECRET,
 *   onVideoReady: async (event) => {
 *     console.log('Video ready:', event.video_id)
 *     await updateDocument('videos', event.video_id, { status: 'ready' })
 *   },
 *   onVideoFailed: async (event) => {
 *     console.log('Video failed:', event.video_id, event.reason)
 *   }
 * })
 * ```
 */

interface WebhookEvent<T = Record<string, unknown>> {
    event: string;
    timestamp: number;
    data: T;
}
interface VideoReadyEvent {
    video_id: string;
    application_id: string;
    duration_seconds?: number;
    width?: number;
    height?: number;
    thumbnail_url?: string;
    playlist_url?: string;
}
interface VideoFailedEvent {
    video_id: string;
    application_id: string;
    reason: string;
}
interface VideoUploadedEvent {
    video_id: string;
    application_id: string;
    filename?: string;
    size_bytes?: number;
}
interface VideoTranscodedEvent {
    video_id: string;
    application_id: string;
    derivative_count: number;
}
interface WebhookRoutesConfig {
    /** ScaleMule client configuration (optional, uses env vars by default) */
    client?: Partial<ServerConfig>;
    /** Webhook secret for signature verification (recommended for security) */
    secret?: string;
    /** Handler for video.ready events */
    onVideoReady?: (event: VideoReadyEvent) => void | Promise<void>;
    /** Handler for video.failed events */
    onVideoFailed?: (event: VideoFailedEvent) => void | Promise<void>;
    /** Handler for video.uploaded events */
    onVideoUploaded?: (event: VideoUploadedEvent) => void | Promise<void>;
    /** Handler for video.transcoded events */
    onVideoTranscoded?: (event: VideoTranscodedEvent) => void | Promise<void>;
    /** Generic handler for any webhook event */
    onEvent?: (event: WebhookEvent) => void | Promise<void>;
}
/**
 * Verify webhook signature using HMAC-SHA256
 *
 * ScaleMule webhooks include a signature header in the format: sha256=<hex_signature>
 *
 * @param payload - Raw request body as string
 * @param signature - Value of X-Webhook-Signature header
 * @param secret - Your webhook secret
 * @returns true if signature is valid
 *
 * @example
 * ```typescript
 * const isValid = verifyWebhookSignature(body, signature, secret)
 * if (!isValid) {
 *   return new Response('Invalid signature', { status: 401 })
 * }
 * ```
 */
declare function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
/**
 * Parse a webhook event from the raw payload
 *
 * @param payload - Raw request body as string
 * @returns Parsed webhook event
 */
declare function parseWebhookEvent<T = Record<string, unknown>>(payload: string): WebhookEvent<T>;
/**
 * Register a webhook for video events
 *
 * @param url - The URL to receive webhook notifications
 * @param options - Registration options
 * @returns The webhook ID and secret for signature verification
 *
 * @example
 * ```typescript
 * const { id, secret } = await registerVideoWebhook(
 *   'https://myapp.com/api/webhooks/scalemule',
 *   { events: ['video.ready', 'video.failed'] }
 * )
 *
 * // Store the secret securely for signature verification
 * await saveToEnv('SCALEMULE_WEBHOOK_SECRET', secret)
 * ```
 */
declare function registerVideoWebhook(url: string, options?: {
    /** Events to subscribe to (defaults to video.ready and video.failed) */
    events?: ('video.ready' | 'video.failed' | 'video.uploaded' | 'video.transcoded')[];
    /** Human-readable webhook name */
    name?: string;
    /** Client configuration */
    clientConfig?: Partial<ServerConfig>;
}): Promise<{
    id: string;
    secret: string;
}>;
type RouteHandler$1 = (request: Request, context: {
    params: Promise<{
        scalemule?: string[];
    }>;
}) => Promise<Response>;
/**
 * Create Next.js App Router route handlers for ScaleMule webhooks
 *
 * Returns a POST handler that:
 * - Verifies webhook signature (if secret provided)
 * - Parses the event payload
 * - Calls appropriate event handlers
 * - Returns proper responses
 *
 * @param config - Webhook routes configuration
 * @returns Object with POST handler for use in route.ts
 *
 * @example
 * ```typescript
 * // app/api/webhooks/scalemule/route.ts
 * import { createWebhookRoutes } from '@scalemule/nextjs/server'
 *
 * export const { POST } = createWebhookRoutes({
 *   secret: process.env.SCALEMULE_WEBHOOK_SECRET,
 *   onVideoReady: async (event) => {
 *     // Update your database when video is ready
 *     await db.videos.update({
 *       where: { id: event.video_id },
 *       data: {
 *         status: 'ready',
 *         duration: event.duration_seconds,
 *         thumbnailUrl: event.thumbnail_url,
 *       }
 *     })
 *   },
 *   onVideoFailed: async (event) => {
 *     // Handle failed video processing
 *     await notifyUser(event.video_id, event.reason)
 *   }
 * })
 * ```
 */
declare function createWebhookRoutes(config?: WebhookRoutesConfig): {
    POST: RouteHandler$1;
};

/**
 * Simplified webhook handler for 1-line setup.
 *
 * Usage in your Next.js app:
 * ```ts
 * // app/api/webhooks/scalemule/route.ts
 * import { createWebhookHandler } from '@scalemule/nextjs/server/webhooks'
 *
 * export const POST = createWebhookHandler({
 *   secret: process.env.SCALEMULE_WEBHOOK_SECRET,
 *   onEvent: {
 *     'video.transcoding.completed': async (event) => { ... },
 *     'storage.file.uploaded': async (event) => { ... },
 *   }
 * })
 * ```
 */

interface WebhookHandlerConfig {
    /** Webhook secret for signature verification */
    secret?: string;
    /** Map of event name → handler function */
    onEvent?: Record<string, (event: WebhookEvent) => void | Promise<void>>;
}
type RouteHandler = (request: Request) => Promise<Response>;
/**
 * Create a webhook handler for ScaleMule events.
 *
 * Simpler alternative to createWebhookRoutes() — uses an event map
 * instead of separate onVideoReady, onVideoFailed, etc. callbacks.
 */
declare function createWebhookHandler(config?: WebhookHandlerConfig): RouteHandler;

export { type ServerConfig as S, type VideoReadyEvent as V, type WebhookEvent as W, ScaleMuleServer as a, createWebhookRoutes as b, createServerClient as c, type VideoFailedEvent as d, type VideoUploadedEvent as e, type VideoTranscodedEvent as f, type WebhookRoutesConfig as g, createWebhookHandler as h, parseWebhookEvent as p, registerVideoWebhook as r, verifyWebhookSignature as v };
