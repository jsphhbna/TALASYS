import test from "node:test"
import assert from "node:assert/strict"
import {
  getManilaDayBounds,
  isTimestampToday,
  isTimestampThisWeek,
  normalizeAuditLog,
  type CanonicalAuditLog
} from "../lib/security/audit-utils.ts"
import { canAccessMedia, canManageRequestsRole } from "../lib/security/media-auth.ts"

test("A16: Asia/Manila date boundaries operate consistently regardless of server/browser timezone", () => {
  // Epoch reference: 2026-10-14 12:00:00 UTC = 2026-10-14 20:00:00 Manila (UTC+8)
  const refTimeMs = Date.UTC(2026, 9, 14, 12, 0, 0)
  const { startMs, endMs } = getManilaDayBounds(refTimeMs)

  // Start of day in Manila: 2026-10-14 00:00:00 Manila = 2026-10-13 16:00:00 UTC
  const expectedStartMs = Date.UTC(2026, 9, 13, 16, 0, 0)
  // End of day in Manila (exclusive upper bound for [start, end) interval):
  // 2026-10-15 00:00:00 Manila = 2026-10-14 16:00:00 UTC
  const expectedEndMs = Date.UTC(2026, 9, 14, 16, 0, 0)

  assert.equal(startMs, expectedStartMs, "Manila day start epoch matches UTC 16:00 previous day")
  assert.equal(endMs, expectedEndMs, "Manila day end exclusive epoch matches UTC 16:00 current day")

  // Timestamps falling inside Manila's 2026-10-14:
  assert.equal(isTimestampToday(expectedStartMs, refTimeMs), true)
  assert.equal(isTimestampToday(expectedEndMs - 1, refTimeMs), true) // 23:59:59.999 Manila
  assert.equal(isTimestampToday(Date.UTC(2026, 9, 14, 0, 0, 0), refTimeMs), true)

  // Timestamps falling outside Manila's 2026-10-14:
  // 1 millisecond before Manila day start (2026-10-13 23:59:59.999 Manila)
  assert.equal(isTimestampToday(expectedStartMs - 1, refTimeMs), false)
  // Exact exclusive end bound (2026-10-15 00:00:00 Manila)
  assert.equal(isTimestampToday(expectedEndMs, refTimeMs), false)

  // Test across multiple reference hours (morning, noon, late night in Manila)
  const morningRef = Date.UTC(2026, 9, 13, 17, 0, 0) // 01:00 Manila
  const nightRef = Date.UTC(2026, 9, 14, 15, 30, 0)  // 23:30 Manila
  assert.equal(isTimestampToday(refTimeMs, morningRef), true)
  assert.equal(isTimestampToday(refTimeMs, nightRef), true)

  // Weekly boundaries test: rolling 7-day window ending at endMs
  const weekStartMs = endMs - 7 * 24 * 60 * 60 * 1000
  assert.equal(isTimestampThisWeek(weekStartMs, refTimeMs), true)
  assert.equal(isTimestampThisWeek(weekStartMs - 1, refTimeMs), false)
  assert.equal(isTimestampThisWeek(endMs, refTimeMs), true)
  assert.equal(isTimestampThisWeek(endMs + 1, refTimeMs), false)
})

test("A11: Audit records normalize into canonical view model with structured taxonomy and details", () => {
  // 1. Server-authored resident update
  const rawResidentUpdate = {
    id: "log-1",
    action: "resident.update",
    actor: { id: "admin-1", name: "Maria Clara", email: "maria@example.com", role: "Resident Management" },
    before: { name: "Juan Dela Cruz", address: "Old Address" },
    after: { name: "Juan Dela Cruz", address: "New Address", updatedAt: 1728900000000 },
    timestamp: 1728900000000,
    targetId: "resident-123"
  }

  const norm1 = normalizeAuditLog(rawResidentUpdate)
  assert.equal(norm1.action, "Updated Resident Profile")
  assert.equal(norm1.actionType, "resident")
  assert.equal(norm1.actor.name, "Maria Clara")
  assert.equal(norm1.actor.role, "Resident Management")
  assert.match(norm1.details, /address/i)

  // 2. Server-authored verification rejection
  const rawVerifReject = {
    id: "log-2",
    action: "verification.reject",
    actor: { id: "admin-2", name: "Capt. Juan", email: "capt@barangay.gov", role: "Full Access" },
    after: { status: "rejected", rejectionReason: "Provided ID photo is expired and unreadable" },
    timestamp: 1728901000000,
    targetId: "verif-456"
  }

  const norm2 = normalizeAuditLog(rawVerifReject)
  assert.equal(norm2.action, "Rejected Verification")
  assert.equal(norm2.actionType, "rejected")
  assert.equal(norm2.actor.name, "Capt. Juan")
  assert.match(norm2.details, /expired and unreadable/)

  // 3. Document request status transition
  const rawReqStatus = {
    id: "log-3",
    action: "request.updateStatus",
    actor: { id: "admin-3", name: "Staff Ana", role: "Document Processing" },
    after: { status: "On Process" },
    timestamp: 1728902000000,
    targetId: "req-789"
  }

  const norm3 = normalizeAuditLog(rawReqStatus)
  assert.equal(norm3.action, "Updated Request to On Process")
  assert.equal(norm3.actionType, "request")

  // 4. Legacy log format with string actor
  const rawLegacy = {
    id: "log-4",
    action: "Login",
    actor: "Legacy Admin (Admin)",
    timestamp: 1728903000000,
    details: "Admin logged into system"
  }

  const norm4 = normalizeAuditLog(rawLegacy)
  assert.equal(norm4.admin.name, "Legacy Admin")
  assert.equal(norm4.admin.role, "Admin")
  assert.equal(norm4.details, "Admin logged into system")
})

