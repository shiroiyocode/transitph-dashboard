import {
  Timestamp,
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functionsClient } from '@/lib/firebase'
import { lockoutReasonByCode, reasonNeedsNote } from '@/lib/lockoutReasons'
import { rejectionReasonLabel } from '@/lib/routeRejectionReasons'
import { mapRouteRows } from '@/lib/routeRows'
import { callRoutesApi, RoutesApiError } from '@/lib/routesApi'
import type {
  AnnouncementItem,
  AppealItem,
  AppealStatus,
  AppUser,
  LockoutRecordItem,
  DashboardActivity,
  DashboardStats,
  FeedbackItem,
  PostItem,
  FareRuleItem,
  RouteItem,
  RouteReportItem,
  UserRole,
} from '@/types/models'

const usersCol = collection(db, 'users')
// Only for approval history from before the move to Supabase.
const routesCol = collection(db, 'routes')
const ROUTES_REFRESH_MS = 60_000
const postsCol = collection(db, 'posts')
const feedbackCol = collection(db, 'feedbacks')
const announcementsCol = collection(db, 'announcements')

function normalizeTimestamp(value: unknown): Timestamp | undefined {
  if (!value) return undefined
  if (value instanceof Timestamp) return value
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value)
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return Timestamp.fromDate(date)
    }
  }

  if (typeof value === 'object' && value !== null) {
    const maybeSeconds = (value as { seconds?: unknown }).seconds
    const maybeNanos = (value as { nanoseconds?: unknown }).nanoseconds
    if (typeof maybeSeconds === 'number') {
      return new Timestamp(maybeSeconds, typeof maybeNanos === 'number' ? maybeNanos : 0)
    }
  }

  return undefined
}

async function getDocsWithCreatedAtFallback(colRef: ReturnType<typeof collection>) {
  const safeGet = async (loader: () => Promise<QueryDocumentSnapshot<DocumentData>[]>) => {
    try {
      return await loader()
    } catch {
      return [] as QueryDocumentSnapshot<DocumentData>[]
    }
  }

  const [createdAtDocs, timestampDocs, plainDocs] = await Promise.all([
    safeGet(async () => (await getDocs(query(colRef, orderBy('createdAt', 'desc'), limit(500)))).docs),
    safeGet(async () => (await getDocs(query(colRef, orderBy('timestamp', 'desc'), limit(500)))).docs),
    safeGet(async () => (await getDocs(query(colRef, limit(500)))).docs),
  ])

  const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>()
  ;[...createdAtDocs, ...timestampDocs, ...plainDocs].forEach((docSnap) => {
    merged.set(docSnap.id, docSnap)
  })

  return sortDocsByCreatedAtDesc([...merged.values()])
}

function sortDocsByCreatedAtDesc<T extends QueryDocumentSnapshot<DocumentData>>(docs: T[]) {
  return docs.sort((a, b) => {
    const aTs = normalizeTimestamp(a.data().createdAt ?? a.data().timestamp)
    const bTs = normalizeTimestamp(b.data().createdAt ?? b.data().timestamp)
    if (!aTs && !bTs) return 0
    if (!aTs) return 1
    if (!bTs) return -1
    return bTs.toMillis() - aTs.toMillis()
  })
}

function subscribeWithTimestampFallback(
  colRef: ReturnType<typeof collection>,
  onNext: (docs: QueryDocumentSnapshot<DocumentData>[]) => void,
  onFailure: (error: unknown) => void,
) {
  let createdAtDocs: QueryDocumentSnapshot<DocumentData>[] = []
  let timestampDocs: QueryDocumentSnapshot<DocumentData>[] = []
  let plainDocs: QueryDocumentSnapshot<DocumentData>[] = []

  const emitMerged = () => {
    const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>()
    ;[...createdAtDocs, ...timestampDocs, ...plainDocs].forEach((docSnap) => {
      merged.set(docSnap.id, docSnap)
    })
    onNext(sortDocsByCreatedAtDesc([...merged.values()]))
  }

  const unsubCreatedAt = onSnapshot(
    query(colRef, orderBy('createdAt', 'desc'), limit(300)),
    (snap) => {
      createdAtDocs = [...snap.docs]
      emitMerged()
    },
    (err) => onFailure(err),
  )

  const unsubTimestamp = onSnapshot(
    query(colRef, orderBy('timestamp', 'desc'), limit(300)),
    (snap) => {
      timestampDocs = [...snap.docs]
      emitMerged()
    },
    () => {
      timestampDocs = []
      emitMerged()
    },
  )

  const unsubPlain = onSnapshot(
    query(colRef, limit(300)),
    (snap) => {
      plainDocs = [...snap.docs]
      emitMerged()
    },
    (err) => onFailure(err),
  )

  return () => {
    unsubCreatedAt()
    unsubTimestamp()
    unsubPlain()
  }
}

