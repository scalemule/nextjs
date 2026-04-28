import { LedveryClient } from '@scalemule/ledvery'
import type { Session as LedverySession, IdTokenClaims } from '@scalemule/ledvery'
import {
  setLedveryFlowCookies,
  validateAndConsumeLedveryFlowCookies,
  setLedverySession,
  getLedverySession,
  clearLedverySession,
  clearLedveryFlowCookies,
} from './ledvery-cookies'
import { validateSafeRedirect } from './redirect'
import type { SessionCookieOverrides, LedverySessionData } from './ledvery-cookies'

export interface LedveryRoutesConfig {
  issuer: string
  clientId: string
  clientSecret?: string
  redirectUri: string
  defaultScope?: string
  postLoginRedirect?: string
  postLogoutRedirect?: string
  cookies?: SessionCookieOverrides
  storeAccessToken?: boolean
  fetch?: typeof fetch
  gatewayUrl?: string
}

type RouteHandler = (
  request: Request,
  context: { params: Promise<{ action?: string[] }> }
) => Promise<Response>

export function createLedveryRoutes(config: LedveryRoutesConfig): { GET: RouteHandler; POST: RouteHandler } {
  const client = new LedveryClient({
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
    fetch: config.fetch,
  })

  const postLoginRedirect = config.postLoginRedirect || '/'
  const postLogoutRedirect = config.postLogoutRedirect || '/'
  const defaultScope = config.defaultScope || 'openid email profile'

  async function handleLogin(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const returnTo = url.searchParams.get('returnTo')
    const validatedReturnTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect })

    const authResult = await client.createAuthorizationUrl({
      scope: defaultScope,
    })

    const response = new Response(null, {
      status: 302,
      headers: { Location: authResult.url },
    })

    setLedveryFlowCookies(response, {
      state: authResult.state,
      codeVerifier: authResult.codeVerifier,
      nonce: authResult.nonce,
    })

    if (validatedReturnTo !== postLoginRedirect) {
      response.headers.append(
        'Set-Cookie',
        `sm_ledvery_return_to=${encodeURIComponent(validatedReturnTo)}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
      )
    }

    return response
  }

  async function handleCallback(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const callbackState = url.searchParams.get('state')

    if (!code) {
      const error = url.searchParams.get('error')
      const errorDesc = url.searchParams.get('error_description')
      return new Response(
        JSON.stringify({ error: error || 'missing_code', message: errorDesc || 'No authorization code in callback' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const flowResult = validateAndConsumeLedveryFlowCookies(request, callbackState)
    if (typeof flowResult === 'string') {
      return new Response(
        JSON.stringify({ error: 'state_mismatch', message: flowResult }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    let session: LedverySession
    try {
      session = await client.exchangeCode({
        code,
        codeVerifier: flowResult.codeVerifier,
        receivedState: callbackState!,
        expectedState: getCookieValue(request, 'sm_ledvery_state')!,
        expectedNonce: flowResult.nonce,
      })
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'code_exchange_failed', message: err instanceof Error ? err.message : 'Code exchange failed' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const returnTo = getCookieValue(request, 'sm_ledvery_return_to')
    const redirectTo = validateSafeRedirect(returnTo, { defaultPath: postLoginRedirect })

    const response = new Response(null, {
      status: 302,
      headers: { Location: redirectTo },
    })

    setLedverySession(response, {
      idToken: session.idToken,
      accessToken: session.accessToken,
      claims: session.claims as unknown as Record<string, unknown>,
      expiresAt: session.expiresAt.toISOString(),
    }, {
      storeAccessToken: config.storeAccessToken,
      cookies: config.cookies,
    })

    clearLedveryFlowCookies(response)
    // Clear returnTo cookie
    response.headers.append('Set-Cookie', 'sm_ledvery_return_to=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax')

    return response
  }

  function handleSession(request: Request): Response {
    const session = getLedverySession(request)

    if (!session) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(session.expiresAt)
    if (expiresAt <= new Date()) {
      return new Response(JSON.stringify({ session: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        session: {
          sub: session.claims.sub as string,
          email: session.claims.email,
          email_verified: session.claims.email_verified,
          name: session.claims.name,
          idp: session.claims.idp,
          expiresAt: session.expiresAt,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }

  function handleLogout(_request: Request): Response {
    if (config.gatewayUrl) {
      const rpLogoutUrl = `${config.gatewayUrl}/v1/auth/oauth/ledvery/logout?post_logout_redirect_uri=${encodeURIComponent(postLogoutRedirect)}`
      const response = new Response(null, {
        status: 302,
        headers: { Location: rpLogoutUrl },
      })
      clearLedverySession(response)
      return response
    }

    const response = new Response(null, {
      status: 302,
      headers: { Location: postLogoutRedirect },
    })
    clearLedverySession(response)
    return response
  }

  async function handler(request: Request, context: { params: Promise<{ action?: string[] }> }): Promise<Response> {
    const params = await context.params
    const action = params.action?.[0] || ''

    switch (action) {
      case 'login':
        return handleLogin(request)
      case 'callback':
        return handleCallback(request)
      case 'session':
        return handleSession(request)
      case 'logout':
        return handleLogout(request)
      default:
        return new Response(
          JSON.stringify({ error: 'not_found', message: `Unknown Ledvery route: ${action}` }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
    }
  }

  return {
    GET: handler,
    POST: handler,
  }
}

function getCookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') || ''
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export { getLedverySession } from './ledvery-cookies'
export type { LedverySessionData } from './ledvery-cookies'
