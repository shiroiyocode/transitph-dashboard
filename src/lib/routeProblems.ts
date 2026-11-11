// Riders' reports about a route's details (fare, path, stops, schedule, still
// running), as the routes-api issue_queue sends them. No imports, so the tests
// can load it directly.

export const ISSUE_LABELS: Record<string, string> = {
  wrong_fare: 'Wrong fare',
  wrong_path: 'Wrong path',
  not_operating: 'Not running anymore',
  wrong_schedule: 'Wrong schedule',
  wrong_stop: 'Wrong stop',
  other: 'Something else',
}

export type RouteIssue = {
  id: number
  reporterId: string
  type: string
  farePaid: number | null
  stepIndex: number | null
  note: string | null
  correctionId: string | null
  createdAt: string | null
}

export type RouteProblem = {
  /** The route's id, or gtfs:<route_id> for the DOTC 2013 feed. */
  routeKey: string
  title: string
  source: string | null
  /** Set when 5 or more riders made the same report: "Possibly outdated". */
  outdated: { types: string[]; riders: number; since: string | null } | null
  /** Different riders per report type. */
  counts: Record<string, number>
  riders: number
  issues: RouteIssue[]
}

const text = (value: unknown) => (typeof value === 'string' ? value : null)
const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function mapIssue(raw: Record<string, unknown>): RouteIssue {
  const fare = raw.fare_paid === null || raw.fare_paid === undefined ? null : Number(raw.fare_paid)
  return {
    id: count(raw.id),
    reporterId: text(raw.reporter_id) ?? '',
    type: text(raw.type) ?? 'other',
    farePaid: fare !== null && Number.isFinite(fare) ? fare : null,
    stepIndex: typeof raw.step_index === 'number' ? raw.step_index : null,
    note: text(raw.note),
    correctionId: text(raw.correction_id),
    createdAt: text(raw.created_at),
  }
}

/** Skips anything that isn't shaped like a problem instead of failing the list. */
export function mapRouteProblems(raw: unknown): RouteProblem[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    const routeKey = text(row.routeKey)
    if (!routeKey) return []
    const label = row.outdated as Record<string, unknown> | null | undefined
    const counts: Record<string, number> = {}
    if (row.counts && typeof row.counts === 'object') {
      for (const [type, riders] of Object.entries(row.counts as Record<string, unknown>)) {
        if (count(riders) > 0) counts[type] = count(riders)
      }
    }
    return [{
      routeKey,
      title: text(row.title) ?? routeKey,
      source: text(row.source),
      outdated: label && typeof label === 'object'
        ? {
          types: Array.isArray(label.types) ? label.types.filter((t): t is string => typeof t === 'string') : [],
          riders: count(label.riders),
          since: text(label.since),
        }
        : null,
      counts,
      riders: count(row.riders),
      issues: Array.isArray(row.issues)
        ? row.issues.filter((i) => i && typeof i === 'object').map((i) => mapIssue(i as Record<string, unknown>))
        : [],
    }]
  })
}

export function sourceLabel(source: string | null): string {
  if (source === 'gtfs') return 'DOTC 2013 data'
  if (source === 'osm') return 'OpenStreetMap'
  return 'Rider route'
}

/** "Wrong fare: 3 riders · Wrong stop: 1 rider" */
export function describeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([type, riders]) => `${ISSUE_LABELS[type] ?? type}: ${riders} ${riders === 1 ? 'rider' : 'riders'}`)
    .join(' · ')
}

/** "PHP 15, PHP 15.50 (step 2)", or empty when nobody gave a fare. */
export function faresPaid(issues: RouteIssue[]): string {
  return issues
    .filter((issue) => issue.farePaid !== null)
    .map((issue) => {
      const fare = issue.farePaid!
      const amount = Number.isInteger(fare) ? String(fare) : fare.toFixed(2)
      return `PHP ${amount}${issue.stepIndex !== null ? ` (step ${issue.stepIndex + 1})` : ''}`
    })
    .join(', ')
}
