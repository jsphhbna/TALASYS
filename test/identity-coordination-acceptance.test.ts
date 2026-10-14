import test from "node:test"
import assert from "node:assert/strict"
import { coordinateIdentityEmailUpdate, type IdentityEmailDependencies, type IdentityEmailOperation } from "../lib/admin/identity-email-operation.ts"
import { coordinateVerificationApproval, type ApprovalCoordinatorDependencies } from "../lib/admin/verification-approval.ts"
import { reconcileResidentIdentity, type ReconcileIdentityDependencies } from "../lib/admin/identity-reconciliation.ts"
import { evaluateRecoveryEligibility, evaluateIdentityClaim, IN_FLIGHT_IDENTITY_STAGES } from "../lib/admin/identity-coordination-policy.ts"

test("A loses ownership between ownership check and Auth write", async () => {
  let authEmail = "old@example.test"
  let activeOwner = "attemptA"

  const operationA: IdentityEmailOperation = {
    id: "opA",
    residentId: "res1",
    actorUid: "admin1",
    actorName: "Admin",
    attemptId: "attemptA",
    oldEmail: "old@example.test",
    newEmail: "new@example.test",
    profileUpdates: {},
    status: "claimed",
  }

  const deps: IdentityEmailDependencies = {
    async claim() { return { outcome: "claimed", operation: operationA } },
    async getAuthEmail() { return authEmail },
    async owns(op) { return activeOwner === op.attemptId },
    async beginAuthMutation(op) {
      // Simulate ownership loss right before Auth mutation
      if (activeOwner !== op.attemptId) {
        throw Object.assign(new Error("Stale identity attempt cannot advance to Auth mutation."), { status: 409 })
      }
    },
    async updateAuthEmail(_uid, email) {
      if (activeOwner !== "attemptA") {
        throw new Error("Stale attempt must never write to Auth!")
      }
      authEmail = email
    },
    async complete() {},
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  // Active owner changes to attemptB before Auth mutation begins
  activeOwner = "attemptB"

  await assert.rejects(
    coordinateIdentityEmailUpdate(deps, {
      operationId: "opA",
      residentId: "res1",
      newEmail: "new@example.test",
      actorUid: "admin1",
      attemptId: "attemptA",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409
  )

  // Auth email remains untouched at old value
  assert.equal(authEmail, "old@example.test")
})

test("Approval and general email editing race on the same resident", async () => {
  let residentLock: { operationId: string; attemptId: string; status: string } | null = null

  // Shared resident lock boundary
  function claimResidentLock(operationId: string, attemptId: string) {
    if (residentLock && ["claimed", "auth-pending", "auth-mutating", "auth-completed", "compensating", "reconciling"].includes(residentLock.status)) {
      if (residentLock.operationId !== operationId) return { outcome: "conflict" as const }
    }
    residentLock = { operationId, attemptId, status: "claimed" }
    return { outcome: "claimed" as const }
  }

  const emailDeps: IdentityEmailDependencies = {
    async claim({ operationId, attemptId }) {
      const res = claimResidentLock(operationId, attemptId)
      if (res.outcome === "conflict") return { outcome: "conflict" }
      return {
        outcome: "claimed",
        operation: {
          id: operationId,
          residentId: "res100",
          actorUid: "admin1",
          actorName: "Admin",
          attemptId,
          oldEmail: "old@example.test",
          newEmail: "general@example.test",
          profileUpdates: {},
          status: "claimed",
        },
      }
    },
    async getAuthEmail() { return "old@example.test" },
    async updateAuthEmail() {},
    async owns() { return true },
    async complete() { if (residentLock) residentLock.status = "completed" },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  const approvalDeps: ApprovalCoordinatorDependencies = {
    async claim({ verificationId, attemptId }) {
      const approvalOpId = `verification-${verificationId}`
      const res = claimResidentLock(approvalOpId, attemptId)
      if (res.outcome === "conflict") return { outcome: "conflict" }
      return {
        outcome: "claimed",
        operation: {
          id: verificationId,
          verificationId,
          residentId: "res100",
          verificationType: "profile-edit",
          actorUid: "verifier1",
          actorName: "Verifier",
          attemptId,
          oldEmail: "old@example.test",
          newEmail: "approved@example.test",
          profileUpdates: {},
          status: "claimed",
        },
      }
    },
    async getAuthEmail() { return "old@example.test" },
    async updateAuthEmail() {},
    async owns() { return true },
    async complete() { if (residentLock) residentLock.status = "completed" },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  // 1. General email edit claims the resident lock first
  claimResidentLock("general-op-1", "attempt-1")

  // 2. Verification approval tries to run concurrently on the same resident
  await assert.rejects(
    coordinateVerificationApproval(approvalDeps, {
      verificationId: "verif-1",
      actorUid: "verifier1",
      attemptId: "verif-attempt-1",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409
  )

  // 3. Reset lock to completed
  residentLock = { operationId: "general-op-1", attemptId: "attempt-1", status: "completed" }

  // 4. Now verification approval can claim the resident lock
  const approvalResult = await coordinateVerificationApproval(approvalDeps, {
    verificationId: "verif-2",
    actorUid: "verifier1",
    attemptId: "verif-attempt-2",
    ipAddress: "127.0.0.1",
  })
  assert.equal(approvalResult.outcome, "completed")

  // 5. While approval is active (simulate active status), general email edit is rejected
  residentLock = { operationId: "verification-verif-3", attemptId: "verif-attempt-3", status: "auth-mutating" }
  await assert.rejects(
    coordinateIdentityEmailUpdate(emailDeps, {
      operationId: "general-op-2",
      residentId: "res100",
      newEmail: "general2@example.test",
      actorUid: "admin1",
      attemptId: "attempt-2",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409
  )
})

test("Two retries race on the same operation: all active stages reject competing attempt", async () => {
  const activeStages = ["claimed", "auth-pending", "auth-mutating", "auth-completed", "compensating", "reconciling", "reconciliation-required"]
  const currentAttempt = "attempt-1"

  for (const stage of activeStages) {
    const lockStatus = stage

    const deps: IdentityEmailDependencies = {
      async claim({ attemptId }) {
        if (["claimed", "auth-pending", "auth-mutating", "auth-completed", "compensating", "reconciling", "reconciliation-required"].includes(lockStatus)) {
          if (lockStatus === "reconciliation-required") {
            throw Object.assign(new Error("Identity operation requires reconciliation"), { status: 409, requiresReconciliation: true })
          }
          if (attemptId !== currentAttempt) {
            return { outcome: "conflict" }
          }
        }
        return {
          outcome: "claimed",
          operation: {
            id: "op-retry",
            residentId: "res1",
            actorUid: "admin1",
            actorName: "Admin",
            attemptId,
            oldEmail: "old@example.test",
            newEmail: "new@example.test",
            profileUpdates: {},
            status: "claimed",
          },
        }
      },
      async getAuthEmail() { return "old@example.test" },
      async beginAuthMutation() {},
      async updateAuthEmail() {},
      async owns() { return true },
      async complete() {},
      async authFailed() {},
      async compensated() {},
      async reconciliationRequired() {},
    }

    // Attempt 2 arrives while Attempt 1 is in active stage
    await assert.rejects(
      coordinateIdentityEmailUpdate(deps, {
        operationId: "op-retry",
        residentId: "res1",
        newEmail: "new@example.test",
        actorUid: "admin1",
        attemptId: "attempt-2",
        ipAddress: "127.0.0.1",
      }),
      (err: any) => err.status === 409,
      `Expected competing attempt to be rejected during stage: ${stage}`
    )
  }
})

test("Auth succeeds but its response is lost", async () => {
  let authEmail = "old@example.test"
  let completed = false

  const deps: IdentityEmailDependencies = {
    async claim() {
      return {
        outcome: "claimed",
        operation: {
          id: "op-lost",
          residentId: "res1",
          actorUid: "admin1",
          actorName: "Admin",
          attemptId: "att-1",
          oldEmail: "old@example.test",
          newEmail: "new@example.test",
          profileUpdates: {},
          status: "claimed",
        },
      }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) {
      // Side effect succeeds on provider
      authEmail = email
      // But network connection drops before response returns to caller
      throw new Error("ECONNRESET: Connection dropped")
    },
    async owns() { return true },
    async complete() { completed = true },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  // Coordinator re-verifies Auth state, recognizes the update succeeded, and completes Firestore
  const result = await coordinateIdentityEmailUpdate(deps, {
    operationId: "op-lost",
    residentId: "res1",
    newEmail: "new@example.test",
    actorUid: "admin1",
    attemptId: "att-1",
    ipAddress: "127.0.0.1",
  })

  assert.equal(result.outcome, "completed")
  assert.equal(authEmail, "new@example.test")
  assert.equal(completed, true)
})

test("Firestore completion fails after Auth succeeds", async () => {
  let authEmail = "old@example.test"
  let lockStatus = "claimed"
  let compensationAttempted = false

  const deps: IdentityEmailDependencies = {
    async claim() {
      return {
        outcome: "claimed",
        operation: {
          id: "op-fail",
          residentId: "res1",
          actorUid: "admin1",
          actorName: "Admin",
          attemptId: "att-fail",
          oldEmail: "old@example.test",
          newEmail: "new@example.test",
          profileUpdates: {},
          status: "claimed",
        },
      }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) { authEmail = email },
    async beginCompensation() {
      compensationAttempted = true
      lockStatus = "compensating"
      return true
    },
    async owns() { return true },
    async complete() {
      throw new Error("Firestore transient storage failure")
    },
    async authFailed() {},
    async compensated() {
      lockStatus = "compensated"
    },
    async reconciliationRequired() {
      lockStatus = "reconciliation-required"
    },
  }

  await assert.rejects(
    coordinateIdentityEmailUpdate(deps, {
      operationId: "op-fail",
      residentId: "res1",
      newEmail: "new@example.test",
      actorUid: "admin1",
      attemptId: "att-fail",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 503
  )

  assert.equal(compensationAttempted, true)
  assert.equal(authEmail, "old@example.test")
  assert.equal(lockStatus, "compensated")
})

test("An old attempt resumes after recovery", async () => {
  const activeAttempt: string = "att-2" // Recovery promoted attempt 2

  const operation1: IdentityEmailOperation = {
    id: "op-stale",
    residentId: "res1",
    actorUid: "admin1",
    actorName: "Admin",
    attemptId: "att-1", // Stale attempt
    oldEmail: "old@example.test",
    newEmail: "new@example.test",
    profileUpdates: {},
    status: "claimed",
  }

  const deps: IdentityEmailDependencies = {
    async claim() { return { outcome: "claimed", operation: operation1 } },
    async getAuthEmail() { return "new@example.test" },
    async updateAuthEmail() {
      if (activeAttempt !== "att-1") throw new Error("Stale attempt must never write Auth")
    },
    async owns(op) { return activeAttempt === op.attemptId },
    async complete(op) {
      if (activeAttempt !== op.attemptId) {
        throw Object.assign(new Error("Identity operation fence changed."), { status: 409 })
      }
    },
    async beginCompensation(op) {
      return activeAttempt === op.attemptId
    },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  await assert.rejects(
    coordinateIdentityEmailUpdate(deps, {
      operationId: "op-stale",
      residentId: "res1",
      newEmail: "new@example.test",
      actorUid: "admin1",
      attemptId: "att-1",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409
  )
})

test("An unresolved attempt cannot silently block forever: operator recovery", async () => {
  let authEmail = "drifted@example.test"
  let firestoreEmail = "original@example.test"
  let lockData: any = { status: "reconciliation-required", residentId: "res-blocked" }
  const logs: any[] = []

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Super Admin" }) }
              }
              if (name === "users" && id === "res-blocked") {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === "res-blocked") {
                return { exists: true, data: () => ({ ...lockData }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) { return ref.get() },
        update(_ref: any, data: any) {
          if (data.email) firestoreEmail = data.email
          if (data.status) lockData.status = data.status
        },
        set(ref: any, data: any) {
          if (ref.id === "res-blocked" || data.residentId === "res-blocked") {
            lockData = { ...lockData, ...data }
          }
          if (data.action) logs.push(data)
        },
      }
      return fn(transaction)
    },
  }

  const reconciliationDeps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() { return { email: authEmail } },
      async updateUser(_uid, props) { authEmail = props.email },
    },
    db: mockDb,
  }

  // Operator chooses sync-auth-to-firestore
  const result = await reconcileResidentIdentity(reconciliationDeps, {
    residentId: "res-blocked",
    action: "sync-auth-to-firestore",
    actorUid: "admin-user",
  })

  assert.equal(result.success, true)
  assert.equal(firestoreEmail, "drifted@example.test")
  assert.equal(authEmail, "drifted@example.test")
  assert.equal(lockData.status, "completed")
  assert.equal(logs.length, 1)
  assert.equal(logs[0].authoritative, true)
})

test("Completed outcome has matching Auth and Firestore identity values", async () => {
  let authEmail = "old@example.test"
  let firestoreEmail = "old@example.test"

  const deps: IdentityEmailDependencies = {
    async claim() {
      return {
        outcome: "claimed",
        operation: {
          id: "op-match",
          residentId: "res-match",
          actorUid: "admin1",
          actorName: "Admin",
          attemptId: "att-match",
          oldEmail: "old@example.test",
          newEmail: "matched@example.test",
          profileUpdates: {},
          status: "claimed",
        },
      }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) { authEmail = email },
    async owns() { return true },
    async complete(op) { firestoreEmail = op.newEmail },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  const result = await coordinateIdentityEmailUpdate(deps, {
    operationId: "op-match",
    residentId: "res-match",
    newEmail: "matched@example.test",
    actorUid: "admin1",
    attemptId: "att-match",
    ipAddress: "127.0.0.1",
  })

  assert.equal(result.outcome, "completed")
  assert.equal(authEmail, "matched@example.test")
  assert.equal(firestoreEmail, "matched@example.test")
  assert.equal(authEmail, firestoreEmail)
})

test("Unresolved outcomes are explicitly marked incomplete and recoverable", async () => {
  const deps: IdentityEmailDependencies = {
    async claim() {
      return { outcome: "reconciliation-required" }
    },
    async getAuthEmail() { return "old@example.test" },
    async updateAuthEmail() {},
    async owns() { return true },
    async complete() {},
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  await assert.rejects(
    coordinateIdentityEmailUpdate(deps, {
      operationId: "op-unresolved",
      residentId: "res-unresolved",
      newEmail: "new@example.test",
      actorUid: "admin1",
      attemptId: "att-1",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409 && err.requiresReconciliation === true
  )
})

test("Notifications and authoritative audit events are not duplicated on retry", async () => {
  let auditLogsCreated = 0

  const deps: IdentityEmailDependencies = {
    async claim() {
      // Operation was already completed
      return { outcome: "completed" }
    },
    async getAuthEmail() { return "completed@example.test" },
    async updateAuthEmail() {},
    async owns() { return true },
    async complete() { auditLogsCreated++ },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  const result = await coordinateIdentityEmailUpdate(deps, {
    operationId: "op-completed",
    residentId: "res-completed",
    newEmail: "completed@example.test",
    actorUid: "admin1",
    attemptId: "att-retry",
    ipAddress: "127.0.0.1",
  })

  assert.equal(result.outcome, "completed")
  assert.equal(result.idempotent, true)
  assert.equal(auditLogsCreated, 0)
})

test("Blocker 1 Unit: Auth-mutating lock with only { forceRecover: true } is rejected", () => {
  const lock = {
    residentId: "res-b1",
    operationId: "op-b1",
    attemptId: "att-b1",
    status: "auth-mutating",
    updatedAt: Date.now(),
  }

  // 1. Boolean-only forceRecover is strictly rejected
  const resBoolOnly = evaluateRecoveryEligibility(lock, { forceRecover: true })
  assert.equal(resBoolOnly.eligible, false)
  assert.equal(resBoolOnly.status, 409)
  assert.match(resBoolOnly.reason, /expectedOperationId and expectedAttemptId fencing are required/)

  // 2. Missing attempt ID is rejected
  const resMissingAttempt = evaluateRecoveryEligibility(lock, { forceRecover: true, expectedOperationId: "op-b1" })
  assert.equal(resMissingAttempt.eligible, false)
  assert.equal(resMissingAttempt.status, 409)
  assert.match(resMissingAttempt.reason, /expectedOperationId and expectedAttemptId fencing are required/)

  // 3. Mismatched operation ID is rejected
  const resWrongOp = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-wrong",
    expectedAttemptId: "att-b1",
    externalWriteStopped: true,
  })
  assert.equal(resWrongOp.eligible, false)
  assert.equal(resWrongOp.status, 409)
  assert.match(resWrongOp.reason, /Reconciliation expected operation ID 'op-wrong'/)

  // 4. Mismatched attempt ID is rejected
  const resWrongAtt = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-wrong",
    externalWriteStopped: true,
  })
  assert.equal(resWrongAtt.eligible, false)
  assert.equal(resWrongAtt.status, 409)
  assert.match(resWrongAtt.reason, /Reconciliation expected attempt ID 'att-wrong'/)

  // 5. Correct IDs but missing stopped/stale evidence is rejected
  const resNoEvidence = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
  })
  assert.equal(resNoEvidence.eligible, false)
  assert.equal(resNoEvidence.status, 409)
  assert.match(resNoEvidence.reason, /evidence that the external write has stopped, failed, or is safely stale is required/)

  // 6. Correct IDs + externalWriteStopped: true is allowed
  const resWithStopped = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
    externalWriteStopped: true,
  })
  assert.equal(resWithStopped.eligible, true)

  // 7. Correct IDs + externalWriteStatus: 'stopped' is allowed
  const resWithStatus = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
    externalWriteStatus: "stopped",
  })
  assert.equal(resWithStatus.eligible, true)

  // 8. Correct IDs + quiescenceEvidence is allowed
  const resWithEvidence = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
    quiescenceEvidence: "pod terminated after crash",
  })
  assert.equal(resWithEvidence.eligible, true)

  // 9. Correct IDs + isStale is allowed
  const resWithStale = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
    isStale: true,
  })
  assert.equal(resWithStale.eligible, true)

  // 10. Correct IDs + staleTimeoutMs threshold exceeded is allowed
  const resWithTimeout = evaluateRecoveryEligibility(lock, {
    forceRecover: true,
    expectedOperationId: "op-b1",
    expectedAttemptId: "att-b1",
    staleTimeoutMs: 1000,
    now: lock.updatedAt + 5000,
  })
  assert.equal(resWithTimeout.eligible, true)
})

test("Blocker 1 Unit: Same-attempt simultaneous execution is blocked across all six in-flight stages", () => {
  for (const stage of IN_FLIGHT_IDENTITY_STAGES) {
    const existingLock = {
      operationId: "op-same",
      attemptId: "att-same",
      status: stage,
      residentId: "res-same",
    }
    const incoming = {
      operationId: "op-same",
      attemptId: "att-same",
      residentId: "res-same",
    }
    const result = evaluateIdentityClaim(existingLock, null, incoming)
    assert.equal(result.outcome, "conflict", `Stage '${stage}' must block identical operationId & attemptId simultaneous execution`)
    if (result.outcome === "conflict") {
      assert.equal(result.status, 409)
      assert.match(result.reason, /Simultaneous execution is blocked/)
    }
  }
})

test("Blocker 2 Unit: Email-only recovery resolves verificationApprovalOperations to 'reconciled', leaves verification pending, and allows pending approval retry to claim", async () => {
  const residentId = "res-unit-b2"
  const verifId = "verif-unit-b2"
  const originalAttemptId = "att-unit-b2-old"

  let firestoreEmail = "initial-unit-b2@example.test"
  let verificationState: any = {
    status: "processing",
    processingOperationId: verifId,
    processingAttemptId: originalAttemptId,
  }
  let approvalOpState: any = {
    id: verifId,
    verificationId: verifId,
    residentId,
    attemptId: originalAttemptId,
    status: "claimed",
  }
  let lockState: any = {
    residentId,
    status: "reconciliation-required",
    operationId: `verification-${verifId}`,
    attemptId: originalAttemptId,
    verificationId: verifId,
    operationType: "verification-approval",
  }

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            collectionName: name,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Super Admin" }) }
              }
              if (name === "users" && id === residentId) {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === residentId) {
                return { exists: true, data: () => ({ ...lockState }) }
              }
              if (name === "verifications" && id === verifId) {
                return { exists: true, data: () => ({ ...verificationState }) }
              }
              if (name === "verificationApprovalOperations" && id === verifId) {
                return { exists: true, data: () => ({ ...approvalOpState }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) { return ref.get() },
        update(ref: any, data: any) {
          if (ref.collectionName === "users" && data.email) firestoreEmail = data.email
          if (ref.collectionName === "verifications") verificationState = { ...verificationState, ...data }
          if (ref.collectionName === "verificationApprovalOperations") approvalOpState = { ...approvalOpState, ...data }
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
        set(ref: any, data: any) {
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
          if (ref.collectionName === "verificationApprovalOperations") approvalOpState = { ...approvalOpState, ...data }
        },
      }
      return fn(transaction)
    },
  }

  const reconDeps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() { return { email: "initial-unit-b2@example.test" } },
      async updateUser() {},
    },
    db: mockDb,
  }

  // Execute email reconciliation
  const result = await reconcileResidentIdentity(reconDeps, {
    residentId,
    action: "sync-auth-to-firestore",
    actorUid: "admin-user",
  })
  assert.equal(result.success, true)

  // 1. Verification must remain pending (processing fences cleared)
  assert.equal(verificationState.status, "pending")
  assert.equal(verificationState.processingOperationId, null)
  assert.equal(verificationState.processingAttemptId, null)

  // 2. Operation record in verificationApprovalOperations must be transitioned to 'reconciled'
  assert.equal(approvalOpState.status, "reconciled")

  // 3. Resident lock operationId must be reconcile-... and NOT verification-verifId
  assert.equal(lockState.status, "completed")
  assert.notEqual(lockState.operationId, `verification-${verifId}`)
  assert.match(lockState.operationId, /^reconcile-/)
  assert.equal(lockState.targetOperationId, `verification-${verifId}`)

  // 4. evaluateIdentityClaim MUST NOT return completed idempotent for pending approval retry!
  const claimPolicyRetry = evaluateIdentityClaim(lockState, approvalOpState, {
    operationId: `verification-${verifId}`,
    attemptId: originalAttemptId,
    residentId,
  })
  assert.equal(claimPolicyRetry.outcome, "claimed", "evaluateIdentityClaim must return claimed, not completed idempotent")

  // 5. evaluateIdentityClaim with a new attempt ID also succeeds
  const claimPolicyNewAttempt = evaluateIdentityClaim(lockState, approvalOpState, {
    operationId: `verification-${verifId}`,
    attemptId: "att-unit-b2-new",
    residentId,
  })
  assert.equal(claimPolicyNewAttempt.outcome, "claimed")
})