function toDateLabel(ts?: Timestamp) {
  if (!ts) return 'Unknown'
  return ts.toDate().toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function toRelativeTimeLabel(ts?: Timestamp) {
  if (!ts) return 'Unknown'
  const now = Date.now()
  const diffMs = Math.max(0, now - ts.toMillis())
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return toDateLabel(ts)
}

function toTimestampMs(ts?: Timestamp) {
  return ts?.toMillis() ?? 0
}

function toDayBucketKey(ts?: Timestamp): number | null {
  if (!ts) return null
  const d = ts.toDate()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function toWeekBucketKey(ts?: Timestamp): number | null {
  if (!ts) return null
  const d = ts.toDate()
  d.setHours(0, 0, 0, 0)
  const start = new Date(d)
  start.setDate(d.getDate() - d.getDay())
  return start.getTime()
}

function dayBucketLabel(bucket: number) {
  return new Date(bucket).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function getFeedbackReason(data: DocumentData): string {
  const raw = data.reason ?? data.message ?? data.content
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim()
  return 'No reason provided'
}

const MAX_RESTRICTION_DAYS = 7

function getRestrictionUntil(data: DocumentData): Timestamp | undefined {
  const direct = normalizeTimestamp(data.restrictedUntil)
  if (direct) return direct

  const status = String(data.status ?? '').trim().toLowerCase()
  if (status !== 'restricted') return undefined

  const restrictedAt = normalizeTimestamp(data.restrictedAt)
  if (!restrictedAt) return undefined

  return Timestamp.fromMillis(
    restrictedAt.toMillis() + MAX_RESTRICTION_DAYS * 24 * 60 * 60 * 1000,
  )
}

function resolveUserStatus(data: DocumentData): AppUser['status'] {
  const status = String(data.status ?? '').trim().toLowerCase()
  const restrictedUntil = getRestrictionUntil(data)

  if (data.isBanned || status === 'banned') return 'banned'

  if (status === 'restricted') {
    if (!restrictedUntil || restrictedUntil.toMillis() > Date.now()) {
      return 'restricted'
    }
  }

  if (status === 'active' || status === 'offline') {
    return status
  }

  const lastActive = normalizeTimestamp(
    data.lastActiveDate ?? data.lastSeenAt ?? data.updatedAt ?? data.timestamp,
  )

  if (!lastActive) return 'offline'

  const minutesSinceLastActive = Math.max(
    0,
    Math.floor((Date.now() - lastActive.toMillis()) / 60000),
  )

  return minutesSinceLastActive <= 15 ? 'active' : 'offline'
}

function mapUserDoc(d: QueryDocumentSnapshot<DocumentData>): AppUser {
  const data = d.data()
  return {
    id: d.id,
    name: data.displayName ?? data.name ?? data.userName ?? 'Unknown User',
    email: data.email ?? '',
    role: data.role ?? 'user',
    status: resolveUserStatus(data),
    restrictedUntil: getRestrictionUntil(data),
    createdAt: normalizeTimestamp(data.createdAt ?? data.timestamp),
    routesContributed: data.routesContributed ?? data.contributionCount ?? 0,
    badges: data.badges ?? [],
    achievements: data.achievements ?? [],
    streakDays: data.streakDays ?? 0,
    contributionCount: data.contributionCount ?? 0,
    userCategory: data.userCategory ?? 'all',
  } as AppUser
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

async function incrementApprovedContributionStats(contributorUid: string) {
  const uid = contributorUid.trim()
  if (!uid) return

  const userRef = doc(db, 'users', uid)
  await setDoc(
    userRef,
    {
      routesContributed: increment(1),
      contributionCount: increment(1),
    },
    { merge: true },
  )

  const userSnap = await getDoc(userRef)
  if (!userSnap.exists()) return

  const data = userSnap.data() ?? {}
  const routesContributed = Number(data.routesContributed ?? data.contributionCount ?? 0)
  const unlockedAchievements = Array.isArray(data.achievements)
    ? data.achievements.filter((value): value is string => typeof value === 'string')
    : []
  const unlockedBadges = Array.isArray(data.badges)
    ? data.badges.filter((value): value is string => typeof value === 'string')
    : []

  const pioneerUnlocked = routesContributed >= 10
  const heroUnlocked = routesContributed >= 50
  const contributorBadgeUnlocked = routesContributed >= 10

  const newlyUnlockedAchievements: string[] = []
  const newlyUnlockedBadges: string[] = []

  if (pioneerUnlocked && !unlockedAchievements.includes('route_pioneer')) {
    newlyUnlockedAchievements.push('route_pioneer')
  }
  if (heroUnlocked && !unlockedAchievements.includes('community_hero')) {
    newlyUnlockedAchievements.push('community_hero')
  }
  if (contributorBadgeUnlocked && !unlockedBadges.includes('contributor')) {
    newlyUnlockedBadges.push('contributor')
  }

  await setDoc(
    doc(db, 'users', uid, 'achievements', 'route_pioneer'),
    {
      id: 'route_pioneer',
      progress: routesContributed,
      isUnlocked: pioneerUnlocked,
      ...(newlyUnlockedAchievements.includes('route_pioneer')
        ? { unlockedAt: serverTimestamp() }
        : {}),
    },
    { merge: true },
  )

  await setDoc(
    doc(db, 'users', uid, 'achievements', 'community_hero'),
    {
      id: 'community_hero',
      progress: routesContributed,
      isUnlocked: heroUnlocked,
      ...(newlyUnlockedAchievements.includes('community_hero')
        ? { unlockedAt: serverTimestamp() }
        : {}),
    },
    { merge: true },
  )

  await setDoc(
    doc(db, 'users', uid, 'badges', 'contributor'),
    {
      id: 'contributor',
      isUnlocked: contributorBadgeUnlocked,
      ...(newlyUnlockedBadges.includes('contributor')
        ? { earnedAt: serverTimestamp() }
        : {}),
    },
    { merge: true },
  )

  const userUpdates: Record<string, unknown> = {}
  if (newlyUnlockedAchievements.length > 0) {
    userUpdates.achievements = arrayUnion(...newlyUnlockedAchievements)
  }
  if (newlyUnlockedBadges.length > 0) {
    userUpdates.badges = arrayUnion(...newlyUnlockedBadges)
  }

  if (Object.keys(userUpdates).length > 0) {
    await setDoc(userRef, userUpdates, { merge: true })
  }
}

function mapPostDoc(d: QueryDocumentSnapshot<DocumentData>): PostItem {
  const data = d.data()
  const status = data.moderationStatus ?? 'pending'
  const isFlagged = Boolean(data.isFlagged)
  const taggedRoute = data.taggedLocation?.type === 'route' ? data.taggedLocation : undefined
  return {
    id: d.id,
    userId: data.userId ?? '',
    userName: (data.userName ?? '').trim(),
    userEmail: (data.userEmail ?? '').trim(),
    category: data.category ?? 'general',
    content: data.content ?? '',
    images: data.images ?? data.imageUrls ?? [],
    routeId: toNonEmptyString(data.routeId) ?? toNonEmptyString(taggedRoute?.id) ?? undefined,
    routeLabel: toNonEmptyString(taggedRoute?.name) ?? undefined,
    moderationStatus: isFlagged && status === 'pending' ? 'flagged' : status,
    isFlagged,
    createdAt: normalizeTimestamp(data.createdAt ?? data.timestamp),
  }
}

function buildDashboardStatsFromData(
  users: AppUser[],
  routes: RouteItem[],
  posts: PostItem[],
  feedbackDocs: QueryDocumentSnapshot<DocumentData>[],
  appealDocs: QueryDocumentSnapshot<DocumentData>[] = [],
): DashboardStats {
  // Admins created from User Management still count as users.

  const userGrowthMap = new Map<number, number>()
  users.forEach((u) => {
    const key = toDayBucketKey(u.createdAt)
    if (key === null) return
    userGrowthMap.set(key, (userGrowthMap.get(key) ?? 0) + 1)
  })

  const routesWeeklyMap = new Map<number, number>()
  routes.forEach((r) => {
    const key = toWeekBucketKey(r.createdAt)
    if (key === null) return
    routesWeeklyMap.set(key, (routesWeeklyMap.get(key) ?? 0) + 1)
  })

  const userGrowth = Array.from(userGrowthMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket, count]) => ({ label: dayBucketLabel(bucket), count }))
    .slice(-8)

  const routesPerWeek = Array.from(routesWeeklyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([bucket, count]) => ({ label: dayBucketLabel(bucket), count }))
    .slice(-8)

  const recentUsers: DashboardActivity[] = users.slice(0, 4).map((u) => ({
    id: `u-${u.id}`,
    type: 'signup',
    description: `${u.name} signed up`,
    time: toRelativeTimeLabel(u.createdAt),
    timestampMs: toTimestampMs(u.createdAt),
    severity: 'info',
  }))

  const recentRoutes: DashboardActivity[] = routes.slice(0, 4).map((r) => ({
    id: `r-${r.id}`,
    type: 'route',
    description: `Route submitted: ${r.startLocation} to ${r.endLocation}`,
    time: toRelativeTimeLabel(r.createdAt),
    timestampMs: toTimestampMs(r.createdAt),
    severity: 'info',
  }))

  const recentPosts: DashboardActivity[] = posts.slice(0, 4).map((p) => ({
    id: `p-${p.id}`,
    type: 'post',
    description: `New post: ${p.content.slice(0, 72)}${p.content.length > 72 ? '...' : ''}`,
    time: toRelativeTimeLabel(p.createdAt),
    timestampMs: toTimestampMs(p.createdAt),
    severity: p.isFlagged ? 'warning' : 'info',
  }))

  const recentReports: DashboardActivity[] = feedbackDocs
    .filter((f) => String(f.data().type ?? 'feedback') === 'report')
    .slice(0, 4)
    .map((f) => {
      const ts = normalizeTimestamp(f.data().createdAt ?? f.data().timestamp)
      const reason = getFeedbackReason(f.data())
      return {
        id: `f-${f.id}`,
        type: 'report',
        description: `Reported content: ${reason}`,
        time: toRelativeTimeLabel(ts),
        timestampMs: toTimestampMs(ts),
        severity: 'warning' as const,
      }
    })

  // Appeals still waiting for a decision: a locked-out commuter is waiting.
  const recentAppeals: DashboardActivity[] = appealDocs
    .map(mapAppealDoc)
    .filter((a) => a.status === 'pending')
    .slice(0, 4)
    .map((a) => ({
      id: `a-${a.id}`,
      type: 'appeal',
      description: `${a.userName || a.userEmail || 'A commuter'} appealed their ${a.action === 'ban' ? 'ban' : 'restriction'}`,
      time: toRelativeTimeLabel(a.createdAt),
      timestampMs: toTimestampMs(a.createdAt),
      severity: 'warning' as const,
    }))

  const recentActivity = [...recentUsers, ...recentRoutes, ...recentPosts, ...recentReports, ...recentAppeals]
    .sort((a, b) => b.timestampMs - a.timestampMs)
    .slice(0, 12)

  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === 'active').length,
    bannedUsers: users.filter((u) => u.status === 'banned').length,
    restrictedUsers: users.filter((u) => u.status === 'restricted').length,
    routes: {
      approved: routes.filter((r) => r.status === 'approved').length,
      pending: routes.filter((r) => r.status === 'pending').length,
      rejected: routes.filter((r) => r.status === 'rejected').length,
    },
    posts: {
      approved: posts.filter((p) => p.moderationStatus === 'approved').length,
      pending: posts.filter((p) => p.moderationStatus === 'pending').length,
      flagged: posts.filter((p) => p.moderationStatus === 'flagged' || p.isFlagged).length,
    },
    userGrowth,
    routesPerWeek,
    recentActivity,
  }
}

