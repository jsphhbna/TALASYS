/**
 * Normalizes any timestamp representation (numeric epoch, string epoch, ISO string, Firestore Timestamp)
 * into a canonical numeric epoch in milliseconds (#15).
 */
export function parseAuditTimestamp(val: any): number | null {
  if (val === null || val === undefined || val === "") return null
  if (typeof val === "number") {
    return isNaN(val) || val <= 0 ? null : val
  }
  if (typeof val === "string") {
    // If it's a numeric string like "1740000000000"
    if (/^\d+$/.test(val.trim())) {
      const parsedNum = Number(val.trim())
      if (!isNaN(parsedNum) && parsedNum > 0) return parsedNum
    }
    // If it's a date string like "2026-03-15T..."
    const parsedDate = new Date(val).getTime()
    if (!isNaN(parsedDate) && parsedDate > 0) return parsedDate
    return null
  }
  if (val && typeof val.toDate === "function") {
    return val.toDate().getTime()
  }
  if (val && typeof val.seconds === "number") {
    return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1000000) : 0)
  }
  return null
}

/**
 * Returns formatted IP address, ensuring localhost or missing IPs are not misrepresented (#6).
 */
export function formatAuditIp(ip?: string | null): string {
  if (!ip) return "Not captured"
  const trimmed = ip.trim()
  if (
    trimmed === "localhost" ||
    trimmed === "127.0.0.1" ||
    trimmed === "::1" ||
    trimmed.toLowerCase() === "unknown" ||
    trimmed.toLowerCase() === "not captured"
  ) {
    return "Not captured"
  }
  return trimmed
}

/**
 * Validates and extracts a sensible 4-digit calendar year (2000-2100) (#3).
 * Prevents epoch prefixes like 1790... from masquerading as calendar years in the 1700s.
 */
export function extractValidYear(val: any): string | null {
  if (!val) return null

  // If numeric or numeric string representing epoch milliseconds (e.g. 13 digits)
  const strVal = String(val).trim()
  if (/^\d{10,13}$/.test(strVal)) {
    const epochMs = Number(strVal)
    const d = new Date(epochMs)
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear()
      if (year >= 2000 && year <= 2100) return String(year)
    }
    return null
  }

  // If formatted date string like "Sep 4, 2026" or "2026-09-04"
  const match = strVal.match(/\b(20\d{2}|2100)\b/)
  if (match) return match[1]

  const d = new Date(val)
  if (!isNaN(d.getTime())) {
    const year = d.getFullYear()
    if (year >= 2000 && year <= 2100) return String(year)
  }

  return null
}

/**
 * Checks if a given timestamp falls within today's calendar day in the local / Asia-Manila day boundary (#19).
 */
export function isTimestampToday(timestamp: number): boolean {
  if (!timestamp) return false
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000
  return timestamp >= todayStart && timestamp < todayEnd
}

/**
 * Checks if a given timestamp falls within the past 7 days (#19).
 */
export function isTimestampThisWeek(timestamp: number): boolean {
  if (!timestamp) return false
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  return timestamp >= oneWeekAgo && timestamp <= Date.now()
}
