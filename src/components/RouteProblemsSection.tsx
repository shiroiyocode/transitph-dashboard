import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Pager } from '@/components/Pager'
import { usePaged } from '@/hooks/usePaged'
import { callRoutesApi } from '@/lib/routesApi'
import { describeCounts, faresPaid, ISSUE_LABELS, mapRouteProblems, type RouteProblem, sourceLabel } from '@/lib/routeProblems'

type Resolution = 'resolved' | 'dismissed'

async function getRouteProblems() {
  return mapRouteProblems(await callRoutesApi<unknown>('issue_queue'))
}

async function settleRouteProblem(input: { routeKey: string; resolution: Resolution; note: string }) {
  await callRoutesApi('settle_issues', {
    routeId: input.routeKey,
    resolution: input.resolution,
    ...(input.note ? { note: input.note } : {}),
  })
}

/** Asks for an optional note before closing a route's reports. Mounted only while open. */
function SettleDialog({
  problem,
  resolution,
  onCancel,
  onConfirm,
}: {
  problem: RouteProblem
  resolution: Resolution
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const fixed = resolution === 'resolved'
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{fixed ? 'Mark as fixed?' : 'Dismiss these reports?'}</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          {fixed
            ? `Use this when "${problem.title}" was fixed, or you checked and it's right.`
            : `Use this when the reports on "${problem.title}" are wrong.`}{' '}
          Its {problem.issues.length} open {problem.issues.length === 1 ? 'report closes' : 'reports close'} and the
          Possibly outdated label goes.
        </p>
        <textarea
          value={note}
          maxLength={500}
          rows={3}
          placeholder="What you checked (optional)"
          aria-label="What you checked"
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={fixed ? 'btn btn-sm btn-success' : 'btn btn-sm btn-danger'}
            onClick={() => onConfirm(note.trim())}
          >
            {fixed ? 'Mark as fixed' : 'Dismiss'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Riders' reports about a route's details. Most need nothing: 5 matching reports
 * mark a route Possibly outdated, and 3 matching fares fix the fare, by
 * themselves. Staff step in to clear a label after checking, or to throw out
 * wrong reports.
 */
export function RouteProblemsSection() {
  const qc = useQueryClient()
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['route-problems'], queryFn: getRouteProblems })
  const [settling, setSettling] = useState<{ problem: RouteProblem; resolution: Resolution } | null>(null)
  const settle = useMutation({
    mutationFn: settleRouteProblem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['route-problems'] }),
  })
  const paged = usePaged(data)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600 }}>Route problems</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Wrong fares, paths, stops or schedules. 5 riders mark a route Possibly outdated.
        </span>
      </div>
      {settle.isError && <div className="state-banner error">Couldn't save that. Try again.</div>}
      {isLoading ? (
        <div className="skeleton" style={{ height: 48 }} />
      ) : isError ? (
        <div className="state-banner error">Failed to load route problems.</div>
      ) : !data.length ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No route problems right now.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Route</th><th>Reports</th><th>Details</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {paged.rows.map((p) => {
                const fares = faresPaid(p.issues)
                const notes = p.issues.filter((i) => i.note).slice(0, 3)
                const fixes = p.issues.filter((i) => i.correctionId).length
                const busy = settle.isPending && settle.variables?.routeKey === p.routeKey
                return (
                  <tr key={p.routeKey}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{sourceLabel(p.source)}</div>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>{describeCounts(p.counts)}</td>
                    <td style={{ maxWidth: 300, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {fares && <div>Fares paid: {fares}</div>}
                      {fixes > 0 && <div>{fixes} drawn {fixes === 1 ? 'fix' : 'fixes'} waiting in Routes</div>}
                      {notes.map((i) => (
                        <div key={i.id} style={{ fontStyle: 'italic' }}>
                          {ISSUE_LABELS[i.type] ?? i.type}: "{i.note}"
                        </div>
                      ))}
                      {!fares && !fixes && !notes.length && '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: p.outdated ? 'var(--warning)' : 'var(--text-secondary)' }}>
                      {p.outdated ? 'Possibly outdated' : 'Open'}
                    </td>
                    <td>
                      <div className="action-group">
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={busy}
                          title="The reports are wrong"
                          onClick={() => setSettling({ problem: p, resolution: 'dismissed' })}
                          style={{ gap: 4 }}
                        >
                          <XCircle size={12} /> Dismiss
                        </button>
                        <button
                          className="btn btn-sm btn-success"
                          disabled={busy}
                          title="Fixed, or checked and right"
                          onClick={() => setSettling({ problem: p, resolution: 'resolved' })}
                          style={{ gap: 4 }}
                        >
                          <CheckCircle2 size={12} /> Mark as fixed
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
      <Pager {...paged} />
      {settling && (
        <SettleDialog
          problem={settling.problem}
          resolution={settling.resolution}
          onCancel={() => setSettling(null)}
          onConfirm={(note) => {
            settle.mutate({ routeKey: settling.problem.routeKey, resolution: settling.resolution, note })
            setSettling(null)
          }}
        />
      )}
    </div>
  )
}
