import React, { useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAnnouncement, deleteAnnouncement, getAnnouncements, updateAnnouncement } from '@/lib/firestoreApi'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Megaphone, Plus, Trash2 } from 'lucide-react'

function toIsoLocalValue(date: Date) {
  const off = date.getTimezoneOffset()
  const local = new Date(date.getTime() - off * 60_000)
  return local.toISOString().slice(0, 16)
}

type BtnVariant = 'primary' | 'outline' | 'danger' | 'success'
const BTN_BASE: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  gap: 5, borderRadius: 8, fontSize: '0.83rem', fontWeight: 600,
  fontFamily: 'Manrope, sans-serif', cursor: 'pointer',
  whiteSpace: 'nowrap', lineHeight: 1, transition: 'all 0.17s ease',
}
const BTN_VARIANTS: Record<BtnVariant, React.CSSProperties> = {
  primary: { background: 'linear-gradient(135deg,#4A7CE0,#6A9EFF)', color: '#fff', border: '1px solid transparent', boxShadow: '0 3px 10px rgba(46,124,246,0.3)', padding: '8px 16px' },
  outline: { background: '#fff', color: '#0F1D35', border: '1px solid #D4E4F7', padding: '8px 16px' },
  danger:  { background: 'rgba(224,92,106,0.10)', color: '#E05C6A', border: '1px solid rgba(224,92,106,0.25)', padding: '8px 16px' },
  success: { background: 'rgba(62,201,122,0.10)', color: '#3EC97A', border: '1px solid rgba(62,201,122,0.25)', padding: '8px 16px' },
}

function Btn({ variant = 'outline', sm, icon, children, disabled, onClick, style }: {
  variant?: BtnVariant; sm?: boolean; icon?: boolean; children?: React.ReactNode;
  disabled?: boolean; onClick?: () => void; style?: React.CSSProperties
}) {
  const sizeStyle: React.CSSProperties = icon
    ? { width: 30, height: 30, padding: 0, borderRadius: 7 }
    : sm ? { padding: '5px 11px', fontSize: '0.76rem', borderRadius: 6 } : {}
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ ...BTN_BASE, ...BTN_VARIANTS[variant], ...sizeStyle, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
    >
      {children}
    </button>
  )
}

