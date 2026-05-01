## Spec: Author Settings — Shareable Profile Link

**Status**: ✅ Implemented
**FR coverage**: FR-AUTH-PROF-07
**Relevant PROJECT.md sections**: 2.3, 6.8

**What this implements**: Adds a shareable link section to the Author account settings page showing the Author's public profile URL and a copy-to-clipboard button. Also shows a direct link to their public gallery (pieces only).

**New/modified files**:
- `frontend/src/` — add shareable link UI block to the author settings page (exact file TBD at implementation time)
- No backend changes — the Author's public profile page already exists at `/authors/{authorId}`

**Business logic**:
1. In the Author settings page, add a "Share Your Profile" section
2. Display two links:
   - Profile page: `{APP_BASE_URL}/authors/{authorId}`
   - Public gallery: `{APP_BASE_URL}/authors/{authorId}?tab=gallery` (or equivalent public route)
3. Each link has a copy-to-clipboard button; clicking shows a brief "Copied!" confirmation
4. Links constructed from `APP_BASE_URL` env var + the authenticated author's `userId` (available from the auth context)

**Done when**:
- [x] Author settings page shows shareable profile URL
- [x] Copy-to-clipboard works and shows "Copied!" confirmation
- [x] URL is correct for both dev and prod environments (uses env-aware base URL)

**Tests to write**: none new — manual verification
