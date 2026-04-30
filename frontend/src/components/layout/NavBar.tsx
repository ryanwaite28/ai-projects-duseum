import { Link, NavLink } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/use-me'
import { Button } from '../ui/Button'
import { UserMenu } from './UserMenu'

export const NavBar = () => {
  const { user } = useAuthStore()
  const { data: me } = useMe()
  const isAuthor = !!user && me?.authorProfile != null

  return (
    <nav className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-10 py-5 bg-ink/80 backdrop-blur-xl border-b border-gold/12">
      {/* Logo mark */}
      <Link to="/" className="flex items-center gap-2 no-underline">
        <div className="w-8 h-8 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.95rem] text-gold font-semibold">
          D
        </div>
        <span className="font-display text-[1.1rem] font-semibold text-warm-white tracking-[0.02em]">
          Duseum
        </span>
      </Link>

      {/* Nav links */}
      <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
        <li>
          <NavLink
            to="/browse"
            className="text-[0.85rem] font-light text-stone-light uppercase tracking-[0.04em] hover:text-parchment transition-colors duration-200"
          >
            Browse
          </NavLink>
        </li>
        <li>
          <NavLink
            to="/authors"
            className="text-[0.85rem] font-light text-stone-light uppercase tracking-[0.04em] hover:text-parchment transition-colors duration-200"
          >
            Authors
          </NavLink>
        </li>
      </ul>

      {/* Auth controls */}
      <div className="flex items-center gap-3">
        {user ? (
          <>
            {isAuthor && (
              <Link to="/upload">
                <Button variant="ghost">Upload</Button>
              </Link>
            )}
            <UserMenu />
          </>
        ) : (
          <>
            <Link to="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/register" className="hidden sm:block">
              <Button variant="primary">Join</Button>
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
