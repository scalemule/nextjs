import * as react_jsx_runtime from 'react/jsx-runtime';
import { ApiError, RealtimeService, StorageService, PhotoService, VideoService, AudioService, TtsService, TtsJobStatus, FileStatus } from '@scalemule/sdk';
import * as React from 'react';
import { ReactNode, ReactElement } from 'react';
import { MoneyClient } from '@scalemule/money';
export { MoneyClient, MoneyClientConfig, createMoneyClient } from '@scalemule/money';
import { ScaleMuleClient } from './client.js';
export { ClientConfig, RequestOptions, createClient } from './client.js';
import { S as ScaleMuleConfig, U as User, L as LoginResponse, A as ApiError$1, a as UseAuthReturn, b as UseBillingReturn, c as ListFilesParams, d as UseContentReturn, e as UseUserReturn, f as UseAnalyticsOptions, g as UseAnalyticsReturn } from './index-zQloSkpW.js';
export { h as AccountBalance, i as AnalyticsEvent, j as ApiResponse, B as BatchTrackRequest, k as BillingPayment, l as BillingPayout, m as BillingRefund, n as BillingTransaction, C as ChangeEmailRequest, o as ChangePasswordRequest, p as ClientContext, q as ConnectedAccount, D as DeviceFingerprint, r as DeviceInfo, E as EnhancedAnalyticsEvent, F as ForgotPasswordRequest, K as KnownAccountInfo, s as LinkedAccount, t as ListFilesResponse, u as LoginDeviceInfo, v as LoginRequest, w as LoginResponseWithMFA, x as LoginRiskInfo, M as MFAChallengeResponse, y as MFAMethod, z as MFASMSSetupResponse, G as MFASetupRequest, H as MFAStatus, I as MFATOTPSetupResponse, J as MFAVerifyRequest, O as OAuthCallbackRequest, N as OAuthCallbackResponse, P as OAuthConfig, Q as OAuthProvider, R as OAuthStartResponse, T as PageViewData, V as PayoutSchedule, W as PhoneLoginRequest, X as PhoneSendCodeRequest, Y as PhoneVerifyRequest, Z as Profile, _ as RefreshResponse, $ as RegisterRequest, a0 as ResetPasswordRequest, a1 as ScaleMuleApiError, a2 as ScaleMuleEnvironment, a3 as Session, a4 as SignedUploadCompleteRequest, a5 as SignedUploadRequest, a6 as SignedUploadResponse, a7 as SignedUploadUrl, a8 as StorageAdapter, a9 as StorageFile, aa as TrackEventResponse, ab as TransactionSummary, ac as UTMParams, ad as UpdateProfileRequest, ae as UploadOptions, af as UploadResponse, ag as VerifyEmailRequest } from './index-zQloSkpW.js';

/**
 * Tri-state file visibility — `'private' | 'app_public' | 'anonymous_visible'`.
 *
 * Locally redeclared here rather than imported from `@scalemule/sdk`
 * so this package can ship before the sdk's `Visibility` export is
 * published. Once `@scalemule/sdk` ≥ the version that exports
 * `Visibility` is the minimum dep version, swap this for an `import
 * type { Visibility } from '@scalemule/sdk'`.
 *
 * Keep the union members in lockstep with the storage migration's
 * ENUM and the SDK's typed export.
 */
