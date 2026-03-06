'use client'

import { useState, useCallback, useMemo } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
import type {
  UseBillingReturn,
  ConnectedAccount,
  AccountBalance,
  BillingPayment,
  BillingRefund,
  BillingPayout,
  PayoutSchedule,
  BillingTransaction,
  TransactionSummary,
  ApiError,
} from '../types'

/**
 * Billing hook for ScaleMule marketplace payments
 *
 * Provides connected accounts, payments, refunds, payouts, and ledger queries.
 *
 * @example
 * ```tsx
 * function CreatorDashboard() {
 *   const {
 *     getMyConnectedAccount,
 *     getAccountBalance,
 *     getTransactionSummary,
 *     loading,
 *   } = useBilling()
 *
 *   useEffect(() => {
 *     async function load() {
 *       const account = await getMyConnectedAccount()
 *       if (account) {
 *         const balance = await getAccountBalance(account.id)
 *         const summary = await getTransactionSummary()
 *       }
 *     }
 *     load()
 *   }, [])
 * }
 * ```
 */
export function useBilling(): UseBillingReturn {
  const { client } = useScaleMule()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const createConnectedAccount = useCallback(
    async (data: { email: string; country?: string }): Promise<ConnectedAccount | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.post<ConnectedAccount>('/v1/billing/connected-accounts', data)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getMyConnectedAccount = useCallback(async (): Promise<ConnectedAccount | null> => {
    setError(null)
    setLoading(true)
    try {
      return await client.get<ConnectedAccount>('/v1/billing/connected-accounts/me')
    } catch (err) {
      const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
      setError(apiError)
      return null
    } finally {
      setLoading(false)
    }
  }, [client])

  const getConnectedAccount = useCallback(
    async (id: string): Promise<ConnectedAccount | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.get<ConnectedAccount>(`/v1/billing/connected-accounts/${id}`)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const createOnboardingLink = useCallback(
    async (id: string, data: { return_url: string; refresh_url: string }): Promise<string | null> => {
      setError(null)
      setLoading(true)
      try {
        const result = await client.post<{ url: string }>(
          `/v1/billing/connected-accounts/${id}/onboarding-link`,
          data
        )
        return result.url
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getAccountBalance = useCallback(
    async (id: string): Promise<AccountBalance | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.get<AccountBalance>(
          `/v1/billing/connected-accounts/${id}/balance`
        )
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const createPayment = useCallback(
    async (data: {
      amount_cents: number
      currency?: string
      connected_account_id?: string
      platform_fee_percent?: number
      platform_fee_cents?: number
      payment_type?: string
      metadata?: Record<string, unknown>
    }): Promise<BillingPayment | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.post<BillingPayment>('/v1/billing/payments', data)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getPayment = useCallback(
    async (id: string): Promise<BillingPayment | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.get<BillingPayment>(`/v1/billing/payments/${id}`)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const listPayments = useCallback(
    async (params?: Record<string, unknown>): Promise<BillingPayment[]> => {
      setError(null)
      setLoading(true)
      try {
        const query = params
          ? '?' +
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join('&')
          : ''
        return await client.get<BillingPayment[]>(`/v1/billing/payments${query}`)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return []
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const refundPayment = useCallback(
    async (id: string, data?: { amount_cents?: number; reason?: string }): Promise<BillingRefund | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.post<BillingRefund>(`/v1/billing/payments/${id}/refund`, data)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getPayoutHistory = useCallback(
    async (accountId: string, params?: Record<string, unknown>): Promise<BillingPayout[]> => {
      setError(null)
      setLoading(true)
      try {
        const query = params
          ? '?' +
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join('&')
          : ''
        return await client.get<BillingPayout[]>(
          `/v1/billing/connected-accounts/${accountId}/payouts${query}`
        )
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return []
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getPayoutSchedule = useCallback(
    async (accountId: string): Promise<PayoutSchedule | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.get<PayoutSchedule>(
          `/v1/billing/connected-accounts/${accountId}/payout-schedule`
        )
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const setPayoutSchedule = useCallback(
    async (
      accountId: string,
      data: { schedule_interval: string; minimum_amount_cents?: number }
    ): Promise<PayoutSchedule | null> => {
      setError(null)
      setLoading(true)
      try {
        return await client.put<PayoutSchedule>(
          `/v1/billing/connected-accounts/${accountId}/payout-schedule`,
          data
        )
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getTransactions = useCallback(
    async (params?: Record<string, unknown>): Promise<BillingTransaction[]> => {
      setError(null)
      setLoading(true)
      try {
        const query = params
          ? '?' +
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join('&')
          : ''
        return await client.get<BillingTransaction[]>(`/v1/billing/transactions${query}`)
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return []
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const getTransactionSummary = useCallback(
    async (params?: Record<string, unknown>): Promise<TransactionSummary | null> => {
      setError(null)
      setLoading(true)
      try {
        const query = params
          ? '?' +
            Object.entries(params)
              .filter(([, v]) => v !== undefined)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join('&')
          : ''
        return await client.get<TransactionSummary>(
          `/v1/billing/transactions/summary${query}`
        )
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  const createSetupSession = useCallback(
    async (data: { return_url: string; cancel_url: string }): Promise<string | null> => {
      setError(null)
      setLoading(true)
      try {
        const result = await client.post<{ client_secret: string }>(
          '/v1/billing/setup-sessions',
          data
        )
        return result.client_secret
      } catch (err) {
        const apiError = err instanceof ScaleMuleApiError ? err : { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unknown error' }
        setError(apiError)
        return null
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  return useMemo(
    () => ({
      loading,
      error,
      createConnectedAccount,
      getMyConnectedAccount,
      getConnectedAccount,
      createOnboardingLink,
      getAccountBalance,
      createPayment,
      getPayment,
      listPayments,
      refundPayment,
      getPayoutHistory,
      getPayoutSchedule,
      setPayoutSchedule,
      getTransactions,
      getTransactionSummary,
      createSetupSession,
    }),
    [
      loading,
      error,
      createConnectedAccount,
      getMyConnectedAccount,
      getConnectedAccount,
      createOnboardingLink,
      getAccountBalance,
      createPayment,
      getPayment,
      listPayments,
      refundPayment,
      getPayoutHistory,
      getPayoutSchedule,
      setPayoutSchedule,
      getTransactions,
      getTransactionSummary,
      createSetupSession,
    ]
  )
}
