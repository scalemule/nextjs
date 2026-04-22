import { createContext, useState, useMemo, useEffect, useCallback, useContext, useRef } from 'react';
import { createMoneyClient } from '@scalemule/money';
export { MoneyClient, createMoneyClient } from '@scalemule/money';
import { jsx } from 'react/jsx-runtime';

var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/@scalemule/sdk/dist/chunk-3FTGBRLU.mjs
var DB_NAME, STORE_NAME, DB_VERSION, MAX_AGE_MS, UploadResumeStore;
var init_chunk_3FTGBRLU = __esm({
  "node_modules/@scalemule/sdk/dist/chunk-3FTGBRLU.mjs"() {
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

// node_modules/@scalemule/sdk/dist/upload-resume-RXLHBH5E.mjs
var upload_resume_RXLHBH5E_exports = {};
__export(upload_resume_RXLHBH5E_exports, {
  UploadResumeStore: () => UploadResumeStore
});
var init_upload_resume_RXLHBH5E = __esm({
  "node_modules/@scalemule/sdk/dist/upload-resume-RXLHBH5E.mjs"() {
    init_chunk_3FTGBRLU();
  }
});

// node_modules/@scalemule/sdk/dist/upload-compression-VOUJRAIM.mjs
var upload_compression_VOUJRAIM_exports = {};
__export(upload_compression_VOUJRAIM_exports, {
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
var MIN_COMPRESS_SIZE, COMPRESSIBLE_TYPES, SKIP_TYPES, NETWORK_PROFILES, cachedImport;
var init_upload_compression_VOUJRAIM = __esm({
  "node_modules/@scalemule/sdk/dist/upload-compression-VOUJRAIM.mjs"() {
    MIN_COMPRESS_SIZE = 100 * 1024;
    COMPRESSIBLE_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/tiff"]);
    SKIP_TYPES = /* @__PURE__ */ new Set(["image/gif", "image/svg+xml", "image/webp", "image/avif"]);
    NETWORK_PROFILES = {
      "slow-2g": { maxWidth: 1280, maxHeight: 1280, quality: 0.6, maxSizeMB: 0.5 },
      "2g": { maxWidth: 1600, maxHeight: 1600, quality: 0.65, maxSizeMB: 1 },
      "3g": { maxWidth: 2048, maxHeight: 2048, quality: 0.75, maxSizeMB: 2 },
      "4g": { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 }
    };
    cachedImport = null;
  }
});

// node_modules/@scalemule/sdk/dist/index.mjs
init_chunk_3FTGBRLU();
function buildClientContextHeaders(context) {
  if (!context) return {};
  const headers = {};
  if (context.ip) {
    headers["x-sm-forwarded-client-ip"] = context.ip;
    headers["X-Client-IP"] = context.ip;
  }
  if (context.userAgent) headers["X-Client-User-Agent"] = context.userAgent;
  if (context.deviceFingerprint) headers["X-Client-Device-Fingerprint"] = context.deviceFingerprint;
  if (context.referrer) headers["X-Client-Referrer"] = context.referrer;
  return headers;
}
var SDK_VERSION = "0.0.1";
var DEFAULT_TIMEOUT = 3e4;
var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_BACKOFF_MS = 300;
var MAX_BACKOFF_MS = 3e4;
var SESSION_STORAGE_KEY = "scalemule_session";
var USER_ID_STORAGE_KEY = "scalemule_user_id";
var OFFLINE_QUEUE_KEY = "scalemule_offline_queue";
var WORKSPACE_STORAGE_KEY = "scalemule_workspace_id";
var ANONYMOUS_ID_STORAGE_KEY = "scalemule_anonymous_id";
var SESSION_POOL_KEY = "scalemule_session_pool";
var ACTIVE_ACCOUNT_KEY = "scalemule_active_account";
var KNOWN_ACCOUNTS_KEY = "scalemule_known_accounts";
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getBackoffDelay(attempt, baseDelay) {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return Math.min(exponential + jitter, MAX_BACKOFF_MS);
}
function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
function statusToErrorCode(status) {
  switch (status) {
    case 400:
      return "validation_error";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 409:
      return "conflict";
    case 422:
      return "validation_error";
    case 429:
      return "rate_limited";
    default:
      return status >= 500 ? "internal_error" : `http_${status}`;
  }
}
var MAX_KNOWN_ACCOUNTS = 10;
function maskEmail(email) {
  const parts = email.split("@");
  const local = parts[0] ?? "";
  const domain = parts[1];
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
function applyPrivacy(account, privacy) {
  switch (privacy) {
    case "full":
      return {
        userId: account.userId,
        email: account.email,
        fullName: account.fullName,
        avatarUrl: account.avatarUrl,
        provider: account.provider,
        lastActiveAt: account.lastActiveAt
      };
    case "masked":
      return {
        userId: account.userId,
        email: account.email ? maskEmail(account.email) : void 0,
        fullName: account.fullName && account.fullName.length > 0 ? `${account.fullName[0].toUpperCase()}.` : void 0,
        provider: account.provider,
        lastActiveAt: account.lastActiveAt,
        colorIndex: stableColorIndex(account.userId)
      };
    case "minimal":
      return {
        userId: account.userId,
        provider: account.provider,
        lastActiveAt: account.lastActiveAt,
        displayLabel: "Account",
        colorIndex: stableColorIndex(account.userId)
      };
  }
}
function createDefaultStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key)
    };
  }
  const memory = /* @__PURE__ */ new Map();
  return {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => {
      memory.set(key, value);
    },
    removeItem: (key) => {
      memory.delete(key);
    }
  };
}
var RateLimitQueue = class {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.rateLimitedUntil = 0;
  }
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
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const now = Date.now();
      if (now < this.rateLimitedUntil) {
        await sleep(this.rateLimitedUntil - now);
      }
      const request = this.queue.shift();
      if (!request) continue;
      try {
        const result = await request.execute();
        if (result.error?.code === "rate_limited") {
          this.queue.unshift(request);
          const retryAfter = result.error.details?.retryAfter || 60;
          this.rateLimitedUntil = Date.now() + retryAfter * 1e3;
        } else {
          request.resolve(result);
        }
      } catch (error) {
        request.reject(error);
      }
    }
    this.processing = false;
  }
  updateFromHeaders(headers) {
    const retryAfter = headers.get("Retry-After");
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        this.rateLimitedUntil = Date.now() + seconds * 1e3;
      }
    }
  }
  get length() {
    return this.queue.length;
  }
  get isRateLimited() {
    return Date.now() < this.rateLimitedUntil;
  }
};
var OfflineQueue = class {
  constructor(storage) {
    this.queue = [];
    this.onOnlineCallback = null;
    this.storage = storage;
    this.loadFromStorage();
    this.setupListeners();
  }
  setupListeners() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      if (this.onOnlineCallback) this.onOnlineCallback();
    });
  }
  async loadFromStorage() {
    try {
      const data = await this.storage.getItem(OFFLINE_QUEUE_KEY);
      if (data) this.queue = JSON.parse(data);
    } catch {
    }
  }
  async save() {
    try {
      await this.storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch {
    }
  }
  async add(method, path, body) {
    this.queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method,
      path,
      body: body ? JSON.stringify(body) : void 0,
      timestamp: Date.now()
    });
    await this.save();
  }
  getAll() {
    return [...this.queue];
  }
  async remove(id) {
    this.queue = this.queue.filter((item) => item.id !== id);
    await this.save();
  }
  async clear() {
    this.queue = [];
    await this.save();
  }
  setOnlineCallback(cb) {
    this.onOnlineCallback = cb;
  }
  get length() {
    return this.queue.length;
  }
  get online() {
    return typeof navigator === "undefined" || navigator.onLine;
  }
};
var ScaleMuleClient = class {
  constructor(config) {
    this.applicationId = null;
    this.sessionToken = null;
    this.userId = null;
    this.rateLimitQueue = null;
    this.offlineQueue = null;
    this.workspaceId = null;
    this.anonymousId = null;
    this.sessionPool = /* @__PURE__ */ new Map();
    this.knownAccounts = /* @__PURE__ */ new Map();
    this.apiKey = config.apiKey;
    this.applicationId = config.applicationId || null;
    this.baseUrl = config.baseUrl || GATEWAY_URLS[config.environment || "prod"];
    this.debug = config.debug || false;
    this.storage = config.storage || createDefaultStorage();
    this.defaultTimeout = config.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = config.retry?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffMs = config.retry?.backoffMs ?? DEFAULT_BACKOFF_MS;
    if (config.enableRateLimitQueue) {
      this.rateLimitQueue = new RateLimitQueue();
    }
    if (config.enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue(this.storage);
      this.offlineQueue.setOnlineCallback(() => this.syncOfflineQueue());
    }
    this.multiSessionEnabled = config.enableMultiSession || false;
    this.accountSwitcherEnabled = config.enableAccountSwitcher || false;
    this.accountSwitcherPrivacy = config.accountSwitcherPrivacy || "full";
  }
  // --------------------------------------------------------------------------
  // Session Management
  // --------------------------------------------------------------------------
  async initialize() {
    const token = await this.storage.getItem(SESSION_STORAGE_KEY);
    const userId = await this.storage.getItem(USER_ID_STORAGE_KEY);
    if (token) this.sessionToken = token;
    if (userId) this.userId = userId;
    const wsId = await this.storage.getItem(WORKSPACE_STORAGE_KEY);
    if (wsId) this.workspaceId = wsId;
    let anonId = await this.storage.getItem(ANONYMOUS_ID_STORAGE_KEY);
    if (!anonId) {
      anonId = crypto.randomUUID();
      await this.storage.setItem(ANONYMOUS_ID_STORAGE_KEY, anonId);
    }
    this.anonymousId = anonId;
    if (this.multiSessionEnabled) {
      const poolJson = await this.storage.getItem(SESSION_POOL_KEY);
      if (poolJson) {
        try {
          const entries = JSON.parse(poolJson);
          this.sessionPool = new Map(Object.entries(entries));
        } catch {
        }
      }
      if (token && userId && !this.sessionPool.has(userId)) {
        this.sessionPool.set(userId, {
          token,
          userId,
          email: "",
          addedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await this.persistSessionPool();
      }
      const activeId = await this.storage.getItem(ACTIVE_ACCOUNT_KEY);
      if (activeId && this.sessionPool.has(activeId)) {
        const entry = this.sessionPool.get(activeId);
        this.sessionToken = entry.token;
        this.userId = activeId;
      }
    }
    if (this.accountSwitcherEnabled) {
      const knownJson = await this.storage.getItem(KNOWN_ACCOUNTS_KEY);
      if (knownJson) {
        try {
          const entries = JSON.parse(knownJson);
          this.knownAccounts = new Map(Object.entries(entries));
          let changed = false;
          for (const [userId2, entry] of this.knownAccounts) {
            const normalized = applyPrivacy(entry, this.accountSwitcherPrivacy);
            if (JSON.stringify(normalized) !== JSON.stringify(entry)) {
              this.knownAccounts.set(userId2, normalized);
              changed = true;
            }
          }
          if (changed) {
            await this.persistKnownAccounts();
          }
        } catch {
        }
      }
    }
    if (this.debug)
      console.log(
        "[ScaleMule] Initialized, session:",
        !!this.sessionToken,
        "anonymousId:",
        anonId,
        "poolSize:",
        this.sessionPool.size,
        "knownAccounts:",
        this.knownAccounts.size
      );
  }
  async setSession(token, userId) {
    this.sessionToken = token;
    this.userId = userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
  }
  async clearSession() {
    if (this.multiSessionEnabled && this.userId) {
      this.sessionPool.delete(this.userId);
      await this.persistSessionPool();
      const next = this.sessionPool.entries().next().value;
      if (next) {
        const [nextUserId, nextEntry] = next;
        this.sessionToken = nextEntry.token;
        this.userId = nextUserId;
        await this.storage.setItem(SESSION_STORAGE_KEY, nextEntry.token);
        await this.storage.setItem(USER_ID_STORAGE_KEY, nextUserId);
        await this.storage.setItem(ACTIVE_ACCOUNT_KEY, nextUserId);
        return;
      }
    }
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    await this.storage.removeItem(ACTIVE_ACCOUNT_KEY);
  }
  setAccessToken(token) {
    this.sessionToken = token;
  }
  clearAccessToken() {
    this.sessionToken = null;
  }
  getSessionToken() {
    return this.sessionToken;
  }
  getApplicationId() {
    return this.applicationId;
  }
  getUserId() {
    return this.userId;
  }
  isAuthenticated() {
    return this.sessionToken !== null;
  }
  getAnonymousId() {
    return this.anonymousId;
  }
  isMultiSessionEnabled() {
    return this.multiSessionEnabled;
  }
  // --------------------------------------------------------------------------
  // Multi-Account Session Pool (Phase 2)
  // --------------------------------------------------------------------------
  /** Get all accounts in the session pool */
  getSessionPool() {
    return Array.from(this.sessionPool.values());
  }
  /** Get the active account entry, or null */
  getActiveAccount() {
    if (!this.userId) return null;
    return this.sessionPool.get(this.userId) || null;
  }
  /** Add an account to the session pool and set it as active */
  async addAccount(entry) {
    this.sessionPool.set(entry.userId, entry);
    this.sessionToken = entry.token;
    this.userId = entry.userId;
    await this.storage.setItem(SESSION_STORAGE_KEY, entry.token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, entry.userId);
    await this.storage.setItem(ACTIVE_ACCOUNT_KEY, entry.userId);
    await this.persistSessionPool();
  }
  /** Switch to a different account in the pool. Returns false if not found. */
  async switchAccount(userId) {
    const entry = this.sessionPool.get(userId);
    if (!entry) return false;
    this.sessionToken = entry.token;
    this.userId = userId;
    this.workspaceId = null;
    await this.storage.setItem(SESSION_STORAGE_KEY, entry.token);
    await this.storage.setItem(USER_ID_STORAGE_KEY, userId);
    await this.storage.setItem(ACTIVE_ACCOUNT_KEY, userId);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    return true;
  }
  /** Remove a specific account from the pool */
  async removeAccount(userId) {
    this.sessionPool.delete(userId);
    await this.persistSessionPool();
    if (this.userId === userId) {
      const next = this.sessionPool.entries().next().value;
      if (next) {
        await this.switchAccount(next[0]);
      } else {
        await this.clearSession();
      }
    }
  }
  /** Clear all accounts from the pool */
  async clearAllAccounts() {
    this.sessionPool.clear();
    await this.storage.removeItem(SESSION_POOL_KEY);
    await this.storage.removeItem(ACTIVE_ACCOUNT_KEY);
    this.sessionToken = null;
    this.userId = null;
    this.workspaceId = null;
    await this.storage.removeItem(SESSION_STORAGE_KEY);
    await this.storage.removeItem(USER_ID_STORAGE_KEY);
    await this.storage.removeItem(WORKSPACE_STORAGE_KEY);
  }
  /** Persist session pool to storage */
  async persistSessionPool() {
    const obj = {};
    for (const [k, v] of this.sessionPool) {
      obj[k] = v;
    }
    await this.storage.setItem(SESSION_POOL_KEY, JSON.stringify(obj));
  }
  // --------------------------------------------------------------------------
  // Account Switcher (Secure — metadata only, no tokens)
  // --------------------------------------------------------------------------
  isAccountSwitcherEnabled() {
    return this.accountSwitcherEnabled;
  }
  getAccountSwitcherPrivacy() {
    return this.accountSwitcherPrivacy;
  }
  /** Get all known accounts that have logged in on this device (privacy-transformed) */
  getKnownAccounts() {
    return Array.from(this.knownAccounts.values());
  }
  /**
   * Record an account as "known" on this device.
   * Applies privacy transforms before storing — full email is never persisted
   * in masked/minimal modes. Evicts oldest accounts if over the cap.
   * Called automatically after successful login/register when account switcher is enabled.
   */
  async addKnownAccount(account) {
    const display = applyPrivacy(account, this.accountSwitcherPrivacy);
    this.knownAccounts.set(account.userId, display);
    if (this.knownAccounts.size > MAX_KNOWN_ACCOUNTS) {
      const sorted = Array.from(this.knownAccounts.entries()).sort(
        (a, b) => (a[1].lastActiveAt || "").localeCompare(b[1].lastActiveAt || "")
      );
      while (this.knownAccounts.size > MAX_KNOWN_ACCOUNTS && sorted.length > 0) {
        const oldest = sorted.shift();
        this.knownAccounts.delete(oldest[0]);
      }
    }
    await this.persistKnownAccounts();
  }
  /** Remove a specific account from the known accounts list ("forget this account") */
  async removeKnownAccount(userId) {
    this.knownAccounts.delete(userId);
    await this.persistKnownAccounts();
  }
  /** Clear all known accounts ("forget all accounts on this device") */
  async clearKnownAccounts() {
    this.knownAccounts.clear();
    await this.storage.removeItem(KNOWN_ACCOUNTS_KEY);
  }
  /** Persist known accounts to storage */
  async persistKnownAccounts() {
    const obj = {};
    for (const [k, v] of this.knownAccounts) {
      obj[k] = v;
    }
    await this.storage.setItem(KNOWN_ACCOUNTS_KEY, JSON.stringify(obj));
  }
  getBaseUrl() {
    return this.baseUrl;
  }
  getApiKey() {
    return this.apiKey;
  }
  isOnline() {
    if (this.offlineQueue) return this.offlineQueue.online;
    return typeof navigator === "undefined" || navigator.onLine;
  }
  getOfflineQueueLength() {
    return this.offlineQueue?.length || 0;
  }
  getRateLimitQueueLength() {
    return this.rateLimitQueue?.length || 0;
  }
  isRateLimited() {
    return this.rateLimitQueue?.isRateLimited || false;
  }
  setWorkspaceContext(id) {
    this.workspaceId = id;
    if (id) {
      this.storage.setItem(WORKSPACE_STORAGE_KEY, id);
    } else {
      this.storage.removeItem(WORKSPACE_STORAGE_KEY);
    }
  }
  getWorkspaceId() {
    return this.workspaceId;
  }
  // --------------------------------------------------------------------------
  // Core Request Method
  // --------------------------------------------------------------------------
  async request(path, init = {}) {
    const url = `${this.baseUrl}${path}`;
    const method = (init.method || "GET").toUpperCase();
    const timeout = init.timeout || this.defaultTimeout;
    const maxRetries = init.skipRetry ? 0 : init.retries ?? this.maxRetries;
    const headers = {
      "x-api-key": this.apiKey,
      "User-Agent": `ScaleMule-SDK-TypeScript/${SDK_VERSION}`,
      ...init.headers
    };
    if (!init.skipAuth && this.sessionToken) {
      headers["Authorization"] = `Bearer ${this.sessionToken}`;
    }
    if (this.workspaceId) {
      headers["x-sm-workspace-id"] = this.workspaceId;
    }
    if (!this.sessionToken && this.anonymousId) {
      headers["x-anonymous-id"] = this.anonymousId;
    }
    let bodyStr;
    if (init.body !== void 0 && init.body !== null) {
      bodyStr = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
    if (this.debug) {
      console.log(`[ScaleMule] ${method} ${path}`);
    }
    const idempotencyKey = method === "POST" ? generateIdempotencyKey() : void 0;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0 && idempotencyKey) {
        headers["x-idempotency-key"] = idempotencyKey;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      if (init.signal) {
        if (init.signal.aborted) {
          clearTimeout(timeoutId);
          return { data: null, error: { code: "aborted", message: "Request aborted", status: 0 } };
        }
        init.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (this.rateLimitQueue) {
          this.rateLimitQueue.updateFromHeaders(response.headers);
        }
        let responseData;
        const contentType = response.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
          responseData = await response.json();
        } else {
          const text = await response.text();
          try {
            responseData = JSON.parse(text);
          } catch {
            responseData = { message: text };
          }
        }
        if (!response.ok) {
          const error = {
            code: responseData?.error?.code || responseData?.code || statusToErrorCode(response.status),
            message: responseData?.error?.message || responseData?.message || response.statusText,
            status: response.status,
            details: responseData?.error?.details || responseData?.details
          };
          if (response.status === 429) {
            const retryAfter = response.headers.get("Retry-After");
            if (retryAfter) {
              error.details = { ...error.details, retryAfter: parseInt(retryAfter, 10) };
            }
          }
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay(attempt, this.backoffMs);
            if (this.debug) {
              console.log(`[ScaleMule] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`);
            }
            await sleep(delay);
            continue;
          }
          return { data: null, error };
        }
        const data = responseData?.data !== void 0 ? responseData.data : responseData;
        return { data, error: null };
      } catch (err) {
        clearTimeout(timeoutId);
        const isAbort = err instanceof Error && err.name === "AbortError";
        const error = {
          code: isAbort ? init.signal?.aborted ? "aborted" : "timeout" : "network_error",
          message: err instanceof Error ? err.message : "Network request failed",
          status: 0
        };
        if (attempt < maxRetries && !init.signal?.aborted) {
          lastError = error;
          const delay = getBackoffDelay(attempt, this.backoffMs);
          if (this.debug) {
            console.log(`[ScaleMule] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms (${error.code})`);
          }
          await sleep(delay);
          continue;
        }
        return { data: null, error };
      }
    }
    return { data: null, error: lastError || { code: "internal_error", message: "Request failed", status: 0 } };
  }
  // --------------------------------------------------------------------------
  // HTTP Verb Shortcuts
  // --------------------------------------------------------------------------
  async get(path, options) {
    return this.request(path, { ...options, method: "GET" });
  }
  async post(path, body, options) {
    return this.request(path, { ...options, method: "POST", body });
  }
  async put(path, body, options) {
    return this.request(path, { ...options, method: "PUT", body });
  }
  async patch(path, body, options) {
    return this.request(path, { ...options, method: "PATCH", body });
  }
  async del(path, options) {
    return this.request(path, { ...options, method: "DELETE" });
  }
  // --------------------------------------------------------------------------
  // File Upload
  // --------------------------------------------------------------------------
  /**
   * Upload a file using multipart/form-data.
   *
   * Supports progress tracking via XMLHttpRequest (browser only).
   * Supports cancellation via AbortController signal.
   * Retries with exponential backoff on transient failures.
   */
  async upload(path, file, additionalFields, options) {
    const fileName = file.name || "file";
    const sanitizedName = sanitizeFilename(fileName);
    const sanitizedFile = sanitizedName !== fileName ? new File([file], sanitizedName, { type: file.type }) : file;
    const buildFormData = () => {
      const fd = new FormData();
      fd.append("file", sanitizedFile);
      if (additionalFields) {
        for (const [key, value] of Object.entries(additionalFields)) {
          fd.append(key, value);
        }
      }
      return fd;
    };
    const url = `${this.baseUrl}${path}`;
    if (this.debug) console.log(`[ScaleMule] UPLOAD ${path}`);
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    if (options?.onProgress && typeof XMLHttpRequest !== "undefined") {
      return this.uploadWithXHR(url, buildFormData, options.onProgress, options?.signal);
    }
    const maxRetries = options?.retries ?? this.maxRetries;
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const headers = { "x-api-key": this.apiKey };
      if (this.sessionToken) headers["Authorization"] = `Bearer ${this.sessionToken}`;
      if (this.workspaceId) headers["x-sm-workspace-id"] = this.workspaceId;
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body: buildFormData(),
          signal: options?.signal
        });
        const data = await response.json();
        if (!response.ok) {
          const error = {
            code: data?.error?.code || statusToErrorCode(response.status),
            message: data?.error?.message || data?.message || response.statusText,
            status: response.status,
            details: data?.error?.details
          };
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES.has(response.status)) {
            lastError = error;
            await sleep(getBackoffDelay(attempt, this.backoffMs));
            continue;
          }
          return { data: null, error };
        }
        const result = data?.data !== void 0 ? data.data : data;
        return { data: result, error: null };
      } catch (err) {
        if (options?.signal?.aborted) {
          return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
        }
        lastError = {
          code: "upload_error",
          message: err instanceof Error ? err.message : "Upload failed",
          status: 0
        };
        if (attempt < maxRetries) {
          await sleep(getBackoffDelay(attempt, this.backoffMs));
          continue;
        }
      }
    }
    return { data: null, error: lastError || { code: "upload_error", message: "Upload failed", status: 0 } };
  }
  /**
   * Single upload with XMLHttpRequest for progress tracking.
   * Supports abort via AbortSignal.
   */
  async uploadWithXHR(url, buildFormData, onProgress, signal, maxRetries = this.maxRetries) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await new Promise((res) => {
        const xhr = new XMLHttpRequest();
        if (signal) {
          if (signal.aborted) {
            res({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
            return;
          }
          signal.addEventListener("abort", () => xhr.abort(), { once: true });
        }
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            onProgress(Math.round(event.loaded / event.total * 100));
          }
        });
        xhr.addEventListener("load", () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) {
              const result2 = data?.data !== void 0 ? data.data : data;
              res({ data: result2, error: null });
            } else {
              res({
                data: null,
                error: {
                  code: data?.error?.code || statusToErrorCode(xhr.status),
                  message: data?.error?.message || data?.message || "Upload failed",
                  status: xhr.status,
                  details: data?.error?.details
                }
              });
            }
          } catch {
            res({ data: null, error: { code: "internal_error", message: "Failed to parse response", status: 0 } });
          }
        });
        xhr.addEventListener("error", () => {
          res({ data: null, error: { code: "upload_error", message: "Upload failed", status: 0 } });
        });
        xhr.addEventListener("abort", () => {
          res({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
        });
        xhr.open("POST", url);
        xhr.setRequestHeader("x-api-key", this.apiKey);
        if (this.sessionToken) {
          xhr.setRequestHeader("Authorization", `Bearer ${this.sessionToken}`);
        }
        if (this.workspaceId) {
          xhr.setRequestHeader("x-sm-workspace-id", this.workspaceId);
        }
        xhr.send(buildFormData());
      });
      if (result.error === null) {
        return result;
      }
      const isRetryable = result.error.code === "upload_error" || result.error.code === "network_error" || RETRYABLE_STATUS_CODES.has(result.error.status);
      if (result.error.code === "aborted") {
        return result;
      }
      if (attempt < maxRetries && isRetryable) {
        lastError = result.error;
        onProgress(0);
        await sleep(getBackoffDelay(attempt, this.backoffMs));
        continue;
      }
      return result;
    }
    return {
      data: null,
      error: lastError || { code: "upload_error", message: "Upload failed", status: 0 }
    };
  }
  // --------------------------------------------------------------------------
  // Offline Queue Sync
  // --------------------------------------------------------------------------
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
          body: item.body ? JSON.parse(item.body) : void 0,
          skipRetry: true
        });
        await this.offlineQueue.remove(item.id);
      } catch {
        break;
      }
    }
  }
};
var ServiceModule = class {
  constructor(client) {
    this.client = client;
  }
  // --------------------------------------------------------------------------
  // Client context → headers resolution
  // --------------------------------------------------------------------------
  /**
   * Merge `clientContext` from RequestOptions into `headers`.
   * Explicit headers take precedence over context-derived ones.
   */
  resolveOptions(options) {
    if (!options?.clientContext) return options;
    const contextHeaders = buildClientContextHeaders(options.clientContext);
    const { clientContext: _, ...rest } = options;
    return { ...rest, headers: { ...contextHeaders, ...rest.headers } };
  }
  // --------------------------------------------------------------------------
  // HTTP verb shortcuts (path relative to basePath)
  // --------------------------------------------------------------------------
  _get(path, options) {
    return this.client.get(`${this.basePath}${path}`, this.resolveOptions(options));
  }
  post(path, body, options) {
    return this.client.post(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  put(path, body, options) {
    return this.client.put(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  patch(path, body, options) {
    return this.client.patch(`${this.basePath}${path}`, body, this.resolveOptions(options));
  }
  del(path, options) {
    return this.client.del(`${this.basePath}${path}`, this.resolveOptions(options));
  }
  // --------------------------------------------------------------------------
  // Paginated list
  // --------------------------------------------------------------------------
  /**
   * Fetch a paginated list from the backend.
   *
   * Normalizes varying backend pagination shapes into the standard
   * PaginatedResponse<T> envelope. Supports backends that return:
   *   - { data: T[], metadata: { total, ... } }           (preferred)
   *   - { items: T[], total, page, per_page }              (legacy)
   *   - T[]                                                (bare array)
   *
   * Extra params beyond page/perPage are forwarded as query string parameters.
   */
  async _list(path, params, options) {
    const qs = buildQueryString(params);
    const fullPath = qs ? `${this.basePath}${path}?${qs}` : `${this.basePath}${path}`;
    const response = await this.client.get(fullPath, this.resolveOptions(options));
    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: asNum(params?.page) ?? 1, perPage: asNum(params?.perPage) ?? 20 },
        error: response.error
      };
    }
    return normalizePaginatedResponse(response.data, params);
  }
  // --------------------------------------------------------------------------
  // File upload (delegates to client.upload)
  // --------------------------------------------------------------------------
  _upload(path, file, additionalFields, options) {
    return this.client.upload(
      `${this.basePath}${path}`,
      file,
      additionalFields,
      this.resolveOptions(options)
    );
  }
  // --------------------------------------------------------------------------
  // Query string helper (available to subclasses)
  // --------------------------------------------------------------------------
  /**
   * Append query parameters to a relative path.
   * Use with verb methods: `this.get(this.withQuery('/items', { status: 'active' }))`
   * Does NOT add basePath — the verb methods handle that.
   */
  withQuery(path, params) {
    const qs = buildQueryString(params);
    return qs ? `${path}?${qs}` : path;
  }
};
function buildQueryString(params) {
  if (!params) return "";
  const pairs = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null) continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.join("&");
}
function normalizePaginatedResponse(raw, params) {
  if (raw === null || raw === void 0) {
    return {
      data: [],
      metadata: { total: 0, totalPages: 0, page: 1, perPage: 20 },
      error: null
    };
  }
  if (Array.isArray(raw)) {
    return {
      data: raw,
      metadata: {
        total: raw.length,
        totalPages: 1,
        page: 1,
        perPage: raw.length
      },
      error: null
    };
  }
  const obj = raw;
  const dataArray = obj.data ?? obj.items ?? [];
  const metadata = {
    total: asNumber(obj.metadata, "total") ?? asNumber(obj, "total") ?? dataArray.length,
    totalPages: asNumber(obj.metadata, "totalPages") ?? asNumber(obj.metadata, "total_pages") ?? asNumber(obj, "total_pages") ?? asNumber(obj, "totalPages") ?? 0,
    page: asNumber(obj.metadata, "page") ?? asNumber(obj, "page") ?? asNum(params?.page) ?? 1,
    perPage: asNumber(obj.metadata, "perPage") ?? asNumber(obj.metadata, "per_page") ?? asNumber(obj, "per_page") ?? asNumber(obj, "perPage") ?? asNum(params?.perPage) ?? 20
  };
  if (metadata.totalPages === 0 && metadata.total > 0 && metadata.perPage > 0) {
    metadata.totalPages = Math.ceil(metadata.total / metadata.perPage);
  }
  const nextCursor = asString(obj.metadata, "nextCursor") ?? asString(obj.metadata, "next_cursor") ?? asString(obj, "next_cursor") ?? asString(obj, "nextCursor");
  if (nextCursor) {
    metadata.nextCursor = nextCursor;
  }
  return { data: dataArray, metadata, error: null };
}
function asNumber(parent, key) {
  if (parent === null || parent === void 0 || typeof parent !== "object") return void 0;
  const value = parent[key];
  return typeof value === "number" ? value : void 0;
}
function asNum(value) {
  return typeof value === "number" ? value : void 0;
}
function asString(parent, key) {
  if (parent === null || parent === void 0 || typeof parent !== "object") return void 0;
  const value = parent[key];
  return typeof value === "string" ? value : void 0;
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
function normalizePhoneNumber(input) {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return "";
  if (trimmed.startsWith("+")) {
    return `+${digitsOnly}`;
  }
  if (trimmed.startsWith("00") && digitsOnly.length > 2) {
    return `+${digitsOnly.slice(2)}`;
  }
  return `+${digitsOnly}`;
}
[...PHONE_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
function collectDeviceFingerprint() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return void 0;
  try {
    return {
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cookie_enabled: navigator.cookieEnabled,
      do_not_track: navigator.doNotTrack
    };
  } catch {
    return void 0;
  }
}
var AuthMfaApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/mfa";
  }
  async getStatus() {
    return this._get("/status");
  }
  async setupTotp() {
    return this.post("/totp/setup");
  }
  async verifySetup(data) {
    return this.post("/totp/verify-setup", data);
  }
  async enableSms() {
    return this.post("/sms/enable");
  }
  async enableEmail() {
    return this.post("/email/enable");
  }
  async disable(data) {
    return this.post("/disable", data);
  }
  async regenerateBackupCodes() {
    return this.post("/backup-codes/regenerate");
  }
  async sendCode(data) {
    return this.post("/send-code", data);
  }
  async verify(data) {
    return this.post("/verify", data);
  }
};
var AuthSessionsApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/sessions";
  }
  async list() {
    return this._get("");
  }
  async revoke(sessionId) {
    return this.del(`/${sessionId}`);
  }
  async revokeAll() {
    return this.del("/others");
  }
};
var AuthDevicesApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth/devices";
  }
  async list() {
    return this._get("");
  }
  async trust(deviceId) {
    return this.post(`/${deviceId}/trust`);
  }
  async block(deviceId) {
    return this.post(`/${deviceId}/block`);
  }
  async delete(deviceId) {
    return this.del(`/${deviceId}`);
  }
};
var AuthLoginHistoryApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth";
  }
  async list(params) {
    return this._get(this.withQuery("/login-history", params));
  }
  async getSummary() {
    return this._get("/login-activity");
  }
};
var AuthService = class extends ServiceModule {
  constructor(client) {
    super(client);
    this.basePath = "/v1/auth";
    this.mfa = new AuthMfaApi(client);
    this.sessions = new AuthSessionsApi(client);
    this.devices = new AuthDevicesApi(client);
    this.loginHistory = new AuthLoginHistoryApi(client);
  }
  sanitizePhoneField(value) {
    if (typeof value !== "string") return value;
    const normalized = normalizePhoneNumber(value);
    return normalized || void 0;
  }
  // --------------------------------------------------------------------------
  // Core Auth
  // --------------------------------------------------------------------------
  async register(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone),
      anonymous_id: this.client.getAnonymousId()
    };
    const result = await this.post("/register", payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider: "email",
        lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return result;
  }
  async login(data, options) {
    const payload = {
      ...data,
      anonymous_id: this.client.getAnonymousId(),
      device_fingerprint: data.device_fingerprint || collectDeviceFingerprint()
    };
    const result = await this.post("/login", payload, options);
    if (result.data && this.client.isMultiSessionEnabled()) {
      await this.client.addAccount({
        token: result.data.session_token,
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        expiresAt: result.data.expires_at,
        addedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider: "email",
        lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return result;
  }
  async logout(options) {
    return this.post("/logout", void 0, options);
  }
  async me(options) {
    return this._get("/me", options);
  }
  // --------------------------------------------------------------------------
  // User directory (customer-scoped)
  // --------------------------------------------------------------------------
  //
  // Search / fetch users within the caller's application. These endpoints are
  // scoped by the gateway-injected x-app-id header, so when invoked with a
  // customer API key + user session they will only return users belonging to
  // the caller's application. They replace the prior pattern of customer apps
  // reaching for platform admin credentials to hit admin-only user routes.
  //
  // DO NOT call these with platform admin credentials from customer-facing
  // applications. Use the standard customer auth path (API key + user session)
  // and let the gateway inject x-app-id on your behalf.
  /**
   * Search users within the caller's application.
   *
   * Results are automatically scoped to the caller's application via the
   * x-app-id header injected by the gateway. Server-side page size is fixed
   * at 50 (the `per_page` query param is not honored upstream).
   *
   * @example
   *   const res = await sm.auth.searchUsers({ search: 'alice' });
   *   res.data?.users.forEach(u => console.log(u.email));
   */
  async searchUsers(params, options) {
    const query = {};
    if (params?.search !== void 0) query.search = params.search;
    if (params?.status !== void 0) query.status = params.status;
    if (params?.email_verified !== void 0) {
      query.email_verified = params.email_verified ? "true" : "false";
    }
    if (params?.phone_verified !== void 0) {
      query.phone_verified = params.phone_verified ? "true" : "false";
    }
    if (params?.page !== void 0) query.page = params.page;
    return this._get(this.withQuery("/users", query), options);
  }
  /**
   * Fetch a single user by ID within the caller's application.
   *
   * Returns 404 if the user is not in the caller's application — cross-tenant
   * reads are blocked at the gateway via the x-app-id header scope.
   */
  async getUser(userId, options) {
    return this._get(`/users/${encodeURIComponent(userId)}`, options);
  }
  /** Refresh the session. Alias: refreshToken() */
  async refreshSession(data, options) {
    return this.post("/refresh", data ?? {}, options);
  }
  /** @deprecated Use refreshSession() */
  async refreshToken(data) {
    return this.refreshSession(data);
  }
  // --------------------------------------------------------------------------
  // Passwordless Auth
  // --------------------------------------------------------------------------
  /**
   * Send a one-time password for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post("/otp/send", payload, options);
  }
  /**
   * Verify OTP code and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone)
    };
    return this.post("/otp/verify", payload, options);
  }
  /**
   * Send a magic link for passwordless sign-in.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async signInWithMagicLink(data, options) {
    return this.post("/magic-link/send", data, options);
  }
  /**
   * Verify a magic link token and create a session.
   * @experimental Endpoint availability depends on backend deployment.
   */
  async verifyMagicLink(data, options) {
    return this.post("/magic-link/verify", data, options);
  }
  // --------------------------------------------------------------------------
  // Phone OTP (existing backend endpoints)
  // --------------------------------------------------------------------------
  async sendPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/send-otp", payload, options);
  }
  async verifyPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/verify-otp", payload, options);
  }
  async resendPhoneOtp(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? ""
    };
    return this.post("/phone/resend-otp", payload, options);
  }
  /** Login with phone OTP (sends + verifies in one flow) */
  async loginWithPhone(data, options) {
    const payload = {
      ...data,
      phone: this.sanitizePhoneField(data.phone) ?? "",
      purpose: "login"
    };
    return this.post("/phone/verify-otp", payload, options);
  }
  // --------------------------------------------------------------------------
  // Password Management
  // --------------------------------------------------------------------------
  async forgotPassword(data, options) {
    return this.post("/forgot-password", data, options);
  }
  async resetPassword(data, options) {
    return this.post("/reset-password", data, options);
  }
  async changePassword(data, options) {
    return this.post("/password/change", data, options);
  }
  // --------------------------------------------------------------------------
  // Email & Phone Management
  // --------------------------------------------------------------------------
  async verifyEmail(data, options) {
    return this.post("/verify-email", data, options);
  }
  /** Resend email verification. Alias: resendEmailVerification() */
  async resendVerification(data, options) {
    return this.post("/resend-verification", data ?? {}, options);
  }
  /** @deprecated Use resendVerification() */
  async resendEmailVerification(data) {
    return this.resendVerification(data);
  }
  async changeEmail(data, options) {
    return this.post("/email/change", data, options);
  }
  async changePhone(data, options) {
    const payload = {
      ...data,
      new_phone: this.sanitizePhoneField(data.new_phone) ?? ""
    };
    return this.post("/phone/change", payload, options);
  }
  // --------------------------------------------------------------------------
  // Account
  // --------------------------------------------------------------------------
  async deleteAccount(options) {
    return this.del("/me", options);
  }
  async exportData(options) {
    return this._get("/me/export", options);
  }
  // --------------------------------------------------------------------------
  // OAuth
  // --------------------------------------------------------------------------
  async getOAuthUrl(provider, redirectUri, options) {
    return this._get(this.withQuery(`/oauth/${provider}/authorize`, { redirect_uri: redirectUri }), options);
  }
  async handleOAuthCallback(data, options) {
    const { provider, ...rest } = data;
    const result = await this._get(this.withQuery(`/oauth/${provider}/callback`, rest), options);
    if (result.data && this.client.isAccountSwitcherEnabled()) {
      await this.client.addKnownAccount({
        userId: result.data.user.id,
        email: result.data.user.email,
        fullName: result.data.user.full_name,
        avatarUrl: result.data.user.avatar_url,
        provider,
        lastActiveAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    return result;
  }
  async listOAuthProviders(options) {
    return this._get("/oauth/providers", options);
  }
  async unlinkOAuthProvider(provider, options) {
    return this.del(`/oauth/providers/${provider}`, options);
  }
  // --------------------------------------------------------------------------
  // Token Management
  // --------------------------------------------------------------------------
  async refreshAccessToken(data, options) {
    return this.post("/token/refresh", data ?? {}, options);
  }
  async revokeRefreshToken(data, options) {
    return this.post("/token/revoke", data, options);
  }
  // --------------------------------------------------------------------------
  // Flat methods for backward compatibility (delegate to sub-APIs)
  // --------------------------------------------------------------------------
  /** @deprecated Use auth.sessions.list() */
  async listSessions() {
    return this.sessions.list();
  }
  /** @deprecated Use auth.sessions.revoke() */
  async revokeSession(sessionId) {
    return this.sessions.revoke(sessionId);
  }
  /** @deprecated Use auth.sessions.revokeAll() */
  async revokeOtherSessions() {
    return this.sessions.revokeAll();
  }
  /** @deprecated Use auth.devices.list() */
  async listDevices() {
    return this.devices.list();
  }
  /** @deprecated Use auth.devices.trust() */
  async trustDevice(deviceId) {
    return this.devices.trust(deviceId);
  }
  /** @deprecated Use auth.devices.block() */
  async blockDevice(deviceId) {
    return this.devices.block(deviceId);
  }
  /** @deprecated Use auth.devices.delete() */
  async deleteDevice(deviceId) {
    return this.devices.delete(deviceId);
  }
  /** @deprecated Use auth.loginHistory.list() */
  async getLoginHistory(params) {
    return this.loginHistory.list(params);
  }
  /** @deprecated Use auth.loginHistory.getSummary() */
  async getLoginActivitySummary() {
    return this.loginHistory.getSummary();
  }
  /** @deprecated Use auth.mfa.getStatus() */
  async getMfaStatus() {
    return this.mfa.getStatus();
  }
  /** @deprecated Use auth.mfa.setupTotp() */
  async setupTotp() {
    return this.mfa.setupTotp();
  }
  /** @deprecated Use auth.mfa.verifySetup() */
  async verifyTotpSetup(data) {
    return this.mfa.verifySetup(data);
  }
  /** @deprecated Use auth.mfa.enableSms() */
  async enableSmsMfa() {
    return this.mfa.enableSms();
  }
  /** @deprecated Use auth.mfa.enableEmail() */
  async enableEmailMfa() {
    return this.mfa.enableEmail();
  }
  /** @deprecated Use auth.mfa.disable() */
  async disableMfa(data) {
    return this.mfa.disable(data);
  }
  /** @deprecated Use auth.mfa.regenerateBackupCodes() */
  async regenerateBackupCodes() {
    return this.mfa.regenerateBackupCodes();
  }
  /** @deprecated Use auth.mfa.sendCode() */
  async sendMfaCode(data) {
    return this.mfa.sendCode(data);
  }
  /** @deprecated Use auth.mfa.verify() */
  async verifyMfa(data) {
    return this.mfa.verify(data);
  }
};
var BATCH_MAX_SIZE = 100;
var LoggerService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/logger";
  }
  /**
   * Write a single log entry.
   * Accepts both new schema (LogInput) and legacy shape ({ level, message }) for backward compatibility.
   */
  async log(data, options) {
    const body = this.normalizeLogInput(data);
    return this.post("/logs", body, options);
  }
  /**
   * Write log entries in batch.
   * Auto-chunks into groups of 100 (backend hard limit) and sends sequentially.
   * Returns total ingested count across all chunks.
   */
  async logBatch(logs, options) {
    if (logs.length === 0) {
      return { data: { ingested: 0 }, error: null };
    }
    let totalIngested = 0;
    for (let i = 0; i < logs.length; i += BATCH_MAX_SIZE) {
      const chunk = logs.slice(i, i + BATCH_MAX_SIZE);
      const result = await this.post("/logs/batch", { logs: chunk }, options);
      if (result.error) {
        return {
          data: { ingested: totalIngested },
          error: result.error
        };
      }
      totalIngested += result.data?.ingested ?? chunk.length;
    }
    return { data: { ingested: totalIngested }, error: null };
  }
  /**
   * Query logs with filters. Returns paginated response.
   */
  async queryLogs(filters, requestOptions) {
    return this._get(this.withQuery("/logs", filters), requestOptions);
  }
  // Convenience methods
  async debug(service, message, meta, options) {
    return this.log({ service, severity: "debug", message, metadata: meta }, options);
  }
  async info(service, message, meta, options) {
    return this.log({ service, severity: "info", message, metadata: meta }, options);
  }
  async warn(service, message, meta, options) {
    return this.log({ service, severity: "warn", message, metadata: meta }, options);
  }
  async error(service, message, meta, options) {
    return this.log({ service, severity: "error", message, metadata: meta }, options);
  }
  // --------------------------------------------------------------------------
  // Internal
  // --------------------------------------------------------------------------
  /** Normalize legacy { level, message } to { severity, service, message } */
  normalizeLogInput(data) {
    if ("severity" in data && "service" in data) {
      return data;
    }
    const legacy = data;
    return {
      service: "sdk",
      severity: legacy.level || "info",
      message: legacy.message,
      metadata: legacy.metadata
    };
  }
};
var EVENT_SEVERITY = {
  "upload.failed": "error",
  "upload.stalled": "error",
  "upload.multipart.aborted": "error",
  "upload.retried": "warn",
  "upload.aborted": "warn",
  "upload.multipart.part_failed": "warn",
  "upload.multipart.url_refreshed": "warn",
  "upload.compression.skipped": "warn",
  "upload.started": "info",
  "upload.completed": "info",
  "upload.resumed": "info",
  "upload.multipart.started": "info",
  "upload.multipart.completed": "info",
  "upload.compression.completed": "info",
  "upload.progress": "debug",
  "upload.multipart.part_completed": "debug",
  "upload.compression.started": "debug"
};
var UploadTelemetry = class {
  constructor(client, config) {
    this.buffer = [];
    this.debugLogBuffer = [];
    this.flushTimer = null;
    this.flushing = false;
    this.client = client;
    this.logger = new LoggerService(client);
    this.config = {
      enabled: config?.enabled ?? true,
      flushIntervalMs: config?.flushIntervalMs ?? 2e3,
      maxBufferSize: config?.maxBufferSize ?? 50
    };
    if (this.config.enabled) {
      this.startFlushTimer();
    }
  }
  /** Emit a telemetry event. Never throws. */
  emit(sessionId, event, metadata = {}) {
    if (!this.config.enabled) return;
    const payload = {
      upload_session_id: sessionId,
      event,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      metadata
    };
    const severity = EVENT_SEVERITY[event] || "info";
    if (severity !== "debug") {
      this.sendToLogger(payload, severity);
    } else {
      this.debugLogBuffer.push({
        service: "storage.upload",
        severity,
        message: `Upload ${event}: session=${sessionId}`,
        metadata: { upload_session_id: sessionId, event, ...metadata },
        trace_id: sessionId
      });
    }
    this.buffer.push(payload);
    if (this.buffer.length >= this.config.maxBufferSize) {
      this.flush();
    }
  }
  /** Flush buffered events immediately. Never throws. */
  async flush() {
    if (!this.config.enabled || this.buffer.length === 0 && this.debugLogBuffer.length === 0 || this.flushing) return;
    this.flushing = true;
    const batch = this.buffer.splice(0);
    const debugLogs = this.debugLogBuffer.splice(0);
    try {
      if (batch.length > 0) {
        const events = batch.map((p) => ({
          event: p.event,
          properties: {
            upload_session_id: p.upload_session_id,
            ...p.metadata
          },
          timestamp: p.timestamp
        }));
        await this.client.post("/v1/analytics/v2/events/batch", { events }).catch(() => {
        });
      }
      if (debugLogs.length > 0) {
        await this.logger.logBatch(debugLogs).catch(() => {
        });
      }
    } catch {
    } finally {
      this.flushing = false;
    }
  }
  /** Stop the flush timer and drain remaining events. */
  async destroy() {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
  startFlushTimer() {
    if (typeof setInterval !== "undefined") {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushIntervalMs);
      if (this.flushTimer && typeof this.flushTimer === "object" && "unref" in this.flushTimer) {
        this.flushTimer.unref();
      }
    }
  }
  /** Send a log entry to the logger service (fire-and-forget) */
  sendToLogger(payload, severity) {
    this.logger.log({
      service: "storage.upload",
      severity,
      message: `Upload ${payload.event}: session=${payload.upload_session_id}`,
      metadata: {
        upload_session_id: payload.upload_session_id,
        event: payload.event,
        ...payload.metadata
      },
      trace_id: payload.upload_session_id
    }).catch(() => {
    });
  }
};
function generateUploadSessionId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `us_${timestamp}_${random}`;
}
var RETRY_DELAYS = [0, 1e3, 3e3];
var RETRYABLE_STATUS_CODES2 = /* @__PURE__ */ new Set([500, 502, 503, 504]);
var NON_RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([400, 403, 404, 413]);
var DEFAULT_STALL_TIMEOUT_MS = 45e3;
var SLOW_NETWORK_STALL_TIMEOUT_MS = 9e4;
var MULTIPART_THRESHOLD = 8 * 1024 * 1024;
var MULTIPART_THRESHOLD_SLOW = 4 * 1024 * 1024;
var StorageService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/storage";
    this.telemetry = null;
  }
  // --------------------------------------------------------------------------
  // Upload (unified: direct PUT or multipart, transparent to caller)
  // --------------------------------------------------------------------------
  /**
   * Upload a file using the optimal strategy.
   *
   * Small files (< 8MB): 3-step presigned URL flow with retry + stall guard.
   * Large files (>= 8MB): Multipart with windowed presigns, resumable.
   *
   * @returns The completed file record with id, url, etc.
   */
  async upload(file, options) {
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    const sessionId = generateUploadSessionId();
    const telemetryEnabled = options?.telemetry !== false;
    const telemetry = telemetryEnabled ? this.getOrCreateTelemetry() : null;
    const startTime = Date.now();
    telemetry?.emit(sessionId, "upload.started", {
      size_bytes: file.size,
      content_type: file.type,
      strategy: this.shouldUseMultipart(file, options) ? "multipart" : "direct",
      network_type: getNetworkEffectiveType2()
    });
    try {
      let uploadFile = file;
      if (!options?.skipCompression && typeof window !== "undefined") {
        const compressed = await this.maybeCompress(file, options?.compression, sessionId, telemetry);
        if (compressed) uploadFile = compressed;
      }
      if (this.shouldUseMultipart(uploadFile, options)) {
        return await this.uploadMultipart(uploadFile, options, sessionId, telemetry);
      }
      return await this.uploadDirect(uploadFile, options, sessionId, telemetry);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      telemetry?.emit(sessionId, "upload.failed", { error: message, duration_ms: Date.now() - startTime });
      return { data: null, error: { code: "upload_error", message, status: 0 } };
    }
  }
  // --------------------------------------------------------------------------
  // Direct Upload (3-step with retry + stall)
  // --------------------------------------------------------------------------
  async uploadDirect(file, options, sessionId, telemetry) {
    const directStart = Date.now();
    const requestOpts = this.withSessionHeader(sessionId, options);
    const filename = options?.filename || file.name || "file";
    const initResult = await this.post(
      "/signed-url/upload",
      {
        filename,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        is_public: options?.isPublic ?? true,
        metadata: options?.metadata
      },
      requestOpts
    );
    if (initResult.error) {
      telemetry?.emit(sessionId, "upload.failed", { step: "presign", error: initResult.error.message });
      return { data: null, error: initResult.error };
    }
    const { file_id, upload_url, completion_token } = initResult.data;
    const uploadResult = await this.uploadToPresignedUrlWithRetry(
      upload_url,
      file,
      options?.onProgress,
      options?.signal,
      sessionId,
      telemetry
    );
    if (uploadResult.error) {
      if (uploadResult.error.code === "upload_stalled") {
        telemetry?.emit(sessionId, "upload.stalled", { step: "s3_put", file_id });
      }
      telemetry?.emit(sessionId, "upload.failed", {
        step: "s3_put",
        error: uploadResult.error.message,
        file_id,
        reason: uploadResult.error.code
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: "s3_put",
          errorCode: uploadResult.error.code,
          errorMessage: uploadResult.error.message,
          httpStatus: uploadResult.error.status || void 0,
          attempt: asNumber2(uploadResult.error.details?.attempt),
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            ...uploadResult.error.details || {}
          }
        },
        requestOpts
      );
      return { data: null, error: uploadResult.error };
    }
    const completeResult = await this.post(
      "/signed-url/complete",
      {
        file_id,
        completion_token
      },
      requestOpts
    );
    if (completeResult.error) {
      telemetry?.emit(sessionId, "upload.failed", {
        step: "complete",
        error: completeResult.error.message,
        file_id,
        duration_ms: Date.now() - directStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken: completion_token,
          step: "complete",
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || void 0,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - directStart
          }
        },
        requestOpts
      );
    } else {
      telemetry?.emit(sessionId, "upload.completed", {
        file_id,
        size_bytes: file.size,
        duration_ms: Date.now() - directStart
      });
    }
    return completeResult;
  }
  // --------------------------------------------------------------------------
  // Multipart Upload
  // --------------------------------------------------------------------------
  async uploadMultipart(file, options, sessionId, telemetry) {
    const multipartStart = Date.now();
    const requestOpts = this.withSessionHeader(sessionId, options);
    const filename = options?.filename || file.name || "file";
    telemetry?.emit(sessionId, "upload.multipart.started", { size_bytes: file.size });
    let resumeStore = null;
    let resumeData = null;
    if (options?.resume !== "off" && typeof window !== "undefined") {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await Promise.resolve().then(() => (init_upload_resume_RXLHBH5E(), upload_resume_RXLHBH5E_exports));
        resumeStore = new UploadResumeStore2();
        await resumeStore.open();
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        resumeData = await resumeStore.get(resumeKey);
        if (resumeData) {
          telemetry?.emit(sessionId, "upload.resumed", {
            original_session_id: resumeData.upload_session_id,
            completed_parts: resumeData.completed_parts.length,
            total_parts: resumeData.total_parts
          });
        }
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_load",
          error: err instanceof Error ? err.message : "Resume store unavailable"
        });
        resumeStore = null;
        resumeData = null;
      }
    }
    let startData;
    let completionToken;
    const completedParts = /* @__PURE__ */ new Map();
    if (resumeData) {
      startData = {
        upload_session_id: resumeData.upload_session_id,
        file_id: resumeData.file_id,
        completion_token: "",
        // will request part URLs separately
        part_size_bytes: resumeData.part_size_bytes || this.defaultChunkSize(file.size),
        total_parts: resumeData.total_parts,
        part_urls: [],
        expires_at: ""
      };
      completionToken = resumeData.completion_token;
      for (const part of resumeData.completed_parts) {
        completedParts.set(part.part_number, part.etag);
      }
    } else {
      let clientUploadKey;
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await Promise.resolve().then(() => (init_upload_resume_RXLHBH5E(), upload_resume_RXLHBH5E_exports));
        clientUploadKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
      } catch {
      }
      const startResult = await this.post(
        "/signed-url/multipart/start",
        {
          filename,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          is_public: options?.isPublic ?? true,
          metadata: options?.metadata,
          chunk_size: options?.chunkSize,
          ...clientUploadKey ? { client_upload_key: clientUploadKey } : {}
        },
        requestOpts
      );
      if (startResult.error) {
        telemetry?.emit(sessionId, "upload.multipart.aborted", { error: startResult.error.message });
        return { data: null, error: startResult.error };
      }
      startData = startResult.data;
      completionToken = startData.completion_token;
    }
    const { upload_session_id, file_id, part_size_bytes, total_parts } = startData;
    if (resumeStore && !resumeData) {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await Promise.resolve().then(() => (init_upload_resume_RXLHBH5E(), upload_resume_RXLHBH5E_exports));
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        await resumeStore.save(resumeKey, {
          upload_session_id,
          file_id,
          completion_token: completionToken,
          total_parts,
          part_size_bytes,
          completed_parts: [],
          created_at: Date.now()
        });
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_save",
          error: err instanceof Error ? err.message : "Resume save failed"
        });
      }
    }
    const maxConcurrency = options?.maxConcurrency || this.defaultConcurrency();
    const availableUrls = /* @__PURE__ */ new Map();
    if (startData.part_urls.length > 0) {
      for (const pu of startData.part_urls) {
        availableUrls.set(pu.part_number, pu);
      }
    }
    const pendingParts = [];
    for (let i = 1; i <= total_parts; i++) {
      if (!completedParts.has(i)) {
        pendingParts.push(i);
      }
    }
    let uploadedCount = completedParts.size;
    let lastProgressMilestone = 0;
    const reportProgress = () => {
      const percent = Math.round(uploadedCount / total_parts * 100);
      if (options?.onProgress) {
        options.onProgress(percent);
      }
      const milestone = Math.floor(percent / 25) * 25;
      if (milestone > lastProgressMilestone && milestone < 100) {
        telemetry?.emit(sessionId, "upload.progress", {
          percent: milestone,
          uploaded_parts: uploadedCount,
          total_parts
        });
        lastProgressMilestone = milestone;
      }
    };
    reportProgress();
    let partIndex = 0;
    while (partIndex < pendingParts.length) {
      if (options?.signal?.aborted) {
        await this.abortMultipart(upload_session_id, completionToken, requestOpts);
        telemetry?.emit(sessionId, "upload.aborted", { file_id });
        await this.reportUploadFailureBestEffort(
          {
            fileId: file_id,
            completionToken,
            step: "multipart_abort",
            errorCode: "aborted",
            errorMessage: "Upload aborted",
            diagnostics: getUploadEnvironmentDiagnostics()
          },
          requestOpts
        );
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const remainingUrlCount = pendingParts.slice(partIndex).filter((p) => availableUrls.has(p)).length;
      if (remainingUrlCount <= 4) {
        const neededParts = pendingParts.slice(partIndex, partIndex + 16).filter((p) => !availableUrls.has(p));
        if (neededParts.length > 0) {
          const urlResult = await this.post(
            "/signed-url/multipart/part-urls",
            { upload_session_id, part_numbers: neededParts, completion_token: completionToken },
            requestOpts
          );
          if (urlResult.data) {
            for (const pu of urlResult.data.part_urls) {
              availableUrls.set(pu.part_number, pu);
            }
          }
        }
      }
      const batch = pendingParts.slice(partIndex, partIndex + maxConcurrency);
      const batchPromises = batch.map(async (partNum) => {
        const partUrl = availableUrls.get(partNum);
        if (!partUrl) {
          const urlResult = await this.post(
            "/signed-url/multipart/part-urls",
            { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
            requestOpts
          );
          if (!urlResult.data?.part_urls?.[0]) {
            return { partNum, error: "Failed to get part URL" };
          }
          availableUrls.set(partNum, urlResult.data.part_urls[0]);
        }
        const url = availableUrls.get(partNum).url;
        const start = (partNum - 1) * part_size_bytes;
        const end = Math.min(start + part_size_bytes, file.size);
        const partBlob = file.slice(start, end);
        const result = await this.uploadPartWithRetry(url, partBlob, options?.signal, partNum, sessionId, telemetry);
        if (result.error) {
          if (result.code === "upload_stalled") {
            telemetry?.emit(sessionId, "upload.stalled", { step: "multipart_part", part_number: partNum });
          }
          telemetry?.emit(sessionId, "upload.multipart.part_failed", {
            part_number: partNum,
            error: result.error,
            code: result.code
          });
          if (result.status === 403) {
            telemetry?.emit(sessionId, "upload.multipart.url_refreshed", { part_number: partNum });
            const refreshResult = await this.post(
              "/signed-url/multipart/part-urls",
              { upload_session_id, part_numbers: [partNum], completion_token: completionToken },
              requestOpts
            );
            if (refreshResult.data?.part_urls?.[0]) {
              availableUrls.set(partNum, refreshResult.data.part_urls[0]);
              const retryResult = await this.uploadPartWithRetry(
                refreshResult.data.part_urls[0].url,
                partBlob,
                options?.signal,
                partNum,
                sessionId,
                telemetry
              );
              if (retryResult.etag) {
                return { partNum, etag: retryResult.etag };
              }
            }
          }
          return { partNum, error: result.error };
        }
        return { partNum, etag: result.etag };
      });
      const results = await Promise.all(batchPromises);
      for (const result of results) {
        if (result.etag) {
          completedParts.set(result.partNum, result.etag);
          uploadedCount++;
          telemetry?.emit(sessionId, "upload.multipart.part_completed", { part_number: result.partNum });
          if (resumeStore) {
            try {
              const { UploadResumeStore: UploadResumeStore2 } = await Promise.resolve().then(() => (init_upload_resume_RXLHBH5E(), upload_resume_RXLHBH5E_exports));
              const resumeKey = await UploadResumeStore2.generateResumeKey(
                this.client.getApiKey?.() || "",
                this.client.getUserId?.() || "",
                filename,
                file.size,
                file.lastModified
              );
              await resumeStore.updatePart(resumeKey, result.partNum, result.etag);
            } catch (err) {
              telemetry?.emit(sessionId, "upload.retried", {
                step: "resume_update",
                part_number: result.partNum,
                error: err instanceof Error ? err.message : "Resume update failed"
              });
            }
          }
        } else {
          const errorMsg = result.error || "Part upload returned no ETag";
          await this.abortMultipart(upload_session_id, completionToken, requestOpts);
          telemetry?.emit(sessionId, "upload.multipart.aborted", { file_id, error: errorMsg });
          await this.reportUploadFailureBestEffort(
            {
              fileId: file_id,
              completionToken,
              step: "multipart_part",
              errorCode: "upload_error",
              errorMessage: errorMsg,
              diagnostics: {
                ...getUploadEnvironmentDiagnostics(),
                part_number: result.partNum
              }
            },
            requestOpts
          );
          return {
            data: null,
            error: { code: "upload_error", message: `Part ${result.partNum} failed: ${errorMsg}`, status: 0 }
          };
        }
      }
      reportProgress();
      partIndex += batch.length;
    }
    const parts = Array.from(completedParts.entries()).sort(([a], [b]) => a - b).map(([part_number, etag]) => ({ part_number, etag }));
    const completeResult = await this.post(
      "/signed-url/multipart/complete",
      { upload_session_id, file_id, completion_token: completionToken, parts },
      requestOpts
    );
    if (resumeStore) {
      try {
        const { UploadResumeStore: UploadResumeStore2 } = await Promise.resolve().then(() => (init_upload_resume_RXLHBH5E(), upload_resume_RXLHBH5E_exports));
        const resumeKey = await UploadResumeStore2.generateResumeKey(
          this.client.getApiKey?.() || "",
          this.client.getUserId?.() || "",
          filename,
          file.size,
          file.lastModified
        );
        await resumeStore.remove(resumeKey);
      } catch (err) {
        telemetry?.emit(sessionId, "upload.retried", {
          step: "resume_cleanup",
          error: err instanceof Error ? err.message : "Resume cleanup failed"
        });
      }
    }
    if (completeResult.error) {
      telemetry?.emit(sessionId, "upload.multipart.aborted", {
        file_id,
        error: completeResult.error.message,
        duration_ms: Date.now() - multipartStart
      });
      await this.reportUploadFailureBestEffort(
        {
          fileId: file_id,
          completionToken,
          step: "multipart_complete",
          errorCode: completeResult.error.code,
          errorMessage: completeResult.error.message,
          httpStatus: completeResult.error.status || void 0,
          diagnostics: {
            ...getUploadEnvironmentDiagnostics(),
            duration_ms: Date.now() - multipartStart
          }
        },
        requestOpts
      );
      return { data: null, error: completeResult.error };
    }
    telemetry?.emit(sessionId, "upload.multipart.completed", {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    telemetry?.emit(sessionId, "upload.completed", {
      file_id,
      size_bytes: file.size,
      duration_ms: Date.now() - multipartStart
    });
    options?.onProgress?.(100);
    const d = completeResult.data;
    return {
      data: {
        id: d.file_id,
        filename: d.filename,
        content_type: d.content_type,
        size_bytes: d.size_bytes,
        url: d.url,
        created_at: (/* @__PURE__ */ new Date()).toISOString()
      },
      error: null
    };
  }
  // --------------------------------------------------------------------------
  // Multipart Abort
  // --------------------------------------------------------------------------
  async abortMultipart(uploadSessionId, completionToken, requestOpts) {
    try {
      await this.post(
        "/signed-url/multipart/abort",
        {
          upload_session_id: uploadSessionId,
          ...completionToken ? { completion_token: completionToken } : {}
        },
        requestOpts
      );
    } catch {
    }
  }
  // --------------------------------------------------------------------------
  // Split Upload (server-side: presigned URL → client S3 upload → complete)
  // --------------------------------------------------------------------------
  /**
   * Get a presigned URL for direct upload to S3.
   * Use this when the browser uploads directly (with progress tracking)
   * and the server only brokers the URLs.
   *
   * Flow: server calls getUploadUrl() → returns URL to client → client PUTs to S3 → server calls completeUpload()
   */
  async getUploadUrl(filename, contentType, options, requestOptions) {
    return this.post(
      "/signed-url/upload",
      {
        filename,
        content_type: contentType,
        is_public: options?.isPublic ?? true,
        expires_in: options?.expiresIn ?? 3600,
        size_bytes: options?.sizeBytes,
        metadata: options?.metadata
      },
      requestOptions
    );
  }
  /**
   * Complete a presigned upload after the file has been uploaded to S3.
   * Triggers scan and makes the file available.
   */
  async completeUpload(fileId, completionToken, options, requestOptions) {
    return this.post(
      "/signed-url/complete",
      {
        file_id: fileId,
        completion_token: completionToken,
        size_bytes: options?.sizeBytes,
        checksum: options?.checksum
      },
      requestOptions
    );
  }
  /**
   * Persist a structured client-side upload failure against a file record.
   * Best used by split-upload clients that call getUploadUrl() manually.
   */
  async reportUploadFailure(params, requestOptions) {
    return this.post(
      "/signed-url/report-failure",
      {
        file_id: params.fileId,
        completion_token: params.completionToken,
        step: params.step,
        error_code: params.errorCode,
        error_message: params.errorMessage,
        http_status: params.httpStatus,
        attempt: params.attempt,
        diagnostics: params.diagnostics
      },
      requestOptions
    );
  }
  // --------------------------------------------------------------------------
  // Multipart Public API (for advanced/server-side usage)
  // --------------------------------------------------------------------------
  /** Start a multipart upload session. */
  async startMultipartUpload(params, requestOptions) {
    return this.post("/signed-url/multipart/start", params, requestOptions);
  }
  /** Get presigned URLs for specific part numbers. */
  async getMultipartPartUrls(uploadSessionId, partNumbers, completionToken, requestOptions) {
    return this.post(
      "/signed-url/multipart/part-urls",
      {
        upload_session_id: uploadSessionId,
        part_numbers: partNumbers,
        ...completionToken ? { completion_token: completionToken } : {}
      },
      requestOptions
    );
  }
  /** Complete a multipart upload. */
  async completeMultipartUpload(params, requestOptions) {
    return this.post("/signed-url/multipart/complete", params, requestOptions);
  }
  /** Abort a multipart upload. */
  async abortMultipartUpload(uploadSessionId, completionToken, requestOptions) {
    return this.post(
      "/signed-url/multipart/abort",
      {
        upload_session_id: uploadSessionId,
        ...completionToken ? { completion_token: completionToken } : {}
      },
      requestOptions
    );
  }
  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------
  /** Get file metadata (no signed URL). */
  async getInfo(fileId, options) {
    return this._get(`/files/${fileId}/info`, options);
  }
  /**
   * Get a signed view URL for inline display (img src, thumbnails).
   * Returns CloudFront signed URL (fast, ~1us) or S3 presigned fallback.
   */
  async getViewUrl(fileId, options) {
    return this.post(`/signed-url/view/${fileId}`, {}, options);
  }
  /**
   * Get signed view URLs for multiple files (batch, up to 100).
   * Single network call, returns all URLs.
   * The shared `expires_at` is a conservative lower bound — reflects the shortest-lived
   * URL in the batch. Individual URLs may remain valid longer if their files are public.
   */
  async getViewUrls(fileIds, options) {
    return this.post("/signed-url/view-batch", { file_ids: fileIds }, options);
  }
  /**
   * Get a signed download URL (Content-Disposition: attachment).
   */
  async getDownloadUrl(fileId, options) {
    return this.post(`/signed-url/download/${fileId}`, void 0, options);
  }
  /** Delete a file (soft delete). */
  async delete(fileId, options) {
    return this.del(`/files/${fileId}`, options);
  }
  /** List the current user's files (paginated). */
  async list(params, options) {
    return this.listMethod("/my-files", params, options);
  }
  /** Check file view/access status. */
  async getViewStatus(fileId, options) {
    return this._get(`/files/${fileId}/view-status`, options);
  }
  /**
   * Update a file's visibility (public/private).
   * Only the file owner can toggle this. Changes URL TTL — does not move the S3 object.
   * Public files get 7-day signed URLs; private files get 1-hour signed URLs.
   */
  async updateVisibility(fileId, isPublic, options) {
    return this.patch(
      `/files/${fileId}/visibility`,
      { is_public: isPublic },
      options
    );
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use upload() instead */
  async uploadFile(file, options) {
    return this.upload(file, {
      isPublic: options?.is_public,
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal
    });
  }
  /** @deprecated Use getInfo() instead */
  async getFile(id) {
    return this.getInfo(id);
  }
  /** @deprecated Use delete() instead */
  async deleteFile(id) {
    return this.delete(id);
  }
  /** @deprecated Use list() instead */
  async listFiles(params) {
    return this.list(params);
  }
  // --------------------------------------------------------------------------
  // Private: Upload to presigned URL with retry + stall guard
  // --------------------------------------------------------------------------
  async uploadToPresignedUrlWithRetry(url, file, onProgress, signal, sessionId, telemetry) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep2(delay);
        telemetry?.emit(sessionId || "", "upload.retried", { attempt });
      }
      const result = await this.uploadToPresignedUrl(url, file, onProgress, signal);
      if (result.error) {
        result.error.details = {
          ...result.error.details || {},
          attempt: attempt + 1,
          max_attempts: RETRY_DELAYS.length
        };
      }
      if (!result.error) return result;
      if (result.error.code === "aborted") return result;
      if (result.error.status && NON_RETRYABLE_STATUS_CODES.has(result.error.status)) {
        return result;
      }
      const isRetryable = result.error.status === 0 || RETRYABLE_STATUS_CODES2.has(result.error.status);
      if (!isRetryable || attempt === RETRY_DELAYS.length - 1) {
        return result;
      }
    }
    return { data: null, error: { code: "upload_error", message: "Upload failed after retries", status: 0 } };
  }
  /**
   * Upload file directly to S3 presigned URL.
   * Uses XHR for progress tracking in browser, fetch otherwise.
   * Includes stall detection.
   */
  async uploadToPresignedUrl(url, file, onProgress, signal) {
    if (signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    if (typeof XMLHttpRequest !== "undefined") {
      return this.uploadWithXHR(url, file, onProgress, signal);
    }
    const stallTimeout = DEFAULT_STALL_TIMEOUT_MS;
    const controller = new AbortController();
    let parentSignalCleanup;
    const combinedSignal = signal ? AbortSignal.any?.([
      signal,
      controller.signal
    ]) ?? (() => {
      const onAbort = () => controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
      parentSignalCleanup = () => signal.removeEventListener("abort", onAbort);
      return controller.signal;
    })() : controller.signal;
    const timer = setTimeout(() => controller.abort(), stallTimeout);
    try {
      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream"
        },
        signal: combinedSignal
      });
      clearTimeout(timer);
      parentSignalCleanup?.();
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: "upload_error",
            message: `S3 upload failed: ${response.status} ${response.statusText}`,
            status: response.status,
            details: {
              transport: "fetch",
              total_bytes: file.size,
              online: getOnlineStatus()
            }
          }
        };
      }
      onProgress?.(100);
      return { data: null, error: null };
    } catch (err) {
      clearTimeout(timer);
      parentSignalCleanup?.();
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const isStall = controller.signal.aborted && !signal?.aborted;
      return {
        data: null,
        error: {
          code: isStall ? "upload_stalled" : "upload_error",
          message: isStall ? `Upload stalled (no progress for ${stallTimeout / 1e3}s)` : err instanceof Error ? err.message : "S3 upload failed",
          status: 0,
          details: {
            transport: "fetch",
            total_bytes: file.size,
            online: getOnlineStatus()
          }
        }
      };
    }
  }
  uploadWithXHR(url, file, onProgress, signal) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const stallTimeout = getStallTimeout();
      let stallTimer = null;
      let lastLoaded = 0;
      let totalBytes = file.size;
      const resetStallTimer = () => {
        if (stallTimer !== null) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          xhr.abort();
          resolve({
            data: null,
            error: {
              code: "upload_stalled",
              message: `Upload stalled (no progress for ${stallTimeout / 1e3}s)`,
              status: 0,
              details: {
                transport: "xhr",
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
                online: getOnlineStatus()
              }
            }
          });
        }, stallTimeout);
      };
      const clearStallTimer = () => {
        if (stallTimer !== null) {
          clearTimeout(stallTimer);
          stallTimer = null;
        }
      };
      if (signal) {
        if (signal.aborted) {
          resolve({ data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } });
          return;
        }
        signal.addEventListener(
          "abort",
          () => {
            clearStallTimer();
            xhr.abort();
          },
          { once: true }
        );
      }
      xhr.upload.addEventListener("progress", (event) => {
        resetStallTimer();
        lastLoaded = event.loaded;
        totalBytes = event.total || totalBytes;
        if (event.lengthComputable && onProgress) {
          onProgress(Math.round(event.loaded / event.total * 100));
        }
      });
      xhr.addEventListener("load", () => {
        clearStallTimer();
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve({ data: null, error: null });
        } else {
          resolve({
            data: null,
            error: {
              code: "upload_error",
              message: `S3 upload failed: ${xhr.status}`,
              status: xhr.status,
              details: {
                transport: "xhr",
                bytes_sent: lastLoaded,
                total_bytes: totalBytes,
                progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
                online: getOnlineStatus()
              }
            }
          });
        }
      });
      xhr.addEventListener("error", () => {
        clearStallTimer();
        resolve({
          data: null,
          error: {
            code: "upload_error",
            message: "S3 upload failed",
            status: 0,
            details: {
              transport: "xhr",
              bytes_sent: lastLoaded,
              total_bytes: totalBytes,
              progress_percent: totalBytes > 0 ? Math.round(lastLoaded / totalBytes * 100) : void 0,
              online: getOnlineStatus()
            }
          }
        });
      });
      xhr.addEventListener("abort", () => {
        clearStallTimer();
        if (!signal?.aborted) return;
        resolve({
          data: null,
          error: { code: "aborted", message: "Upload aborted", status: 0 }
        });
      });
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.send(file);
      resetStallTimer();
    });
  }
  // --------------------------------------------------------------------------
  // Private: Part upload with retry
  // --------------------------------------------------------------------------
  async uploadPartWithRetry(url, blob, signal, partNumber, sessionId, telemetry) {
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) return { error: "Upload aborted", code: "aborted" };
      if (attempt > 0) {
        const delay = RETRY_DELAYS[attempt] ?? 0;
        if (delay > 0) await sleep2(delay);
        telemetry?.emit(sessionId || "", "upload.retried", { attempt, part_number: partNumber });
      }
      const controller = new AbortController();
      let partSignalCleanup;
      const combinedSignal = signal ? AbortSignal.any?.([
        signal,
        controller.signal
      ]) ?? (() => {
        const onAbort = () => controller.abort();
        signal.addEventListener("abort", onAbort, { once: true });
        partSignalCleanup = () => signal.removeEventListener("abort", onAbort);
        return controller.signal;
      })() : controller.signal;
      const timer = setTimeout(() => controller.abort(), DEFAULT_STALL_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          method: "PUT",
          body: blob,
          signal: combinedSignal
        });
        clearTimeout(timer);
        partSignalCleanup?.();
        if (response.ok) {
          const etag = response.headers.get("etag");
          if (!etag) {
            if (attempt === RETRY_DELAYS.length - 1) {
              return { error: "Part upload succeeded but ETag missing \u2014 cannot verify integrity", code: "s3_error" };
            }
            continue;
          }
          return { etag };
        }
        if (NON_RETRYABLE_STATUS_CODES.has(response.status)) {
          return { error: `Part upload failed: ${response.status}`, status: response.status, code: "s3_error" };
        }
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: `Part upload failed after retries: ${response.status}`,
            status: response.status,
            code: "s3_error"
          };
        }
      } catch (err) {
        clearTimeout(timer);
        partSignalCleanup?.();
        if (signal?.aborted) return { error: "Upload aborted", code: "aborted" };
        const isStall = controller.signal.aborted && !signal?.aborted;
        if (attempt === RETRY_DELAYS.length - 1) {
          return {
            error: isStall ? `Part upload stalled (no progress for ${DEFAULT_STALL_TIMEOUT_MS / 1e3}s)` : err instanceof Error ? err.message : "Part upload failed",
            code: isStall ? "upload_stalled" : "network_error"
          };
        }
      }
    }
    return { error: "Part upload failed after retries", code: "network_error" };
  }
  // --------------------------------------------------------------------------
  // Private: Helpers
  // --------------------------------------------------------------------------
  shouldUseMultipart(file, options) {
    if (options?.forceMultipart) return true;
    const threshold = isSlowNetwork() ? MULTIPART_THRESHOLD_SLOW : MULTIPART_THRESHOLD;
    return file.size >= threshold;
  }
  defaultChunkSize(fileSize) {
    if (fileSize > 512 * 1024 * 1024) return 16 * 1024 * 1024;
    const effectiveType = getNetworkEffectiveType2();
    if (effectiveType === "slow-2g" || effectiveType === "2g") return 5 * 1024 * 1024;
    if (effectiveType === "3g") return 5 * 1024 * 1024;
    return 8 * 1024 * 1024;
  }
  defaultConcurrency() {
    const effectiveType = getNetworkEffectiveType2();
    if (effectiveType === "slow-2g" || effectiveType === "2g") return 1;
    if (effectiveType === "3g") return 2;
    return 4;
  }
  async maybeCompress(file, config, sessionId, telemetry) {
    try {
      const { maybeCompressImage: maybeCompressImage2 } = await Promise.resolve().then(() => (init_upload_compression_VOUJRAIM(), upload_compression_VOUJRAIM_exports));
      return await maybeCompressImage2(file, config, sessionId, telemetry);
    } catch {
      return null;
    }
  }
  async reportUploadFailureBestEffort(params, requestOptions) {
    try {
      await this.reportUploadFailure(params, requestOptions);
    } catch {
    }
  }
  getOrCreateTelemetry() {
    if (!this.telemetry) {
      this.telemetry = new UploadTelemetry(this.client);
    }
    return this.telemetry;
  }
  /** Build RequestOptions with X-Upload-Session-Id header for cross-boundary correlation */
  withSessionHeader(sessionId, options) {
    const headers = { "X-Upload-Session-Id": sessionId };
    if (options?.clientContext) {
      return { clientContext: options.clientContext, headers };
    }
    return { headers };
  }
  /**
   * Use ServiceModule's list method but with a cleaner name internally
   * (can't call protected `list` from public method with same name).
   */
  listMethod(path, params, options) {
    return super._list(path, params, options);
  }
};
function sleep2(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getStallTimeout() {
  return isSlowNetwork() ? SLOW_NETWORK_STALL_TIMEOUT_MS : DEFAULT_STALL_TIMEOUT_MS;
}
function isSlowNetwork() {
  const effectiveType = getNetworkEffectiveType2();
  return effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
}
function getNetworkEffectiveType2() {
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const conn = navigator.connection;
    return conn?.effectiveType || "4g";
  }
  return "4g";
}
function getOnlineStatus() {
  if (typeof navigator === "undefined") return void 0;
  return navigator.onLine;
}
function getUploadEnvironmentDiagnostics() {
  const diagnostics = {
    network_type: getNetworkEffectiveType2(),
    online: getOnlineStatus()
  };
  if (typeof navigator !== "undefined") {
    const nav = navigator;
    if (typeof nav.hardwareConcurrency === "number") {
      diagnostics.hardware_concurrency = nav.hardwareConcurrency;
    }
    if (typeof nav.deviceMemory === "number") {
      diagnostics.device_memory_gb = nav.deviceMemory;
    }
    if (nav.connection?.downlink != null) {
      diagnostics.downlink_mbps = nav.connection.downlink;
    }
    if (nav.connection?.rtt != null) {
      diagnostics.rtt_ms = nav.connection.rtt;
    }
  }
  if (typeof document !== "undefined") {
    diagnostics.visibility_state = document.visibilityState;
  }
  return diagnostics;
}
function asNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
var DEFAULT_RECONNECT_BASE_MS = 1e3;
var MAX_RECONNECT_MS = 3e4;
var HEARTBEAT_INTERVAL_MS = 3e4;
var RealtimeService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/realtime";
    this.ws = null;
    this.usedTicketAuth = false;
    this.subscriptions = /* @__PURE__ */ new Map();
    this.presenceCallbacks = /* @__PURE__ */ new Map();
    this.statusCallbacks = /* @__PURE__ */ new Set();
    this._status = "disconnected";
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.authenticated = false;
  }
  /** Current connection status */
  get status() {
    return this._status;
  }
  // --------------------------------------------------------------------------
  // Subscribe / Unsubscribe
  // --------------------------------------------------------------------------
  /**
   * Subscribe to a channel. Connects WebSocket on first call.
   * Returns an unsubscribe function.
   */
  subscribe(channel, callback) {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, /* @__PURE__ */ new Set());
    }
    this.subscriptions.get(channel).add(callback);
    if (this._status === "disconnected") {
      this.connect();
    } else if (this.authenticated) {
      this.sendWs({ type: "subscribe", channel });
    }
    return () => {
      const subs = this.subscriptions.get(channel);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscriptions.delete(channel);
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.sendWs({ type: "unsubscribe", channel });
          }
        }
      }
    };
  }
  // --------------------------------------------------------------------------
  // Publish
  // --------------------------------------------------------------------------
  /** Publish data to a channel via WebSocket. */
  publish(channel, data) {
    if (this._status !== "connected" || !this.authenticated) {
      throw new Error("Cannot publish: not connected");
    }
    this.sendWs({ type: "publish", channel, data });
  }
  // --------------------------------------------------------------------------
  // Presence
  // --------------------------------------------------------------------------
  /** Join a presence channel with optional user data. */
  joinPresence(channel, userData) {
    if (this._status !== "connected") {
      throw new Error("Cannot join presence: not connected");
    }
    this.sendWs({ type: "presence_join", channel, user_data: userData });
  }
  /** Leave a presence channel. */
  leavePresence(channel) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendWs({ type: "presence_leave", channel });
    }
  }
  /** Listen for presence events on a channel. Returns unsubscribe function. */
  onPresence(channel, callback) {
    if (!this.presenceCallbacks.has(channel)) {
      this.presenceCallbacks.set(channel, /* @__PURE__ */ new Set());
    }
    this.presenceCallbacks.get(channel).add(callback);
    return () => {
      const cbs = this.presenceCallbacks.get(channel);
      if (cbs) {
        cbs.delete(callback);
        if (cbs.size === 0) this.presenceCallbacks.delete(channel);
      }
    };
  }
  // --------------------------------------------------------------------------
  // Server-side broadcast (HTTP endpoints)
  // --------------------------------------------------------------------------
  /** Broadcast to all connections for this application. */
  async broadcast(event, data, options) {
    return this.post("/broadcast", { event, data }, options);
  }
  /** Broadcast to a specific channel. */
  async broadcastToChannel(channel, event, data, options) {
    return this.post(`/broadcast/channel/${channel}`, { event, data }, options);
  }
  /** Send to a specific user's connections. */
  async sendToUser(userId, event, data, options) {
    return this.post(`/broadcast/user/${userId}`, { event, data }, options);
  }
  // --------------------------------------------------------------------------
  // Connection Lifecycle
  // --------------------------------------------------------------------------
  /** Listen for connection status changes. */
  onStatusChange(callback) {
    this.statusCallbacks.add(callback);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
  /** Disconnect and clean up all subscriptions. */
  disconnect() {
    this.clearTimers();
    this.subscriptions.clear();
    this.presenceCallbacks.clear();
    this.statusCallbacks.clear();
    this.authenticated = false;
    this.reconnectAttempt = 0;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }
  // --------------------------------------------------------------------------
  // Private: WebSocket management
  // --------------------------------------------------------------------------
  connect() {
    if (this._status === "connecting" || this._status === "connected") return;
    this.setStatus(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");
    this.fetchTicketAndConnect();
  }
  async fetchTicketAndConnect() {
    const baseUrl = this.client.getBaseUrl();
    try {
      const headers = { "Content-Type": "application/json" };
      const apiKey = this.client.getApiKey();
      if (apiKey) headers["x-api-key"] = apiKey;
      const token = this.client.getSessionToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const ticketRes = await fetch(`${baseUrl}/v1/realtime/ws/ticket`, {
        method: "POST",
        headers
      });
      let wsUrl;
      if (ticketRes.ok) {
        const ticketData = await ticketRes.json();
        const ticket = ticketData.ticket;
        wsUrl = baseUrl.replace(/^http/, "ws") + `/v1/realtime/ws?ticket=${encodeURIComponent(ticket)}`;
        this.usedTicketAuth = true;
      } else {
        wsUrl = baseUrl.replace(/^http/, "ws") + "/v1/realtime/ws";
        this.usedTicketAuth = false;
      }
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      if (!this.usedTicketAuth) {
        this.authenticate();
      }
      this.startHeartbeat();
      if (this.usedTicketAuth) {
        setTimeout(() => {
          if (!this.authenticated) {
            this.authenticated = true;
            this.setStatus("connected");
            for (const channel of this.subscriptions.keys()) {
              this.sendWs({ type: "subscribe", channel });
            }
          }
        }, 2e3);
      }
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
      }
    };
    this.ws.onclose = () => {
      this.authenticated = false;
      this.clearHeartbeat();
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
    };
  }
  authenticate() {
    const token = this.client.getSessionToken();
    const appId = this.client.getApplicationId();
    this.sendWs({
      type: "auth",
      token: token || void 0,
      app_id: appId || void 0
    });
  }
  handleMessage(msg) {
    const type = msg.type;
    switch (type) {
      case "auth_success":
        this.authenticated = true;
        this.setStatus("connected");
        for (const channel of this.subscriptions.keys()) {
          this.sendWs({ type: "subscribe", channel });
        }
        break;
      case "subscribed":
        break;
      case "message":
        this.dispatchMessage(msg.channel, msg.data);
        break;
      case "error":
        break;
      case "presence_state":
        this.dispatchPresence({
          type: "state",
          channel: msg.channel,
          members: msg.members
        });
        break;
      case "presence_join":
        this.dispatchPresence({
          type: "join",
          channel: msg.channel,
          user: msg.user
        });
        break;
      case "presence_leave":
        this.dispatchPresence({
          type: "leave",
          channel: msg.channel,
          user_id: msg.user_id
        });
        break;
    }
  }
  dispatchMessage(channel, data) {
    const subs = this.subscriptions.get(channel);
    if (subs) {
      for (const cb of subs) {
        try {
          cb(data, channel);
        } catch {
        }
      }
    }
  }
  dispatchPresence(event) {
    const cbs = this.presenceCallbacks.get(event.channel);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(event);
        } catch {
        }
      }
    }
  }
  sendWs(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }
  // --------------------------------------------------------------------------
  // Private: Reconnection
  // --------------------------------------------------------------------------
  scheduleReconnect() {
    if (this.subscriptions.size === 0 && this.presenceCallbacks.size === 0) {
      this.setStatus("disconnected");
      return;
    }
    this.setStatus("reconnecting");
    const delay = this.getReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempt++;
      this.connect();
    }, delay);
  }
  getReconnectDelay() {
    const exponential = DEFAULT_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt);
    const jitter = Math.random() * 0.3 * exponential;
    return Math.min(exponential + jitter, MAX_RECONNECT_MS);
  }
  // --------------------------------------------------------------------------
  // Private: Heartbeat
  // --------------------------------------------------------------------------
  startHeartbeat() {
    this.clearHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
  clearHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  clearTimers() {
    this.clearHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  // --------------------------------------------------------------------------
  // Private: Status
  // --------------------------------------------------------------------------
  setStatus(status) {
    if (this._status === status) return;
    this._status = status;
    for (const cb of this.statusCallbacks) {
      try {
        cb(status);
      } catch {
      }
    }
  }
};
var DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
var MIN_CHUNK_SIZE = 5 * 1024 * 1024;
var VideoService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/videos";
  }
  // --------------------------------------------------------------------------
  // Upload (3-step chunked flow)
  // --------------------------------------------------------------------------
  /**
   * Upload a video file using chunked multipart upload.
   *
   * Internally:
   *   1. Starts a multipart upload session
   *   2. Uploads chunks sequentially with progress tracking
   *   3. Completes the upload, triggering transcoding
   *
   * @returns The video record with id, status, etc.
   */
  async upload(file, options, requestOptions) {
    if (options?.signal?.aborted) {
      return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
    }
    const chunkSize = Math.max(options?.chunkSize ?? DEFAULT_CHUNK_SIZE, MIN_CHUNK_SIZE);
    const totalChunks = Math.ceil(file.size / chunkSize);
    const filename = options?.filename || file.name || "video";
    const startResult = await this.post(
      "/upload-start",
      {
        filename,
        content_type: file.type || "video/mp4",
        size_bytes: file.size,
        title: options?.title,
        description: options?.description,
        metadata: options?.metadata
      },
      requestOptions
    );
    if (startResult.error) return { data: null, error: startResult.error };
    const { video_id, upload_id } = startResult.data;
    const parts = [];
    for (let i = 0; i < totalChunks; i++) {
      if (options?.signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      const partNumber = i + 1;
      const partResult = await this.uploadPart(video_id, upload_id, partNumber, chunk, options?.signal);
      if (partResult.error) return { data: null, error: partResult.error };
      parts.push({
        part_number: partNumber,
        etag: partResult.data.etag
      });
      if (options?.onProgress) {
        const progress = Math.round(partNumber / totalChunks * 100);
        options.onProgress(progress);
      }
    }
    const completeResult = await this.post(
      `/${video_id}/upload-complete`,
      {
        upload_id,
        parts
      },
      requestOptions
    );
    return completeResult;
  }
  // --------------------------------------------------------------------------
  // Video Operations
  // --------------------------------------------------------------------------
  /** Get video metadata and status. */
  async get(videoId, options) {
    return super._get(`/${videoId}`, options);
  }
  /**
   * Get the HLS master playlist URL for streaming.
   * Returns the playlist URL that can be passed to a video player.
   */
  async getStreamUrl(videoId) {
    const baseUrl = this.client.getBaseUrl();
    return {
      data: { url: `${baseUrl}${this.basePath}/${videoId}/playlist.m3u8` },
      error: null
    };
  }
  /**
   * Track a playback event (view, play, pause, seek, complete, etc.).
   */
  async trackPlayback(videoId, event, options) {
    return this.post(`/${videoId}/track`, event, options);
  }
  /** Get video analytics (views, watch time, etc.). */
  async getAnalytics(videoId, options) {
    return super._get(
      `/${videoId}/analytics`,
      options
    );
  }
  /**
   * Update a video's access mode (public/private).
   * Public videos get 7-day signed URLs; private get 1-hour signed URLs.
   */
  async updateAccessMode(videoId, accessMode, options) {
    return this.patch(`/${videoId}`, { access_mode: accessMode }, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use upload() instead */
  async uploadVideo(file, options) {
    return this.upload(file, {
      metadata: options?.metadata,
      onProgress: options?.onProgress,
      signal: options?.signal
    });
  }
  /** @deprecated Use get() instead */
  async getVideo(id) {
    return this.get(id);
  }
  // --------------------------------------------------------------------------
  // Private: Chunk upload
  // --------------------------------------------------------------------------
  async uploadPart(videoId, uploadId, partNumber, chunk, signal) {
    const formData = new FormData();
    formData.append("file", chunk);
    const path = `${this.basePath}/${videoId}/upload-part?upload_id=${encodeURIComponent(uploadId)}&part_number=${partNumber}`;
    const headers = {
      "x-api-key": this.client.getApiKey()
    };
    const token = this.client.getSessionToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const response = await fetch(`${this.client.getBaseUrl()}${path}`, {
        method: "POST",
        headers,
        body: formData,
        signal
      });
      const data = await response.json();
      if (!response.ok) {
        return {
          data: null,
          error: {
            code: data?.error?.code || "upload_error",
            message: data?.error?.message || data?.message || "Part upload failed",
            status: response.status
          }
        };
      }
      const result = data?.data !== void 0 ? data.data : data;
      return { data: result, error: null };
    } catch (err) {
      if (signal?.aborted) {
        return { data: null, error: { code: "aborted", message: "Upload aborted", status: 0 } };
      }
      return {
        data: null,
        error: {
          code: "upload_error",
          message: err instanceof Error ? err.message : "Part upload failed",
          status: 0
        }
      };
    }
  }
};
var DataService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/data";
  }
  // --------------------------------------------------------------------------
  // Collections
  // --------------------------------------------------------------------------
  async createCollection(name, schema, options) {
    return this.post("/collections", { name, schema }, options);
  }
  async listCollections(options) {
    return this._get("/collections", options);
  }
  async deleteCollection(name, options) {
    return this.del(`/collections/${name}`, options);
  }
  // --------------------------------------------------------------------------
  // Documents — CRUD
  // --------------------------------------------------------------------------
  async create(collection, data, options) {
    return this.post(`/${collection}/documents`, { data }, options);
  }
  async get(collection, docId, options) {
    return this._get(`/${collection}/documents/${docId}`, options);
  }
  async update(collection, docId, data, options) {
    return this.patch(`/${collection}/documents/${docId}`, { data }, options);
  }
  async delete(collection, docId, options) {
    return this.del(`/${collection}/documents/${docId}`, options);
  }
  // --------------------------------------------------------------------------
  // Documents — Query & Aggregate
  // --------------------------------------------------------------------------
  async query(collection, options, requestOptions) {
    const filters = (options?.filters ?? []).map((f) => {
      if (f.operator === "in" && !f.values && f.value != null) {
        return { operator: f.operator, field: f.field, values: Array.isArray(f.value) ? f.value : [f.value] };
      }
      return f;
    });
    const body = {
      filters,
      sort: options?.sort ?? [],
      page: options?.page ?? 1,
      per_page: options?.perPage ?? 20
    };
    const response = await this.post(`/${collection}/query`, body, requestOptions);
    if (response.error) {
      return {
        data: [],
        metadata: { total: 0, totalPages: 0, page: body.page, perPage: body.per_page },
        error: response.error
      };
    }
    const raw = response.data;
    const documents = raw?.documents ?? raw?.data ?? [];
    const total = raw?.total ?? documents.length;
    const totalPages = raw?.total_pages ?? (total > 0 ? Math.ceil(total / body.per_page) : 0);
    return {
      data: documents,
      metadata: {
        total,
        totalPages,
        page: raw?.page ?? body.page,
        perPage: raw?.per_page ?? body.per_page
      },
      error: null
    };
  }
  async aggregate(collection, options, requestOptions) {
    return this.post(`/${collection}/aggregate`, options, requestOptions);
  }
  async myDocuments(collection, options, requestOptions) {
    return this._list(`/${collection}/my-documents`, options, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use create() instead */
  async createDocument(collection, data) {
    return this.create(collection, data);
  }
  /** @deprecated Use get() instead */
  async getDocument(collection, id) {
    return this.get(collection, id);
  }
  /** @deprecated Use update() instead */
  async updateDocument(collection, id, data) {
    return this.update(collection, id, data);
  }
  /** @deprecated Use delete() instead */
  async deleteDocument(collection, id) {
    return this.delete(collection, id);
  }
  /** @deprecated Use query() instead */
  async queryDocuments(collection, options) {
    return this.query(collection, options);
  }
};
var ChatService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/chat";
  }
  // --------------------------------------------------------------------------
  // Conversations
  // --------------------------------------------------------------------------
  async createConversation(data, options) {
    return this.post("/conversations", data, options);
  }
  async listConversations(params, requestOptions) {
    return this._list("/conversations", params, requestOptions);
  }
  async getConversation(id, options) {
    return this._get(`/conversations/${id}`, options);
  }
  async addParticipant(conversationId, userId, options) {
    return this.post(`/conversations/${conversationId}/participants`, { user_id: userId }, options);
  }
  async removeParticipant(conversationId, userId, options) {
    return this.del(`/conversations/${conversationId}/participants/${userId}`, options);
  }
  // --------------------------------------------------------------------------
  // Messages
  // --------------------------------------------------------------------------
  async sendMessage(conversationId, data, options) {
    return this.post(`/conversations/${conversationId}/messages`, data, options);
  }
  async getThreadReplies(messageId, params, requestOptions) {
    return this._get(this.withQuery(`/messages/${messageId}/replies`, params), requestOptions);
  }
  async getMessages(conversationId, options, requestOptions) {
    return this._get(
      this.withQuery(`/conversations/${conversationId}/messages`, options),
      requestOptions
    );
  }
  async editMessage(messageId, data, options) {
    return this.patch(`/messages/${messageId}`, data, options);
  }
  async deleteMessage(messageId, options) {
    return this.del(`/messages/${messageId}`, options);
  }
  async addReaction(messageId, data, options) {
    return this.post(`/messages/${messageId}/reactions`, data, options);
  }
  // --------------------------------------------------------------------------
  // Typing & Read Receipts
  // --------------------------------------------------------------------------
  async sendTyping(conversationId, options) {
    return this.post(`/conversations/${conversationId}/typing`, void 0, options);
  }
  async markRead(conversationId, options) {
    return this.post(`/conversations/${conversationId}/read`, void 0, options);
  }
  async getReadStatus(conversationId, options) {
    return this._get(`/conversations/${conversationId}/read-status`, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use createConversation() instead */
  async createChat(data) {
    return this.createConversation(data);
  }
};
var ConferenceService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/conference";
  }
  // --------------------------------------------------------------------------
  // Call Lifecycle
  // --------------------------------------------------------------------------
  async createCall(data, options) {
    return this.post("/calls", data, options);
  }
  async getCall(callId, options) {
    return this._get(`/calls/${callId}`, options);
  }
  async listCalls(params, options) {
    return this._get(this.withQuery("/calls", params), options);
  }
  async endCall(callId, options) {
    return this.post(`/calls/${callId}/end`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Participants
  // --------------------------------------------------------------------------
  async joinCall(callId, options) {
    return this.post(`/calls/${callId}/join`, void 0, options);
  }
  async leaveCall(callId, options) {
    return this.post(`/calls/${callId}/leave`, void 0, options);
  }
  async listParticipants(callId, options) {
    return this._get(`/calls/${callId}/participants`, options);
  }
  // --------------------------------------------------------------------------
  // Recording
  // --------------------------------------------------------------------------
  async startRecording(callId, options) {
    return this.post(`/calls/${callId}/recording/start`, void 0, options);
  }
  async stopRecording(callId, options) {
    return this.post(`/calls/${callId}/recording/stop`, void 0, options);
  }
  async consentToRecording(callId, options) {
    return this.post(`/calls/${callId}/recording/consent`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------
  async getSettings(options) {
    return this._get("/settings", options);
  }
  async updateSettings(data, options) {
    return this.put("/settings", data, options);
  }
  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------
  async submitStats(callId, stats, options) {
    return this.post(`/calls/${callId}/stats`, stats, options);
  }
};
var SocialService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/social";
  }
  // --------------------------------------------------------------------------
  // Follow / Unfollow
  // --------------------------------------------------------------------------
  async follow(userId, options) {
    return this.post(`/users/${userId}/follow`, void 0, options);
  }
  async unfollow(userId, options) {
    return this.del(`/users/${userId}/follow`, options);
  }
  async getFollowers(userId, params, requestOptions) {
    return this._list(`/users/${userId}/followers`, params, requestOptions);
  }
  async getFollowing(userId, params, requestOptions) {
    return this._list(`/users/${userId}/following`, params, requestOptions);
  }
  async getFollowStatus(userId, options) {
    return this._get(`/users/${userId}/follow-status`, options);
  }
  // --------------------------------------------------------------------------
  // Posts
  // --------------------------------------------------------------------------
  async createPost(data, options) {
    return this.post("/posts", data, options);
  }
  async getPost(postId, options) {
    return this._get(`/posts/${postId}`, options);
  }
  async deletePost(postId, options) {
    return this.del(`/posts/${postId}`, options);
  }
  async getUserPosts(userId, params, requestOptions) {
    return this._list(`/users/${userId}/posts`, params, requestOptions);
  }
  async getFeed(options, requestOptions) {
    return this._list("/feed", options, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Likes
  // --------------------------------------------------------------------------
  async like(targetType, targetId, options) {
    return this.post(`/${targetType}/${targetId}/like`, void 0, options);
  }
  async unlike(targetType, targetId, options) {
    return this.del(`/${targetType}/${targetId}/like`, options);
  }
  async getLikes(targetType, targetId, params, requestOptions) {
    return this._list(`/${targetType}/${targetId}/likes`, params, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Comments
  // --------------------------------------------------------------------------
  async comment(postId, data, options) {
    return this.post(`/posts/${postId}/comments`, data, options);
  }
  async getComments(postId, params, requestOptions) {
    return this._list(`/posts/${postId}/comments`, params, requestOptions);
  }
  // --------------------------------------------------------------------------
  // Activity Feed
  // --------------------------------------------------------------------------
  async getActivity(params, requestOptions) {
    return this._list("/activity", params, requestOptions);
  }
  async markActivityRead(activityId, options) {
    return this.patch(`/activity/${activityId}/read`, {}, options);
  }
  async markAllRead(options) {
    return this.patch("/activity/read-all", {}, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use comment() instead */
  async addComment(postId, data) {
    return this.comment(postId, data);
  }
};
var ReferralsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/referrals";
  }
  /**
   * Get current user's referral code, share link, campaign, and stats.
   * Requires member auth.
   */
  async getMyReferral(options) {
    return this._get("/me", options);
  }
  /**
   * Generate a tracked share link. The `channel` param records where
   * the share was initiated (e.g., 'whatsapp', 'email', 'copy').
   * Requires member auth.
   */
  async createShareLink(channel, options) {
    return this.post("/links", channel ? { channel } : void 0, options);
  }
  /**
   * Get referral analytics for the current user over the last N days.
   * Requires member auth.
   */
  async getMyAnalytics(days, options) {
    const query = days ? `?days=${days}` : "";
    return this._get(`/me/analytics${query}`, options);
  }
  /**
   * Resolve a referral code to its campaign info.
   * Public endpoint — no member auth required, only API key.
   */
  async resolveCode(code, options) {
    return this._get(`/public?rc=${encodeURIComponent(code)}`, options);
  }
};
var BillingService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/money/billing";
  }
  retiredSurface(route) {
    return Promise.reject(
      new Error(
        `${route} was retired after the money-services cutover. Use the dedicated money services instead of BillingService for this operation.`
      )
    );
  }
  // --------------------------------------------------------------------------
  // Customers
  // --------------------------------------------------------------------------
  async createCustomer(data, options) {
    return this.post("/customers", data, options);
  }
  async addPaymentMethod(data, options) {
    return this.post("/payment-methods", data, options);
  }
  // --------------------------------------------------------------------------
  // Subscriptions
  // --------------------------------------------------------------------------
  async subscribe(data, options) {
    return this.retiredSurface("/v1/money/billing/subscriptions");
  }
  async listSubscriptions(params, options) {
    return this.retiredSurface("/v1/money/billing/subscriptions");
  }
  async cancelSubscription(id, options) {
    return this.retiredSurface(`/v1/money/billing/subscriptions/${id}/cancel`);
  }
  async resumeSubscription(id, options) {
    return this.retiredSurface(`/v1/money/billing/subscriptions/${id}/resume`);
  }
  async upgradeSubscription(id, data, options) {
    return this.retiredSurface(`/v1/money/billing/subscriptions/${id}/upgrade`);
  }
  // --------------------------------------------------------------------------
  // Usage
  // --------------------------------------------------------------------------
  async reportUsage(data, options) {
    return this.retiredSurface("/v1/money/billing/usage");
  }
  async getUsageSummary(options) {
    return this.retiredSurface("/v1/money/billing/usage/summary");
  }
  // --------------------------------------------------------------------------
  // Invoices
  // --------------------------------------------------------------------------
  async listInvoices(params, options) {
    return this._list("/invoices", params, options);
  }
  async getInvoice(id, options) {
    return this._get(`/invoices/${id}`, options);
  }
  async payInvoice(id, options) {
    return this.post(`/invoices/${id}/pay`, void 0, options);
  }
  async getInvoicePdf(id, options) {
    return this._get(`/invoices/${id}/pdf`, options);
  }
  // --------------------------------------------------------------------------
  // Connected Accounts (Marketplace)
  // --------------------------------------------------------------------------
  async createConnectedAccount(data, options) {
    return this.post("/connected-accounts", data, options);
  }
  async getConnectedAccount(id, options) {
    return this._get(`/connected-accounts/${id}`, options);
  }
  async getMyConnectedAccount(options) {
    return this._get("/connected-accounts/me", options);
  }
  async createOnboardingLink(id, data, options) {
    return this.post(`/connected-accounts/${id}/onboarding-link`, data, options);
  }
  async getAccountBalance(id, options) {
    return this.retiredSurface(`/v1/money/billing/connected-accounts/${id}/balance`);
  }
  async createAccountSession(id, options) {
    return this.post(`/connected-accounts/${id}/account-session`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Config
  // --------------------------------------------------------------------------
  async getPublishableKey(options) {
    return this._get("/config/publishable-key", options);
  }
  // --------------------------------------------------------------------------
  // Payments (Marketplace)
  // --------------------------------------------------------------------------
  async createPayment(data, options) {
    return this.retiredSurface("/v1/money/billing/payments");
  }
  async getPayment(id, options) {
    return this.retiredSurface(`/v1/money/billing/payments/${id}`);
  }
  async listPayments(params, options) {
    return this.retiredSurface("/v1/money/billing/payments");
  }
  // --------------------------------------------------------------------------
  // Refunds
  // --------------------------------------------------------------------------
  async refundPayment(id, data, options) {
    return this.retiredSurface(`/v1/money/billing/payments/${id}/refund`);
  }
  // --------------------------------------------------------------------------
  // Payouts
  // --------------------------------------------------------------------------
  async getPayoutHistory(accountId, params, options) {
    return this.retiredSurface(`/v1/money/billing/connected-accounts/${accountId}/payouts`);
  }
  async getPayoutSchedule(accountId, options) {
    return this._get(`/connected-accounts/${accountId}/payout-schedule`, options);
  }
  async setPayoutSchedule(accountId, data, options) {
    return this.put(`/connected-accounts/${accountId}/payout-schedule`, data, options);
  }
  // --------------------------------------------------------------------------
  // Ledger
  // --------------------------------------------------------------------------
  async getTransactions(params, options) {
    return this.retiredSurface("/v1/money/billing/transactions");
  }
  async getTransactionSummary(params, options) {
    return this.retiredSurface("/v1/money/billing/transactions/summary");
  }
  // --------------------------------------------------------------------------
  // Setup Sessions
  // --------------------------------------------------------------------------
  async createSetupSession(data, options) {
    return this.post("/setup-sessions", data, options);
  }
  // --------------------------------------------------------------------------
  // Connected Account Operations: Products, Prices, Subscriptions, Transfers
  // --------------------------------------------------------------------------
  async createProduct(data, options) {
    return this.retiredSurface("/v1/money/billing/products");
  }
  async createPrice(data, options) {
    return this.retiredSurface("/v1/money/billing/prices");
  }
  async deactivatePrice(id, options) {
    return this.retiredSurface(`/v1/money/billing/prices/${id}/deactivate`);
  }
  async createConnectedSubscription(data, options) {
    return this.retiredSurface("/v1/money/billing/connected-subscriptions");
  }
  async cancelConnectedSubscription(id, data, options) {
    return this.retiredSurface(
      `/v1/money/billing/connected-subscriptions/${id}/cancel`
    );
  }
  async listConnectedSubscriptions(params, options) {
    return this.retiredSurface(
      "/v1/money/billing/connected-subscriptions"
    );
  }
  async createConnectedSetupIntent(data, options) {
    return this.retiredSurface("/v1/money/billing/connected-setup-intents");
  }
  async createTransfer(data, options) {
    return this.retiredSurface("/v1/money/billing/transfers");
  }
  async syncPaymentStatus(id, options) {
    return this.retiredSurface(`/v1/money/billing/payments/${id}/sync`);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use subscribe() instead */
  async createSubscription(data) {
    return this.subscribe(data);
  }
  /** @deprecated Use listInvoices() instead */
  async getInvoices(params) {
    return this.listInvoices(params);
  }
};
var AnalyticsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/analytics";
  }
  // --------------------------------------------------------------------------
  // Event Tracking (v2 — JetStream buffered)
  // --------------------------------------------------------------------------
  async track(event, properties, userId, options) {
    const payload = { event_name: event, properties, user_id: userId };
    if (!userId && !this.client.isAuthenticated()) {
      payload.anonymous_id = this.client.getAnonymousId();
    }
    return this.post("/v2/events", payload, options);
  }
  async trackBatch(events, options) {
    const mapped = events.map(({ event, ...rest }) => ({ event_name: event, ...rest }));
    return this.post("/v2/events/batch", { events: mapped }, options);
  }
  async trackPageView(data, options) {
    return this.post("/page-view", data, options);
  }
  // --------------------------------------------------------------------------
  // Identity
  // --------------------------------------------------------------------------
  async identify(userId, traits, anonymousId, options) {
    return this.post(
      "/identify",
      { user_id: userId, traits, anonymous_id: anonymousId },
      options
    );
  }
  async alias(userId, anonymousId, options) {
    return this.post("/alias", { user_id: userId, anonymous_id: anonymousId }, options);
  }
  // --------------------------------------------------------------------------
  // Query & Aggregations
  // --------------------------------------------------------------------------
  async queryEvents(filters) {
    return this._list("/events", filters);
  }
  async getAggregations(filters) {
    return this._get(this.withQuery("/aggregations", filters));
  }
  async getTopEvents(filters) {
    return this._get(this.withQuery("/top-events", filters));
  }
  async getActiveUsers() {
    return this._get("/users/active");
  }
  // --------------------------------------------------------------------------
  // Funnels
  // --------------------------------------------------------------------------
  async createFunnel(data) {
    return this.post("/funnels", data);
  }
  async listFunnels() {
    return this._get("/funnels");
  }
  async getFunnelConversions(id) {
    return this._get(`/funnels/${id}/conversions`);
  }
  // --------------------------------------------------------------------------
  // Custom Metrics
  // --------------------------------------------------------------------------
  async trackMetric(data, options) {
    return this.post("/metrics", data, options);
  }
  async queryMetrics(filters) {
    return this._get(this.withQuery("/metrics/query", filters));
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use queryEvents() instead */
  async query(filters) {
    return this._get(this.withQuery("/events", filters));
  }
};
var FlagsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/flags";
  }
  async evaluate(flagKey, context = {}, environment = "prod", options) {
    return this.post("/evaluate", { flag_key: flagKey, environment, context }, options);
  }
  async evaluateBatch(flagKeys, context = {}, environment = "prod", options) {
    return this.post(
      "/evaluate/batch",
      { flag_keys: flagKeys, environment, context },
      options
    );
  }
  async evaluateAll(context = {}, environment = "prod", options) {
    return this.post("/evaluate/all", { environment, context }, options);
  }
  async list(params, options) {
    return this._get(
      this.withQuery("", {
        application_id: params?.applicationId,
        status: params?.status,
        search: params?.search
      }),
      options
    );
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async create(data, params, options) {
    const path = this.withQuery("", { application_id: params?.applicationId });
    return this.post(path, data, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async archive(id, options) {
    return this.del(`/${id}`, options);
  }
  async activate(id, options) {
    return this.post(`/${id}/activate`, void 0, options);
  }
  async deactivate(id, options) {
    return this.post(`/${id}/deactivate`, void 0, options);
  }
  async listRules(id, options) {
    return this._get(`/${id}/rules`, options);
  }
  async createRule(id, data, options) {
    return this.post(`/${id}/rules`, data, options);
  }
  async updateRule(id, data, options) {
    return this.patch(`/rules/${id}`, data, options);
  }
  async deleteRule(id, options) {
    return this.del(`/rules/${id}`, options);
  }
  async listVariants(id, options) {
    return this._get(`/${id}/variants`, options);
  }
  async createVariant(id, data, options) {
    return this.post(`/${id}/variants`, data, options);
  }
  async updateVariant(id, data, options) {
    return this.patch(`/variants/${id}`, data, options);
  }
  async deleteVariant(id, options) {
    return this.del(`/variants/${id}`, options);
  }
  async listSegments(params, options) {
    return this._get(this.withQuery("/segments", { application_id: params?.applicationId }), options);
  }
  async createSegment(data, params, options) {
    return this.post(
      this.withQuery("/segments", { application_id: params?.applicationId }),
      data,
      options
    );
  }
  async updateSegment(id, data, options) {
    return this.patch(`/segments/${id}`, data, options);
  }
  async deleteSegment(id, options) {
    return this.del(`/segments/${id}`, options);
  }
  async listEnvironments(id, options) {
    return this._get(`/${id}/environments`, options);
  }
  async upsertEnvironment(id, environment, data, options) {
    return this.put(`/${id}/environments/${encodeURIComponent(environment)}`, data, options);
  }
  async listAudit(id, limit, options) {
    return this._get(this.withQuery(`/${id}/audit`, { limit }), options);
  }
};
var CommunicationService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/communication";
  }
  // --------------------------------------------------------------------------
  // Email
  // --------------------------------------------------------------------------
  async sendEmail(data, options) {
    return this.post("/email/send", data, options);
  }
  async sendEmailTemplate(template, data, options) {
    return this.post(`/email/templates/${template}/send`, data, options);
  }
  // --------------------------------------------------------------------------
  // SMS
  // --------------------------------------------------------------------------
  async sendSms(data, options) {
    return this.post("/sms/send", data, options);
  }
  async sendSmsTemplate(template, data, options) {
    return this.post(`/sms/templates/${template}/send`, data, options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Send
  // --------------------------------------------------------------------------
  async sendPush(data, options) {
    return this.post("/push/send", data, options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Token Management
  // --------------------------------------------------------------------------
  async registerPushToken(data, options) {
    return this.post("/push/register", data, options);
  }
  /** @deprecated Use unregisterPushTokenById() for web push tokens */
  async unregisterPushToken(token, options) {
    return this.del(`/push/tokens/${token}`, options);
  }
  async unregisterPushTokenById(id, options) {
    const result = await this.del(`/push/tokens/by-id/${id}`, options);
    if (result.data && typeof result.data === "object" && !("id" in result.data)) {
      return { data: void 0, error: null };
    }
    return result;
  }
  async associatePushTokenUserById(id, options) {
    return this.put(`/push/tokens/by-id/${id}/user`, {}, options);
  }
  async disassociatePushTokenUser(id, options) {
    const result = await this.del(`/push/tokens/by-id/${id}/user`, options);
    if (result.data && typeof result.data === "object" && !("id" in result.data)) {
      return { data: void 0, error: null };
    }
    return result;
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Settings
  // --------------------------------------------------------------------------
  async getMyPushSettings(options) {
    return this._get("/push/settings/me", options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Topics & Subscriptions
  // --------------------------------------------------------------------------
  async listTopics(options) {
    return this._get("/push/topics", options);
  }
  async subscribeTopic(topicId, data, options) {
    return this.post(`/push/topics/${topicId}/subscribe`, data || {}, options);
  }
  async unsubscribeTopic(topicId, options) {
    return this.del(`/push/topics/${topicId}/subscribe`, options);
  }
  async listSubscriptions(options) {
    return this._get("/push/subscriptions", options);
  }
  // --------------------------------------------------------------------------
  // Push Notifications — Preferences
  // --------------------------------------------------------------------------
  async getPushPreferences(options) {
    return this._get("/push/preferences", options);
  }
  async updatePushPreferences(data, options) {
    return this.put("/push/preferences", data, options);
  }
  // --------------------------------------------------------------------------
  // Message Status
  // --------------------------------------------------------------------------
  async getMessageStatus(id, options) {
    return this._get(`/messages/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use sendSms() instead */
  async sendSMS(data) {
    return this.sendSms(data);
  }
  /** @deprecated Use sendPush() instead */
  async sendPushNotification(data) {
    return this.sendPush(data);
  }
};
var NotificationsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/notifications";
  }
  /**
   * List notifications for the authenticated user.
   *
   * @example
   * ```ts
   * // All unread
   * const { data } = await sm.notifications.list({ unread_only: true })
   *
   * // With pagination
   * const { data } = await sm.notifications.list({ limit: 10, cursor: lastCreatedAt })
   *
   * // Since last seen (reconnect catch-up)
   * const { data } = await sm.notifications.list({ unread_only: true, since: '2026-03-25T00:00:00Z' })
   * ```
   */
  async list(params, options) {
    const qs = new URLSearchParams();
    if (params?.unread_only) qs.set("unread_only", "true");
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.since) qs.set("since", params.since);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.cursor) qs.set("cursor", params.cursor);
    const query = qs.toString();
    const path = query ? `?${query}` : "";
    return this._get(path, options);
  }
  /**
   * Get the count of unread notifications.
   *
   * @example
   * ```ts
   * const { data } = await sm.notifications.unreadCount()
   * console.log(`${data.count} unread`)
   * ```
   */
  async unreadCount(options) {
    return this._get("/unread-count", options);
  }
  /**
   * Mark a single notification as read.
   */
  async markRead(id, options) {
    return this.patch(`/${id}/read`, void 0, options);
  }
  /**
   * Mark all notifications as read.
   */
  async markAllRead(options) {
    return this.patch("/read-all", void 0, options);
  }
  /**
   * Dismiss a notification (soft delete).
   */
  async dismiss(id, options) {
    return this.del(`/${id}`, options);
  }
};
var STORAGE_KEY = "scalemule_push_state";
var WebPushManager = class {
  constructor(options) {
    this.state = null;
    this.registration = null;
    if (typeof window === "undefined") {
      throw new Error("WebPushManager can only be used in a browser environment");
    }
    this.fetcher = options.fetcher;
    this.swUrl = options.serviceWorkerUrl || "/sw.js";
    this.registrationSource = options.registrationSource;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      }
    } catch {
    }
  }
  /** Whether the browser supports Web Push */
  isSupported() {
    return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  }
  /** Current notification permission state */
  getPermissionState() {
    if (!this.isSupported()) return "unsupported";
    return Notification.permission;
  }
  /** Request notification permission from the user */
  async requestPermission() {
    if (!this.isSupported()) return "denied";
    return Notification.requestPermission();
  }
  /**
   * Full subscribe flow:
   * 1. Check browser support
   * 2. Request notification permission
   * 3. Register service worker
   * 4. Fetch VAPID public key from backend
   * 5. PushManager.subscribe() with VAPID key
   * 6. Register token with backend
   *
   * @param deviceId Optional device identifier for anonymous users.
   *                 If not provided, generates a random UUID stored in localStorage.
   */
  async subscribe(deviceId) {
    if (!this.isSupported()) return null;
    const permission = await this.requestPermission();
    if (permission !== "granted") return null;
    this.registration = await navigator.serviceWorker.register(this.swUrl);
    await navigator.serviceWorker.ready;
    const settings = await this.fetcher.getSettings();
    if (!settings.webpush_enabled || !settings.vapid_public_key) {
      throw new Error("Web Push is not enabled for this application");
    }
    const applicationServerKey = urlBase64ToUint8Array(settings.vapid_public_key);
    const pushSubscription = await this.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer
    });
    const endpoint = pushSubscription.endpoint;
    const p256dh = arrayBufferToBase64url(pushSubscription.getKey("p256dh"));
    const auth = arrayBufferToBase64url(pushSubscription.getKey("auth"));
    const subscription = {
      endpoint,
      keys: { p256dh, auth }
    };
    const resolvedDeviceId = deviceId || this.state?.deviceId || generateDeviceId();
    const result = await this.fetcher.registerToken({
      token: endpoint,
      platform: "web",
      device_id: resolvedDeviceId,
      subscription,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      browser: detectBrowser(),
      os_version: detectOS(),
      device_model: detectDeviceType(),
      registration_source: this.registrationSource
    });
    this.state = {
      endpoint,
      tokenId: result.id,
      deviceId: resolvedDeviceId
    };
    this.persistState();
    return { tokenId: result.id, endpoint };
  }
  /** Unsubscribe from browser push and deregister token */
  async unsubscribe() {
    const sub = await this.getSubscription();
    if (sub) {
      await sub.unsubscribe();
    }
    if (this.state?.tokenId) {
      try {
        await this.fetcher.unregisterToken(this.state.tokenId);
      } catch {
      }
    }
    this.state = null;
    this.clearState();
  }
  /** Link push token to the currently authenticated user (call after login) */
  async associateUser() {
    if (!this.state?.tokenId) return;
    await this.fetcher.associateUser(this.state.tokenId);
  }
  /** Clear user association from push token (call before logout) */
  async disassociateUser() {
    if (!this.state?.tokenId) return;
    await this.fetcher.disassociateUser(this.state.tokenId);
  }
  /** Check if currently subscribed to push notifications */
  async isSubscribed() {
    if (!this.isSupported()) return false;
    const sub = await this.getSubscription();
    return sub !== null && this.state !== null;
  }
  /** Get the active PushSubscription from the service worker */
  async getSubscription() {
    if (!this.isSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration(this.swUrl);
      if (!reg) return null;
      return reg.pushManager.getSubscription();
    } catch {
      return null;
    }
  }
  /** Get the stored token ID (for external use) */
  getTokenId() {
    return this.state?.tokenId || null;
  }
  persistState() {
    if (this.state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch {
      }
    }
  }
  clearState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
    }
  }
};
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
function arrayBufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function generateDeviceId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}
function detectBrowser() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Firefox/")) return "Firefox/" + (ua.split("Firefox/")[1] || "").split(" ")[0];
  if (ua.includes("Edg/")) return "Edge/" + (ua.split("Edg/")[1] || "").split(" ")[0];
  if (ua.includes("Chrome/")) return "Chrome/" + (ua.split("Chrome/")[1] || "").split(" ")[0];
  if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    const ver = (ua.split("Version/")[1] || "").split(" ")[0];
    return "Safari/" + ver;
  }
  return "Unknown";
}
function detectOS() {
  if (typeof navigator === "undefined") return "Unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Windows NT")) return "Windows/" + ((ua.split("Windows NT ")[1] || "").split(/[;)]/)[0] || "");
  if (ua.includes("Mac OS X"))
    return "macOS/" + ((ua.split("Mac OS X ")[1] || "").split(/[;)]/)[0] || "").replace(/_/g, ".");
  if (ua.includes("Android")) return "Android/" + ((ua.split("Android ")[1] || "").split(/[;)]/)[0] || "");
  if (ua.includes("iPhone OS"))
    return "iOS/" + ((ua.split("iPhone OS ")[1] || "").split(" ")[0] || "").replace(/_/g, ".");
  if (ua.includes("Linux")) return "Linux";
  return "Unknown";
}
function detectDeviceType() {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Mobi|Android.*Mobile|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}
var SchedulerService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/scheduler";
  }
  // --------------------------------------------------------------------------
  // Job CRUD
  // --------------------------------------------------------------------------
  async createJob(data, options) {
    return this.post("/jobs", data, options);
  }
  async listJobs(params, requestOptions) {
    return this._list("/jobs", params, requestOptions);
  }
  async getJob(id, options) {
    return this._get(`/jobs/${id}`, options);
  }
  async updateJob(id, data, options) {
    return this.patch(`/jobs/${id}`, data, options);
  }
  async deleteJob(id, options) {
    return this.del(`/jobs/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Job Control
  // --------------------------------------------------------------------------
  async pauseJob(id, options) {
    return this.post(`/jobs/${id}/pause`, void 0, options);
  }
  async resumeJob(id, options) {
    return this.post(`/jobs/${id}/resume`, void 0, options);
  }
  async runNow(id, options) {
    return this.post(`/jobs/${id}/run-now`, void 0, options);
  }
  // --------------------------------------------------------------------------
  // Execution History & Stats
  // --------------------------------------------------------------------------
  async getExecutions(jobId, params, requestOptions) {
    return this._list(`/jobs/${jobId}/executions`, params, requestOptions);
  }
  async getStats(jobId, options) {
    return this._get(`/jobs/${jobId}/stats`, options);
  }
};
var PermissionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/permissions";
  }
  // --------------------------------------------------------------------------
  // Roles
  // --------------------------------------------------------------------------
  async createRole(data, options) {
    return this.post("/roles", data, options);
  }
  async listRoles(options) {
    return this._get("/roles", options);
  }
  async assignPermissions(roleId, permissions, options) {
    return this.post(`/roles/${roleId}/permissions`, { permissions }, options);
  }
  async assignRole(userId, roleId, options) {
    return this.post(`/users/${userId}/roles`, { role_id: roleId }, options);
  }
  // --------------------------------------------------------------------------
  // Permission Checks (unified — supports both member and user identity types)
  // --------------------------------------------------------------------------
  /** Check a single permission. Supports identity_type for unified model. */
  async check(identityId, permission, options) {
    const { identityType, resourceType, resourceId, ...reqOptions } = options || {};
    return this.post(
      "/check",
      {
        identity_id: identityId,
        identity_type: identityType || "user",
        permission,
        resource_type: resourceType,
        resource_id: resourceId
      },
      reqOptions
    );
  }
  /** Batch check multiple permissions for an identity. */
  async batchCheck(identityId, permissions, options) {
    const { identityType, ...reqOptions } = options || {};
    return this.post(
      "/batch-check",
      {
        identity_id: identityId,
        identity_type: identityType || "user",
        permissions
      },
      reqOptions
    );
  }
  /** Fetch the full permission matrix for an identity (single request, no N+1). */
  async getMatrix(identityId, identityType = "user", options) {
    const params = new URLSearchParams({ identity_id: identityId, identity_type: identityType });
    return this._get(`/matrix?${params.toString()}`, options);
  }
  async getUserPermissions(userId, options) {
    return this._get(`/users/${userId}/permissions`, options);
  }
  // --------------------------------------------------------------------------
  // Policies
  // --------------------------------------------------------------------------
  async createPolicy(data, options) {
    return this.post("/policies", data, options);
  }
  async listPolicies(options) {
    return this._get("/policies", options);
  }
  async evaluate(data, options) {
    return this.post("/evaluate", data, options);
  }
  // --------------------------------------------------------------------------
  // Legacy methods (backward compat)
  // --------------------------------------------------------------------------
  /** @deprecated Use assignPermissions() instead */
  async assignPermission(roleId, permission) {
    return this.assignPermissions(roleId, [permission]);
  }
  /** @deprecated Use check() instead */
  async checkPermission(userId, permission) {
    return this.check(userId, permission);
  }
};
var WorkspacesService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/workspaces";
  }
  // --------------------------------------------------------------------------
  // Workspace CRUD
  // --------------------------------------------------------------------------
  async create(data, options) {
    return this.post("", data, options);
  }
  async list(params, requestOptions) {
    return this._list("", params, requestOptions);
  }
  async mine(params, options) {
    return this._list("/mine", params, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // Members
  // --------------------------------------------------------------------------
  async listMembers(workspaceId, params, requestOptions) {
    return this._list(`/${workspaceId}/members`, params, requestOptions);
  }
  async addMember(workspaceId, data, options) {
    return this.post(`/${workspaceId}/members`, data, options);
  }
  async updateMember(workspaceId, userId, data, options) {
    return this.patch(`/${workspaceId}/members/${userId}`, data, options);
  }
  async removeMember(workspaceId, userId, options) {
    return this.del(`/${workspaceId}/members/${userId}`, options);
  }
  // --------------------------------------------------------------------------
  // Invitations
  // --------------------------------------------------------------------------
  async invite(workspaceId, data, options) {
    return this.post(`/${workspaceId}/invitations`, data, options);
  }
  async listInvitations(workspaceId, options) {
    return this._get(`/${workspaceId}/invitations`, options);
  }
  async acceptInvitation(token, options) {
    return this.post(`/invitations/${token}/accept`, void 0, options);
  }
  async cancelInvitation(id, options) {
    return this.del(`/invitations/${id}`, options);
  }
  // --------------------------------------------------------------------------
  // SSO (workspace-only)
  // --------------------------------------------------------------------------
  async configureSso(workspaceId, data, options) {
    return this.post(`/${workspaceId}/sso/configure`, data, options);
  }
  async getSso(workspaceId, options) {
    return this._get(`/${workspaceId}/sso`, options);
  }
};
var GraphService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/graph";
  }
  async createNode(data, requestOptions) {
    return this.post("/nodes", data, requestOptions);
  }
  async updateNode(nodeId, data, requestOptions) {
    return this.patch(`/nodes/${nodeId}`, data, requestOptions);
  }
  async createEdge(data, requestOptions) {
    return this.post("/edges", data, requestOptions);
  }
  async getEdges(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/edges`, options), requestOptions);
  }
  async traverse(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/traverse`, options), requestOptions);
  }
  async shortestPath(options, requestOptions) {
    return this.post("/shortest-path", options, requestOptions);
  }
  async neighbors(nodeId, options, requestOptions) {
    return this._get(this.withQuery(`/nodes/${nodeId}/neighbors`, options), requestOptions);
  }
  async pageRank(options, requestOptions) {
    return this.post("/algorithms/pagerank", options, requestOptions);
  }
  async centrality(options, requestOptions) {
    return this.post("/algorithms/centrality", options, requestOptions);
  }
  async connectedComponents(options) {
    return this.post("/algorithms/connected-components", void 0, options);
  }
};
var FunctionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/functions";
  }
  async deploy(data, options) {
    return this.post("", data, options);
  }
  async list(options) {
    return this._get("", options);
  }
  async get(name, options) {
    return this._get(`/${name}`, options);
  }
  async update(name, data, options) {
    return this.patch(`/${name}`, data, options);
  }
  async delete(name, options) {
    return this.del(`/${name}`, options);
  }
  async invoke(name, payload, options) {
    return this.post(`/${name}/invoke`, payload, options);
  }
  async invokeAsync(name, payload, options) {
    return this.post(`/${name}/invoke-async`, payload, options);
  }
  async getLogs(name, options) {
    return this._get(`/${name}/logs`, options);
  }
  async getExecutions(name, params, requestOptions) {
    return this._list(`/${name}/executions`, params, requestOptions);
  }
  async getMetrics(name, options) {
    return this._get(`/${name}/metrics`, options);
  }
  /** @deprecated Use deploy() instead */
  async deployFunction(data) {
    return this.deploy(data);
  }
  /** @deprecated Use invoke() instead */
  async invokeFunction(name, payload) {
    return this.invoke(name, payload);
  }
};
var ListingsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/listings";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  async search(query, filters, options) {
    return this._get(this.withQuery("/search", { query, ...filters }), options);
  }
  async nearby(nearbyOptions, options) {
    return this._get(this.withQuery("/nearby", nearbyOptions), options);
  }
  async getByCategory(category, params, requestOptions) {
    return this._list(`/categories/${category}`, params, requestOptions);
  }
  async favorite(listingId, options) {
    return this.post(`/${listingId}/favorite`, void 0, options);
  }
  async unfavorite(listingId, options) {
    return this.del(`/${listingId}/favorite`, options);
  }
  async getFavorites(params, requestOptions) {
    return this._list("/favorites", params, requestOptions);
  }
  async trackView(listingId, options) {
    return this.post(`/${listingId}/view`, void 0, options);
  }
  /** @deprecated Use create() instead */
  async createListing(data) {
    return this.create(data);
  }
  /** @deprecated Use search() instead */
  async searchListings(query, filters) {
    return this.search(query, filters);
  }
  /** @deprecated Use get() instead */
  async getListing(id) {
    return this.get(id);
  }
};
var EventsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/events";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async get(eventId, options) {
    return this._get(`/${eventId}`, options);
  }
  async update(eventId, data, options) {
    return this.patch(`/${eventId}`, data, options);
  }
  async delete(eventId, options) {
    return this.del(`/${eventId}`, options);
  }
  async list(filters, requestOptions) {
    return this._list("", filters, requestOptions);
  }
  async register(eventId, options) {
    return this.post(`/${eventId}/register`, void 0, options);
  }
  async unregister(eventId, options) {
    return this.del(`/${eventId}/register`, options);
  }
  async getAttendees(eventId, params, requestOptions) {
    return this._list(`/${eventId}/attendees`, params, requestOptions);
  }
  async checkIn(eventId, options) {
    return this.post(`/${eventId}/check-in`, void 0, options);
  }
  /** @deprecated Use create() instead */
  async createEvent(data) {
    return this.create(data);
  }
  /** @deprecated Use list() instead */
  async listEvents(filters) {
    return this.list(filters);
  }
};
var LeaderboardService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/leaderboard";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async submitScore(boardId, data, options) {
    return this.post(`/${boardId}/scores`, data, options);
  }
  async getRankings(boardId, rankingOptions, requestOptions) {
    return this._get(this.withQuery(`/${boardId}/rankings`, rankingOptions), requestOptions);
  }
  async getUserRank(boardId, userId, options) {
    return this._get(`/${boardId}/users/${userId}/rank`, options);
  }
  async getUserHistory(boardId, userId, options) {
    return this._get(`/${boardId}/users/${userId}/history`, options);
  }
  async updateScore(boardId, userId, data, options) {
    return this.patch(`/${boardId}/users/${userId}/score`, data, options);
  }
  async deleteScore(boardId, userId, options) {
    return this.del(`/${boardId}/users/${userId}/score`, options);
  }
};
var WebhooksService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/webhooks";
  }
  async create(data, options) {
    return this.post("", data, options);
  }
  async list(options) {
    return this._get("", options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/${id}`, data, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  async listEvents(options) {
    return this._get("/events", options);
  }
  /** @deprecated Use create() instead */
  async createWebhook(data) {
    return this.create(data);
  }
  /** @deprecated Use list() instead */
  async listWebhooks() {
    return this.list();
  }
  /** @deprecated Use delete() instead */
  async deleteWebhook(id) {
    return this.delete(id);
  }
};
var SearchService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/search";
  }
  async query(queryStr, queryOptions, requestOptions) {
    return this.post("", { query: queryStr, ...queryOptions }, requestOptions);
  }
  async index(indexName, document2, options) {
    return this.post("/documents", { index: indexName, ...document2 }, options);
  }
  async removeDocument(indexName, docId, options) {
    return this.del(`/documents/${indexName}/${docId}`, options);
  }
  /** @deprecated Use query() instead */
  async search(queryStr, options) {
    return this.query(queryStr, options);
  }
  /** @deprecated Use index() instead */
  async indexDocument(data) {
    return this.post("/documents", data);
  }
};
var PHOTO_BREAKPOINTS = [36, 150, 320, 640, 1080];
var PhotoService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/photos";
  }
  async upload(file, uploadOptions, requestOptions) {
    const fields = {};
    if (uploadOptions?.metadata) fields["metadata"] = JSON.stringify(uploadOptions.metadata);
    return this._upload("", file, fields, {
      ...requestOptions,
      onProgress: uploadOptions?.onProgress,
      signal: uploadOptions?.signal
    });
  }
  async transform(photoId, transformations, options) {
    return this.post(`/${photoId}/transform`, transformations, options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
  /**
   * Build an absolute URL for the on-demand transform endpoint.
   *
   * Use in `<img src>` or `srcset` — the server negotiates the best format
   * (AVIF > WebP > JPEG) from the browser's Accept header automatically.
   * Transformed images are cached server-side on first request.
   */
  getTransformUrl(photoId, options) {
    const params = new URLSearchParams();
    if (options?.width) params.set("width", String(options.width));
    if (options?.height) params.set("height", String(options.height));
    if (options?.fit) params.set("fit", options.fit);
    if (options?.format) params.set("format", options.format);
    if (options?.quality) params.set("quality", String(options.quality));
    const qs = params.toString();
    return `${this.client.getBaseUrl()}${this.basePath}/${photoId}/transform${qs ? `?${qs}` : ""}`;
  }
  /**
   * Get a transform URL optimized for the given display area.
   *
   * Snaps UP to the nearest pre-generated square breakpoint (150, 320, 640, 1080)
   * so the response is served instantly from cache. Format is auto-negotiated
   * by the browser's Accept header (WebP in modern browsers, JPEG fallback).
   *
   * @param photoId  Photo ID
   * @param displayWidth  CSS pixel width of the display area
   * @param options.dpr  Device pixel ratio (default: 1). Pass `window.devicePixelRatio` in browsers.
   *
   * @example
   * ```typescript
   * // 280px card on 2x Retina -> snaps to 640px (280×2=560, next breakpoint up)
   * const url = sm.photo.getOptimalUrl(photoId, 280, { dpr: 2 })
   *
   * // Profile avatar at 48px -> snaps to 150px
   * const url = sm.photo.getOptimalUrl(photoId, 48)
   *
   * // Tiny avatar at 36px -> exact cache hit on 36px micro-thumbnail
   * const url = sm.photo.getOptimalUrl(photoId, 36)
   * ```
   */
  getOptimalUrl(photoId, displayWidth, options) {
    const requestedDpr = options?.dpr ?? 1;
    const dpr = Number.isFinite(requestedDpr) && requestedDpr > 0 ? requestedDpr : 1;
    const cssWidth = Number.isFinite(displayWidth) && displayWidth > 0 ? displayWidth : PHOTO_BREAKPOINTS[0];
    const physicalWidth = Math.ceil(cssWidth * dpr);
    const size = PHOTO_BREAKPOINTS.find((bp) => bp >= physicalWidth) ?? PHOTO_BREAKPOINTS[PHOTO_BREAKPOINTS.length - 1];
    return this.getTransformUrl(photoId, { width: size, height: size, fit: "cover" });
  }
  /**
   * Get the 36px avatar micro-thumbnail URL for a photo.
   * Hits the pre-generated 36x36 bicubic-resized cached variant.
   */
  getAvatarThumbnailUrl(photoId) {
    return this.getOptimalUrl(photoId, 36);
  }
  /**
   * Generate an HTML srcset string for responsive square photo display.
   *
   * Returns all pre-generated breakpoints as width descriptors. Pair with
   * the `sizes` attribute so the browser picks the optimal variant automatically.
   *
   * @example
   * ```tsx
   * const srcset = sm.photo.getSrcSet(photoId)
   * // -> ".../transform?width=150&height=150&fit=cover 150w, .../transform?width=320..."
   *
   * <img
   *   src={sm.photo.getOptimalUrl(photoId, 320)}
   *   srcSet={srcset}
   *   sizes="(max-width: 640px) 100vw, 640px"
   *   alt="Photo"
   * />
   * ```
   */
  getSrcSet(photoId) {
    return PHOTO_BREAKPOINTS.map(
      (size) => `${this.getTransformUrl(photoId, { width: size, height: size, fit: "cover" })} ${size}w`
    ).join(", ");
  }
  /**
   * Register a photo from an already-uploaded storage file.
   *
   * Creates a photo record so the optimization pipeline can process it.
   * Use this when files are uploaded via the storage service (presigned URL)
   * instead of the photo service's upload endpoint.
   *
   * If the file scan is still in progress, the server waits briefly (~5s) for it
   * to complete. In the rare case the scan exceeds that window, the server queues
   * the registration and returns 202; this method retries automatically until the
   * photo record is available.
   *
   * Returns the photo record with `id` that can be used with `getTransformUrl()`.
   */
  async register(registerOptions, requestOptions) {
    const body = {
      file_id: registerOptions.fileId,
      sm_user_id: registerOptions.userId
    };
    const result = await this.post("/register", body, requestOptions);
    const isPending = (r) => !r.error && r.data && "status" in r.data && r.data.status === "pending_scan";
    if (!isPending(result)) {
      return result;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 1e3));
      const retry = await this.post("/register", body, requestOptions);
      if (!isPending(retry)) {
        return retry;
      }
    }
    return {
      data: null,
      error: {
        code: "scan_timeout",
        message: "File scan did not complete in time. The photo will be registered automatically when the scan finishes.",
        status: 202
      }
    };
  }
  /** @deprecated Use upload() instead */
  async uploadPhoto(file, options) {
    return this.upload(file, options);
  }
  /** @deprecated Use transform() instead */
  async transformPhoto(photoId, transformations) {
    return this.transform(photoId, transformations);
  }
  /** @deprecated Use get() instead */
  async getPhoto(id) {
    return this.get(id);
  }
};
var DeadLetterApi = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/queue/dead-letter";
  }
  async list(options) {
    return this._get("", options);
  }
  async get(id, options) {
    return this._get(`/${id}`, options);
  }
  async retry(id, options) {
    return this.post(`/${id}/retry`, void 0, options);
  }
  async delete(id, options) {
    return this.del(`/${id}`, options);
  }
};
var QueueService = class extends ServiceModule {
  constructor(client) {
    super(client);
    this.basePath = "/v1/queue";
    this.deadLetter = new DeadLetterApi(client);
  }
  async enqueue(data, options) {
    return this.post("/jobs", data, options);
  }
  async getJob(id, options) {
    return this._get(`/jobs/${id}`, options);
  }
};
var CacheService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/cache";
  }
  async get(key, options) {
    return this._get(`/${key}`, options);
  }
  async set(key, value, ttl, options) {
    return this.post("", { key, value, ttl }, options);
  }
  async delete(key, options) {
    return this.del(`/${key}`, options);
  }
  async flush(options) {
    return this.del("", options);
  }
};
var ComplianceService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/compliance";
  }
  /** Build query string from params object */
  qs(params) {
    if (!params) return "";
    const entries = Object.entries(params).filter(([, v]) => v !== void 0 && v !== null);
    if (entries.length === 0) return "";
    return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  }
  // --- Audit Logs ---
  async log(data, options) {
    return this.post("/audit-logs", data, options);
  }
  async queryAuditLogs(params, requestOptions) {
    return this._get(`/audit-logs${this.qs(params)}`, requestOptions);
  }
  // --- Legacy GDPR (deprecated) ---
  /** @deprecated Use createDataSubjectRequest({ request_type: 'access', ... }) instead */
  async requestDataExport(userId) {
    return this.post("/gdpr/access-request", { user_id: userId });
  }
  /** @deprecated Use createDataSubjectRequest({ request_type: 'deletion', ... }) instead */
  async requestDataDeletion(userId) {
    return this.post("/gdpr/deletion-request", { user_id: userId });
  }
  /** @deprecated Use log() instead */
  async createAuditLog(data) {
    return this.log(data);
  }
  // --- Consent Purposes ---
  async listConsentPurposes(options) {
    return this._get("/consent-purposes", options);
  }
  async createConsentPurpose(data, options) {
    return this.post("/consent-purposes", data, options);
  }
  // --- Consent v2 ---
  async recordConsent(data, options) {
    return this.post("/consent/v2", data, options);
  }
  async getUserConsents(userId, options) {
    return this._get(`/consent/v2/${userId}`, options);
  }
  async withdrawConsent(consentId, data, options) {
    return this.put(`/consent/v2/${consentId}/withdraw`, data || {}, options);
  }
  // --- Data Subject Requests ---
  async createDataSubjectRequest(data, options) {
    return this.post("/dsr", data, options);
  }
  async listDataSubjectRequests(params, requestOptions) {
    return this._get(`/dsr${this.qs(params)}`, requestOptions);
  }
  async getDataSubjectRequest(id, options) {
    return this._get(`/dsr/${id}`, options);
  }
  async updateDsrStatus(id, data, options) {
    return this.put(`/dsr/${id}/status`, data, options);
  }
  async createDsrAction(dsrId, data, options) {
    return this.post(`/dsr/${dsrId}/actions`, data, options);
  }
  async listDsrActions(dsrId, options) {
    return this._get(`/dsr/${dsrId}/actions`, options);
  }
  // --- Data Breaches ---
  async reportBreach(data, options) {
    return this.post("/breaches", data, options);
  }
  async listBreaches(params, requestOptions) {
    return this._get(`/breaches${this.qs(params)}`, requestOptions);
  }
  async getBreach(id, options) {
    return this._get(`/breaches/${id}`, options);
  }
  async updateBreach(id, data, options) {
    return this.put(`/breaches/${id}`, data, options);
  }
  // --- Retention Policies ---
  async listRetentionPolicies(options) {
    return this._get("/retention/policies", options);
  }
  async createRetentionPolicy(data, options) {
    return this.post("/retention/policies", data, options);
  }
  // --- Processing Activities ---
  async createProcessingActivity(data, options) {
    return this.post("/processing-activities", data, options);
  }
  async listProcessingActivities(params, requestOptions) {
    return this._get(`/processing-activities${this.qs(params)}`, requestOptions);
  }
  async getProcessingActivity(id, options) {
    return this._get(`/processing-activities/${id}`, options);
  }
  async updateProcessingActivity(id, data, options) {
    return this.put(`/processing-activities/${id}`, data, options);
  }
};
var OrchestratorService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/orchestrator";
  }
  async createWorkflow(data, options) {
    return this.post("/workflows", data, options);
  }
  async execute(workflowId, input, options) {
    return this.post(`/workflows/${workflowId}/execute`, input, options);
  }
  async getExecution(executionId, options) {
    return this._get(`/executions/${executionId}`, options);
  }
  /** @deprecated Use execute() instead */
  async executeWorkflow(workflowId, input) {
    return this.execute(workflowId, input);
  }
};
var AccountsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/accounts";
  }
  async createClient(data, options) {
    return this.post("/clients", data, options);
  }
  async getClients(options) {
    return this._get("/clients", options);
  }
  async createApplication(data, options) {
    return this.post("/applications", data, options);
  }
  async getApplications(options) {
    return this._get("/applications", options);
  }
};
var IdentityService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/identity";
  }
  async createApiKey(data, options) {
    return this.post("/api-keys", data, options);
  }
  async listApiKeys(options) {
    return this._get("/api-keys", options);
  }
  async revokeApiKey(id, options) {
    return this.del(`/api-keys/${id}`, options);
  }
  /**
   * Explicitly link an anonymous_id to the current authenticated user.
   * Called automatically on init when both a session and anonymous_id exist
   * (transitional path for users who registered before identity linking existed).
   */
  async identify(anonymousId, deviceFingerprintHash, options) {
    return this.post(
      "/identify",
      { anonymous_id: anonymousId, device_fingerprint_hash: deviceFingerprintHash },
      options
    );
  }
};
var CatalogService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/catalog";
  }
  async listServices(options) {
    return this._get("/services", options);
  }
  async getServiceHealth(name, options) {
    return this._get(`/services/${name}/health`, options);
  }
};
var FlagContentService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/flagcontent";
  }
  async createFlag(data, options) {
    return this.post("/flags", data, options);
  }
  async checkFlag(params, requestOptions) {
    return this._get(this.withQuery("/flags/check", params), requestOptions);
  }
  async getFlag(id, options) {
    return this._get(`/flags/${id}`, options);
  }
  async submitAppeal(data, options) {
    return this.post("/appeals", data, options);
  }
  async getAppeal(id, options) {
    return this._get(`/appeals/${id}`, options);
  }
};
var CreatorMakerService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/creator-maker";
  }
  /** Submit a generation job. */
  async generate(data, options) {
    return this.post("/jobs", data, options);
  }
  /** Get a generation job by ID. */
  async getJob(jobId, options) {
    return this._get(`/jobs/${jobId}`, options);
  }
  /** Long-poll for job completion (server holds up to 30s). */
  async pollJob(jobId, options) {
    return this._get(`/jobs/${jobId}/poll`, {
      ...options,
      timeout: 35e3
    });
  }
  /** List the current user's generation jobs. */
  async listJobs(params, options) {
    return this._list("/jobs", params, options);
  }
  /** Cancel a pending or queued job. */
  async cancelJob(jobId, options) {
    return this.post(`/jobs/${jobId}/cancel`, void 0, options);
  }
  /** Retry a failed job. */
  async retryJob(jobId, options) {
    return this.post(`/jobs/${jobId}/retry`, void 0, options);
  }
  /** Generate variations of a completed job. */
  async generateVariations(jobId, options) {
    return this.post(`/jobs/${jobId}/variations`, void 0, options);
  }
  /** List available style presets, optionally filtered by mode. */
  async listPresets(params, options) {
    return this._get(this.withQuery("/presets", params), options);
  }
  /** Get a style preset by slug. */
  async getPreset(slug, options) {
    return this._get(`/presets/${slug}`, options);
  }
  /** Create a project. */
  async createProject(data, options) {
    return this.post("/projects", data, options);
  }
  /** List the current user's projects. */
  async listProjects(params, options) {
    return this._list("/projects", params, options);
  }
  /** Get generation usage and credit balance. */
  async getUsage(options) {
    return this._get("/usage", options);
  }
  /** Get a generation output by ID. */
  async getOutput(outputId, options) {
    return this._get(`/outputs/${outputId}`, options);
  }
  /** Get a download URL for a generation output. */
  async getDownloadUrl(outputId, options) {
    return this._get(`/outputs/${outputId}/download`, options);
  }
};
var AgentAuthService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/auth";
  }
  async registerAgent(data, options) {
    return this.post("/register/agent", data, options);
  }
  async listTokens(options) {
    return this._get("/agent-tokens", options);
  }
  async createToken(data, options) {
    return this.post("/agent-tokens", data, options);
  }
  async revokeToken(id, options) {
    return this.del(`/agent-tokens/${id}`, options);
  }
  async rotateToken(id, options) {
    return this.post(`/agent-tokens/${id}/rotate`, void 0, options);
  }
  async exchangeToken(data, options) {
    return this.post("/agent-tokens/exchange", data, options);
  }
  async listSigningKeys(options) {
    return this._get("/agent-signing-keys", options);
  }
  async addSigningKey(data, options) {
    return this.post("/agent-signing-keys", data, options);
  }
  async revokeSigningKey(id, options) {
    return this.del(`/agent-signing-keys/${id}`, options);
  }
  async getProfile(options) {
    return this._get("/agent-profile", options);
  }
  async updateProfile(data, options) {
    return this.patch("/agent-profile", data, options);
  }
  async getSecurityPolicy(appId, options) {
    return this._get(`/applications/${appId}/agent-security`, options);
  }
  async updateSecurityPolicy(appId, data, options) {
    return this.put(`/applications/${appId}/agent-security`, data, options);
  }
};
var AgentsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agents";
  }
  // Orchestrated registration
  async registerAgent(data, options) {
    return this.post("/register-agent", data, options);
  }
  async deactivateAgent(id, options) {
    return this.post(`/agents/${id}/deactivate`, void 0, options);
  }
  // Agent CRUD
  async create(data, options) {
    return this.post("/agents", data, options);
  }
  async list(params, options) {
    return this._list("/agents", params, options);
  }
  async get(id, options) {
    return this._get(`/agents/${id}`, options);
  }
  async update(id, data, options) {
    return this.patch(`/agents/${id}`, data, options);
  }
  async remove(id, options) {
    return this.del(`/agents/${id}`, options);
  }
  async setDefaultWorkspace(id, data, options) {
    return this.post(`/agents/${id}/set-default-workspace`, data, options);
  }
  // Runtime Templates
  async createTemplate(data, options) {
    return this.post("/runtime-templates", data, options);
  }
  async listTemplates(params, options) {
    return this._list("/runtime-templates", params, options);
  }
  async getTemplate(id, options) {
    return this._get(
      `/runtime-templates/${id}`,
      options
    );
  }
  async createTemplateVersion(id, data, options) {
    return this.post(`/runtime-templates/${id}/versions`, data, options);
  }
  async listTemplateVersions(id, options) {
    return this._get(`/runtime-templates/${id}/versions`, options);
  }
  // Workspaces
  async createWorkspace(data, options) {
    return this.post("/workspaces", data, options);
  }
  async listWorkspaces(params, options) {
    return this._list("/workspaces", params, options);
  }
  async getWorkspace(id, options) {
    return this._get(`/workspaces/${id}`, options);
  }
  async updateWorkspace(id, data, options) {
    return this.patch(`/workspaces/${id}`, data, options);
  }
  async addOsAccount(workspaceId, data, options) {
    return this.post(`/workspaces/${workspaceId}/os-accounts`, data, options);
  }
};
var AgentProjectsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-projects";
  }
  withAppId(path, applicationId) {
    return applicationId ? this.withQuery(path, { application_id: applicationId }) : path;
  }
  // Projects
  async createProject(data, applicationId, options) {
    return this.post(this.withAppId("/projects", applicationId), data, options);
  }
  async listProjects(params, options) {
    return this._list("/projects", params, options);
  }
  async getProject(id, applicationId, options) {
    return this._get(this.withAppId(`/projects/${id}`, applicationId), options);
  }
  async updateProject(id, data, applicationId, options) {
    return this.patch(this.withAppId(`/projects/${id}`, applicationId), data, options);
  }
  // Members (use auth user_id)
  async addMember(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/members`, applicationId), data, options);
  }
  async listMembers(projectId, params, options) {
    const qs = {};
    if (params?.application_id) qs.application_id = params.application_id;
    if (params?.hydrate) qs.hydrate = "true";
    const path = Object.keys(qs).length ? this.withQuery(`/projects/${projectId}/members`, qs) : `/projects/${projectId}/members`;
    const result = await this._get(path, options);
    return { data: result.data?.members ?? [], error: result.error };
  }
  async updateMember(projectId, userId, data, applicationId, options) {
    return this.patch(
      this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId),
      data,
      options
    );
  }
  async removeMember(projectId, userId, applicationId, options) {
    return this.del(this.withAppId(`/projects/${projectId}/members/${userId}`, applicationId), options);
  }
  // Tasks
  async createTask(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/tasks`, applicationId), data, options);
  }
  async listTasks(projectId, params, options) {
    return this._list(`/projects/${projectId}/tasks`, params, options);
  }
  async getTask(id, applicationId, options) {
    return this._get(this.withAppId(`/tasks/${id}`, applicationId), options);
  }
  async updateTask(id, data, applicationId, options) {
    return this.patch(this.withAppId(`/tasks/${id}`, applicationId), data, options);
  }
  async reorderTasks(projectId, taskIds, applicationId, options) {
    return this.post(
      this.withAppId(`/projects/${projectId}/tasks/reorder`, applicationId),
      { task_ids: taskIds },
      options
    );
  }
  // Lifecycle (use registry agent_id)
  async claimNext(agentId, applicationId, options) {
    const result = await this.post(
      this.withAppId("/tasks/next-available", applicationId),
      { agent_id: agentId },
      options
    );
    if (!result.data || typeof result.data !== "object" || !("task_id" in result.data)) {
      return { data: null, error: result.error };
    }
    return result;
  }
  async claim(taskId, agentId, applicationId, options) {
    return this.post(
      this.withAppId(`/tasks/${taskId}/claim`, applicationId),
      { agent_id: agentId },
      options
    );
  }
  async heartbeat(taskId, agentId, applicationId, options) {
    return this.post(
      this.withAppId(`/tasks/${taskId}/heartbeat`, applicationId),
      { agent_id: agentId },
      options
    );
  }
  async startTask(taskId, agentId, applicationId, options) {
    return this.post(
      this.withAppId(`/tasks/${taskId}/start`, applicationId),
      { agent_id: agentId },
      options
    );
  }
  async submit(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/submit`, applicationId), data, options);
  }
  async block(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/block`, applicationId), data, options);
  }
  // Assignment
  async assignAgent(taskId, data, applicationId, options) {
    return this.post(this.withAppId(`/tasks/${taskId}/assign`, applicationId), data, options);
  }
  async unassignAgent(taskId, agentId, applicationId, options) {
    return this.del(this.withAppId(`/tasks/${taskId}/assign/${agentId}`, applicationId), options);
  }
  // History
  async listAttempts(taskId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/tasks/${taskId}/attempts`, applicationId),
      options
    );
    return { data: result.data?.attempts ?? [], error: result.error };
  }
  async listTransitions(taskId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/tasks/${taskId}/transitions`, applicationId),
      options
    );
    return { data: result.data?.transitions ?? [], error: result.error };
  }
  // Documents
  async createDocument(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/documents`, applicationId), data, options);
  }
  async listDocuments(projectId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/projects/${projectId}/documents`, applicationId),
      options
    );
    return { data: result.data?.documents ?? [], error: result.error };
  }
  async deleteDocument(documentId, applicationId, options) {
    return this.del(this.withAppId(`/documents/${documentId}`, applicationId), options);
  }
  // Pipelines
  async createPipeline(projectId, data, applicationId, options) {
    return this.post(this.withAppId(`/projects/${projectId}/pipelines`, applicationId), data, options);
  }
  async listPipelines(projectId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/projects/${projectId}/pipelines`, applicationId),
      options
    );
    return { data: result.data?.pipelines ?? [], error: result.error };
  }
  async createPipelineVersion(pipelineId, data, applicationId, options) {
    return this.post(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      data,
      options
    );
  }
  async listPipelineVersions(pipelineId, applicationId, options) {
    const result = await this._get(
      this.withAppId(`/pipelines/${pipelineId}/versions`, applicationId),
      options
    );
    return { data: result.data?.versions ?? [], error: result.error };
  }
  // --------------------------------------------------------------------------
  // Project Grants
  // --------------------------------------------------------------------------
  async createGrant(data, options) {
    return this.post("/project-grants", data, options);
  }
  async listGrants(projectId, options) {
    const result = await this._get(
      this.withQuery("/project-grants", { project_id: projectId }),
      options
    );
    return { data: result.data?.grants ?? result.data ?? [], error: result.error };
  }
  async getGrant(id, options) {
    return this._get(`/project-grants/${id}`, options);
  }
  /** Public endpoint — no auth required. Returns masked email + project name. */
  async getGrantInfo(id, options) {
    return this._get(`/project-grants/${id}/info`, { skipAuth: true, ...options });
  }
  async revokeGrant(id, options) {
    return this.del(`/project-grants/${id}`, options);
  }
  async resendGrantInvitation(id, data, options) {
    return this.post(`/project-grants/${id}/resend`, data, options);
  }
  async redeemGrant(id, options) {
    return this.post(`/project-grants/${id}/redeem`, void 0, options);
  }
};
var AgentToolsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-tools";
  }
  // Tools
  async createTool(data, options) {
    return this.post("/tools", data, options);
  }
  async listTools(params, options) {
    return this._list("/tools", params, options);
  }
  async getTool(id, options) {
    return this._get(`/tools/${id}`, options);
  }
  async createCapability(toolId, data, options) {
    return this.post(`/tools/${toolId}/capabilities`, data, options);
  }
  async listCapabilities(toolId, options) {
    return this._get(`/tools/${toolId}/capabilities`, options);
  }
  // Tool Integrations
  async createIntegration(data, options) {
    return this.post("/tool-integrations", data, options);
  }
  async listIntegrations(params, options) {
    return this._list("/tool-integrations", params, options);
  }
  async updateIntegration(id, data, options) {
    return this.patch(`/tool-integrations/${id}`, data, options);
  }
  // Credentials
  async createCredential(data, options) {
    return this.post("/credentials", data, options);
  }
  async listCredentials(params, options) {
    return this._list("/credentials", params, options);
  }
  async updateCredential(id, data, options) {
    return this.patch(`/credentials/${id}`, data, options);
  }
  async createScope(credentialId, data, options) {
    return this.post(`/credentials/${credentialId}/scopes`, data, options);
  }
  async listScopes(credentialId, options) {
    return this._get(`/credentials/${credentialId}/scopes`, options);
  }
  // Entitlements
  async grantEntitlement(data, options) {
    return this.post("/agent-tool-entitlements", data, options);
  }
  async listEntitlements(params, options) {
    return this._list("/agent-tool-entitlements", params, options);
  }
  async revokeEntitlement(id, options) {
    return this.del(`/agent-tool-entitlements/${id}`, options);
  }
  async authorizeAction(data, options) {
    return this.post("/authorize-action", data, options);
  }
  // Data Sources
  async createDataSource(data, options) {
    return this.post("/data-sources", data, options);
  }
  async listDataSources(params, options) {
    return this._list("/data-sources", params, options);
  }
  // Data Access Policies
  async createDataAccessPolicy(data, options) {
    return this.post("/data-access-policies", data, options);
  }
  async listDataAccessPolicies(params, options) {
    return this._list("/data-access-policies", params, options);
  }
};
var AgentModelsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-models";
  }
  // Providers
  async createProvider(data, options) {
    return this.post("/model-providers", data, options);
  }
  async listProviders(params, options) {
    return this._list("/model-providers", params, options);
  }
  // Models
  async createModel(data, options) {
    return this.post("/models", data, options);
  }
  async listModels(params, options) {
    return this._list("/models", params, options);
  }
  async getModel(id, options) {
    return this._get(`/models/${id}`, options);
  }
  async createPricing(modelId, data, options) {
    return this.post(`/models/${modelId}/pricing`, data, options);
  }
  async listPricing(modelId, options) {
    return this._get(`/models/${modelId}/pricing`, options);
  }
  // Entitlements
  async createEntitlement(data, options) {
    return this.post("/model-entitlements", data, options);
  }
  async listEntitlements(params, options) {
    return this._list("/model-entitlements", params, options);
  }
  async deleteEntitlement(id, options) {
    return this.del(`/model-entitlements/${id}`, options);
  }
  // Usage & Reporting
  async recordUsage(data, options) {
    return this.post("/usage-records", data, options);
  }
  async listUsage(params, options) {
    return this._list("/usage-records", params, options);
  }
  async getUsageSummary(params, options) {
    return this._get(this.withQuery("/usage-records/summary", params), options);
  }
  async getCostReport(params, options) {
    return this._get(this.withQuery("/cost-report", params), options);
  }
};
var AgentSessionsService = class extends ServiceModule {
  constructor() {
    super(...arguments);
    this.basePath = "/v1/agent-sessions";
  }
  // Sessions
  async createSession(data, options) {
    return this.post("/sessions", data, options);
  }
  async listSessions(params, options) {
    return this._list("/sessions", params, options);
  }
  async getSession(id, options) {
    return this._get(`/sessions/${id}`, options);
  }
  async startSession(id, options) {
    return this.post(`/sessions/${id}/start`, void 0, options);
  }
  async endSession(id, data, options) {
    return this.post(`/sessions/${id}/end`, data, options);
  }
  // Logs
  async appendLog(sessionId, data, options) {
    return this.post(`/sessions/${sessionId}/logs`, data, options);
  }
  async listLogs(sessionId, options) {
    return this._get(`/sessions/${sessionId}/logs`, options);
  }
  // Artifacts
  async addArtifact(sessionId, data, options) {
    return this.post(`/sessions/${sessionId}/artifacts`, data, options);
  }
  async listArtifacts(sessionId, options) {
    return this._get(`/sessions/${sessionId}/artifacts`, options);
  }
};
var ScaleMule = class {
  /** @deprecated Use `workspaces` instead */
  get teams() {
    return this.workspaces;
  }
  constructor(config) {
    this._client = new ScaleMuleClient(config);
    this.auth = new AuthService(this._client);
    this.storage = new StorageService(this._client);
    this.realtime = new RealtimeService(this._client);
    this.video = new VideoService(this._client);
    this.data = new DataService(this._client);
    this.chat = new ChatService(this._client);
    this.conference = new ConferenceService(this._client);
    this.social = new SocialService(this._client);
    this.referrals = new ReferralsService(this._client);
    this.billing = new BillingService(this._client);
    this.analytics = new AnalyticsService(this._client);
    this.flags = new FlagsService(this._client);
    this.communication = new CommunicationService(this._client);
    this.notifications = new NotificationsService(this._client);
    this.scheduler = new SchedulerService(this._client);
    this.permissions = new PermissionsService(this._client);
    this.workspaces = new WorkspacesService(this._client);
    this.accounts = new AccountsService(this._client);
    this.identity = new IdentityService(this._client);
    this.catalog = new CatalogService(this._client);
    this.cache = new CacheService(this._client);
    this.queue = new QueueService(this._client);
    this.search = new SearchService(this._client);
    this.logger = new LoggerService(this._client);
    this.webhooks = new WebhooksService(this._client);
    this.leaderboard = new LeaderboardService(this._client);
    this.listings = new ListingsService(this._client);
    this.events = new EventsService(this._client);
    this.graph = new GraphService(this._client);
    this.functions = new FunctionsService(this._client);
    this.photo = new PhotoService(this._client);
    this.flagContent = new FlagContentService(this._client);
    this.creatorMaker = new CreatorMakerService(this._client);
    this.compliance = new ComplianceService(this._client);
    this.orchestrator = new OrchestratorService(this._client);
    this.agentAuth = new AgentAuthService(this._client);
    this.agents = new AgentsService(this._client);
    this.agentProjects = new AgentProjectsService(this._client);
    this.agentTools = new AgentToolsService(this._client);
    this.agentModels = new AgentModelsService(this._client);
    this.agentSessions = new AgentSessionsService(this._client);
  }
  /**
   * Initialize the client — loads persisted session from storage.
   * Call this once after construction, before making authenticated requests.
   */
  async initialize() {
    await this._client.initialize();
    const anonymousId = this._client.getAnonymousId();
    if (this._client.isAuthenticated() && anonymousId) {
      this.identity.identify(anonymousId).catch(() => {
      });
    }
  }
  /**
   * Set authentication session (token + userId).
   * Persisted to storage for cross-session continuity.
   */
  async setSession(token, userId) {
    return this._client.setSession(token, userId);
  }
  /** Clear the current session and remove from storage. */
  async clearSession() {
    return this._client.clearSession();
  }
  /** Set access token (in-memory only, not persisted). */
  setAccessToken(token) {
    this._client.setAccessToken(token);
  }
  /** Clear access token. */
  clearAccessToken() {
    this._client.clearAccessToken();
  }
  /** Current session token, or null. */
  getSessionToken() {
    return this._client.getSessionToken();
  }
  /** Current user ID, or null. */
  getUserId() {
    return this._client.getUserId();
  }
  /** Whether a session token is set. */
  isAuthenticated() {
    return this._client.isAuthenticated();
  }
  /** The anonymous visitor ID used for identity linking. */
  getAnonymousId() {
    return this._client.getAnonymousId();
  }
  // --------------------------------------------------------------------------
  // Multi-Account Session Pool (Phase 2)
  // --------------------------------------------------------------------------
  /** Get all accounts in the session pool (requires enableMultiSession) */
  getSessionPool() {
    return this._client.getSessionPool();
  }
  /** Get the active account, or null */
  getActiveAccount() {
    return this._client.getActiveAccount();
  }
  /** Switch to a different account in the pool. Returns false if not found. */
  async switchAccount(userId) {
    return this._client.switchAccount(userId);
  }
  /** Remove a specific account from the pool */
  async removeAccount(userId) {
    return this._client.removeAccount(userId);
  }
  /** Clear all accounts from the pool */
  async clearAllAccounts() {
    return this._client.clearAllAccounts();
  }
  // --------------------------------------------------------------------------
  // Account Switcher (Secure — metadata only, re-auth required)
  // --------------------------------------------------------------------------
  /** Whether the account switcher is enabled */
  isAccountSwitcherEnabled() {
    return this._client.isAccountSwitcherEnabled();
  }
  /** The configured privacy level for the account switcher */
  getAccountSwitcherPrivacy() {
    return this._client.getAccountSwitcherPrivacy();
  }
  /**
   * Get all accounts that have previously logged in on this device.
   * Returns privacy-transformed display data — no raw PII in masked/minimal modes.
   * Requires `enableAccountSwitcher: true` in config.
   */
  getKnownAccounts() {
    return this._client.getKnownAccounts();
  }
  /**
   * Forget a specific account — removes it from the known accounts list.
   * Does NOT affect any active session.
   */
  async removeKnownAccount(userId) {
    return this._client.removeKnownAccount(userId);
  }
  /** Forget all known accounts on this device. */
  async clearKnownAccounts() {
    return this._client.clearKnownAccounts();
  }
  /** The base URL being used for API requests. */
  getBaseUrl() {
    return this._client.getBaseUrl();
  }
  /** The application ID, or null if not configured. */
  getApplicationId() {
    return this._client.getApplicationId();
  }
  /** Set the active workspace context. All subsequent requests include this as x-sm-workspace-id. */
  setWorkspaceContext(id) {
    this._client.setWorkspaceContext(id);
  }
  /** Get the current workspace ID, or null. */
  getWorkspaceId() {
    return this._client.getWorkspaceId();
  }
  /** Access the underlying ScaleMuleClient for advanced usage. */
  getClient() {
    return this._client;
  }
};

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
var GATEWAY_URLS2 = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
var SESSION_STORAGE_KEY2 = "scalemule_session";
var USER_ID_STORAGE_KEY2 = "scalemule_user_id";
var WORKSPACE_STORAGE_KEY2 = "scalemule_workspace_id";
var RETRYABLE_STATUS_CODES3 = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
function sleep3(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function getBackoffDelay2(attempt, baseDelay = 1e3) {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay;
  return Math.min(exponentialDelay + jitter, 3e4);
}
function sanitizeFilename2(filename) {
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
var RateLimitQueue2 = class {
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
        await sleep3(waitTime);
      }
      if (now - this.windowStart >= this.windowDurationMs) {
        this.windowStart = now;
        this.requestsInWindow = 0;
      }
      if (this.requestsInWindow >= this.maxRequestsPerWindow) {
        const waitTime = this.windowDurationMs - (now - this.windowStart);
        await sleep3(waitTime);
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
var OfflineQueue2 = class {
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
  return GATEWAY_URLS2[env];
}
function createDefaultStorage2() {
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
var ScaleMuleClient2 = class {
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
    this.storage = config.storage || createDefaultStorage2();
    this.enableRateLimitQueue = config.enableRateLimitQueue || false;
    this.enableOfflineQueue = config.enableOfflineQueue || false;
    if (this.enableRateLimitQueue) {
      this.rateLimitQueue = new RateLimitQueue2();
    }
    if (this.enableOfflineQueue) {
      this.offlineQueue = new OfflineQueue2(this.storage);
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
    await this.storage.setItem(SESSION_STORAGE_KEY2, token);
    await this.storage.setItem(USER_ID_STORAGE_KEY2, userId);
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
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES3.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay2(attempt);
            if (this.debug) {
              console.log(`[ScaleMule] Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            }
            await sleep3(delay);
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
          const delay = getBackoffDelay2(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Retrying after error in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          }
          await sleep3(delay);
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
    const sanitizedName = sanitizeFilename2(file.name);
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
          if (attempt < maxRetries && RETRYABLE_STATUS_CODES3.has(response.status)) {
            lastError = error;
            const delay = getBackoffDelay2(attempt);
            if (this.debug) {
              console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
            }
            await sleep3(delay);
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
          const delay = getBackoffDelay2(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms (network error)`);
          }
          await sleep3(delay);
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
        const isRetryableHttp = errorCode.startsWith("HTTP_") && RETRYABLE_STATUS_CODES3.has(parseInt(errorCode.replace("HTTP_", ""), 10));
        if (attempt < maxRetries && (isNetworkError || isRetryableHttp)) {
          lastError = { code: err.code, message: err.message };
          const delay = getBackoffDelay2(attempt);
          if (this.debug) {
            console.log(`[ScaleMule] Upload retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
          }
          await sleep3(delay);
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
  return new ScaleMuleClient2(config);
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
  enableAccountSwitcher,
  accountSwitcherPrivacy,
  children,
  onLogin,
  onLogout,
  onAuthError,
  bootstrapFlags
}) {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const resolvedGatewayUrl = gatewayUrl || (environment === "dev" ? "https://api-dev.scalemule.com" : "https://api.scalemule.com");
  const client = useMemo(
    () => createClient({
      apiKey,
      applicationId,
      environment,
      gatewayUrl: resolvedGatewayUrl,
      debug,
      storage,
      pendingSessionInit: !!authProxyUrl
    }),
    [apiKey, applicationId, environment, resolvedGatewayUrl, debug, storage, authProxyUrl]
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
      money,
      realtime: baseClient.realtime,
      user,
      setUser: handleSetUser,
      initializing,
      error,
      setError,
      analyticsProxyUrl,
      authProxyUrl,
      publishableKey,
      gatewayUrl: resolvedGatewayUrl,
      environment: environment || void 0,
      enableAccountSwitcher,
      accountSwitcherPrivacy,
      bootstrapFlags
    }),
    [client, money, baseClient, user, handleSetUser, initializing, error, analyticsProxyUrl, authProxyUrl, publishableKey, resolvedGatewayUrl, environment, enableAccountSwitcher, accountSwitcherPrivacy, bootstrapFlags]
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
function maskEmail2(email) {
  const [local, domain] = email.split("@");
  if (!domain) return "***@***.***";
  const tldDot = domain.lastIndexOf(".");
  const tld = tldDot > 0 ? domain.slice(tldDot) : "";
  const domainBase = tldDot > 0 ? domain.slice(0, tldDot) : domain;
  return `${local[0] || "*"}***@${domainBase[0] || "*"}***${tld}`;
}
function stableColorIndex2(userId) {
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
      email: entry.email ? maskEmail2(entry.email) : void 0,
      fullName: entry.fullName ? `${entry.fullName[0].toUpperCase()}.` : void 0,
      provider: entry.provider,
      lastActiveAt: entry.lastActiveAt,
      colorIndex: stableColorIndex2(entry.userId)
    };
  }
  return {
    userId: entry.userId,
    provider: entry.provider,
    lastActiveAt: entry.lastActiveAt,
    displayLabel: "Account",
    colorIndex: stableColorIndex2(entry.userId)
  };
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
    anonymousStorageKey = "sm_anonymous_id",
    useV2 = true,
    eventDedupMs = DEFAULT_EVENT_DEDUP_MS
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
        const endpoint2 = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
        fetch(`${gatewayUrl}${endpoint2}`, {
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
      const endpoint = useV2 ? "/v1/analytics/v2/events" : "/v1/analytics/events";
      return await client.post(endpoint, fullEvent);
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
          const endpoint2 = useV2 ? "/v1/analytics/v2/events/batch" : "/v1/analytics/events/batch";
          fetch(`${gatewayUrl}${endpoint2}`, {
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

export { ScaleMuleApiError, ScaleMuleClient2 as ScaleMuleClient, ScaleMuleProvider, composePhone, createClient, createSafeLogger, normalizePhone, phoneCountries, sanitizeForLog, useAnalytics, useAuth, useBilling, useContent, useFeatureFlags, useMoney, useMoneyClient, usePushNotifications, useRealtime, useScaleMule, useScaleMuleClient, useShare, useUser, validateForm, validators };
