/**
 * ScaleMule SDK Types
 *
 * These types mirror the ScaleMule API responses and requests.
 */
type ScaleMuleEnvironment = 'dev' | 'prod';
interface ScaleMuleConfig {
    /** Your ScaleMule API key */
    apiKey: string;
    /** Your ScaleMule Application ID (required for realtime features) */
    applicationId?: string;
    /** Environment: 'dev' or 'prod' - automatically sets gateway URL */
    environment?: ScaleMuleEnvironment;
    /** Custom gateway URL (overrides environment preset) */
    gatewayUrl?: string;
    /** Enable debug logging */
    debug?: boolean;
    /** Custom storage for session persistence (defaults to localStorage) */
    storage?: StorageAdapter;
    /**
     * Proxy URL for analytics events (e.g., '/api/analytics' or '/api/t/e')
     *
     * When set, the SDK sends analytics events to this URL instead of directly
     * to ScaleMule. Use this when you don't want to expose your API key in the
     * browser. Your server-side route should use createAnalyticsRoutes() from
     * '@scalemule/nextjs/server' to forward events to ScaleMule.
     *
     * @example
     * // In your provider config:
     * analyticsProxyUrl: '/api/analytics'
     *
     * // In your server route (app/api/analytics/[...path]/route.ts):
     * import { createAnalyticsRoutes } from '@scalemule/nextjs/server'
     * export const { POST } = createAnalyticsRoutes()
     */
    analyticsProxyUrl?: string;
    /**
     * Proxy URL for authentication operations (e.g., '/api/auth')
     *
     * When set, the SDK routes all auth calls (login, register, logout, etc.)
     * through this URL instead of making direct browser requests to ScaleMule.
     * This keeps the secret API key on the server and uses httpOnly cookies
     * for session management.
     *
     * Your server-side route should handle auth operations using
     * createServerClient() from '@scalemule/nextjs/server'.
     *
     * @example
     * // In your provider config:
     * authProxyUrl: '/api/auth'
     *
     * // In your server route (app/api/auth/[...path]/route.ts):
     * // Handle register, login, logout, etc. using ScaleMule server client
     */
    authProxyUrl?: string;
    /**
     * Publishable API key for browser-safe operations (e.g., analytics)
     *
     * Publishable keys (sm_pb_*) are origin-locked and safe to expose in
     * browser code. They have restricted access compared to secret keys.
     *
     * When set, the analytics hook uses this key for direct browser-to-API
     * calls instead of going through the analytics proxy.
     *
     * @example
     * publishableKey: 'sm_pb_production_a1b2c3d4...'
     */
    publishableKey?: string;
}
interface StorageAdapter {
    getItem(key: string): string | null | Promise<string | null>;
    setItem(key: string, value: string): void | Promise<void>;
    removeItem(key: string): void | Promise<void>;
}
declare class ScaleMuleApiError extends Error {
    code: string;
    status?: number;
    field?: string;
    details?: unknown;
    constructor(error: ApiError);
}
interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: ApiError;
}
interface ApiError {
    code: string;
    message: string;
    field?: string;
}
interface User {
    id: string;
    email: string;
    email_verified: boolean;
    phone: string | null;
    phone_verified: boolean;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    status: 'active' | 'suspended' | 'pending_verification';
    created_at: string;
}
interface RegisterRequest {
    email: string;
    password: string;
    full_name?: string;
    username?: string;
    phone?: string;
}
interface LoginRequest {
    email: string;
    password: string;
    remember_me?: boolean;
    device_fingerprint?: DeviceFingerprint;
}
interface DeviceFingerprint {
    screen?: string;
    timezone?: string;
    language?: string;
    platform?: string;
    cookie_enabled?: boolean;
    do_not_track?: string;
}
interface LoginResponse {
    session_token: string;
    user: User;
    expires_at: string;
    absolute_expires_at: string;
    access_token?: string;
    refresh_token?: string;
    access_token_expires_in?: number;
    device?: LoginDeviceInfo;
    risk?: LoginRiskInfo;
}
interface LoginDeviceInfo {
    id: string;
    name: string;
    trust_level: string;
    is_new: boolean;
}
interface LoginRiskInfo {
    score: number;
    action: string;
    factors: string[];
    action_required?: boolean;
}
interface RefreshResponse {
    session_token: string;
    expires_at: string;
}
interface ForgotPasswordRequest {
    email: string;
}
interface ResetPasswordRequest {
    token: string;
    new_password: string;
}
interface VerifyEmailRequest {
    token: string;
}
interface ChangePasswordRequest {
    current_password: string;
    new_password: string;
}
interface ChangeEmailRequest {
    new_email: string;
    password: string;
}
type OAuthProvider = 'google' | 'apple' | 'github' | 'facebook' | 'twitter' | 'linkedin';
interface OAuthConfig {
    /** OAuth provider */
    provider: OAuthProvider;
    /** URL to redirect to after OAuth completes */
    redirectUrl?: string;
    /** Additional scopes to request */
    scopes?: string[];
    /** State parameter for CSRF protection */
    state?: string;
}
interface OAuthStartResponse {
    /** URL to redirect user to for OAuth flow */
    authorization_url: string;
    /** State token for verification */
    state: string;
}
interface OAuthCallbackRequest {
    /** OAuth provider */
    provider: OAuthProvider;
    /** Authorization code from OAuth provider */
    code: string;
    /** State token for verification */
    state: string;
}
interface OAuthCallbackResponse {
    /** Session token for the authenticated user */
    session_token: string;
    /** The authenticated user */
    user: User;
    /** When the session expires */
    expires_at: string;
    /** Whether this is a new user (just registered via OAuth) */
    is_new_user: boolean;
}
interface LinkedAccount {
    provider: string;
    provider_user_id: string;
    provider_email?: string;
    linked_at: string;
}
type MFAMethod = 'totp' | 'sms' | 'email';
interface MFASetupRequest {
    method: MFAMethod;
    /** Phone number for SMS (required if method is 'sms') */
    phone?: string;
}
interface MFATOTPSetupResponse {
    /** Secret key for TOTP */
    secret: string;
    /** QR code URI for authenticator apps (otpauth:// format) */
    qr_code_uri: string;
    /** Issuer name shown in authenticator app */
    issuer: string;
    /** Account name shown in authenticator app */
    account_name: string;
}
interface MFASMSSetupResponse {
    /** Whether setup was successful */
    success: boolean;
    /** Status message */
    message: string;
    /** Last digits of the phone number for display */
    phone_last_digits: string;
}
interface MFAVerifyRequest {
    /** The MFA code entered by user */
    code: string;
    /** MFA method being verified */
    method: MFAMethod;
    /** Whether this is during login challenge */
    is_login_challenge?: boolean;
}
interface MFAChallengeResponse {
    /** Challenge token for completing MFA */
    challenge_token: string;
    /** Available MFA methods for this user */
    available_methods: MFAMethod[];
    /** Hint for the method (e.g., last 4 digits of phone) */
    hint?: string;
}
interface MFAStatus {
    mfa_enabled: boolean;
    mfa_method?: string;
    totp_configured: boolean;
    sms_configured: boolean;
    email_configured: boolean;
    backup_codes_remaining: number;
    allowed_methods: string[];
    mfa_required: boolean;
    requirement_source: string;
}
interface LoginResponseWithMFA extends Omit<LoginResponse, 'session_token'> {
    /** Whether MFA challenge is required */
    requires_mfa: boolean;
    /** MFA challenge details (if requires_mfa is true) */
    mfa_challenge?: MFAChallengeResponse;
    /** Session token (only present if MFA not required or already completed) */
    session_token?: string;
}
interface PhoneSendCodeRequest {
    /** Phone number in E.164 format */
    phone: string;
    /** Purpose of the code */
    purpose: 'login' | 'verify' | 'register';
}
interface PhoneVerifyRequest {
    /** Phone number in E.164 format */
    phone: string;
    /** Verification code from SMS */
    code: string;
}
interface PhoneLoginRequest {
    /** Phone number in E.164 format */
    phone: string;
    /** Verification code from SMS */
    code: string;
    /** Full name (required for new users) */
    full_name?: string;
}
interface Session {
    token: string;
    userId: string;
    expiresAt: Date;
}
/**
 * Client context information to forward when making server-to-server calls
 * on behalf of end users. This ensures that ScaleMule captures the actual
 * end user's information instead of the server's information.
 *
 * Used primarily for uploads where tracking the uploader's IP, user agent,
 * and device fingerprint is important for security (e.g., identifying bad actors).
 */
