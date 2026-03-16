'use strict';

var headers = require('next/headers');
var server = require('next/server');
var crypto$1 = require('crypto');
var server$1 = require('@scalemule/sdk/flags/server');

// src/types/index.ts
var ScaleMuleApiError = class extends Error {
  constructor(error) {
    super(error.message);
    this.name = "ScaleMuleApiError";
    this.code = error.code;
    this.field = error.field;
  }
};

// src/server/context.ts
function validateIP(ip) {
  if (!ip) return void 0;
  const trimmed = ip.trim();
  if (!trimmed) return void 0;
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  const ipv4MappedRegex = /^::ffff:(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/i;
  if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed) || ipv4MappedRegex.test(trimmed)) {
    return trimmed;
  }
  return void 0;
}
function extractClientContext(request) {
  const headers2 = request.headers;
  let ip;
  const cfConnectingIp = headers2.get("cf-connecting-ip");
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp);
  }
  if (!ip) {
    const doConnectingIp = headers2.get("do-connecting-ip");
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp);
    }
  }
  if (!ip) {
    const realIp = headers2.get("x-real-ip");
    if (realIp) {
      ip = validateIP(realIp);
    }
  }
  if (!ip) {
    const forwardedFor = headers2.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const vercelForwarded = headers2.get("x-vercel-forwarded-for");
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const trueClientIp = headers2.get("true-client-ip");
    if (trueClientIp) {
      ip = validateIP(trueClientIp);
    }
  }
  if (!ip && request.ip) {
    ip = validateIP(request.ip);
  }
  const userAgent = headers2.get("user-agent") || void 0;
  const deviceFingerprint = headers2.get("x-device-fingerprint") || void 0;
  const referrer = headers2.get("referer") || void 0;
  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer
  };
}
function extractClientContextFromReq(req) {
  const headers2 = req.headers;
  const getHeader = (name) => {
    const value = headers2[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  };
  let ip;
  const cfConnectingIp = getHeader("cf-connecting-ip");
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp);
  }
  if (!ip) {
    const doConnectingIp = getHeader("do-connecting-ip");
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp);
    }
  }
  if (!ip) {
    const realIp = getHeader("x-real-ip");
    if (realIp) {
      ip = validateIP(realIp);
    }
  }
  if (!ip) {
    const forwardedFor = getHeader("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const vercelForwarded = getHeader("x-vercel-forwarded-for");
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const trueClientIp = getHeader("true-client-ip");
    if (trueClientIp) {
      ip = validateIP(trueClientIp);
    }
  }
  if (!ip && req.socket?.remoteAddress) {
    ip = validateIP(req.socket.remoteAddress);
  }
  const userAgent = getHeader("user-agent");
  const deviceFingerprint = getHeader("x-device-fingerprint");
  const referrer = getHeader("referer");
  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer
  };
}
function buildClientContextHeaders(context) {
  const headers2 = {};
  if (!context) {
    return headers2;
  }
  if (context.ip) {
    headers2["x-sm-forwarded-client-ip"] = context.ip;
    headers2["X-Client-IP"] = context.ip;
  }
  if (context.userAgent) {
    headers2["X-Client-User-Agent"] = context.userAgent;
  }
  if (context.deviceFingerprint) {
    headers2["X-Client-Device-Fingerprint"] = context.deviceFingerprint;
  }
  if (context.referrer) {
    headers2["X-Client-Referrer"] = context.referrer;
  }
  return headers2;
}

