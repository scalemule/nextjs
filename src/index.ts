/**
 * @scalemule/nextjs
 *
 * Official ScaleMule SDK for Next.js applications.
 *
 * Provides authentication, storage, and user management hooks
 * for seamless integration with ScaleMule backend services.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { ScaleMuleProvider } from '@scalemule/nextjs'
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <ScaleMuleProvider
 *       apiKey={process.env.NEXT_PUBLIC_SCALEMULE_API_KEY!}
 *       gatewayUrl="https://api.scalemule.com"
 *     >
 *       {children}
 *     </ScaleMuleProvider>
 *   )
 * }
 *
 * // app/login/page.tsx
 * import { useAuth } from '@scalemule/nextjs'
 *
 * export default function LoginPage() {
 *   const { login, error } = useAuth()
 *
 *   const handleLogin = async (email, password) => {
 *     await login({ email, password })
 *   }
 * }
 * ```
 */

// Provider
export { ScaleMuleProvider, useScaleMule, useScaleMuleClient } from './provider'
export type { ScaleMuleProviderProps } from './provider'

// Hooks
export { useAuth } from './hooks/useAuth'
export { useBilling } from './hooks/useBilling'
export { useContent } from './hooks/useContent'
export { useUser } from './hooks/useUser'
export { useRealtime } from './hooks/useRealtime'
export { useAnalytics } from './hooks/useAnalytics'
export type {
  RealtimeEvent,
  RealtimeMessage,
  RealtimeStatus,
  UseRealtimeOptions,
  UseRealtimeReturn,
} from './hooks/useRealtime'

// Types
export type {
  // Config
  ScaleMuleConfig,
  ScaleMuleEnvironment,
  StorageAdapter,

  // API Response
  ApiResponse,
  ApiError,

  // User
  User,
  Profile,

  // Auth
  RegisterRequest,
  LoginRequest,
  LoginResponse,
  LoginResponseWithMFA,
  DeviceFingerprint,
  LoginDeviceInfo,
  LoginRiskInfo,
  RefreshResponse,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
  ChangePasswordRequest,
  ChangeEmailRequest,
  Session,

  // OAuth
  OAuthProvider,
  OAuthConfig,
  OAuthStartResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  LinkedAccount,

  // MFA
  MFAMethod,
  MFASetupRequest,
  MFATOTPSetupResponse,
  MFASMSSetupResponse,
  MFAVerifyRequest,
  MFAChallengeResponse,
  MFAStatus,

  // Phone Auth
  PhoneSendCodeRequest,
  PhoneVerifyRequest,
  PhoneLoginRequest,

  // Storage
  StorageFile,
  UploadOptions,
  ListFilesParams,
  ListFilesResponse,
  UploadResponse,
  SignedUploadUrl,
  SignedUploadRequest,
  SignedUploadResponse,
  SignedUploadCompleteRequest,

  // Client Context (for server-to-server forwarding)
  ClientContext,

  // Profile
  UpdateProfileRequest,

  // Hook returns
  UseAuthReturn,
  UseBillingReturn,
  UseContentReturn,
  UseUserReturn,
  UseAnalyticsReturn,
  UseAnalyticsOptions,

  // Billing / Marketplace
  ConnectedAccount,
  AccountBalance,
  BillingPayment,
  BillingRefund,
  BillingPayout,
  PayoutSchedule,
  BillingTransaction,
  TransactionSummary,

  // Analytics
  AnalyticsEvent,
  PageViewData,
  UTMParams,
  DeviceInfo,
  EnhancedAnalyticsEvent,
  TrackEventResponse,
  BatchTrackRequest,
} from './types'

// Client (for advanced usage)
export { ScaleMuleClient, createClient } from './client'
export type { ClientConfig, RequestOptions } from './client'

// Validation helpers
export {
  validators,
  validateForm,
  sanitizeForLog,
  createSafeLogger,
  phoneCountries,
  normalizePhone,
  composePhone,
} from './validation'
export type {
  PasswordValidationResult,
  PhoneValidationResult,
  UsernameValidationResult,
  PhoneCountry,
} from './validation'
