'use client'

/**
 * useShare — referral-aware share URL management
 *
 * Manages share URLs with optional referral code attribution.
 * Does NOT handle analytics — consumers use their own analytics pipeline.
 *
 * @example
 * ```tsx
 * function SharePage({ contentUrl }: { contentUrl: string }) {
 *   const { shareUrl, copyLink, copied } = useShare({
 *     url: contentUrl,
 *     autoFetchReferral: true,
 *   })
 *
 *   return (
 *     <button onClick={copyLink}>
 *       {copied ? 'Copied!' : 'Copy Link'}
 *     </button>
 *   )
 * }
 * ```
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useScaleMule } from '../provider'

// ============================================================================
// Types
// ============================================================================

/** Backend response shape (auto-unwrapped by NextJS client) */
interface ReferralMeResponse {
  referral_code: string
  share_link: string
  campaign: { id: string; name: string; status: string }
  stats: { clicks: number; signups: number; paid: number; rewarded: number }
}

export interface UseShareOptions {
  /** The canonical URL to share. Defaults to current page URL.
   *  IMPORTANT: Pass the content's canonical URL, not window.location.href,
   *  to avoid re-sharing someone else's referral code. */
  url?: string
  /** Manual referral code override (skips fetch) */
  referralCode?: string
  /** Auto-fetch referral code from /v1/referrals/me when authenticated */
  autoFetchReferral?: boolean
}

export interface UseShareReturn {
  /** Share URL — absolute, with ?rc= appended if referral code available */
  shareUrl: string
  /** User's referral code, or null if unauthenticated/not fetched */
  referralCode: string | null
  /** Copy shareUrl to clipboard. Returns true on success. */
  copyLink: () => Promise<boolean>
  /** Whether link was recently copied (auto-resets after 2s) */
  copied: boolean
  /** Loading state for referral code fetch */
  loading: boolean
}

// ============================================================================
// Hook
// ============================================================================

export function useShare(options?: UseShareOptions): UseShareReturn {
  const { client, user } = useScaleMule()
  const [referralCode, setReferralCode] = useState<string | null>(
    options?.referralCode ?? null
  )
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  // -----------------------------------------------------------------------
  // Referral code fetch — reacts to user state changes
  //
  // Provider can flip user: null → cached → fresh, or cached → null.
  // Every early-return clears loading to prevent stuck state.
  // Stale referral code from a previous user is cleared before fetch starts.
  //
  // Uses `cancelled` flag (not AbortController) because the NextJS client
  // overrides caller-provided signal with its own timeout signal.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!user) {
      setReferralCode(options?.referralCode ?? null)
      setLoading(false)
      return
    }
    if (!options?.autoFetchReferral) {
      setLoading(false)
      return
    }
    if (options?.referralCode) {
      setReferralCode(options.referralCode)
      setLoading(false)
      return
    }

    // Clear stale referral from previous user BEFORE starting fetch
    setReferralCode(null)

    let cancelled = false
    setLoading(true)

    client
      .get<ReferralMeResponse>('/v1/referrals/me')
      .then((data) => {
        if (!cancelled) setReferralCode(data.referral_code)
      })
      .catch(() => {
        if (!cancelled) setReferralCode(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [user?.id, options?.url, options?.referralCode, options?.autoFetchReferral, client])

  // -----------------------------------------------------------------------
  // URL composition — always resolve to absolute (share intents need it)
  // Uses URL constructor to preserve existing query params and hash
  // -----------------------------------------------------------------------
  const shareUrl = useMemo(() => {
    const raw =
      options?.url ||
      (typeof window !== 'undefined' ? window.location.href : '')
    if (!raw) return raw
    try {
      const base =
        typeof window !== 'undefined' ? window.location.origin : undefined
      const u = new URL(raw, base)
      if (referralCode) {
        u.searchParams.set('rc', referralCode)
      }
      return u.toString()
    } catch {
      return raw
    }
  }, [options?.url, referralCode])

  // -----------------------------------------------------------------------
  // Copy to clipboard
  // -----------------------------------------------------------------------
  const copyLink = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(shareUrl)
    } catch {
      // Fallback for older browsers / insecure contexts
      try {
        const textarea = document.createElement('textarea')
        textarea.value = shareUrl
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        return false
      }
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    return true
  }, [shareUrl])

  return { shareUrl, referralCode, copyLink, copied, loading }
}
