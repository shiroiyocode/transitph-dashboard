import { Suspense, lazy, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteRoute, getRoutes, updateRouteStatus } from '@/lib/firestoreApi'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckCircle, MapPin, Route, Search, ThumbsDown, ThumbsUp, Trash2, X, XCircle } from 'lucide-react'
import type { RouteItem } from '@/types/models'

// The map library is large: loaded when a preview first opens.
const RoutePreviewMap = lazy(() =>
  import('@/components/RoutePreviewMap').then((m) => ({ default: m.RoutePreviewMap })),
)

const PAGE_SIZE = 12

type RouteTrustScore = {
  total: number
  label: 'High trust' | 'Moderate trust' | 'Needs verification'
  isCritical: boolean
}

function computeRouteTrust(route: RouteItem): RouteTrustScore {
  // Approval keeps a route at the base score (same as the app's
  // RouteTrustService): trust comes from riders' confirmations.
  const approvalPoints = route.status === 'rejected' ? 0 : 20

  const summary = route.feedbackSummary
  const fareYes = summary?.fareAccurateYes ?? 0
  const fareNo = summary?.fareAccurateNo ?? 0
  const scheduleYes = summary?.scheduleAccurateYes ?? 0
  const scheduleNo = summary?.scheduleAccurateNo ?? 0
  const operatingYes = summary?.stillOperatingYes ?? 0
  const operatingNo = summary?.stillOperatingNo ?? 0

  const signedRatioPoints = (yes: number, no: number, maxPoints: number) => {
    const total = yes + no
    if (total <= 0) return 0
    const signedRatio = (yes - no) / total
    return Math.max(-maxPoints, Math.min(maxPoints, Math.round(signedRatio * maxPoints)))
  }

  const confirmationPoints =
    signedRatioPoints(fareYes, fareNo, 12) +
    signedRatioPoints(scheduleYes, scheduleNo, 12) +
    signedRatioPoints(operatingYes, operatingNo, 11)

  const refTime = route.updatedAt ?? route.createdAt
  let freshnessPoints = 0
  if (refTime) {
    const ageDays = Math.max(0, Math.floor((Date.now() - refTime.toMillis()) / 86400000))
    if (ageDays <= 7) freshnessPoints = 15
    else if (ageDays <= 30) freshnessPoints = 10
    else if (ageDays <= 90) freshnessPoints = 5
  }

  const total = Math.max(0, Math.min(100, approvalPoints + confirmationPoints + freshnessPoints))
  const label = total >= 85 ? 'High trust' : total >= 65 ? 'Moderate trust' : 'Needs verification'

  return { total, label, isCritical: total < 30 }
}

