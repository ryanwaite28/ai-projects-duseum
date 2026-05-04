## Spec: Author Icon & Wallpaper Upload

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-01, FR-AUTH-PROF-07
**Relevant PROJECT.md sections**: 2.4, 4.2, 4.4, 6.8
**Related specs**: `specs/users/author-onboarding.md`

**What this implements**: Authors can upload a profile icon (small avatar) and a wallpaper (full-bleed banner) via their account settings. The icon appears next to the author's name on artwork detail pages. Both images appear on the author's public profile page — the wallpaper spanning full viewport width immediately below the navbar, and the icon displayed as an overlapping avatar circle at the bottom-left of the wallpaper.

---

## Terminology mapping

| UX label | DynamoDB field | API field (`GET /authors/:id`) | Frontend type field |
|---|---|---|---|
| Icon | `profilePhotoS3Key` | `profilePhotoUrl` | `avatarUrl` |
| Wallpaper | `coverPhotoS3Key` | `coverPhotoUrl` | `coverPhotoUrl` |

Both fields already existed on `AuthorProfile` in DynamoDB and were accepted by `PUT /users/me/author`. No new DynamoDB fields, GSIs, or Lambda routes were added.

---

## New/modified files

- `lambdas/artworks/src/routes/get-artwork.ts` — added `authorIconUrl: string | null` to the `GET /artworks/:artworkId` response (`publicUrl(authorProfile.profilePhotoS3Key)` or `null`)
- `frontend/src/types/artwork.ts` — added `authorIconUrl: string | null` to `Artwork` interface
- `frontend/src/services/authors.service.ts` — added `updateAuthorProfile(patch)` calling `PUT /users/me/author`
- `frontend/src/services/__tests__/authors.service.test.ts` — added 5 unit tests for `updateAuthorProfile()`
- `frontend/src/components/ui/ProfileImageUpload.tsx` — new reusable upload component (validate → upload-intent → S3 PUT → PUT /users/me/author)
- `frontend/src/components/__tests__/ProfileImageUpload.test.tsx` — 8 component tests (idle, preview, file type error, size error, success, API error, disabled during upload)
- `frontend/src/pages/settings/account.tsx` — added author-only "Profile Images" section with `ProfileImageUpload` for icon and wallpaper; uses `useAuthor(user.userId)` for resolved preview URLs
- `frontend/src/pages/author-profile.tsx` — wallpaper is now full-bleed (`w-full`, responsive height `h-56 sm:h-72 lg:h-80`); icon avatar (`w-20/24 h-20/24`, rounded-full) overlaps bottom-left of wallpaper via `absolute bottom-0 left-8 translate-y-1/2`; profile header section adds `pt-16 sm:pt-20` to clear the avatar
- `frontend/src/pages/artwork-detail.tsx` — author name link replaced with icon circle + name row; falls back to initials when `authorIconUrl` is null

---

## DynamoDB access patterns used

No new access patterns. `GET /artworks/:artworkId` already fetched `getAuthorProfile()`; only the response shape changed to include `authorIconUrl`.

---

## Upload flow (ProfileImageUpload component)

1. User selects file → client-side validate: MIME type allowlist + ≤ 20 MB
2. `POST /media/upload-intent` → `{ uploadUrl, s3Key }`
3. `PUT {uploadUrl}` directly to S3 via XHR with progress events (`uploadToS3` from `artworks.service.ts`)
4. `PUT /users/me/author` with `{ profilePhotoS3Key: s3Key }` (icon) or `{ coverPhotoS3Key: s3Key }` (wallpaper)
5. Invalidate `useMeQueryKey` + `authorQueryKey(userId)` so settings page and public profile reflect the update
6. Component sets `preview` to `URL.createObjectURL(file)` for immediate feedback

---

## IAM

No new IAM policies. The media lambda's existing policy covers `POST /media/upload-intent`. The existing `PUT /users/me/author` policy in `api-stack.ts` covers the author profile update.

---

## Done when

- [x] `GET /artworks/:artworkId` response includes `authorIconUrl: string | null`
- [x] Settings page shows "Profile Images" section for Authors with icon and wallpaper uploaders
- [x] Author profile page wallpaper is full-width, clears the fixed navbar, and shows the icon avatar overlapping the bottom of the wallpaper
- [x] Artwork detail page shows author icon circle next to author name link
- [x] 5 unit tests for `updateAuthorProfile()` pass
- [x] 8 `ProfileImageUpload` component tests pass
- [x] 2 integration tests for `authorIconUrl` in `get-artwork.integration.test.ts` are registered
- [x] `specs/testing/test-coverage.md` updated
