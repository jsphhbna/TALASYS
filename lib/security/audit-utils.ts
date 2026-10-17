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
      const year = new Date(d.getTime() + MANILA_OFFSET_MS).getUTCFullYear()
      if (year >= 2000 && year <= 2100) return String(year)
    }
    return null
  }

  // If formatted date string like "Sep 4, 2026" or "2026-09-04"
  const match = strVal.match(/\b(20\d{2}|2100)\b/)
  if (match) return match[1]

  const d = new Date(val)
  if (!isNaN(d.getTime())) {
    const year = new Date(d.getTime() + MANILA_OFFSET_MS).getUTCFullYear()
    if (year >= 2000 && year <= 2100) return String(year)
  }

  return null
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000 // Asia/Manila is fixed UTC+8 (no DST)

/**
 * Calculates start and end of calendar day in Asia/Manila (UTC+8) independent of host timezone (#19, A16).
 */
export function getManilaDayBounds(referenceTimeMs: number = Date.now()): {
  startMs: number
  endMs: number
  year: number
  month: number
  day: number
  dateString: string
} {
  const manilaDate = new Date(referenceTimeMs + MANILA_OFFSET_MS)
  const year = manilaDate.getUTCFullYear()
  const month = manilaDate.getUTCMonth()
  const day = manilaDate.getUTCDate()
  const startMs = Date.UTC(year, month, day) - MANILA_OFFSET_MS
  const endMs = startMs + 24 * 60 * 60 * 1000
  const monthStr = String(month + 1).padStart(2, "0")
  const dayStr = String(day).padStart(2, "0")
  const dateString = `${year}-${monthStr}-${dayStr}`
  return { startMs, endMs, year, month, day, dateString }
}

/**
 * Checks if a given timestamp falls within today's calendar day in Asia/Manila timezone (UTC+8) (#19, A16).
 * Evaluates identically under UTC, Asia/Manila, America/Los_Angeles, or any host timezone.
 */
export function isTimestampToday(timestamp: number, referenceNow: number = Date.now()): boolean {
  if (!timestamp || typeof timestamp !== "number" || isNaN(timestamp)) return false
  const { startMs, endMs } = getManilaDayBounds(referenceNow)
  return timestamp >= startMs && timestamp < endMs
}

/**
 * Checks if a given timestamp falls within the current 7-day window in Asia/Manila (UTC+8) (#19, A16).
 */
export function isTimestampThisWeek(timestamp: number, referenceNow: number = Date.now()): boolean {
  if (!timestamp || typeof timestamp !== "number" || isNaN(timestamp)) return false
  const { endMs } = getManilaDayBounds(referenceNow)
  const weekStartMs = endMs - 7 * 24 * 60 * 60 * 1000
  return timestamp >= weekStartMs && timestamp <= endMs
}

/**
 * Canonical Audit View Model (A11).
 * Normalizes disparate server-authored operations and legacy client audit events into a consistent representation.
 */
export interface CanonicalAuditLog {
  id: string
  timestamp: number
  date: string
  time: string
  admin: {
    name: string
    initials: string
    color: string
    role: string
    uid?: string
  }
  actor: {
    id: string
    name: string
    email: string
    role: string
  }
  action: string
  actionType: "approved" | "rejected" | "denied" | "generated" | "verified" | "sent" | "admin" | "resident" | "request" | "system" | "other"
  residentName: string
  details: string
  ipAddress: string
  targetId?: string
  targetCollection?: string
  before?: any
  after?: any
  authoritative?: boolean
}