export async function getCurrentUserRole(uid: string): Promise<UserRole | null> {
  const userSnap = await getDoc(doc(db, 'users', uid))
  if (!userSnap.exists()) return null
  const role = (userSnap.data().role ?? 'user') as UserRole
  return role
}

export async function getUsers(): Promise<AppUser[]> {
  const docs = await getDocsWithCreatedAtFallback(usersCol)
  const users = docs.map(mapUserDoc)
  // Only banned and restricted commuters have a reason worth loading, so this
  // stays a handful of reads, not one per user.
  await Promise.all(
    users
      .filter((u) => u.status === 'banned' || u.status === 'restricted')
      .map(async (u) => {
        u.lockout = await getLockoutRecord(u.id, u)
      }),
  )
  return users
}

export async function updateUserRole(userId: string, role: UserRole) {
  await updateDoc(doc(db, 'users', userId), { role, updatedAt: serverTimestamp() })
}

// Bans, restrictions and appeals

const appealsCol = collection(db, 'appeals')

function lockoutRef(userId: string) {
  return doc(db, 'users', userId, 'moderation', 'current')
}

/** Why a staff member is banning or restricting: shown to the commuter. */
export interface LockoutReasonInput {
  reasonCode: string
  note: string
  byUid?: string
}

function newLockoutRecord(action: 'ban' | 'restrict', input: LockoutReasonInput, until: Timestamp | null) {
  const reason = lockoutReasonByCode(input.reasonCode)
  if (!reason) throw new Error('Pick a reason first.')
  if (reasonNeedsNote(reason.code) && !input.note.trim()) {
    throw new Error('Say what the commuter did when the reason is "Other".')
  }
  return {
    action,
    reasonCode: reason.code,
    reasonLabel: reason.label,
    termsSection: reason.termsSection,
    note: input.note.trim(),
    by: input.byUid ?? null,
    via: 'dashboard',
    at: serverTimestamp(),
    until,
    // Changes with every ban or restriction, so each gets its own appeal.
    lockoutId: Date.now().toString(36),
  }
}

