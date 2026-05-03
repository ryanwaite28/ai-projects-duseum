import { api } from './api'
import type {
  Artwork,
  ArtworkListResponse,
  ArtworkFilters,
  UploadIntentResponse,
  CreateArtworkRequest,
} from '../types/artwork'

// ── List artworks ─────────────────────────────────────────────────────────────

export const listArtworks = (
  filters: ArtworkFilters & { cursor?: string }
): Promise<ArtworkListResponse> => {
  const params = new URLSearchParams()
  if (filters.tag)      params.set('tag',      filters.tag)
  if (filters.category) params.set('category', filters.category)
  if (filters.authorId) params.set('authorId', filters.authorId)
  if (filters.sort)     params.set('sort',     filters.sort)
  if (filters.limit)    params.set('limit',    String(filters.limit))
  if (filters.cursor)   params.set('cursor',   filters.cursor)
  const qs = params.toString()
  return api.get<ArtworkListResponse>(`/artworks${qs ? `?${qs}` : ''}`)
}

// ── List own artworks (authenticated — all visibility tiers) ──────────────────

export const listMyArtworks = (
  params: { limit?: number; cursor?: string } = {}
): Promise<ArtworkListResponse> => {
  const qs = new URLSearchParams()
  if (params.limit)  qs.set('limit',  String(params.limit))
  if (params.cursor) qs.set('cursor', params.cursor)
  const q = qs.toString()
  return api.get<ArtworkListResponse>(`/artworks/mine${q ? `?${q}` : ''}`)
}

// ── Get single artwork ────────────────────────────────────────────────────────

export const getArtwork = (artworkId: string): Promise<Artwork> =>
  api.get<Artwork>(`/artworks/${artworkId}`)

// ── Create artwork (after upload) ─────────────────────────────────────────────

export const createArtwork = (body: CreateArtworkRequest): Promise<Artwork> =>
  api.post<Artwork>('/artworks', body)

// ── Update artwork metadata ───────────────────────────────────────────────────

export const updateArtwork = (
  artworkId: string,
  patch: Partial<Pick<CreateArtworkRequest, 'title' | 'description' | 'tags' | 'visibility' | 'commentsEnabled'>>
): Promise<Artwork> =>
  api.put<Artwork>(`/artworks/${artworkId}`, patch)

// ── Delete (archive) artwork ──────────────────────────────────────────────────

export const deleteArtwork = (artworkId: string, permanent = false): Promise<void> =>
  api.delete<void>(`/artworks/${artworkId}${permanent ? '?permanent=true' : ''}`)

// ── Upload intent ─────────────────────────────────────────────────────────────

export const getUploadIntent = (opts: {
  fileName:  string
  mimeType:  string
  sizeBytes: number
}): Promise<UploadIntentResponse> =>
  api.post<UploadIntentResponse>('/media/upload-intent', opts)

// ── Direct S3 presigned PUT with progress ─────────────────────────────────────

export const uploadToS3 = (
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed: ${xhr.status}`)))
    xhr.onerror = () => reject(new Error('S3 upload network error'))
    xhr.send(file)
  })
