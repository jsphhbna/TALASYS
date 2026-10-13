export type VerificationType = "registration" | "profile-edit" | "reactivation"

export interface ApprovalOperation {
  id: string
  verificationId: string
  residentId: string
  verificationType: VerificationType
  actorUid: string
  actorName: string
  oldEmail?: string
  newEmail?: string
  profileUpdates: Record<string, unknown>
  status: "auth-pending" | "reconciliation-required" | "completed"
}

export interface ApprovalCoordinatorDependencies {
  claim(input: { verificationId: string; actorUid: string; attemptId: string; ipAddress: string; now: number }): Promise<{ outcome: "claimed" | "completed" | "conflict"; operation?: ApprovalOperation }>
  getAuthEmail(uid: string): Promise<string | undefined>
  updateAuthEmail(uid: string, email: string): Promise<void>
  complete(operation: ApprovalOperation, now: number): Promise<void>
  authFailed(operation: ApprovalOperation, message: string, now: number): Promise<void>
  reconciliationRequired(operation: ApprovalOperation, message: string, now: number): Promise<void>
  compensated(operation: ApprovalOperation, message: string, now: number): Promise<void>
}

export async function coordinateVerificationApproval(deps: ApprovalCoordinatorDependencies, input: { verificationId: string; actorUid: string; attemptId: string; ipAddress: string; now?: () => number }) {
  const now = (input.now || Date.now)()
  const claim = await deps.claim({ ...input, now })
  if (claim.outcome === "completed") return { outcome: "completed" as const, idempotent: true }
  if (claim.outcome === "conflict" || !claim.operation) throw Object.assign(new Error("Verification is already being reviewed by another operation."), { status: 409 })
  const operation = claim.operation
  let authChanged = false
  if (operation.newEmail && operation.newEmail !== operation.oldEmail) {
    try {
      const current = (await deps.getAuthEmail(operation.residentId))?.toLowerCase()
      const intended = operation.newEmail.toLowerCase()
      if (current !== intended) {
        await deps.updateAuthEmail(operation.residentId, intended)
        authChanged = true
      }
    } catch (error) {
      await deps.authFailed(operation, error instanceof Error ? error.message : String(error), now)
      throw Object.assign(new Error("Firebase Auth email update failed; verification was not approved."), { status: 502, cause: error })
    }
  }
  try {
    await deps.complete(operation, now)
    return { outcome: "completed" as const, idempotent: false }
  } catch (error) {
    if (authChanged && operation.oldEmail) {
      try {
        await deps.updateAuthEmail(operation.residentId, operation.oldEmail)
        await deps.compensated(operation, error instanceof Error ? error.message : String(error), now)
        throw Object.assign(new Error("Approval storage failed; Auth email was restored. Retry the approval."), { status: 503, cause: error })
      } catch (compensationError: any) {
        if (compensationError?.status === 503) throw compensationError
        await deps.reconciliationRequired(operation, compensationError instanceof Error ? compensationError.message : String(compensationError), now)
        throw Object.assign(new Error("Approval is incomplete and requires reconciliation before retry."), { status: 503, cause: compensationError })
      }
    }
    await deps.reconciliationRequired(operation, error instanceof Error ? error.message : String(error), now)
    throw Object.assign(new Error("Approval storage failed; no completed approval was recorded."), { status: 503, cause: error })
  }
}
