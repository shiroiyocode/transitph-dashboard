import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3, Bell, LogOut, Megaphone,
  MessageSquareWarning, Route, Settings, Shield, Users,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    links: [{ to: '/', label: 'Dashboard', icon: BarChart3 }],
  },
  {
    label: 'People',
    links: [
      { to: '/users', label: 'User Management', icon: Users },
      { to: '/moderators', label: 'Moderators', icon: Shield },
    ],
  },
  {
    label: 'Content',
    links: [
      { to: '/routes', label: 'Route Management', icon: Route },
      { to: '/posts', label: 'Post Moderation', icon: MessageSquareWarning },
      { to: '/announcements', label: 'Announcements', icon: Megaphone },
      { to: '/feedback', label: 'Feedback & Reports', icon: Bell },
    ],
  },
  {
    label: 'System',
    links: [{ to: '/settings', label: 'App Configuration', icon: Settings }],
  },
]

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    const parts = name.trim().split(' ')
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return 'SA'
}

const AVATAR_COLORS = ['#2E7CF6', '#9B7FE8', '#3EC97A', '#FFB547', '#E05C6A']
function getAvatarColor(str?: string | null) {
  if (!str) return AVATAR_COLORS[0]
  return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]
}

export function AppLayout() {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  const onLogout = async () => {
    await logout()
    navigate('/login')
  }

  const initials = getInitials(user?.displayName, user?.email)
  const avatarColor = getAvatarColor(user?.email)
  const displayName = user?.displayName ?? user?.email?.split('@')[0] ?? 'Admin'

  return (
    <div className="layout">
      <aside className="sidebar">

        <div className="sidebar-brand">
          <div className="brand-badge">TPH</div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-title">TransitPH</span>
            <span className="sidebar-brand-sub">Super Admin Console</span>
          </div>
        </div>

        <div className="profile-card">
          <div style={{
            width: 36, height: 36, minWidth: 36, maxWidth: 36,
            borderRadius: 10, background: avatarColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.78rem', fontWeight: 800, color: '#fff',
            flexShrink: 0, letterSpacing: '0.02em',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
            {initials}
          </div>
          <div className="profile-info">
            <div className="profile-name">{displayName}</div>
            <span className="profile-role">{role ?? 'superadmin'}</span>
          </div>
        </div>

        {NAV_SECTIONS.map((section) => (
          <div key={section.label} style={{ display: 'grid', gap: 2 }}>
            <div className="nav-section-label">{section.label}</div>
            {section.links.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="nav-icon">
                    <Icon size={15} />
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}

        <div className="sidebar-footer">
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              background: 'rgba(224,92,106,0.08)',
              border: '1px solid rgba(224,92,106,0.18)',
              color: '#E05C6A',
              fontSize: '0.84rem',
              fontWeight: 600,
              fontFamily: 'Manrope, sans-serif',
              cursor: 'pointer',
              transition: 'all 0.17s ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = '#E05C6A'
              el.style.color = '#fff'
              el.style.borderColor = 'transparent'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(224,92,106,0.08)'
              el.style.color = '#E05C6A'
              el.style.borderColor = 'rgba(224,92,106,0.18)'
            }}
          >
            <span style={{
              width: 30, height: 30, minWidth: 30,
              borderRadius: 8,
              background: 'rgba(224,92,106,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <LogOut size={15} />
            </span>
            <span>Log out</span>
          </button>
        </div>

      </aside>

      <main className="main">
        <div className="page-shell">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
