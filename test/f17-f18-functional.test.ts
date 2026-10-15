import { test } from "node:test"
import assert from "node:assert/strict"

import {
  isResidentPaymentActionEligible,
  RESIDENT_PAYMENT_ELIGIBLE_STATUSES,
} from "../lib/resident/payment-policy.ts"

import {
  getAuthoritativeGenerationTimestamp,
  getAuthoritativeRejectionTimestamp,
  getAuthoritativeIssuanceTimestamp,
  calculateFullAnalyticsMetrics,
  isRecordInPeriod,
} from "../lib/timestamp-normalizer.ts"

// ============================================================================
// F17 — PAYMENT MODAL LIVE-STATE CONSISTENCY & ELIGIBILITY ENFORCEMENT
// ============================================================================

test("F17 Scenario 1: Normal payment eligibility allows active, unpaid, fee-bearing requests", () => {
  const eligibleRequest = {
    id: "req-normal-1",
    status: "Pending",
    paymentStatus: "unpaid",
    documentFee: 50,
    paymentMethod: "gcash",
    paymentReferenceNumber: "REF-12345",
  }

  assert.equal(isResidentPaymentActionEligible(eligibleRequest), true)

  // Approved and On Process are also eligible
  assert.equal(isResidentPaymentActionEligible({ ...eligibleRequest, status: "Approved" }), true)
  assert.equal(isResidentPaymentActionEligible({ ...eligibleRequest, status: "On Process" }), true)
  // Pending verification is also eligible (resubmit scenario)
  assert.equal(isResidentPaymentActionEligible({ ...eligibleRequest, paymentStatus: "pending_verification" }), true)
})

test("F17 Scenario 2: Status changes to paid immediately invalidates payment action eligibility", () => {
  const request = {
    id: "req-paid-1",
    status: "Approved",
    paymentStatus: "unpaid",
    documentFee: 75,
  }

  assert.equal(isResidentPaymentActionEligible(request), true)

  // Request updated by admin/system to paid
  const updatedRequest = {
    ...request,
    paymentStatus: "paid",
    receiptNumber: "REC-2026-001",
  }

  assert.equal(isResidentPaymentActionEligible(updatedRequest), false)
})

test("F17 Scenario 3: Request cancelled or rejected immediately disables payment action eligibility", () => {
  const request = {
    id: "req-cancel-1",
    status: "Pending",
    paymentStatus: "unpaid",
    documentFee: 50,
  }
  assert.equal(isResidentPaymentActionEligible(request), true)

  // Status changes to Cancelled
  assert.equal(isResidentPaymentActionEligible({ ...request, status: "Cancelled" }), false)

  // Status changes to Rejected
  assert.equal(isResidentPaymentActionEligible({ ...request, status: "Rejected" }), false)

  // Status changes to Completed
  assert.equal(isResidentPaymentActionEligible({ ...request, status: "Completed" }), false)
})

test("F17 Scenario 4: Waived payment requests do not present actionable payment eligibility", () => {
  const waivedRequest = {
    id: "req-waived-1",
    status: "Approved",
    paymentStatus: "waived",
    documentFee: 50,
  }

  assert.equal(isResidentPaymentActionEligible(waivedRequest), false)
})

test("F17 Scenario 5: Missing payment status from caller omission is NOT defaulted to unpaid", () => {
  // A caller that accidentally omits paymentStatus must NOT be assumed unpaid
  const incompleteProjection = {
    id: "req-incomplete-1",
    status: "Approved",
    documentFee: 50,
    // paymentStatus omitted!
  }

  // Under F17 fix: missing paymentStatus is NOT assumed unpaid, so it is strictly ineligible
  assert.equal(isResidentPaymentActionEligible(incompleteProjection), false)

  // Genuinely missing legacy record with explicit flag defaults safely
  const legacyRecord = {
    id: "req-legacy-1",
    status: "Approved",
    documentFee: 50,
    isLegacyRecord: true,
  }
  assert.equal(isResidentPaymentActionEligible(legacyRecord), true)
})

test("F17 Scenario 6: Missing or deleted requests are handled gracefully", () => {
  assert.equal(isResidentPaymentActionEligible(null), false)
  assert.equal(isResidentPaymentActionEligible(undefined), false)
  assert.equal(isResidentPaymentActionEligible({} as any), false)
})