function deriveInitials(name?: string): string {
  if (!name || !name.trim()) return "SY"
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function roleToColor(role?: string): string {
  if (!role) return "#0C2340"
  const r = role.toLowerCase()
  if (r.includes("super")) return "#C5A55A"
  if (r.includes("full") || r === "admin") return "#0C2340"
  if (r.includes("verif")) return "#7c3aed"
  if (r.includes("doc")) return "#2563eb"
  return "#64748b"
}

/**
 * Normalizes any raw audit log into the canonical view model (A11).
 */
export function normalizeAuditLog(raw: any): CanonicalAuditLog {
  const id = String(raw?.id || raw?.operationId || crypto.randomUUID?.() || Math.random().toString(36).slice(2))
  const ts = parseAuditTimestamp(raw?.timestamp || raw?.createdAt || raw?.date) || 0

  let dateStr = raw?.date || ""
  let timeStr = raw?.time || ""
  if (ts > 0) {
    const manilaTime = new Date(ts + MANILA_OFFSET_MS)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    dateStr = `${monthNames[manilaTime.getUTCMonth()]} ${manilaTime.getUTCDate()}, ${manilaTime.getUTCFullYear()}`
    
    let hours = manilaTime.getUTCHours()
    const minutes = String(manilaTime.getUTCMinutes()).padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    hours = hours % 12 || 12
    timeStr = `${hours}:${minutes} ${ampm}`
  }

  // Derive Actor & Admin (support both object and legacy string representation)
  const rawActorObj = typeof raw?.actor === "object" && raw?.actor !== null ? raw.actor : {}
  const rawAdminObj = typeof raw?.admin === "object" && raw?.admin !== null ? raw.admin : {}
  const stringActor = typeof raw?.actor === "string" ? raw.actor.trim() : ""
  let parsedName = ""
  let parsedRole = ""
  if (stringActor) {
    const match = stringActor.match(/^(.+?)\s*\((.+?)\)$/)
    if (match) {
      parsedName = match[1].trim()
      parsedRole = match[2].trim()
    } else {
      parsedName = stringActor
    }
  }

  const actorName = rawActorObj.name || rawAdminObj.name || raw?.adminName || parsedName || "System"
  const actorRole = rawActorObj.role || rawAdminObj.role || raw?.role || parsedRole || "Admin"
  const actorEmail = rawActorObj.email || rawAdminObj.email || raw?.email || ""
  const actorUid = rawActorObj.id || rawActorObj.uid || rawAdminObj.uid || raw?.actorUid || ""
  const actorInitials = rawAdminObj.initials || deriveInitials(actorName)
  const actorColor = rawAdminObj.color || roleToColor(actorRole)

  const admin = {
    name: actorName,
    initials: actorInitials,
    color: actorColor,
    role: actorRole,
    uid: actorUid,
  }

  const actor = {
    id: actorUid,
    name: actorName,
    email: actorEmail,
    role: actorRole,
  }

  // Derive Canonical Action and ActionType Taxonomy (A11)
  const rawAction = String(raw?.action || raw?.actionType || "Action").trim()
  let action = rawAction
  let actionType: CanonicalAuditLog["actionType"] = "other"

  const before = raw?.before || null
  const after = raw?.after || null

  if (rawAction === "verification.approve" || /approved?\s+verif/i.test(rawAction)) {
    action = "Approved Verification"
    actionType = "approved"
  } else if (rawAction === "verification.denyRegistration" || /denied?\s+registration/i.test(rawAction) || rawAction === "denied") {
    action = "Denied Registration"
    actionType = "denied"
  } else if (rawAction === "verification.reject" || /rejected?\s+verif/i.test(rawAction)) {
    action = "Rejected Verification"
    actionType = "rejected"
  } else if (rawAction === "request.reprint" || /reprint/i.test(rawAction)) {
    action = "Reprinted Document"
    actionType = "generated"
  } else if (rawAction === "request.markGenerated" || /generate/i.test(rawAction)) {
    if (after?.lastReprintedAt || (after?.reprintCount && after.reprintCount > 0)) {
      action = "Reprinted Document"
      actionType = "generated"
    } else {
      action = "Generated Document"
      actionType = "generated"
    }
  } else if (rawAction === "request.confirmPayment" || /confirm.*payment/i.test(rawAction)) {
    action = "Confirmed Payment"
    actionType = "approved"
  } else if (rawAction === "request.waivePayment" || /waiv.*payment/i.test(rawAction)) {
    action = "Waived Document Fee"
    actionType = "approved"
  } else if (rawAction === "request.markPayLater") {
    action = "Marked Pay Later"
    actionType = "request"
  } else if (rawAction === "request.updateStatus") {
    const newStatus = after?.status || ""
    if (newStatus === "Approved" || newStatus === "Completed") {
      action = `${newStatus} Document Request`
      actionType = "approved"
    } else if (newStatus === "Rejected") {
      action = "Rejected Document Request"
      actionType = "rejected"
    } else {
      action = `Updated Request to ${newStatus || "On Process"}`
      actionType = "request"
    }
  } else if (rawAction === "resident.update") {
    action = "Updated Resident Profile"
    actionType = "resident"
  } else if (rawAction === "resident.activate") {
    action = "Activated Resident"
    actionType = "approved"
  } else if (rawAction === "resident.deactivate") {
    action = "Deactivated Resident"
    actionType = "rejected"
  } else if (rawAction === "resident.delete") {
    action = "Deleted Resident"
    actionType = "rejected"
  } else if (rawAction === "admin.create") {
    action = "Created Administrator"
    actionType = "admin"
  } else if (rawAction === "admin.update") {
    action = "Updated Administrator"
    actionType = "admin"
  } else if (rawAction.startsWith("system.")) {
    action = "Updated System Configuration"
    actionType = "system"
  } else {
    // Legacy action fallback
    if (/approve/i.test(rawAction)) actionType = "approved"
    else if (/reject|decline/i.test(rawAction)) actionType = "rejected"
    else if (/generate/i.test(rawAction)) actionType = "generated"
    else if (/verif/i.test(rawAction)) actionType = "verified"
    else if (/sent|notif/i.test(rawAction)) actionType = "sent"
    else actionType = "other"
  }

  // Derive Resident Name
  const residentName = raw?.residentName || after?.name || before?.name || raw?.targetName || "—"

  // Derive Details (A11)
  let details = String(raw?.details || "").trim()
  if (!details) {
    if (after?.denialReason) {
      details = `Reason: "${after.denialReason}"`
    } else if (after?.rejectionReason) {
      details = `Reason: "${after.rejectionReason}"`
    } else if (after?.receiptNumber) {
      details = `Receipt #: ${after.receiptNumber} (${after.paymentMethod || "cash"})`
    } else if (after?.status && before?.status) {
      details = `Status: ${before.status} → ${after.status}`
    } else if (after?.status) {
      details = `Status set to ${after.status}`
    } else if (rawAction === "admin.create" && after?.email) {
      details = `New admin: ${after.name || "Admin"} (${after.role || "Admin"})`
    } else if (rawAction === "resident.update" && after) {
      const changed = Object.keys(after).filter(k => k !== "updatedAt")
      details = changed.length ? `Updated: ${changed.join(", ")}` : "Profile updated"
    } else {
      details = action
    }
  }

  return {
    id,
    timestamp: ts,
    date: dateStr,
    time: timeStr,
    admin,
    actor,
    action,
    actionType,
    residentName,
    details,
    ipAddress: formatAuditIp(raw?.ipAddress),
    targetId: raw?.targetId || undefined,
    targetCollection: raw?.targetCollection || undefined,
    before,
    after,
    authoritative: !!raw?.authoritative,
  }
}
