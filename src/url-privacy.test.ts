import { describe, it, expect } from 'vitest'
import { withoutAuthSecrets } from './url-privacy'
describe('authentication URL privacy', () => {
  it('removes reset and OAuth proof while preserving ad attribution', () => {
    const url = new URL(withoutAuthSecrets('https://app.example/auth/reset-password?token=secret&token=other&CODE=secret&state=secret&utm_source=ads&utm_campaign=Кириллица😀#access_token=secret')!)
    expect([...url.searchParams.keys()]).toEqual(['utm_source', 'utm_campaign'])
    expect(url.searchParams.get('utm_campaign')).toBe('Кириллица😀')
    expect(url.hash).toBe('')
    expect(url.toString()).not.toContain('secret')
  })
  it('does not retain invalid URLs or turn missing referrers into values', () => {
    expect(withoutAuthSecrets('http://[')).toBeUndefined()
    expect(withoutAuthSecrets(undefined)).toBeUndefined()
    expect(withoutAuthSecrets('')).toBe('')
  })
})

it('preserves relative page URL references and removes their proof', () => {
  expect(withoutAuthSecrets('/checkout')).toBe('/checkout')
  expect(withoutAuthSecrets('/auth/reset-password?token=secret&utm_source=ad#secret')).toBe('/auth/reset-password?utm_source=ad')
  expect(withoutAuthSecrets('../checkout?code=secret')).toBe('../checkout')
  expect(withoutAuthSecrets('//example.com/auth?token=secret')).toBe('//example.com/auth')
})
