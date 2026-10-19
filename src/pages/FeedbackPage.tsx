import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteFeedback, getFeedback, updateFeedbackStatus } from '@/lib/firestoreApi'
import { Bell, CheckCircle, MessageSquare, XCircle } from 'lucide-react'
import { RouteReportsSection } from '@/components/RouteReportsSection'

function StatusBadge({ status }: { status?: string }) {
  if (status === 'resolved') return <span className="badge badge-approved"><span className="badge-dot" />Resolved</span>
  if (status === 'dismissed') return <span className="badge badge-user"><span className="badge-dot" />Dismissed</span>
  return <span className="badge badge-pending"><span className="badge-dot" />Pending</span>
}

function TypeBadge({ type }: { type?: string }) {
  if (type === 'report')
    return <span className="badge badge-rejected"><span className="badge-dot" />Report</span>
  return <span className="badge badge-superadmin"><span className="badge-dot" />Feedback</span>
}

export function FeedbackPage() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['feedback'], queryFn: getFeedback })
  const [statusFilter, setStatusFilter] = useState('all')

  const list = useMemo(() => data
    .filter((f) => f.type === 'feedback')
    .filter((f) => statusFilter === 'all' || f.status === statusFilter),
    [data, statusFilter])

  const pendingCount = data.filter((f) => f.type === 'feedback' && f.status === 'pending').length

  const refresh = () => qc.invalidateQueries({ queryKey: ['feedback'] })
  const resolve = useMutation({
    mutationFn: async (id: string) => {
      await updateFeedbackStatus(id, 'resolved')
      await deleteFeedback(id)
    },
    onSuccess: refresh,
  })
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await updateFeedbackStatus(id, 'dismissed')
      await deleteFeedback(id)
    },
    onSuccess: refresh,
  })

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">
      <div className="page-head">
        <div>
          <div className="page-head-title">Feedback & Reports</div>
          <div className="page-head-subtitle">Track and resolve user feedback and content reports</div>
        </div>
        {pendingCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--warning-soft)', border: '1px solid rgba(255,181,71,0.3)', borderRadius: 10 }}>
            <Bell size={14} color="var(--warning)" />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#a07000' }}>
              {pendingCount} pending
            </span>
          </div>
        )}
      </div>

      <RouteReportsSection />

      <div className="toolbar">
        <div className="toolbar-filters">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          {list.length} entr{list.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Type</th><th>Status</th><th>Message</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>{Array.from({ length: 5 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j}><div className="skeleton" /></td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : isError ? (
        <div className="state-banner error">Failed to load feedback. {(error as Error | undefined)?.message ?? 'Try refreshing.'}</div>
      ) : !list.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><MessageSquare size={22} /></div>
            <div className="empty-title">No entries found</div>
            <div className="empty-sub">No feedback or reports match the selected filters</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Message / Reason</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => {
                return (
                  <tr key={f.id}>
                    <td><TypeBadge type={f.type} /></td>
                    <td><StatusBadge status={f.status} /></td>
                    <td style={{ maxWidth: 260 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.reason || f.message || '-'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {f.createdAt?.toDate().toLocaleDateString() ?? '-'}
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          className="btn btn-sm btn-success"
                          title="Mark resolved"
                          onClick={() => resolve.mutate(f.id)}
                          style={{ gap: 4 }}
                        >
                          <CheckCircle size={12} /> Resolve
                        </button>
                        <button
                          className="btn btn-sm btn-outline"
                          title="Dismiss"
                          onClick={() => dismiss.mutate(f.id)}
                          style={{ gap: 4 }}
                        >
                          <XCircle size={12} /> Dismiss
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
