// =============================================================================
// frontend/src/components/ui/ProfileImageUpload.tsx
// Reusable image uploader for author icon and wallpaper.
// Flow: validate → POST /media/upload-intent → PUT S3 → PUT /users/me/author
// =============================================================================

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getUploadIntent, uploadToS3 } from '../../services/artworks.service'
import { updateAuthorProfile } from '../../services/authors.service'
import { useMeQueryKey } from '../../hooks/use-me'
import { ApiError } from '../../services/api'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_SIZE_BYTES = 20 * 1024 * 1024

type UploadField = 'profilePhotoS3Key' | 'coverPhotoS3Key'

type Step = 'idle' | 'uploading' | 'done' | 'error'

interface Props {
  label:       string
  description: string
  currentUrl:  string | null
  field:       UploadField
  aspectClass: string  // e.g. 'aspect-square' or 'aspect-[16/5]'
  onSuccess?:  (s3Key: string) => void
}

export function ProfileImageUpload({ label, description, currentUrl, field, aspectClass, onSuccess }: Props) {
  const inputRef   = useRef<HTMLInputElement>(null)
  const qc         = useQueryClient()

  const [step, setStep]         = useState<Step>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError]       = useState<string | null>(null)
  const [preview, setPreview]   = useState<string | null>(currentUrl)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      setError('Unsupported file type. Allowed: JPEG, PNG, WEBP, GIF.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('File too large. Maximum size is 20 MB.')
      return
    }

    setError(null)
    setStep('uploading')
    setProgress(0)

    try {
      const { uploadUrl, s3Key } = await getUploadIntent({
        fileName:  file.name,
        mimeType:  file.type,
        sizeBytes: file.size,
      })

      await uploadToS3(uploadUrl, file, (pct) => setProgress(pct))

      await updateAuthorProfile({ [field]: s3Key })

      await qc.invalidateQueries({ queryKey: useMeQueryKey })

      setPreview(URL.createObjectURL(file))
      setStep('done')
      onSuccess?.(s3Key)
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Upload failed. Please try again.'
      setError(msg)
      setStep('error')
    } finally {
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <p className="text-[0.78rem] font-medium tracking-[0.14em] uppercase text-stone-light mb-1">
        {label}
      </p>
      <p className="text-[0.72rem] font-light text-stone-light/70 mb-3">{description}</p>

      {/* Preview */}
      <div className={`${aspectClass} w-full bg-ink-raised border border-gold/15 rounded-sm overflow-hidden mb-4`}>
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-display italic text-stone-light/40 text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {step === 'uploading' && (
        <div className="w-full h-0.5 bg-ink-raised rounded-full mb-3 overflow-hidden">
          <div
            className="h-full bg-gold transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[0.78rem] font-light text-[#c0544a] mb-3">{error}</p>
      )}

      {/* Done flash */}
      {step === 'done' && (
        <p className="text-[0.78rem] font-light text-[#5a9e6e] mb-3">Saved</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_MIME_TYPES.join(',')}
        className="hidden"
        onChange={handleFileChange}
        data-testid={`file-input-${field}`}
      />
      <button
        type="button"
        disabled={step === 'uploading'}
        onClick={() => {
          setStep('idle')
          setError(null)
          inputRef.current?.click()
        }}
        className="bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white font-body text-sm font-light uppercase tracking-[0.04em] px-6 py-2.5 rounded-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {step === 'uploading' ? `Uploading… ${progress}%` : 'Choose image'}
      </button>
    </div>
  )
}