/**
 * The reason record, but only when it belongs to the lockout the commuter has
 * now. A record left from an older restriction must not explain a ban made
 * later without one.
 */
async function getLockoutRecord(userId: string, user: AppUser): Promise<LockoutRecordItem | undefined> {
  try {
    const snap = await getDoc(lockoutRef(userId))
    if (!snap.exists()) return undefined
    const data = snap.data()
    const record: LockoutRecordItem = {
      action: data.action === 'ban' ? 'ban' : 'restrict',
      reasonCode: data.reasonCode ?? 'other',
      reasonLabel: data.reasonLabel ?? '',
      termsSection: data.termsSection ?? '',
      note: data.note ?? '',
      lockoutId: data.lockoutId ?? '',
      at: normalizeTimestamp(data.at),
      until: normalizeTimestamp(data.until),
    }
    if (user.status === 'banned') return record.action === 'ban' ? record : undefined
    if (record.action === 'ban' || !record.until || !user.restrictedUntil) return undefined
    const gapMs = Math.abs(record.until.toMillis() - user.restrictedUntil.toMillis())
    return gapMs <= 5 * 60 * 1000 ? record : undefined
  } catch {
    return undefined
  }
}

/** Restricts a commuter and saves why, in one write so neither goes without the other. */
export async function restrictUser(userId: string, days: number, reason: LockoutReasonInput) {
  const boundedDays = Math.max(1, Math.min(MAX_RESTRICTION_DAYS, Math.floor(days)))
  const restrictedUntil = Timestamp.fromDate(
    new Date(Date.now() + boundedDays * 24 * 60 * 60 * 1000),
  )

  const batch = writeBatch(db)
  batch.update(doc(db, 'users', userId), {
    isBanned: false,
    status: 'restricted',
    restrictedAt: serverTimestamp(),
    restrictedUntil,
    updatedAt: serverTimestamp(),
  })
  batch.set(lockoutRef(userId), newLockoutRecord('restrict', reason, restrictedUntil))
  await batch.commit()
}

