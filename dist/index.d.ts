import * as react_jsx_runtime from 'react/jsx-runtime';
import { ReactNode, ReactElement } from 'react';
import { MoneyClient } from '@scalemule/money';
export { MoneyClient, MoneyClientConfig, createMoneyClient } from '@scalemule/money';
import { RealtimeService, StorageService, PhotoService, VideoService, ApiError as ApiError$1 } from '@scalemule/sdk';
import { ScaleMuleClient } from './client.js';
export { ClientConfig, RequestOptions, createClient } from './client.js';
import { S as ScaleMuleConfig, U as User, L as LoginResponse, A as ApiError, a as UseAuthReturn, b as UseBillingReturn, c as ListFilesParams, d as UseContentReturn, e as UseUserReturn, f as UseAnalyticsOptions, g as UseAnalyticsReturn } from './index-BIIUrnPr.js';
export { h as AccountBalance, i as AnalyticsEvent, j as ApiResponse, B as BatchTrackRequest, k as BillingPayment, l as BillingPayout, m as BillingRefund, n as BillingTransaction, C as ChangeEmailRequest, o as ChangePasswordRequest, p as ClientContext, q as ConnectedAccount, D as DeviceFingerprint, r as DeviceInfo, E as EnhancedAnalyticsEvent, F as ForgotPasswordRequest, K as KnownAccountInfo, s as LinkedAccount, t as ListFilesResponse, u as LoginDeviceInfo, v as LoginRequest, w as LoginResponseWithMFA, x as LoginRiskInfo, M as MFAChallengeResponse, y as MFAMethod, z as MFASMSSetupResponse, G as MFASetupRequest, H as MFAStatus, I as MFATOTPSetupResponse, J as MFAVerifyRequest, O as OAuthCallbackRequest, N as OAuthCallbackResponse, P as OAuthConfig, Q as OAuthProvider, R as OAuthStartResponse, T as PageViewData, V as PayoutSchedule, W as PhoneLoginRequest, X as PhoneSendCodeRequest, Y as PhoneVerifyRequest, Z as Profile, _ as RefreshResponse, $ as RegisterRequest, a0 as ResetPasswordRequest, a1 as ScaleMuleApiError, a2 as ScaleMuleEnvironment, a3 as Session, a4 as SignedUploadCompleteRequest, a5 as SignedUploadRequest, a6 as SignedUploadResponse, a7 as SignedUploadUrl, a8 as StorageAdapter, a9 as StorageFile, aa as TrackEventResponse, ab as TransactionSummary, ac as UTMParams, ad as UpdateProfileRequest, ae as UploadOptions, af as UploadResponse, ag as VerifyEmailRequest } from './index-BIIUrnPr.js';

