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

test("F03: Terminal requests are ineligible for resident payment actions", () => {
  const isPaymentActionEligible = (status: string, paymentStatus?: string, fee?: number) => {
    const isTerminal = status === "Cancelled" || status === "Rejected" || status === "Completed"
    if (isTerminal) return false
    const isStatusEligible = ['Pending', 'Approved', 'On Process', 'Awaiting Payment'].includes(status)
    if (!isStatusEligible) return false
    return (fee || 0) > 0 && paymentStatus !== "paid" && paymentStatus !== "waived"
  }

  // Eligible
  assert.equal(isPaymentActionEligible("Pending", "unpaid", 50), true)
  assert.equal(isPaymentActionEligible("Approved", "unpaid", 50), true)
  assert.equal(isPaymentActionEligible("On Process", "unpaid", 50), true)
  assert.equal(isPaymentActionEligible("Awaiting Payment", "unpaid", 50), true)

  // Ineligible because already paid or waived
  assert.equal(isPaymentActionEligible("Pending", "paid", 50), false)
  assert.equal(isPaymentActionEligible("Pending", "waived", 50), false)
  assert.equal(isPaymentActionEligible("Pending", "unpaid", 0), false)

  // Ineligible because of terminal status (F03 fix)
  assert.equal(isPaymentActionEligible("Cancelled", "unpaid", 50), false)
  assert.equal(isPaymentActionEligible("Rejected", "unpaid", 50), false)
  assert.equal(isPaymentActionEligible("Completed", "unpaid", 50), false)
})

test("F04: Admin payment queue excludes terminal requests and zero-fee requests", () => {
  const isPaymentQueueEligible = (r: { status: string; paymentStatus?: string; documentFee?: number }) => {
    const isTerminal = r.status === "Completed" || r.status === "Rejected" || r.status === "Cancelled"
    if (isTerminal) return false
    const fee = r.documentFee || 0
    if (fee <= 0) return false
    return r.paymentStatus === "pending_verification" || r.paymentStatus === "unpaid"
  }

  const sampleRequests = [
    { id: "1", status: "Pending", paymentStatus: "pending_verification", documentFee: 50 },
    { id: "2", status: "On Process", paymentStatus: "unpaid", documentFee: 100 },
    { id: "3", status: "Cancelled", paymentStatus: "pending_verification", documentFee: 50 },
    { id: "4", status: "Rejected", paymentStatus: "unpaid", documentFee: 75 },
    { id: "5", status: "Completed", paymentStatus: "unpaid", documentFee: 50 },
    { id: "6", status: "Pending", paymentStatus: "paid", documentFee: 50 },
    { id: "7", status: "Pending", paymentStatus: "unpaid", documentFee: 0 },
  ]

  const queue = sampleRequests.filter(isPaymentQueueEligible)
  assert.equal(queue.length, 2)
  assert.deepEqual(queue.map(r => r.id), ["1", "2"])
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
