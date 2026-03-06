'use client'

import { useState, useCallback, useMemo } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
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
        const profileData = await client.patch<Profile>('/v1/auth/profile', data)

        // Update user in context
        setUser(profileData)

        return profileData
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
        await client.post('/v1/auth/change-password', {
          current_password: currentPassword,
          new_password: newPassword,
        })
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
        await client.post('/v1/auth/change-email', {
          new_email: newEmail,
          password,
        })

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
        await client.post('/v1/auth/delete-account', {
          password,
        })

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
      return await client.post<{ download_url: string }>(
        '/v1/auth/export-data'
      )
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
