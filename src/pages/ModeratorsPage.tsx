import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getModeratorStats, updateUserRole } from '@/lib/firestoreApi'
import { Shield } from 'lucide-react'
import type { UserRole } from '@/types/models'

const PALETTE = ['#2E7CF6', '#9B7FE8', '#3EC97A', '#E05C6A', '#FFB547']
const avatarBg = (s?: string) => PALETTE[(s?.charCodeAt(0) ?? 0) % PALETTE.length]
const getInitials = (name?: string, email?: string) => {
  if (name) {
    const p = name.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }
  return (email ?? 'MO').slice(0, 2).toUpperCase()
}

function Avatar({ name, email, size = 32 }: { name?: string; email?: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, minWidth: size, maxWidth: size,
      borderRadius: Math.round(size * 0.28),
      background: avatarBg(email),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.22, fontWeight: 800, color: '#fff',
      flexShrink: 0, flexGrow: 0, letterSpacing: '0.02em',
      boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
    }}>
      {getInitials(name, email)}
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const s: React.CSSProperties = status === 'banned'
    ? { background: 'rgba(224,92,106,0.12)', color: '#E05C6A', border: '1px solid rgba(224,92,106,0.22)' }
    : status === 'restricted'
      ? { background: 'rgba(255,181,71,0.16)', color: '#C17C00', border: '1px solid rgba(193,124,0,0.28)' }
    : status === 'offline'
      ? { background: 'rgba(122,146,178,0.12)', color: '#7A92B2', border: '1px solid rgba(122,146,178,0.22)' }
      : { background: 'rgba(62,201,122,0.12)', color: '#3EC97A', border: '1px solid rgba(62,201,122,0.22)' }
  return (
    <span style={{ ...s, display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {status ?? 'offline'}
    </span>
  )
}

export function ModeratorsPage() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['moderators'], queryFn: getModeratorStats })
  const roleOptions: UserRole[] = ['user', 'moderator']

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateUserRole(id, role),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['moderators'] })
      await qc.invalidateQueries({ queryKey: ['users'] })
    },
  })

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">
      <div className="page-head">
        <div>
          <div className="page-head-title">Moderator Management</div>
          <div className="page-head-subtitle">Superadmin-only controls for moderator roles and activity</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'rgba(155,127,232,0.10)', border:'1px solid rgba(155,127,232,0.2)', borderRadius:10 }}>
          <Shield size={14} color="#9B7FE8" />
          <span style={{ fontSize:'0.82rem', fontWeight:700, color:'#9B7FE8' }}>{data.length} moderator{data.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Moderator</th><th>Email</th><th>Status</th><th>Routes Approved</th><th>Posts Moderated</th><th>Actions</th></tr></thead>
            <tbody>{Array.from({length:4}).map((_,i) => (
              <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="skeleton" /></td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : isError ? (
        <div className="state-banner error">
          Failed to load moderators. {(error as Error | undefined)?.message ?? 'Try again.'}
        </div>
      ) : !data.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><Shield size={22} /></div>
            <div className="empty-title">No moderators yet</div>
            <div className="empty-sub">Promote users from User Management to assign the moderator role.</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Moderator</th>
                <th>Email</th>
                <th>Status</th>
                <th>Routes Approved</th>
                <th>Posts Moderated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'nowrap' }}>
                      <Avatar name={m.name} email={m.email} />
                      <span style={{ fontWeight:600, fontSize:'0.84rem' }}>{m.name ?? 'Unknown'}</span>
                    </div>
                  </td>
                  <td style={{ color:'var(--text-secondary)', fontSize:'0.81rem' }}>{m.email}</td>
                  <td><StatusBadge status={m.status} /></td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:'0.72rem', fontWeight:700, background:'rgba(62,201,122,0.12)', color:'#3EC97A', border:'1px solid rgba(62,201,122,0.22)', whiteSpace:'nowrap' }}>
                      {m.routesApproved ?? 0} approved
                    </span>
                  </td>
                  <td>
                    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:'0.72rem', fontWeight:700, background:'rgba(46,124,246,0.10)', color:'#2E7CF6', border:'1px solid rgba(46,124,246,0.2)', whiteSpace:'nowrap' }}>
                      {m.postsModerated ?? 0} moderated
                    </span>
                  </td>
                  <td>
                    <select
                      value="moderator"
                      onChange={(e) => {
                        const nextRole = e.target.value as UserRole
                        if (nextRole !== 'moderator') {
                          if (confirm(`Change role for ${m.name} to ${nextRole}?`)) {
                            updateRole.mutate({ id: m.id, role: nextRole })
                          }
                          e.currentTarget.value = 'moderator'
                          return
                        }

                        updateRole.mutate({ id: m.id, role: nextRole })
                      }}
                      disabled={updateRole.isPending}
                      style={{ width:'auto', minWidth:124, fontSize:'0.76rem', padding:'5px 8px' }}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
