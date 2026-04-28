import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useMe } from '../../hooks/use-me'

interface AdminRouteProps {
  children: React.ReactNode
}

export const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, isLoading: authLoading } = useAuthStore()
  const location = useLocation()
  const { data: me, isLoading: meLoading } = useMe()

  if (authLoading || meLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?return=${encodeURIComponent(location.pathname)}`} replace />
  }

  if (me?.account?.systemRole !== 'ADMIN') {
    return <Navigate to="/403" replace />
  }

  return <>{children}</>
}
