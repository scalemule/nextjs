/**
 * Client Context Extraction Utilities (Next.js)
 *
 * Next.js-specific helpers for extracting end user context from incoming
 * requests so it can be forwarded to ScaleMule when making server-to-server
 * calls. This ensures ScaleMule captures the actual end user's information
 * (IP, user agent, device fingerprint) instead of the server's information.
 *
 * For non-Next.js servers (Express, Fastify, raw Node.js), use the
 * framework-agnostic `extractClientContext()` and `buildClientContextHeaders()`
 * exported directly from `@scalemule/sdk`.
 */

import type { ClientContext } from '../types'

// Next.js request types (compatible with both Pages Router and App Router)
interface NextRequestLike {
  headers: {
    get(name: string): string | null
  }
  ip?: string
}

// Node.js IncomingMessage (for Pages Router API routes)
interface IncomingMessageLike {
  headers: Record<string, string | string[] | undefined>
  socket?: {
    remoteAddress?: string
  }
}

/**
 * Validate IPv4 or IPv6 address format.
 * Returns the IP if valid, undefined if invalid.
 */
function validateIP(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined

  // Trim whitespace
  const trimmed = ip.trim()
  if (!trimmed) return undefined

  // IPv4: 0-255.0-255.0-255.0-255
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

  // IPv6: simplified check (full validation is complex)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/

  // IPv4-mapped IPv6 (::ffff:192.0.2.1)
  const ipv4MappedRegex = /^::ffff:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i

  if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed) || ipv4MappedRegex.test(trimmed)) {
    return trimmed
  }

  // Invalid format
  return undefined
}

/**
 * Extract client context from a Next.js App Router request.
 *
 * Use this in App Router API routes (route handlers) to capture
 * the end user's information for forwarding to ScaleMule.
 *
 * Supports all major cloud providers and CDNs:
 * - Cloudflare (CF-Connecting-IP)
 * - DigitalOcean App Platform (DO-Connecting-IP)
 * - Vercel (X-Vercel-Forwarded-For)
 * - Akamai (True-Client-IP)
 * - AWS/nginx (X-Real-IP, X-Forwarded-For)
 *
 * @example
 * ```typescript
 * // app/api/upload/route.ts
 * import { NextRequest, NextResponse } from 'next/server'
 * import { extractClientContext, createServerClient } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const clientContext = extractClientContext(request)
 *   const scalemule = createServerClient()
 *
 *   const result = await scalemule.storage.upload(userId, file, {
 *     clientContext
 *   })
 *
 *   return NextResponse.json(result)
 * }
 * ```
 */
export function extractClientContext(request: NextRequestLike): ClientContext {
  const headers = request.headers

  // Extract IP address with priority order:
  // 1. CF-Connecting-IP (Cloudflare - most reliable when behind CF)
  // 2. DO-Connecting-IP (DigitalOcean App Platform / Load Balancers)
  // 3. X-Real-IP (nginx proxy, DigitalOcean K8s ingress)
  // 4. X-Forwarded-For (first IP - standard proxy header)
  // 5. X-Vercel-Forwarded-For (Vercel)
  // 6. True-Client-IP (Akamai, Cloudflare Enterprise)
  // 7. request.ip (Next.js built-in)
  let ip: string | undefined

  // Cloudflare (most trusted when using CF)
  const cfConnectingIp = headers.get('cf-connecting-ip')
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp)
  }

  // DigitalOcean App Platform / Load Balancers
  if (!ip) {
    const doConnectingIp = headers.get('do-connecting-ip')
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp)
    }
  }

  // nginx X-Real-IP (also used by DigitalOcean K8s nginx-ingress)
  if (!ip) {
    const realIp = headers.get('x-real-ip')
    if (realIp) {
      ip = validateIP(realIp)
    }
  }

  // Standard X-Forwarded-For (first IP is the client)
  if (!ip) {
    const forwardedFor = headers.get('x-forwarded-for')
    if (forwardedFor) {
      const firstIp = forwardedFor.split(',')[0]?.trim()
      ip = validateIP(firstIp)
    }
  }

  // Vercel
  if (!ip) {
    const vercelForwarded = headers.get('x-vercel-forwarded-for')
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(',')[0]?.trim()
      ip = validateIP(firstIp)
    }
  }

  // Akamai / Cloudflare Enterprise
  if (!ip) {
    const trueClientIp = headers.get('true-client-ip')
    if (trueClientIp) {
      ip = validateIP(trueClientIp)
    }
  }

  // Next.js built-in (fallback)
  if (!ip && request.ip) {
    ip = validateIP(request.ip)
  }

  // Extract user agent
  const userAgent = headers.get('user-agent') || undefined

  // Extract device fingerprint (if client sent it)
  const deviceFingerprint = headers.get('x-device-fingerprint') || undefined

  // Extract referrer from HTTP Referer header
  // This captures the actual referring URL during SSR when document.referrer is unavailable
  const referrer = headers.get('referer') || undefined

  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer,
  }
}

