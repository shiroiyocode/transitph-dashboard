import { Timestamp } from 'firebase/firestore'
import type { RouteItem, RouteStopItem } from '@/types/models'

function toTimestamp(value: unknown): Timestamp | undefined {
  if (typeof value !== 'string' || !value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : Timestamp.fromDate(date)
}

const asString = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** `[{lat, lng, name?}]` as saved by the app. Anything else is skipped. */
function toLatLngs(value: unknown): RouteStopItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((p: unknown) => {
    const point = p as Record<string, unknown> | null
    if (typeof point?.lat !== 'number' || typeof point?.lng !== 'number') return []
    return [{ lat: point.lat, lng: point.lng, name: typeof point.name === 'string' ? point.name : undefined }]
  })
}

/**
 * Turns a `transit_routes` row from routes-api into what the pages expect.
 * The route's details are in `data`. The other columns belong to the server, so
 * they win. "published" stays a server word, and the pages keep saying "approved".
 */
export function mapRouteRow(row: Record<string, unknown>): RouteItem {
  const data = (row.data ?? {}) as Record<string, unknown>
  const summary = (row.feedback_summary ?? undefined) as Record<string, unknown> | undefined
  const steps = Array.isArray(data.steps) ? (data.steps as Record<string, unknown>[]) : []
  const decision = row.latest_decision as Record<string, unknown> | undefined

  return {
    id: String(row.id),
    startLocation: asString(data.startLocation) ?? 'Unknown',
    endLocation: asString(data.endLocation) ?? 'Unknown',
    contributorId: asString(row.contributor_id) ?? '',
    contributorName: asString(row.contributor_name),
    createdAt: toTimestamp(row.created_at),
    updatedAt: toTimestamp(row.updated_at),
    editedAt: toTimestamp(data.editedAt),
    status: row.status === 'published' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'pending',
    isEdited: Boolean(data.isEdited ?? false),
    editCount: Number(data.editCount ?? 0),
    views: Number(row.views ?? 0),
    upvotes: Number(row.upvotes ?? 0),
    downvotes: Number(row.downvotes ?? 0),
    feedbackSummary: summary
      ? {
          fareAccurateYes: Number(summary.fareAccurateYes ?? 0),
          fareAccurateNo: Number(summary.fareAccurateNo ?? 0),
          scheduleAccurateYes: Number(summary.scheduleAccurateYes ?? 0),
          scheduleAccurateNo: Number(summary.scheduleAccurateNo ?? 0),
          stillOperatingYes: Number(summary.stillOperatingYes ?? 0),
          stillOperatingNo: Number(summary.stillOperatingNo ?? 0),
        }
      : undefined,
    steps: steps.map((s) => ({
      mode: typeof s?.mode === 'string' ? s.mode : 'Unknown',
      instruction: typeof s?.instruction === 'string' ? s.instruction : '',
      details: typeof s?.details === 'string' ? s.details : undefined,
      actualFare: typeof s?.actualFare === 'number' ? s.actualFare : undefined,
      // Like the app: trains, and steps set to designated stops.
      stops: s?.mode === 'Train' || s?.boarding === 'designated' ? toLatLngs(s?.stops) : undefined,
    })),
    pathPoints: toLatLngs(data.pathPoints),
    stepBoundaries: Array.isArray(data.stepBoundaries)
      ? data.stepBoundaries.filter((b: unknown): b is number => typeof b === 'number')
      : [],
    transportModes: Array.from(
      new Set(steps.map((s) => s?.mode).filter((m: unknown): m is string => typeof m === 'string')),
    ),
    eta: asString(data.eta),
    price: asString(data.price),
    distance: asString(data.distance),
    distanceMeters: typeof data.distanceMeters === 'number' ? data.distanceMeters : undefined,
    latestDecision: decision
      ? {
          decision: asString(decision.decision) ?? '',
          reasonCodes: Array.isArray(decision.reason_codes)
            ? decision.reason_codes.filter((c: unknown): c is string => typeof c === 'string')
            : [],
          note: asString(decision.note),
        }
      : undefined,
  }
}

/**
 * Rows the dashboard lists. A "withdrawn" row is a correction being merged right
 * now, so it isn't a route anyone should act on.
 */
export function mapRouteRows(rows: Record<string, unknown>[]): RouteItem[] {
  return rows.filter((row) => row.status !== 'withdrawn').map(mapRouteRow)
}
