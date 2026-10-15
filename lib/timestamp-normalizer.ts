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
