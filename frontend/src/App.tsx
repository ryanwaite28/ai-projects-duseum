import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client'
import { useAuthStore } from './store/auth.store'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AdminGuard } from './middleware/admin-guard'

const HomePage                   = lazy(() => import('./pages/home'))
const BrowseAtriumPage           = lazy(() => import('./pages/browse-atrium'))
const BrowsePage                 = lazy(() => import('./pages/browse'))
const BrowseCollectionsPage      = lazy(() => import('./pages/browse-collections'))
const CollectionDetailPage       = lazy(() => import('./pages/collection-detail'))
const AuthorsPage                = lazy(() => import('./pages/authors'))
const ArtworkDetailPage          = lazy(() => import('./pages/artwork-detail'))
const AuthorProfilePage          = lazy(() => import('./pages/author-profile'))
const UploadPage                 = lazy(() => import('./pages/upload'))
const DashboardIndexPage         = lazy(() => import('./pages/dashboard/index'))
const DashboardViewerPage        = lazy(() => import('./pages/dashboard/viewer'))
const AuthorDashboardAuthorPage  = lazy(() => import('./pages/dashboard/author'))
const AuthorOnboardingPage       = lazy(() => import('./pages/onboarding/author'))
const SubscriptionsPage              = lazy(() => import('./pages/subscriptions'))
const SubscriptionSuccessPage        = lazy(() => import('./pages/subscription/success'))
const SubscriptionCancelPage         = lazy(() => import('./pages/subscription/cancel'))
const SettingsIndexPage              = lazy(() => import('./pages/settings/index'))
const AccountSettingsPage            = lazy(() => import('./pages/settings/account'))
const SubscriptionsSettingsPage      = lazy(() => import('./pages/settings/subscriptions'))
const NotificationsSettingsPage      = lazy(() => import('./pages/settings/notifications'))
const UnsubscribePage                = lazy(() => import('./pages/notifications/unsubscribe'))
const AdminDashboardPage             = lazy(() => import('./pages/admin/dashboard'))
const AdminUsersPage                 = lazy(() => import('./pages/admin/users'))
const AdminContentPage               = lazy(() => import('./pages/admin/content'))
const AdminConfigPage                = lazy(() => import('./pages/admin/config'))
const AdminFeaturesPage              = lazy(() => import('./pages/admin/features'))
const ForbiddenPage                  = lazy(() => import('./pages/errors/forbidden'))
const LoginPage                      = lazy(() => import('./pages/auth/login'))
const RegisterPage                   = lazy(() => import('./pages/auth/register'))
const VerifyPage                     = lazy(() => import('./pages/auth/verify-email'))
const ResetPasswordPage              = lazy(() => import('./pages/auth/reset-password'))

const PageLoader = () => (
  <div className="min-h-screen bg-ink flex items-center justify-center">
    <div className="w-1.5 h-1.5 rounded-full bg-gold animate-float" />
  </div>
)

function AppRoutes() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"                       element={<HomePage />} />
        <Route path="/browse"                 element={<BrowseAtriumPage />} />
        <Route path="/browse/pieces"          element={<BrowsePage />} />
        <Route path="/browse/collections"     element={<BrowseCollectionsPage />} />
        <Route path="/collections/:collectionId" element={<CollectionDetailPage />} />
        <Route path="/authors"                element={<AuthorsPage />} />
        <Route path="/authors/:authorId"      element={<AuthorProfilePage />} />
        <Route path="/artworks/:artworkId"    element={<ArtworkDetailPage />} />
        <Route path="/upload"                 element={<UploadPage />} />
        <Route path="/login"                  element={<LoginPage />} />
        <Route path="/register"               element={<RegisterPage />} />
        <Route path="/verify-email"           element={<VerifyPage />} />
        <Route path="/reset-password"         element={<ResetPasswordPage />} />

        {/* ── Authenticated ───────────────────────────────────────── */}
        <Route path="/dashboard"              element={<ProtectedRoute><DashboardIndexPage /></ProtectedRoute>} />
        <Route path="/dashboard/viewer"       element={<ProtectedRoute><DashboardViewerPage /></ProtectedRoute>} />
        <Route path="/dashboard/author"       element={<Navigate to="/dashboard/author/overview" replace />} />
        <Route path="/dashboard/author/:tab"  element={<ProtectedRoute><AuthorDashboardAuthorPage /></ProtectedRoute>} />
        <Route path="/onboarding/author"      element={<ProtectedRoute><AuthorOnboardingPage /></ProtectedRoute>} />
        <Route path="/subscriptions"          element={<ProtectedRoute><SubscriptionsPage /></ProtectedRoute>} />
        <Route path="/subscription/success"   element={<SubscriptionSuccessPage />} />
        <Route path="/subscription/cancel"    element={<SubscriptionCancelPage />} />
        <Route path="/settings"               element={<ProtectedRoute><SettingsIndexPage /></ProtectedRoute>} />
        <Route path="/settings/account"       element={<ProtectedRoute><AccountSettingsPage /></ProtectedRoute>} />
        <Route path="/settings/subscriptions" element={<ProtectedRoute><SubscriptionsSettingsPage /></ProtectedRoute>} />
        <Route path="/settings/notifications" element={<ProtectedRoute><NotificationsSettingsPage /></ProtectedRoute>} />
        <Route path="/notifications/unsubscribe" element={<UnsubscribePage />} />

        {/* ── Admin (requires systemRole=ADMIN) ───────────────────── */}
        <Route path="/admin/dashboard" element={<AdminGuard><AdminDashboardPage /></AdminGuard>} />
        <Route path="/admin/users"     element={<AdminGuard><AdminUsersPage /></AdminGuard>} />
        <Route path="/admin/content"   element={<AdminGuard><AdminContentPage /></AdminGuard>} />
        <Route path="/admin/config"    element={<AdminGuard><AdminConfigPage /></AdminGuard>} />
        <Route path="/admin/features"  element={<AdminGuard><AdminFeaturesPage /></AdminGuard>} />

        <Route path="/403"                          element={<ForbiddenPage />} />

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
