'use strict';

var headers = require('next/headers');
require('next/server');

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
  const headers = request.headers;
  let ip;
  const cfConnectingIp = headers.get("cf-connecting-ip");
  if (cfConnectingIp) {
    ip = validateIP(cfConnectingIp);
  }
  if (!ip) {
    const doConnectingIp = headers.get("do-connecting-ip");
    if (doConnectingIp) {
      ip = validateIP(doConnectingIp);
    }
  }
  if (!ip) {
    const realIp = headers.get("x-real-ip");
    if (realIp) {
      ip = validateIP(realIp);
    }
  }
  if (!ip) {
    const forwardedFor = headers.get("x-forwarded-for");
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const vercelForwarded = headers.get("x-vercel-forwarded-for");
    if (vercelForwarded) {
      const firstIp = vercelForwarded.split(",")[0]?.trim();
      ip = validateIP(firstIp);
    }
  }
  if (!ip) {
    const trueClientIp = headers.get("true-client-ip");
    if (trueClientIp) {
      ip = validateIP(trueClientIp);
    }
  }
  if (!ip && request.ip) {
    ip = validateIP(request.ip);
  }
  const userAgent = headers.get("user-agent") || void 0;
  const deviceFingerprint = headers.get("x-device-fingerprint") || void 0;
  const referrer = headers.get("referer") || void 0;
  return {
    ip,
    userAgent,
    deviceFingerprint,
    referrer
  };
}
function buildClientContextHeaders(context) {
  const headers = {};
  if (!context) {
    return headers;
  }
  if (context.ip) {
    headers["x-sm-forwarded-client-ip"] = context.ip;
    headers["X-Client-IP"] = context.ip;
  }
  if (context.userAgent) {
    headers["X-Client-User-Agent"] = context.userAgent;
  }
  if (context.deviceFingerprint) {
    headers["X-Client-Device-Fingerprint"] = context.deviceFingerprint;
  }
  if (context.referrer) {
    headers["X-Client-Referrer"] = context.referrer;
  }
  return headers;
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
        const headers = {
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
            headers,
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
    const headers = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      // Forward client context headers if provided
      ...buildClientContextHeaders(options.clientContext)
    };
    if (options.sessionToken) {
      headers["Authorization"] = `Bearer ${options.sessionToken}`;
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
        headers,
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
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, loginResponse.session_token, options)
  );
  headers.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, loginResponse.user.id, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers
  });
}
function withRefreshedSession(sessionToken, userId, responseBody, options = {}) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.append(
    "Set-Cookie",
    createCookieHeader(SESSION_COOKIE_NAME, sessionToken, options)
  );
  headers.append(
    "Set-Cookie",
    createCookieHeader(USER_ID_COOKIE_NAME, userId, options)
  );
  return new Response(JSON.stringify({ success: true, data: responseBody }), {
    status: 200,
    headers
  });
}
function clearSession(responseBody, options = {}, status = 200) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.append("Set-Cookie", createClearCookieHeader(SESSION_COOKIE_NAME, options));
  headers.append("Set-Cookie", createClearCookieHeader(USER_ID_COOKIE_NAME, options));
  return new Response(JSON.stringify({ success: status < 300, data: responseBody }), {
    status,
    headers
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
  const POST2 = async (request, context) => {
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
          let verifyData;
          try {
            verifyData = await sm.auth.verifyEmail(token);
          } catch (err) {
            const apiErr = err instanceof ScaleMuleApiError ? err : null;
            return errorResponse(
              apiErr?.code || "VERIFY_FAILED",
              apiErr?.message || "Email verification failed",
              400
            );
          }
          if (verifyData?.session_token && verifyData?.user) {
            return withSession(
              { session_token: verifyData.session_token, user: verifyData.user },
              { message: "Email verified successfully", verified: true, user: verifyData.user, sessionToken: verifyData.session_token, userId: verifyData.user.id },
              cookieOptions
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
  const GET2 = async (request, context) => {
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
  const DELETE2 = async (request, context) => {
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
  const PATCH2 = async (request, context) => {
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
  return { GET: GET2, POST: POST2, DELETE: DELETE2, PATCH: PATCH2 };
}

// src/server/auth.ts
var cookieDomain = typeof process !== "undefined" ? process.env.SCALEMULE_COOKIE_DOMAIN : void 0;
var handlers = createAuthRoutes({
  cookies: cookieDomain ? { domain: cookieDomain } : void 0
});
var { GET, POST, DELETE, PATCH } = handlers;

exports.DELETE = DELETE;
exports.GET = GET;
exports.PATCH = PATCH;
exports.POST = POST;
