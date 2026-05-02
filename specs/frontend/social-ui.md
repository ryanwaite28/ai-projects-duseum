## Spec: Social Interactions UI (Comments & Reactions)

**Status**: ✅ Implemented
**FR coverage**: FR-SOC-01, FR-SOC-02, FR-SOC-03, FR-SOC-04, FR-SOC-05, FR-VIEW-07
**Relevant PROJECT.md sections**: 2.9, 6.8

**What this implements**: Reaction buttons (LOVE, WOW, FIRE, INSPIRED) on piece detail page; comment thread with nested replies; comment pinning UI for Authors; comment moderation actions.

**Prerequisites**: Comments and reactions API endpoints complete (`social/comments.md`, `social/reactions.md`); Artwork detail page exists; React Query configured; `social.service.ts` implemented

**Done when**:
- [x] `ReactionBar` shows 4 reaction types with counts; authenticated viewer's current reaction highlighted
- [x] Clicking same reaction deletes it; clicking different reaction replaces it; optimistic update reverts on API error
- [x] Comment thread shows pinned comments first with visual pin indicator (gold left-border)
- [x] Reply form appears only one level deep — no reply-to-reply UI
- [x] Comment form shows disabled notice when `commentsEnabled=false` on piece
- [x] Author-of-piece sees pin (max 2) and delete actions on all comments
- [x] Spec `**Status**` updated to ✅ Implemented

**New/modified files**:
- `frontend/src/components/social/ReactionBar.tsx` — 4 reaction buttons with counts; toggle behavior
- `frontend/src/components/social/CommentThread.tsx` — paginated comment list with nested replies
- `frontend/src/components/social/CommentForm.tsx` — new comment + reply input
- `frontend/src/components/social/Comment.tsx` — individual comment with pin/delete actions
- `frontend/src/services/social.service.ts` — `upsertReaction()`, `deleteReaction()`, `createComment()`, `listComments()`, `deleteComment()`, `pinComment()`

**Design system**:
- Reaction buttons: ghost variant with emoji + count; active state: `bg-gold/10 border-gold/60 text-gold`
- Comments: `bg-ink-soft` cards with gold left-border for pinned; nested replies indented
- Comment form: `textarea` with `bg-ink-soft border border-gold/20`; char count indicator near 1000

**Business logic**:
1. Reaction bar:
   - Shows counts per type; authenticated viewer's current reaction highlighted
   - Click same reaction → delete; click different → replace; no auth → redirect to login
   - Optimistic update (React Query mutation) → revert on error
2. Comment thread:
   - Top-level comments + inline replies (one level max)
   - Pinned comments shown first with visual indicator
   - Reply: click "Reply" on top-level → inline reply form appears
   - Delete own comment (soft-delete): shows "[Deleted]" placeholder if had replies
   - Author of piece can pin (max 2) / delete any comment
   - Admin can delete any comment
3. Comment form disabled when `commentsEnabled=false` on piece with notice

**Tests to write**:
- Component: `ReactionBar` optimistic update reverts on API error
- Component: `CommentThread` shows pinned comments first; reply form appears on click
