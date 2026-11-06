/**
 * Reasons staff can pick when banning or restricting a commuter. Each points at
 * the part of the Terms the commuter broke, so the commuter sees the rule and not
 * just a label. Keep in step with the app's `lib/models/lockout.dart`.
 */
export interface LockoutReason {
  code: string
  label: string
  /** Where it sits in the Terms, shown to the commuter. Empty for "Other". */
  termsSection: string
}

const MUST_NOT_DO = 'Terms, section 6: Things You Must Not Do'

export const LOCKOUT_REASONS: LockoutReason[] = [
  { code: 'spam', label: 'Spam', termsSection: MUST_NOT_DO },
  { code: 'harassment', label: 'Harassment or bullying', termsSection: MUST_NOT_DO },
  { code: 'hate', label: 'Hateful or abusive content', termsSection: MUST_NOT_DO },
  { code: 'sexual', label: 'Sexual or explicit content', termsSection: MUST_NOT_DO },
  { code: 'fake', label: 'Fake routes, false reports or vote manipulation', termsSection: MUST_NOT_DO },
  { code: 'misleading', label: 'Misleading information', termsSection: MUST_NOT_DO },
  { code: 'not_theirs', label: "Sharing someone else's content without permission", termsSection: MUST_NOT_DO },
  { code: 'security', label: 'Trying to break into accounts or disrupt the app', termsSection: MUST_NOT_DO },
  { code: 'other', label: 'Other', termsSection: '' },
]

export function lockoutReasonByCode(code: string): LockoutReason | undefined {
  return LOCKOUT_REASONS.find((r) => r.code === code)
}

/** "Other" means nothing on its own, so staff must say what it was. */
export function reasonNeedsNote(code: string) {
  return code === 'other'
}