interface ScaleMuleContextValue {
    /** The API client instance */
    client: ScaleMuleClient;
    /** Money client instance sharing the same session token */
    money: MoneyClient;
    /** Base SDK realtime service — shared singleton for WebSocket connections */
    realtime: RealtimeService;
    /** Base SDK storage service — exposed for `useMedia()` and direct chat-attachment uploads */
    storage: StorageService;
    /** Base SDK photo service — exposed for `useMedia()` and `photo.uploadViaStorage()` */
    photo: PhotoService;
    /** Base SDK video service — exposed for `useMedia()` and `video.uploadViaStorage()` */
    video: VideoService;
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
    /** Configured environment ('dev' or 'prod') */
    environment?: string;
    /** Whether the account switcher is enabled */
    enableAccountSwitcher?: boolean;
    /** Privacy level for account switcher */
    accountSwitcherPrivacy?: string;
    /** Server-evaluated flag values to bootstrap the client (eliminates loading flash) */
    bootstrapFlags?: Record<string, unknown>;
}
interface ScaleMuleProviderProps extends ScaleMuleConfig {
    children: ReactNode;
    /** Called when user logs in */
    onLogin?: (user: User, response: LoginResponse) => void;
    /** Called when user logs out */
    onLogout?: () => void;
    /** Called on authentication error */
    onAuthError?: (error: ApiError) => void;
    /** Server-evaluated flag values to bootstrap the client (eliminates loading flash) */
    bootstrapFlags?: Record<string, unknown>;
}
declare function ScaleMuleProvider({ apiKey, applicationId, environment, gatewayUrl, debug, storage, analyticsProxyUrl, authProxyUrl, publishableKey, enableAccountSwitcher, accountSwitcherPrivacy, children, onLogin, onLogout, onAuthError, bootstrapFlags, }: ScaleMuleProviderProps): react_jsx_runtime.JSX.Element;
declare function useScaleMule(): ScaleMuleContextValue;
declare function useScaleMuleClient(): ScaleMuleClient;
declare function useMoneyClient(): MoneyClient;

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
 * **For chat / progressive media use, prefer {@link useMedia} instead.**
 * `useContent()` is a thin wrapper over generic storage and does NOT register
 * uploaded images with the photo service or videos with the video service —
 * so optimized thumbnails and HLS streaming don't light up automatically.
 * It also defaults to `is_public: true` and compresses images by default;
 * `useMedia()` defaults to private + uncompressed (the right choice for chat).
 *
 * Use `useContent()` for plain file gallery / browser surfaces where you
 * want flat storage and no media pipeline integration. See
 * `docs/MEDIA-UPLOADS.md` in the platform repo for the decision tree.
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
 * Result of a single {@link useMedia} upload call.
 *
 * The shape is normalized regardless of MIME type — `optimized_url_promise`
 * resolves on image uploads after the photo optimizer finishes; for non-image
 * uploads it resolves to `null` immediately. (Video / audio branches will
 * populate `hls_url_promise` in later phases — today they fall through to
 * generic storage and that field stays `null`.)
 */
interface MediaUploadResult {
    /** Storage file_id — store this in chat-attachment metadata. */
    file_id: string;
    /** Photo service id — null for non-image uploads or when register() failed. */
    photo_id: string | null;
    /** Short-lived signed URL to the original bytes (private uploads) or
     * a public CDN URL (when caller passed `is_public: true`). */
    original_view_url: string | null;
    /** Resolves once the photo optimizer finishes. `null` for non-image
     * MIME types or when register() failed. */
    optimized_url_promise: Promise<string | null>;
    /** Resolves once the video transcoder finishes (Phase 2 / S5b). `null` today. */
    hls_url_promise: Promise<string | null>;
    /** The file's MIME type — preserved from the input File / Blob. */
    mime_type: string;
    /** Whether the resulting storage object is public-readable. */
    is_public: boolean;
}
interface UseMediaUploadOptions {
    /** Whether the resulting storage object should be public-readable.
     * Default: `false` (private). Public is opt-in for surfaces that
     * genuinely need it (avatars, public listings). Chat / DM uploads
     * should always be private. */
    is_public?: boolean;
    /** Display filename (sanitized server-side). */
    filename?: string;
    /** Custom metadata attached to the file. */
    metadata?: Record<string, unknown>;
    /** Upload progress callback (0-100). */
    onProgress?: (percent: number) => void;
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
    /** Force a non-photo path even for image MIME types — useful for
     * generic file uploads where you don't want the photo optimizer
     * to register the file. Default: `false`. */
    skipPhotoRegister?: boolean;
}
interface UseMediaReturn {
    /** Upload a file. MIME-aware: images go through photo register +
     * optimization; everything else goes through generic storage. */
    upload: (file: File | Blob, options?: UseMediaUploadOptions) => Promise<MediaUploadResult>;
    /** Cancel an upload by its `file_id`. Deletes the storage object so
     * it doesn't orphan in S3 — useful when a chat composer accepts a
     * file but the user removes it before sending. Idempotent. */
    cancelUpload: (fileId: string) => Promise<void>;
    /** Last error from `upload` or `cancelUpload`. */
    error: ApiError$1 | null;
    /** True while an upload is in progress. */
    uploading: boolean;
}
/**
 * Opinionated, MIME-aware media upload hook.
 *
 * `useMedia()` is the canonical upload primitive for chat / progressive
 * media use. It branches by MIME type:
 *   - `image/*` → `client.photo.uploadViaStorage()` — upload to storage,
 *     then register with the photo service so the on-demand transform
 *     endpoint resolves to optimized variants. The returned
 *     `optimized_url_promise` resolves once the optimizer finishes.
 *   - everything else → `client.storage.uploadPrivate()` — a private,
 *     uncompressed, fail-closed upload to generic storage.
 *
 * **Default visibility is `is_public: false`.** Public is opt-in per call.
 * `useMedia()` does not expose `is_public` via app-level config — visibility
 * is always an explicit per-call surface choice.
 *
 * Compared to `useContent()`:
 *   - `useContent()` is a thin wrapper over generic storage and does not
 *     register photos / videos with their typed services. Use it for plain
 *     file uploads where you don't need optimization or transcoding.
 *   - `useMedia()` defaults to private + no compression, integrates with the
 *     typed media services automatically, and is the right primitive for
 *     anything chat- or media-shaped.
 *
 * @example
 * ```tsx
 * 'use client';
 *
 * import { useMedia, ScaleMuleMedia } from '@scalemule/nextjs';
 *
 * function ChatComposer({ onAttach }) {
 *   const { upload, uploading } = useMedia();
 *
 *   async function handlePick(file: File) {
 *     const result = await upload(file);
 *     onAttach({
 *       file_id: result.file_id,
 *       mime_type: result.mime_type,
 *       optimized_url_promise: result.optimized_url_promise,
 *     });
 *   }
 *
 *   return <input type="file" disabled={uploading}
 *     onChange={(e) => e.target.files?.[0] && handlePick(e.target.files[0])} />;
 * }
 * ```
 *
 * See `docs/MEDIA-UPLOADS.md` in the platform repo for the decision
 * tree and the full anti-patterns list.
 */
