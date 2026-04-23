import { useState, useRef, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { GoldDivider } from '../ui/GoldDivider'
import { useUpload, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../../hooks/use-upload'
import type { ArtworkCategory, ArtworkVisibility } from '../../types/artwork'

const CATEGORIES: ArtworkCategory[] = [
  'PAINTING', 'ILLUSTRATION', 'DIGITAL', 'PHOTOGRAPHY', 'SCULPTURE', 'MIXED_MEDIA', 'OTHER',
]

const CATEGORY_LABELS: Record<ArtworkCategory, string> = {
  PAINTING: 'Painting', ILLUSTRATION: 'Illustration', DIGITAL: 'Digital Art',
  PHOTOGRAPHY: 'Photography', SCULPTURE: 'Sculpture', MIXED_MEDIA: 'Mixed Media', OTHER: 'Other',
}

const STEP_LABELS: Record<string, string> = {
  'requesting-intent': 'Preparing upload…',
  'uploading':         'Uploading to cloud…',
  'creating':          'Saving artwork…',
  'done':              'Published!',
}

export const UploadForm = () => {
  const navigate = useNavigate()
  const { step, progress, error, artwork, upload, reset, validateFile } = useUpload()

  // Form state
  const [file,            setFile]            = useState<File | null>(null)
  const [fileError,       setFileError]        = useState<string | null>(null)
  const [previewUrl,      setPreviewUrl]       = useState<string | null>(null)
  const [title,           setTitle]            = useState('')
  const [description,     setDescription]      = useState('')
  const [category,        setCategory]         = useState<ArtworkCategory>('PAINTING')
  const [tagInput,        setTagInput]         = useState('')
  const [tags,            setTags]             = useState<string[]>([])
  const [visibility,      setVisibility]       = useState<ArtworkVisibility>('PUBLIC')
  const [commentsEnabled, setCommentsEnabled]  = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSubmitting = step === 'requesting-intent' || step === 'uploading' || step === 'creating'

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    setFile(null)
    setPreviewUrl(null)
    setFileError(null)
    if (!picked) return

    const err = validateFile(picked)
    if (err) { setFileError(err); return }

    setFile(picked)
    setPreviewUrl(URL.createObjectURL(picked))
  }

  const addTag = () => {
    const normalized = tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
    if (!normalized || tags.includes(normalized) || tags.length >= 10) return
    setTags([...tags, normalized])
    setTagInput('')
  }

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t))

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!file || !title.trim()) return
    await upload(file, { title: title.trim(), description: description.trim() || undefined, category, tags, visibility, commentsEnabled })
  }

  // After success, navigate to the new artwork
  if (step === 'done' && artwork) {
    return (
      <div className="text-center py-16 flex flex-col items-center gap-6">
        <div className="w-12 h-12 rounded-full bg-[#5a9e6e]/20 border border-[#5a9e6e]/40 flex items-center justify-center">
          <span className="text-[#5a9e6e] text-xl">✓</span>
        </div>
        <div>
          <h2 className="font-display text-[1.5rem] text-warm-white mb-2">Artwork published</h2>
          <p className="text-[0.88rem] font-light text-stone-light">{artwork.title}</p>
        </div>
        <div className="flex gap-4">
          <Button variant="primary" onClick={() => navigate(`/artworks/${artwork.artworkId}`)}>
            View Artwork
          </Button>
          <Button variant="secondary" onClick={reset}>
            Upload Another
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8 max-w-2xl mx-auto">
      {/* File picker */}
      <div>
        <p className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold mb-3">
          Image file
        </p>

        <div
          className={cn(
            'relative border border-dashed rounded-sm cursor-pointer transition-colors duration-200',
            fileError ? 'border-[#c0544a]/60 bg-[#c0544a]/5' : 'border-gold/25 hover:border-gold/50 bg-ink-soft'
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(',')}
            className="hidden"
            onChange={handleFileChange}
          />

          {previewUrl ? (
            <div className="relative">
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full max-h-64 object-contain rounded-sm"
              />
              <div className="absolute top-3 right-3 bg-ink/80 border border-gold/20 rounded-sm px-3 py-1 text-[0.75rem] text-parchment-dim">
                {file!.name} · {(file!.size / 1024 / 1024).toFixed(1)} MB
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <div className="text-[2rem] text-gold/30">+</div>
              <p className="text-[0.82rem] font-light text-stone-light text-center">
                Click to select · JPEG, PNG, WEBP, GIF · Max {MAX_FILE_SIZE_BYTES / 1024 / 1024} MB
              </p>
            </div>
          )}
        </div>

        {fileError && (
          <p className="mt-2 text-[0.78rem] text-[#c0544a]">{fileError}</p>
        )}
      </div>

      <GoldDivider />

      {/* Title */}
      <div className="flex flex-col gap-2">
        <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
          Title <span className="text-[#c0544a]">*</span>
        </label>
        <input
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200"
          placeholder="Name your artwork"
        />
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
          Description <span className="text-stone-light font-light normal-case tracking-normal text-[0.72rem]">(optional)</span>
        </label>
        <textarea
          rows={4}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200 resize-none"
          placeholder="Describe your artwork, technique, or inspiration…"
        />
        <p className="text-[0.72rem] text-stone-light text-right">{description.length} / 2000</p>
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
          Category
        </label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ArtworkCategory)}
          className="bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment outline-none transition-colors duration-200 appearance-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-2">
        <label className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">
          Tags <span className="text-stone-light font-light normal-case tracking-normal text-[0.72rem]">(up to 10)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            disabled={tags.length >= 10}
            className="flex-1 bg-ink-soft border border-gold/20 focus:border-gold/50 rounded-sm px-4 py-3 text-[0.9rem] font-light text-parchment placeholder:text-stone-light outline-none transition-colors duration-200 disabled:opacity-40"
            placeholder="Add a tag and press Enter"
          />
          <Button type="button" variant="secondary" onClick={addTag} className="px-4 py-3">
            Add
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 font-mono text-[0.75rem] text-stone-light bg-white/[0.03] border border-gold/12 px-3 py-1 rounded-sm"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="text-gold/50 hover:text-gold transition-colors duration-150 leading-none"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Visibility */}
      <div className="flex flex-col gap-2">
        <p className="text-[0.68rem] font-medium tracking-[0.14em] uppercase text-gold">Visibility</p>
        <div className="grid grid-cols-3 gap-3">
          {(['PUBLIC', 'PRIVATE', 'DRAFT'] as ArtworkVisibility[]).map((v) => (
            <label
              key={v}
              className={cn(
                'flex flex-col gap-1 p-4 border rounded-sm cursor-pointer transition-all duration-200',
                visibility === v
                  ? 'border-gold/50 bg-gold/5'
                  : 'border-gold/15 bg-ink-soft hover:border-gold/30'
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={v}
                checked={visibility === v}
                onChange={() => setVisibility(v)}
                className="sr-only"
              />
              <span className="text-[0.72rem] font-medium tracking-[0.12em] uppercase text-gold">
                {v}
              </span>
              <span className="text-[0.72rem] font-light text-stone-light">
                {v === 'PUBLIC' && 'Visible to all'}
                {v === 'PRIVATE' && 'Subscribers only'}
                {v === 'DRAFT' && 'Only you'}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Comments toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          className={cn(
            'w-10 h-5 rounded-full border transition-colors duration-200 relative',
            commentsEnabled ? 'bg-gold border-gold' : 'bg-ink-soft border-gold/30'
          )}
          onClick={() => setCommentsEnabled(!commentsEnabled)}
        >
          <div className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-ink transition-transform duration-200',
            commentsEnabled ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </div>
        <span className="text-[0.85rem] font-light text-parchment-dim">Enable comments</span>
      </label>

      {/* Upload error */}
      {error && (
        <div className="px-4 py-3 border border-[#c0544a]/40 bg-[#c0544a]/10 rounded-sm">
          <p className="text-[0.82rem] text-[#c0544a] font-light">{error}</p>
        </div>
      )}

      {/* Progress */}
      {isSubmitting && (
        <div className="flex flex-col gap-2">
          <div className="h-px bg-ink-soft rounded-full overflow-hidden">
            <div
              className="h-full bg-gold transition-all duration-300 ease-out"
              style={{ width: step === 'uploading' ? `${progress}%` : step === 'creating' ? '95%' : '20%' }}
            />
          </div>
          <p className="text-[0.78rem] font-light text-stone-light">
            {STEP_LABELS[step]}
            {step === 'uploading' && ` ${progress}%`}
          </p>
        </div>
      )}

      {/* Submit */}
      <Button
        type="submit"
        variant="primary"
        disabled={isSubmitting || !file || !title.trim()}
        className="w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isSubmitting ? STEP_LABELS[step] : 'Publish Artwork'}
      </Button>
    </form>
  )
}