test("Recovery Liveness: auth.getUser() throws in Phase 2 -> lock becomes reconciliation-required and subsequent recovery succeeds", async () => {
  const residentId = "res-liveness-auth-lookup"
  let firestoreEmail = "fs-lookup@talasys.test"
  let authEmail = "auth-lookup@talasys.test"
  let shouldAuthLookupFail = true

  let lockState: any = {
    residentId,
    operationId: "op-failed-before",
    attemptId: "att-failed-before",
    status: "reconciliation-required",
    updatedAt: Date.now() - 5000,
  }

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            collectionName: name,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Admin" }) }
              }
              if (name === "users" && id === residentId) {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === residentId) {
                return { exists: true, data: () => ({ ...lockState }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) { return ref.get() },
        update(ref: any, data: any) {
          if (ref.collectionName === "users" && data.email) firestoreEmail = data.email
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
        set(ref: any, data: any) {
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
      }
      return fn(transaction)
    },
  }

  const deps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() {
        if (shouldAuthLookupFail) throw new Error("Auth service unavailable (503)")
        return { email: authEmail }
      },
      async updateUser(_uid, props) { authEmail = props.email },
    },
    db: mockDb,
  }

  // Attempt 1: Auth lookup throws
  await assert.rejects(
    reconcileResidentIdentity(deps, {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: "admin-user",
    }),
    (err: any) => {
      assert.equal(err.status, 502)
      assert.match(err.message, /Firebase Auth lookup failed/)
      return true
    }
  )

  // Critical invariant: Lock must NOT remain stuck in 'reconciling'
  assert.equal(lockState.status, "reconciliation-required", "Lock must transition back to reconciliation-required")
  assert.match(lockState.error, /Firebase Auth lookup failed/)

  // Attempt 2: Subsequent recovery attempt must be able to claim the lock and succeed
  shouldAuthLookupFail = false
  const retryResult = await reconcileResidentIdentity(deps, {
    residentId,
    action: "sync-auth-to-firestore",
    actorUid: "admin-user",
  })
  assert.equal(retryResult.success, true)
  assert.equal(lockState.status, "completed")
  assert.equal(firestoreEmail, authEmail)
})

