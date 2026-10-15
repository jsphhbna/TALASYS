import { after, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"
import { createApproveVerificationHandler } from "../../app/api/admin/verifications/approve/route.ts"
import { createRegistrationResubmissionHandler } from "../../app/api/resident/registration/resubmit/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"

const cloudName = "denial-lifecycle-cloud"
const createdUids = new Set<string>()

after(async () => {
  for (const uid of createdUids) {
    await adminAuth.deleteUser(uid).catch(() => {})
  }
})

async function createIdentity(label: string) {
  const uid = `denial-${label}-${randomUUID()}`
  const email = `${uid}@example.test`
  await adminAuth.createUser({ uid, email, password: "Valid123!Password" })
  createdUids.add(uid)
  return { uid, email }
}

function adminOps(callerUid: string) {
  return createAdminOperationsHandler({
    auth: {
      verifyIdToken: async () => ({ uid: callerUid }),
    } as any,
    db: adminDb,
  })
}

function approveHandler(callerUid: string) {
  return createApproveVerificationHandler({
    auth: {
      verifyIdToken: async () => ({ uid: callerUid }),
    } as any,
  })
}

function resubmitHandler() {
  return createRegistrationResubmissionHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      },
    },
    db: adminDb,
    cloudName,
    now: Date.now,
    verifyAsset: async () => {},
  })
}

function proofUrl(uid: string, id: string) {
  return `https://res.cloudinary.com/${cloudName}/image/authenticated/v1/talasys/proofs/${uid}/${id}.jpg`
}

function registryId(uid: string, id: string) {
  return mediaRegistryDocumentId(cloudName, "image", `talasys/proofs/${uid}/${id}`)
}

async function reserveProof(uid: string, id: string) {
  await adminDb.collection("mediaRegistry").doc(registryId(uid, id)).set({
    cloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: `talasys/proofs/${uid}/${id}`,
    ownerUid: uid,
    status: "claimed",
    createdAt: Date.now(),
    testSuite: "denial-lifecycle",
  })
}