test("F17 Scenario 7: Live store derivation ensures open modal tracks real-time collection updates", () => {
  // Simulate live Firestore subscription collection
  let liveRequests = [
    { id: "req-live-1", status: "Approved", paymentStatus: "unpaid", documentFee: 50 },
    { id: "req-live-2", status: "Pending", paymentStatus: "unpaid", documentFee: 100 },
  ]

  let selectedPaymentRequestId: string | null = "req-live-1"

  // Derive live request (matching app/resident/history/page.tsx)
  const getActiveRequest = () => liveRequests.find(r => r.id === selectedPaymentRequestId) || null

  // Initially: eligible
  let active = getActiveRequest()
  assert.ok(active)
  assert.equal(isResidentPaymentActionEligible(active), true)

  // Event A: Admin confirms payment in background
  liveRequests = liveRequests.map(r => r.id === "req-live-1" ? { ...r, paymentStatus: "paid", status: "On Process" } : r)
  active = getActiveRequest()
  assert.ok(active)
  assert.equal(active?.paymentStatus, "paid")
  assert.equal(isResidentPaymentActionEligible(active), false)

  // Event B: Request is deleted from collection
  liveRequests = liveRequests.filter(r => r.id !== "req-live-1")
  active = getActiveRequest()
  // Active request is now null; modal presents "Request Unavailable" without executing stale actions
  assert.equal(active, null)
  assert.equal(isResidentPaymentActionEligible(active), false)
})


// ============================================================================
// F18 — FULL ANALYTICS GENERATION-PERIOD ACCURACY
// ============================================================================

const defaultAdminStats = {
  totalResidents: 1500,
  voterCount: 1100,
  seniorCount: 200,
  adultCount: 900,
  minorCount: 400,
  pendingVerifications: 5,
}

test("F18 Scenario 1: Cross-month generation attributes submission to Jan and generation to Mar", () => {
  const janSubmissionMs = new Date("2026-01-10T10:00:00+08:00").getTime()
  const marGenerationMs = new Date("2026-03-15T14:30:00+08:00").getTime()

  const crossMonthRequest = {
    id: "req-cross-month",
    createdAt: janSubmissionMs,
    hasGenerated: true,
    generatedAt: marGenerationMs,
    status: "Completed",
  }

  const allRequests = [crossMonthRequest]

  // 1. January 2026 Full Analytics:
  // Must include the request in Total Requests Submitted
  // Must EXCLUDE it from Documents Generated
  const janResult = calculateFullAnalyticsMetrics({
    documentRequests: allRequests,
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "January",
  })

  assert.equal(janResult.metrics.totalRequestsSubmitted, 1)
  assert.equal(janResult.metrics.documentsGenerated, 0)

  // 2. March 2026 Full Analytics:
  // Must EXCLUDE the request from Total Requests Submitted
  // Must INCLUDE it in Documents Generated
  const marResult = calculateFullAnalyticsMetrics({
    documentRequests: allRequests,
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "March",
  })

  assert.equal(marResult.metrics.totalRequestsSubmitted, 0)
  assert.equal(marResult.metrics.documentsGenerated, 1)
})

