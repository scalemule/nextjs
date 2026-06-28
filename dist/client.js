'use strict';

// node_modules/@scalemule/sdk/dist/index.mjs
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var upload_resume_exports = {};
__export(upload_resume_exports, {
  UploadResumeStore: () => UploadResumeStore
});
var DB_NAME;
var STORE_NAME;
var DB_VERSION;
var MAX_AGE_MS;
var UploadResumeStore;
var init_upload_resume = __esm({
  "src/services/upload-resume.ts"() {
    DB_NAME = "sm_upload_sessions_v1";
    STORE_NAME = "sessions";
    DB_VERSION = 1;
    MAX_AGE_MS = 24 * 60 * 60 * 1e3;
    UploadResumeStore = class {
      constructor() {
        this.db = null;
      }
      /** Generate a deterministic resume key from upload identity */
      static async generateResumeKey(appId, userId, filename, size, lastModified) {
        const raw = `${appId}:${userId}:${filename}:${size}:${lastModified ?? 0}`;
        if (typeof crypto !== "undefined" && crypto.subtle) {
          const buffer = new TextEncoder().encode(raw);
          const hash2 = await crypto.subtle.digest("SHA-256", buffer);
          return Array.from(new Uint8Array(hash2)).map((b) => b.toString(16).padStart(2, "0")).join("");
        }
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
          const chr = raw.charCodeAt(i);
          hash = (hash << 5) - hash + chr;
          hash |= 0;
        }
        return `fallback_${Math.abs(hash).toString(36)}`;
      }
      /** Open the IndexedDB store. No-ops if IndexedDB is unavailable. */
      async open() {
        if (typeof indexedDB === "undefined") return;
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
              store.createIndex("updated_at", "updated_at");
            }
          };
          request.onsuccess = () => {
            this.db = request.result;
            resolve();
          };
          request.onerror = () => {
            reject(request.error);
          };
        });
      }
      /** Get a resume session by key. Returns null if not found or stale. */
      async get(key) {
        if (!this.db) return null;
        return new Promise((resolve) => {
          const tx = this.db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(key);
          request.onsuccess = () => {
            const entry = request.result;
            if (!entry) {
              resolve(null);
              return;
            }
            if (Date.now() - entry.updated_at > MAX_AGE_MS) {
              this.remove(key).catch(() => {
              });
              resolve(null);
              return;
            }
            resolve(entry.session);
          };
          request.onerror = () => resolve(null);
        });
      }
      /** Save a new resume session. */
      async save(key, session) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const entry = {
            key,
            session: { ...session, created_at: Date.now() },
            updated_at: Date.now()
          };
          const request = store.put(entry);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }
      /** Update a single completed part in an existing session. */
      async updatePart(key, partNumber, etag) {
        if (!this.db) return;
        return new Promise((resolve) => {
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const getRequest = store.get(key);
          getRequest.onsuccess = () => {
            const entry = getRequest.result;
            if (!entry) {
              resolve();
              return;
            }
            const existing = entry.session.completed_parts.find((p) => p.part_number === partNumber);
            if (!existing) {
              entry.session.completed_parts.push({ part_number: partNumber, etag });
            }
            entry.updated_at = Date.now();
            const putRequest = store.put(entry);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = () => resolve();
          };
          getRequest.onerror = () => resolve();
        });
      }
      /** Remove a resume session (e.g., after successful completion). */
      async remove(key) {
        if (!this.db) return;
        return new Promise((resolve) => {
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.delete(key);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        });
      }
      /** Purge all stale entries (older than MAX_AGE_MS). */
      async purgeStale() {
        if (!this.db) return 0;
        return new Promise((resolve) => {
          const cutoff = Date.now() - MAX_AGE_MS;
          const tx = this.db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const index = store.index("updated_at");
          const range = IDBKeyRange.upperBound(cutoff);
          const request = index.openCursor(range);
          let count = 0;
          request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
              cursor.delete();
              count++;
              cursor.continue();
            } else {
              resolve(count);
            }
          };
          request.onerror = () => resolve(0);
        });
      }
      /** Close the database connection. */
      close() {
        if (this.db) {
          this.db.close();
          this.db = null;
        }
      }
    };
  }
});
var upload_compression_exports = {};
__export(upload_compression_exports, {
  maybeCompressImage: () => maybeCompressImage
});
async function maybeCompressImage(file, userConfig, sessionId, telemetry) {
  const type = file.type?.toLowerCase() || "";
  if (!type.startsWith("image/")) return null;
  if (SKIP_TYPES.has(type)) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "format", type });
    return null;
  }
  if (!COMPRESSIBLE_TYPES.has(type)) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "unsupported_type", type });
    return null;
  }
  if (file.size < MIN_COMPRESS_SIZE) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "too_small", size: file.size });
    return null;
  }
  const networkType = getNetworkEffectiveType();
  const defaultProfile = { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 };
  const networkProfile = NETWORK_PROFILES[networkType] ?? defaultProfile;
  const config = {
    maxWidth: userConfig?.maxWidth ?? networkProfile.maxWidth,
    maxHeight: userConfig?.maxHeight ?? networkProfile.maxHeight,
    quality: userConfig?.quality ?? networkProfile.quality,
    maxSizeMB: userConfig?.maxSizeMB ?? networkProfile.maxSizeMB
  };
  telemetry?.emit(sessionId, "upload.compression.started", {
    original_size: file.size,
    network: networkType,
    target_quality: config.quality
  });
  try {
    const imageCompression = await loadImageCompression();
    if (!imageCompression) {
      telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "library_unavailable" });
      return null;
    }
    const compressed = await imageCompression(file, {
      maxSizeMB: config.maxSizeMB,
      maxWidthOrHeight: Math.max(config.maxWidth, config.maxHeight),
      initialQuality: config.quality,
      useWebWorker: true,
      fileType: type === "image/png" ? "image/webp" : void 0
    });
    if (compressed.size >= file.size * 0.95) {
      telemetry?.emit(sessionId, "upload.compression.skipped", {
        reason: "no_size_reduction",
        original_size: file.size,
        compressed_size: compressed.size
      });
      return null;
    }
    telemetry?.emit(sessionId, "upload.compression.completed", {
      original_size: file.size,
      compressed_size: compressed.size,
      ratio: (compressed.size / file.size).toFixed(2)
    });
    return compressed;
  } catch (err) {
    telemetry?.emit(sessionId, "upload.compression.skipped", {
      reason: "error",
      error: err instanceof Error ? err.message : "Unknown compression error"
    });
    return null;
  }
}
async function loadImageCompression() {
  if (cachedImport === false) return null;
  if (cachedImport) return cachedImport;
  try {
    const mod = await Function('return import("browser-image-compression")')();
    cachedImport = mod.default || mod;
    return cachedImport;
  } catch {
    cachedImport = false;
    return null;
  }
}
function getNetworkEffectiveType() {
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const conn = navigator.connection;
    return conn?.effectiveType || "4g";
  }
  return "4g";
}
var MIN_COMPRESS_SIZE;
var COMPRESSIBLE_TYPES;
var SKIP_TYPES;
var NETWORK_PROFILES;
var cachedImport;
var STORAGE_KEYS = {
  SESSION: "scalemule_session",
  USER_ID: "scalemule_user_id",
  WORKSPACE_ID: "scalemule_workspace_id",
  ANONYMOUS_ID: "scalemule_anonymous_id",
  SESSION_POOL: "scalemule_session_pool",
  ACTIVE_ACCOUNT: "scalemule_active_account",
  KNOWN_ACCOUNTS: "scalemule_known_accounts",
  OFFLINE_QUEUE: "scalemule_offline_queue"
};
var LEGACY_ANONYMOUS_ID_KEYS = ["sm_anonymous_id"];
function generateAnonymousId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
var inFlight = /* @__PURE__ */ new WeakMap();
function ensureAnonymousId(storage) {
  const existing = inFlight.get(storage);
  if (existing) return existing;
  const promise = (async () => {
    try {
      return await resolveAnonymousId(storage);
    } finally {
      inFlight.delete(storage);
    }
  })();
  inFlight.set(storage, promise);
  return promise;
}
async function resolveAnonymousId(storage) {
  const canonical = await storage.getItem(STORAGE_KEYS.ANONYMOUS_ID);
  if (canonical) {
    for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
      const legacy = await storage.getItem(legacyKey);
      if (legacy !== canonical) {
        try {
          await storage.setItem(legacyKey, canonical);
        } catch {
        }
      }
    }
    return canonical;
  }
  for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
    const legacy = await storage.getItem(legacyKey);
    if (legacy) {
      try {
        await storage.setItem(STORAGE_KEYS.ANONYMOUS_ID, legacy);
      } catch {
      }
      return legacy;
    }
  }
  const fresh = generateAnonymousId();
  try {
    await storage.setItem(STORAGE_KEYS.ANONYMOUS_ID, fresh);
  } catch {
  }
  for (const legacyKey of LEGACY_ANONYMOUS_ID_KEYS) {
    try {
      await storage.setItem(legacyKey, fresh);
    } catch {
    }
  }
  return fresh;
}
var PHONE_COUNTRIES = [
  { code: "US", name: "United States", dialCode: "+1" },
  { code: "CA", name: "Canada", dialCode: "+1" },
  { code: "GB", name: "United Kingdom", dialCode: "+44" },
  { code: "AU", name: "Australia", dialCode: "+61" },
  { code: "DE", name: "Germany", dialCode: "+49" },
  { code: "FR", name: "France", dialCode: "+33" },
  { code: "IT", name: "Italy", dialCode: "+39" },
  { code: "ES", name: "Spain", dialCode: "+34" },
  { code: "NL", name: "Netherlands", dialCode: "+31" },
  { code: "BE", name: "Belgium", dialCode: "+32" },
  { code: "CH", name: "Switzerland", dialCode: "+41" },
  { code: "AT", name: "Austria", dialCode: "+43" },
  { code: "SE", name: "Sweden", dialCode: "+46" },
  { code: "NO", name: "Norway", dialCode: "+47" },
  { code: "DK", name: "Denmark", dialCode: "+45" },
  { code: "FI", name: "Finland", dialCode: "+358" },
  { code: "IE", name: "Ireland", dialCode: "+353" },
  { code: "PT", name: "Portugal", dialCode: "+351" },
  { code: "PL", name: "Poland", dialCode: "+48" },
  { code: "CZ", name: "Czech Republic", dialCode: "+420" },
  { code: "GR", name: "Greece", dialCode: "+30" },
  { code: "RU", name: "Russia", dialCode: "+7" },
  { code: "JP", name: "Japan", dialCode: "+81" },
  { code: "KR", name: "South Korea", dialCode: "+82" },
  { code: "CN", name: "China", dialCode: "+86" },
  { code: "HK", name: "Hong Kong", dialCode: "+852" },
  { code: "TW", name: "Taiwan", dialCode: "+886" },
  { code: "SG", name: "Singapore", dialCode: "+65" },
  { code: "MY", name: "Malaysia", dialCode: "+60" },
  { code: "TH", name: "Thailand", dialCode: "+66" },
  { code: "VN", name: "Vietnam", dialCode: "+84" },
  { code: "PH", name: "Philippines", dialCode: "+63" },
  { code: "ID", name: "Indonesia", dialCode: "+62" },
  { code: "IN", name: "India", dialCode: "+91" },
  { code: "PK", name: "Pakistan", dialCode: "+92" },
  { code: "BD", name: "Bangladesh", dialCode: "+880" },
  { code: "AE", name: "UAE", dialCode: "+971" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966" },
  { code: "IL", name: "Israel", dialCode: "+972" },
  { code: "TR", name: "Turkey", dialCode: "+90" },
  { code: "EG", name: "Egypt", dialCode: "+20" },
  { code: "ZA", name: "South Africa", dialCode: "+27" },
  { code: "NG", name: "Nigeria", dialCode: "+234" },
  { code: "KE", name: "Kenya", dialCode: "+254" },
  { code: "BR", name: "Brazil", dialCode: "+55" },
  { code: "MX", name: "Mexico", dialCode: "+52" },
  { code: "AR", name: "Argentina", dialCode: "+54" },
  { code: "CL", name: "Chile", dialCode: "+56" },
  { code: "CO", name: "Colombia", dialCode: "+57" },
  { code: "PE", name: "Peru", dialCode: "+51" },
  { code: "NZ", name: "New Zealand", dialCode: "+64" }
];
[...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
init_upload_resume();

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
var SESSION_STORAGE_KEY2 = STORAGE_KEYS.SESSION;
var USER_ID_STORAGE_KEY2 = STORAGE_KEYS.USER_ID;
var WORKSPACE_STORAGE_KEY2 = STORAGE_KEYS.WORKSPACE_ID;
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
      this.storage.setItem(WORKSPACE_STORAGE_KEY2, id);
    } else {
      this.storage.removeItem(WORKSPACE_STORAGE_KEY2);
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
    const token = await this.storage.getItem(SESSION_STORAGE_KEY2);
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY2);
    if (token) this.sessionToken = token;
    if (userId) this.userId = userId;
    const wsId = await this.storage.getItem(WORKSPACE_STORAGE_KEY2);
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
    await this.storage.setItem(SESSION_STORAGE_KEY2, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY2, userId);
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
    await this.storage.removeItem(SESSION_STORAGE_KEY2);
    await this.storage.removeItem(USER_ID_STORAGE_KEY2);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY2);
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

exports.ScaleMuleClient = ScaleMuleClient;
exports.createClient = createClient;