/** Bans a commuter for good and saves why. */
export async function banUser(userId: string, reason: LockoutReasonInput) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'users', userId), {
    isBanned: true,
    status: 'banned',
    restrictedAt: null,
    restrictedUntil: null,
    updatedAt: serverTimestamp(),
  })
  batch.set(lockoutRef(userId), newLockoutRecord('ban', reason, null))
  await batch.commit()
}

/** Lifts a ban or restriction. A waiting appeal is closed as lifted. */
export async function liftUserRestriction(userId: string, reviewerUid?: string) {
  await updateDoc(doc(db, 'users', userId), {
    isBanned: false,
    status: 'active',
    restrictedAt: null,
    restrictedUntil: null,
    updatedAt: serverTimestamp(),
  })
  await closePendingAppeals(userId, reviewerUid)
}

async function closePendingAppeals(userId: string, reviewerUid?: string) {
  try {
    const waiting = await getDocs(
      query(appealsCol, where('userId', '==', userId), where('status', '==', 'pending')),
    )
    for (const d of waiting.docs) {
      await updateDoc(d.ref, { status: 'lifted', reviewedBy: reviewerUid ?? null, reviewedAt: serverTimestamp() })
    }
  } catch (err) {
    console.warn('[appeals] closing waiting appeals failed', err)
  }
}

function mapAppealDoc(d: QueryDocumentSnapshot<DocumentData>): AppealItem {
  const data = d.data()
  const status: AppealStatus = data.status === 'lifted' || data.status === 'upheld' ? data.status : 'pending'
  return {
    id: d.id,
    userId: data.userId ?? '',
    userName: data.userName ?? '',
    userEmail: data.userEmail ?? '',
    action: data.action === 'ban' ? 'ban' : 'restrict',
    reasonLabel: data.reasonLabel ?? '',
    note: data.note ?? '',
    message: data.message ?? '',
    status,
    reply: data.reply ?? '',
    createdAt: normalizeTimestamp(data.createdAt),
    reviewedAt: normalizeTimestamp(data.reviewedAt),
  }
}

/** Every appeal: waiting ones first, then newest first. */
export async function getAppeals(): Promise<AppealItem[]> {
  const snap = await getDocs(appealsCol)
  return snap.docs.map(mapAppealDoc).sort((a, b) => {
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1
    return (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0)
  })
}

/**
 * Lifts the lockout or keeps it ("uphold"). Either way the commuter sees the
 * outcome, and the reply when it's kept, next time they open the app.
 */
export async function decideAppeal(appeal: AppealItem, lift: boolean, reply: string, reviewerUid?: string) {
  if (lift) await liftUserRestriction(appeal.userId, reviewerUid)
  await updateDoc(doc(db, 'appeals', appeal.id), {
    status: lift ? 'lifted' : 'upheld',
    reply: reply.trim(),
    reviewedBy: reviewerUid ?? null,
    reviewedAt: serverTimestamp(),
  })
}

/** Removes an appeal. Doesn't change the lockout itself. */
export async function deleteAppeal(appealId: string) {
  await deleteDoc(doc(db, 'appeals', appealId))
}

export async function deleteUser(userId: string) {
  const callable = httpsCallable<{ userId: string }, { ok?: boolean }>(
    functionsClient,
    'adminDeleteUserAccount',
  )

  try {
    await callable({ userId })
    return
  } catch {
    // Fallback keeps legacy behavior when functions are not yet deployed.
    await deleteDoc(doc(db, 'users', userId))
  }
}