type Visibility = 'private' | 'app_public' | 'anonymous_visible';
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
    /** Whether the resulting storage object is public-readable.
     * Derived from `visibility !== 'private'` for back-compat with
     * callers that still branch on the boolean. */
    is_public: boolean;
    /**
     * Resolved tri-state visibility from the storage service. Use this
     * over `is_public` for new code — `is_public: true` covers both
     * `'app_public'` (auth-gated CDN) and `'anonymous_visible'`
     * (unsigned public CDN), which have different delivery contracts.
     */
    visibility: Visibility;
    /**
     * Stable unsigned public-CDN URL — populated only when
     * `visibility === 'anonymous_visible'`. Drop directly into
     * `<img src>` on logged-out pages. For other visibilities use
     * `original_view_url` (signed) or the photo transform URL.
     */
    cdn_url: string | null;
}
/**
 * Per-app media-pipeline policy. Drives release-gating + processing
 * behavior. **Orthogonal to `is_public`.** See
 * `docs/MEDIA-UPLOADS.md` and ADR-2026-04-26 for the full taxonomy.
 *
 * Today's behavior (Phase 4 v1):
 *   - `fast_trusted` / `safe_visible` (default): upload promise resolves
 *     as soon as the file is uploaded + registered. The post-processing
 *     (scan, optimize, transcode) runs async; callers can observe via
 *     `useFileStatus`.
 *   - `safe_public` / `moderated`: upload promise *waits* for the
 *     optimized image variant (image MIME) or HLS playlist (video MIME)
 *     to become ready before resolving. Acts as the release-gate for
 *     UGC-style apps that should not publish raw bytes.
 *   - `compliance`: today behaves as `safe_public`; Phase 4+ adds the
 *     audit-log + signed-with-purpose URL semantics.
 */
type MediaPolicy = 'fast_trusted' | 'safe_visible' | 'safe_public' | 'moderated' | 'compliance';
interface UseMediaUploadOptions {
    /**
     * Tri-state visibility (preferred — see {@link Visibility} in
     * `@scalemule/sdk`). Three modes:
     *   - `'private'`           — owner + app members only (DEFAULT)
     *   - `'app_public'`        — readable by any authenticated end-user
     *                             in the same application; same semantics
     *                             the legacy `is_public: true` flag has
     *                             always had
     *   - `'anonymous_visible'` — world-readable on the unsigned public
     *                             CDN. Returned `cdn_url` is safe to drop
     *                             into `<img src>` on a logged-out page.
     *
     * If both `visibility` and `is_public` are passed, `visibility`
     * wins. `'anonymous_visible'` requires the operator to have
     * provisioned the anonymous-delivery bucket — the storage service
     * surfaces 503 `ANONYMOUS_DELIVERY_NOT_CONFIGURED` otherwise (the
     * SDK never silently demotes).
     */
    visibility?: Visibility;
    /**
     * Legacy two-state visibility flag. `true` → `app_public`; `false`
     * → `private`. Prefer the typed `visibility` field for new code —
     * `is_public: true` cannot express `anonymous_visible`.
     *
     * Default: `false` (private). Public is opt-in for surfaces that
     * genuinely need it (avatars, public listings). Chat / DM uploads
     * should always be private.
     */
    is_public?: boolean;
    /**
     * Per-call media-policy override. Defaults to `safe_visible` (visible
     * immediately at original fidelity; optimized variants swap in async).
     * Set to `safe_public` to make the upload promise *await* the optimized
     * variant (image) or HLS playlist (video) before resolving — useful for
     * broadcast / UGC apps that gate publication on processing complete.
     *
     * The per-app default lives in `application_storage_settings.media_policy`
     * (Phase 4 / P3, live in prod 2026-04-26). Reading the per-app default
     * into `useMedia` defaults lands in a follow-up; today the option is
     * caller-provided per call.
     */
    policy?: MediaPolicy;
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
    error: ApiError | null;
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
    /** Base SDK audio service — exposed for `useMedia()` and `audio.uploadViaStorage()` */
    audio: AudioService;
    /** Base SDK TTS service — exposed for `useTtsJob()` and direct narration requests */
    tts: TtsService;
    /**
     * Default media policy for `useMedia()` calls. Set via
     * `<ScaleMuleProvider mediaPolicy="…">`; per-call overrides win.
     * Undefined falls back to `useMedia()`'s built-in `safe_visible` default.
     */
    mediaPolicy?: MediaPolicy;
    /** Current authenticated user */
    user: User | null;
    /** Set the current user */
    setUser: (user: User | null) => void;
    /** Whether the SDK is initializing */
    initializing: boolean;
    /** Last error */
    error: ApiError$1 | null;
    /** Set error */
    setError: (error: ApiError$1 | null) => void;
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
    onAuthError?: (error: ApiError$1) => void;
    /** Server-evaluated flag values to bootstrap the client (eliminates loading flash) */
    bootstrapFlags?: Record<string, unknown>;
    /**
     * Default media-pipeline policy applied to `useMedia()` calls when no
     * per-call `policy` override is given. Five modes — see
     * `docs/MEDIA-UPLOADS.md` and the {@link import('./hooks/useMedia').MediaPolicy} type.
     *
     * The platform stores the per-app policy in
     * `application_storage_settings.media_policy` (Phase 4 / P3, live in
     * prod). On boot, the provider fetches `GET /v1/storage/policy` (a
     * lightweight `MemberOrEndUser` endpoint added in `@scalemule/sdk@0.0.45`)
     * and uses the returned policy as the effective default.
     *
     * Passing this prop overrides the auto-fetched value — useful for
     * tests or when an app needs to force a specific mode regardless of
     * platform config.
     */
    mediaPolicy?: MediaPolicy;
    /**
     * Member-auth bridge. When set, the provider runs in **member mode**:
     *
     *   - Skips the `/v1/auth/me` end-user lookup and the auth-proxy
     *     `/me` flow. Identity is owned upstream (e.g. `MemberAuthProvider`
     *     in `web/scalemule-app`).
     *   - Calls `getToken()` on mount and propagates the returned token
     *     to all three SDK clients (`client`, `baseClient`, `money`) as a
     *     `Bearer` Authorization header. Returning `null` clears the token.
     *   - Re-polls every {@link memberTokenPollMs} milliseconds (default
     *     60s) so cookie rotation in the host platform is picked up
     *     without a full page reload.
     *
     * Use {@link userResolver} alongside this prop to populate `user` from
     * a member-auth endpoint instead of `/v1/auth/me`.
     *
     * Mutually exclusive with `authProxyUrl`. If both are set, `getToken`
     * wins and the auth-proxy path is skipped.
     */
    getToken?: () => string | null | Promise<string | null>;
    /**
     * Resolves the `User` shown to the app in member-auth mode. The
     * provider calls this once after the initial token is set; the host
     * platform typically just returns its own `MemberProfile` mapped to
     * the SDK's `User` shape. Optional — if omitted, `user` stays `null`
     * and the host platform is responsible for surfacing identity.
     */
    userResolver?: () => Promise<User | null>;
    /**
     * Member-mode token poll interval in milliseconds. Default 60_000
     * (1 minute). Pass `null` to disable polling (only the mount-time
     * read happens).
     */
    memberTokenPollMs?: number | null;
}
declare function ScaleMuleProvider({ apiKey, applicationId, environment, gatewayUrl, debug, storage, analyticsProxyUrl, authProxyUrl, telemetryEndpoint, publishableKey, enableAccountSwitcher, accountSwitcherPrivacy, children, onLogin, onLogout, onAuthError, bootstrapFlags, mediaPolicy, getToken, userResolver, memberTokenPollMs, }: ScaleMuleProviderProps): react_jsx_runtime.JSX.Element;
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