test("Recovery Liveness: sync-auth-to-firestore with missing Auth email in Phase 2 -> lock becomes reconciliation-required and remains recoverable", async () => {
  const residentId = "res-liveness-empty-auth"
  let firestoreEmail = "fs-empty@talasys.test"
  let authEmail = "" // No Auth email initially

  let lockState: any = {
    residentId,
    operationId: "op-empty-auth-prev",
    attemptId: "att-empty-auth-prev",
    status: "reconciliation-required",
    updatedAt: Date.now() - 5000,
  }

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            collectionName: name,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Admin" }) }
              }
              if (name === "users" && id === residentId) {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === residentId) {
                return { exists: true, data: () => ({ ...lockState }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) { return ref.get() },
        update(ref: any, data: any) {
          if (ref.collectionName === "users" && data.email) firestoreEmail = data.email
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
        set(ref: any, data: any) {
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
      }
      return fn(transaction)
    },
  }

  const deps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() { return { email: authEmail } },
      async updateUser(_uid, props) { authEmail = props.email },
    },
    db: mockDb,
  }

  // Attempt 1: sync-auth-to-firestore finds no Auth email
  await assert.rejects(
    reconcileResidentIdentity(deps, {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: "admin-user",
    }),
    (err: any) => {
      assert.equal(err.status, 400)
      assert.match(err.message, /Target resident has no Auth email to sync from/)
      return true
    }
  )

  // Lock must be in reconciliation-required, NEVER stranded in reconciling
  assert.equal(lockState.status, "reconciliation-required")
  assert.match(lockState.error, /Target resident has no Auth email to sync from/)

  // Attempt 2: Auth user now has an email; subsequent recovery must succeed
  authEmail = "populated-auth@talasys.test"
  const retryResult = await reconcileResidentIdentity(deps, {
    residentId,
    action: "sync-auth-to-firestore",
    actorUid: "admin-user",
  })
  assert.equal(retryResult.success, true)
  assert.equal(lockState.status, "completed")
  assert.equal(firestoreEmail, "populated-auth@talasys.test")
})