declare function useMedia(): UseMediaReturn;

declare const useMoney: typeof useMoneyClient;

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
    /** Channels to subscribe to */
    channels?: string[];
    /** Called when a message arrives on any subscribed channel */
    onMessage?: (channel: string, data: unknown) => void;
    /** Auto-connect on mount (default: true) — subscribing auto-connects */
    autoConnect?: boolean;
}
interface UseRealtimeReturn {
    /** Current connection status */
    status: RealtimeStatus;
    /** Last received message */
    lastMessage: {
        channel: string;
        data: unknown;
    } | null;
    /** Manually disconnect */
    disconnect: () => void;
    /** Subscribe to an additional channel (auto-connects) */
    subscribe: (channel: string, callback?: (data: unknown) => void) => () => void;
    /** Publish data to a channel */
    publish: (channel: string, data: unknown) => void;
}
/**
 * Real-time updates hook via WebSocket.
 *
 * Uses the base SDK's RealtimeService (shared singleton created in the provider)
 * to ensure correct protocol handling and single WebSocket connection per page.
 *
 * @example
 * ```tsx
 * function ChatNotifications() {
 *   const { status, lastMessage } = useRealtime({
 *     channels: ['chat:room-1', 'notifications'],
 *     onMessage: (channel, data) => {
 *       console.log(`${channel}:`, data)
 *     },
 *   })
 *
 *   return <div>Status: {status}</div>
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

interface FeatureFlagEvaluation<T = unknown> {
    flag_id: string;
    flag_key: string;
    environment: string;
    value: T;
    reason: string;
    matched_rule_id?: string | null;
    variant_key?: string | null;
    bucket?: number | null;
}
interface UseFeatureFlagsOptions {
    environment?: string;
    context?: Record<string, unknown>;
    keys?: string[];
    enabled?: boolean;
}
interface UseFeatureFlagsReturn {
    flags: Record<string, FeatureFlagEvaluation>;
    loading: boolean;
    error: ApiError | null;
    refresh: () => Promise<void>;
    isEnabled: (flagKey: string, fallback?: boolean) => boolean;
    getFlag: <T = unknown>(flagKey: string, fallback?: T) => T;
}
declare function useFeatureFlags(options?: UseFeatureFlagsOptions): UseFeatureFlagsReturn;

interface UsePushNotificationsOptions {
    /** Service worker URL (default: '/sw.js') */
    serviceWorkerUrl?: string;
    /** Push proxy URL (default: '/api/push') */
    pushProxyUrl?: string;
    /** Where the user subscribed (e.g., 'landing_prompt', 'post_signup', 'settings') */
    registrationSource?: string;
    /** Called when a push notification is received while app is in foreground */
    onNotification?: (data: unknown) => void;
}
interface UsePushNotificationsReturn {
    /** Whether the browser supports Web Push */
    isSupported: boolean;
    /** Current notification permission state */
    permission: NotificationPermission | 'unsupported';
    /** Whether push is currently subscribed */
    isSubscribed: boolean;
    /** Whether an operation is in progress */
    isLoading: boolean;
    /** Last error */
    error: ApiError | null;
    /** Request permission and subscribe to push notifications */
    subscribe: () => Promise<void>;
    /** Unsubscribe from push notifications */
    unsubscribe: () => Promise<void>;
    /** Clear user association (call before logout) */
    disassociateUser: () => Promise<void>;
    /** The push token ID from backend registration */
    tokenId: string | null;
}
declare function usePushNotifications(options?: UsePushNotificationsOptions): UsePushNotificationsReturn;

