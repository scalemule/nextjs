'use client'

import { useEffect, useState, type CSSProperties, type ReactElement } from 'react'
import { useFeedback } from '../hooks/useFeedback'
import { useScaleMule } from '../provider'
import type { FeedbackItem, FeedbackType, FeedbackWidgetConfig } from '../types/feedback'

export interface FeedbackWidgetProps {
  /** Floating-button corner. Default `bottom-right`. */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
  /** Default selected type when the modal opens. Default `feature_request`. */
  defaultType?: FeedbackType
  /** Restrict the type select to this subset. Default: all four types. */
  allowedTypes?: FeedbackType[]
  /** Trigger button label. Default `Feedback`. */
  triggerLabel?: string
  /** `light`/`dark`/`auto` (matches OS). Default `auto`. */
  theme?: 'light' | 'dark' | 'auto'
  /** Optional class for the trigger button (use to override styling). */
  className?: string
  /** Show the 1–5 star rating row. Default `true`. Rating is stored as a
   *  `rating:N` tag on the feedback item — staff can filter on it from the
   *  dashboard inbox. Optional per submission; users who skip it just submit
   *  without a rating. */
  enableRating?: boolean
  /** Label for the rating row when enabled. Default `How would you rate
   *  your experience?`. */
  ratingLabel?: string
  /** Called after a successful submit. */
  onSubmitted?: (item: FeedbackItem) => void
}

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug_report: 'Bug',
  feature_request: 'Feature request',
  improvement: 'Improvement',
  other: 'Other',
}

const POSITION_STYLES: Record<NonNullable<FeedbackWidgetProps['position']>, CSSProperties> = {
  'bottom-right': { bottom: 24, right: 24 },
  'bottom-left': { bottom: 24, left: 24 },
  'top-right': { top: 24, right: 24 },
  'top-left': { top: 24, left: 24 },
}

const STYLES = {
  trigger: {
    position: 'fixed',
    zIndex: 999_998,
    padding: '10px 16px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 999,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    background: '#1f2937',
    color: '#fff',
  } as CSSProperties,
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.5)',
    zIndex: 999_999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  } as CSSProperties,
  modal: {
    width: 'min(440px, 100%)',
    background: '#fff',
    color: '#0f172a',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  } as CSSProperties,
  modalDark: {
    background: '#0f172a',
    color: '#f8fafc',
  } as CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
  } as CSSProperties,
  field: {
    width: '100%',
    padding: '8px 10px',
    fontSize: 14,
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    boxSizing: 'border-box',
    background: 'transparent',
    color: 'inherit',
  } as CSSProperties,
  textarea: {
    minHeight: 96,
    resize: 'vertical',
  } as CSSProperties,
  rowEnd: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
  } as CSSProperties,
  primaryBtn: {
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    background: '#2563eb',
    color: '#fff',
    cursor: 'pointer',
  } as CSSProperties,
  secondaryBtn: {
    padding: '8px 14px',
    fontSize: 14,
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
  } as CSSProperties,
  error: {
    fontSize: 13,
    color: '#dc2626',
  } as CSSProperties,
  note: {
    fontSize: 13,
    color: '#475569',
  } as CSSProperties,
  success: {
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'center',
    padding: '24px 8px',
  } as CSSProperties,
}

const ALL_TYPES: FeedbackType[] = ['bug_report', 'feature_request', 'improvement', 'other']

/**
 * Floating feedback widget. Renders nothing until the trigger is clicked,
 * then opens a small modal with type / title / description fields. Submits
 * via `useFeedback().submit()` — inherits identity from `ScaleMuleProvider`.
 *
 * If the end-user is not signed in, the widget shows an additional `email`
 * field (required by the service for anonymous submissions).
 *
 * Tenant must have `feedback_app_config.enabled = TRUE` for `/submit` to
 * accept submissions; otherwise the service responds with 404
 * `FEEDBACK_DISABLED` and the widget surfaces the error message.
 */