interface AudioFile {
    audio_id: string;
    file_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    status: string;
    codec: string | null;
    bit_rate_kbps: number | null;
    duration_ms: number | null;
    created_at: string;
    original_view_url: string | null;
    transcoded_url: string | null;
    waveform_peaks?: unknown;
}
interface UseAudioUploadOptions {
    filename?: string;
    metadata?: Record<string, unknown>;
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
}
interface AudioUploadResult {
    file_id: string;
    audio_id: string | null;
    original_view_url: string | null;
    transcoded_url_promise: Promise<string | null>;
}
interface UseAudioReturn {
    upload: (file: File | Blob, opts?: UseAudioUploadOptions) => Promise<AudioUploadResult>;
    list: () => Promise<AudioFile[]>;
    remove: (fileId: string) => Promise<void>;
    error: ApiError | null;
    loading: boolean;
}
declare function useAudio(): UseAudioReturn;

interface UseTtsJobOptions {
    enabled?: boolean;
    pollIntervalMs?: number;
}
interface UseTtsJobReturn {
    job: TtsJobStatus | null;
    loading: boolean;
    error: ApiError | null;
    refresh: () => Promise<TtsJobStatus | null>;
}
declare function useTtsJob(jobId: string | null | undefined, options?: UseTtsJobOptions): UseTtsJobReturn;

