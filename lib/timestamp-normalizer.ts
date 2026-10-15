/**
 * Authoritative Timestamp Normalization & Report Date Evaluation (F13, F14, F15)
 *
 * Provides deterministic, timezone-independent timestamp parsing and period filtering:
 * 1. Handles Unix milliseconds, seconds, ISO-8601 strings, Firestore Timestamps, and Date objects.
 * 2. Strictly distinguishes missing/invalid timestamps from genuine historical timestamps.
 * 3. Evaluates Philippine reporting periods in Asia/Manila (UTC+8, no DST) regardless of host timezone.
 * 4. Defines the authoritative issuance timestamp for document requests (never treats creation or generic updates as issuance).
 */

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // Asia/Manila is fixed UTC+8 (no DST)

/**
 * Normalizes supported date/timestamp representations into Unix epoch milliseconds.
 * Returns null for missing, malformed, or unparseable inputs.
 */
export function normalizeTimestamp(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null

  // 1. Numeric timestamps
  if (typeof value === "number") {
    if (!Number.isFinite(value) || isNaN(value) || value <= 0) return null
    // Heuristic: seconds vs milliseconds.
    // 1e8 is 1973 in seconds. 1e11 is 1973 in milliseconds.
    // A value between 1e8 and 1e11 represents seconds from epoch (e.g. 1768478400).
    if (value > 1e8 && value < 1e11) {
      return Math.round(value * 1000)
    }
    return Math.round(value)
  }

  // 2. Firestore Timestamp, Date, or object-wrapped timestamps
  if (typeof value === "object") {
    const obj = value as any

    if (value instanceof Date) {
      const time = value.getTime()
      return isNaN(time) ? null : time
    }

    if (typeof obj.toMillis === "function") {
      try {
        const ms = obj.toMillis()
        if (typeof ms === "number" && Number.isFinite(ms)) return Math.round(ms)
      } catch {
        // Fall through to property checks
      }
    }

    if (typeof obj.toDate === "function") {
      try {
        const d = obj.toDate()
        if (d instanceof Date && !isNaN(d.getTime())) return d.getTime()
      } catch {
        // Fall through
      }
    }

    if (typeof obj.seconds === "number" && Number.isFinite(obj.seconds)) {
      const ns = typeof obj.nanoseconds === "number" && Number.isFinite(obj.nanoseconds) ? obj.nanoseconds : 0
      return Math.round(obj.seconds * 1000 + ns / 1e6)
    }

    if (typeof obj._seconds === "number" && Number.isFinite(obj._seconds)) {
      const ns = typeof obj._nanoseconds === "number" && Number.isFinite(obj._nanoseconds) ? obj._nanoseconds : 0
      return Math.round(obj._seconds * 1000 + ns / 1e6)
    }
  }

  // 3. String date representations (ISO-8601, numeric strings, etc.)
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null

    // Pure numeric string
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed)
      if (Number.isFinite(num)) {
        if (num > 1e8 && num < 1e11) {
          return Math.round(num * 1000)
        }
        return Math.round(num)
      }
    }

    const parsed = Date.parse(trimmed)
    if (!isNaN(parsed)) {
      return parsed
    }
  }

  return null
}

/**
 * Returns the calendar year, month (0-indexed), and day in Asia/Manila (UTC+8).
 */
export function getManilaCalendarDate(timestampMs: number): {
  year: number
  month: number
  day: number
} {
  const manilaDate = new Date(timestampMs + MANILA_OFFSET_MS)
  return {
    year: manilaDate.getUTCFullYear(),
    month: manilaDate.getUTCMonth(),
    day: manilaDate.getUTCDate(),
  }
}

/**
 * Evaluates whether a date or record belongs to the selected reporting period.
 *
 * Rules:
 * - "All Time" (selectedYear === "All" && selectedMonth === "All"): returns true for all records.
 * - Specific Year: returns true only for records with a valid date belonging to that calendar year in Asia/Manila.
 * - Specific Month & Year: returns true only for matching records.
 * - Unknown / missing dates: strictly return false when any period filter is active.
 */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
]

export function isRecordInPeriod(
  dateValue: unknown,
  selectedYear: string = "All",
  selectedMonth: string = "All"
): boolean {
  const isAllYear = !selectedYear || selectedYear === "All" || selectedYear === "All Time"
  const isAllMonth = !selectedMonth || selectedMonth === "All" || selectedMonth === "All Months"

  if (isAllYear && isAllMonth) {
    return true
  }

  const ts = normalizeTimestamp(dateValue)
  if (ts === null) {
    return false
  }

  const { year, month } = getManilaCalendarDate(ts)

  if (!isAllYear) {
    const targetYear = parseInt(selectedYear, 10)
    if (isNaN(targetYear) || year !== targetYear) {
      return false
    }
  }

  if (!isAllMonth) {
    let targetMonth = -1
    const trimmedMonth = selectedMonth.trim().toLowerCase()
    const parsedNum = parseInt(trimmedMonth, 10)
    if (!isNaN(parsedNum) && parsedNum >= 0 && parsedNum <= 11) {
      targetMonth = parsedNum
    } else {
      targetMonth = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(trimmedMonth))
    }

    if (targetMonth === -1 || month !== targetMonth) {
      return false
    }
  }

  return true
}