export function FeedbackWidget(props: FeedbackWidgetProps): ReactElement | null {
  const sm = useScaleMule()
  const { client } = sm
  const { submit } = useFeedback({ enabled: false })
  const [serverConfig, setServerConfig] = useState<FeedbackWidgetConfig | null>(null)
  const [configLoaded, setConfigLoaded] = useState(false)

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<FeedbackType>('feature_request')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [hoverRating, setHoverRating] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const signedIn = Boolean(sm.user)
  const resolvedAllowedTypes = props.allowedTypes ?? serverConfig?.allowed_types ?? ALL_TYPES
  const resolvedDefaultType =
    (props.defaultType && resolvedAllowedTypes.includes(props.defaultType)
      ? props.defaultType
      : resolvedAllowedTypes[0]) ?? 'feature_request'
  const resolvedPosition = props.position ?? serverConfig?.widget_position ?? 'bottom-right'
  const resolvedTheme = props.theme ?? serverConfig?.widget_theme ?? 'auto'
  const allowAnonymous = serverConfig?.allow_anonymous ?? true
  const anonymousBlocked = !signedIn && !allowAnonymous

  useEffect(() => {
    let active = true

    client
      .get<FeedbackWidgetConfig>('/v1/feedback/widget-config')
      .then((config) => {
        if (active) setServerConfig(config)
      })
      .catch(() => {
        if (active) setServerConfig(null)
      })
      .finally(() => {
        if (active) setConfigLoaded(true)
      })

    return () => {
      active = false
    }
  }, [client])

  useEffect(() => {
    setType((current) =>
      resolvedAllowedTypes.includes(current) ? current : resolvedDefaultType
    )
  }, [resolvedAllowedTypes, resolvedDefaultType])

  if (!configLoaded) {
    return null
  }
  if (serverConfig && !serverConfig.enabled) {
    return null
  }

  function reset() {
    setType(resolvedDefaultType)
    setTitle('')
    setDescription('')
    setEmail('')
    setRating(null)
    setHoverRating(null)
    setErrMsg(null)
    setDone(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim()) return
    if (anonymousBlocked) {
      setErrMsg('Please sign in to send feedback for this app')
      return
    }
    if (!signedIn && !email.trim()) {
      setErrMsg('email is required when not signed in')
      return
    }
    setSubmitting(true)
    setErrMsg(null)
    try {
      const tags = rating != null ? [`rating:${rating}`] : undefined
      const item = await submit({
        type,
        title: title.trim(),
        description: description.trim(),
        email: signedIn ? undefined : email.trim() || undefined,
        tags,
      })
      setDone(true)
      props.onSubmitted?.(item)
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Submit failed'
      setErrMsg(message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose() {
    setOpen(false)
    // Defer reset so the closing animation/state stays clean.
    setTimeout(reset, 200)
  }

  const dark =
    resolvedTheme === 'dark' ||
    (resolvedTheme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={props.className}
        style={{ ...STYLES.trigger, ...POSITION_STYLES[resolvedPosition] }}
      >
        {props.triggerLabel ?? 'Feedback'}
      </button>

      {open && (
        <div role="dialog" aria-modal="true" style={STYLES.overlay} onClick={handleClose}>
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            style={{ ...STYLES.modal, ...(dark ? STYLES.modalDark : null) }}
          >
            {done ? (
              <>
                <div style={STYLES.success}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
                  <div>Thanks — we got it.</div>
                </div>
                <div style={STYLES.rowEnd}>
                  <button type="button" style={STYLES.primaryBtn} onClick={handleClose}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 16 }}>Send feedback</strong>
                  <button
                    type="button"
                    onClick={handleClose}
                    aria-label="Close"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: 18,
                      cursor: 'pointer',
                      color: 'inherit',
                    }}
                  >
                    ×
                  </button>
                </div>

                {props.enableRating !== false && (
                  <div>
                    <div style={STYLES.label}>
                      {props.ratingLabel ?? 'How would you rate your experience?'}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const active = (hoverRating ?? rating ?? 0) >= n
                        return (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${n} star${n === 1 ? '' : 's'}`}
                            onClick={() => setRating(rating === n ? null : n)}
                            onMouseEnter={() => setHoverRating(n)}
                            onMouseLeave={() => setHoverRating(null)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 2,
                              fontSize: 24,
                              lineHeight: 1,
                              color: active ? '#f59e0b' : '#cbd5e1',
                              transition: 'color 80ms ease',
                            }}
                          >
                            {active ? '★' : '☆'}
                          </button>
                        )
                      })}
                      {rating != null && (
                        <button
                          type="button"
                          onClick={() => setRating(null)}
                          style={{
                            marginLeft: 8,
                            background: 'transparent',
                            border: 'none',
                            color: 'inherit',
                            opacity: 0.6,
                            fontSize: 12,
                            cursor: 'pointer',
                          }}
                        >
                          clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <label>
                  <div style={STYLES.label}>Type</div>
                  <select
                    style={STYLES.field}
                    value={type}
                    onChange={(e) => setType(e.target.value as FeedbackType)}
                  >
                    {resolvedAllowedTypes.map((t) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <div style={STYLES.label}>Title</div>
                  <input
                    style={STYLES.field}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="One-line summary"
                    maxLength={255}
                    required
                  />
                </label>

                <label>
                  <div style={STYLES.label}>Details</div>
                  <textarea
                    style={{ ...STYLES.field, ...STYLES.textarea }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What happened, what you expected, anything else helpful…"
                    required
                  />
                </label>

                {!signedIn && allowAnonymous && (
                  <label>
                    <div style={STYLES.label}>Email</div>
                    <input
                      style={STYLES.field}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                )}

                {anonymousBlocked && (
                  <div style={STYLES.note}>
                    This app only accepts feedback from signed-in users.
                  </div>
                )}

                {errMsg && <div style={STYLES.error}>{errMsg}</div>}

                <div style={STYLES.rowEnd}>
                  <button type="button" style={STYLES.secondaryBtn} onClick={handleClose}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={STYLES.primaryBtn}
                    disabled={submitting || anonymousBlocked}
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  )
}