/** Routes live in Supabase. Every status comes through the staff-only server action. */
async function fetchRouteRows(): Promise<RouteItem[]> {
  return mapRouteRows(await callRoutesApi<Record<string, unknown>[]>('staff_list'))
}

export async function getRoutes(): Promise<RouteItem[]> {
  const [routes, userDocs] = await Promise.all([
    fetchRouteRows(),
    getDocsWithCreatedAtFallback(usersCol),
  ])

  const contributorLookup = new Map<string, { name?: string; email?: string }>()
  userDocs.forEach((userDoc) => {
    const data = userDoc.data()
    const nameRaw = data.displayName ?? data.name ?? data.userName
    const emailRaw = data.email
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : ''
    const email = typeof emailRaw === 'string' ? emailRaw.trim() : ''
    contributorLookup.set(userDoc.id, {
      name: name || undefined,
      email: email || undefined,
    })
  })

  return routes.map((route) => {
    const lookup = route.contributorId ? contributorLookup.get(route.contributorId) : undefined
    return {
      ...route,
      contributorName: route.contributorName?.trim() || lookup?.name,
      contributorEmail: route.contributorEmail?.trim() || lookup?.email,
    }
  })
}

/**
 * Mirrors the app's Moderator flow (RouteService.approveRoute/rejectRoute +
 * NotificationsService.addNotification in lib/): same document shape, same
 * messages, and the same opt-out via users/{uid}.preferences.routeApprovalUpdates,
 * so the app's notification screen treats both sources identically.
 */
async function notifyRouteReviewed(
  routeId: string,
  contributorUid: string,
  status: 'approved' | 'rejected',
  message: string,
) {
  const userSnap = await getDoc(doc(db, 'users', contributorUid))
  const preferences = userSnap.data()?.preferences
  if (preferences && preferences.routeApprovalUpdates === false) return

  // Auto IDs: bulk review runs in parallel, so time-based IDs could collide.
  const notificationRef = doc(collection(db, 'notifications'))
  await setDoc(notificationRef, {
    id: notificationRef.id,
    userId: contributorUid,
    type: status === 'approved' ? 'route_approved' : 'route_rejected',
    postId: null,
    commentId: null,
    routeId,
    fromUserId: null,
    fromUserName: null,
    timestamp: serverTimestamp(),
    message,
    isRead: false,
  })
}

type RouteDecisionResult = {
  contributorId: string | null
  title: string
  mergedInto?: string
}

/**
 * Sends a decision. Returns null when someone already decided, or removed the
 * route. That's two people acting at once, so it isn't an error, and the
 * contributor shouldn't be told twice.
 */
async function decideRoute(body: object): Promise<RouteDecisionResult | null> {
  try {
    return await callRoutesApi<RouteDecisionResult>('decide', body)
  } catch (error) {
    if (error instanceof RoutesApiError && (error.code === 'conflict' || error.code === 'not_found')) return null
    throw error
  }
}

/** Approving over a flagged check needs a note saying why. The server refuses without one. */
export async function approveRoute(routeId: string, note?: string) {
  const result = await decideRoute({ routeId, decision: 'approve', ...(note ? { note } : {}) })
  if (!result?.contributorId) return

  await incrementApprovedContributionStats(result.contributorId)
  try {
    await notifyRouteReviewed(
      result.mergedInto ?? routeId,
      result.contributorId,
      'approved',
      result.mergedInto
        ? `Your correction to ${result.title} was approved and is now live.`
        : `Your submitted route (${result.title}) was approved and is now live.`,
    )
  } catch (error) {
    // The approval itself succeeded. A failed notification must not undo it.
    console.error(`Route ${routeId} approved but notification failed`, error)
  }
}

/** The route is kept, so the contributor can read why and send it again. */
export async function rejectRoute(routeId: string, reasonCodes: string[], note?: string) {
  const result = await decideRoute({ routeId, decision: 'reject', reasonCodes, ...(note ? { note } : {}) })
  if (!result?.contributorId) return

  const reasons = reasonCodes.map(rejectionReasonLabel).join(', ')
  try {
    await notifyRouteReviewed(
      routeId,
      result.contributorId,
      'rejected',
      `Your route (${result.title}) was rejected: ${reasons}.${note ? ` Note: ${note}` : ''}`,
    )
  } catch (error) {
    // The rejection itself succeeded. A failed notification must not undo it.
    console.error(`Route ${routeId} rejected but notification failed`, error)
  }
}

/** A person vouching for a live route, or taking that back. It stays live. */
export async function setRouteVerified(routeId: string, verified: boolean) {
  await decideRoute({ routeId, decision: verified ? 'verify' : 'unverify' })
}

export async function deleteRoute(routeId: string) {
  await callRoutesApi('delete', { routeId })
}