/**
 * Authoritative document issuance timestamp resolver (F13).
 *
 * Prefers recorded generation/issuance timestamps (`issuedAt`, `generatedAt`),
 * and lifecycle timestamps representing issuance/readiness for collection
 * (`statusTimestamps['Ready for Pick Up']`, `statusTimestamps['Completed']`).
 *
 * NEVER falls back to `createdAt` (request submission) or generic `updatedAt`.
 * Returns null when no authoritative issuance evidence is present.
 */
export function getAuthoritativeIssuanceTimestamp(request: any): number | null {
  if (!request || typeof request !== "object") return null

  if (request.issuedAt !== undefined && request.issuedAt !== null) {
    const ts = normalizeTimestamp(request.issuedAt)
    if (ts !== null) return ts
  }

  if (request.generatedAt !== undefined && request.generatedAt !== null) {
    const ts = normalizeTimestamp(request.generatedAt)
    if (ts !== null) return ts
  }

  const statusTimestamps = request.statusTimestamps
  if (statusTimestamps && typeof statusTimestamps === "object") {
    if (statusTimestamps["Ready for Pick Up"] !== undefined && statusTimestamps["Ready for Pick Up"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["Ready for Pick Up"])
      if (ts !== null) return ts
    }
    if (statusTimestamps["Completed"] !== undefined && statusTimestamps["Completed"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["Completed"])
      if (ts !== null) return ts
    }
  }

  return null
}

/**
 * Authoritative document generation timestamp resolver (F18).
 *
 * Resolves the authoritative timestamp when the document was generated.
 * In TALASYS, admin document generation atomically commits `generatedAt`
 * via `request.markGenerated`.
 *
 * Never substitutes `createdAt` (request submission) or generic `updatedAt`.
 * Returns null if no authoritative generation timestamp is present, preserving
 * historical records without inventing artificial generation dates.
 */
export function getAuthoritativeGenerationTimestamp(request: any): number | null {
  if (!request || typeof request !== "object") return null

  // 1. Authoritative generation timestamp written by request.markGenerated
  if (request.generatedAt !== undefined && request.generatedAt !== null) {
    const ts = normalizeTimestamp(request.generatedAt)
    if (ts !== null) return ts
  }

  // 2. Authoritative lifecycle status timestamp if explicitly recorded for generation
  const statusTimestamps = request.statusTimestamps
  if (statusTimestamps && typeof statusTimestamps === "object") {
    if (statusTimestamps["Generated"] !== undefined && statusTimestamps["Generated"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["Generated"])
      if (ts !== null) return ts
    }
    if (statusTimestamps["generated"] !== undefined && statusTimestamps["generated"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["generated"])
      if (ts !== null) return ts
    }
  }

  return null
}

/**
 * Authoritative request rejection timestamp resolver (F18).
 *
 * Resolves the authoritative timestamp when a request was rejected.
 * Recorded in `request.statusTimestamps['Rejected']` or `request.rejectedAt`.
 *
 * Never falls back to `createdAt` or unrelated update timestamps.
 * Returns null if no authoritative rejection timestamp is present.
 */
export function getAuthoritativeRejectionTimestamp(request: any): number | null {
  if (!request || typeof request !== "object") return null

  if (request.rejectedAt !== undefined && request.rejectedAt !== null) {
    const ts = normalizeTimestamp(request.rejectedAt)
    if (ts !== null) return ts
  }

  const statusTimestamps = request.statusTimestamps
  if (statusTimestamps && typeof statusTimestamps === "object") {
    if (statusTimestamps["Rejected"] !== undefined && statusTimestamps["Rejected"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["Rejected"])
      if (ts !== null) return ts
    }
    if (statusTimestamps["rejected"] !== undefined && statusTimestamps["rejected"] !== null) {
      const ts = normalizeTimestamp(statusTimestamps["rejected"])
      if (ts !== null) return ts
    }
  }

  return null
}

export interface FullAnalyticsParams {
  documentRequests: any[]
  residents: any[]
  adminStats: {
    totalResidents: number
    voterCount: number
    seniorCount: number
    adultCount: number
    minorCount: number
    pendingVerifications: number
    [key: string]: any
  }
  selectedYear?: string
  selectedMonth?: string
}

export interface FullAnalyticsResult {
  headers: string[]
  rows: [string, string][]
  metrics: {
    totalResidents: number
    registeredVoters: number
    nonVoters: number
    seniorCitizens: number
    adults: number
    minors: number
    totalRequestsSubmitted: number
    documentsGenerated: number
    rejectedRequests: number
    pendingVerifications: number
    historicalGeneratedUnknownDate: number
  }
}

