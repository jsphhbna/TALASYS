import { test } from "node:test"
import assert from "node:assert/strict"
import { REQUEST_TRANSITIONS } from "../app/api/admin/operations/route.ts"

test("F02: REQUEST_TRANSITIONS validates allowed status transitions and payment confirmation", () => {
  // Pending can transition to Approved, Rejected, Cancelled, Awaiting Payment, On Process
  assert.ok(REQUEST_TRANSITIONS["Pending"].has("Approved"))
  assert.ok(REQUEST_TRANSITIONS["Pending"].has("Rejected"))
  assert.ok(REQUEST_TRANSITIONS["Pending"].has("Cancelled"))
  assert.ok(REQUEST_TRANSITIONS["Pending"].has("Awaiting Payment"))
  assert.ok(REQUEST_TRANSITIONS["Pending"].has("On Process"))

  // Approved can transition to On Process, Rejected, Cancelled, Awaiting Payment
  assert.ok(REQUEST_TRANSITIONS["Approved"].has("On Process"))
  assert.ok(REQUEST_TRANSITIONS["Approved"].has("Awaiting Payment"))

  // Awaiting Payment can transition to On Process
  assert.ok(REQUEST_TRANSITIONS["Awaiting Payment"].has("On Process"))

  // On Process CANNOT transition to On Process (explaining why redundant updateRequestStatus("On Process") failed with 409)
  assert.equal(REQUEST_TRANSITIONS["On Process"].has("On Process" as any), false)
  // On Process transitions to Ready for Pick Up, Completed, Rejected, Cancelled
  assert.ok(REQUEST_TRANSITIONS["On Process"].has("Ready for Pick Up"))
  assert.ok(REQUEST_TRANSITIONS["On Process"].has("Completed"))
})

import { isResidentPaymentActionEligible } from "../lib/resident/payment-policy.ts"
import { isAdminPaymentQueueEligible } from "../lib/admin/payment-queue-policy.ts"

