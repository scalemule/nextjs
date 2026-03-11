'use strict';

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
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
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
      xhr.send(formData);
    });
  }
};
function createClient(config) {
  return new ScaleMuleClient(config);
}

exports.ScaleMuleClient = ScaleMuleClient;
exports.createClient = createClient;
