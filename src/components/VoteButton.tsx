'use client'

/**
 * VoteButton — self-contained up/down voting component for Next.js apps.
 *
 * Reads + writes via the gateway-backed `client` from
 * ScaleMuleProvider. Optimistic updates, anonymous-aware (calls
 * `onSignInRequired` instead of voting when there's no session).
 */

import React, { useCallback, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useVote, type VoteState } from '../hooks/useVote'

export interface VoteButtonClassNames {
  root?: string
  upButton?: string
  upButtonActive?: string
  downButton?: string
  downButtonActive?: string
  score?: string
  scorePositive?: string
  scoreNegative?: string
}

export interface VoteButtonProps {
  targetType: string
  targetId: string
  /** Server-known initial state, e.g. seeded from a list query. */
  initialState?: VoteState | null
  /** Visual layout. "horizontal" = up | score | down. "stacked" = column. */
  layout?: 'horizontal' | 'stacked'
  size?: 'compact' | 'regular'
  /** Called when an anonymous user clicks vote. */
  onSignInRequired?: () => void
  onError?: (error: unknown) => void
  classNames?: VoteButtonClassNames
  upLabel?: string
  downLabel?: string
}

const ARROW_UP = '▲'
const ARROW_DOWN = '▼'

const STYLES = {
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  } as React.CSSProperties,
  rootStacked: {
    display: 'inline-flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  } as React.CSSProperties,
  button: {
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    color: 'inherit',
    cursor: 'pointer',
    borderRadius: 9999,
    padding: '6px 10px',
    lineHeight: 1,
    fontSize: 14,
  } as React.CSSProperties,
  buttonCompact: {
    padding: '3px 7px',
    fontSize: 12,
  } as React.CSSProperties,
  buttonActiveUp: {
    background: 'rgba(34,197,94,0.18)',
    borderColor: 'rgba(34,197,94,0.45)',
    color: '#86efac',
  } as React.CSSProperties,
  buttonActiveDown: {
    background: 'rgba(239,68,68,0.18)',
    borderColor: 'rgba(239,68,68,0.45)',
    color: '#fca5a5',
  } as React.CSSProperties,
  score: {
    minWidth: 24,
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums' as const,
    fontWeight: 600,
  } as React.CSSProperties,
}

export function VoteButton({
  targetType,
  targetId,
  initialState,
  layout = 'horizontal',
  size = 'regular',
  onSignInRequired,
  onError,
  classNames,
  upLabel = 'Upvote',
  downLabel = 'Downvote',
}: VoteButtonProps) {
  const { isAuthenticated } = useAuth()
  const { state, cast, error } = useVote({
    targetType,
    targetId,
    initialState: initialState ?? null,
    enabled: isAuthenticated,
  })

  const handleVote = useCallback(
    async (next: 1 | -1) => {
      if (!isAuthenticated) {
        onSignInRequired?.()
        return
      }
      const desired: 1 | -1 | 0 = state.value === next ? 0 : next
      try {
        await cast(desired)
      } catch (e) {
        onError?.(e)
      }
    },
    [cast, isAuthenticated, onSignInRequired, onError, state.value],
  )

  useEffect(() => {
    if (error) onError?.(error)
  }, [error, onError])

  const compactStyle = size === 'compact' ? STYLES.buttonCompact : {}
  const upActive = state.value === 1
  const downActive = state.value === -1

  const upBtn = (
    <button
      type="button"
      aria-label={upLabel}
      aria-pressed={upActive}
      title={isAuthenticated ? upLabel : 'Sign in to vote'}
      className={[classNames?.upButton, upActive ? classNames?.upButtonActive : undefined]
        .filter(Boolean)
        .join(' ') || undefined}
      onClick={() => void handleVote(1)}
      style={
        classNames?.upButton
          ? undefined
          : { ...STYLES.button, ...compactStyle, ...(upActive ? STYLES.buttonActiveUp : {}) }
      }
    >
      {ARROW_UP}
    </button>
  )

  const downBtn = (
    <button
      type="button"
      aria-label={downLabel}
      aria-pressed={downActive}
      title={isAuthenticated ? downLabel : 'Sign in to vote'}
      className={[classNames?.downButton, downActive ? classNames?.downButtonActive : undefined]
        .filter(Boolean)
        .join(' ') || undefined}
      onClick={() => void handleVote(-1)}
      style={
        classNames?.downButton
          ? undefined
          : { ...STYLES.button, ...compactStyle, ...(downActive ? STYLES.buttonActiveDown : {}) }
      }
    >
      {ARROW_DOWN}
    </button>
  )

  const scoreClass = [
    classNames?.score,
    state.score > 0 ? classNames?.scorePositive : undefined,
    state.score < 0 ? classNames?.scoreNegative : undefined,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  const scoreEl = (
    <span className={scoreClass} style={classNames?.score ? undefined : STYLES.score}>
      {state.score}
    </span>
  )

  const rootStyle = layout === 'stacked' ? STYLES.rootStacked : STYLES.root

  return (
    <div className={classNames?.root} style={classNames?.root ? undefined : rootStyle}>
      {upBtn}
      {scoreEl}
      {downBtn}
    </div>
  )
}
