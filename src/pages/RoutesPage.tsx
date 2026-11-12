import { Suspense, lazy, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approveRoute, deleteRoute, getRoutes, rejectRoute, setRouteVerified } from '@/lib/firestoreApi'
import { rejectionReasonLabel } from '@/lib/routeRejectionReasons'
import { isOverdue, reviewOrder, waitingText } from '@/lib/reviewWait'
import { ApproveNoteDialog } from '@/components/ApproveNoteDialog'
import { RejectRouteDialog } from '@/components/RejectRouteDialog'
import { RouteChecklist } from '@/components/RouteChecklist'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CheckCircle, MapPin, Route, Search, ThumbsDown, ThumbsUp, Trash2, X, XCircle } from 'lucide-react'
import type { RouteItem } from '@/types/models'

// The map library is large: loaded when a preview first opens.
const RoutePreviewMap = lazy(() =>
  import('@/components/RoutePreviewMap').then((m) => ({ default: m.RoutePreviewMap })),
)

const PAGE_SIZE = 12

// Votes a trust question needs before it counts at full weight (same as the app).
const FULL_WEIGHT_VOTES = 5

type RouteTrustScore = {
  total: number
  label: 'High trust' | 'Moderate trust' | 'Needs verification'
  isCritical: boolean
}

function computeRouteTrust(route: RouteItem): RouteTrustScore {
  // Approval keeps a route at the base score (same as the app's
  // RouteTrustService): trust comes from commuters' confirmations.
  const approvalPoints = route.status === 'rejected' ? 0 : 20

  const summary = route.feedbackSummary
  const fareYes = summary?.fareAccurateYes ?? 0
  const fareNo = summary?.fareAccurateNo ?? 0
  const scheduleYes = summary?.scheduleAccurateYes ?? 0
  const scheduleNo = summary?.scheduleAccurateNo ?? 0
  const operatingYes = summary?.stillOperatingYes ?? 0
  const operatingNo = summary?.stillOperatingNo ?? 0

  // Each question gives up to its max points when commuters agree. It only
  // counts fully once it has FULL_WEIGHT_VOTES votes, so one commuter can't
  // push a route to the top (or the bottom) alone.
  const signedRatioPoints = (yes: number, no: number, maxPoints: number) => {
    const total = yes + no
    if (total <= 0) return 0
    const signedRatio = (yes - no) / total
    const weight = Math.min(1, total / FULL_WEIGHT_VOTES)
    return Math.max(-maxPoints, Math.min(maxPoints, Math.round(signedRatio * weight * maxPoints)))
  }

  // 22 + 22 + 21 = 65, so base 20 + 65 + freshness 15 can reach 100.
  const confirmationPoints =
    signedRatioPoints(fareYes, fareNo, 22) +
    signedRatioPoints(scheduleYes, scheduleNo, 22) +
    signedRatioPoints(operatingYes, operatingNo, 21)

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

/** Why it was rejected, for routes rejected since reasons began. */
function rejectionSummary(route: RouteItem) {
  if (route.status !== 'rejected') return null
  // The checks explain themselves, and their codes aren't for reading.
  const failed = (route.checks ?? []).filter((check) => check.result === 'fail').map((check) => check.message)
  if (failed.length) return failed.join(' ')
  const decision = route.latestDecision
  const reasons = (decision?.reasonCodes ?? []).map(rejectionReasonLabel).join(', ')
  if (!reasons) return null
  return decision?.note ? `${reasons}. Note: ${decision.note}` : reasons
}

const flagsOf = (route: RouteItem) => (route.checks ?? []).filter((check) => check.result === 'flag')

// Same speeds (km/h) the app uses for a commuter route's own ETA: drawn length of
// each step ÷ speed, no waiting time.
function speedKmh(mode: string) {
  const m = mode.toLowerCase()
  if (m.includes('walk')) return 5
  if (m.includes('tricycle') || m.includes('trike')) return 15
  if (m.includes('bus')) return 25
  if (m.includes('fx') || m.includes('van')) return 30
  if (m.includes('train') || m.includes('lrt') || m.includes('mrt')) return 40
  return 20 // Jeepney, Ferry, and anything unrecognised
}

/** Backup for routes saved without an ETA: path length per step ÷ the mode's speed. */
function estimateEtaMinutes(route: RouteItem) {
  const points = route.pathPoints ?? []
  const steps = route.steps ?? []
  if (points.length < 2 || !steps.length) return 0

  const boundaries = route.stepBoundaries ?? []
  let minutes = 0
  if (boundaries.length === steps.length) {
    let start = 0
    steps.forEach((step, i) => {
      const end = Math.min(boundaries[i], points.length - 1)
      if (end > start) minutes += (pathLengthMeters(points.slice(start, end + 1)) / 1000 / speedKmh(step.mode)) * 60
      start = Math.max(start, end)
    })
  } else {
    // No usable step boundaries: whole path at the steps' average speed.
    const avgSpeed = steps.reduce((sum, s) => sum + speedKmh(s.mode), 0) / steps.length
    minutes = (pathLengthMeters(points) / 1000 / avgSpeed) * 60
  }
  return minutes > 0 ? Math.max(1, Math.round(minutes)) : 0
}

/** The app sometimes saves "0" for ETA. Fall back to an estimate when it did. */
function formatEta(route: RouteItem) {
  if (route.eta && parseFloat(route.eta) > 0) return `${route.eta} mins`
  const estimate = estimateEtaMinutes(route)
  return estimate > 0 ? `${estimate} mins` : 'N/A'
}

function pathLengthMeters(points: RouteItem['pathPoints']) {
  if (!points || points.length < 2) return 0
  const toRad = (deg: number) => (deg * Math.PI) / 180
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
    total += 2 * 6371000 * Math.asin(Math.sqrt(h))
  }
  return total
}