interface ClientContext {
    /** End user's IP address (from X-Forwarded-For or X-Real-IP) */
    ip?: string;
    /** End user's browser user agent */
    userAgent?: string;
    /** End user's device fingerprint (if collected) */
    deviceFingerprint?: string;
    /** HTTP Referer header (the page that linked to this one) */
    referrer?: string;
}
interface StorageFile {
    id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    is_public: boolean;
    created_at: string;
    scan_status?: string;
    url?: string;
    checksum?: string;
    scanned_at?: string;
}
interface UploadOptions {
    /** Make file publicly accessible */
    is_public?: boolean;
    /** Custom filename (defaults to original) */
    filename?: string;
    /** File category for organization */
    category?: string;
    /** Progress callback (0-100) */
    onProgress?: (progress: number) => void;
}
interface ListFilesParams {
    /** Filter by content type prefix (e.g., 'image/', 'video/') */
    content_type?: string;
    /** Search in filename */
    search?: string;
    /** Number of results (max 100) */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}
interface ListFilesResponse {
    files: StorageFile[];
    total: number;
    limit: number;
    offset: number;
}
interface UploadResponse {
    id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    url: string;
}
interface SignedUploadUrl {
    upload_url: string;
    file_id: string;
    expires_at: string;
}
interface SignedUploadRequest {
    /** Original filename */
    filename: string;
    /** MIME content type */
    content_type: string;
    /** File size in bytes */
    size_bytes: number;
    /** Make file publicly accessible */
    is_public?: boolean;
}
interface SignedUploadResponse {
    /** Pre-signed URL for direct upload */
    upload_url: string;
    /** File ID for reference */
    file_id: string;
    /** When the signed URL expires */
    expires_at: string;
    /** Headers to include in the upload request */
    required_headers: Record<string, string>;
}
interface SignedUploadCompleteRequest {
    /** File ID from signed upload response */
    file_id: string;
}
interface UpdateProfileRequest {
    full_name?: string;
    username?: string;
    avatar_url?: string;
}
interface Profile extends User {
}
interface UseAuthReturn {
    /** Current user or null if not logged in */
    user: User | null;
    /** True while loading initial auth state */
    loading: boolean;
    /** True if user is authenticated */
    isAuthenticated: boolean;
    /** Last auth error */
    error: ApiError | null;
    /** Register a new user */
    register: (data: RegisterRequest) => Promise<User>;
    /** Login with email/password (may return MFA challenge) */
    login: (data: LoginRequest) => Promise<LoginResponse | LoginResponseWithMFA>;
    /** Logout current user */
    logout: () => Promise<void>;
    /** Request password reset email */
    forgotPassword: (email: string) => Promise<void>;
    /** Reset password with token */
    resetPassword: (token: string, newPassword: string) => Promise<void>;
    /** Verify email with token */
    verifyEmail: (token: string) => Promise<void>;
    /** Resend verification email (optional email for unauthenticated resend) */
    resendVerification: (email?: string) => Promise<void>;
    /** Refresh session token */
    refreshSession: () => Promise<void>;
    /** Start OAuth flow for a provider */
    startOAuth: (config: OAuthConfig) => Promise<OAuthStartResponse>;
    /** Complete OAuth flow after redirect */
    completeOAuth: (request: OAuthCallbackRequest) => Promise<OAuthCallbackResponse>;
    /** Get list of linked OAuth accounts */
    getLinkedAccounts: () => Promise<LinkedAccount[]>;
    /** Link a new OAuth account */
    linkAccount: (config: OAuthConfig) => Promise<OAuthStartResponse>;
    /** Unlink an OAuth account */
    unlinkAccount: (provider: OAuthProvider) => Promise<void>;
    /** Get current MFA status */
    getMFAStatus: () => Promise<MFAStatus>;
    /** Start MFA setup for a method */
    setupMFA: (request: MFASetupRequest) => Promise<MFATOTPSetupResponse | MFASMSSetupResponse>;
    /** Verify and enable MFA */
    verifyMFA: (request: MFAVerifyRequest) => Promise<void>;
    /** Complete MFA challenge during login */
    completeMFAChallenge: (challengeToken: string, code: string, method: MFAMethod) => Promise<LoginResponse>;
    /** Disable MFA */
    disableMFA: (password: string) => Promise<void>;
    /** Regenerate backup codes */
    regenerateBackupCodes: (password: string) => Promise<string[]>;
    /** Send verification code to phone */
    sendPhoneCode: (request: PhoneSendCodeRequest) => Promise<void>;
    /** Verify phone number */
    verifyPhone: (request: PhoneVerifyRequest) => Promise<void>;
    /** Login with phone number */
    loginWithPhone: (request: PhoneLoginRequest) => Promise<LoginResponse>;
}
interface UseContentReturn {
    /** User's files */
    files: StorageFile[];
    /** True while loading */
    loading: boolean;
    /** Upload progress (0-100) when upload is in progress */
    uploadProgress: number | null;
    /** Last error */
    error: ApiError | null;
    /** Upload a file (direct upload through SDK) */
    upload: (file: File, options?: UploadOptions) => Promise<UploadResponse>;
    /** List user's files */
    list: (params?: ListFilesParams) => Promise<ListFilesResponse>;
    /** Delete a file */
    remove: (fileId: string) => Promise<void>;
    /** Get a single file's info */
    get: (fileId: string) => Promise<StorageFile>;
    /** Refresh the file list */
    refresh: () => Promise<void>;
    /** Get a signed URL for direct upload (bypasses SDK, uploads directly to storage) */
    getSignedUploadUrl: (request: SignedUploadRequest) => Promise<SignedUploadResponse>;
    /** Upload file directly to signed URL (call this yourself with fetch/xhr) */
    uploadToSignedUrl: (signedUrl: string, file: File, headers: Record<string, string>, onProgress?: (progress: number) => void) => Promise<void>;
    /** Mark signed upload as complete */
    completeSignedUpload: (fileId: string) => Promise<StorageFile>;
}
interface UseUserReturn {
    /** Current user profile */
    profile: Profile | null;
    /** True while loading */
    loading: boolean;
    /** Last error */
    error: ApiError | null;
    /** Update profile */
    update: (data: UpdateProfileRequest) => Promise<Profile>;
    /** Change password */
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
    /** Change email */
    changeEmail: (newEmail: string, password: string) => Promise<void>;
    /** Delete account */
    deleteAccount: (password: string) => Promise<void>;
    /** Request data export */
    exportData: () => Promise<{
        download_url: string;
    }>;
}
/**
 * Analytics event to track
 */