// src/server/client.ts
var GATEWAY_URLS = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
function resolveGatewayUrl(config) {
  if (config.gatewayUrl) return config.gatewayUrl;
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL;
  return GATEWAY_URLS[config.environment || "prod"];
}
var ScaleMuleServer = class {
  constructor(config) {
    // ==========================================================================
    // Auth Methods
    // ==========================================================================
    this.auth = {
      /**
       * Register a new user
       */
      register: async (data, options) => {
        return this.request("POST", "/v1/auth/register", { body: data, clientContext: options?.clientContext });
      },
      /**
       * Login user - returns session token (store in HTTP-only cookie)
       */
      login: async (data, options) => {
        return this.request("POST", "/v1/auth/login", { body: data, clientContext: options?.clientContext });
      },
      /**
       * Logout user
       */
      logout: async (sessionToken) => {
        return this.request("POST", "/v1/auth/logout", {
          body: { session_token: sessionToken }
        });
      },
      /**
       * Get current user from session token
       */
      me: async (sessionToken) => {
        return this.request("GET", "/v1/auth/me", { sessionToken });
      },
      /**
       * Refresh session token
       */
      refresh: async (sessionToken) => {
        return this.request("POST", "/v1/auth/refresh", {
          body: { session_token: sessionToken }
        });
      },
      /**
       * Request password reset email
       */
      forgotPassword: async (email, options) => {
        return this.request("POST", "/v1/auth/forgot-password", { body: { email }, clientContext: options?.clientContext });
      },
      /**
       * Reset password with token
       */
      resetPassword: async (token, newPassword, options) => {
        return this.request("POST", "/v1/auth/reset-password", {
          body: { token, new_password: newPassword },
          clientContext: options?.clientContext
        });
      },
      /**
       * Verify email with token
       */
      verifyEmail: async (token) => {
        return this.request("POST", "/v1/auth/verify-email", { body: { token } });
      },
      /**
       * Resend verification email.
       * Can be called with a session token (authenticated) or email (unauthenticated).
       */
      resendVerification: async (sessionTokenOrEmail, options) => {
        if (options?.email) {
          return this.request("POST", "/v1/auth/resend-verification", {
            sessionToken: sessionTokenOrEmail,
            body: { email: options.email }
          });
        }
        if (sessionTokenOrEmail.includes("@")) {
          return this.request("POST", "/v1/auth/resend-verification", {
            body: { email: sessionTokenOrEmail }
          });
        }
        return this.request("POST", "/v1/auth/resend-verification", {
          sessionToken: sessionTokenOrEmail
        });
      }
    };
    // ==========================================================================
    // User/Profile Methods
    // ==========================================================================
    this.user = {
      /**
       * Update user profile
       */
      update: async (sessionToken, data) => {
        return this.request("PATCH", "/v1/auth/profile", {
          sessionToken,
          body: data
        });
      },
      /**
       * Change password
       */
      changePassword: async (sessionToken, currentPassword, newPassword) => {
        return this.request("POST", "/v1/auth/change-password", {
          sessionToken,
          body: { current_password: currentPassword, new_password: newPassword }
        });
      },
      /**
       * Change email
       */
      changeEmail: async (sessionToken, newEmail, password) => {
        return this.request("POST", "/v1/auth/change-email", {
          sessionToken,
          body: { new_email: newEmail, password }
        });
      },
      /**
       * Delete account
       */
      deleteAccount: async (sessionToken, password) => {
        return this.request("DELETE", "/v1/auth/me", {
          sessionToken,
          body: { password }
        });
      }
    };
    // ==========================================================================
    // Storage/Content Methods
    // ==========================================================================
    // ==========================================================================
    // Secrets Methods (Tenant Vault)
    // ==========================================================================
    this.secrets = {
      /**
       * Get a secret from the tenant vault
       *
       * @example
       * ```typescript
       * const result = await scalemule.secrets.get('ANONYMOUS_USER_SALT')
       * if (result.success) {
       *   console.log('Salt:', result.data.value)
       * }
       * ```
       */
      get: async (key) => {
        return this.request("GET", `/v1/vault/secrets/${encodeURIComponent(key)}`);
      },
      /**
       * Set a secret in the tenant vault
       *
       * @example
       * ```typescript
       * await scalemule.secrets.set('ANONYMOUS_USER_SALT', 'my-secret-salt')
       * ```
       */
      set: async (key, value) => {
        return this.request("PUT", `/v1/vault/secrets/${encodeURIComponent(key)}`, {
          body: { value }
        });
      },
      /**
       * Delete a secret from the tenant vault
       */
      delete: async (key) => {
        return this.request("DELETE", `/v1/vault/secrets/${encodeURIComponent(key)}`);
      },
      /**
       * List all secrets in the tenant vault
       */
      list: async () => {
        return this.request("GET", "/v1/vault/secrets");
      },
      /**
       * Get secret version history
       */
      versions: async (key) => {
        return this.request(
          "GET",
          `/v1/vault/versions/${encodeURIComponent(key)}`
        );
      },
      /**
       * Rollback to a specific version
       */
      rollback: async (key, version) => {
        return this.request(
          "POST",
          `/v1/vault/actions/rollback/${encodeURIComponent(key)}`,
          { body: { version } }
        );
      },
      /**
       * Rotate a secret (copy current version as new version)
       */
      rotate: async (key, newValue) => {
        return this.request(
          "POST",
          `/v1/vault/actions/rotate/${encodeURIComponent(key)}`,
          { body: { value: newValue } }
        );
      }
    };
    // ==========================================================================
    // Bundle Methods (Structured Secrets with Inheritance)
    // ==========================================================================
    this.bundles = {
      /**
       * Get a bundle (structured secret like database credentials)
       *
       * @param key - Bundle key (e.g., 'database/prod')
       * @param resolve - Whether to resolve inheritance (default: true)
       *
       * @example
       * ```typescript
       * const result = await scalemule.bundles.get('database/prod')
       * if (result.success) {
       *   console.log('DB Host:', result.data.data.host)
       * }
       * ```
       */
      get: async (key, resolve = true) => {
        const params = new URLSearchParams({ resolve: resolve.toString() });
        return this.request(
          "GET",
          `/v1/vault/bundles/${encodeURIComponent(key)}?${params}`
        );
      },
      /**
       * Set a bundle (structured secret)
       *
       * @param key - Bundle key
       * @param type - Bundle type: 'mysql', 'postgres', 'redis', 's3', 'oauth', 'smtp', 'generic'
       * @param data - Bundle data (structure depends on type)
       * @param inheritsFrom - Optional parent bundle key for inheritance
       *
       * @example
       * ```typescript
       * // Create a MySQL bundle
       * await scalemule.bundles.set('database/prod', 'mysql', {
       *   host: 'db.example.com',
       *   port: 3306,
       *   username: 'app',
       *   password: 'secret',
       *   database: 'myapp'
       * })
       *
       * // Create a bundle that inherits from another
       * await scalemule.bundles.set('database/staging', 'mysql', {
       *   host: 'staging-db.example.com', // Override just the host
       * }, 'database/prod')
       * ```
       */
      set: async (key, type, data, inheritsFrom) => {
        return this.request(
          "PUT",
          `/v1/vault/bundles/${encodeURIComponent(key)}`,
          {
            body: {
              type,
              value: data,
              inherits_from: inheritsFrom
            }
          }
        );
      },
      /**
       * Delete a bundle
       */
      delete: async (key) => {
        return this.request("DELETE", `/v1/vault/bundles/${encodeURIComponent(key)}`);
      },
      /**
       * List all bundles
       */
      list: async () => {
        return this.request(
          "GET",
          "/v1/vault/bundles"
        );
      },
      /**
       * Get connection URL for a database bundle
       *
       * @example
       * ```typescript
       * const result = await scalemule.bundles.connectionUrl('database/prod')
       * if (result.success) {
       *   const client = mysql.createConnection(result.data.url)
       * }
       * ```
       */
      connectionUrl: async (key) => {
        return this.request(
          "GET",
          `/v1/vault/bundles/${encodeURIComponent(key)}?connection_url=true`
        );
      }
    };
    // ==========================================================================
    // Vault Audit Methods
    // ==========================================================================
    this.vaultAudit = {
      /**
       * Query audit logs for your tenant's vault operations
       *
       * @example
       * ```typescript
       * const result = await scalemule.vaultAudit.query({
       *   action: 'read',
       *   path: 'database/*',
       *   since: '2026-01-01'
       * })
       * ```
       */
      query: async (options) => {
        const params = new URLSearchParams();
        if (options?.action) params.set("action", options.action);
        if (options?.path) params.set("path", options.path);
        if (options?.since) params.set("since", options.since);
        if (options?.until) params.set("until", options.until);
        if (options?.limit) params.set("limit", options.limit.toString());
        const queryStr = params.toString();
        return this.request("GET", `/v1/vault/audit${queryStr ? `?${queryStr}` : ""}`);
      }
    };
    this.storage = {
      /**
       * List user's files
       */
      list: async (userId, params) => {
        const query = new URLSearchParams();
        if (params?.content_type) query.set("content_type", params.content_type);
        if (params?.search) query.set("search", params.search);
        if (params?.limit) query.set("limit", params.limit.toString());
        if (params?.offset) query.set("offset", params.offset.toString());
        const queryStr = query.toString();
        const path = `/v1/storage/my-files${queryStr ? `?${queryStr}` : ""}`;
        return this.request("GET", path, { userId });
      },
      /**
       * Get file info
       */
      get: async (fileId) => {
        return this.request("GET", `/v1/storage/files/${fileId}/info`);
      },
      /**
       * Delete file
       */
      delete: async (userId, fileId) => {
        return this.request("DELETE", `/v1/storage/files/${fileId}`, { userId });
      },
      /**
       * Upload file (from server - use FormData)
       *
       * @param userId - The user ID who owns this file
       * @param file - File data to upload
       * @param options - Upload options
       * @param options.clientContext - End user context to forward (IP, user agent, etc.)
       *
       * @example
       * ```typescript
       * // Forward end user context for proper attribution
       * const result = await scalemule.storage.upload(
       *   userId,
       *   { buffer, filename, contentType },
       *   { clientContext: extractClientContext(request) }
       * )
       * ```
       */
      upload: async (userId, file, options) => {
        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: file.contentType });
        formData.append("file", blob, file.filename);
        formData.append("sm_user_id", userId);
        const url = `${this.gatewayUrl}/v1/storage/upload`;
        const headers2 = {
          "x-api-key": this.apiKey,
          "x-user-id": userId,
          ...buildClientContextHeaders(options?.clientContext)
        };
        if (this.debug && options?.clientContext) {
          console.log(`[ScaleMule Server] Upload with client context: IP=${options.clientContext.ip}`);
        }
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: headers2,
            body: formData
          });
          const text = await response.text();
          let responseData = null;
          try {
            responseData = text ? JSON.parse(text) : null;
          } catch {
          }
          if (!response.ok) {
            throw new ScaleMuleApiError(
              responseData?.error || { code: "UPLOAD_FAILED", message: text || "Upload failed" }
            );
          }
          const data = responseData?.data !== void 0 ? responseData.data : responseData;
          return data;
        } catch (err) {
          if (err instanceof ScaleMuleApiError) {
            throw err;
          }
          throw new ScaleMuleApiError({
            code: "UPLOAD_ERROR",
            message: err instanceof Error ? err.message : "Upload failed"
          });
        }
      }
    };
    // ==========================================================================
    // Analytics Methods
    // ==========================================================================
    // ==========================================================================
    // Webhooks Methods
    // ==========================================================================
    this.webhooks = {
      /**
       * Create a new webhook subscription
       *
       * @example
       * ```typescript
       * const result = await scalemule.webhooks.create({
       *   webhook_name: 'Video Status Webhook',
       *   url: 'https://myapp.com/api/webhooks/scalemule',
       *   events: ['video.ready', 'video.failed']
       * })
       *
       * // Store the secret for signature verification
       * console.log('Webhook secret:', result.secret)
       * ```
       */
      create: async (data) => {
        return this.request(
          "POST",
          "/v1/webhooks",
          { body: data }
        );
      },
      /**
       * List all webhook subscriptions
       */
      list: async () => {
        return this.request("GET", "/v1/webhooks");
      },
      /**
       * Delete a webhook subscription
       */
      delete: async (id) => {
        return this.request("DELETE", `/v1/webhooks/${id}`);
      },
      /**
       * Update a webhook subscription
       */
      update: async (id, data) => {
        return this.request(
          "PATCH",
          `/v1/webhooks/${id}`,
          { body: data }
        );
      },
      /**
       * Get available webhook event types
       */
      eventTypes: async () => {
        return this.request("GET", "/v1/webhooks/events");
      }
    };
    // ==========================================================================
    // Analytics Methods
    // ==========================================================================
    this.analytics = {
      /**
       * Track an analytics event
       *
       * IMPORTANT: When calling from server-side code (API routes), always pass
       * clientContext to ensure the real end user's IP is recorded, not the server's IP.
       *
       * @example
       * ```typescript
       * // In an API route
       * import { extractClientContext, createServerClient } from '@scalemule/nextjs/server'
       *
       * export async function POST(request: NextRequest) {
       *   const clientContext = extractClientContext(request)
       *   const scalemule = createServerClient()
       *
       *   await scalemule.analytics.trackEvent({
       *     event_name: 'button_clicked',
       *     properties: { button_id: 'signup' }
       *   }, { clientContext })
       * }
       * ```
       */
      trackEvent: async (event, options) => {
        return this.request("POST", "/v1/analytics/v2/events", {
          body: event,
          clientContext: options?.clientContext
        });
      },
      /**
       * Track a page view
       *
       * @example
       * ```typescript
       * await scalemule.analytics.trackPageView({
       *   page_url: 'https://example.com/products',
       *   page_title: 'Products',
       *   referrer: 'https://google.com'
       * }, { clientContext })
       * ```
       */
      trackPageView: async (data, options) => {
        return this.request("POST", "/v1/analytics/v2/events", {
          body: {
            event_name: "page_viewed",
            event_category: "navigation",
            page_url: data.page_url,
            properties: {
              page_title: data.page_title,
              referrer: data.referrer
            },
            session_id: data.session_id,
            user_id: data.user_id
          },
          clientContext: options?.clientContext
        });
      },
      /**
       * Track multiple events in a batch (max 100)
       *
       * @example
       * ```typescript
       * await scalemule.analytics.trackBatch([
       *   { event_name: 'item_viewed', properties: { item_id: '123' } },
       *   { event_name: 'item_added_to_cart', properties: { item_id: '123' } }
       * ], { clientContext })
       * ```
       */
      trackBatch: async (events, options) => {
        return this.request("POST", "/v1/analytics/v2/events/batch", {
          body: { events },
          clientContext: options?.clientContext
        });
      }
    };
    this.flags = {
      evaluate: async (flagKey, context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate", {
          body: {
            flag_key: flagKey,
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      },
      evaluateBatch: async (flagKeys, context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate/batch", {
          body: {
            flag_keys: flagKeys,
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      },
      evaluateAll: async (context = {}, environment = "prod", options) => {
        return this.request("POST", "/v1/flags/evaluate/all", {
          body: {
            environment,
            context
          },
          clientContext: options?.clientContext
        });
      }
    };
    this.apiKey = config.apiKey;
    this.gatewayUrl = resolveGatewayUrl(config);
    this.debug = config.debug || false;
  }
  /**
   * Make a request to the ScaleMule API
   *
   * @param method - HTTP method
   * @param path - API path (e.g., /v1/auth/login)
   * @param options - Request options
   * @param options.body - Request body (will be JSON stringified)
   * @param options.userId - User ID (passed through for storage operations)
   * @param options.sessionToken - Session token sent as Authorization: Bearer header
   * @param options.clientContext - End user context to forward (IP, user agent, etc.)
   */
  async request(method, path, options = {}) {
    const url = `${this.gatewayUrl}${path}`;
    const headers2 = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      // Forward client context headers if provided
      ...buildClientContextHeaders(options.clientContext)
    };
    if (options.sessionToken) {
      headers2["Authorization"] = `Bearer ${options.sessionToken}`;
    }
    if (this.debug) {
      console.log(`[ScaleMule Server] ${method} ${path}`);
      if (options.clientContext) {
        console.log(`[ScaleMule Server] Client context: IP=${options.clientContext.ip}, UA=${options.clientContext.userAgent?.substring(0, 50)}...`);
      }
    }
    try {
      const response = await fetch(url, {
        method,
        headers: headers2,
        body: options.body ? JSON.stringify(options.body) : void 0
      });
      const text = await response.text();
      let responseData = null;
      try {
        responseData = text ? JSON.parse(text) : null;
      } catch {
      }
      if (!response.ok) {
        const error = responseData?.error || {
          code: `HTTP_${response.status}`,
          message: responseData?.message || text || response.statusText
        };
        throw new ScaleMuleApiError(error);
      }
      const data = responseData?.data !== void 0 ? responseData.data : responseData;
      return data;
    } catch (err) {
      if (err instanceof ScaleMuleApiError) {
        throw err;
      }
      throw new ScaleMuleApiError({
        code: "SERVER_ERROR",
        message: err instanceof Error ? err.message : "Request failed"
      });
    }
  }
};
function createServerClient(config) {
  const apiKey = config?.apiKey || process.env.SCALEMULE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ScaleMule API key is required. Set SCALEMULE_API_KEY environment variable or pass apiKey in config."
    );
  }
  const environment = config?.environment || process.env.SCALEMULE_ENV || "prod";
  return new ScaleMuleServer({
    apiKey,
    environment,
    gatewayUrl: config?.gatewayUrl,
    debug: config?.debug || process.env.SCALEMULE_DEBUG === "true"
  });
}
var SESSION_COOKIE_NAME = "sm_session";
var USER_ID_COOKIE_NAME = "sm_user_id";
({
  secure: process.env.NODE_ENV === "production"});