/** Saved distance strings are mixed ("3.2 mi", "5.1 km"). Read one as meters. */
function savedDistanceMeters(distance?: string) {
  const match = distance?.match(/([\d.,]+)\s*(km|mi|m)?/i)
  const value = match ? parseFloat(match[1].replace(/,/g, '')) : NaN
  if (!(value > 0)) return 0
  const unit = match?.[2]?.toLowerCase()
  if (unit === 'mi') return value * 1609.344
  if (unit === 'm') return value
  return value * 1000
}

/** Always kilometers: the saved distance if it's real, else measured along the drawn path. */
function formatDistance(route: RouteItem) {
  const meters = savedDistanceMeters(route.distance)
    || (route.distanceMeters && route.distanceMeters > 0 ? route.distanceMeters : 0)
    || pathLengthMeters(route.pathPoints)
  return meters > 0 ? `${(meters / 1000).toFixed(1)} km` : 'N/A'
}

export function RoutesPage() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError, error } = useQuery({ queryKey: ['routes'], queryFn: getRoutes })
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [preview, setPreview] = useState<RouteItem | null>(null)
  const [page, setPage] = useState(1)
  // The routes the reason dialog is open for. Null when it's closed.
  const [rejecting, setRejecting] = useState<string[] | null>(null)
  // The routes the "why approve" dialog is open for. Null when it's closed.
  const [approving, setApproving] = useState<RouteItem[] | null>(null)

  // Pending routes come first, longest wait at the top.
  const list = useMemo(() => reviewOrder(data
    .filter((r) => statusFilter === 'all' || r.status === statusFilter)
    .filter((r) => `${r.startLocation ?? ''} ${r.endLocation ?? ''}`.toLowerCase().includes(search.toLowerCase()))),
    [data, statusFilter, search])

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const paginated = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const refresh = () => qc.invalidateQueries({ queryKey: ['routes'] })
  const showFailure = () => alert("Couldn't save that. Check your connection and try again.")
  const approve = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => approveRoute(id, note),
    onSuccess: refresh,
    onError: showFailure,
  })
  const verify = useMutation({
    mutationFn: ({ id, verified }: { id: string; verified: boolean }) => setRouteVerified(id, verified),
    onSuccess: () => {
      setPreview(null)
      refresh()
    },
    onError: showFailure,
  })
  const remove = useMutation({ mutationFn: (id: string) => deleteRoute(id), onSuccess: refresh, onError: showFailure })

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? paginated.map((r) => r.id) : [])
  }

  const allChecked = paginated.length > 0 && paginated.every((r) => selectedIds.includes(r.id))
  // Only the checked routes the filters still show.
  const selectedRoutes = useMemo(
    () => list.filter((r) => selectedIds.includes(r.id)),
    [list, selectedIds],
  )
  // Approve and Reject apply to the ones waiting for review. Delete to all. A
  // rejected route goes back to pending when its contributor sends it again.
  const reviewable = selectedRoutes.filter((r) => r.status === 'pending')
  const [bulkBusy, setBulkBusy] = useState(false)

  const runBulk = async (ids: string[], action: (id: string) => Promise<unknown>) => {
    setBulkBusy(true)
    try {
      const results = await Promise.allSettled(ids.map((id) => action(id)))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed) alert(`${failed} of ${ids.length} routes couldn't be updated. Try again.`)
      setSelectedIds([])
    } finally {
      setBulkBusy(false)
      refresh()
    }
  }

  // Going against the checklist has to be on record, so ask first if any flag.
  const askToApprove = (routes: RouteItem[]) => {
    if (routes.some((r) => flagsOf(r).length > 0)) {
      setApproving(routes)
      return
    }
    if (routes.length === 1) approve.mutate({ id: routes[0].id })
    else void runBulk(routes.map((r) => r.id), (id) => approveRoute(id))
  }

  const confirmApprove = (routes: RouteItem[], note: string) => {
    setApproving(null)
    if (routes.length === 1) approve.mutate({ id: routes[0].id, note })
    else void runBulk(routes.map((r) => r.id), (id) => approveRoute(id, note))
  }

  const confirmReject = (ids: string[], reasonCodes: string[], note?: string) => {
    setRejecting(null)
    return runBulk(ids, (id) => rejectRoute(id, reasonCodes, note))
  }

  const bulkDelete = () => {
    const n = selectedRoutes.length
    if (!confirm(`Delete ${n} route${n === 1 ? '' : 's'} permanently? This can't be undone.`)) return
    return runBulk(selectedRoutes.map((r) => r.id), deleteRoute)
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
              title={reviewable.length ? undefined : 'None of the selected routes are waiting for review'}
              onClick={() => askToApprove(reviewable)}
            >
              <CheckCircle size={13} /> Approve ({reviewable.length})
            </button>
            <button
              className="btn btn-sm btn-outline"
              disabled={bulkBusy || !reviewable.length}
              title={reviewable.length ? undefined : 'None of the selected routes are waiting for review'}
              onClick={() => setRejecting(reviewable.map((r) => r.id))}
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
                    {waitingText(r) ? (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          marginTop: 2,
                          fontWeight: isOverdue(r) ? 600 : 400,
                          color: isOverdue(r) ? 'var(--danger)' : 'var(--text-muted)',
                        }}
                      >
                        {waitingText(r)}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <StatusBadge status={r.status} />
                      {r.status === 'pending' && r.isEdited ? <EditedBadge editCount={r.editCount} /> : null}
                      {r.isUnverified ? <span className="badge badge-pending" title="Only the automatic checks have looked at this">Unverified</span> : null}
                    </div>
                    {r.status === 'pending' && flagsOf(r).length > 0 ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--warning)', marginTop: 4, maxWidth: 220 }}>
                        {flagsOf(r).length} flag{flagsOf(r).length === 1 ? '' : 's'}: {flagsOf(r)[0].message}
                      </div>
                    ) : null}
                    {rejectionSummary(r) ? (
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4, maxWidth: 220 }}>
                        {rejectionSummary(r)}
                      </div>
                    ) : null}
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
                      {r.status === 'pending' ? (
                        <>
                          <button className="btn btn-sm btn-success" disabled={approve.isPending} onClick={() => askToApprove([r])}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => setRejecting([r.id])}>Reject</button>
                        </>
                      ) : null}
                      <button className="btn btn-sm btn-outline" onClick={() => setPreview(r)}>Preview</button>
                      {r.status !== 'pending' ? (
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
              <RouteChecklist checks={preview.checks ?? []} />
              {[
                ...(rejectionSummary(preview) ? [['Rejected because', rejectionSummary(preview)]] : []),
                ['Trust', `${computeRouteTrust(preview).total}/100 (${computeRouteTrust(preview).label})`],
                [
                  'Steps',
                  (preview.steps ?? []).length
                    ? preview.steps!.map((s) => `${s.mode}: ${s.instruction}`).join(' -> ')
                    : 'No step data',
                ],
                ['Transport Modes', (preview.transportModes ?? []).join(', ') || 'N/A'],
                ['ETA', formatEta(preview)],
                ['Fare Estimate', preview.price ?? 'N/A'],
                ['Distance', formatDistance(preview)],
              ].map(([label, value]) => (
                <div key={String(label)} className="dialog-field">
                  <span className="dialog-field-label">{label}</span>
                  <span className="dialog-field-value">{value}</span>
                </div>
              ))}
              {preview.status === 'approved' ? (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                  <button
                    className="btn btn-sm btn-outline"
                    disabled={verify.isPending}
                    onClick={() => verify.mutate({ id: preview.id, verified: Boolean(preview.isUnverified) })}
                  >
                    {preview.isUnverified ? 'Mark as verified' : 'Mark as unverified'}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {approving ? (
        <ApproveNoteDialog
          count={approving.length}
          flags={Array.from(new Set(approving.flatMap((r) => flagsOf(r).map((check) => check.message))))}
          onCancel={() => setApproving(null)}
          onConfirm={(note) => confirmApprove(approving, note)}
        />
      ) : null}

      {rejecting ? (
        <RejectRouteDialog
          count={rejecting.length}
          onCancel={() => setRejecting(null)}
          onConfirm={(reasonCodes, note) => confirmReject(rejecting, reasonCodes, note)}
        />
      ) : null}
    </div>
  )
}