interface AnalyticsEvent {
    /** Event name (e.g., 'page_viewed', 'button_clicked', 'purchase_completed') */
    event_name: string;
    /** Event category for grouping (e.g., 'engagement', 'conversion', 'navigation') */
    event_category?: string;
    /** Additional event properties as key-value pairs */
    properties?: Record<string, unknown>;
    /** User ID to associate with event (auto-filled if user is logged in) */
    user_id?: string;
    /** Session ID for tracking user journey (auto-generated if not provided) */
    session_id?: string;
    /** Anonymous ID for tracking before login (auto-generated if not provided) */
    anonymous_id?: string;
    /** Client timestamp (auto-filled if not provided) */
    client_timestamp?: string;
    /** Session duration in seconds at event time (auto-filled) */
    session_duration_seconds?: number;
}
/**
 * Page view event data
 */
interface PageViewData {
    /** Page URL (auto-filled from window.location if not provided) */
    page_url?: string;
    /** Page title (auto-filled from document.title if not provided) */
    page_title?: string;
    /** Referrer URL (auto-filled from document.referrer if not provided) */
    referrer?: string;
    /** Additional properties */
    properties?: Record<string, unknown>;
}
/**
 * UTM parameters for campaign tracking
 */
interface UTMParams {
    /** Traffic source (e.g., 'google', 'newsletter', 'facebook') */
    utm_source?: string;
    /** Marketing medium (e.g., 'cpc', 'email', 'social') */
    utm_medium?: string;
    /** Campaign name */
    utm_campaign?: string;
    /** Search term for paid search */
    utm_term?: string;
    /** Content identifier for A/B testing */
    utm_content?: string;
}
/**
 * Device information for analytics
 */
