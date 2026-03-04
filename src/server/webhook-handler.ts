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

import { verifyWebhookSignature, parseWebhookEvent } from './webhooks'
import type { WebhookEvent } from './webhooks'

interface WebhookHandlerConfig {
  /** Webhook secret for signature verification */
  secret?: string
  /** Map of event name → handler function */
  onEvent?: Record<string, (event: WebhookEvent) => void | Promise<void>>
}

type RouteHandler = (request: Request) => Promise<Response>

/**
 * Create a webhook handler for ScaleMule events.
 *
 * Simpler alternative to createWebhookRoutes() — uses an event map
 * instead of separate onVideoReady, onVideoFailed, etc. callbacks.
 */
export function createWebhookHandler(config: WebhookHandlerConfig = {}): RouteHandler {
  return async (request: Request): Promise<Response> => {
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

      // Call the matching event handler
      if (config.onEvent && event.event && config.onEvent[event.event]) {
        await config.onEvent[event.event](event)
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }
}
