/**
 * Why a route can be rejected. The codes must match the server's list in
 * routes-api and the app's RouteRejectionReason, because the server refuses
 * anything else.
 */
export const ROUTE_REJECTION_REASONS = [
  { code: 'incomplete', label: 'Missing information', needsNote: false },
  { code: 'outside_area', label: 'Outside the service area', needsNote: false },
  { code: 'wrong_path', label: "Path doesn't match the real route", needsNote: false },
  { code: 'wrong_fare', label: 'Fare is wrong', needsNote: false },
  { code: 'duplicate', label: 'Already exists', needsNote: false },
  { code: 'not_operating', label: 'Route no longer runs', needsNote: false },
  { code: 'unsafe_or_spam', label: 'Spam or unsafe content', needsNote: false },
  { code: 'other', label: 'Other', needsNote: true },
] as const

export function rejectionReasonLabel(code: string): string {
  return ROUTE_REJECTION_REASONS.find((reason) => reason.code === code)?.label ?? code
}
