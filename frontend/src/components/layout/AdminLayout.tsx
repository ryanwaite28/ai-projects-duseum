import { NavLink, Navigate } from 'react-router-dom'
import { useMe } from '../../hooks/use-me'
import { cn } from '../../lib/utils'

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/users',     label: 'Users'     },
  { to: '/admin/content',   label: 'Content'   },
  { to: '/admin/config',    label: 'Config'    },
  { to: '/admin/features',  label: 'Features'  },
] as const

interface AdminLayoutProps {
  children: React.ReactNode
  title:    string
}

export const AdminLayout = ({ children, title }: AdminLayoutProps) => {
  const { data: me, isLoading } = useMe()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
      </div>
    )
  }

  if (!me || me.account.systemRole !== 'ADMIN') {
    return <Navigate to="/403" replace />
  }

  return (
    <div className="min-h-screen bg-ink font-body flex">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-gold/10 bg-ink-soft pt-8 pb-6 px-4 fixed top-0 left-0 bottom-0 z-40">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 mb-8 px-2 no-underline">
          <div className="w-7 h-7 border-[1.5px] border-gold rounded-md flex items-center justify-center font-display text-[0.85rem] text-gold font-semibold">
            D
          </div>
          <span className="font-display text-[1rem] font-semibold text-warm-white tracking-[0.02em]">
            Duseum
          </span>
        </NavLink>

        {/* Admin badge */}
        <div className="mb-6 px-2">
          <span className="text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'px-3 py-2 rounded-sm text-[0.82rem] font-medium tracking-[0.04em] uppercase transition-colors duration-150',
                  isActive
                    ? 'bg-gold/10 text-gold border border-gold/20'
                    : 'text-stone-light hover:text-parchment hover:bg-white/[0.03]'
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ── Mobile top bar ───────────────────────────────────────────────────── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-ink-soft border-b border-gold/10 px-4 py-3 flex items-center gap-3 overflow-x-auto">
        <span className="text-[0.62rem] font-medium tracking-[0.16em] uppercase text-gold bg-gold/12 px-[0.6rem] py-[0.25rem] rounded-sm shrink-0">
          Admin
        </span>
        {NAV_ITEMS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'shrink-0 px-3 py-1.5 rounded-sm text-[0.75rem] font-medium tracking-[0.04em] uppercase transition-colors duration-150',
                isActive
                  ? 'bg-gold/10 text-gold border border-gold/20'
                  : 'text-stone-light hover:text-parchment'
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 md:ml-56 pt-16 md:pt-0 min-h-screen">
        <div className="max-w-[1100px] mx-auto px-6 py-10">
          <h1 className="font-display text-[1.6rem] font-semibold text-warm-white mb-8">
            {title}
          </h1>
          {children}
        </div>
      </main>
    </div>
  )
}
