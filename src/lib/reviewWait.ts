import type { RouteItem } from '@/types/models'

/**
 * Days a route waits for a moderator before it counts as overdue. The server's
 * auto_publish_waiting_routes job uses the same 7 days: a route whose only flag
 * is "new contributor" goes live as Unverified then.
 */
export const REVIEW_DAYS = 7

const DAY_MS = 86400000

type Waiting = Pick<RouteItem, 'status' | 'queuedAt'>

/** Whole days a pending route has waited. 0 for any other status. */
export function daysWaiting(route: Waiting, now = Date.now()): number {
  if (route.status !== 'pending' || !route.queuedAt) return 0
  return Math.max(0, Math.floor((now - route.queuedAt.toMillis()) / DAY_MS))
}

export const isOverdue = (route: Waiting, now = Date.now()) => daysWaiting(route, now) >= REVIEW_DAYS

/** "New today", "Waiting 3 days", "Overdue · 9 days". Null when it isn't waiting. */
export function waitingText(route: Waiting, now = Date.now()): string | null {
  if (route.status !== 'pending' || !route.queuedAt) return null
  const days = daysWaiting(route, now)
  if (days === 0) return 'New today'
  if (isOverdue(route, now)) return `Overdue · ${days} days`
  return `Waiting ${days} ${days === 1 ? 'day' : 'days'}`
}

/**
 * Pending routes first, the one that has waited longest at the top, so overdue
 * ones get looked at first. Everything else keeps the order it came in.
 */
export function reviewOrder<T extends Waiting>(routes: T[]): T[] {
  const waited = (route: T) => route.queuedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
  const pending = routes.filter((r) => r.status === 'pending').sort((a, b) => waited(a) - waited(b))
  return [...pending, ...routes.filter((r) => r.status !== 'pending')]
}