interface DeviceInfo {
    /** Device type (mobile, tablet, desktop) */
    device_type?: string;
    /** Device brand (Apple, Samsung, etc.) */
    device_brand?: string;
    /** Device model */
    device_model?: string;
    /** Operating system */
    os?: string;
    /** OS version */
    os_version?: string;
    /** Browser name */
    browser?: string;
    /** Browser version */
    browser_version?: string;
    /** Screen resolution (e.g., '1920x1080') */
    screen_resolution?: string;
    /** Viewport size (e.g., '1200x800') */
    viewport_size?: string;
}
/**
 * Enhanced event with all tracking data
 */
interface EnhancedAnalyticsEvent extends AnalyticsEvent {
    /** UTM campaign parameters */
    utm?: UTMParams;
    /** Device information */
    device?: DeviceInfo;
    /** Page URL */
    page_url?: string;
    /** Page title */
    page_title?: string;
    /** Landing page URL (first page user visited) */
    landing_page?: string;
}
/**
 * Track event response
 */
interface TrackEventResponse {
    /** Number of events tracked */
    tracked: number;
    /** Event ID (for v2 events) */
    event_id?: string;
    /** Session ID */
    session_id?: string;
}
/**
 * Batch track request
 */
interface BatchTrackRequest {
    /** Array of events to track */
    events: AnalyticsEvent[];
}
/**
 * Options for analytics hook
 */
