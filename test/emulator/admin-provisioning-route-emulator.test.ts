import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"

const actorUid = "provisioning-super-admin"

function operationDocumentId(operationId: string) {
  return `admin-op-${createHash("sha256").update(operationId).digest("hex")}`
}

function deterministicUid(operationId: string) {
  return `adm-${createHash("sha256").update(operationId).digest("hex").slice(0, 28)}`
}

const routeAuth = {
  verifyIdToken: async () => ({ uid: actorUid }),
  getUser: (...args: any[]) => (adminAuth.getUser as any)(...args),
  createUser: (...args: any[]) => (adminAuth.createUser as any)(...args),
  deleteUser: (...args: any[]) => (adminAuth.deleteUser as any)(...args),
}

function request(operationId: string, attemptId: string) {
  return new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "admin.create",
      operationId,
      payload: {
        attemptId,
        email: `${operationId}@talasys.test`,
        password: "safe-fixture-password",
        name: "Provisioned Admin",
        role: "Full Access",
      },
    }),
  })
}

function operationRequest(operationId: string, targetId: string, payload: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.updateStatus", operationId, targetId, payload }),
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

async function cleanup(operationId: string) {
  const uid = deterministicUid(operationId)
  const batch = adminDb.batch()
  batch.delete(adminDb.collection("users").doc(uid))
  batch.delete(adminDb.collection("adminAccountOperations").doc(operationDocumentId(operationId)))
  batch.delete(adminDb.collection("activityLogs").doc(operationDocumentId(operationId)))
  await batch.commit()
  try { await adminAuth.deleteUser(uid) } catch {}
}

before(async () => {
  await adminDb.collection("users").doc(actorUid).set({ role: "superadmin", status: "Active", name: "Provisioning Owner", email: "owner@talasys.test" })
})

after(async () => {
  await adminDb.collection("users").doc(actorUid).delete()
})

test("actual admin.create endpoint rejects same-attempt and different-attempt overlap", async () => {
  const operationId = "provisioning-overlap"
  await cleanup(operationId)
  const reachedClaim = deferred()
  const releaseClaim = deferred()
  const creator = createAdminOperationsHandler({
    auth: routeAuth as any,
    db: adminDb,
    uuid: () => "execution-owner",
    onAdminCreateStage: async stage => {
      if (stage === "claimed") {
        reachedClaim.resolve()
        await releaseClaim.promise
      }
    },
  })(request(operationId, "shared-attempt"))
  await reachedClaim.promise

  const sameAttempt = await createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb, uuid: () => "execution-competitor-same" })(request(operationId, "shared-attempt"))
  const differentAttempt = await createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb, uuid: () => "execution-competitor-other" })(request(operationId, "different-attempt"))
  assert.equal(sameAttempt.status, 409)
  assert.equal(differentAttempt.status, 409)

  releaseClaim.resolve()
  assert.equal((await creator).status, 200)
  assert.equal((await adminDb.collection("users").doc(deterministicUid(operationId)).get()).exists, true)
  assert.equal((await adminDb.collection("activityLogs").doc(operationDocumentId(operationId)).get()).exists, true)
  assert.equal((await adminDb.collection("adminAccountOperations").doc(operationDocumentId(operationId)).get()).data()?.status, "completed")
  await cleanup(operationId)
})

test("compensation is transactionally fenced before Auth deletion and competitors cannot complete first", async () => {
  const operationId = "provisioning-compensation"
  await cleanup(operationId)
  const reachedAuthCreated = deferred()
  const releaseAuthCreated = deferred()
  const reachedCompensation = deferred()
  const releaseCompensation = deferred()
  const creator = createAdminOperationsHandler({
    auth: routeAuth as any,
    db: adminDb,
    uuid: () => "execution-compensator",
    onAdminCreateStage: async stage => {
      if (stage === "auth-created") {
        reachedAuthCreated.resolve()
        await releaseAuthCreated.promise
      }
      if (stage === "before-finalize") throw new Error("injected finalization failure")
      if (stage === "compensating") {
        reachedCompensation.resolve()
        await releaseCompensation.promise
      }
    },
  })(request(operationId, "shared-attempt"))

  await reachedAuthCreated.promise
  releaseAuthCreated.resolve()
  await reachedCompensation.promise

  const operation = (await adminDb.collection("adminAccountOperations").doc(operationDocumentId(operationId)).get()).data()
  assert.equal(operation?.status, "compensating")
  assert.equal(operation?.compensationExecutionId, "execution-compensator")
  const competitor = await createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb, uuid: () => "execution-competitor" })(request(operationId, "shared-attempt"))
  assert.equal(competitor.status, 409)

  releaseCompensation.resolve()
  assert.equal((await creator).status, 503)
  await assert.rejects(() => adminAuth.getUser(deterministicUid(operationId)), (error: any) => error?.code === "auth/user-not-found")
  assert.equal((await adminDb.collection("users").doc(deterministicUid(operationId)).get()).exists, false)
  assert.equal((await adminDb.collection("activityLogs").doc(operationDocumentId(operationId)).get()).exists, false)
  assert.equal((await adminDb.collection("adminAccountOperations").doc(operationDocumentId(operationId)).get()).data()?.status, "compensated")
  await cleanup(operationId)
})

