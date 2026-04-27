/**
 * SDK-level error telemetry.
 *
 * The host app's global error collector (window.onerror,
 * unhandledrejection, React error boundary) never sees errors that the
 * application catches itself in a try/catch and surfaces as a UI
 * banner — even though those are exactly the errors customers
 * experience. This module ships a structured log entry for every
 * SDK-level failure so they show up in `/dashboard/logs` regardless
 * of how the caller handles them.
 *
 * Opt-in via `ScaleMuleConfig.telemetryEndpoint`. The provider calls
 * `setSdkTelemetryEndpoint()` once on mount; the SDK's HTTP layer
 * reads the module-scope value when reporting failures.
 */

let endpoint: string | undefined

export function setSdkTelemetryEndpoint(url: string | undefined): void {
  endpoint = url
}

export function getSdkTelemetryEndpoint(): string | undefined {
  return endpoint
}

export type SdkErrorPayload = {
  code: string
  message: string
  status?: number
  op: string
  path?: string
  field?: string
}

// Fire-and-forget — never blocks the caller, never throws. Uses
// `keepalive` so the request survives a page navigation that may
// follow the failed call.
export function reportSdkError(payload: SdkErrorPayload): void {
  if (!endpoint) return
  if (typeof fetch === 'undefined') return

  const body = JSON.stringify({
    logs: [
      {
        message: `${payload.code}: ${payload.message}`,
        metadata: {
          name: payload.code,
          source: 'scalemule-sdk',
          kind: 'sdk',
          op: payload.op,
          status: payload.status ?? null,
          path: payload.path ?? null,
          field: payload.field ?? null,
          route:
            typeof window !== 'undefined' ? window.location.pathname : null,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  })

  try {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // swallow — telemetry must never break the calling flow
    })
  } catch {
    // swallow — telemetry must never break the calling flow
  }
}