interface UseAnalyticsOptions {
    /** Auto-track page views on route changes (default: true) */
    autoTrackPageViews?: boolean;
    /** Auto-capture UTM params from URL (default: true) */
    autoCaptureUtmParams?: boolean;
    /** @deprecated Typo kept for backward compatibility. Use autoCaptureUtmParams. */
    autoCapturUtmParams?: boolean;
    /** Auto-generate session ID (default: true) */
    autoGenerateSessionId?: boolean;
    /** Session ID storage key (default: 'sm_session_id') */
    sessionStorageKey?: string;
    /** Anonymous ID storage key (default: 'sm_anonymous_id') */
    anonymousStorageKey?: string;
    /** Use v2 enhanced tracking (default: true) */
    useV2?: boolean;
}
/**
 * Analytics hook return type
 */
interface UseAnalyticsReturn {
    /** True while an analytics operation is in progress */
    loading: boolean;
    /** Last error from analytics operations */
    error: ApiError | null;
    /** Current session ID */
    sessionId: string | null;
    /** Current anonymous ID */
    anonymousId: string | null;
    /** Stored UTM parameters from URL */
    utmParams: UTMParams | null;
    /**
     * Track a custom event
     * @param event - Event data to track
     * @returns Promise with track response
     * @example
     * ```tsx
     * await trackEvent({
     *   event_name: 'button_clicked',
     *   event_category: 'engagement',
     *   properties: { button_id: 'signup', location: 'header' }
     * })
     * ```
     */
    trackEvent: (event: AnalyticsEvent) => Promise<TrackEventResponse>;
    /**
     * Track a page view
     * @param data - Optional page view data (auto-filled from browser if not provided)
     * @example
     * ```tsx
     * // Auto-detect page info
     * await trackPageView()
     *
     * // Custom page info
     * await trackPageView({
     *   page_url: '/checkout',
     *   page_title: 'Checkout',
     *   properties: { cart_value: 99.99 }
     * })
     * ```
     */
    trackPageView: (data?: PageViewData) => Promise<TrackEventResponse>;
    /**
     * Track multiple events in a batch
     * @param events - Array of events to track
     * @example
     * ```tsx
     * await trackBatch([
     *   { event_name: 'item_added', properties: { item_id: '123' } },
     *   { event_name: 'cart_updated', properties: { total: 49.99 } }
     * ])
     * ```
     */
    trackBatch: (events: AnalyticsEvent[]) => Promise<TrackEventResponse>;
    /**
     * Identify user for analytics (call after login)
     * Merges anonymous activity with user profile
     * @param userId - User ID to associate with events
     * @param traits - Optional user traits
     */
    identify: (userId: string, traits?: Record<string, unknown>) => Promise<void>;
    /**
     * Reset analytics session (call on logout)
     * Clears user association but keeps anonymous ID
     */
    reset: () => void;
    /**
     * Set UTM parameters manually (auto-captured from URL by default)
     */
    setUtmParams: (params: UTMParams) => void;
    /**
     * Get device info for current browser/device
     */
    getDeviceInfo: () => DeviceInfo;
}
interface ConnectedAccount {
    id: string;
    email: string;
    country: string;
    status: 'pending' | 'onboarding' | 'active' | 'restricted' | 'disabled';
    charges_enabled: boolean;
    payouts_enabled: boolean;
    onboarding_complete: boolean;
    details_submitted: boolean;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}