/**
 * Authoritative Full Analytics metrics calculator (F18).
 *
 * Precisely partitions metrics by lifecycle events:
 * - Total Requests Submitted: aggregated strictly by `createdAt` (request submission).
 * - Documents Generated: aggregated strictly by `generatedAt` (actual document generation).
 * - Rejected Requests: aggregated strictly by authoritative rejection event timestamp.
 * - Historical records with unknown generation dates are preserved and included in All Time,
 *   never assigned to fabricated calendar periods.
 * - Guarantees identical row calculations across Excel, CSV, and PDF exports.
 */
export function calculateFullAnalyticsMetrics({
  documentRequests,
  residents,
  adminStats,
  selectedYear = "All",
  selectedMonth = "All",
}: FullAnalyticsParams): FullAnalyticsResult {
  const isAllTime = (!selectedYear || selectedYear === "All" || selectedYear === "All Time") &&
                    (!selectedMonth || selectedMonth === "All" || selectedMonth === "All Months")

  const filteredResidentsForPeriod = isAllTime
    ? residents
    : residents.filter(r => isRecordInPeriod((r as any).createdAt, selectedYear, selectedMonth))

  const totalResidents = isAllTime
    ? adminStats.totalResidents
    : filteredResidentsForPeriod.length

  const registeredVoters = isAllTime
    ? adminStats.voterCount
    : filteredResidentsForPeriod.filter(r => r.isVoter).length

  const nonVoters = isAllTime
    ? Math.max(0, adminStats.totalResidents - adminStats.voterCount)
    : filteredResidentsForPeriod.filter(r => !r.isVoter).length

  const seniorCitizens = isAllTime
    ? adminStats.seniorCount
    : filteredResidentsForPeriod.filter(r => (r.age || 0) >= 60).length

  const adults = isAllTime
    ? adminStats.adultCount
    : filteredResidentsForPeriod.filter(r => (r.age || 0) >= 18 && (r.age || 0) < 60).length

  const minors = isAllTime
    ? adminStats.minorCount
    : filteredResidentsForPeriod.filter(r => (r.age || 0) < 18).length

  // F18: Total Requests Submitted is strictly based on submission/creation timestamp (createdAt)
  const totalRequestsSubmitted = isAllTime
    ? documentRequests.length
    : documentRequests.filter(r => isRecordInPeriod(r.createdAt, selectedYear, selectedMonth)).length

  // F18: Documents Generated is strictly based on authoritative generation timestamp (generatedAt)
  // Historical generated records without timestamps are never given invented dates and are strictly counted only in All Time.
  const documentsGenerated = isAllTime
    ? documentRequests.filter(r => (r as any).hasGenerated === true).length
    : documentRequests.filter(r => {
        if ((r as any).hasGenerated !== true) return false
        const genTs = getAuthoritativeGenerationTimestamp(r)
        if (genTs === null) return false
        return isRecordInPeriod(genTs, selectedYear, selectedMonth)
      }).length

  // Historical generated records lacking authoritative generation timestamp
  const historicalGeneratedUnknownDate = isAllTime
    ? documentRequests.filter(r => (r as any).hasGenerated === true && getAuthoritativeGenerationTimestamp(r) === null).length
    : 0

  // F18: Rejected Requests in period based on authoritative rejection event timestamp
  const rejectedRequests = isAllTime
    ? documentRequests.filter(r => r.status === "Rejected").length
    : documentRequests.filter(r => {
        if (r.status !== "Rejected") return false
        const rejTs = getAuthoritativeRejectionTimestamp(r)
        if (rejTs === null) return false
        return isRecordInPeriod(rejTs, selectedYear, selectedMonth)
      }).length

  const pendingVerifications = adminStats.pendingVerifications

  const headers = ["Metric", "Value"]
  const rows: [string, string][] = [
    ['Total Residents Registered', totalResidents.toString()],
    ['Registered Voters', registeredVoters.toString()],
    ['Non-Voters', nonVoters.toString()],
    ['Senior Citizens', seniorCitizens.toString()],
    ['Adults', adults.toString()],
    ['Minors', minors.toString()],
    ['Total Requests Submitted', totalRequestsSubmitted.toString()],
    ['Documents Generated', documentsGenerated.toString()],
    ['Rejected Requests', rejectedRequests.toString()],
    ['Pending Verifications (Current)', pendingVerifications.toString()],
  ]

  if (isAllTime && historicalGeneratedUnknownDate > 0) {
    rows.push(['Historical Generated Documents (Unknown Date)', historicalGeneratedUnknownDate.toString()])
  }

  return {
    headers,
    rows,
    metrics: {
      totalResidents,
      registeredVoters,
      nonVoters,
      seniorCitizens,
      adults,
      minors,
      totalRequestsSubmitted,
      documentsGenerated,
      rejectedRequests,
      pendingVerifications,
      historicalGeneratedUnknownDate,
    },
  }
}