test("Recovery Liveness: Owned Phase 3 409 failure cleans up lock to reconciliation-required and subsequent recovery succeeds", async () => {
  const residentId = "res-liveness-phase3-owned409"
  let firestoreEmail = "fs-p3@talasys.test"
  let authEmail = "auth-p3@talasys.test"
  let injectOwnedPhase3Conflict = true
  let phase1Completed = false

  let lockState: any = {
    residentId,
    operationId: "op-phase3-test",
    attemptId: "att-phase3-test",
    status: "reconciliation-required",
    updatedAt: Date.now() - 5000,
  }

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            collectionName: name,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Admin" }) }
              }
              if (name === "users" && id === residentId) {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === residentId) {
                return { exists: true, data: () => ({ ...lockState }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) {
          if (phase1Completed && injectOwnedPhase3Conflict && ref.collectionName === "users" && ref.id === "admin-user") {
            throw Object.assign(new Error("Simulated owned transaction 409 conflict during finalization"), { status: 409 })
          }
          return ref.get()
        },
        update(ref: any, data: any) {
          if (ref.collectionName === "users" && data.email) firestoreEmail = data.email
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
        set(ref: any, data: any) {
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
      }
      const res = await fn(transaction)
      phase1Completed = true
      return res
    },
  }

  const deps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() { return { email: authEmail } },
      async updateUser(_uid, props) { authEmail = props.email },
    },
    db: mockDb,
  }

  // Attempt 1: Phase 3 throws owned 409
  await assert.rejects(
    reconcileResidentIdentity(deps, {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: "admin-user",
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Simulated owned transaction 409 conflict/)
      return true
    }
  )

  // Lock must NOT be stuck in 'reconciling'; cleanup must have transitioned it to 'reconciliation-required'
  assert.equal(lockState.status, "reconciliation-required", "Owned 409 must trigger cleanup and leave reconciliation-required")
  assert.match(lockState.error, /Reconciliation finalization failed/)

  // Attempt 2: Without injected conflict, subsequent recovery succeeds
  injectOwnedPhase3Conflict = false
  phase1Completed = false
  const retryResult = await reconcileResidentIdentity(deps, {
    residentId,
    action: "sync-auth-to-firestore",
    actorUid: "admin-user",
  })
  assert.equal(retryResult.success, true)
  assert.equal(lockState.status, "completed")
  assert.equal(firestoreEmail, authEmail)
})