export async function getFareRules(): Promise<FareRuleItem[]> {
  return callRoutesApi<FareRuleItem[]>('admin_fare_rules')
}

export async function addFareRule(rule: Omit<FareRuleItem, 'id' | 'effective_from'> & { effective_from?: string }) {
  await callRoutesApi('admin_set_fare_rule', rule)
}

export async function getPosts(): Promise<PostItem[]> {
  const docs = await getDocsWithCreatedAtFallback(postsCol)
  return docs.map(mapPostDoc)
}

export async function updatePostStatus(postId: string, status: 'approved' | 'rejected' | 'flagged', moderatorUid: string) {
  const nextStatus = status === 'flagged' ? 'pending' : status
  await updateDoc(doc(db, 'posts', postId), {
    moderationStatus: nextStatus,
    isFlagged: status === 'flagged',
    moderatedBy: moderatorUid,
    moderatedAt: serverTimestamp(),
    // An approved post gets its standard 3 days in the feed from now (the
    // app's PostLifetime.standard), so time spent under review doesn't count.
    ...(status === 'approved'
      ? { expiresAt: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000) }
      : {}),
  })
}

export async function deletePost(postId: string) {
  await deleteDoc(doc(db, 'posts', postId))
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  const docs = await getDocsWithCreatedAtFallback(feedbackCol)
  return docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      type: data.type ?? 'feedback',
      status: data.status ?? 'pending',
      message: data.message ?? data.content ?? '',
      reason: getFeedbackReason(data),
      postId: data.postId ?? data.targetPostId ?? data.targetId,
      createdAt: normalizeTimestamp(data.createdAt ?? data.timestamp),
      userId: data.userId,
    }
  })
}

/** Route reports still showing (under a day old, or kept), newest first. */
export async function getRouteReports(): Promise<RouteReportItem[]> {
  const snap = await getDocs(
    query(collection(db, 'route_reports'), where('expiresAt', '>', Timestamp.now())),
  )
  return snap.docs
    .map((d) => {
      const data = d.data()
      return {
        id: d.id,
        routeId: data.routeId ?? '',
        routeLabel: data.routeLabel ?? '',
        type: data.type ?? 'Other',
        description: data.description,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        kept: data.kept === true,
      }
    })
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
}

/** Keeps a route report showing until it's removed. */
export async function keepRouteReport(id: string) {
  await updateDoc(doc(db, 'route_reports', id), {
    kept: true,
    expiresAt: Timestamp.fromDate(new Date(2100, 0, 1)),
  })
}

export async function removeRouteReport(id: string) {
  await deleteDoc(doc(db, 'route_reports', id))
}

export async function updateFeedbackStatus(feedbackId: string, status: 'resolved' | 'dismissed') {
  await updateDoc(doc(db, 'feedbacks', feedbackId), { status, updatedAt: serverTimestamp() })
}

export async function deleteFeedback(feedbackId: string) {
  await deleteDoc(doc(db, 'feedbacks', feedbackId))
}

export async function getAnnouncements(): Promise<AnnouncementItem[]> {
  const docs = await getDocsWithCreatedAtFallback(announcementsCol)
  const now = Date.now()
  return docs
    .map((d) => {
      const data = d.data() as Omit<AnnouncementItem, 'id'> & Record<string, unknown>
      return {
        id: d.id,
        ...data,
        createdAt: normalizeTimestamp(data.createdAt),
        scheduledAt: normalizeTimestamp(data.scheduledAt),
        expiresAt: normalizeTimestamp(data.expiresAt),
      }
    })
    .filter((a) => !a.expiresAt || a.expiresAt.toDate().getTime() > now)
}

export async function createAnnouncement(payload: Omit<AnnouncementItem, 'id' | 'createdAt'>) {
  await addDoc(announcementsCol, {
    ...payload,
    createdAt: serverTimestamp(),
  })
}

export async function updateAnnouncement(id: string, payload: Partial<AnnouncementItem>) {
  await updateDoc(doc(db, 'announcements', id), payload)
}

export async function deleteAnnouncement(id: string) {
  await deleteDoc(doc(db, 'announcements', id))
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [users, routes, posts] = await Promise.all([getUsers(), getRoutes(), getPosts()])
  const feedbackDocs = await getDocsWithCreatedAtFallback(feedbackCol)
  // Appeals are extra: if they can't load (rules not deployed yet), the
  // rest of the dashboard still shows.
  const appealDocs = await getDocs(appealsCol).then((s) => s.docs).catch(() => [])
  return buildDashboardStatsFromData(users, routes, posts, feedbackDocs, appealDocs)
}

