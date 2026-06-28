import * as React from 'react';
import { createContext, useState, useEffect, useMemo, useCallback, useContext, useRef } from 'react';
import { createMoneyClient } from '@scalemule/money';
export { MoneyClient, createMoneyClient } from '@scalemule/money';
import { STORAGE_KEYS, ensureAnonymousId, ScaleMule, WebPushManager } from '@scalemule/sdk';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

// src/provider.tsx

// src/types/index.ts
var ScaleMuleApiError = class extends Error {
  constructor(error, status) {
    super(error.message);
    this.name = "ScaleMuleApiError";
    this.code = error.code;
    this.field = error.field;
    this.status = status;
  }
};

// src/client.ts
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
var SESSION_STORAGE_KEY = STORAGE_KEYS.SESSION;
var USER_ID_STORAGE_KEY = STORAGE_KEYS.USER_ID;
var WORKSPACE_STORAGE_KEY = STORAGE_KEYS.WORKSPACE_ID;
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getBackoffDelay(attempt, baseDelay = 1e3) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, 3e4);
}
function sanitizeFilename(filename) {
  let sanitized = filename.replace(/[\x00-\x1f\x7f]/g, "");
  sanitized = sanitized.replace(/["\\/\n\r]/g, "_").normalize("NFC").replace(/[\u200b-\u200f\ufeff\u2028\u2029]/g, "");
  if (!sanitized || sanitized.trim() === "") {
    sanitized = "unnamed";
  }
  if (sanitized.length > 200) {
    const ext = sanitized.split(".").pop();
    const base = sanitized.substring(0, 190);
    sanitized = ext ? `${base}.${ext}` : base;
  }
  return sanitized.trim();
}
var RateLimitQueue = class {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.rateLimitedUntil = 0;
    this.requestsInWindow = 0;
    this.windowStart = Date.now();
    this.maxRequestsPerWindow = 100;
    this.windowDurationMs = 6e4;
  }
  // 1 minute
  /**
   * Add request to queue
   */
  enqueue(execute, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute,
        resolve,
        reject,
        priority
      });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }
  /**
   * Process queued requests
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      if (now < this.rateLimitedUntil) {
        const waitTime = this.rateLimitedUntil - now;
        await sleep(waitTime);
      }
      if (now - this.windowStart >= this.windowDurationMs) {
        this.windowStart = now;
        this.requestsInWindow = 0;
      }
      if (this.requestsInWindow >= this.maxRequestsPerWindow) {
        const waitTime = this.windowDurationMs - (now - this.windowStart);
        await sleep(waitTime);
        this.windowStart = Date.now();
        this.requestsInWindow = 0;
      }
      const request = this.queue.shift();
      if (!request) continue;
      try {
        this.requestsInWindow++;
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        if (error instanceof ScaleMuleApiError && error.code === "RATE_LIMITED") {
          this.queue.unshift(request);
          this.rateLimitedUntil = Date.now() + 6e4;
        } else {
          request.reject(error);
        }
      }
    }
    this.processing = false;
  }
  /**
   * Update rate limit from response headers
   */
  updateFromHeaders(headers) {
    const retryAfter = headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        this.rateLimitedUntil = Date.now() + seconds * 1e3;
      }
    }
    const remaining = headers.get("X-RateLimit-Remaining");
    if (remaining) {
      const count = parseInt(remaining, 10);
      if (!isNaN(count) && count === 0) {
        const reset = headers.get("X-RateLimit-Reset");
        if (reset) {
          const resetTime = parseInt(reset, 10) * 1e3;
          if (!isNaN(resetTime)) {
            this.rateLimitedUntil = resetTime;
          }
        }
      }
    }
  }
  /**
   * Get queue length
   */
  get length() {
    return this.queue.length;
  }
  /**
   * Check if rate limited
   */
  get isRateLimited() {
    return Date.now() < this.rateLimitedUntil;
  }
};
var OfflineQueue = class {
  constructor(storage) {
    this.queue = [];
    this.storageKey = "scalemule_offline_queue";
    this.isOnline = true;
    this.onOnline = null;
    this.storage = storage;
    this.loadFromStorage();
    this.setupOnlineListener();
  }
  /**
   * Setup online/offline event listeners
   */
  setupOnlineListener() {
    if (typeof window === "undefined") return;
    this.isOnline = navigator.onLine;
    window.addEventListener("online", () => {
      this.isOnline = true;
      if (this.onOnline) this.onOnline();
    });
    window.addEventListener("offline", () => {
      this.isOnline = false;
    });
  }
  /**
   * Load queue from storage
   */
  async loadFromStorage() {
    try {
      const data = await this.storage.getItem(this.storageKey);
      if (data) {
        this.queue = JSON.parse(data);
      }
    } catch {
    }
  }
  /**
   * Save queue to storage
   */
  async saveToStorage() {
    try {
      await this.storage.setItem(this.storageKey, JSON.stringify(this.queue));
    } catch {
    }
  }
  /**
   * Add request to offline queue
   */
  async add(method, path, body) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      path,
      body: body ? JSON.stringify(body) : void 0,
      timestamp: Date.now()
    };
    this.queue.push(item);
    await this.saveToStorage();
  }
  /**
   * Get all queued requests
   */
  getAll() {
    return [...this.queue];
  }
  /**
   * Remove a request from queue
   */
  async remove(id) {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.saveToStorage();
  }
  /**
   * Clear all queued requests
   */
  async clear() {
    this.queue = [];
    await this.saveToStorage();
  }
  /**
   * Set callback for when coming back online
   */
  setOnlineCallback(callback) {
    this.onOnline = callback;
  }
  /**
   * Check if currently online
   */
  get online() {
    return this.isOnline;
  }
  /**
   * Get queue length
   */
  get length() {
    return this.queue.length;
  }
};
function resolveGatewayUrl(config) {
  if (config.gatewayUrl) {
    return config.gatewayUrl;
  }
  const env = config.environment || "prod";
  return GATEWAY_URLS[env];
}
function createDefaultStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key)
    };
  }
  const memoryStorage = /* @__PURE__ */ new Map();
  return {
    getItem: (key) => memoryStorage.get(key) ?? null,
    setItem: (key, value) => {
      memoryStorage.set(key, value);
    },
    removeItem: (key) => {
      memoryStorage.delete(key);
    }
  };
}
var ScaleMuleClient = class {
  constructor(config) {
    this.applicationId = null;
    this.sessionToken = null;
    this.userId = null;
    this.rateLimitQueue = null;
    this.offlineQueue = null;
    this.sessionGate = null;
    this.resolveSessionGate = null;
    this.workspaceId = null;
    // Anonymous visitor ID for identity linking. See `@scalemule/sdk/anonymous-id`
    // for the contract. The base SDK and this client share the same canonical
    // localStorage key so a visitor has exactly one ID across all packages.
    this.anonymousId = null;
    // Per-client single-flight cache for the lazy mint. Concurrent first-use
    // callers receive the same promise — without this, two simultaneous
    // unauthenticated requests on a fresh visitor could mint different IDs.
    // The shared helper also single-flights at the storage-adapter level.
    this.anonymousIdPromise = null;
    this.refreshPromise = null;
    this.apiKey = config.apiKey;
    this.applicationId = config.applicationId || null;
    this.gatewayUrl = resolveGatewayUrl(config);
    this.debug = config.debug || false;
    this.storage = config.storage || createDefaultStorage();
    this.enableRateLimitQueue = config.enableRateLimitQueue || false;
    this.enableOfflineQueue = config.enableOfflineQueue || false;
    this.onRefreshStart = config.onRefreshStart;
    this.onRefreshEnd = config.onRefreshEnd;
    this.onAutoRefreshFailed = config.onAutoRefreshFailed;
    if (this.enableRateLimitQueue) {
      this.rateLimitQueue = new RateLimitQueue();
    }
    if (this.enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue(this.storage);
      this.offlineQueue.setOnlineCallback(() => this.syncOfflineQueue());
    }
    if (config.pendingSessionInit) {
      this.setSessionPending();
    }
  }
  /**
   * Sync offline queue when coming back online
   */
  async syncOfflineQueue() {
    if (!this.offlineQueue) return;
    const items = this.offlineQueue.getAll();
    if (this.debug && items.length > 0) {
      console.log(`[ScaleMule] Syncing ${items.length} offline requests`);
    }
    for (const item of items) {
      try {
        await this.request(item.path, {
          method: item.method,
          body: item.body,
          skipRetry: true
        });
        await this.offlineQueue.remove(item.id);
      } catch (err) {
        if (this.debug) {
          console.error("[ScaleMule] Failed to sync offline request:", err);
        }
        break;
      }
    }
  }
  /**
   * Check if client is online
   */
  isOnline() {
    if (this.offlineQueue) {
      return this.offlineQueue.online;
    }
    return typeof navigator === "undefined" || navigator.onLine;
  }
  /**
   * Get number of pending offline requests
   */
  getOfflineQueueLength() {
    return this.offlineQueue?.length || 0;
  }
  /**
   * Get number of pending rate-limited requests
   */
  getRateLimitQueueLength() {
    return this.rateLimitQueue?.length || 0;
  }
  /**
   * Check if currently rate limited
   */
  isRateLimited() {
    return this.rateLimitQueue?.isRateLimited || false;
  }
  /**
   * Set the active workspace context. All subsequent requests will include
   * x-sm-workspace-id header. Pass null to clear.
   */
  setWorkspaceContext(id) {
    this.workspaceId = id;
    if (id) {
      this.storage.setItem(WORKSPACE_STORAGE_KEY, id);
    } else {
      this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }
  /**
   * Get the current workspace ID
   */
  getWorkspaceId() {
    return this.workspaceId;
  }
  /**
   * Get the gateway URL
   */
  getGatewayUrl() {
    return this.gatewayUrl;
  }
  /**
   * Get the application ID (required for realtime features)
   */
  getApplicationId() {
    return this.applicationId;
  }
  /**
   * Signal that a session is being established asynchronously.
   * API requests will wait until resolveSessionPending() is called.
   */
  setSessionPending() {
    if (!this.sessionGate) {
      this.sessionGate = new Promise((resolve) => {
        this.resolveSessionGate = resolve;
      });
    }
  }
  /**
   * Resolve the pending session gate, allowing queued API requests to proceed.
   * Must be called after setSessionPending(), whether session was established or not.
   */
  resolveSessionPending() {
    if (this.resolveSessionGate) {
      this.resolveSessionGate();
      this.resolveSessionGate = null;
      this.sessionGate = null;
    }
  }
  /**
   * Initialize client by loading persisted session
   */
  async initialize() {
    const token = await this.storage.getItem(SESSION_STORAGE_KEY);
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY);
    if (token) this.sessionToken = token;
    if (userId) this.userId = userId;
    const wsId = await this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (wsId) this.workspaceId = wsId;
    try {
      await this.ensureAnonymousId();
    } catch {
    }
    if (token) {
      this.resolveSessionPending();
    }
    if (this.debug) {
      console.log("[ScaleMule] Initialized with session:", !!token);
    }
  }
  /**
   * Sync accessor for the cached anonymous ID. Returns `null` until either
   * `initialize()` has run or `ensureAnonymousId()` has been awaited at
   * least once. Use `ensureAnonymousId()` if you need a guaranteed value.
   */
  getAnonymousId() {
    return this.anonymousId;
  }
  /**
   * Lazy-mint or cache-then-return the anonymous ID via the shared
   * `@scalemule/sdk` helper. Concurrent callers receive the same in-flight
   * promise, so a burst of simultaneous first-use requests all see the
   * same minted value.
   */
  async ensureAnonymousId() {
    if (this.anonymousId) return this.anonymousId;
    if (!this.anonymousIdPromise) {
      this.anonymousIdPromise = ensureAnonymousId(this.storage).then((id) => {
        this.anonymousId = id;
        return id;
      }).finally(() => {
        this.anonymousIdPromise = null;
      });
    }
    return this.anonymousIdPromise;
  }
  /**
   * Set session after login
   */
  async setSession(token, userId) {
    this.sessionToken = token;
    this.userId = userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
    if (this.debug) {
      console.log("[ScaleMule] Session set for user:", userId);
    }
  }
  /**
   * Token-only setter for member-auth surfaces.
   *
   * Unlike `setSession(token, userId)`, this does NOT persist a userId or
   * write to local storage — useful when the host platform owns identity
   * (e.g. ScaleMule's member dashboards use `MemberAuthProvider` and the
   * token comes from a `${env}_member_access_token` cookie). The token is
   * applied in-memory and used as a `Bearer` Authorization header on
   * subsequent requests.
   *
   * Pass `null` to clear without touching userId/storage.
   */
  setSessionToken(token) {
    this.sessionToken = token;
    if (this.debug) {
      console.log("[ScaleMule] Session token", token ? "set (token-only)" : "cleared (token-only)");
    }
  }
  /**
   * Clear session on logout
   */
  async clearSession() {
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    if (this.debug) {
      console.log("[ScaleMule] Session cleared");
    }
  }
  /**
   * Get current session token
   */
  getSessionToken() {
    return this.sessionToken;
  }
  /**
   * Get current user ID
   */
  getUserId() {
    return this.userId;
  }
  /**
   * Check if client has an active session
   */
  isAuthenticated() {
    return this.sessionToken !== null && this.userId !== null;
  }
  /**
   * Build headers for a request
   */
  buildHeaders(options) {
    const headers = new Headers(options?.headers);
    headers.set("x-api-key", this.apiKey);
    if (!options?.skipAuth && this.sessionToken) {
      headers.set("Authorization", `Bearer ${this.sessionToken}`);
    }
    if (this.workspaceId) {
      headers.set("x-sm-workspace-id", this.workspaceId);
    }
    if (!options?.skipAuth && !this.sessionToken && this.anonymousId) {
      headers.set("x-anonymous-id", this.anonymousId);
    }
    if (!headers.has("Content-Type") && options?.body && typeof options.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  }
  /**
   * Make an HTTP request to the ScaleMule API
   */
  async request(path, options = {}) {
    if (this.sessionGate) {
      await this.sessionGate;
    }
    if (!options.skipAuth && !this.sessionToken && !this.anonymousId) {
      try {
        await this.ensureAnonymousId();
      } catch {
      }
    }
    const url = `${this.gatewayUrl}${path}`;
    const headers = this.buildHeaders(options);
    const maxRetries = options.skipRetry ? 0 : options.retries ?? 2;
    const timeout = options.timeout || 3e4;
    if (this.debug) {
      console.log(`[ScaleMule] ${options.method || "GET"} ${path}`);
    }
    let lastError = null;
    const MAX_REFRESH_ATTEMPTS = 1;
    let refreshAttempts = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const rotatedToken = response.headers.get("x-rotated-session-token");
        if (rotatedToken && this.sessionToken && this.userId) {
          this.setSession(rotatedToken, this.userId);
        }
        const text = await response.text();
        let responseData = null;
        try {
          responseData = text ? JSON.parse(text) : null;
        } catch {
        }
        if (!response.ok) {
          const rawError = responseData?.error;
          const error = rawError && typeof rawError === "object" ? rawError : { code: `HTTP_${response.status}`, message: typeof rawError === "string" ? rawError : responseData?.message || text || response.statusText };
          if (response.status === 401 && this.sessionToken && !options.isAutoRefresh && refreshAttempts < MAX_REFRESH_ATTEMPTS) {
            refreshAttempts++;
            if (this.debug) console.log("[ScaleMule] 401 received, attempting auto-refresh...");
            if (!this.refreshPromise) {
              this.onRefreshStart?.();
              this.refreshPromise = this.post("/api/auth/refresh", {}, { isAutoRefresh: true });
            }
            try {
              await this.refreshPromise;
              if (this.debug) console.log("[ScaleMule] Auto-refresh succeeded, retrying original request...");
              attempt--;
              if (this.sessionToken) {
                headers.set("Authorization", `Bearer ${this.sessionToken}`);
              }
              continue;
            } catch (refreshErr) {
              if (this.debug) console.error("[ScaleMule] Auto-refresh failed:", refreshErr);
              const refreshApiError = refreshErr instanceof ScaleMuleApiError ? { code: refreshErr.code, message: refreshErr.message, field: refreshErr.field } : { code: "REFRESH_FAILED", message: "Auto-refresh failed" };
              this.onAutoRefreshFailed?.(refreshApiError);
              throw new ScaleMuleApiError(error);
            } finally {
              this.refreshPromise = null;
              this.onRefreshEnd?.();
            }
          }
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay(attempt);
            if (this.debug) {
              console.log(`[ScaleMule] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            }
            await sleep(delay);
            continue;
          }
          if (this.debug) {
            console.error("[ScaleMule] Request failed:", error);
          }
          throw new ScaleMuleApiError(error);
        }
        const data = responseData?.data !== void 0 ? responseData.data : responseData;
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof ScaleMuleApiError) {
          throw err;
        }
        const error = {
          code: err instanceof Error && err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
          message: err instanceof Error ? err.message : "Network request failed"
        };
        if (attempt < maxRetries) {
          lastError = error;
          const delay = getBackoffDelay(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Retrying after error in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          }
          await sleep(delay);
          continue;
        }
        if (this.debug) {
          console.error("[ScaleMule] Network error:", err);
        }
        throw new ScaleMuleApiError(error);
      }
    }
    throw new ScaleMuleApiError(lastError || { code: "UNKNOWN", message: "Request failed" });
  }
  /**
   * GET request
   */
  async get(path, options) {
    return this.request(path, { ...options, method: "GET" });
  }
  /**
   * POST request with JSON body
   */
  async post(path, body, options) {
    return this.request(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : void 0
    });
  }
  /**
   * PUT request with JSON body
   */
  async put(path, body, options) {
    return this.request(path, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : void 0
    });
  }
  /**
   * PATCH request with JSON body
   */
  async patch(path, body, options) {
    return this.request(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : void 0
    });
  }
  /**
   * DELETE request
   */
  async delete(path, options) {
    return this.request(path, { ...options, method: "DELETE" });
  }
  /**
   * Upload a file using multipart/form-data
   *
   * Automatically includes Authorization: Bearer header for user identity.
   * Supports progress callback via XMLHttpRequest when onProgress is provided.
   */
  async upload(path, file, additionalFields, options) {
    const sanitizedName = sanitizeFilename(file.name);
    const sanitizedFile = sanitizedName !== file.name ? new File([file], sanitizedName, { type: file.type }) : file;
    const formData = new FormData();
    formData.append("file", sanitizedFile);
    if (this.userId) {
      formData.append("sm_user_id", this.userId);
    }
    if (additionalFields) {
      for (const [key, value] of Object.entries(additionalFields)) {
        formData.append(key, value);
      }
    }
    const url = `${this.gatewayUrl}${path}`;
    if (this.debug) {
      console.log(`[ScaleMule] UPLOAD ${path}`);
    }
    if (options?.onProgress && typeof XMLHttpRequest !== "undefined") {
      return this.uploadWithProgress(url, formData, options.onProgress);
    }
    const maxRetries = options?.retries ?? 2;
    const headers = new Headers();
    headers.set("x-api-key", this.apiKey);
    if (this.sessionToken) {
      headers.set("Authorization", `Bearer ${this.sessionToken}`);
    }
    if (this.workspaceId) {
      headers.set("x-sm-workspace-id", this.workspaceId);
    }
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const retryFormData = attempt === 0 ? formData : new FormData();
        if (attempt > 0) {
          retryFormData.append("file", sanitizedFile);
          if (this.userId) {
            retryFormData.append("sm_user_id", this.userId);
          }
          if (additionalFields) {
            for (const [key, value] of Object.entries(additionalFields)) {
              retryFormData.append(key, value);
            }
          }
        }
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: retryFormData
        });
        const uploadText = await response.text();
        let responseData = null;
        try {
          responseData = uploadText ? JSON.parse(uploadText) : null;
        } catch {
        }
        if (!response.ok) {
          const error = responseData?.error || {
            code: `HTTP_${response.status}`,
            message: responseData?.message || uploadText || response.statusText
          };
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay(attempt);
            if (this.debug) {
              console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
            }
            await sleep(delay);
            continue;
          }
          throw new ScaleMuleApiError(error);
        }
        const data = responseData?.data !== void 0 ? responseData.data : responseData;
        return data;
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          throw err;
        }
        lastError = {
          code: "UPLOAD_ERROR",
          message: err instanceof Error ? err.message : "Upload failed"
        };
        if (attempt < maxRetries) {
          const delay = getBackoffDelay(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms (network error)`);
          }
          await sleep(delay);
          continue;
        }
      }
    }
    throw new ScaleMuleApiError(lastError || { code: "UPLOAD_ERROR", message: "Upload failed after retries" });
  }
  /**
   * Upload with progress using XMLHttpRequest (with retry)
   */
  async uploadWithProgress(url, formData, onProgress, maxRetries = 2) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.singleUploadWithProgress(url, formData, onProgress);
      } catch (err) {
        if (!(err instanceof ScaleMuleApiError)) {
          throw err;
        }
        const errorCode = err.code;
        const isNetworkError = errorCode === "UPLOAD_ERROR" || errorCode === "NETWORK_ERROR";
        const isRetryableHttp = errorCode.startsWith("HTTP_") && RETRYABLE_STATUS_CODES.has(parseInt(errorCode.replace("HTTP_", ""), 10));
        if (attempt < maxRetries && (isNetworkError || isRetryableHttp)) {
          lastError = { code: err.code, message: err.message };
          const delay = getBackoffDelay(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          }
          await sleep(delay);
          onProgress(0);
          continue;
        }
        throw err;
      }
    }
    throw new ScaleMuleApiError(lastError || { code: "UPLOAD_ERROR", message: "Upload failed after retries" });
  }
  /**
   * Single upload attempt with progress using XMLHttpRequest
   */
  singleUploadWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const progress = Math.round(event.loaded / event.total * 100);
          onProgress(progress);
        }
      });
      xhr.addEventListener("load", () => {
        try {
          let data = null;
          try {
            data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          } catch {
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            const unwrapped = data?.data !== void 0 ? data.data : data;
            resolve(unwrapped);
          } else {
            reject(new ScaleMuleApiError(data?.error || {
              code: `HTTP_${xhr.status}`,
              message: data?.message || xhr.responseText || "Upload failed"
            }));
          }
        } catch {
          reject(new ScaleMuleApiError({ code: "PARSE_ERROR", message: "Failed to parse response" }));
        }
      });
      xhr.addEventListener("error", () => {
        reject(new ScaleMuleApiError({ code: "UPLOAD_ERROR", message: "Upload failed" }));
      });
      xhr.addEventListener("abort", () => {
        reject(new ScaleMuleApiError({ code: "UPLOAD_ABORTED", message: "Upload cancelled" }));
      });
      xhr.open("POST", url);
      xhr.setRequestHeader("x-api-key", this.apiKey);
      if (this.sessionToken) {
        xhr.setRequestHeader("Authorization", `Bearer ${this.sessionToken}`);
      }
      if (this.workspaceId) {
        xhr.setRequestHeader("x-sm-workspace-id", this.workspaceId);
      }
      xhr.send(formData);
    });
  }
};
function createClient(config) {
  return new ScaleMuleClient(config);
}

