/**
 * Admin Payment Queue Eligibility Policy (F04)
 * Authoritative single policy governing admin payment queue entries,
 * pending-payment counts, and payment processing action availability in:
 * - app/admin/requests/payments/page.tsx
 * - components/admin/admin-payment-process-modal.tsx
 *
 * Rules:
 * 1. Terminal requests ('Cancelled', 'Rejected', 'Completed') are strictly excluded.
 * 2. Fully paid requests ('paymentStatus === "paid"') are excluded.
 * 3. Waived requests ('paymentStatus === "waived"') are excluded.
 * 4. Zero-fee requests ('documentFee <= 0') are excluded across all conditions
 *    (including 'Awaiting Payment' and 'pending_verification').
 * 5. Requests with documentFee > 0 that are:
 *    - 'Awaiting Payment', OR
 *    - 'pending_verification', OR
 *    - 'unpaid'
 *    are eligible for administrative payment review and processing.
 */

export const TERMINAL_REQUEST_STATUSES = new Set([
  "Cancelled",
  "Rejected",
  "Completed",
])

export interface PaymentQueueCandidate {
  status?: string | null
  paymentStatus?: string | null
  documentFee?: number | null
  [key: string]: any
}

export function isAdminPaymentQueueEligible(request: PaymentQueueCandidate | null | undefined): boolean {
  if (!request) return false

  const status = request.status || ""
  if (TERMINAL_REQUEST_STATUSES.has(status)) {
    return false
  }

  const paymentStatus = request.paymentStatus || "unpaid"
  if (paymentStatus === "paid" || paymentStatus === "waived") {
    return false
  }

  const fee = typeof request.documentFee === "number" ? request.documentFee : 0
  if (fee <= 0) {
    return false
  }

  return (
    status === "Awaiting Payment" ||
    paymentStatus === "pending_verification" ||
    paymentStatus === "unpaid"
  )
}