function TrustBadge({ route }: { route: RouteItem }) {
  const trust = computeRouteTrust(route)
  const tone =
    trust.total >= 85
      ? { color: 'var(--success)' }
      : trust.total >= 65
        ? { color: 'var(--accent)' }
        : { color: 'var(--warning)' }

  return (
    <span
      title={`Trust ${trust.total}/100 (${trust.label})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: trust.isCritical ? '4px 8px' : '4px 10px',
        borderRadius: 999,
        fontSize: '0.74rem',
        fontWeight: 700,
        color: trust.isCritical ? 'var(--danger)' : tone.color,
        background: 'transparent',
        border: 'none',
      }}
    >
      {trust.total}
    </span>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (status === 'approved') return <span className="badge badge-approved"><span className="badge-dot" />Approved</span>
  if (status === 'rejected') return <span className="badge badge-rejected"><span className="badge-dot" />Rejected</span>
  return <span className="badge badge-pending"><span className="badge-dot" />Pending</span>
}

function EditedBadge({ editCount }: { editCount?: number }) {
  const count = editCount ?? 0
  return (
    <span
      title={count > 0 ? `Edited ${count} time${count > 1 ? 's' : ''}` : 'Edited'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 800,
        color: 'var(--accent)',
        background: 'var(--accent-soft)',
        border: '1px solid rgba(46,124,246,0.35)',
      }}
    >
      EDITED
    </span>
  )
}

export function RoutesPage() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['routes'], queryFn: getRoutes })
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<RouteItem | null>(null)
  const [page, setPage] = useState(1)

  const list = useMemo(() => data
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => `${r.startLocation ?? ''} ${r.endLocation ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [data, statusFilter, search])

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const paginated = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const refresh = () => qc.invalidateQueries({ queryKey: ['routes'] })
  const approve = useMutation({ mutationFn: (id: string) => updateRouteStatus(id, 'approved', user?.uid ?? ''), onSuccess: refresh })
  const reject = useMutation({ mutationFn: (id: string) => deleteRoute(id), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => deleteRoute(id), onSuccess: refresh })

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? paginated.map((r) => r.id) : [])
  }

  const allChecked = paginated.length > 0 && paginated.every((r) => selectedIds.includes(r.id))
  // Only the checked routes the filters still show.
  const selectedRoutes = useMemo(
    () => list.filter((r) => selectedIds.includes(r.id)),
    [list, selectedIds],
  )
  // Approve and Reject apply to the ones not approved yet; Delete to all.
  const reviewable = selectedRoutes.filter((r) => r.status !== 'approved')
  const [bulkBusy, setBulkBusy] = useState(false)

  const runBulk = async (routes: RouteItem[], action: (id: string) => Promise<unknown>) => {
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(routes.map((r) => action(r.id)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) alert(`${failed} of ${routes.length} routes couldn't be updated. Try again.`)
      setSelectedIds([])
    } finally {
      setBulkBusy(false)
      refresh()
    }
  }

  const bulkApprove = () =>
    runBulk(reviewable, (id) => updateRouteStatus(id, 'approved', user?.uid ?? ''))

  // Rejecting a route that isn't approved deletes it, as on each row.
  const bulkReject = () => {
    const n = reviewable.length
    if (!confirm(`Reject and delete ${n} pending route${n === 1 ? '' : 's'}?`)) return
    return runBulk(reviewable, deleteRoute)
  }

  const bulkDelete = () => {
    const n = selectedRoutes.length
    if (!confirm(`Delete ${n} route${n === 1 ? '' : 's'} permanently? This can't be undone.`)) return
    return runBulk(selectedRoutes, deleteRoute)
  }

  return (
    <div style={{ display: 'grid', gap: 20 }} className="stagger">
      <div className="page-head">
        <div>
          <div className="page-head-title">Route Management</div>
          <div className="page-head-subtitle">Review and moderate user-submitted transit routes</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="stat-icon" style={{ background: 'var(--accent-soft)', width: 34, height: 34, borderRadius: 9 }}>
            <Route size={16} color="var(--accent)" />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            {list.length} routes
          </span>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search" style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search origin or destination..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            style={{ paddingLeft: 32 }}
          />
        </div>
        <div className="toolbar-filters">
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} style={{ width: 'auto' }}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {selectedRoutes.length > 0 ? (
        <div className="selection-bar">
          <span className="selection-count">{selectedRoutes.length} selected</span>
          <div className="toolbar-actions">
            <button
              className="btn btn-sm btn-success"
              disabled={bulkBusy || !reviewable.length}
              title={reviewable.length ? undefined : 'All selected routes are already approved'}
              onClick={bulkApprove}
            >
              <CheckCircle size={13} /> Approve ({reviewable.length})
            </button>
            <button
              className="btn btn-sm btn-outline"
              disabled={bulkBusy || !reviewable.length}
              title={reviewable.length ? undefined : 'All selected routes are already approved'}
              onClick={bulkReject}
            >
              <XCircle size={13} /> Reject ({reviewable.length})
            </button>
            <button className="btn btn-sm btn-danger" disabled={bulkBusy} onClick={bulkDelete}>
              <Trash2 size={13} /> Delete ({selectedRoutes.length})
            </button>
            <button className="btn btn-sm btn-outline" disabled={bulkBusy} onClick={() => setSelectedIds([])}>
              <X size={13} /> Clear
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th /><th>Start</th><th>End</th><th>Contributor</th><th>Date</th><th>Status</th><th>Views</th><th>Votes</th><th>Trust</th><th>Actions</th></tr></thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 10 }).map((_, j) => <td key={j}><div className="skeleton" /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : isError ? (
        <div className="state-banner error">
          Failed to load routes. {(error as Error | undefined)?.message ?? 'Try refreshing.'}
        </div>
      ) : !paginated.length ? (
        <div className="table-wrap">
          <div className="empty-state">
            <div className="empty-icon"><Route size={22} /></div>
            <div className="empty-title">No routes found</div>
            <div className="empty-sub">Adjust your filters or wait for users to submit new routes</div>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleAll(e.target.checked)}
                  />
                </th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Contributor</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Views</th>
                <th>Votes</th>
                <th>Trust</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.id)}
                      onChange={(e) => setSelectedIds((prev) =>
                        e.target.checked ? [...prev, r.id] : prev.filter((id) => id !== r.id)
                      )}
                    />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} color="var(--accent)" style={{ flexShrink: 0 }} />
                      <span style={{ fontWeight: 600 }}>{r.startLocation}</span>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.endLocation}</td>
                  <td style={{ fontSize: '0.81rem', color: 'var(--text-secondary)' }}>
                    {r.contributorName?.trim() || r.contributorEmail?.trim() || '-'}
                  </td>
                  <td style={{ fontSize: '0.81rem', color: 'var(--text-secondary)' }}>
                    {r.createdAt?.toDate().toLocaleDateString() ?? '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge status={r.status} />
                      {r.status === 'pending' && r.isEdited ? <EditedBadge editCount={r.editCount} /> : null}
                    </div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.views ?? 0}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.8rem', color: 'var(--success)', fontWeight: 600 }}>
                        <ThumbsUp size={11} />{r.upvotes ?? 0}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 600 }}>
                        <ThumbsDown size={11} />{r.downvotes ?? 0}
                      </span>
                    </div>
                  </td>
                  <td>
                    <TrustBadge route={r} />
                  </td>
                  <td>
                    <div className="action-group">
                      {r.status !== 'approved' ? (
                        <>
                          <button className="btn btn-sm btn-success" onClick={() => approve.mutate(r.id)}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => reject.mutate(r.id)}>Reject</button>
                        </>
                      ) : null}
                      <button className="btn btn-sm btn-outline" onClick={() => setPreview(r)}>Preview</button>
                      {r.status === 'approved' ? (
                        <button
                          className="btn btn-sm btn-danger btn-icon"
                          title="Delete route"
                          onClick={() => { if (confirm('Delete this route?')) remove.mutate(r.id) }}
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="pagination">
          <span className="pagination-info">Showing {((page - 1) * PAGE_SIZE) + 1}-{Math.min(page * PAGE_SIZE, list.length)} of {list.length}</span>
          <div className="pagination-controls">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{'<'}</button>
            <span className="page-indicator">Page {page} / {totalPages}</span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{'>'}</button>
          </div>
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Route Preview</DialogTitle></DialogHeader>
          {preview && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 16px', borderBottom: '1px solid var(--border-soft)', marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700 }}>{preview.startLocation}</span>
                  <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>{'->'}</span>
                  <span style={{ fontWeight: 700 }}>{preview.endLocation}</span>
                </div>
                <StatusBadge status={preview.status} />
                {preview.status === 'pending' && preview.isEdited ? <EditedBadge editCount={preview.editCount} /> : null}
              </div>
              <Suspense fallback={<div className="route-preview-map route-preview-map-empty">Loading map…</div>}>
                <RoutePreviewMap route={preview} />
              </Suspense>
              {[
                ['Trust', `${computeRouteTrust(preview).total}/100 (${computeRouteTrust(preview).label})`],
                [
                  'Steps',
                  (preview.steps ?? []).length
                    ? preview.steps!.map((s) => `${s.mode}: ${s.instruction}`).join(' -> ')
                    : 'No step data',
                ],
                ['Transport Modes', (preview.transportModes ?? []).join(', ') || 'N/A'],
                ['ETA', preview.eta ? `${preview.eta} mins` : 'N/A'],
                ['Fare Estimate', preview.price ?? 'N/A'],
                [
                  'Distance',
                  preview.distance ??
                    (preview.distanceMeters != null
                      ? `${(preview.distanceMeters / 1000).toFixed(1)} km`
                      : 'N/A'),
                ],
              ].map(([label, value]) => (
                <div key={String(label)} className="dialog-field">
                  <span className="dialog-field-label">{label}</span>
                  <span className="dialog-field-value">{value}</span>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
