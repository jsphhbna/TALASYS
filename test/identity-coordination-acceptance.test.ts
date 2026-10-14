import test from "node:test"
import assert from "node:assert/strict"
import { coordinateIdentityEmailUpdate, type IdentityEmailDependencies, type IdentityEmailOperation } from "../lib/admin/identity-email-operation.ts"
import { coordinateVerificationApproval, type ApprovalCoordinatorDependencies } from "../lib/admin/verification-approval.ts"
import { reconcileResidentIdentity, type ReconcileIdentityDependencies } from "../lib/admin/identity-reconciliation.ts"

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
    if (residentLock && ["claimed", "auth-mutating", "auth-completed", "compensating"].includes(residentLock.status)) {
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
  const activeStages = ["claimed", "auth-pending", "auth-mutating", "auth-completed", "compensating", "reconciliation-required"]
  const currentAttempt = "attempt-1"

  for (const stage of activeStages) {
    const lockStatus = stage

    const deps: IdentityEmailDependencies = {
      async claim({ attemptId }) {
        if (["claimed", "auth-pending", "auth-mutating", "auth-completed", "compensating", "reconciliation-required"].includes(lockStatus)) {
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
