import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuthStore()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to={`/login?return=${encodeURIComponent(location.pathname)}`} replace />
  }

  return <>{children}</>
}
