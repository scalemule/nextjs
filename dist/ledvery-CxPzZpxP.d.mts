declare const SM_LEDVERY_STATE_COOKIE = "sm_ledvery_state";
declare const SM_LEDVERY_PKCE_VERIFIER_COOKIE = "sm_ledvery_pkce_verifier";
declare const SM_LEDVERY_NONCE_COOKIE = "sm_ledvery_nonce";
declare const SM_LEDVERY_ID_TOKEN_COOKIE = "sm_ledvery_id_token";
declare const SM_LEDVERY_ACCESS_TOKEN_COOKIE = "sm_ledvery_access_token";
interface SessionCookieOverrides {
    maxAge?: number;
    domain?: string;
    path?: string;
    sameSite?: 'strict' | 'lax' | 'none';
    secure?: boolean;
}
interface LedverySessionData {
    idToken: string;
    accessToken?: string;
    claims: Record<string, unknown>;
    expiresAt: string;
}
declare function getLedverySession(request: Request): LedverySessionData | null;

interface LedveryRoutesConfig {
    issuer: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    defaultScope?: string;
    postLoginRedirect?: string;
    postLogoutRedirect?: string;
    cookies?: SessionCookieOverrides;
    storeAccessToken?: boolean;
    fetch?: typeof fetch;
    gatewayUrl?: string;
}
type RouteHandler = (request: Request, context: {
    params: Promise<{
        action?: string[];
    }>;
}) => Promise<Response>;
declare function createLedveryRoutes(config: LedveryRoutesConfig): {
    GET: RouteHandler;
    POST: RouteHandler;
};

export { type LedveryRoutesConfig as L, SM_LEDVERY_ACCESS_TOKEN_COOKIE as S, type LedverySessionData as a, SM_LEDVERY_ID_TOKEN_COOKIE as b, SM_LEDVERY_NONCE_COOKIE as c, SM_LEDVERY_PKCE_VERIFIER_COOKIE as d, SM_LEDVERY_STATE_COOKIE as e, createLedveryRoutes as f, getLedverySession as g };
