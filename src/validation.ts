/**
 * Client-side validation helpers
 *
 * These validators match ScaleMule backend validation rules exactly.
 * Use them for instant user feedback - the backend still validates all input.
 *
 * @example
 * ```tsx
 * import { validators } from '@scalemule/nextjs'
 *
 * function RegisterForm() {
 *   const [email, setEmail] = useState('')
 *   const [password, setPassword] = useState('')
 *
 *   const emailValid = validators.email(email)
 *   const passwordResult = validators.password(password)
 *
 *   return (
 *     <form>
 *       <input
 *         type="email"
 *         value={email}
 *         onChange={(e) => setEmail(e.target.value)}
 *         className={emailValid ? 'valid' : 'invalid'}
 *       />
 *       <input
 *         type="password"
 *         value={password}
 *         onChange={(e) => setPassword(e.target.value)}
 *       />
 *       {passwordResult.errors.map((err) => (
 *         <span key={err} className="error">{err}</span>
 *       ))}
 *     </form>
 *   )
 * }
 * ```
 */

export interface PasswordValidationResult {
  valid: boolean
  errors: string[]
  strength: 'weak' | 'fair' | 'good' | 'strong'
}

export interface PhoneValidationResult {
  valid: boolean
  formatted: string | null
  error: string | null
}

export interface PhoneCountry {
  code: string
  name: string
  dialCode: string
}