function createCookieHeader(name, value, options = {}) {
  const maxAge = options.maxAge ?? 7 * 24 * 60 * 60;
  const secure = options.secure ?? process.env.NODE_ENV === "production";
  const sameSite = options.sameSite ?? "lax";
  const path = options.path ?? "/";
  let cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=${sameSite}`;
  if (secure) {
    cookie += "; Secure";
  }
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  return cookie;
}
function createClearCookieHeader(name, options = {}) {
  const path = options.path ?? "/";
  let cookie = `${name}=; Path=${path}; Max-Age=0; HttpOnly`;
  if (options.domain) {
    cookie += `; Domain=${options.domain}`;
  }
  return cookie;
}
function withSession(loginResponse, responseBody, options = {}) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, loginResponse.session_token, options)
  );
  headers2.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, loginResponse.user.id, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers: headers2
  });
}
function withRefreshedSession(sessionToken, userId, responseBody, options = {}) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, sessionToken, options)
  );
  headers2.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, userId, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers: headers2
  });
}
function clearSession(responseBody, options = {}, status = 200) {
  const headers2 = new Headers();
  headers2.set("Content-Type", "application/json");
  headers2.append("Set-Cookie", createClearCookieHeader(SESSION_COOKIE_NAME, options));
  headers2.append("Set-Cookie", createClearCookieHeader(USER_ID_COOKIE_NAME, options));
  return new Response(JSON.stringify({ success: status < 300, data: responseBody }), {
    status,
    headers: headers2
  });
}
async function getSession() {
  const cookieStore = await headers.cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  const userIdCookie = cookieStore.get(USER_ID_COOKIE_NAME);
  if (!sessionCookie?.value || !userIdCookie?.value) {
    return null;
  }
  return {
    sessionToken: sessionCookie.value,
    userId: userIdCookie.value,
    expiresAt: /* @__PURE__ */ new Date()
    // Note: actual expiry is managed by ScaleMule backend
  };
}
function getSessionFromRequest(request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies4 = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [key, ...rest] = c.trim().split("=");
      return [key, decodeURIComponent(rest.join("="))];
    })
  );
  const sessionToken = cookies4[SESSION_COOKIE_NAME];
  const userId = cookies4[USER_ID_COOKIE_NAME];
  if (!sessionToken || !userId) {
    return null;
  }
  return {
    sessionToken,
    userId,
    expiresAt: /* @__PURE__ */ new Date()
  };
}
async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Response(
      JSON.stringify({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Authentication required" }
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
  return session;
}

// src/server/timing.ts
function constantTimeEqual(a, b) {
  const maxLength = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < maxLength; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0;
    const bCode = i < b.length ? b.charCodeAt(i) : 0;
    mismatch |= aCode ^ bCode;
  }
  return mismatch === 0;
}

// src/server/csrf.ts
var CSRF_COOKIE_NAME = "sm_csrf";
var CSRF_HEADER_NAME = "x-csrf-token";
function generateCSRFToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function withCSRFToken(response, token) {
  const csrfToken = token || generateCSRFToken();
  response.cookies.set(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    // Must be readable by JavaScript to include in requests
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24
    // 24 hours
  });
  return response;
}
function validateCSRFToken(request) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) {
    return "Missing CSRF cookie";
  }
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!headerToken) {
    return "Missing CSRF token header";
  }
  if (!constantTimeEqual(cookieToken, headerToken)) {
    return "CSRF token mismatch";
  }
  return void 0;
}
async function validateCSRFTokenAsync(request, body) {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  if (!cookieToken) {
    return "Missing CSRF cookie";
  }
  let requestToken = request.headers.get(CSRF_HEADER_NAME);
  if (!requestToken && body) {
    requestToken = body.csrf_token ?? body._csrf ?? null;
  }
  if (!requestToken) {
    return "Missing CSRF token";
  }
  if (!constantTimeEqual(cookieToken, requestToken)) {
    return "CSRF token mismatch";
  }
  return void 0;
}
function withCSRFProtection(handler) {
  return async (request) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const error = validateCSRFToken(request);
      if (error) {
        return server.NextResponse.json(
          { error: "CSRF validation failed", message: error },
          { status: 403 }
        );
      }
    }
    return handler(request);
  };
}
async function getCSRFToken() {
  const cookieStore = await headers.cookies();
  let token = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (!token) {
    token = generateCSRFToken();
  }
  return token;
}

// src/server/routes.ts
function errorResponse(code, message, status) {
  return new Response(
    JSON.stringify({ success: false, error: { code, message } }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function successResponse(data, status = 200) {
  return new Response(
    JSON.stringify({ success: true, data }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function createAuthRoutes(config = {}) {
  const sm = createServerClient(config.client);
  const cookieOptions = config.cookies || {};
  const POST = async (request, context) => {
    if (config.csrf) {
      const csrfError = validateCSRFToken(request);
      if (csrfError) {
        return errorResponse("CSRF_ERROR", "CSRF validation failed", 403);
      }
    }
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      const body = await request.json().catch(() => ({}));
      const clientContext = extractClientContext(request);
      switch (path) {
        // ==================== Register ====================
        case "register": {
          const { email, password, full_name, username, phone } = body;
          if (!email || !password) {
            return errorResponse("VALIDATION_ERROR", "Email and password required", 400);
          }
          let registeredUser;
          try {
            registeredUser = await sm.auth.register({ email, password, full_name, username, phone }, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "REGISTER_FAILED",
              apiErr?.message || "Registration failed",
              400
            );
          }
          if (config.onRegister) {
            await config.onRegister({ id: registeredUser.id, email: registeredUser.email });
          }
          let loginData;
          try {
            loginData = await sm.auth.login({ email, password }, { clientContext });
          } catch {
            return successResponse({ user: registeredUser, message: "Registration successful" }, 201);
          }
          return withSession(loginData, { user: registeredUser, sessionToken: loginData.session_token, userId: registeredUser.id }, cookieOptions);
        }
        // ==================== Login ====================
        case "login": {
          const { email, password, remember_me } = body;
          if (!email || !password) {
            return errorResponse("VALIDATION_ERROR", "Email and password required", 400);
          }
          let loginData;
          try {
            loginData = await sm.auth.login({ email, password, remember_me }, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            const errorCode = apiErr?.code || "LOGIN_FAILED";
            let status = 400;
            if (errorCode === "INVALID_CREDENTIALS" || errorCode === "UNAUTHORIZED") status = 401;
            if (["EMAIL_NOT_VERIFIED", "PHONE_NOT_VERIFIED", "ACCOUNT_LOCKED", "ACCOUNT_DISABLED", "MFA_REQUIRED"].includes(errorCode)) {
              status = 403;
            }
            return errorResponse(
              errorCode,
              apiErr?.message || "Login failed",
              status
            );
          }
          if (config.onLogin) {
            await config.onLogin({
              id: loginData.user.id,
              email: loginData.user.email
            });
          }
          return withSession(loginData, { user: loginData.user, sessionToken: loginData.session_token, userId: loginData.user.id }, cookieOptions);
        }
        // ==================== Logout ====================
        case "logout": {
          const session = await getSession();
          if (session) {
            await sm.auth.logout(session.sessionToken);
          }
          if (config.onLogout) {
            await config.onLogout();
          }
          return clearSession({ message: "Logged out successfully" }, cookieOptions);
        }
        // ==================== Forgot Password ====================
        case "forgot-password": {
          const { email } = body;
          if (!email) {
            return errorResponse("VALIDATION_ERROR", "Email required", 400);
          }
          const result = await sm.auth.forgotPassword(email, { clientContext });
          return successResponse({ message: "If an account exists, a reset email has been sent" });
        }
        // ==================== Reset Password ====================
        case "reset-password": {
          const { token, new_password } = body;
          if (!token || !new_password) {
            return errorResponse("VALIDATION_ERROR", "Token and new password required", 400);
          }
          try {
            await sm.auth.resetPassword(token, new_password, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "RESET_FAILED",
              apiErr?.message || "Password reset failed",
              400
            );
          }
          return successResponse({ message: "Password reset successful" });
        }
        // ==================== Verify Email ====================
        case "verify-email": {
          const { token } = body;
          if (!token) {
            return errorResponse("VALIDATION_ERROR", "Token required", 400);
          }
          try {
            await sm.auth.verifyEmail(token);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "VERIFY_FAILED",
              apiErr?.message || "Email verification failed",
              400
            );
          }
          return successResponse({ message: "Email verified successfully" });
        }
        // ==================== Resend Verification ====================
        // Supports both authenticated (session-based) and unauthenticated (email-based) resend
        case "resend-verification": {
          const { email } = body;
          const session = await getSession();
          if (email) {
            try {
              await sm.auth.resendVerification(email);
            } catch (err) {
              const apiErr = err instanceof ScaleMuleApiError ? err : null;
              return errorResponse(
                apiErr?.code || "RESEND_FAILED",
                apiErr?.message || "Failed to resend verification",
                apiErr?.code === "RATE_LIMITED" ? 429 : 400
              );
            }
            return successResponse({ message: "Verification email sent" });
          }
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Email or session required", 401);
          }
          try {
            await sm.auth.resendVerification(session.sessionToken);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "RESEND_FAILED",
              apiErr?.message || "Failed to resend verification",
              400
            );
          }
          return successResponse({ message: "Verification email sent" });
        }
        // ==================== Refresh Session ====================
        case "refresh": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          let refreshData;
          try {
            refreshData = await sm.auth.refresh(session.sessionToken);
          } catch {
            return clearSession(
              { message: "Session expired" },
              cookieOptions
            );
          }
          return withRefreshedSession(
            refreshData.session_token,
            session.userId,
            { message: "Session refreshed" },
            cookieOptions
          );
        }
        // ==================== Change Password ====================
        case "change-password": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const { current_password, new_password } = body;
          if (!current_password || !new_password) {
            return errorResponse("VALIDATION_ERROR", "Current and new password required", 400);
          }
          try {
            await sm.user.changePassword(
              session.sessionToken,
              current_password,
              new_password
            );
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "CHANGE_FAILED",
              apiErr?.message || "Failed to change password",
              400
            );
          }
          return successResponse({ message: "Password changed successfully" });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const GET = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Get Current User ====================
        case "me": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          let userData;
          try {
            userData = await sm.auth.me(session.sessionToken);
          } catch {
            return clearSession(
              { error: { code: "SESSION_EXPIRED", message: "Session expired" } },
              cookieOptions
            );
          }
          return successResponse({ user: userData, sessionToken: session.sessionToken, userId: session.userId });
        }
        // ==================== Get Session Status ====================
        case "session": {
          const session = await getSession();
          return successResponse({
            authenticated: !!session,
            userId: session?.userId || null
          });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const DELETE = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Delete Account ====================
        case "me":
        case "account": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const body = await request.json().catch(() => ({}));
          const { password } = body;
          if (!password) {
            return errorResponse("VALIDATION_ERROR", "Password required", 400);
          }
          try {
            await sm.user.deleteAccount(session.sessionToken, password);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "DELETE_FAILED",
              apiErr?.message || "Failed to delete account",
              400
            );
          }
          return clearSession({ message: "Account deleted successfully" }, cookieOptions);
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  const PATCH = async (request, context) => {
    const params = await context?.params;
    const path = params?.scalemule?.join("/") || "";
    try {
      switch (path) {
        // ==================== Update Profile ====================
        case "me":
        case "profile": {
          const session = await getSession();
          if (!session) {
            return errorResponse("UNAUTHORIZED", "Authentication required", 401);
          }
          const body = await request.json().catch(() => ({}));
          const { full_name, avatar_url } = body;
          let updatedUser;
          try {
            updatedUser = await sm.user.update(session.sessionToken, { full_name, avatar_url });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "UPDATE_FAILED",
              apiErr?.message || "Failed to update profile",
              400
            );
          }
          return successResponse({ user: updatedUser });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Auth] Error:", err);
      return errorResponse("SERVER_ERROR", "Internal server error", 500);
    }
  };
  return { GET, POST, DELETE, PATCH };
}
function createAnalyticsRoutes(config = {}) {
  const sm = createServerClient(config.client);
  const handleTrackEvent = async (body, clientContext) => {
    const {
      event_name,
      event_category,
      properties,
      user_id,
      session_id,
      anonymous_id,
      session_duration_seconds,
      page_url,
      page_title,
      referrer,
      landing_page,
      device_type,
      device_brand,
      device_model,
      browser,
      browser_version,
      os,
      os_version,
      screen_resolution,
      viewport_size,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_term,
      utm_content,
      client_timestamp,
      timestamp
      // Legacy field
    } = body;
    if (!event_name) {
      return errorResponse("VALIDATION_ERROR", "event_name is required", 400);
    }
    let trackResult;
    try {
      trackResult = await sm.analytics.trackEvent(
        {
          event_name,
          event_category,
          properties,
          user_id,
          session_id,
          anonymous_id,
          session_duration_seconds,
          page_url,
          page_title,
          referrer,
          landing_page,
          device_type,
          device_brand,
          device_model,
          browser,
          browser_version,
          os,
          os_version,
          screen_resolution,
          viewport_size,
          utm_source,
          utm_medium,
          utm_campaign,
          utm_term,
          utm_content,
          client_timestamp: client_timestamp || timestamp
        },
        { clientContext }
      );
    } catch (err) {
      const apiErr = err instanceof ScaleMuleApiError ? err : null;
      return errorResponse(
        apiErr?.code || "TRACK_FAILED",
        apiErr?.message || "Failed to track event",
        400
      );
    }
    if (config.onEvent) {
      await config.onEvent({ event_name, session_id: trackResult?.session_id });
    }
    return successResponse({ tracked: trackResult?.tracked || 1, session_id: trackResult?.session_id });
  };
  const POST = async (request, context) => {
    try {
      const body = await request.json().catch(() => ({}));
      const clientContext = extractClientContext(request);
      if (config.simpleProxy) {
        return handleTrackEvent(body, clientContext);
      }
      const params = await context?.params;
      const path = params?.scalemule?.join("/") || "";
      switch (path) {
        // ==================== Track Single Event ====================
        case "event":
        case "events":
        case "": {
          return handleTrackEvent(body, clientContext);
        }
        // ==================== Track Batch Events ====================
        case "batch": {
          const { events } = body;
          if (!Array.isArray(events) || events.length === 0) {
            return errorResponse("VALIDATION_ERROR", "events array is required", 400);
          }
          if (events.length > 100) {
            return errorResponse("VALIDATION_ERROR", "Maximum 100 events per batch", 400);
          }
          let batchResult;
          try {
            batchResult = await sm.analytics.trackBatch(events, { clientContext });
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "BATCH_FAILED",
              apiErr?.message || "Failed to track events",
              400
            );
          }
          return successResponse({ tracked: batchResult?.tracked || events.length });
        }
        // ==================== Track Page View ====================
        case "page-view":
        case "pageview": {
          const { page_url, page_title, referrer, session_id, user_id } = body;
          if (!page_url) {
            return errorResponse("VALIDATION_ERROR", "page_url is required", 400);
          }
          let pageViewResult;
          try {
            pageViewResult = await sm.analytics.trackPageView(
              { page_url, page_title, referrer, session_id, user_id },
              { clientContext }
            );
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "TRACK_FAILED",
              apiErr?.message || "Failed to track page view",
              400
            );
          }
          if (config.onEvent) {
            await config.onEvent({ event_name: "page_viewed", session_id: pageViewResult?.session_id });
          }
          return successResponse({ tracked: pageViewResult?.tracked || 1, session_id: pageViewResult?.session_id });
        }
        default:
          return errorResponse("NOT_FOUND", `Unknown endpoint: ${path}`, 404);
      }
    } catch (err) {
      console.error("[ScaleMule Analytics] Error:", err);
      return successResponse({ tracked: 0 });
    }
  };
  return { POST };
}

// src/server/errors.ts
var ScaleMuleError = class extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "ScaleMuleError";
  }
};
var CODE_TO_STATUS = {
  // Auth (401)
  unauthorized: 401,
  invalid_credentials: 401,
  session_expired: 401,
  token_expired: 401,
  token_invalid: 401,
  // Forbidden (403)
  forbidden: 403,
  email_not_verified: 403,
  phone_not_verified: 403,
  account_locked: 403,
  account_disabled: 403,
  mfa_required: 403,
  csrf_error: 403,
  origin_not_allowed: 403,
  // Not found (404)
  not_found: 404,
  // Conflict (409)
  conflict: 409,
  email_taken: 409,
  // Rate limiting (429)
  rate_limited: 429,
  quota_exceeded: 429,
  // Validation (400)
  validation_error: 400,
  weak_password: 400,
  invalid_email: 400,
  invalid_otp: 400,
  otp_expired: 400,
  // Server (500)
  internal_error: 500,
  // Network — SDK-generated (502/504)
  network_error: 502,
  timeout: 504
};
function errorCodeToStatus(code) {
  return CODE_TO_STATUS[code.toLowerCase()] || 400;
}
function unwrap(result) {
  if (result !== null && result !== void 0 && typeof result === "object" && ("success" in result || "error" in result) && "data" in result) {
    const envelope = result;
    if (envelope.error || envelope.success === false) {
      const err = envelope.error;
      const code = err?.code || "UNKNOWN_ERROR";
      const status = err?.status || errorCodeToStatus(code);
      throw new ScaleMuleError(
        code,
        err?.message || "An error occurred",
        status,
        err?.details
      );
    }
    return envelope.data;
  }
  return result;
}

// src/server/handler.ts
function apiHandler(handler, options) {
  return async (request, routeContext) => {
    try {
      if (options?.csrf) {
        const csrfError = validateCSRFToken(request);
        if (csrfError) {
          throw new ScaleMuleError("CSRF_ERROR", csrfError, 403);
        }
      }
      let session;
      if (options?.auth) {
        session = await requireSession();
      }
      const rawParams = routeContext?.params ? await routeContext.params : {};
      const params = {};
      for (const [key, val] of Object.entries(rawParams)) {
        params[key] = Array.isArray(val) ? val.join("/") : val;
      }
      const context = {
        params,
        searchParams: request.nextUrl.searchParams,
        session
      };
      const result = await handler(request, context);
      if (result instanceof Response) return result;
      if (result !== void 0) {
        return Response.json({ success: true, data: result }, { status: 200 });
      }
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof ScaleMuleError) {
        if (options?.onError) {
          const custom = options.onError(error);
          if (custom) return custom;
        }
        return Response.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: error.status }
        );
      }
      if (error instanceof Response) return error;
      console.error("Unhandled API error:", error);
      return Response.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } },
        { status: 500 }
      );
    }
  };
}
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const providedSig = signature.slice(7);
  const expectedSig = crypto$1.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto$1.timingSafeEqual(
      Buffer.from(providedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}
function parseWebhookEvent(payload) {
  return JSON.parse(payload);
}
async function registerVideoWebhook(url, options) {
  const sm = createServerClient(options?.clientConfig);
  const result = await sm.webhooks.create({
    webhook_name: options?.name || "Video Status Webhook",
    url,
    events: options?.events || ["video.ready", "video.failed"]
  });
  return {
    id: result.id,
    secret: result.secret
  };
}
function createWebhookRoutes(config = {}) {
  const POST = async (request) => {
    const signature = request.headers.get("x-webhook-signature");
    const body = await request.text();
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    try {
      const event = parseWebhookEvent(body);
      switch (event.event) {
        case "video.ready":
          if (config.onVideoReady) {
            await config.onVideoReady(event.data);
          }
          break;
        case "video.failed":
          if (config.onVideoFailed) {
            await config.onVideoFailed(event.data);
          }
          break;
        case "video.uploaded":
          if (config.onVideoUploaded) {
            await config.onVideoUploaded(event.data);
          }
          break;
        case "video.transcoded":
          if (config.onVideoTranscoded) {
            await config.onVideoTranscoded(event.data);
          }
          break;
      }
      if (config.onEvent) {
        await config.onEvent(event);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Webhook handler error:", error);
      return new Response(JSON.stringify({ error: "Handler failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
  return { POST };
}

// src/server/webhook-handler.ts
function createWebhookHandler(config = {}) {
  return async (request) => {
    const signature = request.headers.get("x-webhook-signature");
    const body = await request.text();
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    try {
      const event = parseWebhookEvent(body);
      if (config.onEvent && event.event && config.onEvent[event.event]) {
        await config.onEvent[event.event](event);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
}
var _clients = /* @__PURE__ */ new Map();
var _initPromises = /* @__PURE__ */ new Map();
var _serverClient = null;
function getServerClient() {
  if (!_serverClient) {
    _serverClient = createServerClient();
  }
  return _serverClient;
}
var GATEWAY_URLS2 = {
  dev: "https://api-dev.scalemule.com",
  prod: "https://api.scalemule.com"
};
function resolveGatewayUrl2() {
  if (process.env.SCALEMULE_API_URL) return process.env.SCALEMULE_API_URL;
  const env = process.env.SCALEMULE_ENV || "prod";
  return GATEWAY_URLS2[env] || GATEWAY_URLS2.prod;
}
async function getFlagClient(environment) {
  const apiKey = process.env.SCALEMULE_API_KEY;
  const gatewayUrl = resolveGatewayUrl2();
  const key = `${environment}:${gatewayUrl}`;
  const existing = _clients.get(key);
  if (existing) return existing;
  const pending = _initPromises.get(key);
  if (pending) return pending;
  const promise = (async () => {
    const client = new server$1.FlagClient({ apiKey, environment, gatewayUrl });
    await Promise.race([
      client.init(),
      new Promise(
        (_, reject) => setTimeout(() => reject(new Error("FlagClient init timeout")), 3e3)
      )
    ]);
    _clients.set(key, client);
    return client;
  })();
  _initPromises.set(key, promise);
  try {
    return await promise;
  } catch (e) {
    _initPromises.delete(key);
    throw e;
  }
}
var _shutdownRegistered = false;
function ensureShutdownHook() {
  if (_shutdownRegistered) return;
  _shutdownRegistered = true;
  if (typeof process !== "undefined" && typeof process.once === "function") {
    process.once("SIGTERM", async () => {
      const shutdowns = Array.from(_clients.values()).map((c) => c.shutdown());
      await Promise.allSettled(shutdowns);
    });
  }
}
function extractClientIp(hdrs) {
  const realIp = hdrs.get("x-real-ip") || hdrs.get("x-real-client-ip");
  const forwardedFor = hdrs.get("x-forwarded-for");
  return realIp || (forwardedFor ? forwardedFor.split(",")[0].trim() : void 0);
}
async function getBootstrapFlags(flagKeys, environment = "prod", extraContext = {}, cacheTtlMs = 0) {
  try {
    const client = await getFlagClient(environment);
    ensureShutdownHook();
    const hdrs = await headers.headers();
    const clientIp = extractClientIp(hdrs);
    const context = { ...extraContext };
    if (clientIp) context.ip_address = clientIp;
    return client.evaluateBatch(flagKeys, context);
  } catch {
    try {
      const hdrs = await headers.headers();
      const clientIp = extractClientIp(hdrs);
      const context = { ...extraContext };
      if (clientIp) context.ip_address = clientIp;
      const result = await getServerClient().flags.evaluateBatch(flagKeys, context, environment);
      return result || {};
    } catch {
      return {};
    }
  }
}
function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}
function matchesPattern(pathname, patterns) {
  return patterns.some((pattern) => {
    if (pattern === pathname) return true;
    if (pattern.includes("*") || pattern.includes("?")) {
      return globToRegex(pattern).test(pathname);
    }
    if (pathname.startsWith(pattern + "/")) return true;
    return false;
  });
}
function createAuthMiddleware(config = {}) {
  const {
    protectedRoutes = [],
    publicRoutes = [],
    authOnlyPublic = [],
    redirectTo = "/login",
    redirectAuthenticated,
    skipValidation = false,
    onUnauthorized
  } = config;
  return async function middleware(request) {
    const { pathname } = request.nextUrl;
    if (pathname.startsWith("/api/auth")) {
      return server.NextResponse.next();
    }
    if (publicRoutes.length > 0 && matchesPattern(pathname, publicRoutes)) {
      if (redirectAuthenticated && authOnlyPublic.length > 0 && matchesPattern(pathname, authOnlyPublic)) {
        const session2 = getSessionFromRequest(request);
        if (session2) {
          return server.NextResponse.redirect(new URL(redirectAuthenticated, request.url));
        }
      }
      return server.NextResponse.next();
    }
    const requiresAuth = protectedRoutes.length === 0 || matchesPattern(pathname, protectedRoutes);
    if (!requiresAuth) {
      return server.NextResponse.next();
    }
    const session = getSessionFromRequest(request);
    if (!session) {
      if (onUnauthorized) {
        return onUnauthorized(request);
      }
      const redirectUrl = new URL(redirectTo, request.url);
      redirectUrl.searchParams.set("callbackUrl", pathname);
      return server.NextResponse.redirect(redirectUrl);
    }
    if (!skipValidation) {
      try {
        const sm = createServerClient();
        await sm.auth.me(session.sessionToken);
      } catch (error) {
        console.error("[ScaleMule Middleware] Session validation failed, blocking request:", error);
        const response = server.NextResponse.redirect(new URL(redirectTo, request.url));
        response.cookies.delete(SESSION_COOKIE_NAME);
        response.cookies.delete(USER_ID_COOKIE_NAME);
        return response;
      }
    }
    return server.NextResponse.next();
  };
}
function withAuth(config = {}) {
  const { redirectTo = "/login", onUnauthorized } = config;
  return function middleware(request) {
    const session = getSessionFromRequest(request);
    if (!session) {
      if (onUnauthorized) {
        return onUnauthorized(request);
      }
      const redirectUrl = new URL(redirectTo, request.url);
      redirectUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
      return server.NextResponse.redirect(redirectUrl);
    }
    return server.NextResponse.next();
  };
}
var OAUTH_STATE_COOKIE_NAME = "sm_oauth_state";
function setOAuthState(response, state) {
  response.cookies.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Lax allows the cookie to be sent on OAuth redirects
    path: "/",
    maxAge: 60 * 10
    // 10 minutes - OAuth flows should complete quickly
  });
  return response;
}
function validateOAuthState(request, callbackState) {
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;
  if (!cookieState) {
    return "Missing OAuth state cookie - session may have expired";
  }
  if (!callbackState) {
    return "Missing OAuth state in callback";
  }
  if (!constantTimeEqual(cookieState, callbackState)) {
    return "OAuth state mismatch - possible CSRF attack";
  }
  return void 0;
}
async function validateOAuthStateAsync(callbackState) {
  const cookieStore = await headers.cookies();
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;
  if (!cookieState) {
    return "Missing OAuth state cookie - session may have expired";
  }
  if (!callbackState) {
    return "Missing OAuth state in callback";
  }
  if (!constantTimeEqual(cookieState, callbackState)) {
    return "OAuth state mismatch - possible CSRF attack";
  }
  return void 0;
}
function clearOAuthState(response) {
  response.cookies.delete(OAUTH_STATE_COOKIE_NAME);
  return response;
}

// src/server/secrets.ts
var DEFAULT_CACHE_TTL_MS = 5 * 60 * 1e3;
var secretsCache = {};
var globalConfig = {};
function configureSecrets(config) {
  globalConfig = { ...globalConfig, ...config };
}
async function getAppSecret(key) {
  const cacheTtl = globalConfig.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const noCache = globalConfig.noCache ?? false;
  if (!noCache) {
    const cached = secretsCache[key];
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.value;
    }
  }
  try {
    const client = createServerClient();
    const result = await client.secrets.get(key);
    if (!noCache && result) {
      secretsCache[key] = {
        value: result.value,
        version: result.version,
        cachedAt: Date.now()
      };
    }
    return result?.value;
  } catch (error) {
    if (error instanceof ScaleMuleApiError && error.code === "SECRET_NOT_FOUND") {
      return void 0;
    }
    console.error(`[ScaleMule Secrets] Error fetching ${key}:`, error);
    return void 0;
  }
}
async function requireAppSecret(key) {
  const value = await getAppSecret(key);
  if (value === void 0) {
    throw new Error(
      `Required secret '${key}' not found in ScaleMule vault. Configure it in the ScaleMule dashboard or use the SDK: scalemule.secrets.set('${key}', value)`
    );
  }
  return value;
}
async function getAppSecretOrDefault(key, fallback) {
  const value = await getAppSecret(key);
  return value ?? fallback;
}
function invalidateSecretCache(key) {
  if (key) {
    delete secretsCache[key];
  } else {
    Object.keys(secretsCache).forEach((k) => delete secretsCache[k]);
  }
}
async function prefetchSecrets(keys) {
  await Promise.all(keys.map((key) => getAppSecret(key)));
}

// src/server/bundles.ts
var DEFAULT_CACHE_TTL_MS2 = 5 * 60 * 1e3;
var bundlesCache = {};
var globalConfig2 = {};
function configureBundles(config) {
  globalConfig2 = { ...globalConfig2, ...config };
}
async function getBundle(key, resolve = true) {
  const cacheTtl = globalConfig2.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS2;
  const noCache = globalConfig2.noCache ?? false;
  if (!noCache) {
    const cached = bundlesCache[key];
    if (cached && Date.now() - cached.cachedAt < cacheTtl) {
      return cached.data;
    }
  }
  try {
    const client = createServerClient();
    const result = await client.bundles.get(key, resolve);
    if (!noCache && result) {
      bundlesCache[key] = {
        type: result.type,
        data: result.data,
        version: result.version,
        inheritsFrom: result.inherits_from,
        cachedAt: Date.now()
      };
    }
    return result?.data;
  } catch (error) {
    if (error instanceof ScaleMuleApiError && error.code === "BUNDLE_NOT_FOUND") {
      return void 0;
    }
    console.error(`[ScaleMule Bundles] Error fetching ${key}:`, error);
    return void 0;
  }
}
async function requireBundle(key, resolve = true) {
  const value = await getBundle(key, resolve);
  if (value === void 0) {
    throw new Error(
      `Required bundle '${key}' not found in ScaleMule vault. Configure it in the ScaleMule dashboard`
    );
  }
  return value;
}
async function getMySqlBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, username, password, database, ssl_mode } = bundle;
  const encodedPassword = encodeURIComponent(password);
  let connectionUrl = `mysql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  if (ssl_mode) {
    connectionUrl += `?ssl_mode=${ssl_mode}`;
  }
  return { ...bundle, connectionUrl };
}
async function getPostgresBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, username, password, database, ssl_mode } = bundle;
  const encodedPassword = encodeURIComponent(password);
  let connectionUrl = `postgresql://${username}:${encodedPassword}@${host}:${port}/${database}`;
  if (ssl_mode) {
    connectionUrl += `?sslmode=${ssl_mode}`;
  }
  return { ...bundle, connectionUrl };
}
async function getRedisBundle(key) {
  const bundle = await getBundle(key);
  if (!bundle) return void 0;
  const { host, port, password, database, ssl } = bundle;
  let connectionUrl = ssl ? "rediss://" : "redis://";
  if (password) {
    connectionUrl += `:${encodeURIComponent(password)}@`;
  }
  connectionUrl += `${host}:${port}`;
  if (database !== void 0) {
    connectionUrl += `/${database}`;
  }
  return { ...bundle, connectionUrl };
}
async function getS3Bundle(key) {
  return getBundle(key);
}
async function getOAuthBundle(key) {
  return getBundle(key);
}
async function getSmtpBundle(key) {
  return getBundle(key);
}
function invalidateBundleCache(key) {
  if (key) {
    delete bundlesCache[key];
  } else {
    Object.keys(bundlesCache).forEach((k) => delete bundlesCache[k]);
  }
}
async function prefetchBundles(keys) {
  await Promise.all(keys.map((key) => getBundle(key)));
}

