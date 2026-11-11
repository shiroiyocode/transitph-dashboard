import type { Timestamp } from 'firebase/firestore'

export type UserRole = 'user' | 'moderator' | 'superadmin'
export type UserStatus = 'active' | 'offline' | 'restricted' | 'banned'
export type RouteStatus = 'pending' | 'approved' | 'rejected'
export type PostStatus = 'pending' | 'approved' | 'flagged' | 'rejected'
export type AnnouncementType = 'info' | 'warning' | 'critical'
export type AudienceType = 'all' | 'student' | 'employee' | 'foreigner' | 'new_to_area'

export interface AppUser {
  id: string
  name: string
  email: string
  role: UserRole
  status: UserStatus
  restrictedUntil?: Timestamp
  /** Why they're banned or restricted, when staff gave a reason. */
  lockout?: LockoutRecordItem
  createdAt?: Timestamp
  routesContributed: number
  badges?: string[]
  achievements?: string[]
  streakDays?: number
  contributionCount?: number
  userCategory?: AudienceType
}

export interface RouteItem {
  id: string
  startLocation: string
  endLocation: string
  contributorId: string
  contributorName?: string
  contributorEmail?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  editedAt?: Timestamp
  status: RouteStatus
  isEdited?: boolean
  editCount?: number
  views: number
  upvotes: number
  downvotes: number
  feedbackSummary?: {
    fareAccurateYes?: number
    fareAccurateNo?: number
    scheduleAccurateYes?: number
    scheduleAccurateNo?: number
    stillOperatingYes?: number
    stillOperatingNo?: number
  }
  steps?: RouteStepItem[]
  transportModes?: string[]
  eta?: string
  price?: string
  distance?: string
  distanceMeters?: number
  /** The drawn line, and where each step ends on it (indexes). */
  pathPoints?: LatLngItem[]
  stepBoundaries?: number[]
  /** The latest thing that happened to it, like the reasons it was rejected. */
  latestDecision?: {
    decision: string
    reasonCodes: string[]
    note?: string
    /** "system" when the automatic checks decided. */
    actor?: string
  }
  /** Live, but only the automatic checks have looked at it so far. */
  isUnverified?: boolean
  checks?: RouteCheckItem[]
}

export interface RouteCheckItem {
  code: string
  result: 'pass' | 'fail' | 'flag' | 'skip'
  message: string
}

export type FareRuleMode = 'jeepney' | 'jeepney_modern' | 'bus' | 'bus_aircon' | 'fx_van' | 'tricycle'

export interface FareRuleItem {
  id: number
  mode: FareRuleMode
  base: number
  base_km: number
  per_km: number
  effective_from: string
  source: string
}

export interface LatLngItem {
  lat: number
  lng: number
}

export interface RouteStopItem extends LatLngItem {
  name?: string
}

export interface RouteStepItem {
  mode: string
  instruction: string
  details?: string
  actualFare?: number
  /** Designated stops, for steps that only board at them. */
  stops?: RouteStopItem[]
}

export interface PostItem {
  id: string
  userId: string
  userName?: string
  userEmail?: string
  category?: string
  content: string
  images?: string[]
  /** Route the author attached to the post, if any. */
  routeId?: string
  /** "Start → End" label saved with the attached route. */
  routeLabel?: string
  moderationStatus: PostStatus
  isFlagged?: boolean
  createdAt?: Timestamp
}

/** A commuter's report on a route. Shows on every route on the same road for a
 * day, or until removed when kept. */
export interface RouteReportItem {
  id: string
  routeId: string
  routeLabel: string
  type: string
  description?: string
  createdAt?: Timestamp
  expiresAt?: Timestamp
  kept: boolean
}

export interface FeedbackItem {
  id: string
  type: 'feedback' | 'report'
  status: 'pending' | 'resolved' | 'dismissed'
  message: string
  reason?: string
  postId?: string
  createdAt?: Timestamp
  userId?: string
}

/** users/{uid}/moderation/current: why a commuter is banned or restricted. */
export interface LockoutRecordItem {
  action: 'ban' | 'restrict'
  reasonCode: string
  reasonLabel: string
  termsSection: string
  note: string
  lockoutId: string
  at?: Timestamp
  until?: Timestamp
}

export type AppealStatus = 'pending' | 'lifted' | 'upheld'

/** appeals/{uid}_{lockoutId}: a commuter asking to undo a ban or restriction. */
export interface AppealItem {
  id: string
  userId: string
  userName: string
  userEmail: string
  action: 'ban' | 'restrict'
  reasonLabel: string
  note: string
  message: string
  status: AppealStatus
  reply: string
  createdAt?: Timestamp
  reviewedAt?: Timestamp
}

export interface AnnouncementItem {
  id: string
  title: string
  message: string
  type: AnnouncementType
  targetAudience: AudienceType
  isActive: boolean
  scheduledAt?: Timestamp
  expiresAt?: Timestamp
  createdAt?: Timestamp
  createdBy?: string
}

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  bannedUsers: number
  restrictedUsers: number
  routes: { approved: number; pending: number; rejected: number }
  posts: { approved: number; pending: number; flagged: number }
  userGrowth: Array<{ label: string; count: number }>
  routesPerWeek: Array<{ label: string; count: number }>
  recentActivity: DashboardActivity[]
}

export type DashboardActivityType = 'signup' | 'route' | 'post' | 'report' | 'appeal'
export type DashboardActivitySeverity = 'info' | 'warning' | 'critical'

export interface DashboardActivity {
  id: string
  type: DashboardActivityType
  description: string
  time: string
  timestampMs: number
  severity: DashboardActivitySeverity
}
