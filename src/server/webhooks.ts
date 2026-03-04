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

import { createHmac, timingSafeEqual } from 'crypto'
import { createServerClient } from './client'
import type { ServerConfig } from './client'

// ============================================================================
// Types
// ============================================================================

export interface WebhookEvent<T = Record<string, unknown>> {
  event: string
  timestamp: number
  data: T
}

export interface VideoReadyEvent {
  video_id: string
  application_id: string
  duration_seconds?: number
  width?: number
  height?: number
  thumbnail_url?: string
  playlist_url?: string
}

export interface VideoFailedEvent {
  video_id: string
  application_id: string
  reason: string
}

export interface VideoUploadedEvent {
  video_id: string
  application_id: string
  filename?: string
  size_bytes?: number
}

export interface VideoTranscodedEvent {
  video_id: string
  application_id: string
  derivative_count: number
}

export interface WebhookRoutesConfig {
  /** ScaleMule client configuration (optional, uses env vars by default) */
  client?: Partial<ServerConfig>
  /** Webhook secret for signature verification (recommended for security) */
  secret?: string
  /** Handler for video.ready events */
  onVideoReady?: (event: VideoReadyEvent) => void | Promise<void>
  /** Handler for video.failed events */
  onVideoFailed?: (event: VideoFailedEvent) => void | Promise<void>
  /** Handler for video.uploaded events */
  onVideoUploaded?: (event: VideoUploadedEvent) => void | Promise<void>
  /** Handler for video.transcoded events */
  onVideoTranscoded?: (event: VideoTranscodedEvent) => void | Promise<void>
  /** Generic handler for any webhook event */
  onEvent?: (event: WebhookEvent) => void | Promise<void>
}

// ============================================================================
// Signature Verification
// ============================================================================

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
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature.startsWith('sha256=')) {
    return false
  }

  const providedSig = signature.slice(7)
  const expectedSig = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(providedSig, 'hex'),
      Buffer.from(expectedSig, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Parse a webhook event from the raw payload
 *
 * @param payload - Raw request body as string
 * @returns Parsed webhook event
 */
export function parseWebhookEvent<T = Record<string, unknown>>(
  payload: string
): WebhookEvent<T> {
  return JSON.parse(payload) as WebhookEvent<T>
}

// ============================================================================
// Webhook Registration
// ============================================================================

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
export async function registerVideoWebhook(
  url: string,
  options?: {
    /** Events to subscribe to (defaults to video.ready and video.failed) */
    events?: ('video.ready' | 'video.failed' | 'video.uploaded' | 'video.transcoded')[]
    /** Human-readable webhook name */
    name?: string
    /** Client configuration */
    clientConfig?: Partial<ServerConfig>
  }
): Promise<{ id: string; secret: string }> {
  const sm = createServerClient(options?.clientConfig)

  const result = await sm.webhooks.create({
    webhook_name: options?.name || 'Video Status Webhook',
    url,
    events: options?.events || ['video.ready', 'video.failed'],
  })

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || 'Failed to register webhook')
  }

  return {
    id: result.data.id,
    secret: result.data.secret,
  }
}

// ============================================================================
// Route Handler Factory
// ============================================================================

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ scalemule?: string[] }> }
) => Promise<Response>

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
export function createWebhookRoutes(config: WebhookRoutesConfig = {}): {
  POST: RouteHandler
} {
  const POST: RouteHandler = async (request) => {
    const signature = request.headers.get('x-webhook-signature')
    const body = await request.text()

    // Verify signature if secret provided
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    try {
      const event = parseWebhookEvent(body)

      // Call event-specific handlers
      switch (event.event) {
        case 'video.ready':
          if (config.onVideoReady) {
            await config.onVideoReady(event.data as unknown as VideoReadyEvent)
          }
          break
        case 'video.failed':
          if (config.onVideoFailed) {
            await config.onVideoFailed(event.data as unknown as VideoFailedEvent)
          }
          break
        case 'video.uploaded':
          if (config.onVideoUploaded) {
            await config.onVideoUploaded(event.data as unknown as VideoUploadedEvent)
          }
          break
        case 'video.transcoded':
          if (config.onVideoTranscoded) {
            await config.onVideoTranscoded(event.data as unknown as VideoTranscodedEvent)
          }
          break
      }

      // Call generic handler for all events
      if (config.onEvent) {
        await config.onEvent(event)
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      console.error('Webhook handler error:', error)
      return new Response(JSON.stringify({ error: 'Handler failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return { POST }
}
