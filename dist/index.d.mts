import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode } from 'react';
import { ScaleMuleClient } from './client.mjs';
export { ClientConfig, RequestOptions, createClient } from './client.mjs';
import { S as ScaleMuleConfig, U as User, L as LoginResponse, A as ApiError, a as UseAuthReturn, b as UseBillingReturn, c as ListFilesParams, d as UseContentReturn, e as UseUserReturn, f as UseAnalyticsOptions, g as UseAnalyticsReturn } from './index-jomBa89d.mjs';
export { a2 as AccountBalance, a9 as AnalyticsEvent, k as ApiResponse, af as BatchTrackRequest, a3 as BillingPayment, a5 as BillingPayout, a4 as BillingRefund, a7 as BillingTransaction, r as ChangeEmailRequest, C as ChangePasswordRequest, $ as ClientContext, a1 as ConnectedAccount, D as DeviceFingerprint, ac as DeviceInfo, ad as EnhancedAnalyticsEvent, F as ForgotPasswordRequest, x as LinkedAccount, T as ListFilesResponse, n as LoginDeviceInfo, l as LoginRequest, m as LoginResponseWithMFA, o as LoginRiskInfo, G as MFAChallengeResponse, M as MFAMethod, B as MFASMSSetupResponse, y as MFASetupRequest, H as MFAStatus, z as MFATOTPSetupResponse, E as MFAVerifyRequest, v as OAuthCallbackRequest, w as OAuthCallbackResponse, t as OAuthConfig, O as OAuthProvider, u as OAuthStartResponse, aa as PageViewData, a6 as PayoutSchedule, K as PhoneLoginRequest, I as PhoneSendCodeRequest, J as PhoneVerifyRequest, P as Profile, p as RefreshResponse, R as RegisterRequest, q as ResetPasswordRequest, h as ScaleMuleApiError, i as ScaleMuleEnvironment, s as Session, _ as SignedUploadCompleteRequest, Y as SignedUploadRequest, Z as SignedUploadResponse, X as SignedUploadUrl, j as StorageAdapter, N as StorageFile, ae as TrackEventResponse, a8 as TransactionSummary, ab as UTMParams, a0 as UpdateProfileRequest, Q as UploadOptions, W as UploadResponse, V as VerifyEmailRequest } from './index-jomBa89d.mjs';

interface ScaleMuleContextValue {
    /** The API client instance */
    client: ScaleMuleClient;
    /** Current authenticated user */
    user: User | null;
    /** Set the current user */
    setUser: (user: User | null) => void;
    /** Whether the SDK is initializing */
    initializing: boolean;
    /** Last error */
    error: ApiError | null;
    /** Set error */
    setError: (error: ApiError | null) => void;
    /** Analytics proxy URL (when set, SDK sends events here instead of ScaleMule) */
    analyticsProxyUrl?: string;
    /** Auth proxy URL (when set, auth operations route through this proxy) */
    authProxyUrl?: string;
    /** Publishable key for browser-safe operations (analytics) */
    publishableKey?: string;
    /** Gateway URL for direct API calls */
    gatewayUrl?: string;
}
interface ScaleMuleProviderProps extends ScaleMuleConfig {
    children: ReactNode;
    /** Called when user logs in */
    onLogin?: (user: User, response: LoginResponse) => void;
    /** Called when user logs out */
    onLogout?: () => void;
    /** Called on authentication error */
    onAuthError?: (error: ApiError) => void;
}
declare function ScaleMuleProvider({ apiKey, applicationId, environment, gatewayUrl, debug, storage, analyticsProxyUrl, authProxyUrl, publishableKey, children, onLogin, onLogout, onAuthError, }: ScaleMuleProviderProps): react_jsx_runtime.JSX.Element;
declare function useScaleMule(): ScaleMuleContextValue;
declare function useScaleMuleClient(): ScaleMuleClient;

declare function useAuth(): UseAuthReturn;

/**
 * Billing hook for ScaleMule marketplace payments
 *
 * Provides connected accounts, payments, refunds, payouts, and ledger queries.
 *
 * @example
 * ```tsx
 * function CreatorDashboard() {
 *   const {
 *     getMyConnectedAccount,
 *     getAccountBalance,
 *     getTransactionSummary,
 *     loading,
 *   } = useBilling()
 *
 *   useEffect(() => {
 *     async function load() {
 *       const account = await getMyConnectedAccount()
 *       if (account) {
 *         const balance = await getAccountBalance(account.id)
 *         const summary = await getTransactionSummary()
 *       }
 *     }
 *     load()
 *   }, [])
 * }
 * ```
 */