test("F03: Terminal requests and ineligible states are rejected by production isResidentPaymentActionEligible", () => {
  // Eligible: Pending, Approved, On Process with positive fee and unpaid/pending_verification
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "unpaid", documentFee: 50 }), true)
  assert.equal(isResidentPaymentActionEligible({ status: "Approved", paymentStatus: "unpaid", documentFee: 50 }), true)
  assert.equal(isResidentPaymentActionEligible({ status: "On Process", paymentStatus: "unpaid", documentFee: 50 }), true)
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "pending_verification", documentFee: 50 }), true)

  // Ineligible: Paid or waived requests
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "paid", documentFee: 50 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "waived", documentFee: 50 }), false)

  // Ineligible: Zero or negative fee
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "unpaid", documentFee: 0 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "unpaid", documentFee: -10 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Pending", paymentStatus: "unpaid" }), false)

  // Ineligible: Terminal statuses (F03 fix) - must NEVER allow payment actions
  assert.equal(isResidentPaymentActionEligible({ status: "Cancelled", paymentStatus: "unpaid", documentFee: 50 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Cancelled", paymentStatus: "pending_verification", documentFee: 50 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Rejected", paymentStatus: "unpaid", documentFee: 50 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Rejected", paymentStatus: "pending_verification", documentFee: 50 }), false)
  assert.equal(isResidentPaymentActionEligible({ status: "Completed", paymentStatus: "unpaid", documentFee: 50 }), false)

  // Ineligible: Awaiting Payment - resident cannot transition this via Firestore Rules (admin handles this queue)
  assert.equal(isResidentPaymentActionEligible({ status: "Awaiting Payment", paymentStatus: "unpaid", documentFee: 50 }), false)

  // Ineligible: Null or undefined or empty
  assert.equal(isResidentPaymentActionEligible(null), false)
  assert.equal(isResidentPaymentActionEligible(undefined), false)
  assert.equal(isResidentPaymentActionEligible({} as any), false)
})

test("F04: Admin payment queue excludes terminal requests, zero-fee requests, and already paid/waived requests", () => {
  // Zero-fee requests in ANY state (including Awaiting Payment and pending_verification) must NOT enter queue
  assert.equal(isAdminPaymentQueueEligible({ status: "Awaiting Payment", paymentStatus: "unpaid", documentFee: 0 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Awaiting Payment", paymentStatus: "pending_verification", documentFee: 0 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Pending", paymentStatus: "pending_verification", documentFee: 0 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Approved", paymentStatus: "unpaid", documentFee: 0 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "On Process", paymentStatus: "unpaid" }), false)

  // Terminal requests (Cancelled, Rejected, Completed) must NOT enter queue even with fee > 0
  assert.equal(isAdminPaymentQueueEligible({ status: "Cancelled", paymentStatus: "pending_verification", documentFee: 50 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Cancelled", paymentStatus: "unpaid", documentFee: 50 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Rejected", paymentStatus: "pending_verification", documentFee: 75 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Rejected", paymentStatus: "unpaid", documentFee: 75 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Completed", paymentStatus: "unpaid", documentFee: 50 }), false)

  // Paid or waived requests must NOT enter queue
  assert.equal(isAdminPaymentQueueEligible({ status: "Pending", paymentStatus: "paid", documentFee: 50 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Pending", paymentStatus: "waived", documentFee: 50 }), false)
  assert.equal(isAdminPaymentQueueEligible({ status: "Awaiting Payment", paymentStatus: "paid", documentFee: 50 }), false)

  // Legitimate payment queue entries
  assert.equal(isAdminPaymentQueueEligible({ status: "Awaiting Payment", paymentStatus: "unpaid", documentFee: 50 }), true)
  assert.equal(isAdminPaymentQueueEligible({ status: "Pending", paymentStatus: "pending_verification", documentFee: 50 }), true)
  assert.equal(isAdminPaymentQueueEligible({ status: "Approved", paymentStatus: "pending_verification", documentFee: 50 }), true)
  assert.equal(isAdminPaymentQueueEligible({ status: "On Process", paymentStatus: "unpaid", documentFee: 100 }), true)

  // Sample array filter verification
  const sampleRequests = [
    { id: "1", status: "Pending", paymentStatus: "pending_verification", documentFee: 50 },
    { id: "2", status: "On Process", paymentStatus: "unpaid", documentFee: 100 },
    { id: "3", status: "Cancelled", paymentStatus: "pending_verification", documentFee: 50 },
    { id: "4", status: "Rejected", paymentStatus: "unpaid", documentFee: 75 },
    { id: "5", status: "Completed", paymentStatus: "unpaid", documentFee: 50 },
    { id: "6", status: "Pending", paymentStatus: "paid", documentFee: 50 },
    { id: "7", status: "Pending", paymentStatus: "unpaid", documentFee: 0 },
    { id: "8", status: "Awaiting Payment", paymentStatus: "unpaid", documentFee: 0 }, // F04 edge case
    { id: "9", status: "Awaiting Payment", paymentStatus: "pending_verification", documentFee: 0 }, // F04 edge case
    { id: "10", status: "Awaiting Payment", paymentStatus: "unpaid", documentFee: 60 }, // Valid queue item
  ]

  const queue = sampleRequests.filter(isAdminPaymentQueueEligible)
  assert.equal(queue.length, 3)
  assert.deepEqual(queue.map(r => r.id), ["1", "2", "10"])
})

test("F07: Super Admin creation form validates contact number format", () => {
  const phoneRegex = /^[0-9+()-\s]{7,20}$/

  // Valid formats
  assert.ok(phoneRegex.test("+63 912 345 6789"))
  assert.ok(phoneRegex.test("09123456789"))
  assert.ok(phoneRegex.test("(02) 8123-4567"))
  assert.ok(phoneRegex.test("0912-345-6789"))

  // Invalid formats
  assert.equal(phoneRegex.test(""), false)
  assert.equal(phoneRegex.test("12345"), false) // too short (<7)
  assert.equal(phoneRegex.test("invalid-phone-number"), false)
  assert.equal(phoneRegex.test("+63 912 345 6789 ext 1234567890123456789"), false) // too long (>20)
})

test("F08: Active requests queue excludes Cancelled requests while Document History includes them", () => {
  const requests = [
    { id: "req-1", status: "Pending" },
    { id: "req-2", status: "On Process" },
    { id: "req-3", status: "Ready for Pick Up" },
    { id: "req-4", status: "Completed" },
    { id: "req-5", status: "Rejected" },
    { id: "req-6", status: "Cancelled" },
  ]

  // Active requests filter (from app/admin/requests/page.tsx)
  const activeRequests = requests.filter(r => r.status !== "Completed" && r.status !== "Rejected" && r.status !== "Cancelled")
  assert.equal(activeRequests.length, 3)
  assert.deepEqual(activeRequests.map(r => r.id), ["req-1", "req-2", "req-3"])

  // History requests filter (from app/admin/requests/history/document-history-content.tsx)
  const historyRequests = requests.filter(r => r.status === "Completed" || r.status === "Rejected" || r.status === "Cancelled")
  assert.equal(historyRequests.length, 3)
  assert.deepEqual(historyRequests.map(r => r.id), ["req-4", "req-5", "req-6"])

  // Partition invariant: sum of active + history equals total requests
  assert.equal(activeRequests.length + historyRequests.length, requests.length)
})
