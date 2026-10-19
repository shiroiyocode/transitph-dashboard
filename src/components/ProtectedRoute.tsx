import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoading, user, isSuperAdmin } = useAuth()

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--background)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            background: 'linear-gradient(135deg, #4A7CE0 0%, #6A9EFF 100%)',
            display: 'grid',
            placeItems: 'center',
            fontSize: '0.82rem',
            fontWeight: 800,
            color: 'white',
            boxShadow: '0 6px 16px rgba(46, 124, 246, 0.3)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>
            TPH
          </div>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            Checking access...
          </span>
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(0.95)} }`}</style>
      </div>
    )
  }

  if (!user || !isSuperAdmin) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