declare function useBilling(): UseBillingReturn;

interface UseContentOptions {
    /** Auto-fetch files on mount */
    autoFetch?: boolean;
    /** Initial list params */
    initialParams?: ListFilesParams;
}
/**
 * Content/Storage hook for ScaleMule
 *
 * Provides file upload, listing, and deletion functionality.
 * Automatically includes user ID for proper multi-tenancy.
 *
 * @example
 * ```tsx
 * function Gallery() {
 *   const { files, upload, uploadProgress, loading } = useContent({ autoFetch: true })
 *
 *   const handleUpload = async (e) => {
 *     const file = e.target.files[0]
 *     await upload(file, {
 *       onProgress: (progress) => console.log(`${progress}%`)
 *     })
 *     // Files list is automatically refreshed
 *   }
 *
 *   // For large files, use signed upload
 *   const handleLargeUpload = async (file) => {
 *     const signedUrl = await getSignedUploadUrl({
 *       filename: file.name,
 *       content_type: file.type,
 *       size_bytes: file.size,
 *     })
 *     await uploadToSignedUrl(signedUrl.upload_url, file, signedUrl.required_headers)
 *     const result = await completeSignedUpload(signedUrl.file_id)
 *   }
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleUpload} />
 *       {uploadProgress !== null && <progress value={uploadProgress} max={100} />}
 *       {files.map(file => (
 *         <img key={file.id} src={file.url} alt={file.filename} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
declare function useContent(options?: UseContentOptions): UseContentReturn;

/**
 * User profile hook for ScaleMule
 *
 * Provides profile management, password changes, and account operations.
 *
 * @example
 * ```tsx
 * function ProfilePage() {
 *   const { profile, update, changePassword } = useUser()
 *
 *   const handleUpdate = async () => {
 *     await update({ full_name: 'New Name' })
 *   }
 * }
 * ```
 */
declare function useUser(): UseUserReturn;

type RealtimeEvent = 'user.updated' | 'user.deleted' | 'session.expired' | 'file.uploaded' | 'file.deleted' | 'file.scanned' | 'notification' | string;
interface RealtimeMessage<T = unknown> {
    event: RealtimeEvent;
    data: T;
    timestamp: string;
}
type RealtimeStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
interface UseRealtimeOptions {
    /** Auto-connect on mount (default: true) */
    autoConnect?: boolean;
    /** Events to subscribe to (default: all) */
    events?: RealtimeEvent[];
    /** Reconnect on disconnect (default: true) */
    autoReconnect?: boolean;
    /** Max reconnect attempts (default: 5) */
    maxReconnectAttempts?: number;
    /** Reconnect delay in ms (default: 1000, doubles each attempt) */
    reconnectDelay?: number;
}
interface UseRealtimeReturn {
    /** Current connection status */
    status: RealtimeStatus;
    /** Last error */
    error: ApiError | null;
    /** Connect to realtime */
    connect: () => void;
    /** Disconnect from realtime */
    disconnect: () => void;
    /** Subscribe to an event */
    subscribe: <T>(event: RealtimeEvent, callback: (data: T) => void) => () => void;
    /** Send a message (if supported) */
    send: (event: string, data: unknown) => void;
    /** Last received message */
    lastMessage: RealtimeMessage | null;
}
/**
 * Real-time updates hook via WebSocket
 *
 * Provides live updates for user state, files, and notifications.
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { status, subscribe } = useRealtime()
 *
 *   useEffect(() => {
 *     // Subscribe to file uploads
 *     const unsubscribe = subscribe('file.uploaded', (data) => {
 *       console.log('New file uploaded:', data)
 *       refreshFiles()
 *     })
 *
 *     return () => unsubscribe()
 *   }, [subscribe])
 *
 *   return (
 *     <div>
 *       <span>Status: {status}</span>
 *     </div>
 *   )
 * }
 * ```
 */
declare function useRealtime(options?: UseRealtimeOptions): UseRealtimeReturn;

