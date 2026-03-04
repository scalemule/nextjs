/**
 * Constant-time string comparison helper.
 *
 * Compares both inputs across the maximum length to avoid early returns
 * that can leak length information through timing differences.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length)
  let mismatch = a.length ^ b.length

  for (let i = 0; i < maxLength; i++) {
    const aCode = i < a.length ? a.charCodeAt(i) : 0
    const bCode = i < b.length ? b.charCodeAt(i) : 0
    mismatch |= aCode ^ bCode
  }

  return mismatch === 0
}