// src/sdk-telemetry.ts
var endpoint;
function setSdkTelemetryEndpoint(url) {
  endpoint = url;
}
function reportSdkError(payload) {
  if (!endpoint) return;
  if (typeof fetch === "undefined") return;
  const body = JSON.stringify({
    logs: [
      {
        message: `${payload.code}: ${payload.message}`,
        metadata: {
          name: payload.code,
          source: "scalemule-sdk",
          kind: "sdk",
          op: payload.op,
          status: payload.status ?? null,
          path: payload.path ?? null,
          field: payload.field ?? null,
          route: typeof window !== "undefined" ? window.location.pathname : null
        },
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      }
    ]
  });
  try {
    void fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin"
    }).catch(() => {
    });
  } catch {
  }
}
var USER_CACHE_KEY = "scalemule_user";
function getCachedUser() {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(USER_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}
function setCachedUser(user) {
  if (typeof window === "undefined") return;
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {
  }
}
var ScaleMuleContext = createContext(null);
function ScaleMuleProvider({
  apiKey,
  applicationId,
  environment,
  gatewayUrl,
  debug,
  storage,
  analyticsProxyUrl,
  authProxyUrl,
  telemetryEndpoint,
  publishableKey,
  enableAccountSwitcher,
  accountSwitcherPrivacy,
  children,
  onLogin,
  onLogout,
  onAuthError,
  bootstrapFlags,
  mediaPolicy,
  getToken,
  userResolver,
  memberTokenPollMs
}) {
  const memberMode = typeof getToken === "function";
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    setSdkTelemetryEndpoint(telemetryEndpoint);
    return () => setSdkTelemetryEndpoint(void 0);
  }, [telemetryEndpoint]);
  const resolvedGatewayUrl = gatewayUrl || (environment === "dev" ? "https://api-dev.scalemule.com" : "https://api.scalemule.com");
  const client = useMemo(
    () => createClient({
      apiKey,
      applicationId,
      environment,
      gatewayUrl: resolvedGatewayUrl,
      debug,
      storage,
      // Make outbound API calls wait for the first token to land in any
      // mode where the provider is responsible for populating the
      // session asynchronously: auth-proxy fetch, or member-mode
      // getToken() callback. Resolved in the init effect below.
      pendingSessionInit: !!authProxyUrl || memberMode
    }),
    [apiKey, applicationId, environment, resolvedGatewayUrl, debug, storage, authProxyUrl, memberMode]
  );
  const money = useMemo(
    () => createMoneyClient({
      apiKey,
      gatewayUrl: resolvedGatewayUrl,
      environment,
      accessToken: client.getSessionToken() || void 0,
      fetch: globalThis.fetch.bind(globalThis)
    }),
    [apiKey, resolvedGatewayUrl, environment, client]
  );
  const baseClient = useMemo(() => {
    return new ScaleMule({
      apiKey,
      applicationId,
      baseUrl: resolvedGatewayUrl,
      environment,
      debug
    });
  }, [apiKey, applicationId, environment, resolvedGatewayUrl, debug]);
  const [fetchedPolicy, setFetchedPolicy] = useState(void 0);
  const [tokenVersion, setTokenVersion] = useState(0);
  useEffect(() => {
    if (mediaPolicy) return;
    if (memberMode && tokenVersion === 0) return;
    let mounted = true;
    void (async () => {
      try {
        const fn = baseClient.storage.getPolicy;
        if (typeof fn !== "function") return;
        const r = await fn.call(baseClient.storage);
        if (!mounted) return;
        const v = r?.data?.media_policy;
        if (v === "fast_trusted" || v === "safe_visible" || v === "safe_public" || v === "moderated" || v === "compliance") {
          setFetchedPolicy(v);
        }
      } catch {
      }
    })();
    return () => {
      mounted = false;
    };
  }, [baseClient, mediaPolicy, memberMode, tokenVersion]);
  const effectiveMediaPolicy = mediaPolicy ?? fetchedPolicy;
  useEffect(() => {
    const token = client.getSessionToken();
    if (token) {
      baseClient.setAccessToken(token);
      money.setAccessToken(token);
    } else {
      baseClient.clearAccessToken();
      money.setAccessToken(void 0);
    }
  }, [client, baseClient, money, user]);
  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        await client.initialize();
        const cachedUser = getCachedUser();
        if (memberMode) {
          try {
            const token = await Promise.resolve(getToken()) ?? null;
            if (mounted) {
              if (token) {
                client.setSessionToken(token);
                baseClient.setAccessToken(token);
                money.setAccessToken(token);
              } else {
                client.setSessionToken(null);
                baseClient.clearAccessToken();
                money.setAccessToken(void 0);
              }
              setTokenVersion((v) => v + 1);
            }
            if (userResolver) {
              try {
                const resolvedUser = await userResolver();
                if (mounted) {
                  setUser(resolvedUser);
                  setCachedUser(resolvedUser);
                }
              } catch (resolveErr) {
                if (mounted && debug) {
                  console.debug("[ScaleMule] userResolver() failed:", resolveErr);
                }
              }
            }
          } catch (memberErr) {
            if (mounted && debug) {
              console.debug("[ScaleMule] getToken() failed:", memberErr);
            }
          } finally {
            client.resolveSessionPending();
          }
          return;
        }
        if (authProxyUrl) {
          if (cachedUser && mounted) {
            setUser(cachedUser);
            setInitializing(false);
          }
          try {
            const response = await fetch(`${authProxyUrl}/me`, {
              credentials: "include"
            });
            const data = await response.json();
            if (mounted) {
              if (data.success && data.data?.user) {
                setUser(data.data.user);
                setCachedUser(data.data.user);
                if (data.data.sessionToken) {
                  await client.setSession(data.data.sessionToken, data.data.userId || "");
                }
              } else {
                setUser(null);
                setCachedUser(null);
              }
            }
          } catch {
            if (mounted) {
              setUser(null);
              setCachedUser(null);
              if (debug) {
                console.debug("[ScaleMule] Auth proxy session check failed; clearing cached user");
              }
            }
          } finally {
            client.resolveSessionPending();
          }
        } else if (client.isAuthenticated()) {
          if (cachedUser && mounted) {
            setUser(cachedUser);
            setInitializing(false);
          }
          try {
            const userData = await client.get("/v1/auth/me");
            if (mounted) {
              setUser(userData);
              setCachedUser(userData);
            }
          } catch (authErr) {
            if (mounted) {
              setUser(null);
              setCachedUser(null);
              await client.clearSession();
              if (onAuthError && authErr && typeof authErr === "object" && "code" in authErr) {
                onAuthError(authErr);
              }
            }
          }
        } else if (cachedUser) {
          setCachedUser(null);
        }
      } catch (err) {
        if (mounted && debug) {
          console.error("[ScaleMule] Initialization error:", err);
        }
      } finally {
        if (mounted) {
          setInitializing(false);
        }
      }
    }
    initialize();
    return () => {
      mounted = false;
    };
  }, [client, baseClient, money, debug, onAuthError, authProxyUrl, memberMode, getToken, userResolver]);
  useEffect(() => {
    if (!memberMode) return;
    if (memberTokenPollMs === null) return;
    const interval = memberTokenPollMs ?? 6e4;
    if (interval <= 0) return;
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const token = await Promise.resolve(getToken()) ?? null;
        if (cancelled) return;
        const current = client.getSessionToken();
        if (token === current) return;
        if (token) {
          client.setSessionToken(token);
          baseClient.setAccessToken(token);
          money.setAccessToken(token);
        } else {
          client.setSessionToken(null);
          baseClient.clearAccessToken();
          money.setAccessToken(void 0);
          if (debug) {
            console.debug("[ScaleMule] Member token cleared on refresh");
          }
        }
        setTokenVersion((v) => v + 1);
      } catch (err) {
        if (debug) {
          console.debug("[ScaleMule] Member token refresh failed:", err);
        }
      }
    }, interval);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [memberMode, memberTokenPollMs, getToken, client, baseClient, money, debug]);
  const handleSetUser = useCallback(
    (newUser) => {
      setUser(newUser);
      setCachedUser(newUser);
      if (newUser === null && onLogout) {
        onLogout();
      }
    },
    [onLogout]
  );
  const value = useMemo(
    () => ({
      client,
      money,
      realtime: baseClient.realtime,
      storage: baseClient.storage,
      photo: baseClient.photo,
      video: baseClient.video,
      audio: baseClient.audio,
      media: baseClient.media,
      tts: baseClient.tts,
      social: baseClient.social,
      socialPolicy: baseClient.socialPolicy,
      mediaPolicy: effectiveMediaPolicy,
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      apiKey,
      gatewayUrl: resolvedGatewayUrl,
      environment: environment || void 0,
      enableAccountSwitcher,
      accountSwitcherPrivacy,
      bootstrapFlags
    }),
    [client, money, baseClient, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, apiKey, resolvedGatewayUrl, environment, enableAccountSwitcher, accountSwitcherPrivacy, bootstrapFlags, effectiveMediaPolicy]
  );
  return /* @__PURE__ */ jsx(ScaleMuleContext.Provider, { value, children });
}
function useScaleMule() {
  const context = useContext(ScaleMuleContext);
  if (!context) {
    throw new Error(
      "useScaleMule must be used within a ScaleMuleProvider. Make sure to wrap your app with <ScaleMuleProvider>."
    );
  }
  return context;
}
function useScaleMuleClient() {
  const { client } = useScaleMule();
  return client;
}
function useMoneyClient() {
  const { money } = useScaleMule();
  return money;
}
function maskEmail(email) {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.***";
  const tldDot = domain.lastIndexOf(".");
  const tld = tldDot > 0 ? domain.slice(tldDot) : "";
  const domainBase = tldDot > 0 ? domain.slice(0, tldDot) : domain;
  return `${local[0] || "*"}***@${domainBase[0] || "*"}***${tld}`;
}
function stableColorIndex(userId) {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i) | 0;
  }
  return Math.abs(hash) % 8;
}
function applyClientPrivacy(entry, privacy) {
  if (!privacy || privacy === "full") return entry;
  if (privacy === "masked") {
    return {
      userId: entry.userId,
      email: entry.email ? maskEmail(entry.email) : void 0,
      fullName: entry.fullName ? `${entry.fullName[0].toUpperCase()}.` : void 0,
      provider: entry.provider,
      lastActiveAt: entry.lastActiveAt,
      colorIndex: stableColorIndex(entry.userId)
    };
  }
  return {
    userId: entry.userId,
    provider: entry.provider,
    lastActiveAt: entry.lastActiveAt,
    displayLabel: "Account",
    colorIndex: stableColorIndex(entry.userId)
  };
}
function getCookie(name) {
  if (typeof document === "undefined") return void 0;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
}
var browserStorage = typeof window !== "undefined" && typeof window.localStorage !== "undefined" ? {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key)
} : null;
async function getProxyAnonymousId() {
  if (!browserStorage) return void 0;
  try {
    return await ensureAnonymousId(browserStorage);
  } catch {
    return void 0;
  }
}
async function proxyFetch(proxyUrl, path, options = {}) {
  const method = options.method || "POST";
  const headers = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCookie("sm_csrf");
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
  }
  const anonymousId = await getProxyAnonymousId();
  if (anonymousId) {
    headers["x-anonymous-id"] = anonymousId;
  }
  const response = await fetch(`${proxyUrl}/${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : void 0,
    credentials: "include"
    // Include cookies for session management
  });
  const data = await response.json();
  if (data && data.error && !(data.error instanceof ScaleMuleApiError)) {
    data.error = new ScaleMuleApiError(data.error, response.status);
  }
  if (data && data.success === false && data.error) {
    reportSdkError({
      code: data.error.code,
      message: data.error.message,
      status: response.status,
      op: path,
      path: `${proxyUrl}/${path}`,
      field: data.error.field
    });
  }
  return data;
}
function useAuth() {
  const { client, user, setUser, initializing, error, setError, authProxyUrl, enableAccountSwitcher, accountSwitcherPrivacy } = useScaleMule();
  const register = useCallback(
    async (data) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(
          authProxyUrl,
          "register",
          { body: data }
        );
        if (!response.success || !response.data) {
          const err = response.error || {
            code: "REGISTER_FAILED",
            message: "Registration failed"
          };
          setError(err);
          throw err;
        }
        if (response.data.sessionToken) {
          await client.setSession(response.data.sessionToken, response.data.userId || response.data.user?.id || "");
        }
        if (response.data.user) {
          setUser(response.data.user);
        }
        return response.data.user;
      }
      try {
        return await client.post("/v1/auth/register", data);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setUser, setError, authProxyUrl]
  );
  const login = useCallback(
    async (data) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(
          authProxyUrl,
          "login",
          { body: data }
        );
        if (!response.success || !response.data) {
          const err = response.error || {
            code: "LOGIN_FAILED",
            message: "Login failed"
          };
          setError(err);
          throw err;
        }
        if ("requires_mfa" in response.data && response.data.requires_mfa) {
          return response.data;
        }
        const loginData2 = response.data;
        const responseUser = "user" in loginData2 ? loginData2.user : null;
        if (responseUser) {
          setUser(responseUser);
        }
        const sessionToken = "sessionToken" in loginData2 ? loginData2.sessionToken : void 0;
        const userId = "userId" in loginData2 ? loginData2.userId : void 0;
        if (sessionToken) {
          await client.setSession(sessionToken, userId || responseUser?.id || "");
        }
        return response.data;
      }
      let loginResult;
      try {
        loginResult = await client.post("/v1/auth/login", data);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      if ("requires_mfa" in loginResult && loginResult.requires_mfa) {
        return loginResult;
      }
      const loginData = loginResult;
      await client.setSession(loginData.session_token, loginData.user.id);
      setUser(loginData.user);
      return loginData;
    },
    [client, setUser, setError, authProxyUrl]
  );
  const logout = useCallback(async () => {
    setError(null);
    if (authProxyUrl) {
      try {
        await proxyFetch(authProxyUrl, "logout");
      } catch {
      }
      setUser(null);
      return;
    }
    const sessionToken = client.getSessionToken();
    if (sessionToken) {
      try {
        await client.post("/v1/auth/logout", { session_token: sessionToken });
      } catch {
      }
    }
    await client.clearSession();
    setUser(null);
  }, [client, setUser, setError, authProxyUrl]);
  const forgotPassword = useCallback(
    async (email) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, "forgot-password", { body: { email } });
        if (!response.success) {
          const err = response.error || {
            code: "FORGOT_PASSWORD_FAILED",
            message: "Failed to send password reset email"
          };
          setError(err);
          throw err;
        }
      } else {
        try {
          await client.post("/v1/auth/forgot-password", { email });
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err);
          }
          throw err;
        }
      }
    },
    [client, setError, authProxyUrl]
  );
  const resetPassword = useCallback(
    async (token, newPassword) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, "reset-password", { body: { token, new_password: newPassword } });
        if (!response.success) {
          const err = response.error || {
            code: "RESET_PASSWORD_FAILED",
            message: "Failed to reset password"
          };
          setError(err);
          throw err;
        }
      } else {
        try {
          await client.post("/v1/auth/reset-password", { token, new_password: newPassword });
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err);
          }
          throw err;
        }
      }
    },
    [client, setError, authProxyUrl]
  );
  const verifyEmail = useCallback(
    async (token) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, "verify-email", { body: { token } });
        if (!response.success) {
          const err = response.error || {
            code: "VERIFY_EMAIL_FAILED",
            message: "Failed to verify email"
          };
          setError(err);
          throw err;
        }
      } else {
        try {
          const result = await client.post("/v1/auth/verify-email", { token });
          if (result?.session_token && result?.user) {
            await client.setSession(result.session_token, result.user.id);
            setUser(result.user);
          }
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err);
          }
          throw err;
        }
      }
      if (authProxyUrl) {
        const userResponse = await proxyFetch(
          authProxyUrl,
          "me",
          { method: "GET" }
        );
        if (userResponse.success && userResponse.data?.user) {
          setUser(userResponse.data.user);
          if (userResponse.data.sessionToken) {
            await client.setSession(userResponse.data.sessionToken, userResponse.data.userId || userResponse.data.user.id);
          }
        }
      } else {
        try {
          const userData = await client.get("/v1/auth/me");
          setUser(userData);
        } catch {
        }
      }
    },
    [client, setUser, setError, authProxyUrl]
  );
  const resendVerification = useCallback(async (email) => {
    setError(null);
    if (authProxyUrl) {
      const body = email ? { email } : user ? {} : void 0;
      const response = await proxyFetch(authProxyUrl, "resend-verification", { body });
      if (!response.success) {
        const err = response.error || {
          code: "RESEND_FAILED",
          message: "Failed to resend verification email"
        };
        setError(err);
        throw err;
      }
    } else {
      if (!user && !email) {
        const err = {
          code: "NOT_AUTHENTICATED",
          message: "Must be logged in or provide email to resend verification"
        };
        throw err;
      }
      try {
        if (email && !user) {
          await client.post("/v1/auth/resend-verification", { email });
        } else {
          await client.post("/v1/auth/resend-verification");
        }
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    }
  }, [client, user, setError, authProxyUrl]);
  const refreshSession = useCallback(async () => {
    setError(null);
    if (authProxyUrl) {
      const response = await proxyFetch(
        authProxyUrl,
        "refresh"
      );
      if (!response.success) {
        setUser(null);
        const err = response.error || {
          code: "REFRESH_FAILED",
          message: "Session expired"
        };
        setError(err);
        throw err;
      }
      if (response.data?.user) {
        setUser(response.data.user);
      }
      return;
    }
    const sessionToken = client.getSessionToken();
    if (!sessionToken) {
      const err = {
        code: "NO_SESSION",
        message: "No active session to refresh"
      };
      setError(err);
      throw err;
    }
    try {
      const refreshData = await client.post(
        "/v1/auth/refresh",
        { session_token: sessionToken }
      );
      const userId = client.getUserId();
      if (userId) {
        await client.setSession(refreshData.session_token, userId);
      }
    } catch (err) {
      await client.clearSession();
      setUser(null);
      if (err instanceof ScaleMuleApiError) {
        setError(err);
      }
      throw err;
    }
  }, [client, setUser, setError, authProxyUrl]);
  const startOAuth = useCallback(
    async (config) => {
      setError(null);
      let oauthData;
      try {
        oauthData = await client.post("/v1/auth/oauth/start", {
          provider: config.provider,
          redirect_url: config.redirectUrl,
          scopes: config.scopes,
          state: config.state
        });
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("scalemule_oauth_state", oauthData.state);
      }
      return oauthData;
    },
    [client, setError]
  );
  const completeOAuth = useCallback(
    async (request) => {
      setError(null);
      if (typeof sessionStorage !== "undefined") {
        const storedState = sessionStorage.getItem("scalemule_oauth_state");
        if (storedState && storedState !== request.state) {
          const err = {
            code: "OAUTH_STATE_MISMATCH",
            message: "OAuth state mismatch - possible CSRF attack"
          };
          setError(err);
          throw err;
        }
        sessionStorage.removeItem("scalemule_oauth_state");
      }
      let callbackData;
      try {
        callbackData = await client.post("/v1/auth/oauth/callback", request);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      await client.setSession(callbackData.session_token, callbackData.user.id);
      setUser(callbackData.user);
      return callbackData;
    },
    [client, setUser, setError]
  );
  const getLinkedAccounts = useCallback(async () => {
    setError(null);
    try {
      const data = await client.get("/v1/auth/oauth/providers");
      return data.providers;
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        setError(err);
      }
      throw err;
    }
  }, [client, setError]);
  const linkAccount = useCallback(
    async (_config) => {
      setError(null);
      if (!user) {
        const err2 = {
          code: "NOT_AUTHENTICATED",
          message: "Must be logged in to link accounts"
        };
        setError(err2);
        throw err2;
      }
      const err = {
        code: "NOT_IMPLEMENTED",
        message: "OAuth account linking from a logged-in session is not yet supported. Use the standard OAuth sign-in flow instead."
      };
      setError(err);
      throw err;
    },
    [user, setError]
  );
  const unlinkAccount = useCallback(
    async (provider) => {
      setError(null);
      try {
        await client.delete(`/v1/auth/oauth/providers/${encodeURIComponent(provider)}`);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setError]
  );
  const getMFAStatus = useCallback(async () => {
    setError(null);
    try {
      return await client.get("/v1/auth/mfa/status");
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        setError(err);
      }
      throw err;
    }
  }, [client, setError]);
  const setupMFA = useCallback(
    async (request) => {
      setError(null);
      try {
        return await client.post(
          "/v1/auth/mfa/setup",
          request
        );
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setError]
  );
  const verifyMFA = useCallback(
    async (request) => {
      setError(null);
      try {
        await client.post("/v1/auth/mfa/verify", request);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setError]
  );
  const completeMFAChallenge = useCallback(
    async (challengeToken, code, method) => {
      setError(null);
      let mfaResult;
      try {
        mfaResult = await client.post("/v1/auth/mfa/challenge", {
          challenge_token: challengeToken,
          code,
          method
        });
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      await client.setSession(mfaResult.session_token, mfaResult.user.id);
      setUser(mfaResult.user);
      return mfaResult;
    },
    [client, setUser, setError]
  );
  const disableMFA = useCallback(
    async (password) => {
      setError(null);
      try {
        await client.post("/v1/auth/mfa/disable", { password });
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setError]
  );
  const regenerateBackupCodes = useCallback(
    async (password) => {
      setError(null);
      try {
        const data = await client.post("/v1/auth/mfa/backup-codes", {
          password
        });
        return data.backup_codes;
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
    },
    [client, setError]
  );
  const sendPhoneCode = useCallback(
    async (request) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, "phone/send-code", { body: request });
        if (!response.success) {
          const err = response.error || {
            code: "SEND_CODE_FAILED",
            message: "Failed to send verification code"
          };
          setError(err);
          throw err;
        }
      } else {
        try {
          await client.post("/v1/auth/phone/send-code", request);
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err);
          }
          throw err;
        }
      }
    },
    [client, setError, authProxyUrl]
  );
  const verifyPhone = useCallback(
    async (request) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(authProxyUrl, "phone/verify", { body: request });
        if (!response.success) {
          const err = response.error || {
            code: "VERIFY_PHONE_FAILED",
            message: "Failed to verify phone number"
          };
          setError(err);
          throw err;
        }
      } else {
        try {
          await client.post("/v1/auth/phone/verify", request);
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            setError(err);
          }
          throw err;
        }
      }
      if (user) {
        if (authProxyUrl) {
          const userResponse = await proxyFetch(authProxyUrl, "me", { method: "GET" });
          if (userResponse.success && userResponse.data?.user) {
            setUser(userResponse.data.user);
          }
        } else {
          try {
            const userData = await client.get("/v1/auth/me");
            setUser(userData);
          } catch {
          }
        }
      }
    },
    [client, user, setUser, setError, authProxyUrl]
  );
  const loginWithPhone = useCallback(
    async (request) => {
      setError(null);
      if (authProxyUrl) {
        const response = await proxyFetch(
          authProxyUrl,
          "phone/login",
          { body: request }
        );
        if (!response.success || !response.data) {
          const err = response.error || {
            code: "PHONE_LOGIN_FAILED",
            message: "Failed to login with phone"
          };
          setError(err);
          throw err;
        }
        const loginData = response.data;
        const responseUser = "user" in loginData ? loginData.user : null;
        if (responseUser) {
          setUser(responseUser);
        }
        const sessionToken = "sessionToken" in loginData ? loginData.sessionToken : void 0;
        const userId = "userId" in loginData ? loginData.userId : void 0;
        if (sessionToken) {
          await client.setSession(sessionToken, userId || responseUser?.id || "");
        }
        return response.data;
      }
      let phoneLoginData;
      try {
        phoneLoginData = await client.post("/v1/auth/phone/login", request);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      await client.setSession(phoneLoginData.session_token, phoneLoginData.user.id);
      setUser(phoneLoginData.user);
      return phoneLoginData;
    },
    [client, setUser, setError, authProxyUrl]
  );
  const readKnownAccountsCookie = useCallback(() => {
    if (!enableAccountSwitcher) return [];
    if (typeof document === "undefined") return [];
    const match = document.cookie.match(/(?:^|; )sm_known_accounts=([^;]*)/);
    if (!match) return [];
    try {
      const decoded = decodeURIComponent(match[1]);
      const accounts = JSON.parse(decoded);
      let entries = Object.values(accounts);
      if (accountSwitcherPrivacy && accountSwitcherPrivacy !== "full") {
        entries = entries.map((e) => applyClientPrivacy(e, accountSwitcherPrivacy));
      }
      return entries;
    } catch {
      return [];
    }
  }, [enableAccountSwitcher, accountSwitcherPrivacy]);
  const [knownAccounts, setKnownAccounts] = useState([]);
  useEffect(() => {
    setKnownAccounts(readKnownAccountsCookie());
  }, [readKnownAccountsCookie, user]);
  const switchAccount = useCallback(
    async (userId) => {
      const target = knownAccounts.find((a) => a.userId === userId) || null;
      if (!target) return null;
      if (authProxyUrl) {
        await proxyFetch(authProxyUrl, "switch-account");
      } else {
        const sessionToken = client.getSessionToken();
        if (sessionToken) {
          try {
            await client.post("/v1/auth/logout", { session_token: sessionToken });
          } catch {
          }
        }
        await client.clearSession();
      }
      setUser(null);
      return target;
    },
    [client, setUser, knownAccounts, authProxyUrl]
  );
  const removeKnownAccount = useCallback(
    async (userId) => {
      if (authProxyUrl) {
        await proxyFetch(authProxyUrl, "forget-account", { body: { user_id: userId } });
      }
      setKnownAccounts((prev) => prev.filter((a) => a.userId !== userId));
    },
    [authProxyUrl]
  );
  const clearKnownAccounts = useCallback(async () => {
    if (authProxyUrl) {
      await proxyFetch(authProxyUrl, "forget-all-accounts");
    }
    setKnownAccounts([]);
  }, [authProxyUrl]);
  return useMemo(
    () => ({
      user,
      loading: initializing,
      isAuthenticated: !!user,
      error,
      // Basic auth
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      refreshSession,
      // OAuth
      startOAuth,
      completeOAuth,
      getLinkedAccounts,
      linkAccount,
      unlinkAccount,
      // MFA
      getMFAStatus,
      setupMFA,
      verifyMFA,
      completeMFAChallenge,
      disableMFA,
      regenerateBackupCodes,
      // Phone auth
      sendPhoneCode,
      verifyPhone,
      loginWithPhone,
      // Account switcher
      knownAccounts,
      switchAccount,
      removeKnownAccount,
      clearKnownAccounts
    }),
    [
      user,
      initializing,
      error,
      register,
      login,
      logout,
      forgotPassword,
      resetPassword,
      verifyEmail,
      resendVerification,
      refreshSession,
      startOAuth,
      completeOAuth,
      getLinkedAccounts,
      linkAccount,
      unlinkAccount,
      getMFAStatus,
      setupMFA,
      verifyMFA,
      completeMFAChallenge,
      disableMFA,
      regenerateBackupCodes,
      sendPhoneCode,
      verifyPhone,
      loginWithPhone,
      knownAccounts,
      switchAccount,
      removeKnownAccount,
      clearKnownAccounts
    ]
  );
}
function retiredBillingRouteError(route) {
  return {
    code: "MONEY_BILLING_ROUTE_RETIRED",
    message: `${route} was retired after the money-services cutover. Use @scalemule/money for subscriptions, pricing, and asset operations.`
  };
}
function useBilling() {
  const { client } = useScaleMule();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const createConnectedAccount = useCallback(
    async (data) => {
      setError(null);
      setLoading(true);
      try {
        return await client.post("/v1/money/billing/connected-accounts", data);
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getMyConnectedAccount = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      return await client.get("/v1/money/billing/connected-accounts/me");
    } catch (err) {
      const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
      setError(apiError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);
  const getConnectedAccount = useCallback(
    async (id) => {
      setError(null);
      setLoading(true);
      try {
        return await client.get(`/v1/money/billing/connected-accounts/${id}`);
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const createOnboardingLink = useCallback(
    async (id, data) => {
      setError(null);
      setLoading(true);
      try {
        const result = await client.post(
          `/v1/money/billing/connected-accounts/${id}/onboarding-link`,
          data
        );
        return result.url;
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getAccountBalance = useCallback(
    async (id) => {
      setError(null);
      setLoading(true);
      try {
        const apiError = retiredBillingRouteError(`/v1/money/billing/connected-accounts/${id}/balance`);
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const createPayment = useCallback(
    async (data) => {
      setError(null);
      setLoading(true);
      try {
        void data;
        const apiError = retiredBillingRouteError("/v1/money/billing/payments");
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getPayment = useCallback(
    async (id) => {
      setError(null);
      setLoading(true);
      try {
        const apiError = retiredBillingRouteError(`/v1/money/billing/payments/${id}`);
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const listPayments = useCallback(
    async (params) => {
      setError(null);
      setLoading(true);
      try {
        void params;
        const apiError = retiredBillingRouteError("/v1/money/billing/payments");
        setError(apiError);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const refundPayment = useCallback(
    async (id, data) => {
      setError(null);
      setLoading(true);
      try {
        void data;
        const apiError = retiredBillingRouteError(`/v1/money/billing/payments/${id}/refund`);
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getPayoutHistory = useCallback(
    async (accountId, params) => {
      setError(null);
      setLoading(true);
      try {
        void params;
        const apiError = retiredBillingRouteError(`/v1/money/billing/connected-accounts/${accountId}/payouts`);
        setError(apiError);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getPayoutSchedule = useCallback(
    async (accountId) => {
      setError(null);
      setLoading(true);
      try {
        return await client.get(
          `/v1/money/billing/connected-accounts/${accountId}/payout-schedule`
        );
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const setPayoutSchedule = useCallback(
    async (accountId, data) => {
      setError(null);
      setLoading(true);
      try {
        return await client.put(
          `/v1/money/billing/connected-accounts/${accountId}/payout-schedule`,
          data
        );
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getTransactions = useCallback(
    async (params) => {
      setError(null);
      setLoading(true);
      try {
        void params;
        const apiError = retiredBillingRouteError("/v1/money/billing/transactions");
        setError(apiError);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const getTransactionSummary = useCallback(
    async (params) => {
      setError(null);
      setLoading(true);
      try {
        void params;
        const apiError = retiredBillingRouteError("/v1/money/billing/transactions/summary");
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const createSetupSession = useCallback(
    async (data) => {
      setError(null);
      setLoading(true);
      try {
        const result = await client.post(
          "/v1/money/billing/setup-sessions",
          data
        );
        return result.client_secret;
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
        setError(apiError);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  return useMemo(
    () => ({
      loading,
      error,
      createConnectedAccount,
      getMyConnectedAccount,
      getConnectedAccount,
      createOnboardingLink,
      getAccountBalance,
      createPayment,
      getPayment,
      listPayments,
      refundPayment,
      getPayoutHistory,
      getPayoutSchedule,
      setPayoutSchedule,
      getTransactions,
      getTransactionSummary,
      createSetupSession
    }),
    [
      loading,
      error,
      createConnectedAccount,
      getMyConnectedAccount,
      getConnectedAccount,
      createOnboardingLink,
      getAccountBalance,
      createPayment,
      getPayment,
      listPayments,
      refundPayment,
      getPayoutHistory,
      getPayoutSchedule,
      setPayoutSchedule,
      getTransactions,
      getTransactionSummary,
      createSetupSession
    ]
  );
}
function useContent(options = {}) {
  const { autoFetch = false, initialParams } = options;
  const { client, user, setError } = useScaleMule();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [error, setLocalError] = useState(null);
  const list = useCallback(
    async (params) => {
      setLocalError(null);
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        const p = params || initialParams || {};
        if (p.content_type) queryParams.set("content_type", p.content_type);
        if (p.search) queryParams.set("search", p.search);
        if (p.limit) queryParams.set("limit", p.limit.toString());
        if (p.offset) queryParams.set("offset", p.offset.toString());
        const query = queryParams.toString();
        const path = `/v1/storage/my-files${query ? `?${query}` : ""}`;
        const data = await client.get(path);
        setFiles(data.files);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [client, initialParams]
  );
  const upload = useCallback(
    async (file, options2) => {
      setLocalError(null);
      setLoading(true);
      setUploadProgress(0);
      try {
        const additionalFields = {};
        if (options2?.is_public !== void 0) {
          additionalFields.is_public = options2.is_public ? "true" : "false";
        }
        if (options2?.filename) {
          additionalFields.filename = options2.filename;
        }
        if (options2?.category) {
          additionalFields.category = options2.category;
        }
        const onProgress = (progress) => {
          setUploadProgress(progress);
          options2?.onProgress?.(progress);
        };
        const data = await client.upload(
          "/v1/storage/upload",
          file,
          additionalFields,
          { onProgress }
        );
        await list();
        return data;
      } finally {
        setLoading(false);
        setUploadProgress(null);
      }
    },
    [client, list]
  );
  const remove = useCallback(
    async (fileId) => {
      setLocalError(null);
      setLoading(true);
      try {
        await client.delete(`/v1/storage/files/${fileId}`);
        setFiles((prev) => prev.filter((f) => f.id !== fileId));
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const get = useCallback(
    async (fileId) => {
      setLocalError(null);
      return await client.get(`/v1/storage/files/${fileId}/info`);
    },
    [client]
  );
  const refresh = useCallback(async () => {
    await list(initialParams);
  }, [list, initialParams]);
  const getSignedUploadUrl = useCallback(
    async (request) => {
      setLocalError(null);
      return await client.post("/v1/storage/signed-upload", request);
    },
    [client]
  );
  const uploadToSignedUrl = useCallback(
    async (signedUrl, file, headers, onProgress) => {
      setLocalError(null);
      setLoading(true);
      setUploadProgress(0);
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              const progress = Math.round(event.loaded / event.total * 100);
              setUploadProgress(progress);
              onProgress?.(progress);
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });
          xhr.addEventListener("error", () => {
            reject(new Error("Upload failed"));
          });
          xhr.addEventListener("abort", () => {
            reject(new Error("Upload cancelled"));
          });
          xhr.open("PUT", signedUrl);
          for (const [key, value] of Object.entries(headers)) {
            xhr.setRequestHeader(key, value);
          }
          xhr.send(file);
        });
      } catch (err) {
        const error2 = {
          code: "SIGNED_UPLOAD_FAILED",
          message: err instanceof Error ? err.message : "Upload failed"
        };
        setLocalError(error2);
        throw error2;
      } finally {
        setLoading(false);
        setUploadProgress(null);
      }
    },
    []
  );
  const completeSignedUpload = useCallback(
    async (fileId) => {
      setLocalError(null);
      const data = await client.post(`/v1/storage/signed-upload/${fileId}/complete`);
      await list();
      return data;
    },
    [client, list]
  );
  useEffect(() => {
    if (autoFetch && user) {
      list(initialParams);
    }
  }, [autoFetch, user, list, initialParams]);
  return useMemo(
    () => ({
      files,
      loading,
      uploadProgress,
      error,
      upload,
      list,
      remove,
      get,
      refresh,
      getSignedUploadUrl,
      uploadToSignedUrl,
      completeSignedUpload
    }),
    [
      files,
      loading,
      uploadProgress,
      error,
      upload,
      list,
      remove,
      get,
      refresh,
      getSignedUploadUrl,
      uploadToSignedUrl,
      completeSignedUpload
    ]
  );
}
var AUDIO_POLL_INTERVAL_MS = 1e3;
var AUDIO_POLL_MAX_ATTEMPTS = 30;
function isAudioFile(file) {
  return file.content_type.startsWith("audio/");
}
function toStorageBackedAudioFile(file) {
  return {
    audio_id: file.id,
    file_id: file.id,
    filename: file.filename,
    mime_type: file.content_type,
    size_bytes: file.size_bytes,
    status: "pending_transcode",
    codec: null,
    bit_rate_kbps: null,
    duration_ms: null,
    created_at: file.created_at,
    original_view_url: file.url ?? null,
    transcoded_url: null
  };
}
function isNotFoundError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error;
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.response?.status === 404 || candidate.code === "not_found" || candidate.message?.toLowerCase().includes("not found") === true;
}
function isAbortError(error) {
  return error instanceof DOMException && error.name === "AbortError" || !!error && typeof error === "object" && "name" in error && error.name === "AbortError";
}
async function waitForPollInterval(signal) {
  if (signal?.aborted) {
    return false;
  }
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve(true);
    }, AUDIO_POLL_INTERVAL_MS);
    const onAbort = () => {
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
function useAudio() {
  const { client, audio } = useScaleMule();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollTranscodedUrl = useCallback(
    async (audioId, signal) => {
      for (let attempt = 0; attempt < AUDIO_POLL_MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) {
          return null;
        }
        try {
          const details = await client.get(`/v1/audio/${audioId}`);
          if (details.status === "ready" && details.url) {
            return details.url;
          }
          if (details.status === "failed") {
            return null;
          }
        } catch (err) {
          if (isAbortError(err) || signal?.aborted) {
            return null;
          }
          if (!isNotFoundError(err)) {
            throw err;
          }
        }
        if (!await waitForPollInterval(signal)) {
          return null;
        }
      }
      return null;
    },
    [client]
  );
  const upload = useCallback(
    async (file, opts) => {
      setLoading(true);
      setError(null);
      try {
        const result = await audio.uploadViaStorage(file, {
          filename: opts?.filename,
          metadata: opts?.metadata,
          onProgress: opts?.onProgress,
          signal: opts?.signal
        });
        if (result.error || !result.data) {
          throw result.error ?? { code: "upload_error", message: "Audio upload failed" };
        }
        return {
          file_id: result.data.file_id,
          audio_id: result.data.audio_id,
          original_view_url: result.data.original_view_url,
          transcoded_url_promise: result.data.audio_id ? pollTranscodedUrl(result.data.audio_id, opts?.signal) : Promise.resolve(null)
        };
      } catch (err) {
        const apiError = err;
        setError(apiError);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [audio, pollTranscodedUrl]
  );
  const list = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.get("/v1/storage/my-files");
      const audioFiles = response.files.filter(isAudioFile);
      const enriched = await Promise.all(
        audioFiles.map(async (file) => {
          try {
            const details = await client.get(`/v1/audio/${file.id}`);
            return {
              audio_id: details.id,
              file_id: file.id,
              filename: file.filename,
              mime_type: file.content_type,
              size_bytes: details.size_bytes ?? file.size_bytes,
              status: details.status,
              codec: details.codec,
              bit_rate_kbps: details.bit_rate_kbps ?? null,
              duration_ms: details.duration_ms ?? null,
              created_at: details.created_at,
              original_view_url: file.url ?? null,
              transcoded_url: details.url ?? null,
              waveform_peaks: details.waveform_peaks
            };
          } catch {
            return toStorageBackedAudioFile(file);
          }
        })
      );
      return enriched;
    } catch (err) {
      const apiError = err;
      setError(apiError);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);
  const remove = useCallback(
    async (fileId) => {
      setLoading(true);
      setError(null);
      try {
        const [audioDeleteResult, storageDeleteResult] = await Promise.allSettled([
          client.delete(`/v1/audio/${fileId}`),
          client.delete(`/v1/storage/files/${fileId}`)
        ]);
        if (storageDeleteResult.status === "rejected" && !isNotFoundError(storageDeleteResult.reason)) {
          throw storageDeleteResult.reason ?? new Error("Storage delete failed");
        }
        if (audioDeleteResult.status === "rejected" && !isNotFoundError(audioDeleteResult.reason)) {
          console.warn("Audio record delete failed after storage delete", audioDeleteResult.reason);
        }
      } catch (err) {
        const apiError = err;
        setError(apiError);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  return {
    upload,
    list,
    remove,
    error,
    loading
  };
}
var DEFAULT_POLL_INTERVAL_MS = 2e3;
var TERMINAL_STATUSES = /* @__PURE__ */ new Set(["ready", "failed"]);
function useTtsJob(jobId, options) {
  const { tts } = useScaleMule();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    if (!jobId) {
      setJob(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await tts.getJob(jobId);
      if (!result) {
        const apiError = { code: "tts_job_error", message: "Failed to load TTS job", status: 500 };
        setError(apiError);
        return null;
      }
      if (result.error || !result.data) {
        const apiError = result.error ?? { code: "tts_job_error", message: "Failed to load TTS job", status: 500 };
        setError(apiError);
        return null;
      }
      setJob(result.data);
      return result.data;
    } finally {
      setLoading(false);
    }
  }, [jobId, tts]);
  useEffect(() => {
    if (!jobId || options?.enabled === false) {
      setJob(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timeoutId = null;
    const poll = async () => {
      const next = await refresh();
      if (cancelled || !next || TERMINAL_STATUSES.has(next.status)) {
        return;
      }
      timeoutId = window.setTimeout(poll, options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    };
    poll();
    return () => {
      cancelled = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [jobId, options?.enabled, options?.pollIntervalMs, refresh]);
  return { job, loading, error, refresh };
}
var SPEEDS = [1, 1.25, 1.5, 2];
var EXPIRY_REFRESH_WINDOW_MS = 3e4;
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
function getNextSpeed(currentSpeed) {
  const currentIndex = SPEEDS.findIndex((speed) => speed === currentSpeed);
  if (currentIndex === -1) return SPEEDS[0];
  return SPEEDS[(currentIndex + 1) % SPEEDS.length];
}
var styles = {
  root: {
    borderRadius: "1.75rem",
    border: "1px solid rgba(226, 232, 240, 0.8)",
    background: "linear-gradient(180deg, #f8fbff 0%, #edf4ff 100%)",
    padding: "1rem",
    color: "#0f172b",
    boxShadow: "0 22px 70px rgba(4, 12, 24, 0.28)"
  },
  layout: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "1rem"
  },
  playButton: {
    display: "flex",
    height: "4.5rem",
    width: "4.5rem",
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "9999px",
    border: "none",
    backgroundColor: "#020618",
    color: "#ffffff",
    boxShadow: "0 10px 28px rgba(15, 23, 42, 0.25)",
    cursor: "pointer"
  },
  playIcon: { display: "block", width: "1.75rem", height: "1.75rem", fill: "currentColor" },
  playIconOffset: { marginLeft: "0.25rem" },
  content: { minWidth: "16rem", flex: "1 1 18rem" },
  metaRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    fontSize: "0.8rem",
    fontWeight: 500,
    color: "#62748e"
  },
  metaRight: { display: "flex", alignItems: "center", gap: "0.75rem" },
  badge: {
    borderRadius: "9999px",
    backgroundColor: "#dbeafe",
    padding: "0.25rem 0.75rem",
    fontSize: "0.65rem",
    fontWeight: 600,
    letterSpacing: "0.24em",
    textTransform: "uppercase",
    color: "#1447e6"
  },
  scrubber: {
    position: "relative",
    marginTop: "1rem",
    height: "3rem",
    cursor: "pointer",
    overflow: "hidden",
    borderRadius: "1rem",
    backgroundColor: "rgba(226, 232, 240, 0.9)",
    paddingInline: "0.25rem"
  },
  waveform: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    height: "100%",
    width: "100%"
  },
  fallbackTrack: { position: "absolute", inset: 0, backgroundColor: "rgba(226, 232, 240, 0.9)" },
  fallbackProgress: {
    position: "absolute",
    insetBlock: 0,
    left: 0,
    backgroundColor: "#155dfc"
  },
  chipsRow: {
    marginTop: "1rem",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.72rem",
    fontWeight: 500,
    color: "#62748e"
  },
  chipStrong: {
    borderRadius: "9999px",
    border: "1px solid #e2e8f0",
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    padding: "0.25rem 0.75rem",
    color: "#334155"
  },
  chipMuted: {
    borderRadius: "9999px",
    border: "1px solid #e2e8f0",
    backgroundColor: "rgba(255, 255, 255, 0.65)",
    padding: "0.25rem 0.75rem"
  },
  controls: {
    display: "flex",
    flexShrink: 0,
    alignItems: "center",
    gap: "0.5rem",
    alignSelf: "flex-start"
  },
  secondaryButton: {
    borderRadius: "9999px",
    border: "1px solid #cad5e2",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: "0.5rem 1rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#334155",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08)",
    cursor: "pointer"
  },
  refreshButton: {
    borderRadius: "9999px",
    border: "1px solid #cad5e2",
    backgroundColor: "rgba(255, 255, 255, 0.75)",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 600,
    color: "#334155",
    cursor: "pointer"
  },
  disabled: { cursor: "not-allowed", opacity: 0.6 }
};
function NarrationPlayer({
  audio,
  className,
  providerLabel = "ScaleMule",
  narrationLabel = "AI-Narrated",
  refreshing = false,
  onRefresh,
  showRefreshButton = false,
  onPlaybackError
}) {
  const audioRef = useRef(null);
  const scrubRef = useRef(null);
  const pendingResumeRef = useRef(false);
  const pendingResumeTimeRef = useRef(null);
  const recoveredUrlRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(
    audio.duration_ms ? audio.duration_ms / 1e3 : 0
  );
  const [speed, setSpeed] = useState(1.5);
  const peaks = useMemo(() => {
    if (!Array.isArray(audio.waveform_peaks)) return [];
    const sampled = audio.waveform_peaks.filter((_, index) => index % 3 === 0).slice(0, 220);
    return sampled.length > 0 ? sampled : audio.waveform_peaks.slice(0, 220);
  }, [audio.waveform_peaks]);
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    recoveredUrlRef.current = null;
    const resumeTime = pendingResumeTimeRef.current;
    setCurrentTime(resumeTime ?? 0);
    setPlaying(false);
    element.pause();
    try {
      element.currentTime = resumeTime ?? 0;
    } catch {
      element.currentTime = 0;
    }
    if (pendingResumeRef.current) {
      pendingResumeRef.current = false;
      pendingResumeTimeRef.current = null;
      element.play().catch(() => {
        setPlaying(false);
        onPlaybackError?.();
      });
      return;
    }
    pendingResumeTimeRef.current = null;
  }, [audio.url]);
  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    element.playbackRate = speed;
    element.preservesPitch = true;
  }, [speed]);
  function isUrlExpiringSoon() {
    if (!audio.expires_at) return false;
    const expiresAtMs = Date.parse(audio.expires_at);
    if (!Number.isFinite(expiresAtMs)) return false;
    return expiresAtMs - Date.now() <= EXPIRY_REFRESH_WINDOW_MS;
  }
  function seekToTime(nextTime) {
    const element = audioRef.current;
    if (!element || !duration) return;
    const clampedTime = Math.max(0, Math.min(duration, nextTime));
    element.currentTime = clampedTime;
    setCurrentTime(clampedTime);
  }
  async function refreshAndResume() {
    if (!onRefresh || refreshing) return false;
    if (recoveredUrlRef.current === (audio.url ?? null)) return false;
    recoveredUrlRef.current = audio.url ?? null;
    pendingResumeRef.current = true;
    pendingResumeTimeRef.current = currentTime;
    try {
      await Promise.resolve(onRefresh());
      return true;
    } catch {
      recoveredUrlRef.current = null;
      pendingResumeRef.current = false;
      pendingResumeTimeRef.current = null;
      onPlaybackError?.();
      return false;
    }
  }
  function togglePlayback() {
    const element = audioRef.current;
    if (!element) return;
    if (element.paused) {
      if (refreshing) {
        pendingResumeRef.current = true;
        pendingResumeTimeRef.current = currentTime;
        return;
      }
      if (onRefresh && isUrlExpiringSoon()) {
        void refreshAndResume();
        return;
      }
      element.play().catch(() => {
        setPlaying(false);
        onPlaybackError?.();
      });
      return;
    }
    element.pause();
  }
  function seekTo(clientX) {
    const scrubber = scrubRef.current;
    if (!scrubber || !duration) return;
    const bounds = scrubber.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    seekToTime(ratio * duration);
  }
  function handleScrubberKeyDown(event) {
    if (!duration) return;
    const step = Math.max(5, duration / 20);
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        seekToTime(currentTime - step);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        seekToTime(currentTime + step);
        break;
      case "Home":
        event.preventDefault();
        seekToTime(0);
        break;
      case "End":
        event.preventDefault();
        seekToTime(duration);
        break;
    }
  }
  function handleManualRefresh() {
    if (!onRefresh || refreshing) return;
    Promise.resolve(onRefresh()).catch(() => {
      onPlaybackError?.();
    });
  }
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;
  const expiresLabel = audio.expires_at ? new Date(audio.expires_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  }) : null;
  if (!audio.url) return null;
  return /* @__PURE__ */ jsxs("div", { className, style: styles.root, children: [
    /* @__PURE__ */ jsx(
      "audio",
      {
        ref: audioRef,
        src: audio.url ?? void 0,
        preload: "metadata",
        onLoadedMetadata: (event) => {
          setDuration(event.currentTarget.duration || 0);
        },
        onTimeUpdate: (event) => {
          setCurrentTime(event.currentTarget.currentTime);
        },
        onPlay: () => setPlaying(true),
        onPause: () => setPlaying(false),
        onEnded: () => setPlaying(false),
        onError: () => {
          if (onRefresh) {
            void refreshAndResume().then((didRefresh) => {
              if (!didRefresh) onPlaybackError?.();
            });
            return;
          }
          onPlaybackError?.();
        }
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: styles.layout, children: [
      /* @__PURE__ */ jsx(
        "button",
        {
          type: "button",
          onClick: togglePlayback,
          "aria-label": playing ? "Pause narration" : "Play narration",
          style: styles.playButton,
          children: playing ? /* @__PURE__ */ jsxs("svg", { viewBox: "0 0 24 24", style: styles.playIcon, "aria-hidden": "true", children: [
            /* @__PURE__ */ jsx("rect", { x: "6", y: "5", width: "4", height: "14", rx: "1.2" }),
            /* @__PURE__ */ jsx("rect", { x: "14", y: "5", width: "4", height: "14", rx: "1.2" })
          ] }) : /* @__PURE__ */ jsx(
            "svg",
            {
              viewBox: "0 0 24 24",
              style: { ...styles.playIcon, ...styles.playIconOffset },
              "aria-hidden": "true",
              children: /* @__PURE__ */ jsx("path", { d: "M7 5.2c0-1.02 1.12-1.65 2-.98l10.2 7.78a1.24 1.24 0 0 1 0 1.98L9 21.76c-.88.67-2-.04-2-1.08V5.2Z" })
            }
          )
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: styles.content, children: [
        /* @__PURE__ */ jsxs("div", { style: styles.metaRow, children: [
          /* @__PURE__ */ jsx("span", { children: formatTime(currentTime / speed) }),
          /* @__PURE__ */ jsxs("div", { style: styles.metaRight, children: [
            /* @__PURE__ */ jsx("span", { style: styles.badge, children: narrationLabel }),
            /* @__PURE__ */ jsx("span", { children: formatTime(duration / speed) })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            ref: scrubRef,
            role: "slider",
            "aria-label": "Narration progress",
            "aria-valuemin": 0,
            "aria-valuemax": Math.max(1, Math.floor(duration)),
            "aria-valuenow": Math.floor(currentTime),
            "aria-valuetext": `${formatTime(currentTime / speed)} of ${formatTime(duration / speed)}`,
            tabIndex: 0,
            onClick: (event) => seekTo(event.clientX),
            onKeyDown: handleScrubberKeyDown,
            style: styles.scrubber,
            children: peaks.length > 0 ? /* @__PURE__ */ jsx(
              "svg",
              {
                viewBox: `0 0 ${peaks.length} 40`,
                preserveAspectRatio: "none",
                style: styles.waveform,
                children: peaks.map((peak, index) => {
                  const height = Math.max(2, Math.round(Math.abs(peak) * 34));
                  const y = (40 - height) / 2;
                  const filled = index / peaks.length < progress;
                  return /* @__PURE__ */ jsx(
                    "rect",
                    {
                      x: index,
                      y,
                      width: 0.82,
                      height,
                      rx: 0.4,
                      fill: filled ? "#155dfc" : "#90c5ff"
                    },
                    `${audio.id}-${index}`
                  );
                })
              }
            ) : /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("div", { style: styles.fallbackTrack }),
              /* @__PURE__ */ jsx("div", { style: { ...styles.fallbackProgress, width: `${progress * 100}%` } })
            ] })
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: styles.chipsRow, children: [
          /* @__PURE__ */ jsxs("span", { style: styles.chipStrong, children: [
            "Provider: ",
            providerLabel
          ] }),
          duration > 0 && /* @__PURE__ */ jsxs("span", { style: styles.chipMuted, children: [
            "Length ",
            formatTime(duration / speed)
          ] }),
          expiresLabel && /* @__PURE__ */ jsxs("span", { style: styles.chipMuted, children: [
            "Expires ",
            expiresLabel
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { style: styles.controls, children: [
        /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: () => setSpeed((currentSpeed) => getNextSpeed(currentSpeed)),
            style: styles.secondaryButton,
            children: [
              speed,
              "\xD7"
            ]
          }
        ),
        onRefresh && showRefreshButton && /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: handleManualRefresh,
            disabled: refreshing,
            style: refreshing ? { ...styles.refreshButton, ...styles.disabled } : styles.refreshButton,
            children: refreshing ? "Refreshing\u2026" : "Refresh"
          }
        )
      ] })
    ] })
  ] });
}
function useMedia() {
  const { media: rawMedia, mediaPolicy: providerDefaultPolicy } = useScaleMule();
  const media = rawMedia;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const upload = useCallback(
    async (file, options) => {
      setUploading(true);
      setError(null);
      const policy = options?.policy ?? providerDefaultPolicy ?? "safe_visible";
      try {
        const result = await media.upload(file, {
          visibility: options?.visibility,
          isPublic: options?.is_public,
          policy,
          filename: options?.filename,
          metadata: options?.metadata,
          signal: options?.signal,
          skipPhotoRegister: options?.skipPhotoRegister,
          onProgress: (event) => {
            if (typeof event.progress === "number") {
              options?.onProgress?.(event.progress);
            }
          }
        });
        if (result.error || !result.data) {
          throw result.error ?? { code: "upload_error", message: "Upload failed", status: 0 };
        }
        return {
          file_id: result.data.file_id,
          photo_id: result.data.photo_id,
          original_view_url: result.data.original_view_url,
          optimized_url_promise: result.data.optimized_url_promise,
          hls_url_promise: result.data.hls_url_promise,
          mime_type: result.data.mime_type,
          is_public: result.data.is_public,
          visibility: result.data.visibility,
          cdn_url: result.data.cdn_url
        };
      } catch (err) {
        const e = err;
        setError(e);
        throw e;
      } finally {
        setUploading(false);
      }
    },
    [media, providerDefaultPolicy]
  );
  const cancelUpload = useCallback(
    async (fileId) => {
      setError(null);
      try {
        const result = await media.delete(fileId);
        if (result.error) {
          if (result.error.status === 404) return;
          throw result.error;
        }
      } catch (err) {
        const e = err;
        setError(e);
        throw e;
      }
    },
    [media]
  );
  return { upload, cancelUpload, error, uploading };
}
function conversationChannel(kind, id) {
  switch (kind) {
    case "large_room":
      return `conversation:lr:${id}`;
    case "broadcast":
      return `conversation:bc:${id}`;
    case "support":
      return `conversation:support:${id}`;
    case "standard":
    default:
      return `conversation:${id}`;
  }
}
function useFileStatus(options) {
  const { storage, realtime } = useScaleMule();
  const {
    fileId,
    pollIntervalMs = null,
    disabled = false,
    conversationId = null,
    conversationKind = "standard"
  } = options;
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestSeqRef = useRef(0);
  const fetchStatus = useCallback(async () => {
    if (!fileId || disabled) return;
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const r = await storage.getFileStatus(fileId);
      if (seq !== requestSeqRef.current) return;
      if (r.error || !r.data) {
        setError(r.error);
        return;
      }
      setStatus(r.data);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      setError(err);
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [storage, fileId, disabled]);
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);
  useEffect(() => {
    if (!pollIntervalMs || disabled || !fileId) return;
    const scan = status?.scan.status;
    if (scan === "threat" || scan === "quarantined" || scan === "error") return;
    const optimizePending = status?.optimize != null && status.optimize.status !== "done";
    const transcodePending = status?.transcode != null && status.transcode.status !== "done";
    const pipelinePending = optimizePending || transcodePending;
    const isSettled = scan === "clean" && !pipelinePending;
    if (isSettled) return;
    const id = setInterval(() => {
      void fetchStatus();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [
    pollIntervalMs,
    disabled,
    fileId,
    status?.scan.status,
    status?.optimize,
    status?.transcode,
    fetchStatus
  ]);
  useEffect(() => {
    if (!conversationId || !fileId || disabled) return;
    const channel = conversationChannel(conversationKind, conversationId);
    const unsub = realtime.subscribe(channel, (data) => {
      if (typeof data !== "object" || data === null) return;
      const payload = data;
      const wrapped = "data" in payload && typeof payload.data === "object" && payload.data !== null ? payload.data : payload;
      const evt = typeof payload.event === "string" ? payload.event : void 0;
      if (evt && evt !== "file_status_changed") return;
      if (wrapped.file_id !== fileId) return;
      void fetchStatus();
    });
    return unsub;
  }, [realtime, conversationId, conversationKind, fileId, disabled, fetchStatus]);
  const isReady = status?.scan.status === "clean";
  return { status, loading, error, isReady, refresh: fetchStatus };
}
function ScaleMuleMedia(props) {
  const {
    fileId,
    mimeType,
    blobPreview,
    width,
    height,
    className,
    style,
    alt,
    pollIntervalMs,
    conversationId = null,
    conversationKind,
    renderPlaceholder,
    renderBlocked,
    renderOverride
  } = props;
  const effectivePollIntervalMs = pollIntervalMs !== void 0 ? pollIntervalMs : conversationId ? null : 2e3;
  const { gatewayUrl } = useScaleMule();
  const { status, isReady } = useFileStatus({
    fileId,
    pollIntervalMs: effectivePollIntervalMs,
    conversationId,
    conversationKind
  });
  const absoluteUrl = React.useCallback(
    (url) => {
      if (!url) return null;
      if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
        return url;
      }
      if (!gatewayUrl) return url;
      const base = gatewayUrl.endsWith("/") ? gatewayUrl.slice(0, -1) : gatewayUrl;
      const path = url.startsWith("/") ? url : `/${url}`;
      return `${base}${path}`;
    },
    [gatewayUrl]
  );
  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const isAudio = mimeType.startsWith("audio/");
  const src = useMemo(() => {
    const scan = status?.scan.status;
    if (scan === "threat" || scan === "quarantined") return null;
    if (!status) {
      return blobPreview ?? null;
    }
    if (isImage && status.urls.optimized) return absoluteUrl(status.urls.optimized);
    if (isVideo && status.urls.hls) return absoluteUrl(status.urls.hls);
    if (status.urls.original) return absoluteUrl(status.urls.original);
    return blobPreview ?? null;
  }, [status, isImage, isVideo, blobPreview, absoluteUrl]);
  const renderState = useMemo(() => {
    const scan = status?.scan.status;
    if (scan === "threat" || scan === "quarantined") return "blocked";
    if (status?.urls.original) return "ready";
    if (isReady) return "ready";
    if (blobPreview) return "preview";
    return "pending";
  }, [status?.scan.status, status?.urls.original, isReady, blobPreview]);
  const videoRef = React.useRef(null);
  useEffect(() => {
    if (!isVideo) return;
    if (!src) return;
    if (!src.endsWith(".m3u8")) return;
    const el = videoRef.current;
    if (!el) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = src;
      return;
    }
    let cancelled = false;
    let hls = null;
    void (async () => {
      try {
        const moduleName = "hls.js";
        const mod = await import(
          /* @vite-ignore */
          /* webpackIgnore: true */
          moduleName
        ).catch(
          () => null
        );
        if (cancelled || !mod) return;
        const Hls = mod.default ?? mod;
        if (Hls.isSupported()) {
          hls = new Hls();
          hls.loadSource(src);
          hls.attachMedia(el);
        } else {
          el.src = src;
        }
      } catch {
      }
    })();
    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [isVideo, src]);
  if (renderState === "blocked") {
    return /* @__PURE__ */ jsx(Fragment, { children: renderBlocked ? renderBlocked() : /* @__PURE__ */ jsx(
      "div",
      {
        role: "alert",
        className,
        style: { padding: 12, color: "#a00", ...style },
        children: "This file was blocked."
      }
    ) });
  }
  if (renderOverride) {
    return /* @__PURE__ */ jsx(Fragment, { children: renderOverride({ src, state: renderState }) });
  }
  if (renderState === "pending" && !src) {
    return /* @__PURE__ */ jsx(Fragment, { children: renderPlaceholder ? renderPlaceholder() : /* @__PURE__ */ jsx(
      "div",
      {
        role: "status",
        "aria-busy": true,
        className,
        style: { padding: 12, color: "#666", ...style },
        children: "Loading\u2026"
      }
    ) });
  }
  if (isImage) {
    const finalSrc = src && status?.urls.optimized && (width || height) ? appendQuery(src, {
      width: width ? String(width) : void 0,
      height: height ? String(height) : void 0,
      fit: "cover"
    }) : src;
    return /* @__PURE__ */ jsx(
      "img",
      {
        src: finalSrc ?? void 0,
        alt: alt ?? "",
        width,
        height,
        className,
        style
      }
    );
  }
  if (isVideo) {
    return /* @__PURE__ */ jsx(
      "video",
      {
        ref: videoRef,
        src: src && !src.endsWith(".m3u8") ? src : void 0,
        controls: true,
        playsInline: true,
        preload: "metadata",
        className,
        style,
        "aria-label": alt,
        width,
        height
      }
    );
  }
  if (isAudio) {
    return /* @__PURE__ */ jsx(
      "audio",
      {
        src: src ?? void 0,
        controls: true,
        preload: "metadata",
        className,
        style,
        "aria-label": alt
      }
    );
  }
  return /* @__PURE__ */ jsx(
    "a",
    {
      href: src ?? "#",
      target: "_blank",
      rel: "noopener noreferrer",
      className,
      style,
      children: alt ?? "Download file"
    }
  );
}
function appendQuery(url, params) {
  const filtered = Object.entries(params).filter(([, v]) => v != null && v !== "");
  if (filtered.length === 0) return url;
  const sep = url.includes("?") ? "&" : "?";
  const qs = new URLSearchParams(filtered).toString();
  return url + sep + qs;
}

// src/hooks/useMoney.ts
var useMoney = useMoneyClient;
function useUser() {
  const { client, user, setUser, setError } = useScaleMule();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);
  const update = useCallback(
    async (data) => {
      setLocalError(null);
      setLoading(true);
      try {
        const profileData = await client.patch("/v1/auth/profile", data);
        setUser(profileData);
        return profileData;
      } finally {
        setLoading(false);
      }
    },
    [client, setUser]
  );
  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      setLocalError(null);
      setLoading(true);
      try {
        await client.post("/v1/auth/change-password", {
          current_password: currentPassword,
          new_password: newPassword
        });
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const changeEmail = useCallback(
    async (newEmail, password) => {
      setLocalError(null);
      setLoading(true);
      try {
        await client.post("/v1/auth/change-email", {
          new_email: newEmail,
          password
        });
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  const deleteAccount = useCallback(
    async (password) => {
      setLocalError(null);
      setLoading(true);
      try {
        await client.post("/v1/auth/delete-account", {
          password
        });
        await client.clearSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
    },
    [client, setUser]
  );
  const exportData = useCallback(async () => {
    setLocalError(null);
    setLoading(true);
    try {
      return await client.post(
        "/v1/auth/export-data"
      );
    } finally {
      setLoading(false);
    }
  }, [client]);
  return useMemo(
    () => ({
      profile: user,
      loading,
      error: localError,
      update,
      changePassword,
      changeEmail,
      deleteAccount,
      exportData
    }),
    [user, loading, localError, update, changePassword, changeEmail, deleteAccount, exportData]
  );
}
function useRealtime(options) {
  const { realtime } = useScaleMule();
  const [status, setStatus] = useState("disconnected");
  const [lastMessage, setLastMessage] = useState(null);
  const manualUnsubscribesRef = useRef([]);
  const autoUnsubscribesRef = useRef([]);
  const onMessageRef = useRef(void 0);
  const channelSignature = (options?.channels ?? []).join("");
  useEffect(() => {
    onMessageRef.current = options?.onMessage;
  }, [options?.onMessage]);
  const disconnect = useCallback(() => {
    realtime.disconnect();
  }, [realtime]);
  const subscribe = useCallback(
    (channel, callback) => {
      const unsub = realtime.subscribe(channel, (data) => {
        setLastMessage({ channel, data });
        callback?.(data);
        onMessageRef.current?.(channel, data);
      });
      manualUnsubscribesRef.current.push(unsub);
      return () => {
        manualUnsubscribesRef.current = manualUnsubscribesRef.current.filter((fn) => fn !== unsub);
        unsub();
      };
    },
    [realtime]
  );
  const publish = useCallback(
    (channel, data) => {
      realtime.publish(channel, data);
    },
    [realtime]
  );
  useEffect(() => {
    const unsub = realtime.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });
    return unsub;
  }, [realtime]);
  useEffect(() => {
    for (const unsub of autoUnsubscribesRef.current) {
      unsub();
    }
    autoUnsubscribesRef.current = [];
    for (const channel of options?.channels ?? []) {
      const unsub = realtime.subscribe(channel, (data) => {
        setLastMessage({ channel, data });
        onMessageRef.current?.(channel, data);
      });
      autoUnsubscribesRef.current.push(unsub);
    }
    return () => {
      for (const unsub of autoUnsubscribesRef.current) {
        unsub();
      }
      autoUnsubscribesRef.current = [];
    };
  }, [realtime, channelSignature]);
  useEffect(() => {
    return () => {
      for (const unsub of manualUnsubscribesRef.current) {
        unsub();
      }
      manualUnsubscribesRef.current = [];
      for (const unsub of autoUnsubscribesRef.current) {
        unsub();
      }
      autoUnsubscribesRef.current = [];
    };
  }, []);
  return { status, lastMessage, disconnect, subscribe, publish };
}

// src/hooks/event-dedup.ts
var DEFAULT_EVENT_DEDUP_MS = 300;
var DEDUP_MAP_MAX = 200;
var _eventLastFired = typeof window !== "undefined" ? /* @__PURE__ */ new Map() : null;
function dedupKey(eventName, properties) {
  if (!properties) return eventName;
  const keys = Object.keys(properties);
  if (keys.length === 0) return eventName;
  let parts = eventName;
  for (let i = 0, len = keys.length; i < len; i++) {
    const k = keys[i];
    const v = properties[k];
    if (v === null || v === void 0) {
      parts += `|${k}=`;
    } else if (typeof v === "object") {
      parts += `|${k}=[obj]`;
    } else {
      parts += `|${k}=${String(v)}`;
    }
  }
  return parts;
}
function shouldDedup(eventName, cooldownMs, properties) {
  if (!_eventLastFired || cooldownMs <= 0) return false;
  const now = Date.now();
  const key = dedupKey(eventName, properties);
  const last = _eventLastFired.get(key);
  if (last !== void 0 && now - last < cooldownMs) return true;
  if (_eventLastFired.size >= DEDUP_MAP_MAX) {
    const oldest = _eventLastFired.keys().next().value;
    if (oldest !== void 0) _eventLastFired.delete(oldest);
  }
  _eventLastFired.set(key, now);
  return false;
}

// src/hooks/useAnalytics.ts
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var SESSION_START_KEY = "sm_session_start";
var SESSION_REFERRER_KEY = "sm_session_referrer";
function getStorageItem(storage, key) {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function setStorageItem(storage, key, value) {
  if (!storage) return;
  try {
    storage.setItem(key, value);
  } catch {
  }
}
function getOrCreateSessionId(sessionStorageKey) {
  if (typeof window === "undefined") {
    return {
      sessionId: null,
      sessionStart: Date.now()
    };
  }
  const storage = typeof sessionStorage !== "undefined" ? sessionStorage : void 0;
  let sessionId = getStorageItem(storage, sessionStorageKey);
  let sessionStartStr = getStorageItem(storage, SESSION_START_KEY);
  let sessionStart;
  if (!sessionId || !sessionStartStr) {
    sessionId = generateUUID();
    sessionStart = Date.now();
    setStorageItem(storage, sessionStorageKey, sessionId);
    setStorageItem(storage, SESSION_START_KEY, sessionStart.toString());
  } else {
    sessionStart = parseInt(sessionStartStr, 10);
  }
  return { sessionId, sessionStart };
}
function parseUtmParams() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const utm = {};
  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  const term = params.get("utm_term");
  const content = params.get("utm_content");
  const adgroup = params.get("utm_adgroup");
  if (source) utm.utm_source = source;
  if (medium) utm.utm_medium = medium;
  if (campaign) utm.utm_campaign = campaign;
  if (term) utm.utm_term = term;
  if (content) utm.utm_content = content;
  if (adgroup) utm.utm_adgroup = adgroup;
  const gclid = params.get("gclid");
  const gbraid = params.get("gbraid");
  const wbraid = params.get("wbraid");
  const fbclid = params.get("fbclid");
  if (gclid) utm.gclid = gclid;
  if (gbraid) utm.gbraid = gbraid;
  if (wbraid) utm.wbraid = wbraid;
  if (fbclid) utm.fbclid = fbclid;
  const gadFields = ["gad_source", "gad_campaignid", "gad_adgroupid", "gad_network", "gad_matchtype", "gad_device", "gad_placement"];
  for (const field of gadFields) {
    const val = params.get(field);
    if (val) utm[field] = val;
  }
  if (!utm.utm_source && (gclid || utm.gad_source || wbraid || gbraid)) {
    utm.utm_source = "google";
    utm.utm_medium = utm.utm_medium || "cpc";
    if (utm.gad_campaignid && !utm.utm_campaign) {
      utm.utm_campaign = utm.gad_campaignid;
    }
  }
  if (!utm.utm_source && fbclid) {
    utm.utm_source = "facebook";
    utm.utm_medium = utm.utm_medium || "cpc";
  }
  return Object.keys(utm).length > 0 ? utm : null;
}
function detectDeviceInfo() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {};
  }
  const ua = navigator.userAgent;
  const info = {};
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) {
    if (/iPad|Tablet/i.test(ua)) {
      info.device_type = "tablet";
    } else {
      info.device_type = "mobile";
    }
  } else {
    info.device_type = "desktop";
  }
  if (/Windows/i.test(ua)) {
    info.os = "Windows";
    const match = ua.match(/Windows NT (\d+\.\d+)/);
    if (match) info.os_version = match[1];
  } else if (/Mac OS X/i.test(ua)) {
    info.os = "macOS";
    const match = ua.match(/Mac OS X (\d+[._]\d+[._]?\d*)/);
    if (match) info.os_version = match[1].replace(/_/g, ".");
  } else if (/Android/i.test(ua)) {
    info.os = "Android";
    const match = ua.match(/Android (\d+(?:\.\d+)*)/);
    if (match) info.os_version = match[1];
  } else if (/iOS|iPhone|iPad|iPod/i.test(ua)) {
    info.os = "iOS";
    const match = ua.match(/OS (\d+[._]\d+[._]?\d*)/);
    if (match) info.os_version = match[1].replace(/_/g, ".");
  } else if (/Linux/i.test(ua)) {
    info.os = "Linux";
  }
  if (/Chrome/i.test(ua) && !/Chromium|Edg/i.test(ua)) {
    info.browser = "Chrome";
    const match = ua.match(/Chrome\/(\d+(?:\.\d+)*)/);
    if (match) info.browser_version = match[1];
  } else if (/Safari/i.test(ua) && !/Chrome|Chromium/i.test(ua)) {
    info.browser = "Safari";
    const match = ua.match(/Version\/(\d+(?:\.\d+)*)/);
    if (match) info.browser_version = match[1];
  } else if (/Firefox/i.test(ua)) {
    info.browser = "Firefox";
    const match = ua.match(/Firefox\/(\d+(?:\.\d+)*)/);
    if (match) info.browser_version = match[1];
  } else if (/Edg/i.test(ua)) {
    info.browser = "Edge";
    const match = ua.match(/Edg\/(\d+(?:\.\d+)*)/);
    if (match) info.browser_version = match[1];
  }
  if (typeof screen !== "undefined") {
    info.screen_resolution = `${screen.width}x${screen.height}`;
  }
  if (typeof window !== "undefined") {
    info.viewport_size = `${window.innerWidth}x${window.innerHeight}`;
  }
  return info;
}
function useAnalytics(options = {}) {
  const {
    autoTrackPageViews = false,
    // Let users control this
    autoCaptureUtmParams,
    autoCapturUtmParams,
    autoGenerateSessionId = true,
    sessionStorageKey = "sm_session_id",
    // anonymousStorageKey is intentionally ignored — see UseAnalyticsOptions.
    // Anonymous ID now lives on the ScaleMule client under the canonical
    // `scalemule_anonymous_id` key (PR consolidating the contract). Reading
    // an override here would re-fragment a visitor's identity between
    // analytics events and auth request headers.
    useV2 = true,
    eventDedupMs = DEFAULT_EVENT_DEDUP_MS
  } = options;
  const shouldAutoCaptureUtmParams = autoCaptureUtmParams ?? autoCapturUtmParams ?? true;
  const { client, user, analyticsProxyUrl, publishableKey, apiKey, gatewayUrl } = useScaleMule();
  const proxyModeMisconfigWarnedRef = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (proxyModeMisconfigWarnedRef.current) return;
    if (apiKey === "proxy-mode" && !analyticsProxyUrl && !publishableKey) {
      proxyModeMisconfigWarnedRef.current = true;
      console.warn(
        '[ScaleMule] useAnalytics: apiKey="proxy-mode" but neither `analyticsProxyUrl` nor `publishableKey` is configured. Every trackEvent / trackPageView will silently 401 against the gateway. Add an analytics proxy route (createAnalyticsRoutes({ simpleProxy: true })) and pass `analyticsProxyUrl` to <ScaleMuleProvider>. See @scalemule/nextjs README \u2192 Proxy Mode.'
      );
    }
  }, [apiKey, analyticsProxyUrl, publishableKey]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [utmParams, setUtmParams] = useState(null);
  const sessionIdRef = useRef(null);
  const anonymousIdRef = useRef(null);
  const sessionStartRef = useRef(Date.now());
  const originalReferrerRef = useRef(null);
  const idsReadyRef = useRef(false);
  const [sessionId, setSessionId] = useState(null);
  const [anonymousId, setAnonymousId] = useState(null);
  const initialized = useRef(false);
  const landingPage = useRef(null);
  const eventQueue = useRef([]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!autoGenerateSessionId) {
      idsReadyRef.current = true;
      return;
    }
    const ids = getOrCreateSessionId(sessionStorageKey);
    sessionIdRef.current = ids.sessionId;
    sessionStartRef.current = ids.sessionStart;
    setSessionId(ids.sessionId);
    let cancelled = false;
    const flushQueuedEvents = () => {
      if (eventQueue.current.length === 0) return;
      const queue = eventQueue.current;
      eventQueue.current = [];
      setTimeout(() => {
        for (const event of queue) {
          sendEventRef.current?.(event);
        }
      }, 0);
    };
    client.ensureAnonymousId().then((anonId) => {
      if (cancelled) return;
      anonymousIdRef.current = anonId;
      setAnonymousId(anonId);
      idsReadyRef.current = true;
      flushQueuedEvents();
    }).catch(() => {
      if (cancelled) return;
      idsReadyRef.current = true;
      flushQueuedEvents();
    });
    return () => {
      cancelled = true;
    };
  }, [autoGenerateSessionId, sessionStorageKey, client]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (shouldAutoCaptureUtmParams) {
      const utm = parseUtmParams();
      if (utm) setUtmParams(utm);
    }
    if (!landingPage.current) {
      landingPage.current = window.location.href;
    }
    const storage = typeof sessionStorage !== "undefined" ? sessionStorage : void 0;
    const storedReferrer = getStorageItem(storage, SESSION_REFERRER_KEY);
    if (storedReferrer) {
      originalReferrerRef.current = storedReferrer;
    } else if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const currentUrl = new URL(window.location.href);
        if (referrerUrl.hostname !== currentUrl.hostname) {
          originalReferrerRef.current = document.referrer;
          setStorageItem(storage, SESSION_REFERRER_KEY, document.referrer);
        }
      } catch {
      }
    }
  }, [shouldAutoCaptureUtmParams]);
  const sendEventRef = useRef(null);
  const getDeviceInfo = useCallback(() => {
    return detectDeviceInfo();
  }, []);
  const buildFullEvent = useCallback(
    (event) => {
      const device = getDeviceInfo();
      const fullEvent = {
        event_name: event.event_name,
        event_category: event.event_category,
        properties: event.properties,
        // Use refs for IDs - they're always current, and this keeps the callback stable
        session_id: event.session_id || sessionIdRef.current,
        anonymous_id: event.anonymous_id || anonymousIdRef.current,
        user_id: event.user_id || user?.id,
        client_timestamp: event.client_timestamp || (/* @__PURE__ */ new Date()).toISOString(),
        // Device info
        device_type: device.device_type,
        device_brand: device.device_brand,
        device_model: device.device_model,
        os: device.os,
        os_version: device.os_version,
        browser: device.browser,
        browser_version: device.browser_version,
        screen_resolution: device.screen_resolution,
        viewport_size: device.viewport_size,
        // UTM params
        ...utmParams || {},
        // Landing page (first page visited)
        landing_page: landingPage.current,
        // Session duration in seconds
        session_duration_seconds: Math.floor((Date.now() - sessionStartRef.current) / 1e3)
      };
      if (typeof window !== "undefined") {
        fullEvent.page_url = window.location.href;
        fullEvent.page_title = document.title;
        fullEvent.referrer = originalReferrerRef.current || void 0;
        fullEvent.document_referrer = document.referrer || void 0;
      }
      return fullEvent;
    },
    // Note: sessionId/anonymousId removed - we use refs to keep this stable
    [user, utmParams, getDeviceInfo]
  );
  const sendEvent = useCallback(
    async (event) => {
      const fullEvent = buildFullEvent(event);
      const payload = JSON.stringify(fullEvent);
      if (analyticsProxyUrl) {
        const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(
          analyticsProxyUrl,
          new Blob([payload], { type: "application/json" })
        );
        if (!sent) {
          fetch(analyticsProxyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true
          }).catch((err) => {
            console.debug("[ScaleMule Analytics] Proxy tracking failed:", err);
          });
        }
        return { tracked: 1, session_id: sessionIdRef.current || void 0 };
      }
      if (publishableKey && gatewayUrl) {
        const endpoint3 = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
        fetch(`${gatewayUrl}${endpoint3}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": publishableKey
          },
          body: payload,
          keepalive: true
        }).catch((err) => {
          console.debug("[ScaleMule Analytics] Direct tracking failed:", err);
        });
        return { tracked: 1, session_id: sessionIdRef.current || void 0 };
      }
      const endpoint2 = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
      return await client.post(endpoint2, fullEvent);
    },
    // Note: sessionId removed - we use ref to keep this stable
    [client, buildFullEvent, useV2, analyticsProxyUrl, publishableKey, gatewayUrl]
  );
  sendEventRef.current = sendEvent;
  const trackEvent = useCallback(
    async (event) => {
      if (shouldDedup(event.event_name, eventDedupMs, event.properties)) {
        return { tracked: 0, session_id: sessionIdRef.current || void 0 };
      }
      setError(null);
      setLoading(true);
      try {
        if (!idsReadyRef.current) {
          eventQueue.current.push(event);
          setLoading(false);
          return { tracked: 0, session_id: void 0 };
        }
        return await sendEvent(event);
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    // Note: idsReady removed - we use ref to keep callback stable
    [sendEvent, eventDedupMs]
  );
  const trackPageView = useCallback(
    async (data) => {
      const pageEvent = {
        event_name: "page_viewed",
        event_category: "navigation",
        properties: {
          ...data?.properties || {},
          page_url: data?.page_url || (typeof window !== "undefined" ? window.location.href : void 0),
          page_title: data?.page_title || (typeof document !== "undefined" ? document.title : void 0),
          referrer: data?.referrer || originalReferrerRef.current || void 0
        }
      };
      return trackEvent(pageEvent);
    },
    [trackEvent]
  );
  const trackBatch = useCallback(
    async (events) => {
      setError(null);
      setLoading(true);
      try {
        const fullEvents = events.map((event) => buildFullEvent(event));
        if (analyticsProxyUrl) {
          for (const event of fullEvents) {
            const payload = JSON.stringify(event);
            const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(
              analyticsProxyUrl,
              new Blob([payload], { type: "application/json" })
            );
            if (!sent) {
              fetch(analyticsProxyUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
                keepalive: true
              }).catch((err) => {
                console.debug("[ScaleMule Analytics] Proxy batch tracking failed:", err);
              });
            }
          }
          setLoading(false);
          return { tracked: events.length, session_id: sessionIdRef.current || void 0 };
        }
        if (publishableKey && gatewayUrl) {
          const endpoint3 = useV2 ? "/v1/analytics/v2/events/batch" : "/v1/analytics/events/batch";
          fetch(`${gatewayUrl}${endpoint3}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": publishableKey
            },
            body: JSON.stringify({ events: fullEvents }),
            keepalive: true
          }).catch((err) => {
            console.debug("[ScaleMule Analytics] Direct batch tracking failed:", err);
          });
          setLoading(false);
          return { tracked: events.length, session_id: sessionIdRef.current || void 0 };
        }
        const endpoint2 = useV2 ? "/v1/analytics/v2/events/batch" : "/v1/analytics/events/batch";
        return await client.post(endpoint2, {
          events: fullEvents
        });
      } finally {
        setLoading(false);
      }
    },
    // Note: sessionId removed - we use ref to keep callback stable
    [client, buildFullEvent, useV2, analyticsProxyUrl, publishableKey, gatewayUrl]
  );
  const identify = useCallback(
    async (userId, traits) => {
      await trackEvent({
        event_name: "user_identified",
        event_category: "identity",
        user_id: userId,
        properties: {
          ...traits || {},
          previous_anonymous_id: anonymousIdRef.current
        }
      });
    },
    // Note: anonymousId removed - we use ref
    [trackEvent]
  );
  const reset = useCallback(() => {
    const newSessionId = generateUUID();
    const newSessionStart = Date.now();
    sessionIdRef.current = newSessionId;
    sessionStartRef.current = newSessionStart;
    setSessionId(newSessionId);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(sessionStorageKey, newSessionId);
      sessionStorage.setItem(SESSION_START_KEY, newSessionStart.toString());
      sessionStorage.removeItem(SESSION_REFERRER_KEY);
    }
    originalReferrerRef.current = null;
    setUtmParams(null);
  }, [sessionStorageKey]);
  const setUtmParamsManual = useCallback((params) => {
    setUtmParams(params);
  }, []);
  return useMemo(
    () => ({
      loading,
      error,
      sessionId,
      anonymousId,
      utmParams,
      trackEvent,
      trackPageView,
      trackBatch,
      identify,
      reset,
      setUtmParams: setUtmParamsManual,
      getDeviceInfo
    }),
    [
      loading,
      error,
      sessionId,
      anonymousId,
      utmParams,
      trackEvent,
      trackPageView,
      trackBatch,
      identify,
      reset,
      setUtmParamsManual,
      getDeviceInfo
    ]
  );
}
function toApiError(error) {
  if (error instanceof ScaleMuleApiError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field
    };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Failed to load feature flags"
  };
}
function useFeatureFlags(options = {}) {
  const smContext = useScaleMule();
  const {
    environment = smContext.environment ?? "prod",
    context = {},
    keys,
    enabled = true
  } = options;
  const { client, publishableKey, gatewayUrl, bootstrapFlags } = smContext;
  const warnedRef = useRef(false);
  useEffect(() => {
    if (!warnedRef.current && (!keys || keys.length === 0)) {
      warnedRef.current = true;
      console.warn(
        'useFeatureFlags: "keys" option should be provided. Calling /evaluate/all without explicit keys is deprecated and will be blocked in a future release. Pass keys: ["flag1", "flag2"].'
      );
    }
  }, [keys]);
  const initialFlags = useMemo(() => {
    if (!bootstrapFlags) return {};
    const result = {};
    for (const [key, value] of Object.entries(bootstrapFlags)) {
      if (value && typeof value === "object" && "flag_key" in value) {
        result[key] = value;
      }
    }
    return result;
  }, [bootstrapFlags]);
  const hasBootstrap = Object.keys(initialFlags).length > 0;
  const [flags, setFlags] = useState(initialFlags);
  const [loading, setLoading] = useState(enabled && !hasBootstrap);
  const [error, setError] = useState(null);
  const contextRef = useRef(context);
  const keysRef = useRef(keys);
  const keysKey = useMemo(() => keys && keys.length > 0 ? [...keys].sort().join("|") : "", [keys]);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);
  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);
  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const currentKeys = keysRef.current;
      const payload = currentKeys && currentKeys.length > 0 ? { flag_keys: currentKeys, environment, context: contextRef.current } : { environment, context: contextRef.current };
      const endpoint2 = currentKeys && currentKeys.length > 0 ? "/v1/flags/evaluate/batch" : "/v1/flags/evaluate/all";
      let result;
      if (publishableKey && gatewayUrl) {
        const response = await fetch(`${gatewayUrl}${endpoint2}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": publishableKey
          },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error(`Flag evaluation failed: ${response.status}`);
        }
        const json = await response.json();
        result = json.data || json || {};
      } else {
        result = await client.post(endpoint2, payload);
      }
      setFlags(result || {});
      setError(null);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [client, enabled, environment, keysKey, publishableKey, gatewayUrl]);
  const bootstrapCoversKeys = useMemo(() => {
    if (!hasBootstrap || !keys || keys.length === 0) return false;
    if (!keys.every((k) => k in initialFlags)) return false;
    if (environment !== (smContext.environment ?? "prod")) return false;
    const contextKeys = Object.keys(context).filter((k) => k !== "ip_address");
    if (contextKeys.length > 0) return false;
    return true;
  }, [hasBootstrap, keys, initialFlags, environment, smContext.environment, context]);
  useEffect(() => {
    if (!bootstrapCoversKeys) {
      void refresh();
    }
  }, [refresh, bootstrapCoversKeys]);
  const isEnabled = useCallback(
    (flagKey, fallback = false) => {
      const evaluation = flags[flagKey];
      if (!evaluation) return fallback;
      return typeof evaluation.value === "boolean" ? evaluation.value : fallback;
    },
    [flags]
  );
  const getFlag = useCallback(
    (flagKey, fallback) => {
      const evaluation = flags[flagKey];
      if (!evaluation) return fallback;
      return evaluation.value ?? fallback;
    },
    [flags]
  );
  return {
    flags,
    loading,
    error,
    refresh,
    isEnabled,
    getFlag
  };
}
function getCsrfToken() {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)sm_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}
function usePushNotifications(options = {}) {
  const { serviceWorkerUrl = "/sw.js", pushProxyUrl = "/api/push", registrationSource, onNotification } = options;
  const { user } = useScaleMule();
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState("unsupported");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tokenId, setTokenId] = useState(null);
  const onNotificationRef = useRef(onNotification);
  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);
  const prevUserRef = useRef(null);
  const fetcher = useMemo(() => {
    async function proxyGet(path) {
      const res = await fetch(`${pushProxyUrl}/${path}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Request failed");
      return json.data;
    }
    async function proxyPost(path, body) {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: body ? JSON.stringify(body) : void 0
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Request failed");
      return json.data;
    }
    async function proxyPut(path, body) {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken()
        },
        body: body ? JSON.stringify(body) : void 0
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Request failed");
      return json.data;
    }
    async function proxyDelete(path) {
      const res = await fetch(`${pushProxyUrl}/${path}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": getCsrfToken()
        }
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || "Request failed");
    }
    return {
      getSettings: () => proxyGet("settings/me"),
      registerToken: (data) => proxyPost("register", data),
      unregisterToken: (id) => proxyDelete(`tokens/by-id/${id}`),
      associateUser: (id) => proxyPut(`tokens/by-id/${id}/user`, {}),
      disassociateUser: (id) => proxyDelete(`tokens/by-id/${id}/user`)
    };
  }, [pushProxyUrl]);
  const manager = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return new WebPushManager({ fetcher, serviceWorkerUrl, registrationSource });
    } catch {
      return null;
    }
  }, [fetcher, serviceWorkerUrl]);
  useEffect(() => {
    if (!manager) return;
    const supported = manager.isSupported();
    setIsSupported(supported);
    setPermission(manager.getPermissionState());
    if (supported) {
      const storedTokenId = manager.getTokenId();
      manager.isSubscribed().then((sub) => {
        if (!sub && storedTokenId) {
          manager.unsubscribe().catch(() => {
          });
          setIsSubscribed(false);
          setTokenId(null);
          setPermission(manager.getPermissionState());
        } else {
          setIsSubscribed(sub);
          setTokenId(manager.getTokenId());
        }
      });
    }
  }, [manager]);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    function handleMessage(event) {
      if (event.data?.type === "push-received") {
        onNotificationRef.current?.(event.data.payload);
      }
      if (event.data?.type === "push-subscription-expired") {
        if (manager) {
          manager.unsubscribe().catch(() => {
          });
        }
        setIsSubscribed(false);
        setTokenId(null);
        setPermission(typeof Notification !== "undefined" ? Notification.permission : "unsupported");
      }
    }
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, [manager]);
  useEffect(() => {
    if (!manager) return;
    const currentUserId = user?.id || null;
    const prevUserId = prevUserRef.current;
    if (currentUserId && !prevUserId && isSubscribed) {
      manager.associateUser().catch(() => {
      });
    }
    prevUserRef.current = currentUserId;
  }, [user?.id, manager, isSubscribed]);
  const subscribe = useCallback(async () => {
    if (!manager) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await manager.subscribe();
      if (result) {
        setIsSubscribed(true);
        setTokenId(result.tokenId);
        setPermission("granted");
      } else {
        setPermission(manager.getPermissionState());
      }
    } catch (e) {
      setError({
        code: "PUSH_SUBSCRIBE_ERROR",
        message: e instanceof Error ? e.message : "Failed to subscribe"
      });
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  const unsubscribe = useCallback(async () => {
    if (!manager) return;
    setIsLoading(true);
    setError(null);
    try {
      await manager.unsubscribe();
      setIsSubscribed(false);
      setTokenId(null);
    } catch (e) {
      setError({
        code: "PUSH_UNSUBSCRIBE_ERROR",
        message: e instanceof Error ? e.message : "Failed to unsubscribe"
      });
    } finally {
      setIsLoading(false);
    }
  }, [manager]);
  const disassociateUser = useCallback(async () => {
    if (!manager) return;
    try {
      await manager.disassociateUser();
    } catch {
    }
  }, [manager]);
  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribe,
    unsubscribe,
    disassociateUser,
    tokenId
  };
}
function useShare(options) {
  const { client, user } = useScaleMule();
  const [referralCode, setReferralCode] = useState(
    options?.referralCode ?? null
  );
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!user) {
      setReferralCode(options?.referralCode ?? null);
      setLoading(false);
      return;
    }
    if (!options?.autoFetchReferral) {
      setLoading(false);
      return;
    }
    if (options?.referralCode) {
      setReferralCode(options.referralCode);
      setLoading(false);
      return;
    }
    setReferralCode(null);
    let cancelled = false;
    setLoading(true);
    client.get("/v1/referrals/me").then((data) => {
      if (!cancelled) setReferralCode(data.referral_code);
    }).catch(() => {
      if (!cancelled) setReferralCode(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, options?.url, options?.referralCode, options?.autoFetchReferral, client]);
  const shareUrl = useMemo(() => {
    const raw = options?.url || (typeof window !== "undefined" ? window.location.href : "");
    if (!raw) return raw;
    try {
      const base = typeof window !== "undefined" ? window.location.origin : void 0;
      const u = new URL(raw, base);
      if (referralCode) {
        u.searchParams.set("rc", referralCode);
      }
      return u.toString();
    } catch {
      return raw;
    }
  }, [options?.url, referralCode]);
  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = shareUrl;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        return false;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2e3);
    return true;
  }, [shareUrl]);
  return { shareUrl, referralCode, copyLink, copied, loading };
}
function toApiError2(error) {
  if (error instanceof ScaleMuleApiError) {
    return {
      code: error.code,
      message: error.message,
      field: error.field
    };
  }
  return {
    code: "UNKNOWN",
    message: error instanceof Error ? error.message : "Feedback request failed"
  };
}
function useFeedback(options = {}) {
  const { client } = useScaleMule();
  const { status, type, enabled = true } = options;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (type) params.append("type", type);
      const qs = params.toString();
      const path = `/v1/feedback/items${qs ? "?" + qs : ""}`;
      const result = await client.get(path);
      setItems(Array.isArray(result) ? result : []);
      setError(null);
    } catch (err) {
      setError(toApiError2(err));
    } finally {
      setLoading(false);
    }
  }, [client, enabled, status, type]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const submit = useCallback(
    async (input) => {
      try {
        const created = await client.post("/v1/feedback/submit", input);
        setItems((prev) => [created, ...prev]);
        setError(null);
        return created;
      } catch (err) {
        const apiErr = toApiError2(err);
        setError(apiErr);
        throw err;
      }
    },
    [client]
  );
  return { items, loading, error, submit, refresh };
}
var ZERO = { value: 0, up_count: 0, down_count: 0, score: 0 };
function useVote({
  targetType,
  targetId,
  initialState,
  refetchOnMount = false,
  enabled = true
}) {
  const { client } = useScaleMule();
  const [state, setState] = useState(initialState ?? ZERO);
  const [isLoading, setIsLoading] = useState(!initialState && enabled);
  const [error, setError] = useState(null);
  const inFlight = useRef(null);
  const path = `/v1/social/${encodeURIComponent(targetType)}/${encodeURIComponent(targetId)}/vote`;
  const refetch = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await client.get(path);
      setState(data);
    } catch (e) {
      setError(e);
    } finally {
      setIsLoading(false);
    }
  }, [client, path, enabled]);
  useEffect(() => {
    if (!enabled) return;
    if (initialState && !refetchOnMount) return;
    void refetch();
  }, [enabled, refetch, initialState, refetchOnMount]);
  const cast = useCallback(
    async (value) => {
      const prev = state;
      const optimistic = applyVote(prev, value);
      setState(optimistic);
      setError(null);
      const send = async () => {
        try {
          const data = await client.put(path, { value });
          setState(data);
        } catch (e) {
          setState(prev);
          setError(e);
        }
      };
      const p = inFlight.current ? inFlight.current.then(send) : send();
      inFlight.current = p;
      await p;
      if (inFlight.current === p) inFlight.current = null;
    },
    [client, path, state]
  );
  return { state, isLoading, error, cast, refetch };
}
function applyVote(prev, next) {
  let { up_count, down_count } = prev;
  if (prev.value === 1) up_count = Math.max(0, up_count - 1);
  if (prev.value === -1) down_count = Math.max(0, down_count - 1);
  if (next === 1) up_count += 1;
  if (next === -1) down_count += 1;
  return {
    value: next,
    up_count,
    down_count,
    score: up_count - down_count
  };
}
var TYPE_LABELS = {
  bug_report: "Bug",
  feature_request: "Feature request",
  improvement: "Improvement",
  other: "Other"
};
var POSITION_STYLES = {
  "bottom-right": { bottom: 24, right: 24 },
  "bottom-left": { bottom: 24, left: 24 },
  "top-right": { top: 24, right: 24 },
  "top-left": { top: 24, left: 24 }
};
var STYLES = {
  trigger: {
    position: "fixed",
    zIndex: 999998,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 999,
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    background: "#1f2937",
    color: "#fff"
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.5)",
    zIndex: 999999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16
  },
  modal: {
    width: "min(440px, 100%)",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  modalDark: {
    background: "#0f172a",
    color: "#f8fafc"
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    opacity: 0.7
  },
  field: {
    width: "100%",
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid #e2e8f0",
    borderRadius: 6,
    boxSizing: "border-box",
    background: "transparent",
    color: "inherit"
  },
  textarea: {
    minHeight: 96,
    resize: "vertical"
  },
  rowEnd: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8
  },
  primaryBtn: {
    padding: "8px 14px",
    fontSize: 14,
    fontWeight: 600,
    border: "none",
    borderRadius: 6,
    background: "#2563eb",
    color: "#fff",
    cursor: "pointer"
  },
  secondaryBtn: {
    padding: "8px 14px",
    fontSize: 14,
    border: "1px solid #cbd5e1",
    borderRadius: 6,
    background: "transparent",
    color: "inherit",
    cursor: "pointer"
  },
  error: {
    fontSize: 13,
    color: "#dc2626"
  },
  note: {
    fontSize: 13,
    color: "#475569"
  },
  success: {
    fontSize: 14,
    fontWeight: 500,
    textAlign: "center",
    padding: "24px 8px"
  }
};
var ALL_TYPES = ["bug_report", "feature_request", "improvement", "other"];
function FeedbackWidget(props) {
  const sm = useScaleMule();
  const { client } = sm;
  const { submit } = useFeedback({ enabled: false });
  const [serverConfig, setServerConfig] = useState(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("feature_request");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(null);
  const [hoverRating, setHoverRating] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [done, setDone] = useState(false);
  const signedIn = Boolean(sm.user);
  const resolvedAllowedTypes = props.allowedTypes ?? serverConfig?.allowed_types ?? ALL_TYPES;
  const resolvedDefaultType = (props.defaultType && resolvedAllowedTypes.includes(props.defaultType) ? props.defaultType : resolvedAllowedTypes[0]) ?? "feature_request";
  const resolvedPosition = props.position ?? serverConfig?.widget_position ?? "bottom-right";
  const resolvedTheme = props.theme ?? serverConfig?.widget_theme ?? "auto";
  const allowAnonymous = serverConfig?.allow_anonymous ?? true;
  const anonymousBlocked = !signedIn && !allowAnonymous;
  useEffect(() => {
    let active = true;
    client.get("/v1/feedback/widget-config").then((config) => {
      if (active) setServerConfig(config);
    }).catch(() => {
      if (active) setServerConfig(null);
    }).finally(() => {
      if (active) setConfigLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    setType(
      (current) => resolvedAllowedTypes.includes(current) ? current : resolvedDefaultType
    );
  }, [resolvedAllowedTypes, resolvedDefaultType]);
  if (!configLoaded) {
    return null;
  }
  if (serverConfig && !serverConfig.enabled) {
    return null;
  }
  function reset() {
    setType(resolvedDefaultType);
    setTitle("");
    setDescription("");
    setEmail("");
    setRating(null);
    setHoverRating(null);
    setErrMsg(null);
    setDone(false);
  }
  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    if (anonymousBlocked) {
      setErrMsg("Please sign in to send feedback for this app");
      return;
    }
    if (!signedIn && !email.trim()) {
      setErrMsg("email is required when not signed in");
      return;
    }
    setSubmitting(true);
    setErrMsg(null);
    try {
      const tags = rating != null ? [`rating:${rating}`] : void 0;
      const item = await submit({
        type,
        title: title.trim(),
        description: description.trim(),
        email: signedIn ? void 0 : email.trim() || void 0,
        tags
      });
      setDone(true);
      props.onSubmitted?.(item);
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message) : "Submit failed";
      setErrMsg(message);
    } finally {
      setSubmitting(false);
    }
  }
  function handleClose() {
    setOpen(false);
    setTimeout(reset, 200);
  }
  const dark = resolvedTheme === "dark" || resolvedTheme === "auto" && typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        type: "button",
        onClick: () => setOpen(true),
        className: props.className,
        style: { ...STYLES.trigger, ...POSITION_STYLES[resolvedPosition] },
        children: props.triggerLabel ?? "Feedback"
      }
    ),
    open && /* @__PURE__ */ jsx("div", { role: "dialog", "aria-modal": "true", style: STYLES.overlay, onClick: handleClose, children: /* @__PURE__ */ jsx(
      "form",
      {
        onSubmit: handleSubmit,
        onClick: (e) => e.stopPropagation(),
        style: { ...STYLES.modal, ...dark ? STYLES.modalDark : null },
        children: done ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { style: STYLES.success, children: [
            /* @__PURE__ */ jsx("div", { style: { fontSize: 32, marginBottom: 8 }, children: "\u{1F389}" }),
            /* @__PURE__ */ jsx("div", { children: "Thanks \u2014 we got it." })
          ] }),
          /* @__PURE__ */ jsx("div", { style: STYLES.rowEnd, children: /* @__PURE__ */ jsx("button", { type: "button", style: STYLES.primaryBtn, onClick: handleClose, children: "Close" }) })
        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ jsx("strong", { style: { fontSize: 16 }, children: "Send feedback" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: handleClose,
                "aria-label": "Close",
                style: {
                  background: "transparent",
                  border: "none",
                  fontSize: 18,
                  cursor: "pointer",
                  color: "inherit"
                },
                children: "\xD7"
              }
            )
          ] }),
          props.enableRating !== false && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { style: STYLES.label, children: props.ratingLabel ?? "How would you rate your experience?" }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4, marginTop: 4 }, children: [
              [1, 2, 3, 4, 5].map((n) => {
                const active = (hoverRating ?? rating ?? 0) >= n;
                return /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    "aria-label": `${n} star${n === 1 ? "" : "s"}`,
                    onClick: () => setRating(rating === n ? null : n),
                    onMouseEnter: () => setHoverRating(n),
                    onMouseLeave: () => setHoverRating(null),
                    style: {
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      padding: 2,
                      fontSize: 24,
                      lineHeight: 1,
                      color: active ? "#f59e0b" : "#cbd5e1",
                      transition: "color 80ms ease"
                    },
                    children: active ? "\u2605" : "\u2606"
                  },
                  n
                );
              }),
              rating != null && /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: () => setRating(null),
                  style: {
                    marginLeft: 8,
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    opacity: 0.6,
                    fontSize: 12,
                    cursor: "pointer"
                  },
                  children: "clear"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            /* @__PURE__ */ jsx("div", { style: STYLES.label, children: "Type" }),
            /* @__PURE__ */ jsx(
              "select",
              {
                style: STYLES.field,
                value: type,
                onChange: (e) => setType(e.target.value),
                children: resolvedAllowedTypes.map((t) => /* @__PURE__ */ jsx("option", { value: t, children: TYPE_LABELS[t] }, t))
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            /* @__PURE__ */ jsx("div", { style: STYLES.label, children: "Title" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                style: STYLES.field,
                type: "text",
                value: title,
                onChange: (e) => setTitle(e.target.value),
                placeholder: "One-line summary",
                maxLength: 255,
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("label", { children: [
            /* @__PURE__ */ jsx("div", { style: STYLES.label, children: "Details" }),
            /* @__PURE__ */ jsx(
              "textarea",
              {
                style: { ...STYLES.field, ...STYLES.textarea },
                value: description,
                onChange: (e) => setDescription(e.target.value),
                placeholder: "What happened, what you expected, anything else helpful\u2026",
                required: true
              }
            )
          ] }),
          !signedIn && allowAnonymous && /* @__PURE__ */ jsxs("label", { children: [
            /* @__PURE__ */ jsx("div", { style: STYLES.label, children: "Email" }),
            /* @__PURE__ */ jsx(
              "input",
              {
                style: STYLES.field,
                type: "email",
                value: email,
                onChange: (e) => setEmail(e.target.value),
                placeholder: "you@example.com",
                required: true
              }
            )
          ] }),
          anonymousBlocked && /* @__PURE__ */ jsx("div", { style: STYLES.note, children: "This app only accepts feedback from signed-in users." }),
          errMsg && /* @__PURE__ */ jsx("div", { style: STYLES.error, children: errMsg }),
          /* @__PURE__ */ jsxs("div", { style: STYLES.rowEnd, children: [
            /* @__PURE__ */ jsx("button", { type: "button", style: STYLES.secondaryBtn, onClick: handleClose, children: "Cancel" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "submit",
                style: STYLES.primaryBtn,
                disabled: submitting || anonymousBlocked,
                children: submitting ? "Sending\u2026" : "Send"
              }
            )
          ] })
        ] })
      }
    ) })
  ] });
}
var ARROW_UP = "\u25B2";
var ARROW_DOWN = "\u25BC";
var STYLES2 = {
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6
  },
  rootStacked: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2
  },
  button: {
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
    cursor: "pointer",
    borderRadius: 9999,
    padding: "6px 10px",
    lineHeight: 1,
    fontSize: 14
  },
  buttonCompact: {
    padding: "3px 7px",
    fontSize: 12
  },
  buttonActiveUp: {
    background: "rgba(34,197,94,0.18)",
    borderColor: "rgba(34,197,94,0.45)",
    color: "#86efac"
  },
  buttonActiveDown: {
    background: "rgba(239,68,68,0.18)",
    borderColor: "rgba(239,68,68,0.45)",
    color: "#fca5a5"
  },
  score: {
    minWidth: 24,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600
  }
};
function VoteButton({
  targetType,
  targetId,
  initialState,
  layout = "horizontal",
  size = "regular",
  onSignInRequired,
  onError,
  classNames,
  upLabel = "Upvote",
  downLabel = "Downvote"
}) {
  const { isAuthenticated } = useAuth();
  const { state, cast, error } = useVote({
    targetType,
    targetId,
    initialState: initialState ?? null,
    enabled: isAuthenticated
  });
  const handleVote = useCallback(
    async (next) => {
      if (!isAuthenticated) {
        onSignInRequired?.();
        return;
      }
      const desired = state.value === next ? 0 : next;
      try {
        await cast(desired);
      } catch (e) {
        onError?.(e);
      }
    },
    [cast, isAuthenticated, onSignInRequired, onError, state.value]
  );
  useEffect(() => {
    if (error) onError?.(error);
  }, [error, onError]);
  const compactStyle = size === "compact" ? STYLES2.buttonCompact : {};
  const upActive = state.value === 1;
  const downActive = state.value === -1;
  const upBtn = /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      "aria-label": upLabel,
      "aria-pressed": upActive,
      title: isAuthenticated ? upLabel : "Sign in to vote",
      className: [classNames?.upButton, upActive ? classNames?.upButtonActive : void 0].filter(Boolean).join(" ") || void 0,
      onClick: () => void handleVote(1),
      style: classNames?.upButton ? void 0 : { ...STYLES2.button, ...compactStyle, ...upActive ? STYLES2.buttonActiveUp : {} },
      children: ARROW_UP
    }
  );
  const downBtn = /* @__PURE__ */ jsx(
    "button",
    {
      type: "button",
      "aria-label": downLabel,
      "aria-pressed": downActive,
      title: isAuthenticated ? downLabel : "Sign in to vote",
      className: [classNames?.downButton, downActive ? classNames?.downButtonActive : void 0].filter(Boolean).join(" ") || void 0,
      onClick: () => void handleVote(-1),
      style: classNames?.downButton ? void 0 : { ...STYLES2.button, ...compactStyle, ...downActive ? STYLES2.buttonActiveDown : {} },
      children: ARROW_DOWN
    }
  );
  const scoreClass = [
    classNames?.score,
    state.score > 0 ? classNames?.scorePositive : void 0,
    state.score < 0 ? classNames?.scoreNegative : void 0
  ].filter(Boolean).join(" ") || void 0;
  const scoreEl = /* @__PURE__ */ jsx("span", { className: scoreClass, style: classNames?.score ? void 0 : STYLES2.score, children: state.score });
  const rootStyle = layout === "stacked" ? STYLES2.rootStacked : STYLES2.root;
  return /* @__PURE__ */ jsxs("div", { className: classNames?.root, style: classNames?.root ? void 0 : rootStyle, children: [
    upBtn,
    scoreEl,
    downBtn
  ] });
}