/**
 * Conversation kinds recognized by the chat realtime channel naming scheme.
 * Matches `broadcast_to_conversation` in `ms/scalemule-chat/src/realtime.rs`.
 */
type ConversationKind = 'standard' | 'large_room' | 'broadcast' | 'support';
interface UseFileStatusOptions {
    /** Storage file_id to read status for. */
    fileId: string | null | undefined;
    /**
     * Optional poll interval in milliseconds. If set, the hook re-fetches
     * status every `pollIntervalMs` until scan goes clean. Useful for
     * non-chat surfaces or as a fallback alongside `conversationId` push.
     */
    pollIntervalMs?: number | null;
    /** Disable the hook (don't fetch). Useful when `fileId` is conditional. */
    disabled?: boolean;
    /**
     * Chat-surface push variant: subscribe to the conversation's realtime
     * channel and refresh when a `file_status_changed` event arrives for
     * `fileId`. Auth rides the existing per-conversation channel ACL.
     */
    conversationId?: string | null;
    /**
     * Conversation kind, controls the channel name prefix:
     *   - `standard` (default) → `conversation:{id}`
     *   - `large_room` → `conversation:lr:{id}`
     *   - `broadcast` → `conversation:bc:{id}`
     *   - `support` → `conversation:support:{id}`
     *
     * If you only have a `messageId`, look up the conversation first via
     * `client.chat.getMessage(messageId)` and pass the result here.
     */
    conversationKind?: ConversationKind;
}
interface UseFileStatusReturn {
    /** The latest status response, or null on first render / disabled. */
    status: FileStatus | null;
    /** True while a fetch is in flight. */
    loading: boolean;
    /** Last error, or null. */
    error: ApiError | null;
    /**
     * Convenience: scan is clean. For images/videos, this means the file
     * is *safe to render*; the optimized / HLS variants may still be
     * processing. The caller should attempt the constructed URLs and
     * fall back to `urls.original` if the pipeline-specific URL 404s.
     */
    isReady: boolean;
    /** Force-refresh the status. Promise resolves when the new state is committed. */
    refresh: () => Promise<void>;
}
/**
 * Subscribes to {@link FileStatus} for a single file.
 *
 * Three call shapes:
 *
 * 1. **Pull-only** — `useFileStatus({ fileId })` plus optional `pollIntervalMs`.
 *    One-shot fetch; useful for non-chat surfaces or static reads.
 *
 * 2. **Chat-surface push** — `useFileStatus({ fileId, conversationId, conversationKind? })`.
 *    Subscribes to the conversation channel and refreshes when
 *    `file_status_changed` arrives for this `fileId`. The chat service's
 *    media-status bridge fans photo/video lifecycle events into the per-conversation
 *    channel; the hook drops events for other files and dedupes against polling.
 *
 * 3. **Push + slow poll fallback** — combine `conversationId` with `pollIntervalMs`
 *    if you want belt-and-suspenders for environments where the websocket may drop.
 *
 * The `surface: 'profile'` push variant (private-user channel) is deferred until
 * the realtime SDK exposes private-channel subscription by user.
 *
 * @example Chat surface (push)
 * ```tsx
 * function ChatImage({ fileId, conversationId }: { fileId: string; conversationId: string }) {
 *   const { status, isReady } = useFileStatus({ fileId, conversationId });
 *   if (!isReady) return <div>Scanning…</div>;
 *   const src = status?.urls.optimized ?? status?.urls.original;
 *   return <img src={src} />;
 * }
 * ```
 *
 * @example Non-chat surface (pull + poll)
 * ```tsx
 * const { status, isReady } = useFileStatus({ fileId, pollIntervalMs: 2000 });
 * ```
 */
declare function useFileStatus(options: UseFileStatusOptions): UseFileStatusReturn;

