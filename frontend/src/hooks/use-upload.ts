import { useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getUploadIntent, uploadToS3, createArtwork } from '../services/artworks.service'
import { artworksQueryKey } from './use-artworks'
import type { CreateArtworkRequest, Artwork } from '../types/artwork'
import { ApiError } from '../services/api'

// ── Validation constants (FR-ART-03) ──────────────────────────────────────────

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

export type UploadStep = 'idle' | 'requesting-intent' | 'uploading' | 'creating' | 'done' | 'error'

interface UploadState {
  step:       UploadStep
  progress:   number   // 0–100, meaningful during 'uploading' step
  error:      string | null
  artwork:    Artwork | null
}

interface UseUploadReturn extends UploadState {
  upload:     (file: File, meta: Omit<CreateArtworkRequest, 's3Key'>) => Promise<void>
  reset:      () => void
  validateFile: (file: File) => string | null
}

const INITIAL: UploadState = { step: 'idle', progress: 0, error: null, artwork: null }

export const useUpload = (): UseUploadReturn => {
  const [state, setState] = useState<UploadState>(INITIAL)
  const queryClient = useQueryClient()

  const validateFile = useCallback((file: File): string | null => {
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      return `Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF.`
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File too large. Maximum size is 20 MB.`
    }
    return null
  }, [])

  const upload = useCallback(async (
    file: File,
    meta: Omit<CreateArtworkRequest, 's3Key'>
  ) => {
    const validationError = validateFile(file)
    if (validationError) {
      setState({ ...INITIAL, step: 'error', error: validationError })
      return
    }

    try {
      // Step 1 — request presigned URL
      setState({ step: 'requesting-intent', progress: 0, error: null, artwork: null })
      const { uploadUrl, s3Key } = await getUploadIntent({
        fileName:  file.name,
        mimeType:  file.type,
        sizeBytes: file.size,
      })

      // Step 2 — PUT directly to S3 (no auth header — presigned URL is self-authenticating)
      setState((s) => ({ ...s, step: 'uploading', progress: 0 }))
      await uploadToS3(uploadUrl, file, (pct) =>
        setState((s) => ({ ...s, progress: pct }))
      )

      // Step 3 — create artwork record
      setState((s) => ({ ...s, step: 'creating', progress: 100 }))
      const artwork = await createArtwork({ ...meta, s3Key })

      // Invalidate browse list so new piece appears
      await queryClient.invalidateQueries({ queryKey: artworksQueryKey({}) })

      setState({ step: 'done', progress: 100, error: null, artwork })
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Upload failed. Please try again.'
      setState((s) => ({ ...s, step: 'error', error: msg }))
    }
  }, [validateFile, queryClient])

  const reset = useCallback(() => setState(INITIAL), [])

  return { ...state, upload, reset, validateFile }
}