interface UseShareOptions {
    /** The canonical URL to share. Defaults to current page URL.
     *  IMPORTANT: Pass the content's canonical URL, not window.location.href,
     *  to avoid re-sharing someone else's referral code. */
    url?: string;
    /** Manual referral code override (skips fetch) */
    referralCode?: string;
    /** Auto-fetch referral code from /v1/referrals/me when authenticated */
    autoFetchReferral?: boolean;
}
interface UseShareReturn {
    /** Share URL — absolute, with ?rc= appended if referral code available */
    shareUrl: string;
    /** User's referral code, or null if unauthenticated/not fetched */
    referralCode: string | null;
    /** Copy shareUrl to clipboard. Returns true on success. */
    copyLink: () => Promise<boolean>;
    /** Whether link was recently copied (auto-resets after 2s) */
    copied: boolean;
    /** Loading state for referral code fetch */
    loading: boolean;
}
declare function useShare(options?: UseShareOptions): UseShareReturn;

/**
 * Public types for the feedback hook + widget.
 *
 * Mirrors the JSON shape returned by `scalemule-feedback`'s public endpoints
 * (`/v1/feedback/submit`, `/v1/feedback/items`). Dashboard/admin shapes live
 * server-side and are not exported here — customer apps interact with the
 * SDK only through the end-user surface.
 */
type FeedbackType = 'bug_report' | 'feature_request' | 'improvement' | 'other';
type FeedbackStatus = 'new' | 'reviewed' | 'planned' | 'in_progress' | 'completed' | 'declined';
type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent';
/**
 * The end-user-visible shape of a feedback item. Excludes staff-only fields
 * (assigned_to, internal_notes, email of OTHER users, etc.) that the service
 * never returns through `/items`.
 */
interface FeedbackItem {
    id: string;
    type: FeedbackType;
    title: string;
    description: string;
    status: FeedbackStatus;
    priority: FeedbackPriority;
    tags: string[] | null;
    created_at: string;
    updated_at: string;
}
/**
 * Public widget configuration returned by `GET /v1/feedback/widget-config`.
 * The SDK uses this to drive runtime widget behavior per application.
 */
interface FeedbackWidgetConfig {
    enabled: boolean;
    allow_anonymous: boolean;
    widget_theme: 'light' | 'dark' | 'auto';
    widget_position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    allowed_types: FeedbackType[] | null;
}
/**
 * Body for `POST /v1/feedback/submit`.
 *
 * `email` is required when no end-user session is present — the gateway omits
 * `x-user-id` in that case and the service rejects with 400 unless email is
 * given. When a session exists, email is optional.
 */
interface FeedbackItemInput {
    type: FeedbackType;
    title: string;
    description: string;
    email?: string;
    tags?: string[];
}

