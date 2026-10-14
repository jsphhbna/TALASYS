/**
 * Canonical Identity Coordination Policy
 * 
 * Defines the shared state machine, in-flight protections, and recovery eligibility
 * for all TALASYS identity writers (resident email updates, verification approvals,
 * and administrative reconciliations).
 */

export type IdentityLockStatus =
  | "claimed"
  | "auth-pending"
  | "auth-mutating"
  | "auth-completed"
  | "auth-failed"
  | "compensating"
  | "compensated"
  | "reconciling"
  | "reconciliation-required"
  | "completed"

/**
 * Stages where external side-effects (Auth mutations, Firestore transactions)
 * or active coordination are currently executing.
 * 
 * NO other operation, attempt, retry, or reconciler may replace or acquire
 * a lock while it is in any of these stages.
 */
export const IN_FLIGHT_IDENTITY_STAGES: readonly IdentityLockStatus[] = [
  "claimed",
  "auth-pending",
  "auth-mutating",
  "auth-completed",
  "compensating",
  "reconciling",
] as const

/**
 * All active stages where the resident lock is unavailable for new operations.
 * Includes both in-flight execution and stranded reconciliation-required states.
 */
export const ACTIVE_LOCKED_STAGES: readonly IdentityLockStatus[] = [
  ...IN_FLIGHT_IDENTITY_STAGES,
  "reconciliation-required",
] as const

/**
 * Stages where external mutations have completely quiesced and administrative
 * recovery may safely be initiated.
 */
export const RECONCILABLE_STAGES: readonly IdentityLockStatus[] = [
  "reconciliation-required",
  "compensated",
  "auth-failed",
] as const

export interface ExistingLockState {
  operationId?: string | null
  attemptId?: string | null
  status?: string | null
  residentId?: string | null
  verificationId?: string | null
  updatedAt?: number | null
  [key: string]: unknown
}

export interface ExistingOperationState {
  id?: string | null
  attemptId?: string | null
  status?: string | null
  residentId?: string | null
  newEmail?: string | null
  oldEmail?: string | null
  profileUpdates?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface ClaimEvaluationInput {
  operationId: string
  attemptId: string
  residentId: string
  newEmail?: string
  profileUpdates?: Record<string, unknown>
}

export type ClaimEvaluationResult =
  | { outcome: "claimed" }
  | { outcome: "completed"; idempotent: true }
  | { outcome: "conflict"; reason: string; status: 409 }
  | { outcome: "reconciliation-required"; reason: string; status: 409; requiresReconciliation: true }

/**
 * Canonically evaluates whether an incoming claim request may proceed, is an idempotent
 * retrieval of a completed operation, conflicts with an active execution, or requires
 * operator reconciliation.
 * 
 * Enforces:
 * 1. Reconciliation-required blocks all normal writers and retries until resolved.
 * 2. In-flight stages block different operations, different attempts, and simultaneous executions of the same attempt.
 * 3. Completed operations return idempotent success for matching input.
 * 4. Quiesced terminal states (completed, compensated, auth-failed) permit new operations.
 */
export function evaluateIdentityClaim(
  existingLock: ExistingLockState | null | undefined,
  existingOperation: ExistingOperationState | null | undefined,
  incoming: ClaimEvaluationInput
): ClaimEvaluationResult {
  // 1. Idempotent check on existing operation document
  if (existingOperation?.status === "completed") {
    return { outcome: "completed", idempotent: true }
  }

  // 2. Lock state evaluations
  if (existingLock) {
    const lockStatus = existingLock.status as IdentityLockStatus

    // Reconciliation-required lock: hard block until administrator reconciles
    if (lockStatus === "reconciliation-required") {
      return {
        outcome: "reconciliation-required",
        reason: "Identity operation requires administrative reconciliation before retry.",
        status: 409,
        requiresReconciliation: true,
      }
    }

    // Active lock (in-flight or reconciling)
    if (ACTIVE_LOCKED_STAGES.includes(lockStatus)) {
      // Case A: Different operation holds resident lock
      if (existingLock.operationId !== incoming.operationId) {
        return {
          outcome: "conflict",
          reason: `Resident identity is actively locked by operation '${existingLock.operationId}' in stage '${lockStatus}'.`,
          status: 409,
        }
      }

      // Case B: Same operation, but DIFFERENT attempt
      if (existingLock.attemptId !== incoming.attemptId) {
        return {
          outcome: "conflict",
          reason: `Identity operation '${incoming.operationId}' is actively owned by attempt '${existingLock.attemptId}' in stage '${lockStatus}'.`,
          status: 409,
        }
      }

      // Case C: Same operation, SAME attempt, but currently in-flight!
      // This prevents simultaneous requests sharing operationId & attemptId from starting overlapping external mutations.
      if (IN_FLIGHT_IDENTITY_STAGES.includes(lockStatus)) {
        return {
          outcome: "conflict",
          reason: `Attempt '${incoming.attemptId}' is already actively executing in stage '${lockStatus}'. Simultaneous execution is blocked.`,
          status: 409,
        }
      }
    }

    // Completed lock: if it's the same operation, idempotent
    if (lockStatus === "completed" && existingLock.operationId === incoming.operationId) {
      return { outcome: "completed", idempotent: true }
    }
  }

  // 3. Existing operation in-flight check
  if (existingOperation) {
    const opStatus = existingOperation.status as IdentityLockStatus
    if (ACTIVE_LOCKED_STAGES.includes(opStatus)) {
      if (existingOperation.attemptId !== incoming.attemptId) {
        return {
          outcome: "conflict",
          reason: `Operation record is actively owned by attempt '${existingOperation.attemptId}'.`,
          status: 409,
        }
      }
      if (IN_FLIGHT_IDENTITY_STAGES.includes(opStatus)) {
        return {
          outcome: "conflict",
          reason: `Operation attempt '${incoming.attemptId}' is already in-flight in stage '${opStatus}'.`,
          status: 409,
        }
      }
    }
  }

  return { outcome: "claimed" }
}

export interface RecoveryEligibilityInput {
  expectedOperationId?: string
  expectedAttemptId?: string
  forceRecover?: boolean
}

export type RecoveryEligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string; status: 400 | 409 }

