'use strict';

var ledvery = require('@scalemule/ledvery');

// src/server/ledvery.ts

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

// src/server/ledvery-cookies.ts
var SM_LEDVERY_STATE_COOKIE = "sm_ledvery_state";
var SM_LEDVERY_PKCE_VERIFIER_COOKIE = "sm_ledvery_pkce_verifier";
var SM_LEDVERY_NONCE_COOKIE = "sm_ledvery_nonce";
var SM_LEDVERY_ID_TOKEN_COOKIE = "sm_ledvery_id_token";
var SM_LEDVERY_ACCESS_TOKEN_COOKIE = "sm_ledvery_access_token";
var FLOW_COOKIE_MAX_AGE = 60 * 10;
var SESSION_COOKIE_MAX_AGE = 60 * 60;
function flowCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: FLOW_COOKIE_MAX_AGE
  };
}
function sessionCookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAge ? Math.min(maxAge, SESSION_COOKIE_MAX_AGE) : SESSION_COOKIE_MAX_AGE
  };
}
function setLedveryFlowCookies(response, params) {
  const opts = flowCookieOptions();
  setCookie(response, SM_LEDVERY_STATE_COOKIE, params.state, opts);
  setCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE, params.codeVerifier, opts);
  setCookie(response, SM_LEDVERY_NONCE_COOKIE, params.nonce, opts);
}
function validateAndConsumeLedveryFlowCookies(request, callbackState) {
  const cookieState = getCookie(request, SM_LEDVERY_STATE_COOKIE);
  const codeVerifier = getCookie(request, SM_LEDVERY_PKCE_VERIFIER_COOKIE);
  const nonce = getCookie(request, SM_LEDVERY_NONCE_COOKIE);
  if (!cookieState) return "Missing Ledvery state cookie - session may have expired";
  if (!callbackState) return "Missing state parameter in callback";
  if (!constantTimeEqual(cookieState, callbackState)) return "Ledvery state mismatch - possible CSRF attack";
  if (!codeVerifier) return "Missing PKCE verifier cookie";
  if (!nonce) return "Missing nonce cookie";
  return { codeVerifier, nonce };
}
function setLedverySession(response, session, opts) {
  const cookieOpts = sessionCookieOptions(opts?.cookies?.maxAge);
  if (opts?.cookies?.domain) cookieOpts.domain = opts.cookies.domain;
  if (opts?.cookies?.path) cookieOpts.path = opts.cookies.path;
  if (opts?.cookies?.sameSite) cookieOpts.sameSite = opts.cookies.sameSite;
  if (opts?.cookies?.secure !== void 0) cookieOpts.secure = opts.cookies.secure;
  const sessionPayload = JSON.stringify({
    idToken: session.idToken,
    claims: session.claims,
    expiresAt: session.expiresAt
  });
  setCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE, sessionPayload, cookieOpts);
  if (opts?.storeAccessToken && session.accessToken) {
    setCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE, session.accessToken, cookieOpts);
  }
}
function getLedverySession(request) {
  const raw = getCookie(request, SM_LEDVERY_ID_TOKEN_COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      idToken: parsed.idToken || "",
      claims: parsed.claims,
      expiresAt: parsed.expiresAt
    };
  } catch {
    return null;
  }
}
function clearLedverySession(response) {
  deleteCookie(response, SM_LEDVERY_ID_TOKEN_COOKIE);
  deleteCookie(response, SM_LEDVERY_ACCESS_TOKEN_COOKIE);
}
function clearLedveryFlowCookies(response) {
  deleteCookie(response, SM_LEDVERY_STATE_COOKIE);
  deleteCookie(response, SM_LEDVERY_PKCE_VERIFIER_COOKIE);
  deleteCookie(response, SM_LEDVERY_NONCE_COOKIE);
}
function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
}
function setCookie(response, name, value, opts) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    `SameSite=${opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1)}`
  ];
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  response.headers.append("Set-Cookie", parts.join("; "));
}
function deleteCookie(response, name) {
  response.headers.append("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// src/server/redirect.ts
function normalizeOrigin(origin) {
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}
function isSafeSchemeRelative(input) {
  return !(input.startsWith("//") || input.startsWith("\\"));
}
function validateSafeRedirect(input, opts = {}) {
  const defaultPath = opts.defaultPath ?? "/";
  if (!input || typeof input !== "string") return defaultPath;
  const trimmed = input.trim();
  if (!trimmed) return defaultPath;
  if (!isSafeSchemeRelative(trimmed)) return defaultPath;
  const colon = trimmed.indexOf(":");
  if (colon > 0 && colon < 15) {
    const scheme = trimmed.slice(0, colon).toLowerCase();
    if (/^[a-z][a-z0-9+.-]*$/.test(scheme) && scheme !== "http" && scheme !== "https") {
      return defaultPath;
    }
  }
  if (trimmed.startsWith("/")) {
    if (trimmed.length > 1 && trimmed[1] === "\\") return defaultPath;
    return trimmed;
  }
  const allowed = (opts.allowedOrigins ?? []).map(normalizeOrigin).filter((o) => o !== null);
  try {
    const parsed = new URL(trimmed);
    const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    if (!allowed.includes(origin)) return defaultPath;
    if (opts.stripSameOriginHost !== false) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
    }
    return trimmed;
  } catch {
    return defaultPath;
  }
}

// src/server/ledvery.ts
function createLedveryRoutes(config) {
  const client = new ledvery.LedveryClient({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    fetch: config.fetch
  });
  const postLoginRedirect = config.postLoginRedirect || "/";
  const postLogoutRedirect = config.postLogoutRedirect || "/";
  const defaultScope = config.defaultScope || "openid email profile";
  async function handleLogin(request) {
    const url = new URL(request.url);
    const returnTo = url.searchParams.get("returnTo");
    const validatedReturnTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect });
    const authResult = await client.createAuthorizationUrl({
      scope: defaultScope
    });
    const response = new Response(null, {
      status: 302,
      headers: { Location: authResult.url }
    });
    setLedveryFlowCookies(response, {
      state: authResult.state,
      codeVerifier: authResult.codeVerifier,
      nonce: authResult.nonce
    });
    if (validatedReturnTo !== postLoginRedirect) {
      response.headers.append(
        "Set-Cookie",
        `sm_ledvery_return_to=${encodeURIComponent(validatedReturnTo)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
      );
    }
    return response;
  }
  async function handleCallback(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const callbackState = url.searchParams.get("state");
    if (!code) {
      const error = url.searchParams.get("error");
      const errorDesc = url.searchParams.get("error_description");
      return new Response(
        JSON.stringify({ error: error || "missing_code", message: errorDesc || "No authorization code in callback" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    const flowResult = validateAndConsumeLedveryFlowCookies(request, callbackState);
    if (typeof flowResult === "string") {
      return new Response(
        JSON.stringify({ error: "state_mismatch", message: flowResult }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    let session;
    try {
      session = await client.exchangeCode({
        code,
        codeVerifier: flowResult.codeVerifier,
        receivedState: callbackState,
        expectedState: getCookieValue(request, "sm_ledvery_state"),
        expectedNonce: flowResult.nonce
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "code_exchange_failed", message: err instanceof Error ? err.message : "Code exchange failed" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    const returnTo = getCookieValue(request, "sm_ledvery_return_to");
    const redirectTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect });
    const response = new Response(null, {
      status: 302,
      headers: { Location: redirectTo }
    });
    setLedverySession(response, {
      idToken: session.idToken,
      accessToken: session.accessToken,
      claims: session.claims,
      expiresAt: session.expiresAt.toISOString()
    }, {
      storeAccessToken: config.storeAccessToken,
      cookies: config.cookies
    });
    clearLedveryFlowCookies(response);
    response.headers.append("Set-Cookie", "sm_ledvery_return_to=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return response;
  }
  function handleSession(request) {
    const session = getLedverySession(request);
    if (!session) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt <= /* @__PURE__ */ new Date()) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(
      JSON.stringify({
        session: {
          sub: session.claims.sub,
          email: session.claims.email,
          email_verified: session.claims.email_verified,
          name: session.claims.name,
          idp: session.claims.idp,
          expiresAt: session.expiresAt
        }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  function handleLogout(request) {
    const session = getLedverySession(request);
    const idToken = session?.idToken;
    if (config.gatewayUrl) {
      let rpLogoutUrl = `${config.gatewayUrl}/v1/auth/oauth/ledvery/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`;
      if (idToken) {
        rpLogoutUrl += `&id_token_hint=${encodeURIComponent(idToken)}`;
      }
      const response2 = new Response(null, {
        status: 302,
        headers: { Location: rpLogoutUrl }
      });
      clearLedverySession(response2);
      return response2;
    }
    const response = new Response(null, {
      status: 302,
      headers: { Location: postLogoutRedirect }
    });
    clearLedverySession(response);
    return response;
  }
  async function handler(request, context) {
    const params = await context.params;
    const action = params.action?.[0] || "";
    switch (action) {
      case "login":
        return handleLogin(request);
      case "callback":
        return handleCallback(request);
      case "session":
        return handleSession(request);
      case "logout":
        return handleLogout(request);
      default:
        return new Response(
          JSON.stringify({ error: "not_found", message: `Unknown Ledvery route: ${action}` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
    }
  }
  return {
    GET: handler,
    POST: handler
  };
}
function getCookieValue(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : void 0;
}

exports.createLedveryRoutes = createLedveryRoutes;
exports.getLedverySession = getLedverySession;
