import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createIdentityEmailDependencies } from "../../app/api/admin/update-resident-email/route.ts"
import { createFirestoreApprovalDependencies } from "../../app/api/admin/verifications/approve/route.ts"
import { reconcileResidentIdentity } from "../../lib/admin/identity-reconciliation.ts"
import { coordinateIdentityEmailUpdate } from "../../lib/admin/identity-email-operation.ts"
import { coordinateVerificationApproval } from "../../lib/admin/verification-approval.ts"
import { evaluateIdentityClaim } from "../../lib/admin/identity-coordination-policy.ts"
import {
  COLLECTION_USERS,
  COLLECTION_VERIFICATIONS,
  COLLECTION_ACTIVITY_LOGS,
} from "../../lib/constants.ts"

const ADMIN_UID = "admin-coordinator-emulator"
const CALLER_REVOKED_UID = "admin-revoked-emulator"

before(async () => {
  // Setup active admin caller
  await adminDb.collection(COLLECTION_USERS).doc(ADMIN_UID).set({
    uid: ADMIN_UID,
    name: "Coordinator Admin",
    email: "admin-coord@talasys.test",
    role: "Full Access",
    status: "Active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  // Setup admin caller for revocation testing
  await adminDb.collection(COLLECTION_USERS).doc(CALLER_REVOKED_UID).set({
    uid: CALLER_REVOKED_UID,
    name: "Revocable Admin",
    email: "admin-revoked@talasys.test",
    role: "Full Access",
    status: "Active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
})

after(async () => {
  try {
    await adminDb.collection(COLLECTION_USERS).doc(ADMIN_UID).delete()
    await adminDb.collection(COLLECTION_USERS).doc(CALLER_REVOKED_UID).delete()
  } catch {}
})

// Helper to initialize resident profile in Firestore and Auth emulator
async function setupResident(uid: string, initialEmail: string) {
  try {
    await adminAuth.deleteUser(uid)
  } catch {}
  await adminAuth.createUser({ uid, email: initialEmail })

  await adminDb.collection(COLLECTION_USERS).doc(uid).set({
    uid,
    name: `Resident ${uid}`,
    email: initialEmail,
    role: "resident",
    status: "Active",
    isVerified: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK 1: Block Concurrent Reconciliation and Normal Writers
// ─────────────────────────────────────────────────────────────────────────────
test("Task 1 Acceptance: Paused reconciliation in 'reconciling' denies competing email edit, approval, and another reconciler, then resumes cleanly", async () => {
  const residentId = "res-task1-block"
  await setupResident(residentId, "initial-t1@talasys.test")

  // Simulate stranded lock in reconciliation-required
  await adminDb.collection("identityOperationLocks").doc(residentId).set({
    residentId,
    status: "reconciliation-required",
    operationId: "op-t1-failed",
    attemptId: "att-t1-failed",
    updatedAt: Date.now(),
  })

  // Set Auth email to target synced value
  await adminAuth.updateUser(residentId, { email: "authoritative-t1@talasys.test" })

  let pausedPhase1Resolve!: () => void
  const pausedPhase1Promise = new Promise<void>(res => { pausedPhase1Resolve = res })
  let resumePhase1Resolve!: () => void
  const resumePhase1Promise = new Promise<void>(res => { resumePhase1Resolve = res })

  // Wrapped reconciliation dependencies to pause right after Phase 1 lock claim
  const controlledReconDeps = {
    auth: {
      async getUser(uid: string) {
        pausedPhase1Resolve()
        await resumePhase1Promise
        return adminAuth.getUser(uid)
      },
      async updateUser(uid: string, props: { email: string }) {
        return adminAuth.updateUser(uid, props)
      },
    },
    db: adminDb,
  }

  // Launch reconciliation in background
  const reconPromise = reconcileResidentIdentity(controlledReconDeps, {
    residentId,
    action: "sync-auth-to-firestore",
    actorUid: ADMIN_UID,
  })

  // Wait until reconciler has claimed the lock in Phase 1
  await pausedPhase1Promise

  // Verify lock is actively in 'reconciling'
  const lockSnapWhilePaused = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockSnapWhilePaused.data()?.status, "reconciling")
  const activeReconAttemptId = lockSnapWhilePaused.data()?.attemptId

  // Competing Writer 1: Email update via real production adapter
  const realEmailDeps = createIdentityEmailDependencies()
  await assert.rejects(
    coordinateIdentityEmailUpdate(realEmailDeps, {
      operationId: "op-competing-email",
      attemptId: "att-competing-email",
      residentId,
      newEmail: "tamper-email@talasys.test",
      actorUid: ADMIN_UID,
      ipAddress: "127.0.0.1",
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      return true
    },
    "Normal email writer must receive conflict"
  )

  // Competing Writer 2: Verification approval via real production adapter
  const verifId = "verif-competing-t1"
  await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verifId).set({
    id: verifId,
    residentId,
    status: "pending",
    type: "registration",
    formData: { email: "tamper-verif@talasys.test" },
    createdAt: Date.now(),
  })
  const realApprovalDeps = createFirestoreApprovalDependencies()
  await assert.rejects(
    coordinateVerificationApproval(realApprovalDeps, {
      verificationId: verifId,
      attemptId: "att-competing-verif",
      actorUid: ADMIN_UID,
      ipAddress: "127.0.0.1",
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      return true
    },
    "Verification approval must receive conflict"
  )

  // Competing Writer 3: Another reconciler
  await assert.rejects(
    reconcileResidentIdentity({ auth: adminAuth, db: adminDb }, {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: ADMIN_UID,
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Another administrator is actively reconciling/)
      return true
    },
    "Second reconciler must be rejected with 409"
  )

  // Verify lock was NOT replaced during paused execution
  const lockSnapStillPaused = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockSnapStillPaused.data()?.status, "reconciling")
  assert.equal(lockSnapStillPaused.data()?.attemptId, activeReconAttemptId)

  // Resume the original reconciliation
  resumePhase1Resolve()
  const reconFinalResult = await reconPromise
  assert.equal(reconFinalResult.success, true)

  // Verify final consistent state
  const residentSnapFinal = await adminDb.collection(COLLECTION_USERS).doc(residentId).get()
  assert.equal(residentSnapFinal.data()?.email, "authoritative-t1@talasys.test")
  const lockSnapFinal = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockSnapFinal.data()?.status, "completed")
  assert.equal(lockSnapFinal.data()?.reconciledAction, "sync-auth-to-firestore")

  // Verify authoritative audit log was recorded
  const auditSnap = await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(`reconcile-${residentId}-${activeReconAttemptId}`).get()
  assert.equal(auditSnap.exists, true)
  assert.equal(auditSnap.data()?.authoritative, true)
  assert.equal(auditSnap.data()?.after?.syncedEmail, "authoritative-t1@talasys.test")
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK 2: Fix Reconciliation Transaction Ordering With Linked Verification
// ─────────────────────────────────────────────────────────────────────────────
test("Task 2 Acceptance: All 3 reconciliation actions execute against real Firestore emulator with linked verification without read-after-write errors", async () => {
  // Action 1: sync-auth-to-firestore
  const res1 = "res-task2-sync-auth"
  await setupResident(res1, "stale-firestore@talasys.test")
  await adminAuth.updateUser(res1, { email: "authoritative-auth1@talasys.test" })

  const verif1 = "verif-task2-sync-auth"
  await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif1).set({
    id: verif1,
    residentId: res1,
    status: "processing",
    processingOperationId: "op-t2-1",
    processingAttemptId: "att-t2-1",
    type: "registration",
    createdAt: Date.now(),
  })
  await adminDb.collection("identityOperationLocks").doc(res1).set({
    residentId: res1,
    status: "reconciliation-required",
    operationId: "op-t2-1",
    attemptId: "att-t2-1",
    verificationId: verif1,
    updatedAt: Date.now(),
  })

  // Must not throw read-after-write error!
  const res1Outcome = await reconcileResidentIdentity(
    { auth: adminAuth, db: adminDb },
    { residentId: res1, action: "sync-auth-to-firestore", actorUid: ADMIN_UID }
  )
  assert.equal(res1Outcome.success, true)

  const res1User = await adminDb.collection(COLLECTION_USERS).doc(res1).get()
  assert.equal(res1User.data()?.email, "authoritative-auth1@talasys.test")
  const verif1Doc = await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif1).get()
  assert.equal(verif1Doc.data()?.status, "pending", "Verification must be reset to pending, never approved")
  assert.equal(verif1Doc.data()?.processingOperationId, null)

  // Action 2: sync-firestore-to-auth
  const res2 = "res-task2-sync-fs"
  await setupResident(res2, "authoritative-fs2@talasys.test")
  // Intentionally desynchronize Auth to old email
  await adminAuth.updateUser(res2, { email: "old-auth2@talasys.test" })

  const verif2 = "verif-task2-sync-fs"
  await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif2).set({
    id: verif2,
    residentId: res2,
    status: "processing",
    processingOperationId: "op-t2-2",
    processingAttemptId: "att-t2-2",
    type: "profile-edit",
    createdAt: Date.now(),
  })
  await adminDb.collection("identityOperationLocks").doc(res2).set({
    residentId: res2,
    status: "reconciliation-required",
    operationId: "op-t2-2",
    attemptId: "att-t2-2",
    verificationId: verif2,
    updatedAt: Date.now(),
  })

  const res2Outcome = await reconcileResidentIdentity(
    { auth: adminAuth, db: adminDb },
    { residentId: res2, action: "sync-firestore-to-auth", actorUid: ADMIN_UID }
  )
  assert.equal(res2Outcome.success, true)

  const authUser2 = await adminAuth.getUser(res2)
  assert.equal(authUser2.email, "authoritative-fs2@talasys.test", "Auth email must match Firestore")
  const verif2Doc = await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif2).get()
  assert.equal(verif2Doc.data()?.status, "pending")

  // Action 3: release-lock
  const res3 = "res-task2-release"
  await setupResident(res3, "matched@talasys.test")
  const verif3 = "verif-task2-release"
  await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif3).set({
    id: verif3,
    residentId: res3,
    status: "processing",
    processingOperationId: "op-t2-3",
    processingAttemptId: "att-t2-3",
    type: "reactivation",
    createdAt: Date.now(),
  })
  await adminDb.collection("identityOperationLocks").doc(res3).set({
    residentId: res3,
    status: "reconciliation-required",
    operationId: "op-t2-3",
    attemptId: "att-t2-3",
    verificationId: verif3,
    updatedAt: Date.now(),
  })

  // release-lock when emails match succeeds
  const res3Outcome = await reconcileResidentIdentity(
    { auth: adminAuth, db: adminDb },
    { residentId: res3, action: "release-lock", actorUid: ADMIN_UID }
  )
  assert.equal(res3Outcome.success, true)
  const lock3 = await adminDb.collection("identityOperationLocks").doc(res3).get()
  assert.equal(lock3.data()?.status, "completed")
  const verif3Doc = await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verif3).get()
  assert.equal(verif3Doc.data()?.status, "pending")

  // release-lock when emails differ is rejected with 400
  const res3b = "res-task2-release-differ"
  await setupResident(res3b, "fs-different@talasys.test")
  await adminAuth.updateUser(res3b, { email: "auth-different@talasys.test" })
  await adminDb.collection("identityOperationLocks").doc(res3b).set({
    residentId: res3b,
    status: "reconciliation-required",
    operationId: "op-differ",
    attemptId: "att-differ",
    updatedAt: Date.now(),
  })

  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      { residentId: res3b, action: "release-lock", actorUid: ADMIN_UID }
    ),
    (err: any) => {
      assert.equal(err.status, 400)
      assert.match(err.message, /emails differ/)
      return true
    }
  )
  const lockDiffer = await adminDb.collection("identityOperationLocks").doc(res3b).get()
  assert.equal(lockDiffer.data()?.status, "reconciliation-required", "Lock remains in recovery state")
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK 3: Enforce Safe Recovery Eligibility
// ─────────────────────────────────────────────────────────────────────────────
test("Task 3 Acceptance: In-flight locks block recovery without forceRecover; bound IDs and failure handling enforced", async () => {
  const residentId = "res-task3-eligibility"
  await setupResident(residentId, "task3@talasys.test")

  // Subtest 3.1: Active in-flight stage blocks recovery
  await adminDb.collection("identityOperationLocks").doc(residentId).set({
    residentId,
    status: "auth-mutating",
    operationId: "op-in-flight",
    attemptId: "att-in-flight",
    updatedAt: Date.now(),
  })

  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      { residentId, action: "sync-auth-to-firestore", actorUid: ADMIN_UID }
    ),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Cannot reconcile: lock is in active in-flight stage 'auth-mutating'/)
      return true
    }
  )

  // Subtest 3.1b: In-flight auth-mutating lock with ONLY { forceRecover: true } is REJECTED
  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      { residentId, action: "sync-auth-to-firestore", actorUid: ADMIN_UID, forceRecover: true }
    ),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /expectedOperationId and expectedAttemptId fencing are required/)
      return true
    }
  )

  // Subtest 3.1c: In-flight auth-mutating lock with expected IDs but WITHOUT stopped evidence is REJECTED
  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      {
        residentId,
        action: "sync-auth-to-firestore",
        actorUid: ADMIN_UID,
        forceRecover: true,
        expectedOperationId: "op-in-flight",
        expectedAttemptId: "att-in-flight",
      }
    ),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /evidence that the external write has stopped, failed, or is safely stale is required/)
      return true
    }
  )

  // Subtest 3.1d: In-flight auth-mutating lock with expected IDs + verified stopped evidence SUCCEEDS
  const forceResult = await reconcileResidentIdentity(
    { auth: adminAuth, db: adminDb },
    {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: ADMIN_UID,
      forceRecover: true,
      expectedOperationId: "op-in-flight",
      expectedAttemptId: "att-in-flight",
      externalWriteStopped: true,
    }
  )
  assert.equal(forceResult.success, true)

  // Subtest 3.2: Expected operationId / attemptId anti-stomp binding
  await adminDb.collection("identityOperationLocks").doc(residentId).set({
    residentId,
    status: "reconciliation-required",
    operationId: "op-expected-123",
    attemptId: "att-expected-456",
    updatedAt: Date.now(),
  })

  // Mismatched operation ID
  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      { residentId, action: "sync-auth-to-firestore", actorUid: ADMIN_UID, expectedOperationId: "op-wrong" }
    ),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Reconciliation expected operation ID 'op-wrong'/)
      return true
    }
  )

  // Mismatched attempt ID
  await assert.rejects(
    reconcileResidentIdentity(
      { auth: adminAuth, db: adminDb },
      { residentId, action: "sync-auth-to-firestore", actorUid: ADMIN_UID, expectedAttemptId: "att-wrong" }
    ),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /Reconciliation expected attempt ID 'att-wrong'/)
      return true
    }
  )

  // Subtest 3.3: Failed provider Auth update leaves lock in durable reconciliation-required
  const failingAuthDeps = {
    auth: {
      async getUser() { return { uid: residentId, email: "mismatched-auth@talasys.test" } },
      async updateUser() { throw new Error("Firebase Auth service unavailable (503)") },
    },
    db: adminDb,
  }

  await assert.rejects(
    reconcileResidentIdentity(
      failingAuthDeps,
      { residentId, action: "sync-firestore-to-auth", actorUid: ADMIN_UID }
    ),
    (err: any) => {
      assert.equal(err.status, 502)
      return true
    }
  )

  const lockAfterAuthFailure = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockAfterAuthFailure.data()?.status, "reconciliation-required")
  assert.match(lockAfterAuthFailure.data()?.error, /Auth sync failed/)

  // Subtest 3.4: Revoked caller permission during recovery aborts Phase 3 and preserves recovery state
  await adminDb.collection("identityOperationLocks").doc(residentId).set({
    residentId,
    status: "reconciliation-required",
    operationId: "op-revoked-test",
    attemptId: "att-revoked-test",
    updatedAt: Date.now(),
  })

  // We revoke the CALLER_REVOKED_UID right before Phase 3 executes
  const revokingDeps = {
    auth: {
      async getUser() {
        // Revoke caller permission between Phase 1 and Phase 3
        await adminDb.collection(COLLECTION_USERS).doc(CALLER_REVOKED_UID).update({
          status: "Locked",
        })
        return adminAuth.getUser(residentId)
      },
      async updateUser(uid: string, props: { email: string }) {
        return adminAuth.updateUser(uid, props)
      },
    },
    db: adminDb,
  }

  await assert.rejects(
    reconcileResidentIdentity(
      revokingDeps,
      { residentId, action: "sync-auth-to-firestore", actorUid: CALLER_REVOKED_UID }
    ),
    (err: any) => {
      assert.equal(err.status, 403)
      assert.match(err.message, /Caller authorization revoked during reconciliation/)
      return true
    }
  )

  const lockAfterRevokedCaller = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockAfterRevokedCaller.data()?.status, "reconciliation-required")
  assert.match(lockAfterRevokedCaller.data()?.error, /Caller authorization revoked/)
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK 4: Prevent Same-Attempt Concurrent Execution & Idempotent Retries
// ─────────────────────────────────────────────────────────────────────────────
test("Task 4 Acceptance: Simultaneous identical (operationId, attemptId) executions are denied; completed retries produce no duplicate records", async () => {
  const residentId = "res-task4-same-attempt"
  await setupResident(residentId, "original-t4@talasys.test")

  const operationId = "op-task4-concurrent"
  const attemptId = "att-task4-single"

  let pauseAuthResolve!: () => void
  const pauseAuthPromise = new Promise<void>(res => { pauseAuthResolve = res })
  let authReachedResolve!: () => void
  const authReachedPromise = new Promise<void>(res => { authReachedResolve = res })

  const realDeps = createIdentityEmailDependencies()
  let attempt1AuthMutated = false

  // Request 1: uses real dependencies but pauses before Auth update
  const controlledDeps1 = {
    ...realDeps,
    async updateAuthEmail(uid: string, email: string) {
      authReachedResolve()
      await pauseAuthPromise
      attempt1AuthMutated = true
      return realDeps.updateAuthEmail(uid, email)
    },
  }

  // Launch Request 1
  const req1Promise = coordinateIdentityEmailUpdate(controlledDeps1, {
    operationId,
    attemptId,
    residentId,
    newEmail: "updated-t4@talasys.test",
    actorUid: ADMIN_UID,
    ipAddress: "127.0.0.1",
  })

  // Wait until Request 1 has claimed the lock and reached Auth mutation pause
  await authReachedPromise

  // Verify lock is currently in-flight in 'auth-mutating'
  const inFlightLock = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(inFlightLock.data()?.status, "auth-mutating")
  assert.equal(inFlightLock.data()?.operationId, operationId)
  assert.equal(inFlightLock.data()?.attemptId, attemptId)

  // Launch Request 2 with IDENTICAL operationId and attemptId!
  let req2AuthCalled = false
  const controlledDeps2 = {
    ...realDeps,
    async updateAuthEmail(uid: string, email: string) {
      req2AuthCalled = true
      return realDeps.updateAuthEmail(uid, email)
    },
  }

  await assert.rejects(
    coordinateIdentityEmailUpdate(controlledDeps2, {
      operationId,
      attemptId,
      residentId,
      newEmail: "updated-t4@talasys.test",
      actorUid: ADMIN_UID,
      ipAddress: "127.0.0.1",
    }),
    (err: any) => {
      assert.equal(err.status, 409)
      return true
    },
    "Request 2 must receive conflict because attempt is in-flight"
  )
  assert.equal(req2AuthCalled, false, "Request 2 must never perform Auth write")

  // Unpause Request 1 to complete normally
  pauseAuthResolve()
  const req1Result = await req1Promise
  assert.equal(req1Result.outcome, "completed")
  assert.equal(attempt1AuthMutated, true)

  // Verify final user state
  const updatedUser = await adminDb.collection(COLLECTION_USERS).doc(residentId).get()
  assert.equal(updatedUser.data()?.email, "updated-t4@talasys.test")

  // Count activity logs created by Request 1
  const logsBeforeRetry = await adminDb
    .collection(COLLECTION_ACTIVITY_LOGS)
    .where("operationId", "==", operationId)
    .get()
  assert.equal(logsBeforeRetry.docs.length, 1, "Exactly one authoritative audit log should exist")

  // Request 3: Submit idempotent retry of the completed attempt
  const req3Result = await coordinateIdentityEmailUpdate(realDeps, {
    operationId,
    attemptId,
    residentId,
    newEmail: "updated-t4@talasys.test",
    actorUid: ADMIN_UID,
    ipAddress: "127.0.0.1",
  })
  assert.equal(req3Result.outcome, "completed", "Completed retry returns completed outcome")
  assert.equal(req3Result.idempotent, true)

  // Verify NO duplicate audit logs were created!
  const logsAfterRetry = await adminDb
    .collection(COLLECTION_ACTIVITY_LOGS)
    .where("operationId", "==", operationId)
    .get()
  assert.equal(logsAfterRetry.docs.length, 1, "Completed retry must produce no duplicate audit logs")
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK 5: Competing Writers & Stale Attempts in Normal Flow
// ─────────────────────────────────────────────────────────────────────────────
test("Task 5 Acceptance: Competing different-attempt writers and stale attempts cannot overwrite or complete", async () => {
  const residentId = "res-task5-stale"
  await setupResident(residentId, "task5@talasys.test")

  const realEmailDeps = createIdentityEmailDependencies()

  // Claim with Attempt 1
  const claim1 = await realEmailDeps.claim({
    operationId: "op-task5-diff",
    attemptId: "attempt-1",
    residentId,
    newEmail: "attempt1@talasys.test",
    profileUpdates: {},
    actorUid: ADMIN_UID,
    ipAddress: "127.0.0.1",
    now: Date.now(),
  })
  assert.equal(claim1.outcome, "claimed")

  // Attempt 2 with same operationId but different attemptId while Attempt 1 is in-flight
  const claim2 = await realEmailDeps.claim({
    operationId: "op-task5-diff",
    attemptId: "attempt-2",
    residentId,
    newEmail: "attempt1@talasys.test",
    profileUpdates: {},
    actorUid: ADMIN_UID,
    ipAddress: "127.0.0.1",
    now: Date.now(),
  })
  assert.equal(claim2.outcome, "conflict", "Different attempt of active operation must be rejected with conflict")

  // Stale completion prevention: Attempt 2 cannot complete or compensate
  await assert.rejects(
    realEmailDeps.complete({
      id: "op-task5-diff",
      attemptId: "attempt-2-stale",
      residentId,
      actorUid: ADMIN_UID,
      actorName: "Admin",
      oldEmail: "task5@talasys.test",
      newEmail: "attempt1@talasys.test",
      profileUpdates: {},
      status: "claimed",
    }, Date.now()),
    (err: any) => {
      assert.equal(err.status, 409)
      assert.match(err.message, /fence changed/)
      return true
    }
  )
})

// ─────────────────────────────────────────────────────────────────────────────
// TASK 6: Blocker 2 Acceptance - Email-Only Recovery on Verification Approval
// ─────────────────────────────────────────────────────────────────────────────
test("Task 6 Acceptance: Blocker 2 Regression - Email-only recovery on approval leaves verification pending, resolves verificationApprovalOperations, and allows subsequent approval claim to complete", async () => {
  const residentId = "res-task6-b2-emulator"
  await setupResident(residentId, "initial-t6@talasys.test")

  const verifId = "verif-task6-b2-emulator"
  const originalAttemptId = "att-t6-b2-old"

  // 1. Setup pending verification with profile edits including email and full name
  await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verifId).set({
    id: verifId,
    residentId,
    status: "processing",
    type: "profile-edit",
    changes: [
      { field: "Email Address", newValue: "approved-t6@talasys.test" },
      { field: "Full Name", newValue: "Updated Full Name T6" },
    ],
    processingOperationId: verifId,
    processingAttemptId: originalAttemptId,
    createdAt: Date.now(),
  })

  // 2. Setup verification approval operation record in verificationApprovalOperations
  await adminDb.collection("verificationApprovalOperations").doc(verifId).set({
    id: verifId,
    verificationId: verifId,
    residentId,
    attemptId: originalAttemptId,
    status: "claimed",
    verificationType: "profile-edit",
    actorUid: ADMIN_UID,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  // 3. Setup resident lock in reconciliation-required stage
  await adminDb.collection("identityOperationLocks").doc(residentId).set({
    residentId,
    status: "reconciliation-required",
    operationId: `verification-${verifId}`,
    attemptId: originalAttemptId,
    verificationId: verifId,
    operationType: "verification-approval",
    updatedAt: Date.now(),
  })

  // 4. Perform email-only recovery (sync-auth-to-firestore)
  const recoveryResult = await reconcileResidentIdentity(
    { auth: adminAuth, db: adminDb },
    {
      residentId,
      action: "sync-auth-to-firestore",
      actorUid: ADMIN_UID,
    }
  )
  assert.equal(recoveryResult.success, true)

  // 5. Verify post-recovery state in Firestore:
  // - Verification MUST remain pending (never approved, processing fences cleared)
  const verifSnapAfter = await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verifId).get()
  assert.equal(verifSnapAfter.data()?.status, "pending")
  assert.equal(verifSnapAfter.data()?.processingOperationId, null)
  assert.equal(verifSnapAfter.data()?.processingAttemptId, null)

  // - Operation in verificationApprovalOperations MUST be resolved as "reconciled" (NOT "completed")
  const opSnapAfter = await adminDb.collection("verificationApprovalOperations").doc(verifId).get()
  assert.equal(opSnapAfter.data()?.status, "reconciled")
  assert.equal(opSnapAfter.data()?.reconciledBy, ADMIN_UID)

  // - Resident lock MUST be completed under reconcile operationId (NOT verification-verifId)
  const lockSnapAfter = await adminDb.collection("identityOperationLocks").doc(residentId).get()
  assert.equal(lockSnapAfter.data()?.status, "completed")
  assert.notEqual(lockSnapAfter.data()?.operationId, `verification-${verifId}`)
  assert.match(lockSnapAfter.data()?.operationId, /^reconcile-/)
  assert.equal(lockSnapAfter.data()?.targetOperationId, `verification-${verifId}`)

  // 6. Test claim policy directly:
  // evaluateIdentityClaim MUST NOT return { outcome: "completed", idempotent: true } for pending approval retry!
  const claimPolicyResult = evaluateIdentityClaim(
    lockSnapAfter.data(),
    opSnapAfter.data(),
    {
      operationId: `verification-${verifId}`,
      attemptId: originalAttemptId,
      residentId,
    }
  )
  assert.equal(claimPolicyResult.outcome, "claimed", "Claim policy must return claimed, never completed idempotent for pending approval")

  // 7. Verify subsequent approval claim and execution succeeds using real production approval coordinator
  const realApprovalDeps = createFirestoreApprovalDependencies()
  const approvalResult = await coordinateVerificationApproval(realApprovalDeps, {
    verificationId: verifId,
    actorUid: ADMIN_UID,
    attemptId: "att-t6-b2-subsequent",
    ipAddress: "127.0.0.1",
  })
  assert.equal(approvalResult.outcome, "completed")
  assert.equal(approvalResult.idempotent, false)

  // 8. Confirm approval work was actually executed:
  // - Verification is approved
  const verifFinal = await adminDb.collection(COLLECTION_VERIFICATIONS).doc(verifId).get()
  assert.equal(verifFinal.data()?.status, "approved")
  assert.equal(verifFinal.data()?.approvedByUid, ADMIN_UID)

  // - Resident profile updates applied
  const residentFinal = await adminDb.collection(COLLECTION_USERS).doc(residentId).get()
  assert.equal(residentFinal.data()?.name, "Updated Full Name T6")
  assert.equal(residentFinal.data()?.email, "approved-t6@talasys.test")

  // - Operation in verificationApprovalOperations is completed
  const opFinal = await adminDb.collection("verificationApprovalOperations").doc(verifId).get()
  assert.equal(opFinal.data()?.status, "completed")
})
