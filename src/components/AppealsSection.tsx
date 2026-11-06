import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Scale } from 'lucide-react'
import { decideAppeal, getAppeals } from '@/lib/firestoreApi'
import { useAuth } from '@/hooks/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { AppealItem } from '@/types/models'

function StatusBadge({ status }: { status: AppealItem['status'] }) {
  if (status === 'lifted') return <span className="badge badge-approved"><span className="badge-dot" />Lifted</span>
  if (status === 'upheld') return <span className="badge badge-user"><span className="badge-dot" />Upheld</span>
  return <span className="badge badge-pending"><span className="badge-dot" />Waiting</span>
}

// Decided appeals stay listed for a while so staff can see what was done,
// but only the latest few.
const DECIDED_SHOWN = 10

/**
 * Riders' appeals against a ban or restriction. Lift lets them back in;
 * Uphold keeps the decision and sends an optional reply they see the next
 * time they open the app.
 */
export function AppealsSection() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { data = [], isLoading, isError } = useQuery({ queryKey: ['appeals'], queryFn: getAppeals })
  const [deciding, setDeciding] = useState<{ appeal: AppealItem; lift: boolean } | null>(null)
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)

  const decide = useMutation({
    mutationFn: ({ appeal, lift, text }: { appeal: AppealItem; lift: boolean; text: string }) =>
      decideAppeal(appeal, lift, text, user?.uid),
    onSuccess: async () => {
      setError(null)
      await qc.invalidateQueries({ queryKey: ['appeals'] })
      await qc.invalidateQueries({ queryKey: ['users'] })
    },
    onError: (err) => setError(`Couldn't save the decision. ${err instanceof Error ? err.message : ''}`),
  })

  const waiting = data.filter((a) => a.status === 'pending')
  const shown = [...waiting, ...data.filter((a) => a.status !== 'pending').slice(0, DECIDED_SHOWN)]
  const close = () => { setDeciding(null); setReply('') }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Scale size={16} color="var(--accent)" />
        <span style={{ fontWeight: 600 }}>Appeals{waiting.length > 0 ? ` (${waiting.length} waiting)` : ''}</span>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Banned or restricted riders asking for the decision to change
        </span>
      </div>
      {error && <div className="state-banner error">{error}</div>}
      {isLoading ? (
        <div className="skeleton" style={{ height: 48 }} />
      ) : isError ? (
        <div className="state-banner error">Failed to load appeals. The new Firestore rules may not be deployed yet.</div>
      ) : !shown.length ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No appeals right now.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Rider</th><th>Type</th><th>Reason given</th><th>Their appeal</th><th>Sent</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 600 }}>{a.userName || 'Unknown'}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{a.userEmail}</div>
                  </td>
                  <td style={{ fontSize: '0.82rem' }}>{a.action === 'ban' ? 'Ban' : 'Restriction'}</td>
                  <td style={{ maxWidth: 200, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    {a.reasonLabel || 'No reason recorded'}
                    {a.note ? <div style={{ marginTop: 2 }}>{a.note}</div> : null}
                  </td>
                  <td style={{ maxWidth: 280, fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
                    {a.message}
                    {a.reply ? <div style={{ marginTop: 6, color: 'var(--text-secondary)' }}>Reply: {a.reply}</div> : null}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.createdAt?.toDate().toLocaleString() ?? '-'}</td>
                  <td><StatusBadge status={a.status} /></td>
                  <td>
                    {a.status === 'pending' ? (
                      <div className="action-group">
                        <button className="btn btn-sm btn-success" disabled={decide.isPending} onClick={() => setDeciding({ appeal: a, lift: true })}>
                          Lift
                        </button>
                        <button className="btn btn-sm btn-outline" disabled={decide.isPending} onClick={() => setDeciding({ appeal: a, lift: false })}>
                          Uphold
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(deciding)} onOpenChange={(open) => { if (!open) close() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.lift ? 'Lift and let them back in?' : 'Keep the decision?'}</DialogTitle>
          </DialogHeader>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 12 }}>
            {deciding?.lift
              ? `${deciding.appeal.userName || 'The rider'} can sign in again right away.`
              : `${deciding?.appeal.userName || 'The rider'} stays locked out and sees that their appeal was reviewed, with your reply if you write one.`}
          </p>
          {!deciding?.lift && (
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Reply to the rider (optional)"
              style={{ width: '100%' }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn btn-outline" onClick={close}>Cancel</button>
            <button
              className={deciding?.lift ? 'btn btn-success' : 'btn btn-danger'}
              onClick={() => {
                if (deciding) decide.mutate({ appeal: deciding.appeal, lift: deciding.lift, text: deciding.lift ? '' : reply })
                close()
              }}
            >
              {deciding?.lift ? 'Lift' : 'Uphold'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
