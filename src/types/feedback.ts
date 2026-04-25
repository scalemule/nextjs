/**
 * Public types for the feedback hook + widget.
 *
 * Mirrors the JSON shape returned by `scalemule-feedback`'s public endpoints
 * (`/v1/feedback/submit`, `/v1/feedback/items`). Dashboard/admin shapes live
 * server-side and are not exported here — customer apps interact with the
 * SDK only through the end-user surface.
 */

export type FeedbackType = 'bug_report' | 'feature_request' | 'improvement' | 'other'

export type FeedbackStatus =
  | 'new'
  | 'reviewed'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'declined'

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'urgent'

/**
 * The end-user-visible shape of a feedback item. Excludes staff-only fields
 * (assigned_to, internal_notes, email of OTHER users, etc.) that the service
 * never returns through `/items`.
 */
export interface FeedbackItem {
  id: string
  type: FeedbackType
  title: string
  description: string
  status: FeedbackStatus
  priority: FeedbackPriority
  tags: string[] | null
  created_at: string
  updated_at: string
}

/**
 * Body for `POST /v1/feedback/submit`.
 *
 * `email` is required when no end-user session is present — the gateway omits
 * `x-user-id` in that case and the service rejects with 400 unless email is
 * given. When a session exists, email is optional.
 */
export interface FeedbackItemInput {
  type: FeedbackType
  title: string
  description: string
  email?: string
  tags?: string[]
}
