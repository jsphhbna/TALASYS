import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createFirestoreApprovalDependencies } from "../../app/api/admin/verifications/approve/route.ts"

const adminUid = "eligibility-admin"
const residentUid = "eligibility-resident"

before(async () => {
  await adminDb.collection("users").doc(adminUid).set({ role: "Full Access", status: "Active", name: "Eligibility Admin" })
  await adminDb.collection("users").doc(residentUid).set({ role: "resident", status: "Pending", email: "eligibility@talasys.test" })
  try { await adminAuth.deleteUser(residentUid) } catch {}
  await adminAuth.createUser({ uid: residentUid, email: "eligibility@talasys.test" })
})

after(async () => {
  const batch = adminDb.batch()
  batch.delete(adminDb.collection("users").doc(adminUid))
  batch.delete(adminDb.collection("users").doc(residentUid))
  await batch.commit()
  try { await adminAuth.deleteUser(residentUid) } catch {}
})

async function putVerification(id: string, status: string, extra: Record<string, unknown> = {}) {
  await adminDb.collection("verifications").doc(id).set({ residentId: residentUid, userId: residentUid, type: "registration", status, ...extra })
}

async function assertNoClaimWrites(id: string, expectedStatus: string) {
  assert.equal((await adminDb.collection("verifications").doc(id).get()).data()?.status, expectedStatus)
  assert.equal((await adminDb.collection("verificationApprovalOperations").doc(id).get()).exists, false)
  assert.equal((await adminDb.collection("identityOperationLocks").doc(residentUid).get()).exists, false)
}

test("production approval claim adapter rejects rejected and unsupported states without writes", async () => {
  const deps = createFirestoreApprovalDependencies()
  for (const [id, status] of [["eligibility-rejected", "rejected"], ["eligibility-unsupported", "archived"]]) {
    await putVerification(id, status)
    await assert.rejects(() => deps.claim({ verificationId: id, actorUid: adminUid, attemptId: `attempt-${id}`, ipAddress: "test", now: Date.now() }), (error: any) => error?.status === 409)
    await assertNoClaimWrites(id, status)
    await adminDb.collection("verifications").doc(id).delete()
  }
})

test("production approval claim adapter rejects processing owned by another attempt without writes", async () => {
  const id = "eligibility-processing"
  await putVerification(id, "processing", { processingOperationId: id, processingAttemptId: "other-attempt" })
  const deps = createFirestoreApprovalDependencies()
  await assert.rejects(() => deps.claim({ verificationId: id, actorUid: adminUid, attemptId: "incoming-attempt", ipAddress: "test", now: Date.now() }), (error: any) => error?.status === 409)
  await assertNoClaimWrites(id, "processing")
  await adminDb.collection("verifications").doc(id).delete()
})

test("production approval claim adapter still claims a valid pending verification", async () => {
  const id = "eligibility-pending"
  await putVerification(id, "pending")
  const result = await createFirestoreApprovalDependencies().claim({ verificationId: id, actorUid: adminUid, attemptId: "valid-attempt", ipAddress: "test", now: Date.now() })
  assert.equal(result.outcome, "claimed")
  assert.equal((await adminDb.collection("verifications").doc(id).get()).data()?.status, "processing")
  const batch = adminDb.batch()
  batch.delete(adminDb.collection("verifications").doc(id))
  batch.delete(adminDb.collection("verificationApprovalOperations").doc(id))
  batch.delete(adminDb.collection("identityOperationLocks").doc(residentUid))
  await batch.commit()
})
