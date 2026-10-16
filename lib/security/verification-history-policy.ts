import { normalizeTimestamp, getManilaCalendarDate } from "../timestamp-normalizer.ts"
import { extractValidYear } from "./audit-utils.ts"

export const VERIFICATION_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const

export type VerificationMonth = typeof VERIFICATION_MONTHS[number]

export interface VerificationRecordLike {
  id?: string
  status?: string
  type?: string
  rejectionReason?: string
  denialReason?: string
  reason?: string
  rejectedAt?: unknown
  deniedAt?: unknown
  approvedAt?: unknown
  reviewedAt?: unknown
  updatedAt?: unknown
  createdAt?: unknown
  submittedDate?: string
}

export interface ActivityLogLike {
  action?: string
  actionType?: string
  targetCollection?: string
  timestamp?: unknown
  date?: string
}

export interface ReasonGroupItem {
  reason: string
  count: number
  total: number
}

export interface ReasonGroup {
  id: string
  title: string
  color: string
  bg: string
  data: ReasonGroupItem[]
}

/**
 * Resolves the authoritative decision timestamp for a verification record.
 * 
 * Rules:
 * - Denied: inspects `deniedAt`, then `updatedAt`.
 * - Rejected: inspects `rejectedAt`, `reviewedAt`, then `updatedAt`.
 * - Approved: inspects `approvedAt`, `reviewedAt`, then `updatedAt`.
 * - NEVER falls back to `createdAt` or `submittedDate` (which represent applicant submission, not decision).
 * - Returns null when no authoritative decision timestamp is present.
 */
export function getAuthoritativeVerificationDecisionTimestamp(
  verification: VerificationRecordLike | null | undefined
): number | null {
  if (!verification || typeof verification !== "object") return null

  const status = verification.status

  if (status === "denied") {
    return normalizeTimestamp(verification.deniedAt)
  }

  if (status === "rejected") {
    return normalizeTimestamp(verification.rejectedAt ?? verification.reviewedAt)
  }

  if (status === "approved") {
    return normalizeTimestamp(verification.approvedAt ?? verification.reviewedAt)
  }

  return null
}

/**
 * Evaluates whether a verification decision occurred in the target calendar year in Asia/Manila (UTC+8).
 * Historical records with unknown/missing decision dates are strictly excluded (returns false).
 */
export function isVerificationInDecisionYear(
  verification: VerificationRecordLike | null | undefined,
  targetYear: string | number
): boolean {
  const normalizedYear = String(targetYear ?? "").trim()
  if (!normalizedYear || normalizedYear === "All" || normalizedYear === "All Time") {
    return true
  }

  const ts = getAuthoritativeVerificationDecisionTimestamp(verification)
  if (ts === null) return false

  const { year } = getManilaCalendarDate(ts)
  return String(year) === normalizedYear
}

/**
 * Returns the 3-letter month (e.g. "Jan") in Asia/Manila (UTC+8) for an event timestamp.
 * Returns null if timestamp is missing or unparseable.
 */
export function getManilaEventMonth(timestamp: unknown): VerificationMonth | null {
  const ts = normalizeTimestamp(timestamp)
  if (ts === null) return null
  const { month } = getManilaCalendarDate(ts)
  return VERIFICATION_MONTHS[month] || null
}

/**
 * Returns available calendar years for the history filter from activity logs and verification records.
 * Defaults to current year if no data is found.
 */
export function getAvailableVerificationYears(
  activityLogs: ActivityLogLike[] = [],
  rejectedVerifications: VerificationRecordLike[] = [],
  deniedVerifications: VerificationRecordLike[] = []
): string[] {
  const years = new Set<string>()

  activityLogs.forEach(log => {
    if (log.actionType === "approved" || log.actionType === "rejected" || log.actionType === "denied") {
      const y = extractValidYear(log.timestamp || log.date)
      if (y) years.add(y)
    }
  })

  rejectedVerifications.forEach(v => {
    const ts = getAuthoritativeVerificationDecisionTimestamp(v)
    if (ts !== null) {
      const { year } = getManilaCalendarDate(ts)
      years.add(String(year))
    }
  })

  deniedVerifications.forEach(v => {
    const ts = getAuthoritativeVerificationDecisionTimestamp(v)
    if (ts !== null) {
      const { year } = getManilaCalendarDate(ts)
      years.add(String(year))
    }
  })

  if (years.size === 0) {
    years.add(new Date().getFullYear().toString())
  }

  return Array.from(years).sort((a, b) => Number(b) - Number(a))
}

/**
 * Extracts and ranks top rejection and denial reasons for the selected decision year.
 * 
 * Enforces:
 * 1. Reasons are attributed strictly by the decision year, not registration submission date.
 * 2. Unreviewed or undated records are excluded from specific year filters.
 * 3. Separate categories for registrations (rejections), registrations (permanent denials),
 *    profile edits, and reactivations.
 */
export function getTopReasonsByDecisionYear(
  rejectedVerifications: VerificationRecordLike[] = [],
  deniedVerifications: VerificationRecordLike[] = [],
  targetYear: string | number
): ReasonGroup[] {
  const breakdown: Record<string, string[]> = {
    "registration": [],
    "denied-registration": [],
    "profile-edit": [],
    "reactivation": [],
  }

  rejectedVerifications.forEach(v => {
    if (v.rejectionReason && isVerificationInDecisionYear(v, targetYear)) {
      if (v.type === "registration") breakdown["registration"].push(v.rejectionReason)
      if (v.type === "profile-edit") breakdown["profile-edit"].push(v.rejectionReason)
      if (v.type === "reactivation") breakdown["reactivation"].push(v.rejectionReason)
    }
  })

  deniedVerifications.forEach(v => {
    const reason = v.denialReason || v.reason
    if (reason && isVerificationInDecisionYear(v, targetYear)) {
      breakdown["denied-registration"].push(reason)
    }
  })

  const getTop = (reasons: string[]): ReasonGroupItem[] => {
    const counts = reasons.reduce((acc, r) => {
      const key = r.trim()
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count, total: reasons.length }))
  }

  return [
    { id: "registration", title: "Registrations (Rejections)", color: "text-amber-700", bg: "bg-amber-50", data: getTop(breakdown["registration"]) },
    { id: "denied-registration", title: "Registrations (Permanent Denials)", color: "text-rose-800", bg: "bg-rose-50", data: getTop(breakdown["denied-registration"]) },
    { id: "profile-edit", title: "Profile Edits", color: "text-green-600", bg: "bg-green-50", data: getTop(breakdown["profile-edit"]) },
    { id: "reactivation", title: "Reactivation", color: "text-purple-600", bg: "bg-purple-50", data: getTop(breakdown["reactivation"]) },
  ]
}