// src/validation.ts
var phoneCountries = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "AE", name: "UAE", dialCode: "+971" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "NG", name: "Nigeria", dialCode: "+234" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" }
];
function normalizePhone(input) {
  if (!input || typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (trimmed.startsWith("00") && digits.length > 2) return `+${digits.slice(2)}`;
  return `+${digits}`;
}
function composePhone(countryDialCode, localNumber) {
  const dial = normalizePhone(countryDialCode);
  if (!dial) return "";
  const localDigits = (localNumber || "").replace(/\D/g, "");
  if (!localDigits) return "";
  return `${dial}${localDigits}`;
}
var validators = {
  /**
   * Validate email address format.
   * Matches RFC 5322 simplified pattern used by ScaleMule backend.
   */
  email: (email) => {
    if (!email || typeof email !== "string") return false;
    if (email.length > 254) return false;
    const atIndex = email.lastIndexOf("@");
    if (atIndex === -1 || atIndex > 64) return false;
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return re.test(email);
  },
  /**
   * Validate password strength.
   * Returns detailed result with errors and strength indicator.
   */
  password: (password) => {
    const errors = [];
    if (!password || typeof password !== "string") {
      return { valid: false, errors: ["Password is required"], strength: "weak" };
    }
    if (password.length < 8) {
      errors.push("At least 8 characters required");
    }
    if (password.length > 128) {
      errors.push("Maximum 128 characters");
    }
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    let strength = "weak";
    if (score >= 4) strength = "strong";
    else if (score >= 3) strength = "good";
    else if (score >= 2) strength = "fair";
    return {
      valid: errors.length === 0,
      errors,
      strength
    };
  },
  /**
   * Validate phone number in E.164 format.
   * ScaleMule requires E.164 format: +[country code][number]
   */
  phone: (phone) => {
    if (!phone || typeof phone !== "string") {
      return { valid: false, formatted: null, error: "Phone number is required" };
    }
    const rawDigits = phone.trim().replace(/\D/g, "");
    const hasIntlPrefix = phone.trim().startsWith("+") || phone.trim().startsWith("00");
    if (!hasIntlPrefix && /^\d{10}$/.test(rawDigits)) {
      return {
        valid: false,
        formatted: `+1${rawDigits}`,
        error: "Add country code (e.g., +1 for US)"
      };
    }
    const cleaned = normalizePhone(phone);
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (e164Regex.test(cleaned)) {
      return { valid: true, formatted: cleaned, error: null };
    }
    return {
      valid: false,
      formatted: null,
      error: "Use E.164 format: +[country code][number]"
    };
  },
  /**
   * Validate username format.
   * Alphanumeric with underscores, 3-30 characters.
   */
  username: (username) => {
    if (!username || typeof username !== "string") {
      return { valid: false, error: "Username is required" };
    }
    if (username.length < 3) {
      return { valid: false, error: "At least 3 characters required" };
    }
    if (username.length > 30) {
      return { valid: false, error: "Maximum 30 characters" };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return { valid: false, error: "Only letters, numbers, and underscores allowed" };
    }
    if (/^[_0-9]/.test(username)) {
      return { valid: false, error: "Must start with a letter" };
    }
    return { valid: true, error: null };
  },
  /**
   * Validate UUID format.
   * Accepts UUIDv1, v4, v7 formats.
   */
  uuid: (uuid) => {
    if (!uuid || typeof uuid !== "string") return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  },
  /**
   * Validate URL format.
   */
  url: (url) => {
    if (!url || typeof url !== "string") return false;
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  },
  /**
   * Validate file size against ScaleMule limits.
   * Default max is 100MB, can be customized per application.
   */
  fileSize: (bytes, maxMB = 100) => {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return { valid: false, error: "Invalid file size" };
    }
    if (!Number.isFinite(maxMB) || maxMB <= 0) {
      return { valid: false, error: "Invalid max file size" };
    }
    const maxBytes = maxMB * 1024 * 1024;
    if (bytes > maxBytes) {
      return { valid: false, error: `File exceeds ${maxMB}MB limit` };
    }
    if (bytes === 0) {
      return { valid: false, error: "File is empty" };
    }
    return { valid: true, error: null };
  },
  /**
   * Validate file type against allowed MIME types.
   */
  fileType: (mimeType, allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]) => {
    if (!mimeType || typeof mimeType !== "string") {
      return { valid: false, error: "Unknown file type" };
    }
    if (allowed.includes(mimeType)) {
      return { valid: true, error: null };
    }
    const category = mimeType.split("/")[0];
    if (allowed.includes(`${category}/*`)) {
      return { valid: true, error: null };
    }
    return { valid: false, error: `File type ${mimeType} not allowed` };
  },
  /**
   * Sanitize and validate a display name.
   */
  displayName: (name) => {
    if (!name || typeof name !== "string") {
      return { valid: false, sanitized: "", error: "Display name is required" };
    }
    const sanitized = name.trim().replace(/\s+/g, " ");
    if (sanitized.length < 1) {
      return { valid: false, sanitized, error: "Display name is required" };
    }
    if (sanitized.length > 100) {
      return { valid: false, sanitized: sanitized.slice(0, 100), error: "Maximum 100 characters" };
    }
    if (/[\x00-\x1F\x7F]/.test(sanitized)) {
      return { valid: false, sanitized: sanitized.replace(/[\x00-\x1F\x7F]/g, ""), error: "Invalid characters" };
    }
    return { valid: true, sanitized, error: null };
  }
};
function validateForm(data, rules) {
  const errors = {};
  for (const [field, validator] of Object.entries(rules)) {
    if (!validator) continue;
    const value = data[field];
    const result = validator(value);
    if (typeof result === "boolean") {
      if (!result) {
        errors[field] = "Invalid value";
      }
    } else if (!result.valid) {
      errors[field] = result.error || "Invalid value";
    }
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "password",
  "token",
  "secret",
  "key",
  "authorization",
  "cookie",
  "session",
  "credential",
  "api_key",
  "apikey",
  "api-key",
  "access_token",
  "refresh_token",
  "private_key",
  "client_secret"
]);
function isSensitiveKey(key) {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.has(lower) || Array.from(SENSITIVE_KEYS).some((s) => lower.includes(s));
}
function sanitizeForLog(data) {
  if (data === null || data === void 0) {
    return data;
  }
  if (typeof data !== "object") {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(sanitizeForLog);
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
function createSafeLogger(prefix) {
  return {
    log: (message, data) => {
      console.log(`${prefix} ${message}`, data ? sanitizeForLog(data) : "");
    },
    info: (message, data) => {
      console.info(`${prefix} ${message}`, data ? sanitizeForLog(data) : "");
    },
    warn: (message, data) => {
      console.warn(`${prefix} ${message}`, data ? sanitizeForLog(data) : "");
    },
    error: (message, data) => {
      console.error(`${prefix} ${message}`, data ? sanitizeForLog(data) : "");
    }
  };
}

export { FeedbackWidget, NarrationPlayer, ScaleMuleApiError, ScaleMuleClient, ScaleMuleMedia, ScaleMuleProvider, VoteButton, composePhone, createClient, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAudio, useAuth, useBilling, useContent, useFeatureFlags, useFeedback, useFileStatus, useMedia, useMoney, useMoneyClient, usePushNotifications, useRealtime, useScaleMule, useScaleMuleClient, useShare, useTtsJob, useUser, useVote, validateForm, validators };
