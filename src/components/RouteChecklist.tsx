import { CheckCircle, Flag, XCircle } from 'lucide-react'
import type { RouteCheckItem } from '@/types/models'

/** The automatic checks for a route. What needs attention comes first. */
export function RouteChecklist({ checks }: { checks: RouteCheckItem[] }) {
  // A check that didn't apply to this route tells the reader nothing.
  const shown = checks.filter((check) => check.result !== 'skip')
  if (!shown.length) return null

  const order = { fail: 0, flag: 1, pass: 2, skip: 3 }
  const sorted = [...shown].sort((a, b) => order[a.result] - order[b.result])

  return (
    <div className="dialog-field" style={{ display: 'block' }}>
      <span className="dialog-field-label">Automatic checks</span>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {sorted.map((check) => (
          <div key={check.code} style={{ display: 'flex', gap: 8, fontSize: '0.84rem', alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, marginTop: 2 }}>
              {check.result === 'fail' ? (
                <XCircle size={14} color="var(--danger)" />
              ) : check.result === 'flag' ? (
                <Flag size={14} color="var(--warning)" />
              ) : (
                <CheckCircle size={14} color="var(--success)" />
              )}
            </span>
            <span style={{ color: check.result === 'pass' ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
              {check.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