interface ScaleMuleMediaProps {
    /** Storage `file_id` of the media to render. Required. */
    fileId: string;
    /** MIME type — drives which element to render. Required. */
    mimeType: string;
    /**
     * Optional sender-side optimistic preview. While the upload is in
     * progress (or the recipient hasn't yet observed the message), the
     * component renders this Blob URL. Once `useFileStatus` resolves a
     * scan-clean state and a server-side URL, the component swaps to it.
     */
    blobPreview?: string;
    /** Display width hint (CSS pixels). Used for image breakpoint selection. */
    width?: number;
    /** Display height hint (CSS pixels). */
    height?: number;
    /** Pass-through className for the rendered element. */
    className?: string;
    /** Pass-through style. */
    style?: React.CSSProperties;
    /** Alt text for `<img>`; aria-label for `<audio>` / `<video>`. */
    alt?: string;
    /**
     * Polling interval while waiting for the media pipeline to complete.
     *
     * Default behaviour:
     *   - With `conversationId` set: polling **off** (the realtime
     *     conversation channel pushes `file_status_changed` events;
     *     a poll loop on top would just be wasted requests).
     *   - Without `conversationId`: 2000ms.
     *
     * Override either way by passing a number (belt-and-suspenders if you
     * don't trust your websocket) or `null` (disable explicitly).
     * Polling stops automatically once both scan and any expected
     * pipeline (optimize / transcode) have settled.
     */
    pollIntervalMs?: number | null;
    /**
     * Chat-surface push: when set, the underlying `useFileStatus` hook
     * subscribes to the conversation's realtime channel and refreshes on
     * `file_status_changed` events for this `fileId`. See `useFileStatus`
     * docs for channel naming and bridge behaviour.
     */
    conversationId?: string | null;
    /**
     * Conversation kind, controls the channel name prefix
     * (`conversation:{id}` vs `conversation:lr|bc|support:{id}`).
     * Default is `'standard'`.
     */
    conversationKind?: ConversationKind;
    /**
     * Render a custom placeholder while waiting for scan / upload. Defaults
     * to a tiny "Loading…" div. Receives the current FileStatus (or null).
     */
    renderPlaceholder?: () => React.ReactNode;
    /**
     * Render the "blocked" UI when scan flips to `threat`. Defaults to a
     * "This file was blocked" message. Customize for branding.
     */
    renderBlocked?: () => React.ReactNode;
    /**
     * Custom render override. If provided, the component still calls
     * `useFileStatus` but yields rendering to this function. Useful for
     * highly custom presentation (e.g. lightbox triggers, hover overlays).
     */
    renderOverride?: (args: {
        src: string | null;
        state: 'preview' | 'pending' | 'ready' | 'blocked' | 'error';
    }) => React.ReactNode;
}
/**
 * Progressive-enhancement media renderer.
 *
 * Renders the right element for the given MIME type and progressively
 * upgrades the source URL as the media pipeline advances:
 *
 *   blob preview (if set) → original view URL → optimized variant (image)
 *                                            → HLS playlist (video)
 *
 * Today this is pull-only — `useFileStatus` polls until scan is clean
 * (and the caller can stop polling by passing `pollIntervalMs={null}`).
 * The push variant rides on the chat translation bridge (Phase 3 / P5')
 * and lights up automatically once that ships.
 *
 * For non-Safari browsers, HLS playback requires `hls.js` to be
 * available. The component dynamic-imports it on first need; if the
 * import fails (not installed), it falls back to the original-bytes URL.
 *
 * @example
 * ```tsx
 * <ScaleMuleMedia
 *   fileId={attachment.file_id}
 *   mimeType={attachment.mime_type}
 *   width={520}
 *   blobPreview={pendingPreviewUrl}
 *   alt={attachment.filename}
 * />
 * ```
 */
declare function ScaleMuleMedia(props: ScaleMuleMediaProps): React.ReactElement | null;

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
    error: ApiError$1 | null;
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
    error: ApiError$1 | null;
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
    error: ApiError$1 | null;
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