export function subscribeDashboardStats(
  onData: (stats: DashboardStats) => void,
  onError?: (error: Error) => void,
) {
  let users: AppUser[] = []
  let routes: RouteItem[] = []
  let posts: PostItem[] = []
  let feedbackDocs: QueryDocumentSnapshot<DocumentData>[] = []
  let appealDocs: QueryDocumentSnapshot<DocumentData>[] = []

  let usersReady = false
  let routesReady = false
  let postsReady = false
  let feedbackReady = false

  // Appeals don't hold the dashboard back: they join the feed when they load.
  const emitIfReady = () => {
    if (!usersReady || !routesReady || !postsReady || !feedbackReady) return
    onData(buildDashboardStatsFromData(users, routes, posts, feedbackDocs, appealDocs))
  }

  const unsubAppeals = onSnapshot(
    appealsCol,
    (snap) => {
      appealDocs = snap.docs
      emitIfReady()
    },
    (err) => console.warn('[dashboard] appeals stream failed', err),
  )

  const handleError = (err: unknown) => {
    onError?.(err instanceof Error ? err : new Error('Failed to stream dashboard data'))
  }

  const unsubUsers = subscribeWithTimestampFallback(
    usersCol,
    (docs) => {
      usersReady = true
      users = sortDocsByCreatedAtDesc([...docs]).map(mapUserDoc)
      emitIfReady()
    },
    handleError,
  )

  // Routes moved to Supabase, which we don't listen to live, so these refresh
  // on a timer. Only the first load's failure is reported. A later one keeps
  // the numbers on screen until the next try works.
  let stopped = false
  const loadRoutes = async () => {
    try {
      const loaded = await fetchRouteRows()
      if (stopped) return
      routes = loaded
      routesReady = true
      emitIfReady()
    } catch (err) {
      if (routesReady) console.warn('[dashboard] routes refresh failed', err)
      else handleError(err)
    }
  }
  void loadRoutes()
  const routesTimer = setInterval(() => void loadRoutes(), ROUTES_REFRESH_MS)

  const unsubPosts = subscribeWithTimestampFallback(
    postsCol,
    (docs) => {
      postsReady = true
      posts = sortDocsByCreatedAtDesc([...docs]).map(mapPostDoc)
      emitIfReady()
    },
    handleError,
  )

  const unsubFeedback = subscribeWithTimestampFallback(
    feedbackCol,
    (docs) => {
      feedbackReady = true
      feedbackDocs = sortDocsByCreatedAtDesc([...docs])
      emitIfReady()
    },
    handleError,
  )

  return () => {
    unsubAppeals()
    unsubUsers()
    stopped = true
    clearInterval(routesTimer)
    unsubPosts()
    unsubFeedback()
  }
}

export async function getModeratorStats() {
  const users = await getUsers()
  const moderators = users.filter((u) => u.role === 'moderator')

  // Approvals before the move to Supabase are only in Firestore, and newer ones
  // are only on the server, so a moderator's count needs both.
  const [routeApprovedSnap, auditLogDocs, serverApprovals] = await Promise.all([
    getDocs(query(routesCol, where('approvalStatus', '==', 'approved'))),
    // Without the auditLogs collection-group rule deployed this read is
    // denied. Fall back to dashboard approvals only rather than fail the page.
    getDocs(collectionGroup(db, 'auditLogs')).then((s) => s.docs).catch((error) => {
      console.error('Could not read route audit logs', error)
      return [] as QueryDocumentSnapshot<DocumentData>[]
    }),
    callRoutesApi<Record<string, string[]>>('moderator_approvals').catch((error) => {
      console.error('Could not read server approvals', error)
      return {} as Record<string, string[]>
    }),
  ])

  // Approvals per moderator, as sets of routes so one approval logged twice
  // counts once. The dashboard stamps reviewedBy on the route. The app leaves
  // it out and logs moderator_approved / correction_merged instead (a merged
  // correction's own doc is deleted, so the log is all that's left of it).
  const approvedRoutesByModerator = new Map<string, Set<string>>()
  const addApproval = (moderator: unknown, routeKey: string) => {
    if (typeof moderator !== 'string' || !moderator) return
    const routesForModerator = approvedRoutesByModerator.get(moderator) ?? new Set<string>()
    routesForModerator.add(routeKey)
    approvedRoutesByModerator.set(moderator, routesForModerator)
  }
  routeApprovedSnap.forEach((d) => addApproval(d.data().reviewedBy, d.id))
  auditLogDocs.forEach((d) => {
    const log = d.data()
    if (log.action === 'moderator_approved') {
      addApproval(log.actorId, String(log.routeId ?? d.ref.parent.parent?.id ?? d.id))
    } else if (log.action === 'correction_merged') {
      addApproval(log.actorId, String(log.meta?.correctionId ?? d.id))
    }
  })
  Object.entries(serverApprovals).forEach(([moderator, routeKeys]) => {
    routeKeys.forEach((routeKey) => addApproval(moderator, routeKey))
  })

  return moderators.map((m) => ({
    ...m,
    routesApproved: approvedRoutesByModerator.get(m.id)?.size ?? 0,
  }))
}
