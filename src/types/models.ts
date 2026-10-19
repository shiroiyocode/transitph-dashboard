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
  moderationStatus: PostStatus
  isFlagged?: boolean
  createdAt?: Timestamp
}

/** A rider's report on a route; shows on every route on the same road for a
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

export type DashboardActivityType = 'signup' | 'route' | 'post' | 'report'
export type DashboardActivitySeverity = 'info' | 'warning' | 'critical'

export interface DashboardActivity {
  id: string
  type: DashboardActivityType
  description: string
  time: string
  timestampMs: number
  severity: DashboardActivitySeverity
}
