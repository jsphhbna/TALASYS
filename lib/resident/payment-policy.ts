/**
 * Resident Payment Action Eligibility Policy (F03)
 * Authoritative single policy governing resident payment controls across:
 * - Mobile request-history cards
 * - Desktop request-history table
 * - Resident payment modal
 *
 * In accordance with Firestore Rules (resource.data.status in ['Pending', 'Approved', 'On Process']),
 * only requests in these active non-terminal statuses with an unpaid document fee > 0
 * are eligible for resident payment actions.
 *
 * Terminal statuses ('Cancelled', 'Rejected', 'Completed'), zero-fee requests,
 * and already paid/waived requests are strictly ineligible.
 *
 * 'Awaiting Payment' is an administrative/in-person queue status and is not an
 * authorized resident client transition under Firestore Rules.
 */

export const RESIDENT_PAYMENT_ELIGIBLE_STATUSES = new Set([
  "Pending",
  "Approved",
  "On Process",
])

export interface PaymentActionCandidate {
  status?: string | null
  paymentStatus?: string | null
  documentFee?: number | null
  [key: string]: any
}

export function isResidentPaymentActionEligible(request: PaymentActionCandidate | null | undefined): boolean {
  if (!request) return false

  const status = request.status || ""
  if (!RESIDENT_PAYMENT_ELIGIBLE_STATUSES.has(status)) {
    return false
  }

  const fee = typeof request.documentFee === "number" ? request.documentFee : 0
  if (fee <= 0) {
    return false
  }

  const paymentStatus = request.paymentStatus || "unpaid"
  if (paymentStatus === "paid" || paymentStatus === "waived") {
    return false
  }

  return paymentStatus === "unpaid" || paymentStatus === "pending_verification"
}