interface UseFeedbackOptions {
    /** Optional status filter applied to the list call. */
    status?: FeedbackStatus;
    /** Optional type filter. */
    type?: FeedbackType;
    /** When false, suppress the initial list fetch (the widget submits without listing). */
    enabled?: boolean;
}
interface UseFeedbackResult {
    /** End-user's own feedback items for the current tenant. Empty when not signed in. */
    items: FeedbackItem[];
    loading: boolean;
    error: ApiError | null;
    /** Submit a new feedback item. Returns the persisted item on success. */
    submit: (input: FeedbackItemInput) => Promise<FeedbackItem>;
    /** Re-fetch the list. */
    refresh: () => Promise<void>;
}
/**
 * Hook for end-user feedback submission and read-own.
 *
 * Calls go through `client` from `ScaleMuleProvider`, which attaches the
 * configured API key and (when present) the user session token. Tenancy
 * (`x-app-id`) is derived by the gateway from the API key — never set
 * client-side.
 */
declare function useFeedback(options?: UseFeedbackOptions): UseFeedbackResult;

interface FeedbackWidgetProps {
    /** Floating-button corner. Default `bottom-right`. */
    position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
    /** Default selected type when the modal opens. Default `feature_request`. */
    defaultType?: FeedbackType;
    /** Restrict the type select to this subset. Default: all four types. */
    allowedTypes?: FeedbackType[];
    /** Trigger button label. Default `Feedback`. */
    triggerLabel?: string;
    /** `light`/`dark`/`auto` (matches OS). Default `auto`. */
    theme?: 'light' | 'dark' | 'auto';
    /** Optional class for the trigger button (use to override styling). */
    className?: string;
    /** Show the 1–5 star rating row. Default `true`. Rating is stored as a
     *  `rating:N` tag on the feedback item — staff can filter on it from the
     *  dashboard inbox. Optional per submission; users who skip it just submit
     *  without a rating. */
    enableRating?: boolean;
    /** Label for the rating row when enabled. Default `How would you rate
     *  your experience?`. */
    ratingLabel?: string;
    /** Called after a successful submit. */
    onSubmitted?: (item: FeedbackItem) => void;
}
/**
 * Floating feedback widget. Renders nothing until the trigger is clicked,
 * then opens a small modal with type / title / description fields. Submits
 * via `useFeedback().submit()` — inherits identity from `ScaleMuleProvider`.
 *
 * If the end-user is not signed in, the widget shows an additional `email`
 * field (required by the service for anonymous submissions).
 *
 * Tenant must have `feedback_app_config.enabled = TRUE` for `/submit` to
 * accept submissions; otherwise the service responds with 404
 * `FEEDBACK_DISABLED` and the widget surfaces the error message.
 */
declare function FeedbackWidget(props: FeedbackWidgetProps): ReactElement | null;

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

export { ApiError, type FeatureFlagEvaluation, type FeatureFlagEvaluation as FeatureFlagResult, type FeedbackItem, type FeedbackItemInput, type FeedbackPriority, type FeedbackStatus, type FeedbackType, FeedbackWidget, type FeedbackWidgetConfig, type FeedbackWidgetProps, ListFilesParams, LoginResponse, type MediaUploadResult, type PasswordValidationResult, type PhoneCountry, type PhoneValidationResult, type RealtimeEvent, type RealtimeMessage, type RealtimeStatus, ScaleMuleClient, ScaleMuleConfig, ScaleMuleProvider, type ScaleMuleProviderProps, UseAnalyticsOptions, UseAnalyticsReturn, UseAuthReturn, UseBillingReturn, UseContentReturn, type UseFeatureFlagsOptions, type UseFeatureFlagsReturn, type UseFeedbackOptions, type UseFeedbackResult, type UseFeatureFlagsOptions as UseFlagsOptions, type UseFeatureFlagsReturn as UseFlagsReturn, type UseMediaReturn, type UseMediaUploadOptions, type UsePushNotificationsOptions, type UsePushNotificationsReturn, type UseRealtimeOptions, type UseRealtimeReturn, type UseShareOptions, type UseShareReturn, UseUserReturn, User, type UsernameValidationResult, composePhone, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAuth, useBilling, useContent, useFeatureFlags, useFeedback, useMedia, useMoney, useMoneyClient, usePushNotifications, useRealtime, useScaleMule, useScaleMuleClient, useShare, useUser, validateForm, validators };