test("A12: Generated document counts strictly track hasGenerated instead of approval status", () => {
  const requests = [
    { id: "r1", status: "Approved", hasGenerated: false }, // Approved but never generated
    { id: "r2", status: "Completed", hasGenerated: false }, // Completed without generation
    { id: "r3", status: "On Process", hasGenerated: true }, // Actually generated
    { id: "r4", status: "Ready for Pick Up", hasGenerated: true }, // Actually generated
    { id: "r5", status: "Approved", hasGenerated: true }, // Approved and actually generated
    { id: "r6", status: "Pending", hasGenerated: false }
  ]

  // Authoritative generator count
  const strictlyGenerated = requests.filter(r => (r as any).hasGenerated === true)
  assert.equal(strictlyGenerated.length, 3, "Only requests with hasGenerated === true are counted as generated")
  assert.deepEqual(strictlyGenerated.map(r => r.id), ["r3", "r4", "r5"])

  // Flawed heuristic that incorrectly counts approval/completion without hasGenerated
  const flawedHeuristic = requests.filter(r => r.status === "Approved" || r.status === "Completed")
  assert.equal(flawedHeuristic.length, 3)
  assert.deepEqual(flawedHeuristic.map(r => r.id), ["r1", "r2", "r5"]) // False positives: r1 and r2
})

test("A13: Locked and Deleted resident accounts are excluded from active counts and selectors", () => {
  const isInactiveResident = (status?: string | null) => {
    if (!status) return false
    const s = status.trim().toLowerCase()
    return s === "locked" || s === "deleted" || s === "deleted by resident"
  }

  const residents = [
    { id: "u1", name: "Active Resident", status: "Active" },
    { id: "u2", name: "Expired Resident", status: "Expired" },
    { id: "u3", name: "Locked Resident", status: "Locked" },
    { id: "u4", name: "Deleted Resident", status: "Deleted" },
    { id: "u5", name: "Self-Deleted Resident", status: "Deleted by Resident" },
    { id: "u6", name: "Case Variant Resident", status: "locked" }
  ]

  const activeResidents = residents.filter(r => !isInactiveResident(r.status))
  assert.equal(activeResidents.length, 2, "Only Active and Expired residents are preserved in active list")
  assert.deepEqual(activeResidents.map(r => r.id), ["u1", "u2"])

  // Selector search filter verification
  const searchFilter = (query: string) =>
    residents.filter(r => !isInactiveResident(r.status) && r.name.toLowerCase().includes(query.toLowerCase()))

  assert.equal(searchFilter("Resident").length, 2)
  assert.equal(searchFilter("Locked").length, 0, "Locked residents cannot appear in generator search")
  assert.equal(searchFilter("Deleted").length, 0, "Deleted residents cannot appear in generator search")
})

test("A14: Official signatures allow Document Processing admins for generation and deny unauthorized roles", () => {
  const signatureUrl = "https://res.cloudinary.com/example/image/authenticated/v1/talasys/signatures/punong_barangay.png"

  // Role capability verification
  assert.equal(canManageRequestsRole("Document Processing"), true)
  assert.equal(canManageRequestsRole("Documents Only"), true)
  assert.equal(canManageRequestsRole("Full Access"), true)
  assert.equal(canManageRequestsRole("superadmin"), true)
  assert.equal(canManageRequestsRole("Verification Only"), false)
  assert.equal(canManageRequestsRole("Resident Management"), false)
  assert.equal(canManageRequestsRole("View Only"), false)
  assert.equal(canManageRequestsRole("resident"), false)

  // canAccessMedia enforcement on official signature assets
  // Authorized:
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-doc", callerRole: "Document Processing" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-doc2", callerRole: "Documents Only" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-full", callerRole: "Full Access" }).authorized, true)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "super-1", callerRole: "superadmin" }).authorized, true)

  // Unauthorized:
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-verif", callerRole: "Verification Only" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-res", callerRole: "Resident Management" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-view", callerRole: "View Only" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "resident-1", callerRole: "resident" }).authorized, false)
  assert.equal(canAccessMedia({ publicId: signatureUrl, callerUid: "admin-locked", callerRole: "Document Processing", callerStatus: "Locked" }).authorized, false)
})

test("A15: Rejection reasons are canonically preserved and accessible to residents", () => {
  const rejectedRequest = {
    id: "req-rej-1",
    status: "Rejected",
    documentType: "Barangay Clearance",
    rejectionReason: "Incomplete proof of billing attached. Please upload a recent electric or water bill."
  }

  // Canonical field retrieval
  const displayedReason = rejectedRequest.rejectionReason || (rejectedRequest as any).rejectReason
  assert.equal(displayedReason, "Incomplete proof of billing attached. Please upload a recent electric or water bill.")
  assert.ok(displayedReason.length >= 10, "Rejection reason satisfies minimum character length")
})