/**
 * Canonically evaluates whether a resident lock is eligible for operator reconciliation.
 * 
 * Enforces:
 * 1. Lock cannot be reconciled if another reconciler is actively running ("reconciling").
 * 2. In-flight operations cannot be reconciled without explicit operator verification of quiescence (forceRecover).
 * 3. Lock cannot be reconciled if expected operation or attempt IDs do not match (anti-stomp binding).
 */
export function evaluateRecoveryEligibility(
  existingLock: ExistingLockState | null | undefined,
  input: RecoveryEligibilityInput
): RecoveryEligibilityResult {
  if (!existingLock) {
    // No lock exists — operator may initialize/reconcile drifted profile
    return { eligible: true }
  }

  const lockStatus = existingLock.status as IdentityLockStatus

  // Another reconciler is actively running
  if (lockStatus === "reconciling") {
    return {
      eligible: false,
      reason: `Another administrator is actively reconciling this resident (attempt '${existingLock.attemptId}').`,
      status: 409,
    }
  }

  // Operation is currently in-flight
  if (IN_FLIGHT_IDENTITY_STAGES.includes(lockStatus)) {
    if (!input.forceRecover) {
      return {
        eligible: false,
        reason: `Cannot reconcile: lock is in active in-flight stage '${lockStatus}' with potential pending Auth writes. Wait for operation to complete, fail, or specify force-recovery after confirming external crash.`,
        status: 409,
      }
    }
  }

  // Expected operationId binding
  if (input.expectedOperationId && existingLock.operationId !== input.expectedOperationId) {
    return {
      eligible: false,
      reason: `Reconciliation expected operation ID '${input.expectedOperationId}', but found active operation '${existingLock.operationId}'.`,
      status: 409,
    }
  }

  // Expected attemptId binding
  if (input.expectedAttemptId && existingLock.attemptId !== input.expectedAttemptId) {
    return {
      eligible: false,
      reason: `Reconciliation expected attempt ID '${input.expectedAttemptId}', but found active attempt '${existingLock.attemptId}'.`,
      status: 409,
    }
  }

  return { eligible: true }
}