exports.CSRF_COOKIE_NAME = CSRF_COOKIE_NAME;
exports.CSRF_HEADER_NAME = CSRF_HEADER_NAME;
exports.OAUTH_STATE_COOKIE_NAME = OAUTH_STATE_COOKIE_NAME;
exports.SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
exports.ScaleMuleError = ScaleMuleError;
exports.ScaleMuleServer = ScaleMuleServer;
exports.USER_ID_COOKIE_NAME = USER_ID_COOKIE_NAME;
exports.apiHandler = apiHandler;
exports.buildClientContextHeaders = buildClientContextHeaders;
exports.clearOAuthState = clearOAuthState;
exports.clearSession = clearSession;
exports.configureBundles = configureBundles;
exports.configureSecrets = configureSecrets;
exports.createAnalyticsRoutes = createAnalyticsRoutes;
exports.createAuthMiddleware = createAuthMiddleware;
exports.createAuthRoutes = createAuthRoutes;
exports.createServerClient = createServerClient;
exports.createWebhookHandler = createWebhookHandler;
exports.createWebhookRoutes = createWebhookRoutes;
exports.errorCodeToStatus = errorCodeToStatus;
exports.extractClientContext = extractClientContext;
exports.extractClientContextFromReq = extractClientContextFromReq;
exports.generateCSRFToken = generateCSRFToken;
exports.getAppSecret = getAppSecret;
exports.getAppSecretOrDefault = getAppSecretOrDefault;
exports.getBootstrapFlags = getBootstrapFlags;
exports.getBundle = getBundle;
exports.getCSRFToken = getCSRFToken;
exports.getMySqlBundle = getMySqlBundle;
exports.getOAuthBundle = getOAuthBundle;
exports.getPostgresBundle = getPostgresBundle;
exports.getRedisBundle = getRedisBundle;
exports.getS3Bundle = getS3Bundle;
exports.getSession = getSession;
exports.getSessionFromRequest = getSessionFromRequest;
exports.getSmtpBundle = getSmtpBundle;
exports.invalidateBundleCache = invalidateBundleCache;
exports.invalidateSecretCache = invalidateSecretCache;
exports.parseWebhookEvent = parseWebhookEvent;
exports.prefetchBundles = prefetchBundles;
exports.prefetchSecrets = prefetchSecrets;
exports.registerVideoWebhook = registerVideoWebhook;
exports.requireAppSecret = requireAppSecret;
exports.requireBundle = requireBundle;
exports.requireSession = requireSession;
exports.resolveGatewayUrl = resolveGatewayUrl;
exports.setOAuthState = setOAuthState;
exports.unwrap = unwrap;
exports.validateCSRFToken = validateCSRFToken;
exports.validateCSRFTokenAsync = validateCSRFTokenAsync;
exports.validateOAuthState = validateOAuthState;
exports.validateOAuthStateAsync = validateOAuthStateAsync;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.withAuth = withAuth;
exports.withCSRFProtection = withCSRFProtection;
exports.withCSRFToken = withCSRFToken;
exports.withSession = withSession;