/**
 * Analytics hook for ScaleMule
 *
 * Provides event tracking, page views, and user identification.
 * Automatically handles session management, UTM capture, and device detection.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { trackEvent, trackPageView } = useAnalytics()
 *
 *   // Track page views automatically on mount
 *   useEffect(() => {
 *     trackPageView()
 *   }, [trackPageView])
 *
 *   // Track custom events
 *   const handleClick = async () => {
 *     await trackEvent({
 *       event_name: 'button_clicked',
 *       event_category: 'engagement',
 *       properties: { button_id: 'cta_signup' }
 *     })
 *   }
 *
 *   return <button onClick={handleClick}>Sign Up</button>
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Full tracking with user identification
 * function App() {
 *   const { trackEvent, identify, reset } = useAnalytics()
 *   const { user, login, logout } = useAuth()
 *
 *   // Identify user after login
 *   const handleLogin = async (credentials) => {
 *     const result = await login(credentials)
 *     await identify(result.user.id, { email: result.user.email })
 *   }
 *
 *   // Reset on logout
 *   const handleLogout = async () => {
 *     await logout()
 *     reset()
 *   }
 * }
 * ```
 */
declare function useAnalytics(options?: UseAnalyticsOptions): UseAnalyticsReturn;

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
interface PasswordValidationResult {
    valid: boolean;
    errors: string[];
    strength: 'weak' | 'fair' | 'good' | 'strong';
}
interface PhoneValidationResult {
    valid: boolean;
    formatted: string | null;
    error: string | null;
}
interface PhoneCountry {
    code: string;
    name: string;
    dialCode: string;
}
declare const phoneCountries: PhoneCountry[];
interface UsernameValidationResult {
    valid: boolean;
    error: string | null;
}
declare function normalizePhone(input: string): string;
declare function composePhone(countryDialCode: string, localNumber: string): string;
/**
 * Validation helpers matching ScaleMule backend rules.
 * These provide instant feedback - backend is always the source of truth.
 */
declare const validators: {
    /**
     * Validate email address format.
     * Matches RFC 5322 simplified pattern used by ScaleMule backend.
     */
    email: (email: string) => boolean;
    /**
     * Validate password strength.
     * Returns detailed result with errors and strength indicator.
     */
    password: (password: string) => PasswordValidationResult;
    /**
     * Validate phone number in E.164 format.
     * ScaleMule requires E.164 format: +[country code][number]
     */
    phone: (phone: string) => PhoneValidationResult;
    /**
     * Validate username format.
     * Alphanumeric with underscores, 3-30 characters.
     */
    username: (username: string) => UsernameValidationResult;
    /**
     * Validate UUID format.
     * Accepts UUIDv1, v4, v7 formats.
     */
    uuid: (uuid: string) => boolean;
    /**
     * Validate URL format.
     */
    url: (url: string) => boolean;
    /**
     * Validate file size against ScaleMule limits.
     * Default max is 100MB, can be customized per application.
     */
    fileSize: (bytes: number, maxMB?: number) => {
        valid: boolean;
        error: string | null;
    };
    /**
     * Validate file type against allowed MIME types.
     */
    fileType: (mimeType: string, allowed?: string[]) => {
        valid: boolean;
        error: string | null;
    };
    /**
     * Sanitize and validate a display name.
     */
    displayName: (name: string) => {
        valid: boolean;
        sanitized: string;
        error: string | null;
    };
};
/**
 * Validate multiple fields at once.
 * Returns a map of field names to error messages.
 */
declare function validateForm<T extends Record<string, unknown>>(data: T, rules: Partial<Record<keyof T, (value: unknown) => boolean | {
    valid: boolean;
    error?: string | null;
}>>): {
    valid: boolean;
    errors: Partial<Record<keyof T, string>>;
};
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
declare function sanitizeForLog(data: unknown): unknown;
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
declare function createSafeLogger(prefix: string): {
    log: (message: string, data?: unknown) => void;
    info: (message: string, data?: unknown) => void;
    warn: (message: string, data?: unknown) => void;
    error: (message: string, data?: unknown) => void;
};

export { ApiError, ListFilesParams, LoginResponse, type PasswordValidationResult, type PhoneCountry, type PhoneValidationResult, type RealtimeEvent, type RealtimeMessage, type RealtimeStatus, ScaleMuleClient, ScaleMuleConfig, ScaleMuleProvider, type ScaleMuleProviderProps, UseAnalyticsOptions, UseAnalyticsReturn, UseAuthReturn, UseBillingReturn, UseContentReturn, type UseRealtimeOptions, type UseRealtimeReturn, UseUserReturn, User, type UsernameValidationResult, composePhone, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAuth, useBilling, useContent, useRealtime, useScaleMule, useScaleMuleClient, useUser, validateForm, validators };
