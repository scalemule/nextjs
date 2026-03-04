/**
 * Application Bundles Management
 *
 * Bundles are structured secrets like database credentials, S3 configs, etc.
 * They support inheritance - child bundles can inherit from parent bundles
 * and override specific fields.
 *
 * @example
 * ```typescript
 * import { getBundle, getMySqlBundle } from '@scalemule/nextjs/server'
 *
 * // Get a generic bundle
 * const config = await getBundle<{ apiKey: string }>('external/stripe')
 *
 * // Get a typed MySQL bundle
 * const db = await getMySqlBundle('database/prod')
 * const connection = mysql.createConnection(db.connectionUrl)
 * ```
 */

import { createServerClient } from './client'

// ============================================================================
// Types
// ============================================================================

export interface MySqlBundle {
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl_mode?: string
}

export interface PostgresBundle {
  host: string
  port: number
  username: string
  password: string
  database: string
  ssl_mode?: string
}

export interface RedisBundle {
  host: string
  port: number
  password?: string
  database?: number
  ssl?: boolean
}

export interface S3Bundle {
  bucket: string
  region: string
  access_key_id: string
  secret_access_key: string
  endpoint?: string
}

export interface OAuthBundle {
  client_id: string
  client_secret: string
  redirect_uri: string
  scopes?: string[]
}

export interface SmtpBundle {
  host: string
  port: number
  username: string
  password: string
  from_email: string
  from_name?: string
  encryption?: 'none' | 'tls' | 'starttls'
}

interface CachedBundle<T> {
  type: string
  data: T
  version: number
  inheritsFrom?: string
  cachedAt: number
}

interface BundlesCache {
  [key: string]: CachedBundle<unknown>
}

// ============================================================================
// Configuration
// ============================================================================

/** Default cache TTL in milliseconds (5 minutes) */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/** Cache storage */
const bundlesCache: BundlesCache = {}

/** Configuration options */
interface BundlesConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number
  /** Disable caching (for testing) */
  noCache?: boolean
}

let globalConfig: BundlesConfig = {}

/**
 * Configure bundles caching behavior
 */
export function configureBundles(config: BundlesConfig): void {
  globalConfig = { ...globalConfig, ...config }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get a bundle from the ScaleMule vault
 *
 * @param key - The bundle key (e.g., 'database/prod')
 * @param resolve - Whether to resolve inheritance (default: true)
 * @returns The bundle data, or undefined if not found
 *
 * @example
 * ```typescript
 * const stripe = await getBundle<{ apiKey: string }>('external/stripe')
 * if (stripe) {
 *   const client = new Stripe(stripe.apiKey)
 * }
 * ```
 */
export async function getBundle<T = Record<string, unknown>>(
  key: string,
  resolve = true
): Promise<T | undefined> {
  const cacheTtl = globalConfig.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const noCache = globalConfig.noCache ?? false

  // Check cache first
  if (!noCache) {
    const cached = bundlesCache[key]
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.data as T
    }
  }

  // Fetch from API
  try {
    const client = createServerClient()
    const result = await client.bundles.get<T>(key, resolve)

    if (!result.success) {
      if (result.error?.code === 'BUNDLE_NOT_FOUND') {
        return undefined
      }
      console.error(`[ScaleMule Bundles] Failed to fetch ${key}:`, result.error)
      return undefined
    }

    // Cache the result
    if (!noCache && result.data) {
      bundlesCache[key] = {
        type: result.data.type,
        data: result.data.data,
        version: result.data.version,
        inheritsFrom: result.data.inherits_from,
        cachedAt: Date.now(),
      }
    }

    return result.data?.data
  } catch (error) {
    console.error(`[ScaleMule Bundles] Error fetching ${key}:`, error)
    return undefined
  }
}

/**
 * Get a bundle, throwing if not found
 */
export async function requireBundle<T = Record<string, unknown>>(
  key: string,
  resolve = true
): Promise<T> {
  const value = await getBundle<T>(key, resolve)
  if (value === undefined) {
    throw new Error(
      `Required bundle '${key}' not found in ScaleMule vault. ` +
        `Configure it in the ScaleMule dashboard`
    )
  }
  return value
}

// ============================================================================
// Typed Bundle Helpers
// ============================================================================

/**
 * Get a MySQL bundle with connection URL
 *
 * @example
 * ```typescript
 * const db = await getMySqlBundle('database/prod')
 * const connection = mysql.createConnection(db.connectionUrl)
 * ```
 */
export async function getMySqlBundle(key: string): Promise<(MySqlBundle & { connectionUrl: string }) | undefined> {
  const bundle = await getBundle<MySqlBundle>(key)
  if (!bundle) return undefined

  const { host, port, username, password, database, ssl_mode } = bundle
  const encodedPassword = encodeURIComponent(password)
  let connectionUrl = `mysql://${username}:${encodedPassword}@${host}:${port}/${database}`
  if (ssl_mode) {
    connectionUrl += `?ssl_mode=${ssl_mode}`
  }

  return { ...bundle, connectionUrl }
}

/**
 * Get a PostgreSQL bundle with connection URL
 */
export async function getPostgresBundle(key: string): Promise<(PostgresBundle & { connectionUrl: string }) | undefined> {
  const bundle = await getBundle<PostgresBundle>(key)
  if (!bundle) return undefined

  const { host, port, username, password, database, ssl_mode } = bundle
  const encodedPassword = encodeURIComponent(password)
  let connectionUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`
  if (ssl_mode) {
    connectionUrl += `?sslmode=${ssl_mode}`
  }

  return { ...bundle, connectionUrl }
}

/**
 * Get a Redis bundle with connection URL
 */
export async function getRedisBundle(key: string): Promise<(RedisBundle & { connectionUrl: string }) | undefined> {
  const bundle = await getBundle<RedisBundle>(key)
  if (!bundle) return undefined

  const { host, port, password, database, ssl } = bundle
  let connectionUrl = ssl ? 'rediss://' : 'redis://'
  if (password) {
    connectionUrl += `:${encodeURIComponent(password)}@`
  }
  connectionUrl += `${host}:${port}`
  if (database !== undefined) {
    connectionUrl += `/${database}`
  }

  return { ...bundle, connectionUrl }
}

/**
 * Get an S3 bundle
 */
export async function getS3Bundle(key: string): Promise<S3Bundle | undefined> {
  return getBundle<S3Bundle>(key)
}

/**
 * Get an OAuth bundle
 */
export async function getOAuthBundle(key: string): Promise<OAuthBundle | undefined> {
  return getBundle<OAuthBundle>(key)
}

/**
 * Get an SMTP bundle
 */
export async function getSmtpBundle(key: string): Promise<SmtpBundle | undefined> {
  return getBundle<SmtpBundle>(key)
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Invalidate cached bundle (force refresh on next access)
 *
 * @param key - The bundle key to invalidate, or undefined to clear all
 */
export function invalidateBundleCache(key?: string): void {
  if (key) {
    delete bundlesCache[key]
  } else {
    Object.keys(bundlesCache).forEach((k) => delete bundlesCache[k])
  }
}

/**
 * Prefetch bundles into cache
 *
 * @param keys - Array of bundle keys to prefetch
 */
export async function prefetchBundles(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => getBundle(key)))
}
