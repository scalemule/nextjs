'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useScaleMule } from '../provider'
import { ScaleMuleApiError } from '../types'
import type {
  UseContentReturn,
  StorageFile,
  UploadOptions,
  ListFilesParams,
  ListFilesResponse,
  UploadResponse,
  ApiError,
  SignedUploadRequest,
  SignedUploadResponse,
} from '../types'

interface UseContentOptions {
  /** Auto-fetch files on mount */
  autoFetch?: boolean
  /** Initial list params */
  initialParams?: ListFilesParams
}

/**
 * Content/Storage hook for ScaleMule
 *
 * Provides file upload, listing, and deletion functionality.
 * Automatically includes user ID for proper multi-tenancy.
 *
 * @example
 * ```tsx
 * function Gallery() {
 *   const { files, upload, uploadProgress, loading } = useContent({ autoFetch: true })
 *
 *   const handleUpload = async (e) => {
 *     const file = e.target.files[0]
 *     await upload(file, {
 *       onProgress: (progress) => console.log(`${progress}%`)
 *     })
 *     // Files list is automatically refreshed
 *   }
 *
 *   // For large files, use signed upload
 *   const handleLargeUpload = async (file) => {
 *     const signedUrl = await getSignedUploadUrl({
 *       filename: file.name,
 *       content_type: file.type,
 *       size_bytes: file.size,
 *     })
 *     await uploadToSignedUrl(signedUrl.upload_url, file, signedUrl.required_headers)
 *     const result = await completeSignedUpload(signedUrl.file_id)
 *   }
 *
 *   return (
 *     <div>
 *       <input type="file" onChange={handleUpload} />
 *       {uploadProgress !== null && <progress value={uploadProgress} max={100} />}
 *       {files.map(file => (
 *         <img key={file.id} src={file.url} alt={file.filename} />
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useContent(options: UseContentOptions = {}): UseContentReturn {
  const { autoFetch = false, initialParams } = options
  const { client, user, setError } = useScaleMule()

  const [files, setFiles] = useState<StorageFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [error, setLocalError] = useState<ApiError | null>(null)

  /**
   * List user's files
   */
  const list = useCallback(
    async (params?: ListFilesParams): Promise<ListFilesResponse> => {
      setLocalError(null)
      setLoading(true)

      try {
        // Build query string
        const queryParams = new URLSearchParams()
        const p = params || initialParams || {}

        if (p.content_type) queryParams.set('content_type', p.content_type)
        if (p.search) queryParams.set('search', p.search)
        if (p.limit) queryParams.set('limit', p.limit.toString())
        if (p.offset) queryParams.set('offset', p.offset.toString())

        const query = queryParams.toString()
        const path = `/v1/storage/my-files${query ? `?${query}` : ''}`

        const data = await client.get<ListFilesResponse>(path)

        setFiles(data.files)
        return data
      } finally {
        setLoading(false)
      }
    },
    [client, initialParams]
  )

  /**
   * Upload a file
   */
  const upload = useCallback(
    async (file: File, options?: UploadOptions): Promise<UploadResponse> => {
      setLocalError(null)
      setLoading(true)
      setUploadProgress(0)

      try {
        const additionalFields: Record<string, string> = {}

        if (options?.is_public !== undefined) {
          additionalFields.is_public = options.is_public ? 'true' : 'false'
        }
        if (options?.filename) {
          additionalFields.filename = options.filename
        }
        if (options?.category) {
          additionalFields.category = options.category
        }

        // Wrap progress callback to update state
        const onProgress = (progress: number) => {
          setUploadProgress(progress)
          options?.onProgress?.(progress)
        }

        const data = await client.upload<UploadResponse>(
          '/v1/storage/upload',
          file,
          additionalFields,
          { onProgress }
        )

        // Refresh file list after successful upload
        await list()

        return data
      } finally {
        setLoading(false)
        setUploadProgress(null)
      }
    },
    [client, list]
  )

  /**
   * Delete a file
   */
  const remove = useCallback(
    async (fileId: string): Promise<void> => {
      setLocalError(null)
      setLoading(true)

      try {
        await client.delete(`/v1/storage/files/${fileId}`)

        // Remove from local state
        setFiles((prev) => prev.filter((f) => f.id !== fileId))
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  /**
   * Get a single file's info
   */
  const get = useCallback(
    async (fileId: string): Promise<StorageFile> => {
      setLocalError(null)

      return await client.get<StorageFile>(`/v1/storage/files/${fileId}/info`)
    },
    [client]
  )

  /**
   * Refresh the file list
   */
  const refresh = useCallback(async (): Promise<void> => {
    await list(initialParams)
  }, [list, initialParams])

  // ============================================================================
  // Signed Upload Methods (for large files)
  // ============================================================================

  /**
   * Get a signed URL for direct upload
   * Use this for large files that should bypass the SDK
   */
  const getSignedUploadUrl = useCallback(
    async (request: SignedUploadRequest): Promise<SignedUploadResponse> => {
      setLocalError(null)

      return await client.post<SignedUploadResponse>('/v1/storage/signed-upload', request)
    },
    [client]
  )

  /**
   * Upload file directly to signed URL
   * Call this with the URL from getSignedUploadUrl
   */
  const uploadToSignedUrl = useCallback(
    async (
      signedUrl: string,
      file: File,
      headers: Record<string, string>,
      onProgress?: (progress: number) => void
    ): Promise<void> => {
      setLocalError(null)
      setLoading(true)
      setUploadProgress(0)

      try {
        // Use XMLHttpRequest for progress support
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest()

          xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
              const progress = Math.round((event.loaded / event.total) * 100)
              setUploadProgress(progress)
              onProgress?.(progress)
            }
          })

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          })

          xhr.addEventListener('error', () => {
            reject(new Error('Upload failed'))
          })

          xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'))
          })

          xhr.open('PUT', signedUrl)

          // Set required headers
          for (const [key, value] of Object.entries(headers)) {
            xhr.setRequestHeader(key, value)
          }

          xhr.send(file)
        })
      } catch (err) {
        const error: ApiError = {
          code: 'SIGNED_UPLOAD_FAILED',
          message: err instanceof Error ? err.message : 'Upload failed',
        }
        setLocalError(error)
        throw error
      } finally {
        setLoading(false)
        setUploadProgress(null)
      }
    },
    []
  )

  /**
   * Mark signed upload as complete
   * Call this after uploadToSignedUrl succeeds
   */
  const completeSignedUpload = useCallback(
    async (fileId: string): Promise<StorageFile> => {
      setLocalError(null)

      const data = await client.post<StorageFile>(`/v1/storage/signed-upload/${fileId}/complete`)

      // Refresh file list
      await list()

      return data
    },
    [client, list]
  )

  // Auto-fetch on mount if enabled and user is authenticated
  useEffect(() => {
    if (autoFetch && user) {
      list(initialParams)
    }
  }, [autoFetch, user, list, initialParams])

  return useMemo(
    () => ({
      files,
      loading,
      uploadProgress,
      error,
      upload,
      list,
      remove,
      get,
      refresh,
      getSignedUploadUrl,
      uploadToSignedUrl,
      completeSignedUpload,
    }),
    [
      files,
      loading,
      uploadProgress,
      error,
      upload,
      list,
      remove,
      get,
      refresh,
      getSignedUploadUrl,
      uploadToSignedUrl,
      completeSignedUpload,
    ]
  )
}