test("F18 Scenario 2: Same-day submission and generation counts both in the same reporting period", () => {
  const mar15Submission = new Date("2026-03-15T09:00:00+08:00").getTime()
  const mar15Generation = new Date("2026-03-15T15:00:00+08:00").getTime()

  const sameDayRequest = {
    id: "req-same-day",
    createdAt: mar15Submission,
    hasGenerated: true,
    generatedAt: mar15Generation,
    status: "Completed",
  }

  const marResult = calculateFullAnalyticsMetrics({
    documentRequests: [sameDayRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "March",
  })

  assert.equal(marResult.metrics.totalRequestsSubmitted, 1)
  assert.equal(marResult.metrics.documentsGenerated, 1)
})

test("F18 Scenario 3: Created but not generated request appears in submitted but not generated metrics", () => {
  const janSubmissionMs = new Date("2026-01-10T10:00:00+08:00").getTime()

  const ungeneratedRequest = {
    id: "req-ungenerated",
    createdAt: janSubmissionMs,
    hasGenerated: false,
    status: "Pending",
  }

  const janResult = calculateFullAnalyticsMetrics({
    documentRequests: [ungeneratedRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "January",
  })

  assert.equal(janResult.metrics.totalRequestsSubmitted, 1)
  assert.equal(janResult.metrics.documentsGenerated, 0)
})

test("F18 Scenario 4: Historical generated record with unknown date is never assigned an invented period", () => {
  const janSubmissionMs = new Date("2026-01-10T10:00:00+08:00").getTime()

  // Historical record marked hasGenerated: true but lacking generatedAt
  const historicalUnknownDate = {
    id: "req-hist-unknown",
    createdAt: janSubmissionMs,
    hasGenerated: true,
    // generatedAt omitted/unknown!
    status: "Completed",
  }

  // Authoritative resolver returns null rather than falling back to createdAt
  assert.equal(getAuthoritativeGenerationTimestamp(historicalUnknownDate), null)

  // Specific month reports (January, March, etc.) must NEVER invent dates for this record
  const janResult = calculateFullAnalyticsMetrics({
    documentRequests: [historicalUnknownDate],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "January",
  })
  assert.equal(janResult.metrics.documentsGenerated, 0)

  const marResult = calculateFullAnalyticsMetrics({
    documentRequests: [historicalUnknownDate],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "March",
  })
  assert.equal(marResult.metrics.documentsGenerated, 0)

  // In All Time: preserved and counted honestly, with unknown date count transparently provided
  const allTimeResult = calculateFullAnalyticsMetrics({
    documentRequests: [historicalUnknownDate],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "All",
    selectedMonth: "All",
  })
  assert.equal(allTimeResult.metrics.documentsGenerated, 1)
  assert.equal(allTimeResult.metrics.historicalGeneratedUnknownDate, 1)
  assert.ok(allTimeResult.rows.some(([label, val]) => label.includes("Unknown Date") && val === "1"))
})

test("F18 Scenario 5: Manila calendar boundaries evaluate midnight events strictly in Asia/Manila (UTC+8)", () => {
  // 2026-01-31 16:30:00 UTC is 2026-02-01 00:30:00 Asia/Manila (February 1 in Manila!)
  const febFirstManilaFromUtcMs = new Date("2026-01-31T16:30:00Z").getTime()

  const febGeneratedRequest = {
    id: "req-manila-boundary",
    createdAt: new Date("2026-01-15T10:00:00Z").getTime(),
    hasGenerated: true,
    generatedAt: febFirstManilaFromUtcMs,
    status: "Completed",
  }

  // January report: must NOT include this generation
  const janResult = calculateFullAnalyticsMetrics({
    documentRequests: [febGeneratedRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "January",
  })
  assert.equal(janResult.metrics.documentsGenerated, 0)

  // February report: MUST include this generation
  const febResult = calculateFullAnalyticsMetrics({
    documentRequests: [febGeneratedRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "February",
  })
  assert.equal(febResult.metrics.documentsGenerated, 1)
})

test("F18 Scenario 6: Output-format parity guarantees identical numerical data across PDF, CSV, and XLSX", () => {
  const requests = [
    { id: "1", createdAt: new Date("2026-03-01T10:00:00+08:00").getTime(), hasGenerated: true, generatedAt: new Date("2026-03-05T10:00:00+08:00").getTime(), status: "Completed" },
    { id: "2", createdAt: new Date("2026-01-15T10:00:00+08:00").getTime(), hasGenerated: true, generatedAt: new Date("2026-03-10T10:00:00+08:00").getTime(), status: "Completed" },
    { id: "3", createdAt: new Date("2026-03-12T10:00:00+08:00").getTime(), hasGenerated: false, status: "Pending" },
  ]

  const result = calculateFullAnalyticsMetrics({
    documentRequests: requests,
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "March",
  })

  // Rows is a single unified array consumed identically by Excel, CSV, and PDF
  assert.ok(Array.isArray(result.rows))
  assert.equal(result.headers.length, 2)

  const rowMap = Object.fromEntries(result.rows)
  assert.equal(rowMap["Total Requests Submitted"], "2") // id 1 and id 3 submitted in March
  assert.equal(rowMap["Documents Generated"], "2")       // id 1 and id 2 generated in March
  assert.equal(rowMap["Rejected Requests"], "0")
  assert.equal(rowMap["Pending Verifications (Current)"], "5")
})

test("F18 Scenario 7: All Time counts follow documented rules for known and unknown generation dates", () => {
  const requests = [
    { id: "1", createdAt: 1000, hasGenerated: true, generatedAt: 2000, status: "Completed" },
    { id: "2", createdAt: 1000, hasGenerated: true, status: "Completed" }, // unknown date
    { id: "3", createdAt: 1000, hasGenerated: false, status: "Pending" },
  ]

  const result = calculateFullAnalyticsMetrics({
    documentRequests: requests,
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "All",
    selectedMonth: "All",
  })

  assert.equal(result.metrics.totalRequestsSubmitted, 3)
  assert.equal(result.metrics.documentsGenerated, 2)
  assert.equal(result.metrics.historicalGeneratedUnknownDate, 1)
})

test("F18: Rejection timestamps are strictly respected for rejection period metrics", () => {
  const janSubmission = new Date("2026-01-10T10:00:00+08:00").getTime()
  const febRejection = new Date("2026-02-05T10:00:00+08:00").getTime()

  const rejectedRequest = {
    id: "req-rej-1",
    createdAt: janSubmission,
    status: "Rejected",
    statusTimestamps: {
      Rejected: febRejection,
    },
  }

  assert.equal(getAuthoritativeRejectionTimestamp(rejectedRequest), febRejection)

  // January: submitted includes it, but rejected in period excludes it
  const jan = calculateFullAnalyticsMetrics({
    documentRequests: [rejectedRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "January",
  })
  assert.equal(jan.metrics.totalRequestsSubmitted, 1)
  assert.equal(jan.metrics.rejectedRequests, 0)

  // February: submitted excludes it, but rejected in period includes it
  const feb = calculateFullAnalyticsMetrics({
    documentRequests: [rejectedRequest],
    residents: [],
    adminStats: defaultAdminStats,
    selectedYear: "2026",
    selectedMonth: "February",
  })
  assert.equal(feb.metrics.totalRequestsSubmitted, 0)
  assert.equal(feb.metrics.rejectedRequests, 1)
})
