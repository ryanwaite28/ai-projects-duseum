import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { useAuthStore } from '../../store/auth.store'
import { useFollowAuthor, useUnfollowAuthor, useAuthorNotifPref, useUpdateNotifPref } from '../../hooks/use-follows'
import { useNotificationPreferences } from '../../hooks/use-follows'
import type { NotificationPref } from '../../services/follows.service'

const PREF_LABELS: Record<NotificationPref, string> = {
  ALL_NEW_PIECES: 'All pieces',
  PUBLIC_ONLY:    'Public only',
  NONE:           'None',
}

interface FollowButtonProps {
  authorId:    string
  className?:  string
}

export const FollowButton = ({ authorId, className }: FollowButtonProps) => {
  const { user }      = useAuthStore()
  const navigate      = useNavigate()
  const { data: prefs } = useNotificationPreferences()
  const currentPref   = useAuthorNotifPref(authorId)
  const followMut     = useFollowAuthor(authorId)
  const unfollowMut   = useUnfollowAuthor(authorId)
  const updatePref    = useUpdateNotifPref()

  const isFollowing = !!prefs?.perAuthorOverrides.some((o) => o.authorId === authorId)

  const [open, setOpen]       = useState(false)
  const dropdownRef           = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleFollowClick = () => {
    if (!user) {
      navigate(`/login?return=/authors/${authorId}`)
      return
    }
    if (isFollowing) {
      setOpen((v) => !v)
    } else {
      followMut.mutate()
    }
  }

  const handlePrefChange = (pref: NotificationPref) => {
    updatePref.mutate({ perAuthorOverrides: [{ authorId, pref }] })
    setOpen(false)
  }

  const handleUnfollow = () => {
    unfollowMut.mutate()
    setOpen(false)
  }

  const isPending = followMut.isPending || unfollowMut.isPending

  return (
    <div className={cn('relative inline-block', className)} ref={dropdownRef}>
      <button
        onClick={handleFollowClick}
        disabled={isPending}
        className={cn(
          'w-full inline-flex items-center justify-center gap-2 font-body text-sm font-light uppercase tracking-[0.04em] px-8 py-[0.9rem] rounded-sm transition-all duration-200',
          isFollowing
            ? 'bg-transparent border border-gold/50 text-gold hover:border-gold hover:bg-gold/8'
            : 'bg-transparent border border-gold/25 hover:border-gold/60 text-parchment-dim hover:text-warm-white',
        )}
      >
        {isPending ? '…' : isFollowing ? 'Following ✓' : 'Follow'}
      </button>

      {isFollowing && open && (
        <div className="absolute right-0 mt-1 w-52 bg-ink-soft border border-gold/20 rounded-sm shadow-lg z-20 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gold/10">
            <p className="text-[0.65rem] font-medium tracking-[0.14em] uppercase text-stone-light">Notify me</p>
          </div>
          {(['ALL_NEW_PIECES', 'PUBLIC_ONLY', 'NONE'] as NotificationPref[]).map((pref) => (
            <button
              key={pref}
              onClick={() => handlePrefChange(pref)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-2.5 text-[0.8rem] font-light text-left transition-colors duration-150 hover:bg-gold/5',
                currentPref === pref ? 'text-gold' : 'text-parchment-dim',
              )}
            >
              {PREF_LABELS[pref]}
              {currentPref === pref && <span className="text-gold text-[0.65rem]">✓</span>}
            </button>
          ))}
          <div className="border-t border-gold/10">
            <button
              onClick={handleUnfollow}
              disabled={unfollowMut.isPending}
              className="w-full px-4 py-2.5 text-[0.8rem] font-light text-left text-stone-light hover:text-[#c0544a] hover:bg-white/[0.02] transition-colors duration-150"
            >
              Unfollow
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