export const phoneCountries: PhoneCountry[] = [
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'AU', name: 'Australia', dialCode: '+61' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'IT', name: 'Italy', dialCode: '+39' },
  { code: 'ES', name: 'Spain', dialCode: '+34' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31' },
  { code: 'SE', name: 'Sweden', dialCode: '+46' },
  { code: 'JP', name: 'Japan', dialCode: '+81' },
  { code: 'KR', name: 'South Korea', dialCode: '+82' },
  { code: 'CN', name: 'China', dialCode: '+86' },
  { code: 'SG', name: 'Singapore', dialCode: '+65' },
  { code: 'IN', name: 'India', dialCode: '+91' },
  { code: 'AE', name: 'UAE', dialCode: '+971' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234' },
  { code: 'BR', name: 'Brazil', dialCode: '+55' },
  { code: 'MX', name: 'Mexico', dialCode: '+52' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64' },
]

export interface UsernameValidationResult {
  valid: boolean
  error: string | null
}

export function normalizePhone(input: string): string {
  if (!input || typeof input !== 'string') return ''
  const trimmed = input.trim()
  if (!trimmed) return ''
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''

  if (trimmed.startsWith('+')) return `+${digits}`
  if (trimmed.startsWith('00') && digits.length > 2) return `+${digits.slice(2)}`
  return `+${digits}`
}

export function composePhone(countryDialCode: string, localNumber: string): string {
  const dial = normalizePhone(countryDialCode)
  if (!dial) return ''
  const localDigits = (localNumber || '').replace(/\D/g, '')
  if (!localDigits) return ''
  return `${dial}${localDigits}`
}

/**
 * Validation helpers matching ScaleMule backend rules.
 * These provide instant feedback - backend is always the source of truth.
 */
export const validators = {
  /**
   * Validate email address format.
   * Matches RFC 5322 simplified pattern used by ScaleMule backend.
   */
  email: (email: string): boolean => {
    if (!email || typeof email !== 'string') return false

    // Max length per RFC 5321
    if (email.length > 254) return false

    // Local part max 64 chars
    const atIndex = email.lastIndexOf('@')
    if (atIndex === -1 || atIndex > 64) return false

    // RFC 5322 simplified pattern (matches backend)
    const re =
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/

    return re.test(email)
  },

  /**
   * Validate password strength.
   * Returns detailed result with errors and strength indicator.
   */
  password: (password: string): PasswordValidationResult => {
    const errors: string[] = []

    if (!password || typeof password !== 'string') {
      return { valid: false, errors: ['Password is required'], strength: 'weak' }
    }

    // Length requirements (matches backend)
    if (password.length < 8) {
      errors.push('At least 8 characters required')
    }
    if (password.length > 128) {
      errors.push('Maximum 128 characters')
    }

    // Calculate strength
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
    if (/\d/.test(password)) score++
    if (/[^a-zA-Z0-9]/.test(password)) score++

    let strength: PasswordValidationResult['strength'] = 'weak'
    if (score >= 4) strength = 'strong'
    else if (score >= 3) strength = 'good'
    else if (score >= 2) strength = 'fair'

    return {
      valid: errors.length === 0,
      errors,
      strength,
    }
  },

  /**
   * Validate phone number in E.164 format.
   * ScaleMule requires E.164 format: +[country code][number]
   */
  phone: (phone: string): PhoneValidationResult => {
    if (!phone || typeof phone !== 'string') {
      return { valid: false, formatted: null, error: 'Phone number is required' }
    }

    const rawDigits = phone.trim().replace(/\D/g, '')
    const hasIntlPrefix = phone.trim().startsWith('+') || phone.trim().startsWith('00')

    // Preserve prior behavior: when a user enters a plain US local number,
    // return a suggestion instead of auto-accepting it.
    if (!hasIntlPrefix && /^\d{10}$/.test(rawDigits)) {
      return {
        valid: false,
        formatted: `+1${rawDigits}`,
        error: 'Add country code (e.g., +1 for US)',
      }
    }

    const cleaned = normalizePhone(phone)

    // E.164 format: + followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/

    if (e164Regex.test(cleaned)) {
      return { valid: true, formatted: cleaned, error: null }
    }

    return {
      valid: false,
      formatted: null,
      error: 'Use E.164 format: +[country code][number]',
    }
  },

  /**
   * Validate username format.
   * Alphanumeric with underscores, 3-30 characters.
   */
  username: (username: string): UsernameValidationResult => {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' }
    }

    if (username.length < 3) {
      return { valid: false, error: 'At least 3 characters required' }
    }

    if (username.length > 30) {
      return { valid: false, error: 'Maximum 30 characters' }
    }

    // Alphanumeric and underscores only
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: 'Only letters, numbers, and underscores allowed' }
    }

    // Cannot start with underscore or number
    if (/^[_0-9]/.test(username)) {
      return { valid: false, error: 'Must start with a letter' }
    }

    return { valid: true, error: null }
  },

  /**
   * Validate UUID format.
   * Accepts UUIDv1, v4, v7 formats.
   */
  uuid: (uuid: string): boolean => {
    if (!uuid || typeof uuid !== 'string') return false

    // Standard UUID format (8-4-4-4-12)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    return uuidRegex.test(uuid)
  },

  /**
   * Validate URL format.
   */
  url: (url: string): boolean => {
    if (!url || typeof url !== 'string') return false

    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch {
      return false
    }
  },

  /**
   * Validate file size against ScaleMule limits.
   * Default max is 100MB, can be customized per application.
   */
  fileSize: (bytes: number, maxMB: number = 100): { valid: boolean; error: string | null } => {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return { valid: false, error: 'Invalid file size' }
    }
    if (!Number.isFinite(maxMB) || maxMB <= 0) {
      return { valid: false, error: 'Invalid max file size' }
    }

    const maxBytes = maxMB * 1024 * 1024

    if (bytes > maxBytes) {
      return { valid: false, error: `File exceeds ${maxMB}MB limit` }
    }

    if (bytes === 0) {
      return { valid: false, error: 'File is empty' }
    }

    return { valid: true, error: null }
  },

  /**
   * Validate file type against allowed MIME types.
   */
  fileType: (
    mimeType: string,
    allowed: string[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
  ): { valid: boolean; error: string | null } => {
    if (!mimeType || typeof mimeType !== 'string') {
      return { valid: false, error: 'Unknown file type' }
    }

    if (allowed.includes(mimeType)) {
      return { valid: true, error: null }
    }

    // Check for wildcard matches (e.g., 'image/*')
    const category = mimeType.split('/')[0]
    if (allowed.includes(`${category}/*`)) {
      return { valid: true, error: null }
    }

    return { valid: false, error: `File type ${mimeType} not allowed` }
  },

  /**
   * Sanitize and validate a display name.
   */
  displayName: (name: string): { valid: boolean; sanitized: string; error: string | null } => {
    if (!name || typeof name !== 'string') {
      return { valid: false, sanitized: '', error: 'Display name is required' }
    }

    // Trim and collapse whitespace
    const sanitized = name.trim().replace(/\s+/g, ' ')

    if (sanitized.length < 1) {
      return { valid: false, sanitized, error: 'Display name is required' }
    }

    if (sanitized.length > 100) {
      return { valid: false, sanitized: sanitized.slice(0, 100), error: 'Maximum 100 characters' }
    }

    // Check for disallowed characters (control characters, etc.)
    if (/[\x00-\x1F\x7F]/.test(sanitized)) {
      return { valid: false, sanitized: sanitized.replace(/[\x00-\x1F\x7F]/g, ''), error: 'Invalid characters' }
    }

    return { valid: true, sanitized, error: null }
  },
}