interface AccountBalance {
    currency: string;
    available_cents: number;
    pending_cents: number;
    reserved_cents: number;
}
interface BillingPayment {
    id: string;
    customer_id: string;
    connected_account_id?: string;
    amount_cents: number;
    currency: string;
    platform_fee_cents: number;
    provider_fee_cents: number;
    creator_net_cents: number;
    status: string;
    payment_type?: string;
    client_secret?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
}
interface BillingRefund {
    id: string;
    payment_id: string;
    amount_cents: number;
    platform_fee_reversal_cents: number;
    reason?: string;
    status: string;
    created_at: string;
}
interface BillingPayout {
    id: string;
    amount_cents: number;
    currency: string;
    status: string;
    arrival_date?: string;
    created_at: string;
}
interface PayoutSchedule {
    schedule_interval: string;
    minimum_amount_cents: number;
    day_of_week?: number;
    day_of_month?: number;
}
interface BillingTransaction {
    id: string;
    entry_type: string;
    account_type: string;
    amount_cents: number;
    currency: string;
    category: string;
    reference_type: string;
    description?: string;
    created_at: string;
}
interface TransactionSummary {
    gross_cents: number;
    platform_fee_cents: number;
    net_cents: number;
    payout_cents: number;
    refund_cents: number;
}
interface UseBillingReturn {
    loading: boolean;
    error: ApiError | null;
    createConnectedAccount: (data: {
        email: string;
        country?: string;
    }) => Promise<ConnectedAccount | null>;
    getMyConnectedAccount: () => Promise<ConnectedAccount | null>;
    getConnectedAccount: (id: string) => Promise<ConnectedAccount | null>;
    createOnboardingLink: (id: string, data: {
        return_url: string;
        refresh_url: string;
    }) => Promise<string | null>;
    getAccountBalance: (id: string) => Promise<AccountBalance | null>;
    createPayment: (data: {
        amount_cents: number;
        currency?: string;
        connected_account_id?: string;
        platform_fee_percent?: number;
        platform_fee_cents?: number;
        payment_type?: string;
        metadata?: Record<string, unknown>;
    }) => Promise<BillingPayment | null>;
    getPayment: (id: string) => Promise<BillingPayment | null>;
    listPayments: (params?: Record<string, unknown>) => Promise<BillingPayment[]>;
    refundPayment: (id: string, data?: {
        amount_cents?: number;
        reason?: string;
    }) => Promise<BillingRefund | null>;
    getPayoutHistory: (accountId: string, params?: Record<string, unknown>) => Promise<BillingPayout[]>;
    getPayoutSchedule: (accountId: string) => Promise<PayoutSchedule | null>;
    setPayoutSchedule: (accountId: string, data: {
        schedule_interval: string;
        minimum_amount_cents?: number;
    }) => Promise<PayoutSchedule | null>;
    getTransactions: (params?: Record<string, unknown>) => Promise<BillingTransaction[]>;
    getTransactionSummary: (params?: Record<string, unknown>) => Promise<TransactionSummary | null>;
    createSetupSession: (data: {
        return_url: string;
        cancel_url: string;
    }) => Promise<string | null>;
}