test("Recovery Liveness: Unowned Phase 3 409 does NOT overwrite newer owner lock", async () => {
  const residentId = "res-liveness-phase3-unowned409"
  let firestoreEmail = "fs-unowned@talasys.test"
  const authEmail = "auth-unowned@talasys.test"

  let lockState: any = {
    residentId,
    operationId: "op-unowned-test",
    attemptId: "att-unowned-test",
    status: "reconciliation-required",
    updatedAt: Date.now() - 5000,
  }

  const mockDb = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            id,
            collectionName: name,
            async get() {
              if (name === "users" && id === "admin-user") {
                return { exists: true, data: () => ({ role: "Full Access", status: "Active", name: "Admin" }) }
              }
              if (name === "users" && id === residentId) {
                return { exists: true, data: () => ({ role: "resident", status: "Active", email: firestoreEmail }) }
              }
              if (name === "identityOperationLocks" && id === residentId) {
                return { exists: true, data: () => ({ ...lockState }) }
              }
              return { exists: false }
            },
          }
        },
      }
    },
    async runTransaction(fn: any) {
      const transaction = {
        async get(ref: any) { return ref.get() },
        update(ref: any, data: any) {
          if (ref.collectionName === "users" && data.email) firestoreEmail = data.email
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
        set(ref: any, data: any) {
          if (ref.collectionName === "identityOperationLocks") lockState = { ...lockState, ...data }
        },
      }
      return fn(transaction)
    },
  }

  const deps: ReconcileIdentityDependencies = {
    auth: {
      async getUser() {
        // Another operator/attempt takes over during Phase 2
        lockState = {
          residentId,
          operationId: "reconcile-res-newer",
          attemptId: "attempt-newer-owner",
          status: "reconciling",
          updatedAt: Date.now(),
        }
        return { email: authEmail }
      },
      async updateUser() { /* no-op */ },
    },
    db: mockDb,
  }

  await assert.rejects(
    reconcileResidentIdentity(deps, {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: "admin-user",
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Reconciliation fence changed/)
      return true
    }
  )

  // Because lock was taken over by attempt-newer-owner, Attempt 1 must NOT overwrite it
  assert.equal(lockState.attemptId, "attempt-newer-owner")
  assert.equal(lockState.status, "reconciling")
})