/**
 * Validate multiple fields at once.
 * Returns a map of field names to error messages.
 */
export function validateForm<T extends Record<string, unknown>>(
  data: T,
  rules: Partial<Record<keyof T, (value: unknown) => boolean | { valid: boolean; error?: string | null }>>
): { valid: boolean; errors: Partial<Record<keyof T, string>> } {
  const errors: Partial<Record<keyof T, string>> = {}

  for (const [field, validator] of Object.entries(rules) as [keyof T, typeof rules[keyof T]][]) {
    if (!validator) continue

    const value = data[field]
    const result = validator(value)

    if (typeof result === 'boolean') {
      if (!result) {
        errors[field] = 'Invalid value'
      }
    } else if (!result.valid) {
      errors[field] = result.error || 'Invalid value'
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

// ============================================================================
// Log Sanitization
// ============================================================================

/**
 * Keys that should be redacted in logs
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'cookie',
  'session',
  'credential',
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
])

/**
 * Check if a key name indicates sensitive data
 */
function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  return SENSITIVE_KEYS.has(lower) || Array.from(SENSITIVE_KEYS).some((s) => lower.includes(s))
}

/**
 * Sanitize an object for safe logging.
 * Redacts values of keys that may contain sensitive data.
 *
 * @example
 * ```typescript
 * const data = { email: 'user@example.com', password: 'secret123' }
 * console.log(sanitizeForLog(data))
 * // { email: 'user@example.com', password: '[REDACTED]' }
 * ```
 */
export function sanitizeForLog(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data
  }

  if (typeof data !== 'object') {
    return data
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLog)
  }

  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Create a safe logger that automatically sanitizes data.
 *
 * @example
 * ```typescript
 * const log = createSafeLogger('[MyApp]')
 * log.info('User login', { email: 'user@example.com', password: 'secret' })
 * // [MyApp] User login { email: 'user@example.com', password: '[REDACTED]' }
 * ```
 */
export function createSafeLogger(prefix: string) {
  return {
    log: (message: string, data?: unknown) => {
      console.log(`${prefix} ${message}`, data ? sanitizeForLog(data) : '')
    },
    info: (message: string, data?: unknown) => {
      console.info(`${prefix} ${message}`, data ? sanitizeForLog(data) : '')
    },
    warn: (message: string, data?: unknown) => {
      console.warn(`${prefix} ${message}`, data ? sanitizeForLog(data) : '')
    },
    error: (message: string, data?: unknown) => {
      console.error(`${prefix} ${message}`, data ? sanitizeForLog(data) : '')
    },
  }
}
