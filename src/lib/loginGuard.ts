/**
 * Browser-side login throttle: 5 failed attempts lock sign-in for an hour.
 * It is stored in localStorage, so it slows down people using the login page
 * but cannot stop a script that talks to Firebase directly.
 */
const STORAGE_KEY = 'tph-login-guard'
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MS = 60 * 60 * 1000

interface GuardState {
  failures: number[]
  lockedUntil: number
}

function read(): GuardState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '')
    return {
      failures: Array.isArray(parsed.failures) ? parsed.failures.filter((t: unknown) => typeof t === 'number') : [],
      lockedUntil: typeof parsed.lockedUntil === 'number' ? parsed.lockedUntil : 0,
    }
  } catch {
    return { failures: [], lockedUntil: 0 }
  }
}

function write(state: GuardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage blocked: the throttle simply doesn't persist.
  }
}

/** Milliseconds until sign-in is allowed again; 0 when it is allowed now. */
export function getLockoutRemainingMs() {
  const { lockedUntil } = read()
  return Math.max(0, lockedUntil - Date.now())
}

/** Records a failed attempt and returns how many attempts are left (0 = now locked). */
export function recordFailedAttempt() {
  const now = Date.now()
  const state = read()
  const failures = [...state.failures.filter((t) => now - t < LOCKOUT_MS), now]
  if (failures.length >= MAX_FAILED_ATTEMPTS) {
    write({ failures: [], lockedUntil: now + LOCKOUT_MS })
    return 0
  }
  write({ failures, lockedUntil: 0 })
  return MAX_FAILED_ATTEMPTS - failures.length
}

export function clearFailedAttempts() {
  write({ failures: [], lockedUntil: 0 })
}

export function formatLockout(ms: number) {
  const minutes = Math.ceil(ms / 60000)
  return minutes >= 60 ? '1 hour' : `${minutes} minute${minutes === 1 ? '' : 's'}`
}
