import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteUser, getUsers, liftUserRestriction, restrictUser, setUserBanStatus, updateUserRole } from '@/lib/firestoreApi'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ArrowUpDown, Search, Users } from 'lucide-react'
import type { AppUser, UserRole } from '@/types/models'

const PAGE_SIZE = 12

const PALETTE = ['#2E7CF6', '#9B7FE8', '#3EC97A', '#E05C6A', '#FFB547', '#4ECDC4', '#FF6B9D']
const avatarBg = (s?: string) => PALETTE[(s?.charCodeAt(0) ?? 0) % PALETTE.length]
const getInitials = (name?: string, email?: string) => {
  if (name) {
    const p = name.trim().split(' ')
    return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }
  return (email ?? 'U?').slice(0, 2).toUpperCase()
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

type BtnVariant = 'primary' | 'outline' | 'danger' | 'success'
const BTN_STYLES: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: 'linear-gradient(135deg,#4A7CE0,#6A9EFF)', color: '#fff', border: '1px solid transparent', boxShadow: '0 3px 10px rgba(46,124,246,0.3)' },
  outline: { background: '#fff', color: '#0F1D35', border: '1px solid #D4E4F7' },
  danger:  { background: 'rgba(224,92,106,0.10)', color: '#E05C6A', border: '1px solid rgba(224,92,106,0.25)' },
  success: { background: 'rgba(62,201,122,0.10)', color: '#3EC97A', border: '1px solid rgba(62,201,122,0.25)' },
}
function Btn({ variant = 'outline', sm, icon, children, disabled, onClick, style }: {
  variant?: BtnVariant; sm?: boolean; icon?: boolean; children?: React.ReactNode;
  disabled?: boolean; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{
      ...BTN_STYLES[variant],
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      padding: icon ? '0' : sm ? '5px 11px' : '8px 16px',
      width: icon ? 30 : undefined, height: icon ? 30 : undefined,
      borderRadius: sm ? 6 : 8, fontSize: sm ? '0.75rem' : '0.83rem',
      fontWeight: 600, fontFamily: 'Manrope, sans-serif',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.45 : 1,
      whiteSpace: 'nowrap', lineHeight: 1, transition: 'all 0.17s ease', ...style,
    }}>
      {children}
    </button>
  )
}

