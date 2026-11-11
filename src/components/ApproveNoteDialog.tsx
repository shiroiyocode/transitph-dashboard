import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Asks why flagged routes are being approved. The server refuses approval over a
 * flag without a note, and the note goes on the route's record. The page only
 * mounts this while it's open, so it starts clean each time.
 */
export function ApproveNoteDialog({
  count,
  flags,
  onCancel,
  onConfirm,
}: {
  count: number
  flags: string[]
  onCancel: () => void
  onConfirm: (note: string) => void
}) {
  const [note, setNote] = useState('')
  const trimmed = note.trim()

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{count === 1 ? 'Approve over a flag?' : `Approve ${count} flagged routes?`}</DialogTitle>
        </DialogHeader>
        <ul style={{ margin: '8px 0 14px', paddingLeft: 18, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {flags.map((flag) => (
            <li key={flag} style={{ marginBottom: 4 }}>{flag}</li>
          ))}
        </ul>
        <textarea
          value={note}
          maxLength={300}
          rows={3}
          placeholder="Why is it OK to approve? (required)"
          aria-label="Why it's OK to approve"
          onChange={(e) => setNote(e.target.value)}
          style={{ width: '100%', marginBottom: 14 }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-sm btn-success" disabled={!trimmed} onClick={() => onConfirm(trimmed)}>
            Approve
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