interface VoteState {
    /** Caller's current vote: 1 = upvote, -1 = downvote, 0 = no vote. */
    value: 1 | -1 | 0;
    up_count: number;
    down_count: number;
    score: number;
}
interface UseVoteOptions {
    /** Application-defined target type. e.g. "weekmob_post", "gistyo_gist". */
    targetType: string;
    targetId: string;
    /** Optional seed (from SSR or list query). */
    initialState?: VoteState | null;
    /** Refetch even when initialState is provided. Default false. */
    refetchOnMount?: boolean;
    /** Skip the initial fetch entirely (anonymous viewers). Default true. */
    enabled?: boolean;
}
interface UseVoteReturn {
    state: VoteState;
    isLoading: boolean;
    error: Error | null;
    /** Cast (or change/clear) the caller's vote with optimistic update. */
    cast: (value: 1 | -1 | 0) => Promise<void>;
    /** Refetch the canonical state from the server. */
    refetch: () => Promise<void>;
}
declare function useVote({ targetType, targetId, initialState, refetchOnMount, enabled, }: UseVoteOptions): UseVoteReturn;

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

interface VoteButtonClassNames {
    root?: string;
    upButton?: string;
    upButtonActive?: string;
    downButton?: string;
    downButtonActive?: string;
    score?: string;
    scorePositive?: string;
    scoreNegative?: string;
}
interface VoteButtonProps {
    targetType: string;
    targetId: string;
    /** Server-known initial state, e.g. seeded from a list query. */
    initialState?: VoteState | null;
    /** Visual layout. "horizontal" = up | score | down. "stacked" = column. */
    layout?: 'horizontal' | 'stacked';
    size?: 'compact' | 'regular';
    /** Called when an anonymous user clicks vote. */
    onSignInRequired?: () => void;
    onError?: (error: unknown) => void;
    classNames?: VoteButtonClassNames;
    upLabel?: string;
    downLabel?: string;
}
declare function VoteButton({ targetType, targetId, initialState, layout, size, onSignInRequired, onError, classNames, upLabel, downLabel, }: VoteButtonProps): react_jsx_runtime.JSX.Element;

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

export { ApiError$1 as ApiError, type AudioFile, type AudioUploadResult, type ConversationKind, type FeatureFlagEvaluation, type FeatureFlagEvaluation as FeatureFlagResult, type FeedbackItem, type FeedbackItemInput, type FeedbackPriority, type FeedbackStatus, type FeedbackType, FeedbackWidget, type FeedbackWidgetConfig, type FeedbackWidgetProps, ListFilesParams, LoginResponse, type MediaPolicy, type MediaUploadResult, type PasswordValidationResult, type PhoneCountry, type PhoneValidationResult, type RealtimeEvent, type RealtimeMessage, type RealtimeStatus, ScaleMuleClient, ScaleMuleConfig, ScaleMuleMedia, type ScaleMuleMediaProps, ScaleMuleProvider, type ScaleMuleProviderProps, UseAnalyticsOptions, UseAnalyticsReturn, type UseAudioReturn, type UseAudioUploadOptions, UseAuthReturn, UseBillingReturn, UseContentReturn, type UseFeatureFlagsOptions, type UseFeatureFlagsReturn, type UseFeedbackOptions, type UseFeedbackResult, type UseFileStatusOptions, type UseFileStatusReturn, type UseFeatureFlagsOptions as UseFlagsOptions, type UseFeatureFlagsReturn as UseFlagsReturn, type UseMediaReturn, type UseMediaUploadOptions, type UsePushNotificationsOptions, type UsePushNotificationsReturn, type UseRealtimeOptions, type UseRealtimeReturn, type UseShareOptions, type UseShareReturn, type UseTtsJobOptions, type UseTtsJobReturn, UseUserReturn, type UseVoteOptions, type UseVoteReturn, User, type UsernameValidationResult, VoteButton, type VoteButtonClassNames, type VoteButtonProps, type VoteState, composePhone, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAudio, useAuth, useBilling, useContent, useFeatureFlags, useFeedback, useFileStatus, useMedia, useMoney, useMoneyClient, usePushNotifications, useRealtime, useScaleMule, useScaleMuleClient, useShare, useTtsJob, useUser, useVote, validateForm, validators };
