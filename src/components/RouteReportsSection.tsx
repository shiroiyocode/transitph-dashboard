import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pin, Trash2, TriangleAlert } from 'lucide-react'
import { getRouteReports, keepRouteReport, removeRouteReport } from '@/lib/firestoreApi'
import type { RouteReportItem } from '@/types/models'

function ago(item: RouteReportItem) {
  const ms = Date.now() - (item.createdAt?.toMillis() ?? Date.now())
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}

function showsFor(item: RouteReportItem) {
  if (item.kept) return 'Kept until removed'
  const ms = (item.expiresAt?.toMillis() ?? Date.now()) - Date.now()
  const h = Math.floor(ms / 3600000)
  return h >= 1 ? `Shows ${h} h more` : `Shows ${Math.max(1, Math.round(ms / 60000))} min more`
}

/** Riders' route reports: each shows on every route on its road for a day.
 * Keep holds one until removed; Remove takes it down now. */
export function RouteReportsSection() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['route-reports'], queryFn: getRouteReports })
  const refresh = () => qc.invalidateQueries({ queryKey: ['route-reports'] })
  const keep = useMutation({ mutationFn: keepRouteReport, onSuccess: refresh })
  const remove = useMutation({ mutationFn: removeRouteReport, onSuccess: refresh })

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <TriangleAlert size={16} color="var(--warning)" />
        <span style={{ fontWeight: 600 }}>Route reports</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Shown on every route on the same road for a day
        </span>
      </div>
      {isLoading ? (
        <div className="skeleton" style={{ height: 48 }} />
      ) : isError ? (
        <div className="state-banner error">Failed to load route reports.</div>
      ) : !data.length ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No route reports right now.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Issue</th><th>Route</th><th>Details</th><th>Reported</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.type}</td>
                  <td style={{ fontSize: '0.82rem' }}>{r.routeLabel}</td>
                  <td style={{ maxWidth: 260, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{r.description || '-'}</td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ago(r)}</td>
                  <td style={{ fontSize: '0.8rem', color: r.kept ? 'var(--accent)' : 'var(--text-secondary)' }}>{showsFor(r)}</td>
                  <td>
                    <div className="action-group">
                      {!r.kept && (
                        <button className="btn btn-sm btn-outline" title="Keep until removed" onClick={() => keep.mutate(r.id)} style={{ gap: 4 }}>
                          <Pin size={12} /> Keep
                        </button>
                      )}
                      <button className="btn btn-sm btn-danger" title="Stop showing it now" onClick={() => remove.mutate(r.id)} style={{ gap: 4 }}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
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
