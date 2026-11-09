import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ROUTE_REJECTION_REASONS } from '@/lib/routeRejectionReasons'

/**
 * Asks why routes are being rejected. Contributors read the answer, so it can't
 * be confirmed without a reason. It starts clean each time it opens, because the
 * page only mounts it while it's open.
 */
export function RejectRouteDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number
  onCancel: () => void
  onConfirm: (reasonCodes: string[], note?: string) => void
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')

  const trimmedNote = note.trim()
  const noteRequired = ROUTE_REJECTION_REASONS.some((r) => r.needsNote && picked.includes(r.code))
  const canConfirm = picked.length > 0 && (!noteRequired || trimmedNote.length > 0)

  const toggle = (code: string) =>
    setPicked((current) => (current.includes(code) ? current.filter((c) => c !== code) : [...current, code]))

  // Keep the list's own order, not the order they were clicked in.
  const confirm = () =>
    onConfirm(
      ROUTE_REJECTION_REASONS.map((r) => r.code as string).filter((code) => picked.includes(code)),
      trimmedNote || undefined,
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{count === 1 ? 'Reject this route?' : `Reject ${count} routes?`}</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 14px' }}>
          The contributor sees these reasons and can fix the route and send it again.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {ROUTE_REJECTION_REASONS.map((reason) => {
            const selected = picked.includes(reason.code)
            return (
              <button
                key={reason.code}
                type="button"
                aria-pressed={selected}
                className={`btn btn-sm ${selected ? 'btn-danger' : 'btn-outline'}`}
                onClick={() => toggle(reason.code)}
              >
                {reason.label}
              </button>
            )
          })}
        </div>
        <textarea
          value={note}
          maxLength={300}
          rows={3}
          placeholder={noteRequired ? 'Say what the problem is (required)' : 'Add a note (optional)'}
          aria-label="Note for the contributor"
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-danger" disabled={!canConfirm} onClick={confirm}>
            {count === 1 ? 'Reject route' : `Reject ${count} routes`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
