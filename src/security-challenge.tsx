'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export interface SecurityChallenge { method: 'email' | 'totp' | 'sms'; error?: string }
export type SecurityChallengePrompt = (challenge: SecurityChallenge) => Promise<string | null>

/** Shared UI: no app-specific challenge or recovery implementation required. */
export function useSecurityChallenge(recoveryUrl: string) {
  const [challenge, setChallenge] = useState<SecurityChallenge | null>(null)
  const [code, setCode] = useState('')
  const resolve = useRef<((answer: string | null) => void) | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const answer = useCallback((value: string | null) => {
    const pending = resolve.current
    resolve.current = null
    setChallenge(null)
    setCode('')
    pending?.(value)
  }, [])
  const prompt = useCallback<SecurityChallengePrompt>((next) => {
    resolve.current?.(null)
    return new Promise((done) => { resolve.current = done; setCode(''); setChallenge(next) })
  }, [])
  useEffect(() => () => { resolve.current?.(null); resolve.current = null }, [])
  useEffect(() => {
    if (challenge && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [challenge])
  const element = challenge ? (
    <dialog ref={dialog} aria-labelledby="sm-security-title" aria-describedby="sm-security-description"
      onCancel={(event) => { event.preventDefault(); answer(null) }}
      style={{ border: '1px solid #d1d5db', borderRadius: 16, padding: 28, maxWidth: 420, width: 'calc(100% - 48px)', color: '#111827', background: '#fff', boxSizing: 'border-box' }}>
      <form onSubmit={(event) => { event.preventDefault(); if (code.trim()) answer(code.trim()) }}>
        <h2 id="sm-security-title" style={{ marginTop: 0 }}>Confirm your sign-in</h2>
        <p id="sm-security-description">{challenge.method === 'totp' ? 'Enter a code from your authenticator app.' : 'Enter the verification code sent to your ' + (challenge.method === 'sms' ? 'phone.' : 'email.')}</p>
        {challenge.error && <p role="alert" style={{ color: '#b91c1c' }}>{challenge.error}</p>}
        <label htmlFor="sm-security-code">Verification code</label>
        <input id="sm-security-code" autoFocus autoComplete="one-time-code" inputMode="numeric"
          value={code} onChange={(event) => setCode(event.target.value)} maxLength={32} required
          style={{ display: 'block', boxSizing: 'border-box', width: '100%', margin: '8px 0 20px', padding: 12, fontSize: 22, border: '1px solid #9ca3af', borderRadius: 8 }} />
        <button type="submit" style={{ padding: '10px 20px', borderRadius: 8, border: 0, background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Continue</button>
        <button type="button" onClick={() => answer(null)} style={{ marginLeft: 12 }}>Cancel</button>
        {challenge.method !== 'totp' && <p><button type="button" onClick={() => answer('resend')}>Send a new code</button> <small>(wait 60 seconds between requests)</small></p>}
        <p><a href={recoveryUrl} onClick={() => answer(null)}>Reset your password</a></p>
      </form>
    </dialog>
  ) : null
  return { prompt, element }
}

export interface LoginChallengeProof { challenge_token?: string; challenge_code?: string }

/** Credentials remain only in the pending login call, never browser storage. */
export async function withAdaptiveChallenge<T>(attempt: (proof: LoginChallengeProof) => Promise<T>, prompt: SecurityChallengePrompt, mfa?: { send: (token: string, method: string) => Promise<unknown>; verify: (token: string, code: string, method: string) => Promise<T> }): Promise<T> {
  let proof: LoginChallengeProof = {}
  let challengeToken: string | undefined
  let message: string | undefined
  for (;;) {
    try { return await attempt(proof) } catch (error) {
      const err = error as { code?: string; message?: string }
      if (err.code === 'MFA_REQUIRED' && mfa) {
        const details = JSON.parse(err.message || '{}') as { pending_token?: string; mfa_method?: string }
        const token = details.pending_token
        const method = details.mfa_method
        if (!token || !['totp', 'email', 'sms'].includes(method || '')) throw error
        if (method !== 'totp') await mfa.send(token, method!)
        let mfaError: string | undefined
        for (;;) {
          const code = await prompt({ method: method as SecurityChallenge['method'], error: mfaError })
          if (code === null) throw { code: 'LOGIN_CANCELLED', message: 'Sign-in was cancelled.' }
          try {
            if (code === 'resend') { await mfa.send(token, method!); mfaError = undefined; continue }
            return await mfa.verify(token, code, method!)
          } catch (failure) {
            const failed = failure as { code?: string; message?: string }
            if (!['INVALID_MFA_CODE', 'CHALLENGE_RATE_LIMITED'].includes(failed.code || '')) throw failure
            mfaError = failed.message
          }
        }
      }
      if (err.code === 'LOGIN_CHALLENGE_REQUIRED') {
        const details = JSON.parse(err.message || '{}') as { challenge_token?: string }
        if (!details.challenge_token) throw error
        challengeToken = details.challenge_token
        message = undefined
      } else if (challengeToken && ['LOGIN_CHALLENGE_INVALID', 'CHALLENGE_RATE_LIMITED'].includes(err.code || '')) {
        message = err.message
      } else { throw error }
      const code = await prompt({ method: 'email', error: message })
      if (code === null) throw { code: 'LOGIN_CANCELLED', message: 'Sign-in was cancelled.' }
      proof = code === 'resend' ? {} : { challenge_token: challengeToken, challenge_code: code }
    }
  }
}