function RoleBadge({ role }: { role?: string }) {
  const s: React.CSSProperties =
    role === 'superadmin' ? { background: 'rgba(46,124,246,0.12)', color: '#2E7CF6', border: '1px solid rgba(46,124,246,0.2)' }
    : role === 'moderator' ? { background: 'rgba(155,127,232,0.12)', color: '#9B7FE8', border: '1px solid rgba(155,127,232,0.2)' }
    : { background: 'rgba(122,146,178,0.10)', color: '#7A92B2', border: '1px solid rgba(122,146,178,0.18)' }
  return (
    <span style={{ ...s, display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:99, fontSize:'0.72rem', fontWeight:700, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {role ?? 'user'}
    </span>
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
      {status ?? 'active'}
    </span>
  )
}

function getRestrictionDaysLabel(user: AppUser) {
  if (user.status === 'banned') return 'banned'
  if (user.status !== 'restricted') return user.status ?? 'active'
  if (!user.restrictedUntil) return 'restricted'

  const remainingMs = user.restrictedUntil.toMillis() - Date.now()
  if (remainingMs <= 0) return 'restricted'

  const daysLeft = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
  return `restricted (${daysLeft}d left)`
}

export function UsersPage() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['users'], queryFn: getUsers })

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<keyof AppUser>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)
  const [restrictConfirmId, setRestrictConfirmId] = useState<string | null>(null)
  const [restrictTypedText, setRestrictTypedText] = useState('')
  const [restrictDays, setRestrictDays] = useState(7)
  const [banConfirmId, setBanConfirmId] = useState<string | null>(null)
  const [banTypedText, setBanTypedText] = useState('')
  const [mutationError, setMutationError] = useState<string | null>(null)
  const roleOptions: UserRole[] = ['user', 'moderator']

  const list = useMemo(() => data
    .filter((u) => u.role !== 'superadmin')
    .filter((u) => statusFilter === 'all' || u.status === statusFilter)
    .filter((u) => `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = String(a[sortBy] ?? ''), bv = String(b[sortBy] ?? '')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
    }), [data, statusFilter, search, sortBy, sortDir])

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const paginated = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['users'] })
    await qc.invalidateQueries({ queryKey: ['moderators'] })
  }
  const toErrorText = (prefix: string, err: unknown) => {
    const detail = err instanceof Error ? err.message : 'Unexpected error'
    return `${prefix}. ${detail}`
  }
  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateUserRole(id, role),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to update user role', err)),
  })
  const restrict = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => restrictUser(id, days),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to restrict user', err)),
  })
  const liftRestriction = useMutation({
    mutationFn: (id: string) => liftUserRestriction(id),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to lift restriction', err)),
  })
  const ban = useMutation({
    mutationFn: (id: string) => setUserBanStatus(id, true),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to ban user', err)),
  })
  const unban = useMutation({
    mutationFn: (id: string) => setUserBanStatus(id, false),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to unban user', err)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: async () => { setMutationError(null); await invalidate() },
    onError: (err) => setMutationError(toErrorText('Failed to delete account', err)),
  })

  const toggleSort = (field: keyof AppUser) => {
    if (field === sortBy) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(field); setSortDir('asc') }
  }

  const SortTh = ({ field, children }: { field: keyof AppUser; children: React.ReactNode }) => (
    <th onClick={() => toggleSort(field)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
        {children} <ArrowUpDown size={10} style={{ opacity: sortBy === field ? 1 : 0.4 }} />
      </span>
    </th>
  )

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">
      <div className="page-head">
        <div>
          <div className="page-head-title">User Management</div>
          <div className="page-head-subtitle">Manage account roles, status, and user profiles</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'rgba(46,124,246,0.08)', border:'1px solid rgba(46,124,246,0.15)', borderRadius:10 }}>
          <Users size={14} color="#2E7CF6" />
          <span style={{ fontSize:'0.82rem', fontWeight:700, color:'#2E7CF6' }}>{list.length} users</span>
        </div>
      </div>

      <div className="toolbar">
        <div style={{ flex:1, minWidth:200, position:'relative' }}>
          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)', pointerEvents:'none' }} />
          <input type="text" placeholder="Search by name or email..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            style={{ paddingLeft:32 }} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={{ width:'auto' }}>
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="offline">Offline</option>
          <option value="restricted">Restricted</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {mutationError && (
        <div className="state-banner error">{mutationError}</div>
      )}

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Joined</th><th>Routes</th><th>Actions</th></tr></thead>
            <tbody>{Array.from({length:6}).map((_,i) => (
              <tr key={i}>{Array.from({length:6}).map((_,j) => <td key={j}><div className="skeleton" /></td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : isError ? (
        <div className="state-banner error">Failed to load users. {(error as Error|undefined)?.message ?? 'Check Firestore rules.'}</div>
      ) : !paginated.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><Users size={22} /></div>
            <div className="empty-title">No users found</div>
            <div className="empty-sub">Try adjusting your search or filters</div>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <SortTh field="name">Name</SortTh>
                  <SortTh field="email">Email</SortTh>
                  <th>Status</th>
                  <SortTh field="createdAt">Joined</SortTh>
                  <th>Routes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'nowrap' }}>
                        <Avatar name={u.name} email={u.email} />
                        <button onClick={() => setSelectedUser(u)} style={{
                          fontWeight:600, color:'#2E7CF6', background:'none', border:'none',
                          padding:0, fontSize:'0.84rem', fontFamily:'inherit', cursor:'pointer',
                          textAlign:'left', overflow:'hidden', textOverflow:'ellipsis',
                          whiteSpace:'nowrap', maxWidth:160,
                        }}>
                          {u.name ?? 'Unknown'}
                        </button>
                      </div>
                    </td>
                    <td style={{ color:'var(--text-secondary)', fontSize:'0.81rem' }}>{u.email}</td>
                    <td><StatusBadge status={getRestrictionDaysLabel(u)} /></td>
                    <td style={{ color:'var(--text-secondary)', fontSize:'0.81rem' }}>{u.createdAt?.toDate().toLocaleDateString() ?? '-'}</td>
                    <td style={{ fontWeight:600 }}>{u.routesContributed ?? 0}</td>
                    <td>
                      <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'nowrap' }}>
                        <select
                          value={(u.role === 'moderator' ? 'moderator' : 'user') as UserRole}
                          onChange={(e) => {
                            const nextRole = e.target.value as UserRole
                            const currentRole = (u.role === 'moderator' ? 'moderator' : 'user') as UserRole
                            if (nextRole !== currentRole) updateRole.mutate({ id: u.id, role: nextRole })
                          }}
                          disabled={updateRole.isPending}
                          style={{ width:'auto', minWidth:112, fontSize:'0.76rem', padding:'5px 8px' }}
                        >
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                        {u.status === 'banned' ? (
                          <Btn sm variant="success" onClick={() => unban.mutate(u.id)}>Unban</Btn>
                        ) : (
                          <>
                            {u.status === 'restricted'
                              ? <Btn sm variant="success" onClick={() => liftRestriction.mutate(u.id)}>Lift Restriction</Btn>
                              : <Btn sm variant="danger" onClick={() => setRestrictConfirmId(u.id)}>Restrict</Btn>
                            }
                            <Btn sm variant="danger" onClick={() => setBanConfirmId(u.id)}>Ban</Btn>
                          </>
                        )}
                        <Btn sm variant="danger" onClick={() => { if (confirm('Delete account permanently?')) remove.mutate(u.id) }}>
                          Delete
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mobile-cards">
            {paginated.map((u) => (
              <div key={`m-${u.id}`} className="mobile-user-card">
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <Avatar name={u.name} email={u.email} />
                    <button onClick={() => setSelectedUser(u)} style={{ fontWeight:700, color:'#2E7CF6', background:'none', border:'none', padding:0, fontSize:'0.88rem', fontFamily:'inherit', cursor:'pointer' }}>
                      {u.name ?? 'Unknown'}
                    </button>
                  </div>
                </div>
                <div style={{ color:'var(--text-secondary)', fontSize:'0.8rem' }}>{u.email}</div>
                <div style={{ display:'flex', gap:6 }}><StatusBadge status={getRestrictionDaysLabel(u)} /></div>
                <div style={{ display:'flex', gap:5 }}>
                  <select
                    value={(u.role === 'moderator' ? 'moderator' : 'user') as UserRole}
                    onChange={(e) => {
                      const nextRole = e.target.value as UserRole
                      const currentRole = (u.role === 'moderator' ? 'moderator' : 'user') as UserRole
                      if (nextRole !== currentRole) updateRole.mutate({ id: u.id, role: nextRole })
                    }}
                    disabled={updateRole.isPending}
                    style={{ width:'auto', minWidth:110, fontSize:'0.76rem', padding:'5px 8px' }}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  {u.status === 'banned' ? (
                    <Btn sm variant="success" onClick={() => unban.mutate(u.id)}>Unban</Btn>
                  ) : (
                    <>
                      {u.status === 'restricted'
                        ? <Btn sm variant="success" onClick={() => liftRestriction.mutate(u.id)}>Lift Restriction</Btn>
                        : <Btn sm variant="danger" onClick={() => setRestrictConfirmId(u.id)}>Restrict</Btn>
                      }
                      <Btn sm variant="danger" onClick={() => setBanConfirmId(u.id)}>Ban</Btn>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!isLoading && !isError && list.length > 0 && (
        <div className="pagination">
          <span className="pagination-info">Showing {((page-1)*PAGE_SIZE)+1}-{Math.min(page*PAGE_SIZE,list.length)} of {list.length}</span>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page<=1} onClick={() => setPage(p=>p-1)}>{'<'}</button>
            <span className="page-indicator">Page {page} / {totalPages}</span>
            <button className="page-btn" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)}>{'>'}</button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(selectedUser)} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>User Profile</DialogTitle></DialogHeader>
          {selectedUser && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0 16px', borderBottom:'1px solid var(--border-soft)', marginBottom:4 }}>
                <Avatar name={selectedUser.name} email={selectedUser.email} size={48} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:'1rem' }}>{selectedUser.name}</div>
                  <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>{selectedUser.email}</div>
                </div>
                <RoleBadge role={selectedUser.role} />
              </div>
              {([
                ['Badges', (selectedUser.badges ?? []).join(', ') || 'None'],
                ['Achievements', (selectedUser.achievements ?? []).join(', ') || 'None'],
                ['Streak Days', String(selectedUser.streakDays ?? 0)],
                ['Contributions', String(selectedUser.contributionCount ?? 0)],
              ]).map(([label, value]) => (
                <div key={label} className="dialog-field">
                  <span className="dialog-field-label">{label}</span>
                  <span className="dialog-field-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(restrictConfirmId)} onOpenChange={(open) => { if (!open) { setRestrictConfirmId(null); setRestrictTypedText(''); setRestrictDays(7) } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Restriction</DialogTitle></DialogHeader>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem', marginBottom:12 }}>
            Type <strong style={{ color:'#E05C6A' }}>RESTRICT</strong> to confirm a temporary restriction.
          </p>
          <label style={{ color:'var(--text-secondary)', fontSize:'0.78rem', marginBottom:6, display:'block' }}>Restriction length</label>
          <select
            value={restrictDays}
            onChange={(e) => setRestrictDays(Number(e.target.value) || 7)}
            style={{ width: '100%', marginBottom: 10 }}
          >
            {Array.from({ length: 7 }, (_, index) => index + 1).map((days) => (
              <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>
            ))}
          </select>
          <input
            type="text"
            value={restrictTypedText}
            onChange={(e) => setRestrictTypedText(e.target.value)}
            placeholder="Type RESTRICT to confirm"
          />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
            <Btn variant="outline" onClick={() => { setRestrictConfirmId(null); setRestrictTypedText(''); setRestrictDays(7) }}>Cancel</Btn>
            <Btn variant="danger" disabled={restrictTypedText !== 'RESTRICT'} onClick={() => {
              if (restrictConfirmId) restrict.mutate({ id: restrictConfirmId, days: restrictDays })
              setRestrictConfirmId(null); setRestrictTypedText(''); setRestrictDays(7)
            }}>Restrict User</Btn>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(banConfirmId)} onOpenChange={(open) => { if (!open) { setBanConfirmId(null); setBanTypedText('') } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Ban</DialogTitle></DialogHeader>
          <p style={{ color:'var(--text-secondary)', fontSize:'0.85rem', marginBottom:12 }}>
            Type <strong style={{ color:'#E05C6A' }}>BAN</strong> to permanently ban this account.
          </p>
          <input
            type="text"
            value={banTypedText}
            onChange={(e) => setBanTypedText(e.target.value)}
            placeholder="Type BAN to confirm"
          />
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, marginTop:14 }}>
            <Btn variant="outline" onClick={() => { setBanConfirmId(null); setBanTypedText('') }}>Cancel</Btn>
            <Btn variant="danger" disabled={banTypedText !== 'BAN'} onClick={() => {
              if (banConfirmId) ban.mutate(banConfirmId)
              setBanConfirmId(null); setBanTypedText('')
            }}>Ban User</Btn>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
