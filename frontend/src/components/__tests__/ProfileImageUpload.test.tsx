// =============================================================================
// frontend/src/components/__tests__/ProfileImageUpload.test.tsx
// Tests for ProfileImageUpload component.
// Covers: idle render, upload progress, error state, success callback.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { render } from '../../test/test-utils'
import { ProfileImageUpload } from '../ui/ProfileImageUpload'

vi.mock('../../services/artworks.service', () => ({
  getUploadIntent: vi.fn(),
  uploadToS3:      vi.fn(),
}))

vi.mock('../../services/authors.service', () => ({
  updateAuthorProfile: vi.fn(),
}))

vi.mock('../../hooks/use-me', () => ({
  useMeQueryKey: ['users', 'me'],
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  }
})

// jsdom does not implement URL.createObjectURL — provide a stub
global.URL.createObjectURL = vi.fn(() => 'blob:test-preview-url')

import { getUploadIntent, uploadToS3 } from '../../services/artworks.service'
import { updateAuthorProfile } from '../../services/authors.service'

const mockGetUploadIntent  = vi.mocked(getUploadIntent)
const mockUploadToS3       = vi.mocked(uploadToS3)
const mockUpdateAuthorProfile = vi.mocked(updateAuthorProfile)

const defaultProps = {
  label:       'Icon',
  description: 'Upload your profile icon.',
  currentUrl:  null,
  field:       'profilePhotoS3Key' as const,
  aspectClass: 'aspect-square',
}

describe('ProfileImageUpload', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders file input and choose button in idle state', () => {
    render(<ProfileImageUpload {...defaultProps} />)
    expect(screen.getByText('Icon')).toBeInTheDocument()
    expect(screen.getByText('Choose image')).toBeInTheDocument()
    expect(screen.getByTestId('file-input-profilePhotoS3Key')).toBeInTheDocument()
  })

  it('renders current image when currentUrl is provided', () => {
    render(<ProfileImageUpload {...defaultProps} currentUrl="https://cdn.test/icon.jpg" />)
    const img = screen.getByRole('img', { name: 'Icon' })
    expect(img).toHaveAttribute('src', 'https://cdn.test/icon.jpg')
  })

  it('shows "No image" placeholder when currentUrl is null', () => {
    render(<ProfileImageUpload {...defaultProps} />)
    expect(screen.getByText('No image')).toBeInTheDocument()
  })

  it('shows error for unsupported file type', async () => {
    render(<ProfileImageUpload {...defaultProps} />)
    const input = screen.getByTestId('file-input-profilePhotoS3Key')
    const file = new File(['data'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() =>
      expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument()
    )
  })

  it('shows error for file exceeding 20 MB', async () => {
    render(<ProfileImageUpload {...defaultProps} />)
    const input = screen.getByTestId('file-input-profilePhotoS3Key')
    const bigFile = new File(['x'.repeat(1)], 'big.jpg', { type: 'image/jpeg' })
    Object.defineProperty(bigFile, 'size', { value: 21 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [bigFile] } })
    await waitFor(() =>
      expect(screen.getByText(/file too large/i)).toBeInTheDocument()
    )
  })

  it('shows "Saved" and calls updateAuthorProfile on successful upload', async () => {
    mockGetUploadIntent.mockResolvedValueOnce({ uploadUrl: 'https://s3.test/put', s3Key: 'new-key', intentId: 'i-1', expiresAt: '' })
    mockUploadToS3.mockImplementationOnce(async (_url, _file, onProgress) => { onProgress(100) })
    mockUpdateAuthorProfile.mockResolvedValueOnce({})

    render(<ProfileImageUpload {...defaultProps} />)
    const input = screen.getByTestId('file-input-profilePhotoS3Key')
    const file = new File(['img'], 'icon.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument())
    expect(mockUpdateAuthorProfile).toHaveBeenCalledWith({ profilePhotoS3Key: 'new-key' })
  })

  it('shows API error message on upload failure', async () => {
    mockGetUploadIntent.mockRejectedValueOnce(new Error('Network error'))

    render(<ProfileImageUpload {...defaultProps} />)
    const input = screen.getByTestId('file-input-profilePhotoS3Key')
    const file = new File(['img'], 'icon.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByText('Network error')).toBeInTheDocument()
    )
  })

  it('disables the choose button during upload', async () => {
    let resolveUpload!: () => void
    mockGetUploadIntent.mockResolvedValueOnce({ uploadUrl: 'https://s3.test/put', s3Key: 'k', intentId: 'i', expiresAt: '' })
    mockUploadToS3.mockReturnValueOnce(new Promise<void>((res) => { resolveUpload = res }))

    render(<ProfileImageUpload {...defaultProps} />)
    const input = screen.getByTestId('file-input-profilePhotoS3Key')
    const file = new File(['img'], 'icon.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() =>
      expect(screen.getByRole('button')).toBeDisabled()
    )

    resolveUpload()
  })
})
