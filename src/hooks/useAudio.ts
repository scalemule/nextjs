'use client'

import { useCallback, useState } from 'react'
import type { ApiError } from '@scalemule/sdk'
import { useScaleMule } from '../provider'
import type { ListFilesResponse, StorageFile } from '../types'

const AUDIO_POLL_INTERVAL_MS = 1000
const AUDIO_POLL_MAX_ATTEMPTS = 30

interface AudioDetailsResponse {
  id: string
  source: string
  status: string
  codec: string | null
  bit_rate_kbps?: number | null
  sample_rate_hz?: number | null
  channels?: number | null
  duration_ms?: number | null
  size_bytes?: number | null
  waveform_peaks?: unknown
  created_at: string
  url?: string | null
}

export interface AudioFile {
  audio_id: string
  file_id: string
  filename: string
  mime_type: string
  size_bytes: number
  status: string
  codec: string | null
  bit_rate_kbps: number | null
  duration_ms: number | null
  created_at: string
  original_view_url: string | null
  transcoded_url: string | null
  waveform_peaks?: unknown
}

export interface UseAudioUploadOptions {
  filename?: string
  metadata?: Record<string, unknown>
  onProgress?: (progress: number) => void
  signal?: AbortSignal
}

export interface AudioUploadResult {
  file_id: string
  audio_id: string | null
  original_view_url: string | null
  transcoded_url_promise: Promise<string | null>
}

export interface UseAudioReturn {
  upload: (file: File | Blob, opts?: UseAudioUploadOptions) => Promise<AudioUploadResult>
  list: () => Promise<AudioFile[]>
  remove: (id: string) => Promise<void>
  error: ApiError | null
  loading: boolean
}

function isAudioFile(file: StorageFile): boolean {
  return file.content_type.startsWith('audio/')
}

function toStorageBackedAudioFile(file: StorageFile): AudioFile {
  return {
    audio_id: file.id,
    file_id: file.id,
    filename: file.filename,
    mime_type: file.content_type,
    size_bytes: file.size_bytes,
    status: 'pending_transcode',
    codec: null,
    bit_rate_kbps: null,
    duration_ms: null,
    created_at: file.created_at,
    original_view_url: file.url ?? null,
    transcoded_url: null,
  }
}

export function useAudio(): UseAudioReturn {
  const { client, audio } = useScaleMule()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const pollTranscodedUrl = useCallback(
    async (audioId: string): Promise<string | null> => {
      for (let attempt = 0; attempt < AUDIO_POLL_MAX_ATTEMPTS; attempt++) {
        try {
          const details = await client.get<AudioDetailsResponse>(`/v1/audios/${audioId}`)
          if (details.status === 'ready' && details.url) {
            return details.url
          }
          if (details.status === 'failed') {
            return null
          }
        } catch {
          // The row can race visibility very briefly after register; keep polling.
        }
        await new Promise((resolve) => setTimeout(resolve, AUDIO_POLL_INTERVAL_MS))
      }
      return null
    },
    [client]
  )

  const upload = useCallback(
    async (file: File | Blob, opts?: UseAudioUploadOptions): Promise<AudioUploadResult> => {
      setLoading(true)
      setError(null)

      try {
        const result = await audio.uploadViaStorage(file, {
          filename: opts?.filename,
          metadata: opts?.metadata,
          onProgress: opts?.onProgress,
          signal: opts?.signal,
        })
        if (result.error || !result.data) {
          throw result.error ?? { code: 'upload_error', message: 'Audio upload failed' }
        }

        return {
          file_id: result.data.file_id,
          audio_id: result.data.audio_id,
          original_view_url: result.data.original_view_url,
          transcoded_url_promise: result.data.audio_id
            ? pollTranscodedUrl(result.data.audio_id)
            : Promise.resolve(null),
        }
      } catch (err) {
        const apiError = err as ApiError
        setError(apiError)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [audio, pollTranscodedUrl]
  )

  const list = useCallback(async (): Promise<AudioFile[]> => {
    setLoading(true)
    setError(null)

    try {
      const response = await client.get<ListFilesResponse>('/v1/storage/my-files')
      const audioFiles = response.files.filter(isAudioFile)

      const enriched = await Promise.all(
        audioFiles.map(async (file) => {
          try {
            const details = await client.get<AudioDetailsResponse>(`/v1/audios/${file.id}`)
            return {
              audio_id: details.id,
              file_id: file.id,
              filename: file.filename,
              mime_type: file.content_type,
              size_bytes: details.size_bytes ?? file.size_bytes,
              status: details.status,
              codec: details.codec,
              bit_rate_kbps: details.bit_rate_kbps ?? null,
              duration_ms: details.duration_ms ?? null,
              created_at: details.created_at,
              original_view_url: file.url ?? null,
              transcoded_url: details.url ?? null,
              waveform_peaks: details.waveform_peaks,
            } satisfies AudioFile
          } catch {
            return toStorageBackedAudioFile(file)
          }
        })
      )

      return enriched
    } catch (err) {
      const apiError = err as ApiError
      setError(apiError)
      throw err
    } finally {
      setLoading(false)
    }
  }, [client])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setLoading(true)
      setError(null)

      try {
        const results = await Promise.allSettled([
          client.delete<unknown>(`/v1/audios/${id}`),
          client.delete<unknown>(`/v1/storage/files/${id}`),
        ])

        if (results.every((result) => result.status === 'rejected')) {
          const firstRejected = results.find(
            (result): result is PromiseRejectedResult => result.status === 'rejected'
          )
          throw firstRejected?.reason ?? new Error('Audio delete failed')
        }
      } catch (err) {
        const apiError = err as ApiError
        setError(apiError)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [client]
  )

  return {
    upload,
    list,
    remove,
    error,
    loading,
  }
}
