import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/AppLayout'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { UsersPage } from '@/pages/UsersPage'
import { ModeratorsPage } from '@/pages/ModeratorsPage'
import { RoutesPage } from '@/pages/RoutesPage'
import { PostsPage } from '@/pages/PostsPage'
import { AnnouncementsPage } from '@/pages/AnnouncementsPage'
import { FeedbackPage } from '@/pages/FeedbackPage'
import { SettingsPage } from '@/pages/SettingsPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/moderators" element={<ModeratorsPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/posts" element={<PostsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