/**
 * Extract client context from a Pages Router API request.
 *
 * Use this in Pages Router API routes to capture the end user's
 * information for forwarding to ScaleMule.
 *
 * @example
 * ```typescript
 * // pages/api/upload.ts
 * import type { NextApiRequest, NextApiResponse } from 'next'
 * import { extractClientContextFromReq, createServerClient } from '@scalemule/nextjs/server'
 *
 * export default async function handler(req: NextApiRequest, res: NextApiResponse) {
 *   const clientContext = extractClientContextFromReq(req)
 *   const scalemule = createServerClient()
 *
 *   const result = await scalemule.storage.upload(userId, file, {
 *     clientContext
 *   })
 *
 *   res.json(result)
 * }
 * ```
 */
export function extractClientContextFromReq(req: IncomingMessageLike): ClientContext {
  const headers = req.headers

  // Helper to get header value (handles string | string[] | undefined)
  const getHeader = (name: string): string | undefined => {
    const value = headers[name.toLowerCase()]
    if (Array.isArray(value)) {
      return value[0]
    }
    return value
  }

  // Extract IP address with priority order (same as App Router version)
  let ip: string | undefined

  // Cloudflare
  const cfConnectingIp = getHeader('cf-connecting-ip')
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp)
  }

  // DigitalOcean App Platform / Load Balancers
  if (!ip) {
    const doConnectingIp = getHeader('do-connecting-ip')
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp)
    }
  }

  // nginx X-Real-IP (also used by DigitalOcean K8s nginx-ingress)
  if (!ip) {
    const realIp = getHeader('x-real-ip')
    if (realIp) {
      ip = validateIP(realIp)
    }
  }

  // Standard X-Forwarded-For
  if (!ip) {
    const forwardedFor = getHeader('x-forwarded-for')
    if (forwardedFor) {
      const firstIp = forwardedFor.split(',')[0]?.trim()
      ip = validateIP(firstIp)
    }
  }

  // Vercel
  if (!ip) {
    const vercelForwarded = getHeader('x-vercel-forwarded-for')
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(',')[0]?.trim()
      ip = validateIP(firstIp)
    }
  }

  // Akamai / Cloudflare Enterprise
  if (!ip) {
    const trueClientIp = getHeader('true-client-ip')
    if (trueClientIp) {
      ip = validateIP(trueClientIp)
    }
  }

  // Socket remote address (fallback)
  if (!ip && req.socket?.remoteAddress) {
    ip = validateIP(req.socket.remoteAddress)
  }

  // Extract user agent
  const userAgent = getHeader('user-agent')

  // Extract device fingerprint
  const deviceFingerprint = getHeader('x-device-fingerprint')

  // Extract referrer from HTTP Referer header
  const referrer = getHeader('referer')

  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer,
  }
}

/**
 * Build headers to forward client context to ScaleMule.
 *
 * This is used internally by the SDK to add authenticated forwarded-IP headers
 * (and legacy compatibility headers) when client context is provided.
 *
 * @internal
 */
export function buildClientContextHeaders(
  context: ClientContext | undefined
): Record<string, string> {
  const headers: Record<string, string> = {}

  if (!context) {
    return headers
  }

  if (context.ip) {
    headers['x-sm-forwarded-client-ip'] = context.ip
    headers['X-Client-IP'] = context.ip
  }

  if (context.userAgent) {
    headers['X-Client-User-Agent'] = context.userAgent
  }

  if (context.deviceFingerprint) {
    headers['X-Client-Device-Fingerprint'] = context.deviceFingerprint
  }

  if (context.referrer) {
    headers['X-Client-Referrer'] = context.referrer
  }

  return headers
}
