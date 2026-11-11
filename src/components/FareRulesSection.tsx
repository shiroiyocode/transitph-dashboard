import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addFareRule, getFareRules } from '@/lib/firestoreApi'
import type { FareRuleItem, FareRuleMode } from '@/types/models'

const MODES: { mode: FareRuleMode; label: string }[] = [
  { mode: 'jeepney', label: 'Jeepney (traditional)' },
  { mode: 'jeepney_modern', label: 'Jeepney (modern)' },
  { mode: 'bus', label: 'Bus (ordinary)' },
  { mode: 'bus_aircon', label: 'Bus (aircon)' },
  { mode: 'fx_van', label: 'FX / Van' },
  { mode: 'tricycle', label: 'Tricycle' },
]

const BLANK = { mode: 'jeepney' as FareRuleMode, base: '', baseKm: '', perKm: '', source: '', effectiveFrom: '' }

/**
 * The fare table behind the automatic checks and the app's estimates. Saving
 * adds a new rate instead of changing the old one, so past rates stay on record.
 * Rows marked "TransitPH estimate" are ours. Replace them with LTFRB's published
 * rates, and the checks start naming LTFRB as their source.
 */
export function FareRulesSection() {
  const qc = useQueryClient()
  const { data: rules = [], isLoading, isError } = useQuery({ queryKey: ['fare-rules'], queryFn: getFareRules })
  const [form, setForm] = useState(BLANK)

  // The server sends newest first, so the first per mode is the one in use.
  const current = useMemo(() => {
    const byMode = new Map<string, FareRuleItem>()
    const today = new Date().toISOString().slice(0, 10)
    for (const rule of rules) {
      if (rule.effective_from <= today && !byMode.has(rule.mode)) byMode.set(rule.mode, rule)
    }
    return byMode
  }, [rules])

  const save = useMutation({
    mutationFn: () =>
      addFareRule({
        mode: form.mode,
        base: Number(form.base),
        base_km: Number(form.baseKm),
        per_km: Number(form.perKm),
        source: form.source.trim(),
        ...(form.effectiveFrom ? { effective_from: form.effectiveFrom } : {}),
      }),
    onSuccess: () => {
      setForm(BLANK)
      qc.invalidateQueries({ queryKey: ['fare-rules'] })
    },
    onError: () => alert("Couldn't save that rate. Check the numbers and try again."),
  })

  const valid =
    Number(form.base) > 0 &&
    form.baseKm !== '' &&
    Number(form.baseKm) >= 0 &&
    form.perKm !== '' &&
    Number(form.perKm) >= 0 &&
    form.source.trim() !== ''

  return (
    <div className="settings-section">
      <div className="settings-title">Fare rates</div>
      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: '4px 0 14px' }}>
        The automatic checks and the app's fare estimates use these. Saving adds a new rate and keeps the old one on record.
      </p>

      {isError ? (
        <div className="state-banner error">Couldn't load the fare rates.</div>
      ) : isLoading ? (
        <div className="skeleton" />
      ) : (
        <div className="table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr><th>Mode</th><th>Base fare</th><th>Covers</th><th>Per km after</th><th>Since</th><th>Source</th></tr>
            </thead>
            <tbody>
              {MODES.map(({ mode, label }) => {
                const rule = current.get(mode)
                return (
                  <tr key={mode}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    <td>{rule ? `₱${rule.base}` : '-'}</td>
                    <td>{rule ? `${rule.base_km} km` : '-'}</td>
                    <td>{rule ? `₱${rule.per_km}` : '-'}</td>
                    <td>{rule?.effective_from ?? '-'}</td>
                    <td style={{ color: /estimate/i.test(rule?.source ?? '') ? 'var(--warning)' : undefined }}>
                      {rule?.source ?? '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-grid">
        <div className="form-group">
          <label htmlFor="fare-mode">Mode</label>
          <select id="fare-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as FareRuleMode })}>
            {MODES.map(({ mode, label }) => <option key={mode} value={mode}>{label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="fare-base">Base fare (₱)</label>
          <input id="fare-base" type="number" min="0" step="0.01" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="fare-km">Base fare covers (km)</label>
          <input id="fare-km" type="number" min="0" step="0.1" value={form.baseKm} onChange={(e) => setForm({ ...form, baseKm: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="fare-per">Per km after that (₱)</label>
          <input id="fare-per" type="number" min="0" step="0.01" value={form.perKm} onChange={(e) => setForm({ ...form, perKm: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="fare-source">Source (like the LTFRB circular)</label>
          <input id="fare-source" type="text" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
        </div>
        <div className="form-group">
          <label htmlFor="fare-date">Starts on (blank means today)</label>
          <input id="fare-date" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-sm btn-success" disabled={!valid || save.isPending} onClick={() => save.mutate()} style={{ marginTop: 12 }}>
        Save new rate
      </button>
    </div>
  )
}
