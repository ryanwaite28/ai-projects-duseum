import { useRef, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/use-me'

export const UserMenu = () => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { user, signOut } = useAuthStore()
  const { data: me } = useMe()
  const navigate = useNavigate()

  const initial = (user?.email ?? 'U')[0].toUpperCase()
  const isAuthor = me?.account != null && me.authorProfile != null

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const close = () => setOpen(false)

  const handleSignOut = async () => {
    close()
    await signOut()
    navigate('/')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        className="w-8 h-8 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.85rem] text-gold font-semibold bg-ink hover:bg-gold/10 transition-colors duration-150"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] w-56 bg-ink-soft border border-gold/20 rounded-sm shadow-lg z-50 py-1 animate-fade-in">
          {/* Account info */}
          <div className="px-4 py-2.5 border-b border-gold/10">
            <p className="text-[0.7rem] font-medium tracking-[0.12em] uppercase text-stone-light">
              Signed in as
            </p>
            <p className="text-[0.82rem] text-parchment-dim truncate mt-0.5">
              {user?.email}
            </p>
          </div>

          {/* Navigation */}
          <nav className="py-1">
            <MenuLink to="/dashboard" onClick={close}>My Account</MenuLink>
            <MenuLink to="/dashboard/viewer" onClick={close}>Viewer Dashboard</MenuLink>

            {isAuthor ? (
              <MenuLink to="/dashboard/author" onClick={close}>Author Dashboard</MenuLink>
            ) : (
              <MenuLink to="/onboarding/author" onClick={close}>
                <span className="text-gold-light">Become an Author</span>
              </MenuLink>
            )}
          </nav>

          <div className="border-t border-gold/10 py-1">
            <MenuLink to="/upload" onClick={close} hidden={!isAuthor}>Upload Artwork</MenuLink>
            <MenuLink to="/settings/subscriptions" onClick={close}>Subscriptions</MenuLink>
            <MenuLink to="/settings/account" onClick={close}>Settings</MenuLink>
            <MenuLink to="/settings/notifications" onClick={close}>Notifications</MenuLink>
          </div>

          <div className="border-t border-gold/10 pt-1">
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-[0.82rem] text-stone-light hover:text-parchment hover:bg-ink-raised transition-colors duration-150 font-body"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface MenuLinkProps {
  to: string
  onClick: () => void
  children: React.ReactNode
  hidden?: boolean
}

const MenuLink = ({ to, onClick, children, hidden }: MenuLinkProps) => {
  if (hidden) return null
  return (
    <Link
      to={to}
      onClick={onClick}
      className="block px-4 py-2 text-[0.82rem] text-stone-light hover:text-parchment hover:bg-ink-raised transition-colors duration-150 font-body"
    >
      {children}
    </Link>
  )
}
