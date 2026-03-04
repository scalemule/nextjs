'use client'

import { useState, useCallback, useMemo } from 'react'
import { useScaleMule } from '../provider'
import type {
  UseUserReturn,
  Profile,
  UpdateProfileRequest,
  ApiError,
} from '../types'

/**
 * User profile hook for ScaleMule
 *
 * Provides profile management, password changes, and account operations.
 *
 * @example
 * ```tsx
 * function ProfilePage() {
 *   const { profile, update, changePassword } = useUser()
 *
 *   const handleUpdate = async () => {
 *     await update({ full_name: 'New Name' })
 *   }
 * }
 * ```
 */
export function useUser(): UseUserReturn {
  const { client, user, setUser, setError } = useScaleMule()

  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState<ApiError | null>(null)

  /**
   * Update user profile
   */
  const update = useCallback(
    async (data: UpdateProfileRequest): Promise<Profile> => {
      setLocalError(null)
      setLoading(true)

      try {
        const response = await client.patch<Profile>('/v1/auth/profile', data)

        if (!response.success || !response.data) {
          const err = response.error || {
            code: 'UPDATE_FAILED',
            message: 'Failed to update profile',
          }
          setLocalError(err)
          throw err
        }

        // Update user in context
        setUser(response.data)

        return response.data
      } finally {
        setLoading(false)
      }
    },
    [client, setUser]
  )

  /**
   * Change password
   */
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<void> => {
      setLocalError(null)
      setLoading(true)

      try {
        const response = await client.post('/v1/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        })

        if (!response.success) {
          const err = response.error || {
            code: 'CHANGE_PASSWORD_FAILED',
            message: 'Failed to change password',
          }
          setLocalError(err)
          throw err
        }
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  /**
   * Change email address
   */
  const changeEmail = useCallback(
    async (newEmail: string, password: string): Promise<void> => {
      setLocalError(null)
      setLoading(true)

      try {
        const response = await client.post('/v1/auth/change-email', {
          new_email: newEmail,
          password,
        })

        if (!response.success) {
          const err = response.error || {
            code: 'CHANGE_EMAIL_FAILED',
            message: 'Failed to change email',
          }
          setLocalError(err)
          throw err
        }

        // Note: Email change typically requires verification
        // User should check their email
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  /**
   * Delete account
   */
  const deleteAccount = useCallback(
    async (password: string): Promise<void> => {
      setLocalError(null)
      setLoading(true)

      try {
        const response = await client.post('/v1/auth/delete-account', {
          password,
        })

        if (!response.success) {
          const err = response.error || {
            code: 'DELETE_ACCOUNT_FAILED',
            message: 'Failed to delete account',
          }
          setLocalError(err)
          throw err
        }

        // Clear session after account deletion
        await client.clearSession()
        setUser(null)
      } finally {
        setLoading(false)
      }
    },
    [client, setUser]
  )

  /**
   * Request data export (GDPR compliance)
   */
  const exportData = useCallback(async (): Promise<{ download_url: string }> => {
    setLocalError(null)
    setLoading(true)

    try {
      const response = await client.post<{ download_url: string }>(
        '/v1/auth/export-data'
      )

      if (!response.success || !response.data) {
        const err = response.error || {
          code: 'EXPORT_FAILED',
          message: 'Failed to export data',
        }
        setLocalError(err)
        throw err
      }

      return response.data
    } finally {
      setLoading(false)
    }
  }, [client])

  return useMemo(
    () => ({
      profile: user as Profile | null,
      loading,
      error: localError,
      update,
      changePassword,
      changeEmail,
      deleteAccount,
      exportData,
    }),
    [user, loading, localError, update, changePassword, changeEmail, deleteAccount, exportData]
  )
}
