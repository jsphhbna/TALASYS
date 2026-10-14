export type IdentityEmailStatus =
  | "claimed"
  | "auth-pending"
  | "auth-mutating"
  | "auth-completed"
  | "auth-failed"
  | "compensating"
  | "compensated"
  | "reconciliation-required"
  | "completed"

export interface IdentityEmailOperation {
  id: string
  residentId: string
  actorUid: string
  actorName: string
  attemptId: string
  oldEmail: string
  newEmail: string
  profileUpdates: Record<string, unknown>
  status: IdentityEmailStatus
}

export interface IdentityEmailDependencies {
  claim(input: {
    operationId: string
    residentId: string
    newEmail: string
    profileUpdates: Record<string, unknown>
    actorUid: string
    attemptId: string
    ipAddress: string
    now: number
  }): Promise<{ outcome: "claimed" | "completed" | "conflict" | "reconciliation-required"; operation?: IdentityEmailOperation }>
  getAuthEmail(uid: string): Promise<string | undefined>
  updateAuthEmail(uid: string, email: string): Promise<void>
  owns(operation: IdentityEmailOperation): Promise<boolean>
  beginAuthMutation?(operation: IdentityEmailOperation, now: number): Promise<void>
  authSucceeded?(operation: IdentityEmailOperation, now: number): Promise<void>
  beginCompensation?(operation: IdentityEmailOperation, message: string, now: number): Promise<boolean>
  complete(operation: IdentityEmailOperation, now: number): Promise<void>
  authFailed(operation: IdentityEmailOperation, message: string, now: number): Promise<void>
  compensated(operation: IdentityEmailOperation, message: string, now: number): Promise<void>
  reconciliationRequired(operation: IdentityEmailOperation, message: string, now: number): Promise<void>
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function coordinateIdentityEmailUpdate(deps: IdentityEmailDependencies, input: {
  operationId: string
  residentId: string
  newEmail: string
  profileUpdates?: Record<string, unknown>
  actorUid: string
  attemptId: string
  ipAddress: string
  now?: () => number
}) {
  const now = (input.now || Date.now)()
  const claim = await deps.claim({ ...input, profileUpdates: input.profileUpdates || {}, now })
  if (claim.outcome === "completed") return { outcome: "completed" as const, idempotent: true }
  if (claim.outcome === "reconciliation-required") {
    throw Object.assign(new Error("Identity state requires reconciliation before retry."), { status: 409, requiresReconciliation: true, residentId: input.residentId })
  }
  if (claim.outcome === "conflict" || !claim.operation) {
    throw Object.assign(new Error("Another identity operation currently owns this resident."), { status: 409 })
  }
  const operation = claim.operation
  let authChanged = false

  try {
    const current = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
    const targetEmail = operation.newEmail.trim().toLowerCase()
    const expectedOldEmail = operation.oldEmail.trim().toLowerCase()

    if (current === targetEmail) {
      if (deps.authSucceeded) await deps.authSucceeded(operation, now)
    } else {
      if (current !== expectedOldEmail) {
        await deps.reconciliationRequired(operation, "Firebase Auth email matches neither the recorded source nor intended value.", now)
        throw Object.assign(new Error("Identity state changed outside this operation; reconciliation is required."), { status: 409 })
      }
      if (deps.beginAuthMutation) {
        await deps.beginAuthMutation(operation, now)
      }
      try {
        await deps.updateAuthEmail(operation.residentId, targetEmail)
        authChanged = true
        if (deps.authSucceeded) await deps.authSucceeded(operation, now)
      } catch (authError: any) {
        try {
          const rechecked = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
          if (rechecked === targetEmail) {
            authChanged = true
            if (deps.authSucceeded) await deps.authSucceeded(operation, now)
          } else {
            await deps.authFailed(operation, failure(authError), now)
            throw Object.assign(new Error("Firebase Auth email update failed; no Firestore profile change was committed."), { status: 502, cause: authError })
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
    throw Object.assign(new Error("Firebase Auth email update failed; no Firestore profile change was committed."), { status: 502, cause: error })
  }

  try {
    await deps.complete(operation, now)
    return { outcome: "completed" as const, idempotent: false }
  } catch (error: any) {
    if (error?.status === 409) {
      if (!await deps.owns(operation)) throw error
      await deps.reconciliationRequired(operation, failure(error), now)
      throw Object.assign(new Error("Identity state changed while this operation still owned the fence; reconciliation is required."), { status: 503, cause: error })
    }
    if (!authChanged) {
      await deps.reconciliationRequired(operation, failure(error), now)
      throw Object.assign(new Error("Identity update is incomplete and requires reconciliation before retry."), { status: 503, cause: error })
    }

    try {
      const canCompensate = deps.beginCompensation
        ? await deps.beginCompensation(operation, failure(error), now)
        : await deps.owns(operation)

      if (!canCompensate) {
        throw Object.assign(new Error("Operation ownership changed; stale attempt will not compensate Firebase Auth."), { status: 409 })
      }
      const current = (await deps.getAuthEmail(operation.residentId))?.trim().toLowerCase()
      if (current !== operation.newEmail.trim().toLowerCase()) {
        throw Object.assign(new Error("Firebase Auth changed after this attempt; automatic compensation is unsafe."), { status: 409 })
      }
      await deps.updateAuthEmail(operation.residentId, operation.oldEmail)
      await deps.compensated(operation, failure(error), now)
    } catch (compensationError: any) {
      if (compensationError?.status === 409) throw compensationError
      await deps.reconciliationRequired(operation, failure(compensationError), now)
      throw Object.assign(new Error("Identity update is incomplete and requires reconciliation before retry."), { status: 503, cause: compensationError })
    }
    throw Object.assign(new Error("Profile commit failed; Firebase Auth was restored. Retry with the same operation ID."), { status: 503, cause: error })
  }
}