test("actual request endpoint enforces forward-only transitions and normalizes legacy Processing", async () => {
  const handler = createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb, now: () => Date.UTC(2026, 0, 2) })
  const targetId = "transition-request"
  const targetRef = adminDb.collection("documentRequests").doc(targetId)
  const operationIds = ["transition-skip", "transition-legacy", "transition-terminal"]
  const batch = adminDb.batch()
  for (const operationId of operationIds) batch.delete(adminDb.collection("activityLogs").doc(operationDocumentId(operationId)))
  batch.set(targetRef, { residentId: "transition-resident", documentType: "Clearance", status: "Pending", paymentStatus: "unpaid" })
  await batch.commit()

  const skipped = await handler(operationRequest(operationIds[0], targetId, { status: "Completed" }))
  assert.equal(skipped.status, 409)
  assert.equal((await targetRef.get()).data()?.status, "Pending")
  assert.equal((await adminDb.collection("activityLogs").doc(operationDocumentId(operationIds[0])).get()).exists, false)

  await targetRef.update({ status: "Processing" })
  const legacy = await handler(operationRequest(operationIds[1], targetId, { status: "Ready for Pick Up" }))
  assert.equal(legacy.status, 200)
  assert.equal((await targetRef.get()).data()?.status, "Ready for Pick Up")

  await targetRef.update({ status: "Completed" })
  const terminal = await handler(operationRequest(operationIds[2], targetId, { status: "Cancelled" }))
  assert.equal(terminal.status, 409)
  assert.equal((await targetRef.get()).data()?.status, "Completed")

  const cleanupBatch = adminDb.batch()
  cleanupBatch.delete(targetRef)
  for (const operationId of operationIds) cleanupBatch.delete(adminDb.collection("activityLogs").doc(operationDocumentId(operationId)))
  await cleanupBatch.commit()
})

test("UI03: request.markGenerated and request.updateStatus enforce prerequisites", async () => {
  const handler = createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb, now: () => Date.UTC(2026, 0, 2) })
  const targetId = "req-lifecycle-ui03"
  const targetRef = adminDb.collection("documentRequests").doc(targetId)

  // 1. Pending request cannot be marked generated
  await targetRef.set({
    residentId: "res-ui03",
    documentType: "Barangay Clearance",
    status: "Pending",
    paymentStatus: "unpaid",
    documentFee: 50,
  })
  const markPending = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.markGenerated", operationId: "op-mark-pending", targetId }),
  }))
  assert.equal(markPending.status, 409)

  // 2. Approved request CAN be marked generated
  await targetRef.update({ status: "Approved" })
  const markApproved = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.markGenerated", operationId: "op-mark-approved", targetId }),
  }))
  assert.equal(markApproved.status, 200)
  assert.equal((await targetRef.get()).data()?.hasGenerated, true)

  // 3. Request transition to Completed without payment is rejected (documentFee > 0, unpaid)
  await targetRef.update({ status: "Ready for Pick Up", paymentStatus: "unpaid" })
  const completeUnpaid = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.updateStatus", operationId: "op-complete-unpaid", targetId, payload: { status: "Completed" } }),
  }))
  assert.equal(completeUnpaid.status, 409)

  // 4. Request transition to Completed without hasGenerated is rejected
  await targetRef.update({ hasGenerated: false, paymentStatus: "paid" })
  const completeNotGenerated = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.updateStatus", operationId: "op-complete-notgen", targetId, payload: { status: "Completed" } }),
  }))
  assert.equal(completeNotGenerated.status, 409)

  // 5. Request with both hasGenerated and paid fee succeeds transition to Completed
  await targetRef.update({ hasGenerated: true, paymentStatus: "paid" })
  const completeValid = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.updateStatus", operationId: "op-complete-valid", targetId, payload: { status: "Completed" } }),
  }))
  assert.equal(completeValid.status, 200)
  assert.equal((await targetRef.get()).data()?.status, "Completed")

  // 6. MT01: Completed request with prior issuance supports authorized reprint; status remains Completed
  const reprintCompleted = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.markGenerated", operationId: "op-mark-completed", targetId }),
  }))
  assert.equal(reprintCompleted.status, 200)
  const completedDoc = (await targetRef.get()).data()
  assert.equal(completedDoc?.status, "Completed")
  assert.equal(completedDoc?.reprintCount, 1)

  // 7. MT01: Completed request that was never generated rejects markGenerated with 409
  await targetRef.update({ hasGenerated: false, generatedAt: null })
  const ungeneratedCompleted = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
    body: JSON.stringify({ operation: "request.markGenerated", operationId: "op-mark-ungen-completed", targetId }),
  }))
  assert.equal(ungeneratedCompleted.status, 409)

  // Clean up
  await targetRef.delete()
  const cleanOps = ["op-mark-pending", "op-mark-approved", "op-complete-unpaid", "op-complete-notgen", "op-complete-valid", "op-mark-completed", "op-mark-ungen-completed"]
  for (const op of cleanOps) {
    await adminDb.collection("activityLogs").doc(operationDocumentId(op)).delete().catch(() => {})
  }
})