export { type ClientContext as $, type ApiError as A, type MFASMSSetupResponse as B, type ChangePasswordRequest as C, type DeviceFingerprint as D, type MFAVerifyRequest as E, type ForgotPasswordRequest as F, type MFAChallengeResponse as G, type MFAStatus as H, type PhoneSendCodeRequest as I, type PhoneVerifyRequest as J, type PhoneLoginRequest as K, type LoginResponse as L, type MFAMethod as M, type StorageFile as N, type OAuthProvider as O, type Profile as P, type UploadOptions as Q, type RegisterRequest as R, type ScaleMuleConfig as S, type ListFilesResponse as T, type User as U, type VerifyEmailRequest as V, type UploadResponse as W, type SignedUploadUrl as X, type SignedUploadRequest as Y, type SignedUploadResponse as Z, type SignedUploadCompleteRequest as _, type UseAuthReturn as a, type UpdateProfileRequest as a0, type ConnectedAccount as a1, type AccountBalance as a2, type BillingPayment as a3, type BillingRefund as a4, type BillingPayout as a5, type PayoutSchedule as a6, type BillingTransaction as a7, type TransactionSummary as a8, type AnalyticsEvent as a9, type PageViewData as aa, type UTMParams as ab, type DeviceInfo as ac, type EnhancedAnalyticsEvent as ad, type TrackEventResponse as ae, type BatchTrackRequest as af, type UseBillingReturn as b, type ListFilesParams as c, type UseContentReturn as d, type UseUserReturn as e, type UseAnalyticsOptions as f, type UseAnalyticsReturn as g, ScaleMuleApiError as h, type ScaleMuleEnvironment as i, type StorageAdapter as j, type ApiResponse as k, type LoginRequest as l, type LoginResponseWithMFA as m, type LoginDeviceInfo as n, type LoginRiskInfo as o, type RefreshResponse as p, type ResetPasswordRequest as q, type ChangeEmailRequest as r, type Session as s, type OAuthConfig as t, type OAuthStartResponse as u, type OAuthCallbackRequest as v, type OAuthCallbackResponse as w, type LinkedAccount as x, type MFASetupRequest as y, type MFATOTPSetupResponse as z };
