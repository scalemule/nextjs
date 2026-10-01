import { describe, it, expect, vi } from 'vitest'
import { withAdaptiveChallenge } from './security-challenge'

const challenge = { code: 'LOGIN_CHALLENGE_REQUIRED', message: JSON.stringify({ challenge_token: 'opaque-proof' }) }

describe('adaptive login', () => {
  it('does not complete login before proof, and retries an invalid code', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(challenge)
      .mockRejectedValueOnce({ code: 'LOGIN_CHALLENGE_INVALID', message: 'Incorrect code' })
      .mockResolvedValueOnce({ session: 'authenticated' })
    const prompt = vi.fn().mockResolvedValueOnce('111111').mockResolvedValueOnce('222222')
    const result = await withAdaptiveChallenge(attempt, prompt)
    expect(result).toEqual({ session: 'authenticated' })
    expect(attempt.mock.calls).toEqual([[{}], [{ challenge_token: 'opaque-proof', challenge_code: '111111' }], [{ challenge_token: 'opaque-proof', challenge_code: '222222' }]])
    expect(prompt.mock.calls[1][0].error).toBe('Incorrect code')
  })
  it('cancels without submitting proof or creating a session', async () => {
    const attempt = vi.fn().mockRejectedValue(challenge)
    await expect(withAdaptiveChallenge(attempt, vi.fn().mockResolvedValue(null))).rejects.toMatchObject({ code: 'LOGIN_CANCELLED' })
    expect(attempt).toHaveBeenCalledTimes(1)
  })
  it('requests another code without replaying the previous proof', async () => {
    const attempt = vi.fn().mockRejectedValueOnce(challenge).mockRejectedValueOnce(challenge).mockResolvedValue('session')
    await withAdaptiveChallenge(attempt, vi.fn().mockResolvedValueOnce('resend').mockResolvedValueOnce('123456'))
    expect(attempt.mock.calls[1]).toEqual([{}])
  })
  it('propagates account restrictions and delivery failures', async () => {
    for (const code of ['ACCOUNT_INACTIVE', 'CHALLENGE_DELIVERY_FAILED', 'UNAUTHORIZED']) {
      const prompt = vi.fn()
      await expect(withAdaptiveChallenge(vi.fn().mockRejectedValue({ code }), prompt)).rejects.toMatchObject({ code })
      expect(prompt).not.toHaveBeenCalled()
    }
  })
  it('requires the enrolled MFA method after recovery instead of substituting email', async () => {
    const attempt = vi.fn().mockRejectedValue({ code: 'MFA_REQUIRED', message: JSON.stringify({ pending_token: 'mfa-proof', mfa_method: 'totp' }) })
    const mfa = { send: vi.fn(), verify: vi.fn().mockResolvedValue('session') }
    const prompt = vi.fn().mockResolvedValue('123456')
    expect(await withAdaptiveChallenge(attempt, prompt, mfa)).toBe('session')
    expect(mfa.send).not.toHaveBeenCalled()
    expect(mfa.verify).toHaveBeenCalledWith('mfa-proof', '123456', 'totp')
  })
})

it('keeps code entry available when initial MFA delivery is rate limited', async () => {
  const attempt = vi.fn().mockRejectedValue({ code: 'MFA_REQUIRED', message: JSON.stringify({ pending_token: 'pending', mfa_method: 'email' }) })
  const prompt = vi.fn().mockResolvedValue('234567')
  const mfa = { send: vi.fn().mockRejectedValue({ code: 'CHALLENGE_RATE_LIMITED', message: 'Use your existing code' }), verify: vi.fn().mockResolvedValue('session') }
  expect(await withAdaptiveChallenge(attempt, prompt, mfa)).toBe('session')
  expect(prompt).toHaveBeenCalledWith({ method: 'email', error: 'Use your existing code' })
})