function TypeBadge({ type }: { type?: string }) {
  const s: React.CSSProperties =
    type === 'critical' ? { background: 'rgba(224,92,106,0.12)', color: '#E05C6A', border: '1px solid rgba(224,92,106,0.2)' }
    : type === 'warning' ? { background: 'rgba(255,181,71,0.14)', color: '#b07800', border: '1px solid rgba(255,181,71,0.3)' }
    : { background: 'rgba(46,124,246,0.10)', color: '#2E7CF6', border: '1px solid rgba(46,124,246,0.2)' }
  return (
    <span style={{ ...s, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6, fontSize: '0.71rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {type ?? 'info'}
    </span>
  )
}

function StatusBadge({ active }: { active?: boolean }) {
  const s: React.CSSProperties = active
    ? { background: 'rgba(62,201,122,0.12)', color: '#3EC97A', border: '1px solid rgba(62,201,122,0.22)' }
    : { background: 'rgba(122,146,178,0.10)', color: '#7A92B2', border: '1px solid rgba(122,146,178,0.2)' }
  return (
    <span style={{ ...s, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export function AnnouncementsPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['announcements'], queryFn: getAnnouncements })

  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<'info' | 'warning' | 'critical'>('info')
  const [targetAudience, setTargetAudience] = useState<'all' | 'student' | 'employee' | 'foreigner' | 'new_to_area'>('all')
  const [isActive, setIsActive] = useState(true)
  const [scheduleMode, setScheduleMode] = useState<'now' | 'scheduled'>('now')
  const [scheduledAt, setScheduledAt] = useState(toIsoLocalValue(new Date()))
  const [expiresAt, setExpiresAt] = useState(toIsoLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))

  const refresh = () => qc.invalidateQueries({ queryKey: ['announcements'] })

  const create = useMutation({
    mutationFn: () => createAnnouncement({
      title, message, type, targetAudience, isActive,
      scheduledAt: scheduleMode === 'now' ? Timestamp.now() : Timestamp.fromDate(new Date(scheduledAt)),
      expiresAt: Timestamp.fromDate(new Date(expiresAt)),
      createdBy: user?.uid ?? '',
    }),
    onSuccess: () => { setTitle(''); setMessage(''); setShowForm(false); refresh() },
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => updateAnnouncement(id, { isActive: active }),
    onSuccess: refresh,
  })

  const remove = useMutation({ mutationFn: (id: string) => deleteAnnouncement(id), onSuccess: refresh })

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <div className="page-head">
          <div>
            <div className="page-head-title">Announcements</div>
            <div className="page-head-subtitle">Create and manage modal notices for app users by audience</div>
          </div>
          <Btn variant="primary" onClick={() => setShowForm(true)}>
            <Plus size={14} /> New Announcement
          </Btn>
        </div>

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Title</th><th>Type</th><th>Audience</th><th>Status</th><th>Scheduled</th><th>Expires</th><th>Actions</th></tr></thead>
            <tbody>{Array.from({ length: 3 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
            ))}</tbody>
          </table>
        </div>

      ) : isError ? (
        <div className="state-banner error">
          Failed to load announcements. {(error as Error | undefined)?.message ?? 'Check permissions.'}
        </div>

      ) : !data.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><Megaphone size={22} /></div>
            <div className="empty-title">No announcements yet</div>
            <div className="empty-sub">Create an announcement to notify app users instantly</div>
          </div>
        </div>

      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Audience</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id}>
                  <td><span style={{ fontWeight: 600 }}>{a.title}</span></td>
                  <td><TypeBadge type={a.type} /></td>
                  <td>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                      {a.targetAudience?.replace('_', ' ') ?? 'All'}
                    </span>
                  </td>
                  <td><StatusBadge active={a.isActive} /></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {a.scheduledAt?.toDate().toLocaleString() ?? '-'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {a.expiresAt?.toDate().toLocaleString() ?? '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'nowrap' }}>
                      <Btn
                        sm
                        variant={a.isActive ? 'outline' : 'success'}
                        onClick={() => toggleActive.mutate({ id: a.id, active: !a.isActive })}
                      >
                        {a.isActive ? 'Deactivate' : 'Activate'}
                      </Btn>
                      <Btn sm icon variant="danger" onClick={() => { if (confirm('Delete announcement?')) remove.mutate(a.id) }}>
                        <Trash2 size={12} />
                      </Btn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader><DialogTitle>New Announcement</DialogTitle></DialogHeader>

          <div style={{ display: 'grid', gap: 14, marginTop: 4 }}>
            <div className="form-group">
              <label>Title</label>
              <input type="text" placeholder="Announcement title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="form-group">
              <label>Message</label>
              <textarea rows={4} placeholder="Write your message here..." value={message} onChange={(e) => setMessage(e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Type</label>
                <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div className="form-group">
                <label>Audience</label>
                <select value={targetAudience} onChange={(e) => setTargetAudience(e.target.value as typeof targetAudience)}>
                  <option value="all">All Users</option>
                  <option value="student">Student</option>
                  <option value="employee">Employee</option>
                  <option value="foreigner">Foreigner</option>
                  <option value="new_to_area">New to Area</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Publish</label>
                <select value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as 'now' | 'scheduled')}>
                  <option value="now">Publish Now</option>
                  <option value="scheduled">Schedule</option>
                </select>
              </div>
              <div className="form-group">
                <label>Active</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                  <span style={{ fontSize: '0.84rem', color: isActive ? '#3EC97A' : 'var(--text-secondary)', fontWeight: 600 }}>
                    {isActive ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
            </div>

            {scheduleMode === 'scheduled' && (
              <div className="form-group">
                <label>Scheduled At</label>
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
            )}

            <div className="form-group">
              <label>Expires At</label>
              <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 4 }}>
              <Btn variant="outline" onClick={() => setShowForm(false)}>Cancel</Btn>
              <Btn
                variant="primary"
                disabled={!title || !message || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? 'Creating...' : 'Create Announcement'}
              </Btn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
