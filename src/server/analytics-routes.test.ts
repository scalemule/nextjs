import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTrackEvent = vi.fn()
const mockTrackBatch = vi.fn()
const mockTrackPageView = vi.fn()
const mockFlagEvaluate = vi.fn()

vi.mock('./client', () => ({
  createServerClient: () => ({
    analytics: {
      trackEvent: mockTrackEvent,
      trackBatch: mockTrackBatch,
      trackPageView: mockTrackPageView,
    },
    flags: {
      evaluate: mockFlagEvaluate,
    },
  }),
}))

import { createAnalyticsRoutes } from './routes'

function createAnalyticsRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return new Request(`https://example.com/api/analytics/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function analyticsContext(path?: string) {
  return {
    params: Promise.resolve(path ? { scalemule: [path] } : {}),
  }
}

describe('createAnalyticsRoutes trackingGate', () => {
  beforeEach(() => {
    mockTrackEvent.mockReset()
    mockTrackBatch.mockReset()
    mockTrackPageView.mockReset()
    mockFlagEvaluate.mockReset()
  })

  it('suppresses proxied tracking when the gate evaluates false for the client IP', async () => {
    mockFlagEvaluate.mockResolvedValue({
      flag_id: 'flag_1',
      flag_key: 'analytics.tracking_enabled',
      environment: 'prod',
      value: false,
      reason: 'matched_rule',
    })

    const { POST } = createAnalyticsRoutes({
      simpleProxy: true,
      trackingGate: { flagKey: 'analytics.tracking_enabled' },
    })

    const response = await POST(
      createAnalyticsRequest(
        'event',
        { event_name: 'cta_clicked', user_id: 'user-123' },
        { 'x-forwarded-for': '73.170.229.202, 10.0.0.1' }
      ),
      analyticsContext() as never
    )

    expect(mockFlagEvaluate).toHaveBeenCalledWith(
      'analytics.tracking_enabled',
      expect.objectContaining({
        ip_address: '73.170.229.202',
        user_id: 'user-123',
        event_name: 'cta_clicked',
      }),
      'prod',
      { clientContext: expect.objectContaining({ ip: '73.170.229.202' }) }
    )
    expect(mockTrackEvent).not.toHaveBeenCalled()
    expect(response.status).toBe(202)

    const payload = await response.json()
    expect(payload.success).toBe(true)
    expect(payload.data).toEqual({ tracked: 0, suppressed: true })
  })

  it('tracks when the gate evaluates true', async () => {
    mockFlagEvaluate.mockResolvedValue({
      flag_id: 'flag_1',
      flag_key: 'analytics.tracking_enabled',
      environment: 'prod',
      value: true,
      reason: 'default',
    })
    mockTrackEvent.mockResolvedValue({ tracked: 1, session_id: 'sess_123' })

    const { POST } = createAnalyticsRoutes({
      simpleProxy: true,
      trackingGate: { flagKey: 'analytics.tracking_enabled' },
    })

    const response = await POST(
      createAnalyticsRequest(
        'event',
        { event_name: 'cta_clicked', anonymous_id: 'anon_1' },
        { 'cf-connecting-ip': '8.8.8.8' }
      ),
      analyticsContext() as never
    )

    expect(mockTrackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_name: 'cta_clicked', anonymous_id: 'anon_1' }),
      { clientContext: expect.objectContaining({ ip: '8.8.8.8' }) }
    )

    const payload = await response.json()
    expect(payload.data).toEqual({ tracked: 1, session_id: 'sess_123' })
  })

  it('fails open when flag evaluation errors', async () => {
    mockFlagEvaluate.mockRejectedValue(new Error('flag service unavailable'))
    mockTrackEvent.mockResolvedValue({ tracked: 1, session_id: 'sess_open' })

    const { POST } = createAnalyticsRoutes({
      simpleProxy: true,
      trackingGate: { flagKey: 'analytics.tracking_enabled' },
    })

    await POST(
      createAnalyticsRequest('event', { event_name: 'cta_clicked' }, { 'x-real-ip': '9.9.9.9' }),
      analyticsContext() as never
    )

    expect(mockTrackEvent).toHaveBeenCalledTimes(1)
  })

  it('supports a custom gate context and environment on page view routes', async () => {
    mockFlagEvaluate.mockResolvedValue({
      flag_id: 'flag_1',
      flag_key: 'analytics.tracking_enabled',
      environment: 'staging',
      value: false,
      reason: 'matched_rule',
    })

    const buildContext = vi.fn(({ body, clientContext }) => ({
      ip_address: clientContext.ip,
      page_url: body.page_url,
      tenant: 'tenant_1',
    }))

    const { POST } = createAnalyticsRoutes({
      trackingGate: {
        flagKey: 'analytics.tracking_enabled',
        environment: 'staging',
        buildContext,
      },
    })

    const response = await POST(
      createAnalyticsRequest(
        'page-view',
        { page_url: 'https://example.com/feed', user_id: 'user-123' },
        { 'x-real-ip': '1.1.1.1' }
      ),
      analyticsContext('page-view') as never
    )

    expect(buildContext).toHaveBeenCalled()
    expect(mockFlagEvaluate).toHaveBeenCalledWith(
      'analytics.tracking_enabled',
      { ip_address: '1.1.1.1', page_url: 'https://example.com/feed', tenant: 'tenant_1' },
      'staging',
      { clientContext: expect.objectContaining({ ip: '1.1.1.1' }) }
    )
    expect(mockTrackPageView).not.toHaveBeenCalled()
    expect(response.status).toBe(202)
  })
})