test("Milestone E1: Comprehensive Registration Denial Lifecycle and Governance", async (t) => {
  // Actors
  const superAdmin = await createIdentity("superadmin")
  const normalAdmin = await createIdentity("admin")
  const verifOnlyAdmin = await createIdentity("verif-only")
  const docsOnlyAdmin = await createIdentity("docs-only")
  const residentApplicant = await createIdentity("applicant")

  await adminDb.collection("users").doc(superAdmin.uid).set({
    role: "superadmin",
    status: "Active",
    isVerified: true,
    name: "Super Admin",
    email: superAdmin.email,
  })

  await adminDb.collection("users").doc(normalAdmin.uid).set({
    role: "admin",
    status: "Active",
    isVerified: true,
    name: "Normal Admin",
    email: normalAdmin.email,
  })

  await adminDb.collection("users").doc(verifOnlyAdmin.uid).set({
    role: "Verifications Only",
    status: "Active",
    isVerified: true,
    name: "Verifications Officer",
    email: verifOnlyAdmin.email,
  })

  await adminDb.collection("users").doc(docsOnlyAdmin.uid).set({
    role: "Documents Only",
    status: "Active",
    isVerified: true,
    name: "Documents Clerk",
    email: docsOnlyAdmin.email,
  })

  const verifId = `verif-reg-${randomUUID()}`
  await adminDb.collection("users").doc(residentApplicant.uid).set({
    role: "resident",
    status: "Pending",
    isVerified: false,
    hasPendingVerification: true,
    pendingVerificationId: verifId,
    name: "Applicant Resident",
    email: residentApplicant.email,
    statuses: ["Adult"],
  })

  await adminDb.collection("verifications").doc(verifId).set({
    residentId: residentApplicant.uid,
    userId: residentApplicant.uid,
    type: "registration",
    status: "pending",
    name: "Applicant Resident",
    email: residentApplicant.email,
    documents: [{ name: "Government ID", url: proofUrl(residentApplicant.uid, "id1") }],
    createdAt: Date.now(),
  })

  await adminDb.collection("residentVerificationLocks").doc(residentApplicant.uid).set({
    residentId: residentApplicant.uid,
    activeVerificationId: verifId,
    activeVerificationStatus: "pending",
    createdAt: Date.now(),
  })

  // 2. Normal Admin cannot perform verification.denyRegistration (403)
  await t.test("2. Normal Admin cannot perform verification.denyRegistration (403)", async () => {
    const res = await adminOps(normalAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${normalAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-deny-normal-${randomUUID()}`,
        targetId: verifId,
        payload: { reason: "Permanent disqualification due to fraudulent identity documents" },
      }),
    }))
    assert.equal(res.status, 403)
    const data = await res.json()
    assert.match(data.error, /not authorized/i)
  })

  // 3. Specialized Admin (Verifications Only, Documents Only) cannot deny (403)
  await t.test("3. Specialized Admin cannot perform verification.denyRegistration (403)", async () => {
    for (const actor of [verifOnlyAdmin, docsOnlyAdmin]) {
      const res = await adminOps(actor.uid)(new Request("http://localhost/api/admin/operations", {
        method: "POST",
        headers: { Authorization: `Bearer ${actor.uid}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "verification.denyRegistration",
          operationId: `op-deny-spec-${randomUUID()}`,
          targetId: verifId,
          payload: { reason: "Permanent disqualification due to fraudulent identity documents" },
        }),
      }))
      assert.equal(res.status, 403)
    }
  })

  // 4. Resident cannot deny their own registration (403)
  await t.test("4. Resident cannot deny their own registration (403)", async () => {
    const res = await adminOps(residentApplicant.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${residentApplicant.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-deny-self-${randomUUID()}`,
        targetId: verifId,
        payload: { reason: "Permanent disqualification due to fraudulent identity documents" },
      }),
    }))
    assert.equal(res.status, 403)
  })

  // Validation: Short denial reason (< 10 chars) rejected (400)
  await t.test("Validation: Denial reason < 10 characters is rejected (400)", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-deny-short-${randomUUID()}`,
        targetId: verifId,
        payload: { reason: "Short" },
      }),
    }))
    assert.equal(res.status, 400)
  })

  // 12. Generic deletion cannot strand a first-time Pending applicant (400)
  await t.test("12. Generic deletion cannot strand a first-time Pending applicant (400)", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-del-reg-${randomUUID()}`,
        targetId: verifId,
      }),
    }))
    assert.equal(res.status, 400)
    const data = await res.json()
    assert.match(data.error, /Generic deletion of pending registration verifications is not permitted/)

    // State still intact
    assert.equal((await adminDb.collection("verifications").doc(verifId).get()).data()?.status, "pending")
    assert.equal((await adminDb.collection("users").doc(residentApplicant.uid).get()).data()?.status, "Pending")
  })

  // 1, 5, 6, 7, 8, 9. Super Admin successfully permanently denies registration
  const denyOpId = `op-deny-success-${randomUUID()}`
  const denialReasonText = "Fraudulent address certificate and fabricated barangay clearance detected."

  await t.test("1, 5, 6, 7, 8, 9. Super Admin successfully executes verification.denyRegistration", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: denyOpId,
        targetId: verifId,
        payload: { reason: denialReasonText },
      }),
    }))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.idempotent, false)

    // 5. Denial updates resident status to Deleted with lifecycle metadata
    const userDoc = await adminDb.collection("users").doc(residentApplicant.uid).get()
    const userData = userDoc.data()
    assert.equal(userData?.status, "Deleted")
    assert.equal(userData?.registrationDenied, true)
    assert.equal(userData?.denialReason, denialReasonText)
    assert.equal(userData?.deniedBy, "Super Admin")
    assert.equal(userData?.deniedByUid, superAdmin.uid)
    assert.equal(typeof userData?.deniedAt, "number")

    // 7. Pending flags are cleared
    assert.equal(userData?.hasPendingVerification, false)
    assert.equal(userData?.pendingVerificationId, null)

    // 6. Verification history is preserved
    const verifDoc = await adminDb.collection("verifications").doc(verifId).get()
    assert.equal(verifDoc.exists, true)
    const verifData = verifDoc.data()
    assert.equal(verifData?.status, "denied")
    assert.equal(verifData?.denialReason, denialReasonText)
    assert.equal(verifData?.deniedBy, "Super Admin")
    assert.equal(verifData?.deniedByUid, superAdmin.uid)
    assert.equal(typeof verifData?.deniedAt, "number")
    assert.equal(Array.isArray(verifData?.documents), true)

    // 8. Coordination locks are updated consistently
    const lockDoc = await adminDb.collection("residentVerificationLocks").doc(residentApplicant.uid).get()
    const lockData = lockDoc.data()
    assert.equal(lockData?.activeVerificationStatus, "denied")
    assert.equal(lockData?.denialReason, denialReasonText)
    assert.equal(typeof lockData?.deniedAt, "number")

    // 9. Authoritative audit log was created
    const auditLogs = await adminDb.collection("activityLogs").where("targetId", "==", verifId).get()
    assert.equal(auditLogs.docs.length >= 1, true)
    const denyAudit = auditLogs.docs.find((d: any) => d.data().action === "verification.denyRegistration")?.data()
    assert.ok(denyAudit)
    assert.equal(denyAudit.actionType, "denied")
    assert.equal(denyAudit.authoritative, true)
    assert.equal(denyAudit.actor.id, superAdmin.uid)
    assert.equal(denyAudit.after?.denialReason, denialReasonText)
  })

  // 10. Duplicate denial does not produce duplicate effects (idempotency)
  await t.test("10. Duplicate denial is idempotent and safe", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: denyOpId,
        targetId: verifId,
        payload: { reason: denialReasonText },
      }),
    }))
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.idempotent, true)
  })

  // 13. Denied resident cannot resubmit registration
  await t.test("13. Denied resident cannot resubmit registration", async () => {
    const docId = `proof-${randomUUID()}`
    await reserveProof(residentApplicant.uid, docId)

    const res = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
      method: "POST",
      headers: { Authorization: `Bearer ${residentApplicant.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operationId: `op-resub-denied-${randomUUID()}`,
        proofs: [{ name: "Valid Government ID", url: proofUrl(residentApplicant.uid, docId) }],
        reason: "Attempting resubmission after denial",
      }),
    }))
    // Should be rejected (status is Deleted: 403 ACCOUNT_INACTIVE)
    assert.equal(res.status, 403)
    const data = await res.json()
    assert.equal(data.code, "ACCOUNT_INACTIVE")
  })

  // 14. Generic activation cannot bypass the denial policy
  await t.test("14. Generic activation cannot bypass the denial policy (409)", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.activate",
        operationId: `op-act-bypass-${randomUUID()}`,
        targetId: residentApplicant.uid,
      }),
    }))
    assert.equal(res.status, 409)
    const data = await res.json()
    assert.match(data.error, /permanently denied/i)

    // State remains Deleted
    assert.equal((await adminDb.collection("users").doc(residentApplicant.uid).get()).data()?.status, "Deleted")
  })

  // 11. Concurrent approval and denial cannot both succeed
  await t.test("11. Approval of permanently denied resident is rejected (409)", async () => {
    const res = await approveHandler(superAdmin.uid)(new Request("http://localhost/api/admin/verifications/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: verifId }),
    }))
    assert.equal(res.status, 409)
    const data = await res.json()
    assert.match(data.error, /denied/i)
  })

  // 15. Correctable rejection still permits registration resubmission
  await t.test("15. Correctable rejection still permits registration resubmission", async () => {
    const correctableResident = await createIdentity("correctable")
    const rejectVerifId = `verif-rej-${randomUUID()}`

    await adminDb.collection("users").doc(correctableResident.uid).set({
      role: "resident",
      status: "Pending",
      isVerified: false,
      hasPendingVerification: true,
      pendingVerificationId: rejectVerifId,
      name: "Correctable Resident",
      email: correctableResident.email,
      statuses: ["Adult"],
    })

    await adminDb.collection("verifications").doc(rejectVerifId).set({
      residentId: correctableResident.uid,
      userId: correctableResident.uid,
      type: "registration",
      status: "pending",
      name: "Correctable Resident",
      email: correctableResident.email,
      createdAt: Date.now(),
    })

    await adminDb.collection("residentVerificationLocks").doc(correctableResident.uid).set({
      residentId: correctableResident.uid,
      activeVerificationId: rejectVerifId,
      activeVerificationStatus: "pending",
      createdAt: Date.now(),
    })

    // Reject registration
    const rejRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.reject",
        operationId: `op-rej-${randomUUID()}`,
        targetId: rejectVerifId,
        payload: { reason: "The uploaded government ID is blurry and unreadable. Please provide a clear copy." },
      }),
    }))
    assert.equal(rejRes.status, 200)

    // Resident remains Pending (NOT soft-deleted!)
    const userDoc = await adminDb.collection("users").doc(correctableResident.uid).get()
    assert.equal(userDoc.data()?.status, "Pending")
    assert.equal(userDoc.data()?.isVerified, false)
    assert.equal(userDoc.data()?.hasPendingVerification, false)

    // Verification is rejected
    const verifDoc = await adminDb.collection("verifications").doc(rejectVerifId).get()
    assert.equal(verifDoc.data()?.status, "rejected")

    // Now resident resubmits corrected documents
    const newDocId = `proof-corr-${randomUUID()}`
    await reserveProof(correctableResident.uid, newDocId)

    const resubmitRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
      method: "POST",
      headers: { Authorization: `Bearer ${correctableResident.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operationId: `op-resub-corr-${randomUUID()}`,
        proofs: [{ name: "Valid Government ID", url: proofUrl(correctableResident.uid, newDocId) }],
        reason: "Here is a clearer government ID as requested.",
      }),
    }))
    assert.equal(resubmitRes.status, 200)
    const resubmitJson = await resubmitRes.json()
    assert.equal(resubmitJson.success, true)

    // Resident has new pending verification
    const updatedUser = await adminDb.collection("users").doc(correctableResident.uid).get()
    assert.equal(updatedUser.data()?.hasPendingVerification, true)
    assert.ok(updatedUser.data()?.pendingVerificationId)
  })

  // 17. Existing verification approval remains functional
  await t.test("17. Existing verification approval remains functional", async () => {
    const approvedResident = await createIdentity("approved")
    const appVerifId = `verif-app-${randomUUID()}`

    await adminDb.collection("users").doc(approvedResident.uid).set({
      role: "resident",
      status: "Pending",
      isVerified: false,
      hasPendingVerification: true,
      pendingVerificationId: appVerifId,
      name: "Approved Resident",
      email: approvedResident.email,
      statuses: ["Adult"],
    })

    await adminDb.collection("verifications").doc(appVerifId).set({
      residentId: approvedResident.uid,
      userId: approvedResident.uid,
      type: "registration",
      status: "pending",
      name: "Approved Resident",
      email: approvedResident.email,
      createdAt: Date.now(),
    })

    await adminDb.collection("residentVerificationLocks").doc(approvedResident.uid).set({
      residentId: approvedResident.uid,
      activeVerificationId: appVerifId,
      activeVerificationStatus: "pending",
      createdAt: Date.now(),
    })

    const appRes = await approveHandler(superAdmin.uid)(new Request("http://localhost/api/admin/verifications/approve", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: appVerifId }),
    }))
    assert.equal(appRes.status, 200)
    const appJson = await appRes.json()
    assert.equal(appJson.success, true)

    const finalUser = await adminDb.collection("users").doc(approvedResident.uid).get()
    assert.equal(finalUser.data()?.status, "Active")
    assert.equal(finalUser.data()?.isVerified, true)
    assert.equal(finalUser.data()?.hasPendingVerification, false)
  })
})
