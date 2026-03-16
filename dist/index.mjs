import { createContext, useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { jsx } from 'react/jsx-runtime';

// src/provider.tsx

// src/types/index.ts
var ScaleMuleApiError = class extends Error {
  constructor(error) {
    super(error.message);
    this.name = "ScaleMuleApiError";
    this.code = error.code;
    this.field = error.field;
  }
};

// src/client.ts
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
var SESSION_STORAGE_KEY = "scalemule_session";
var USER_ID_STORAGE_KEY = "scalemule_user_id";
var WORKSPACE_STORAGE_KEY = "scalemule_workspace_id";
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
    this.apiKey = config.apiKey;
    this.applicationId = config.applicationId || null;
    this.gatewayUrl = resolveGatewayUrl(config);
    this.debug = config.debug || false;
    this.storage = config.storage || createDefaultStorage();
    this.enableRateLimitQueue = config.enableRateLimitQueue || false;
    this.enableOfflineQueue = config.enableOfflineQueue || false;
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
    if (token) {
      this.resolveSessionPending();
    }
    if (this.debug) {
      console.log("[ScaleMule] Initialized with session:", !!token);
    }
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
    const url = `${this.gatewayUrl}${path}`;
    const headers = this.buildHeaders(options);
    const maxRetries = options.skipRetry ? 0 : options.retries ?? 2;
    const timeout = options.timeout || 3e4;
    if (this.debug) {
      console.log(`[ScaleMule] ${options.method || "GET"} ${path}`);
    }
    let lastError = null;
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
        const text = await response.text();
        let responseData = null;
        try {
          responseData = text ? JSON.parse(text) : null;
        } catch {
        }
        if (!response.ok) {
          const rawError = responseData?.error;
          const error = rawError && typeof rawError === "object" ? rawError : { code: `HTTP_${response.status}`, message: typeof rawError === "string" ? rawError : responseData?.message || text || response.statusText };
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
  publishableKey,
  children,
  onLogin,
  onLogout,
  onAuthError,
  bootstrapFlags
}) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const client = useMemo(
    () => createClient({
      apiKey,
      applicationId,
      environment,
      gatewayUrl,
      debug,
      storage,
      pendingSessionInit: !!authProxyUrl
    }),
    [apiKey, applicationId, environment, gatewayUrl, debug, storage, authProxyUrl]
  );
  useEffect(() => {
    let mounted = true;
    async function initialize() {
      try {
        await client.initialize();
        const cachedUser = getCachedUser();
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
            if (mounted && debug) {
              console.debug("[ScaleMule] Auth proxy session check failed");
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
  }, [client, debug, onAuthError, authProxyUrl]);
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
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      gatewayUrl: gatewayUrl || (environment === "dev" ? "https://api-dev.scalemule.com" : "https://api.scalemule.com"),
      environment: environment || void 0,
      bootstrapFlags
    }),
    [client, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, gatewayUrl, environment, bootstrapFlags]
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
function getCookie(name) {
  if (typeof document === "undefined") return void 0;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
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
  const response = await fetch(`${proxyUrl}/${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : void 0,
    credentials: "include"
    // Include cookies for session management
  });
  const data = await response.json();
  return data;
}
function useAuth() {
  const { client, user, setUser, initializing, error, setError, authProxyUrl } = useScaleMule();
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
    [client, setError, authProxyUrl]
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
          await client.post("/v1/auth/verify-email", { token });
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
      const data = await client.get("/v1/auth/oauth/accounts");
      return data.accounts;
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        setError(err);
      }
      throw err;
    }
  }, [client, setError]);
  const linkAccount = useCallback(
    async (config) => {
      setError(null);
      if (!user) {
        const err = {
          code: "NOT_AUTHENTICATED",
          message: "Must be logged in to link accounts"
        };
        setError(err);
        throw err;
      }
      let linkData;
      try {
        linkData = await client.post("/v1/auth/oauth/link", {
          provider: config.provider,
          redirect_url: config.redirectUrl,
          scopes: config.scopes
        });
      } catch (err) {
        if (err instanceof ScaleMuleApiError) {
          setError(err);
        }
        throw err;
      }
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("scalemule_oauth_state", linkData.state);
      }
      return linkData;
    },
    [client, user, setError]
  );
  const unlinkAccount = useCallback(
    async (provider) => {
      setError(null);
      try {
        await client.delete(`/v1/auth/oauth/accounts/${provider}`);
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
      loginWithPhone
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
      loginWithPhone
    ]
  );
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
        return await client.post("/v1/billing/connected-accounts", data);
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
      return await client.get("/v1/billing/connected-accounts/me");
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
        return await client.get(`/v1/billing/connected-accounts/${id}`);
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
          `/v1/billing/connected-accounts/${id}/onboarding-link`,
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
        return await client.get(
          `/v1/billing/connected-accounts/${id}/balance`
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
  const createPayment = useCallback(
    async (data) => {
      setError(null);
      setLoading(true);
      try {
        return await client.post("/v1/billing/payments", data);
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
  const getPayment = useCallback(
    async (id) => {
      setError(null);
      setLoading(true);
      try {
        return await client.get(`/v1/billing/payments/${id}`);
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
  const listPayments = useCallback(
    async (params) => {
      setError(null);
      setLoading(true);
      try {
        const query = params ? "?" + Object.entries(params).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
        return await client.get(`/v1/billing/payments${query}`);
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
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
        return await client.post(`/v1/billing/payments/${id}/refund`, data);
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
  const getPayoutHistory = useCallback(
    async (accountId, params) => {
      setError(null);
      setLoading(true);
      try {
        const query = params ? "?" + Object.entries(params).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
        return await client.get(
          `/v1/billing/connected-accounts/${accountId}/payouts${query}`
        );
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
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
          `/v1/billing/connected-accounts/${accountId}/payout-schedule`
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
          `/v1/billing/connected-accounts/${accountId}/payout-schedule`,
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
        const query = params ? "?" + Object.entries(params).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
        return await client.get(`/v1/billing/transactions${query}`);
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: "UNKNOWN", message: err instanceof Error ? err.message : "Unknown error" };
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
        const query = params ? "?" + Object.entries(params).filter(([, v]) => v !== void 0).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
        return await client.get(
          `/v1/billing/transactions/summary${query}`
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
  const createSetupSession = useCallback(
    async (data) => {
      setError(null);
      setLoading(true);
      try {
        const result = await client.post(
          "/v1/billing/setup-sessions",
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
function useRealtime(options = {}) {
  const {
    autoConnect = true,
    events,
    autoReconnect = true,
    maxReconnectAttempts = 5,
    reconnectDelay = 1e3
  } = options;
  const { client, user, setUser } = useScaleMule();
  const [status, setStatus] = useState("disconnected");
  const [error, setError] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef(null);
  const subscribersRef = useRef(/* @__PURE__ */ new Map());
  const getWebSocketUrl = useCallback(() => {
    const gatewayUrl = client.getGatewayUrl();
    const wsUrl = gatewayUrl.replace(/^https?:\/\//, "wss://").replace(/^http:\/\//, "ws://");
    return `${wsUrl}/v1/realtime`;
  }, [client]);
  const handleMessage = useCallback(
    (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastMessage(message);
        switch (message.event) {
          case "user.updated":
            if (user && message.data.id === user.id) {
              setUser(message.data);
            }
            break;
          case "session.expired":
            client.clearSession();
            setUser(null);
            break;
        }
        const subscribers = subscribersRef.current.get(message.event);
        if (subscribers) {
          subscribers.forEach((callback) => callback(message.data));
        }
        const wildcardSubscribers = subscribersRef.current.get("*");
        if (wildcardSubscribers) {
          wildcardSubscribers.forEach((callback) => callback(message));
        }
      } catch (err) {
        console.error("[ScaleMule Realtime] Failed to parse message:", err);
      }
    },
    [client, user, setUser]
  );
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }
    if (!user) {
      setError({ code: "NOT_AUTHENTICATED", message: "Must be logged in to connect" });
      return;
    }
    const applicationId = client.getApplicationId();
    if (!applicationId) {
      setError({ code: "MISSING_APP_ID", message: "applicationId is required for realtime features. Add it to your ScaleMuleProvider config." });
      return;
    }
    setStatus("connecting");
    setError(null);
    const url = getWebSocketUrl();
    try {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        const sessionToken = client.getSessionToken();
        ws.send(JSON.stringify({
          type: "auth",
          token: sessionToken,
          app_id: applicationId
        }));
      };
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "auth_success") {
            setStatus("connected");
            reconnectAttempts.current = 0;
            if (events && events.length > 0) {
              ws.send(JSON.stringify({ type: "subscribe", events }));
            }
            return;
          }
          if (message.type === "error") {
            setError({ code: "AUTH_ERROR", message: message.message || "Authentication failed" });
            setStatus("disconnected");
            ws.close(1e3);
            return;
          }
          handleMessage(event);
        } catch (err) {
          console.error("[ScaleMule Realtime] Failed to parse message:", err);
        }
      };
      ws.onerror = () => {
        setError({ code: "WEBSOCKET_ERROR", message: "Connection error" });
      };
      ws.onclose = (event) => {
        setStatus("disconnected");
        wsRef.current = null;
        if (autoReconnect && event.code !== 1e3 && reconnectAttempts.current < maxReconnectAttempts) {
          setStatus("reconnecting");
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts.current);
          reconnectAttempts.current++;
          reconnectTimeout.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
      wsRef.current = ws;
    } catch (err) {
      setError({
        code: "WEBSOCKET_CONNECT_FAILED",
        message: err instanceof Error ? err.message : "Failed to connect"
      });
      setStatus("disconnected");
    }
  }, [user, client, getWebSocketUrl, events, handleMessage, autoReconnect, maxReconnectAttempts, reconnectDelay]);
  const disconnect = useCallback(() => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1e3, "Client disconnect");
      wsRef.current = null;
    }
    setStatus("disconnected");
    reconnectAttempts.current = 0;
  }, []);
  const subscribe = useCallback(
    (event, callback) => {
      if (!subscribersRef.current.has(event)) {
        subscribersRef.current.set(event, /* @__PURE__ */ new Set());
      }
      const typedCallback = callback;
      subscribersRef.current.get(event).add(typedCallback);
      return () => {
        const subscribers = subscribersRef.current.get(event);
        if (subscribers) {
          subscribers.delete(typedCallback);
          if (subscribers.size === 0) {
            subscribersRef.current.delete(event);
          }
        }
      };
    },
    []
  );
  const send = useCallback((event, data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    } else {
      console.warn("[ScaleMule Realtime] Cannot send - not connected");
    }
  }, []);
  useEffect(() => {
    if (autoConnect && user) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, user, connect, disconnect]);
  return useMemo(
    () => ({
      status,
      error,
      connect,
      disconnect,
      subscribe,
      send,
      lastMessage
    }),
    [status, error, connect, disconnect, subscribe, send, lastMessage]
  );
}
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
function getOrCreateIds(sessionStorageKey, anonymousStorageKey) {
  if (typeof window === "undefined") {
    return {
      sessionId: null,
      anonymousId: null,
      sessionStart: Date.now()
    };
  }
  const storage = typeof sessionStorage !== "undefined" ? sessionStorage : void 0;
  const localStorage_ = typeof localStorage !== "undefined" ? localStorage : void 0;
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
  let anonymousId = getStorageItem(localStorage_, anonymousStorageKey);
  if (!anonymousId) {
    anonymousId = generateUUID();
    setStorageItem(localStorage_, anonymousStorageKey, anonymousId);
  }
  return { sessionId, anonymousId, sessionStart };
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
  if (source) utm.utm_source = source;
  if (medium) utm.utm_medium = medium;
  if (campaign) utm.utm_campaign = campaign;
  if (term) utm.utm_term = term;
  if (content) utm.utm_content = content;
  if (!utm.utm_source && (params.get("gclid") || params.get("gad_source") || params.get("wbraid") || params.get("gbraid"))) {
    utm.utm_source = "google";
    utm.utm_medium = utm.utm_medium || "cpc";
    const gadCampaign = params.get("gad_campaignid");
    if (gadCampaign && !utm.utm_campaign) {
      utm.utm_campaign = gadCampaign;
    }
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
    anonymousStorageKey = "sm_anonymous_id",
    useV2 = true
  } = options;
  const shouldAutoCaptureUtmParams = autoCaptureUtmParams ?? autoCapturUtmParams ?? true;
  const { client, user, analyticsProxyUrl, publishableKey, gatewayUrl } = useScaleMule();
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
    const ids = getOrCreateIds(sessionStorageKey, anonymousStorageKey);
    sessionIdRef.current = ids.sessionId;
    anonymousIdRef.current = ids.anonymousId;
    sessionStartRef.current = ids.sessionStart;
    idsReadyRef.current = true;
    setSessionId(ids.sessionId);
    setAnonymousId(ids.anonymousId);
    if (eventQueue.current.length > 0) {
      const queue = eventQueue.current;
      eventQueue.current = [];
      setTimeout(() => {
        for (const event of queue) {
          sendEventRef.current?.(event);
        }
      }, 0);
    }
  }, [autoGenerateSessionId, sessionStorageKey, anonymousStorageKey]);
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
      if (analyticsProxyUrl) {
        fetch(analyticsProxyUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fullEvent)
        }).catch((err) => {
          console.debug("[ScaleMule Analytics] Proxy tracking failed:", err);
        });
        return { tracked: 1, session_id: sessionIdRef.current || void 0 };
      }
      if (publishableKey && gatewayUrl) {
        const endpoint2 = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
        fetch(`${gatewayUrl}${endpoint2}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": publishableKey
          },
          body: JSON.stringify(fullEvent)
        }).catch((err) => {
          console.debug("[ScaleMule Analytics] Direct tracking failed:", err);
        });
        return { tracked: 1, session_id: sessionIdRef.current || void 0 };
      }
      const endpoint = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
      return await client.post(endpoint, fullEvent);
    },
    // Note: sessionId removed - we use ref to keep this stable
    [client, buildFullEvent, useV2, analyticsProxyUrl, publishableKey, gatewayUrl]
  );
  sendEventRef.current = sendEvent;
  const trackEvent = useCallback(
    async (event) => {
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
    [sendEvent]
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
            fetch(analyticsProxyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(event)
            }).catch((err) => {
              console.debug("[ScaleMule Analytics] Proxy batch tracking failed:", err);
            });
          }
          setLoading(false);
          return { tracked: events.length, session_id: sessionIdRef.current || void 0 };
        }
        if (publishableKey && gatewayUrl) {
          const endpoint2 = useV2 ? "/v1/analytics/v2/events/batch" : "/v1/analytics/events/batch";
          fetch(`${gatewayUrl}${endpoint2}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": publishableKey
            },
            body: JSON.stringify({ events: fullEvents })
          }).catch((err) => {
            console.debug("[ScaleMule Analytics] Direct batch tracking failed:", err);
          });
          setLoading(false);
          return { tracked: events.length, session_id: sessionIdRef.current || void 0 };
        }
        const endpoint = useV2 ? "/v1/analytics/v2/events/batch" : "/v1/analytics/events/batch";
        return await client.post(endpoint, {
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
      const endpoint = currentKeys && currentKeys.length > 0 ? "/v1/flags/evaluate/batch" : "/v1/flags/evaluate/all";
      let result;
      if (publishableKey && gatewayUrl) {
        const response = await fetch(`${gatewayUrl}${endpoint}`, {
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
        result = await client.post(endpoint, payload);
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

export { ScaleMuleApiError, ScaleMuleClient, ScaleMuleProvider, composePhone, createClient, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAuth, useBilling, useContent, useFeatureFlags, useRealtime, useScaleMule, useScaleMuleClient, useUser, validateForm, validators };
