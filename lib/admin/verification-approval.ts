export type VerificationType = "registration" | "profile-edit" | "reactivation"

export interface ApprovalOperation {
  id: string
  verificationId: string
  residentId: string
  verificationType: VerificationType
  actorUid: string
  actorName: string
  attemptId: string
  oldEmail?: string
  newEmail?: string
  profileUpdates: Record<string, unknown>
  status: "claimed" | "auth-pending" | "auth-mutating" | "auth-completed" | "auth-failed" | "compensating" | "compensated" | "reconciling" | "reconciliation-required" | "completed"
}

export interface ApprovalCoordinatorDependencies {
  claim(input: { verificationId: string; actorUid: string; attemptId: string; ipAddress: string; now: number }): Promise<{ outcome: "claimed" | "completed" | "conflict"; operation?: ApprovalOperation }>
  getAuthEmail(uid: string): Promise<string | undefined>
  updateAuthEmail(uid: string, email: string): Promise<void>
  owns(operation: ApprovalOperation): Promise<boolean>
  beginAuthMutation?(operation: ApprovalOperation, now: number): Promise<void>
  authSucceeded?(operation: ApprovalOperation, now: number): Promise<void>
  beginCompensation?(operation: ApprovalOperation, message: string, now: number): Promise<boolean>
  complete(operation: ApprovalOperation, now: number): Promise<void>
  authFailed(operation: ApprovalOperation, message: string, now: number): Promise<void>
  reconciliationRequired(operation: ApprovalOperation, message: string, now: number): Promise<void>
  compensated(operation: ApprovalOperation, message: string, now: number): Promise<void>
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function coordinateVerificationApproval(deps: ApprovalCoordinatorDependencies, input: { verificationId: string; actorUid: string; attemptId: string; ipAddress: string; now?: () => number }) {
  const now = (input.now || Date.now)()
  const claim = await deps.claim({ ...input, now })
  if (claim.outcome === "completed") return { outcome: "completed" as const, idempotent: true }
  if (claim.outcome === "conflict" || !claim.operation) throw Object.assign(new Error("Verification is already being reviewed by another operation."), { status: 409 })
  const operation = claim.operation
  let authChanged = false

  if (operation.newEmail && operation.newEmail.toLowerCase() !== operation.oldEmail?.toLowerCase()) {
    try {
      const current = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
      const intended = operation.newEmail.trim().toLowerCase()
      const oldEmail = operation.oldEmail ? operation.oldEmail.trim().toLowerCase() : undefined

      if (current === intended) {
        if (deps.authSucceeded) await deps.authSucceeded(operation, now)
      } else {
        if (oldEmail && current !== oldEmail) {
          await deps.reconciliationRequired(operation, "Firebase Auth email matches neither the recorded source nor intended value.", now)
          throw Object.assign(new Error("Identity state changed outside this operation; reconciliation is required."), { status: 409 })
        }
        if (deps.beginAuthMutation) {
          await deps.beginAuthMutation(operation, now)
        }
        try {
          await deps.updateAuthEmail(operation.residentId, intended)
          authChanged = true
          if (deps.authSucceeded) await deps.authSucceeded(operation, now)
        } catch (authError: any) {
          try {
            const rechecked = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
            if (rechecked === intended) {
              authChanged = true
              if (deps.authSucceeded) await deps.authSucceeded(operation, now)
            } else {
              await deps.authFailed(operation, failure(authError), now)
              throw Object.assign(new Error("Firebase Auth email update failed; verification was not approved."), { status: 502, cause: authError })
            }
          } catch (verifyErr: any) {
            if (verifyErr?.status === 502) throw verifyErr
            await deps.reconciliationRequired(operation, "Ambiguous Auth status: " + failure(authError), now)
            throw Object.assign(new Error("Firebase Auth status ambiguous; reconciliation required."), { status: 503, cause: authError })
          }
        }
      }
    } catch (error: any) {
      if (error?.status === 409 || error?.status === 502 || error?.status === 503) throw error
      await deps.authFailed(operation, failure(error), now)
      throw Object.assign(new Error("Firebase Auth email update failed; verification was not approved."), { status: 502, cause: error })
    }
  }

  try {
    await deps.complete(operation, now)
    return { outcome: "completed" as const, idempotent: false }
  } catch (error: any) {
    if (authChanged && operation.oldEmail) {
      try {
        const canCompensate = deps.beginCompensation
          ? await deps.beginCompensation(operation, failure(error), now)
          : await deps.owns(operation)

        if (!canCompensate) {
          throw Object.assign(new Error("Approval ownership changed; stale attempt will not compensate Firebase Auth."), { status: 409 })
        }
        const current = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
        if (current !== operation.newEmail?.trim().toLowerCase()) {
          throw Object.assign(new Error("Firebase Auth identity changed after this attempt; automatic compensation is unsafe."), { status: 409 })
        }
        await deps.updateAuthEmail(operation.residentId, operation.oldEmail)
        await deps.compensated(operation, failure(error), now)
        throw Object.assign(new Error("Approval storage failed; Auth email was restored. Retry the approval."), { status: 503, cause: error })
      } catch (compensationError: any) {
        if (compensationError?.status === 503 || compensationError?.status === 409) throw compensationError
        await deps.reconciliationRequired(operation, failure(compensationError), now)
        throw Object.assign(new Error("Approval is incomplete and requires reconciliation before retry."), { status: 503, cause: compensationError })
      }
    }
    await deps.reconciliationRequired(operation, failure(error), now)
    throw Object.assign(new Error("Approval storage failed; no completed approval was recorded."), { status: 503, cause: error })
  }
}
