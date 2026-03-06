/**
 * Application Secrets Management
 *
 * Provides cached access to tenant secrets stored in ScaleMule Vault.
 * Use this instead of environment variables for sensitive configuration.
 *
 * Benefits:
 * - Secrets stored securely with AES-256-GCM + AWS KMS encryption
 * - Centralized management via ScaleMule admin dashboard
 * - Automatic caching to minimize API calls
 * - No need to manage k8s secrets yourself
 *
 * @example
 * ```typescript
 * import { getAppSecret } from '@scalemule/nextjs/server'
 *
 * // In your API route or server component:
 * const salt = await getAppSecret('ANONYMOUS_USER_SALT')
 * // Uses cached value on subsequent calls
 * ```
 */

import { ScaleMuleApiError } from '../types'
import { createServerClient } from './client'

// ============================================================================
// Types
// ============================================================================

interface CachedSecret {
  value: string
  version: number
  cachedAt: number
}

interface SecretsCache {
  [key: string]: CachedSecret
}

// ============================================================================
// Configuration
// ============================================================================

/** Default cache TTL in milliseconds (5 minutes) */
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000

/** Cache storage */
const secretsCache: SecretsCache = {}

/** Configuration options */
interface SecretsConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number
  /** Disable caching (for testing) */
  noCache?: boolean
}

let globalConfig: SecretsConfig = {}

/**
 * Configure secrets caching behavior
 *
 * @example
 * ```typescript
 * configureSecrets({ cacheTtlMs: 60000 }) // 1 minute cache
 * ```
 */
export function configureSecrets(config: SecretsConfig): void {
  globalConfig = { ...globalConfig, ...config }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get a secret from the ScaleMule tenant vault
 *
 * This function automatically caches secrets to minimize API calls.
 * If the secret doesn't exist, returns undefined.
 *
 * @param key - The secret key (e.g., 'ANONYMOUS_USER_SALT')
 * @returns The secret value, or undefined if not found
 *
 * @example
 * ```typescript
 * import { getAppSecret } from '@scalemule/nextjs/server'
 *
 * export async function POST(request: NextRequest) {
 *   const salt = await getAppSecret('ANONYMOUS_USER_SALT')
 *   if (!salt) {
 *     console.warn('ANONYMOUS_USER_SALT not configured in ScaleMule vault')
 *     // Fall back to environment variable or default
 *     salt = process.env.ANONYMOUS_USER_SALT || 'default-salt'
 *   }
 *   // Use the salt...
 * }
 * ```
 */
export async function getAppSecret(key: string): Promise<string | undefined> {
  const cacheTtl = globalConfig.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const noCache = globalConfig.noCache ?? false

  // Check cache first
  if (!noCache) {
    const cached = secretsCache[key]
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.value
    }
  }

  // Fetch from API
  try {
    const client = createServerClient()
    const result = await client.secrets.get(key)

    // Cache the result
    if (!noCache && result) {
      secretsCache[key] = {
        value: result.value,
        version: result.version,
        cachedAt: Date.now(),
      }
    }

    return result?.value
  } catch (error) {
    if (error instanceof ScaleMuleApiError && error.code === 'SECRET_NOT_FOUND') {
      return undefined
    }
    console.error(`[ScaleMule Secrets] Error fetching ${key}:`, error)
    return undefined
  }
}

/**
 * Get a secret, throwing if not found
 *
 * Use this when the secret is required and the app cannot function without it.
 *
 * @param key - The secret key
 * @returns The secret value
 * @throws Error if the secret is not found
 *
 * @example
 * ```typescript
 * const salt = await requireAppSecret('ANONYMOUS_USER_SALT')
 * // Throws if not configured
 * ```
 */
export async function requireAppSecret(key: string): Promise<string> {
  const value = await getAppSecret(key)
  if (value === undefined) {
    throw new Error(
      `Required secret '${key}' not found in ScaleMule vault. ` +
        `Configure it in the ScaleMule dashboard or use the SDK: scalemule.secrets.set('${key}', value)`
    )
  }
  return value
}

/**
 * Get a secret with a fallback value
 *
 * Useful for development or when migrating from environment variables.
 *
 * @param key - The secret key
 * @param fallback - Fallback value if secret not found
 * @returns The secret value or fallback
 *
 * @example
 * ```typescript
 * // Fall back to env var if not in vault yet
 * const salt = await getAppSecretOrDefault(
 *   'ANONYMOUS_USER_SALT',
 *   process.env.ANONYMOUS_USER_SALT || 'dev-salt'
 * )
 * ```
 */
export async function getAppSecretOrDefault(
  key: string,
  fallback: string
): Promise<string> {
  const value = await getAppSecret(key)
  return value ?? fallback
}

/**
 * Invalidate cached secret (force refresh on next access)
 *
 * @param key - The secret key to invalidate, or undefined to clear all
 */
export function invalidateSecretCache(key?: string): void {
  if (key) {
    delete secretsCache[key]
  } else {
    Object.keys(secretsCache).forEach((k) => delete secretsCache[k])
  }
}

/**
 * Prefetch secrets into cache
 *
 * Call this during app startup to warm the cache.
 *
 * @param keys - Array of secret keys to prefetch
 *
 * @example
 * ```typescript
 * // In your app initialization:
 * await prefetchSecrets(['ANONYMOUS_USER_SALT', 'WEBHOOK_SECRET'])
 * ```
 */
export async function prefetchSecrets(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => getAppSecret(key)))
}
