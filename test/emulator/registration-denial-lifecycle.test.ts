import { after, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"
import { createApproveVerificationHandler } from "../../app/api/admin/verifications/approve/route.ts"
import { createRegistrationResubmissionHandler } from "../../app/api/resident/registration/resubmit/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"
import { createRegistrationStatusHandler } from "../../app/api/resident/registration/status/route.ts"
import { createUpdateResidentEmailHandler } from "../../app/api/admin/update-resident-email/route.ts"
import { createResidentRequestHandler } from "../../app/api/resident/requests/create/route.ts"
import { createMediaViewHandler } from "../../app/api/media/view/route.ts"
import { registrationOperationDocumentId } from "../../lib/security/registration-finalization.ts"

process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "denial-lifecycle-cloud"
process.env.CLOUDINARY_API_SECRET = "denial-lifecycle-secret"
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

function regStatusHandler(callerUid: string) {
  return createRegistrationStatusHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        return { uid: callerUid }
      },
      getUser: async (uid: string) => {
        try {
          return await adminAuth.getUser(uid)
        } catch {
          return { uid, email: `${uid}@example.test`, emailVerified: true }
        }
      },
    },
    db: adminDb,
  })
}

function updateEmailHandler(callerUid: string) {
  return createUpdateResidentEmailHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        return { uid: callerUid }
      },
    } as any,
  })
}

function residentRequestHandler(callerUid: string) {
  return createResidentRequestHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        return { uid: callerUid }
      },
    },
    db: adminDb,
  })
}

function mediaViewHandler(callerUid: string) {
  return createMediaViewHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        return { uid: callerUid }
      },
    },
    db: adminDb,
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
  let correctableResident: { uid: string; email: string }
  let rejectVerifId = ""
  let approvedResident: { uid: string; email: string }
  let appVerifId = ""

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
    correctableResident = await createIdentity("correctable")
    rejectVerifId = `verif-rej-${randomUUID()}`

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
    approvedResident = await createIdentity("approved")
    appVerifId = `verif-app-${randomUUID()}`

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

  // D01: Permanently denied resident cannot be deactivated, deleted, or updated
  await t.test("D01: resident.deactivate cannot change permanently denied resident to Expired (409)", async () => {
    const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.deactivate",
        operationId: `op-deact-denied-${randomUUID()}`,
        targetId: residentApplicant.uid,
      }),
    }))
    assert.equal(res.status, 409)
    const data = await res.json()
    assert.match(data.error, /permanently denied/i)

    // State remains Deleted
    const currentDoc = await adminDb.collection("users").doc(residentApplicant.uid).get()
    assert.equal(currentDoc.data()?.status, "Deleted")
    assert.equal(currentDoc.data()?.registrationDenied, true)
  })

  await t.test("D01: resident.delete and resident.update reject permanently denied residents (409)", async () => {
    const delRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.delete",
        operationId: `op-del-denied-${randomUUID()}`,
        targetId: residentApplicant.uid,
      }),
    }))
    assert.equal(delRes.status, 409)
    const delData = await delRes.json()
    assert.match(delData.error, /permanently denied/i)

    const updRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.update",
        operationId: `op-upd-denied-${randomUUID()}`,
        targetId: residentApplicant.uid,
        payload: { name: "Tampered Name" },
      }),
    }))
    assert.equal(updRes.status, 409)
    const updData = await updRes.json()
    assert.match(updData.error, /permanently denied/i)
  })

  await t.test("D01: Unverified Pending applicants cannot be activated or deactivated via generic operations (409)", async () => {
    const pendingResident = await createIdentity("pending-applicant")
    await adminDb.collection("users").doc(pendingResident.uid).set({
      role: "resident",
      status: "Pending",
      isVerified: false,
      name: "Pending Applicant",
      email: pendingResident.email,
    })

    const actRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.activate",
        operationId: `op-act-pending-${randomUUID()}`,
        targetId: pendingResident.uid,
      }),
    }))
    assert.equal(actRes.status, 409)
    assert.match((await actRes.json()).error, /Cannot activate an unverified pending resident/i)

    const deactRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.deactivate",
        operationId: `op-deact-pending-${randomUUID()}`,
        targetId: pendingResident.uid,
      }),
    }))
    assert.equal(deactRes.status, 409)
    assert.match((await deactRes.json()).error, /Cannot deactivate an unverified pending applicant/i)
  })

  await t.test("D01: Legitimate verified resident activation and deactivation continue to work", async () => {
    // approvedResident is currently Active and verified
    const deactRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.deactivate",
        operationId: `op-deact-app-${randomUUID()}`,
        targetId: approvedResident.uid,
      }),
    }))
    assert.equal(deactRes.status, 200)
    assert.equal((await adminDb.collection("users").doc(approvedResident.uid).get()).data()?.status, "Expired")

    const actRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "resident.activate",
        operationId: `op-act-app-${randomUUID()}`,
        targetId: approvedResident.uid,
      }),
    }))
    assert.equal(actRes.status, 200)
    assert.equal((await adminDb.collection("users").doc(approvedResident.uid).get()).data()?.status, "Active")
  })

  // D02/E03: Registration status recovery prioritizes current authoritative account state with correct production document ID
  await t.test("D02: Registration status returns denied even when supplied with completed operationId", async () => {
    // Record a completed operation in registrationOperations using the canonical document ID derivation (E03)
    const opDocId = registrationOperationDocumentId(residentApplicant.uid, denyOpId)
    await adminDb.collection("registrationOperations").doc(opDocId).set({
      operationId: denyOpId,
      uid: residentApplicant.uid,
      status: "completed",
      updatedAt: Date.now() - 50000,
    })

    const req = new Request(`http://localhost/api/resident/registration/status?operationId=${denyOpId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${residentApplicant.uid}` },
    })
    const res = await regStatusHandler(residentApplicant.uid)(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.status, "denied")
    assert.equal(json.denialReason, denialReasonText)
  })

  await t.test("D02: Auth-only incomplete applicant recovers pending status via registration operation", async () => {
    const incompleteIdentity = await createIdentity("incomplete-app")
    const incOpId = `op-inc-${randomUUID()}`
    const incDocId = registrationOperationDocumentId(incompleteIdentity.uid, incOpId)

    await adminDb.collection("registrationOperations").doc(incDocId).set({
      operationId: incOpId,
      uid: incompleteIdentity.uid,
      status: "pending",
      updatedAt: Date.now(),
    })

    const req = new Request(`http://localhost/api/resident/registration/status?operationId=${incOpId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${incompleteIdentity.uid}` },
    })
    const res = await regStatusHandler(incompleteIdentity.uid)(req)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.success, true)
    assert.equal(json.status, "incomplete")
  })

  await t.test("E03: Correctly keyed registration operation recovers completed prior to denial, then denied after permanent denial", async () => {
    const liveApplicant = await createIdentity("e03-applicant")
    const liveOpId = `op-e03-${randomUUID()}`
    const liveVerifId = `verif-e03-${randomUUID()}`
    const liveDocId = registrationOperationDocumentId(liveApplicant.uid, liveOpId)

    // 1. Initial pending applicant state
    await adminDb.collection("users").doc(liveApplicant.uid).set({
      role: "resident",
      status: "Pending",
      isVerified: false,
      hasPendingVerification: true,
      pendingVerificationId: liveVerifId,
      createdAt: Date.now(),
    })
    await adminDb.collection("verifications").doc(liveVerifId).set({
      residentId: liveApplicant.uid,
      userId: liveApplicant.uid,
      type: "registration",
      status: "pending",
      name: "E03 Applicant",
      email: liveApplicant.email,
      createdAt: Date.now(),
    })
    await adminDb.collection("residentVerificationLocks").doc(liveApplicant.uid).set({
      residentId: liveApplicant.uid,
      activeVerificationId: liveVerifId,
      activeVerificationStatus: "pending",
      createdAt: Date.now(),
    })

    // 2. Persist completed operation under its authoritative document ID
    await adminDb.collection("registrationOperations").doc(liveDocId).set({
      operationId: liveOpId,
      uid: liveApplicant.uid,
      status: "completed",
      verificationId: liveVerifId,
      updatedAt: Date.now(),
    })

    // 3. Normal recovery returns completed before denial
    const beforeReq = new Request(`http://localhost/api/resident/registration/status?operationId=${liveOpId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${liveApplicant.uid}` },
    })
    const beforeRes = await regStatusHandler(liveApplicant.uid)(beforeReq)
    assert.equal(beforeRes.status, 200)
    const beforeJson = await beforeRes.json()
    assert.equal(beforeJson.status, "completed")

    // 4. Super Admin permanently denies applicant
    const liveDenialReason = "Disqualified: Altered official barangay clearance documents submitted."
    const denyRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-deny-e03-${randomUUID()}`,
        targetId: liveVerifId,
        payload: { reason: liveDenialReason },
      }),
    }))
    assert.equal(denyRes.status, 200)

    // 5. Query status using the same operationId -> denial takes precedence over completed operation!
    const afterReq = new Request(`http://localhost/api/resident/registration/status?operationId=${liveOpId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${liveApplicant.uid}` },
    })
    const afterRes = await regStatusHandler(liveApplicant.uid)(afterReq)
    assert.equal(afterRes.status, 200)
    const afterJson = await afterRes.json()
    assert.equal(afterJson.status, "denied")
    assert.equal(afterJson.denialReason, liveDenialReason)
  })

  // D03: Identity lock coordination during registration denial
  await t.test("D03: Denial is rejected when identity lock is in reconciling or active stages (409)", async () => {
    const activeStages = ["reconciling", "auth-mutating", "auth-completed", "compensating", "reconciliation-required"]
    const pendingDeniedVerifId = `verif-lock-check-${randomUUID()}`
    const lockResident = await createIdentity("lock-resident")

    await adminDb.collection("users").doc(lockResident.uid).set({
      role: "resident",
      status: "Pending",
      isVerified: false,
      hasPendingVerification: true,
      pendingVerificationId: pendingDeniedVerifId,
      name: "Lock Resident",
      email: lockResident.email,
    })

    await adminDb.collection("verifications").doc(pendingDeniedVerifId).set({
      residentId: lockResident.uid,
      userId: lockResident.uid,
      type: "registration",
      status: "pending",
      name: "Lock Resident",
      email: lockResident.email,
      createdAt: Date.now(),
    })

    for (const stage of activeStages) {
      await adminDb.collection("identityOperationLocks").doc(lockResident.uid).set({
        operationId: `op-${stage}`,
        attemptId: `att-${stage}`,
        status: stage,
        leaseUntil: Date.now() + 60000,
        updatedAt: Date.now(),
      })

      const res = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
        method: "POST",
        headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "verification.denyRegistration",
          operationId: `op-deny-lock-${stage}-${randomUUID()}`,
          targetId: pendingDeniedVerifId,
          payload: { reason: "Permanent disqualification test for lock stage" },
        }),
      }))
      assert.equal(res.status, 409)
      const data = await res.json()
      assert.match(data.error, /identity coordination is currently in progress/i)
    }

    // Release the lock (status: completed, leaseUntil: 0)
    await adminDb.collection("identityOperationLocks").doc(lockResident.uid).set({
      operationId: "op-completed",
      attemptId: "att-completed",
      status: "completed",
      leaseUntil: 0,
      updatedAt: Date.now(),
    })

    // Now denial succeeds
    const releaseRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-deny-released-${randomUUID()}`,
        targetId: pendingDeniedVerifId,
        payload: { reason: "Permanent disqualification after coordination completed" },
      }),
    }))
    assert.equal(releaseRes.status, 200)
    assert.equal((await releaseRes.json()).success, true)
  })

  // D04: Preserve initial registration verification history
  await t.test("D04: Generic deletion is rejected for rejected, denied, and approved registration verifications (400)", async () => {
    // 1. Rejected registration verification
    const delRejRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-del-rej-${randomUUID()}`,
        targetId: rejectVerifId,
      }),
    }))
    assert.equal(delRejRes.status, 400)
    assert.match((await delRejRes.json()).error, /Initial registration verification records cannot be deleted/i)
    assert.equal((await adminDb.collection("verifications").doc(rejectVerifId).get()).exists, true)

    // 2. Denied registration verification
    const delDenRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-del-den-${randomUUID()}`,
        targetId: verifId,
      }),
    }))
    assert.equal(delDenRes.status, 400)
    assert.match((await delDenRes.json()).error, /Initial registration verification records cannot be deleted/i)
    assert.equal((await adminDb.collection("verifications").doc(verifId).get()).exists, true)

    // 3. Approved registration verification
    const delAppRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-del-app-${randomUUID()}`,
        targetId: appVerifId,
      }),
    }))
    assert.equal(delAppRes.status, 400)
    assert.match((await delAppRes.json()).error, /Initial registration verification records cannot be deleted/i)
    assert.equal((await adminDb.collection("verifications").doc(appVerifId).get()).exists, true)

    // 4. Non-registration verification (profile-edit) can still be legitimately deleted
    const profileEditVerifId = `verif-profile-edit-${randomUUID()}`
    await adminDb.collection("verifications").doc(profileEditVerifId).set({
      residentId: approvedResident.uid,
      userId: approvedResident.uid,
      type: "profile-edit",
      status: "pending",
      createdAt: Date.now(),
    })

    const delProfileRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-del-prof-${randomUUID()}`,
        targetId: profileEditVerifId,
      }),
    }))
    assert.equal(delProfileRes.status, 200)
    assert.equal((await adminDb.collection("verifications").doc(profileEditVerifId).get()).exists, false)
  })

  // Milestone 6: Conflicting owner identity and adjacent endpoints
  await t.test("M6: Verification operations reject conflicting owner identities (400)", async () => {
    const mismatchVerifId = `verif-mismatch-${randomUUID()}`
    await adminDb.collection("verifications").doc(mismatchVerifId).set({
      residentId: "user-alpha",
      userId: "user-beta",
      type: "registration",
      status: "pending",
      createdAt: Date.now(),
    })

    // Deny attempt
    const denyRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.denyRegistration",
        operationId: `op-mismatch-deny-${randomUUID()}`,
        targetId: mismatchVerifId,
        payload: { reason: "Permanent disqualification mismatch test" },
      }),
    }))
    assert.equal(denyRes.status, 400)
    assert.match((await denyRes.json()).error, /Conflicting owner identities/i)

    // Reject attempt
    const rejectRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.reject",
        operationId: `op-mismatch-rej-${randomUUID()}`,
        targetId: mismatchVerifId,
        payload: { reason: "Correctable rejection mismatch test" },
      }),
    }))
    assert.equal(rejectRes.status, 400)
    assert.match((await rejectRes.json()).error, /Conflicting owner identities/i)

    // Delete attempt
    const delRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "verification.delete",
        operationId: `op-mismatch-del-${randomUUID()}`,
        targetId: mismatchVerifId,
      }),
    }))
    assert.equal(delRes.status, 400)
    assert.match((await delRes.json()).error, /Conflicting owner identities/i)
  })

  await t.test("M6: Denied resident cannot update email (409)", async () => {
    const emailRes = await updateEmailHandler(superAdmin.uid)(new Request("http://localhost/api/admin/update-resident-email", {
      method: "POST",
      headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        residentId: residentApplicant.uid,
        newEmail: "new-email-denied@example.test",
      }),
    }))
    assert.equal(emailRes.status, 409)
    assert.match((await emailRes.json()).error, /permanently denied/i)
  })

  await t.test("M6: Denied resident cannot create document request (403)", async () => {
    const reqRes = await residentRequestHandler(residentApplicant.uid)(new Request("http://localhost/api/resident/requests/create", {
      method: "POST",
      headers: { Authorization: `Bearer ${residentApplicant.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "Barangay Clearance" }),
    }))
    assert.equal(reqRes.status, 403)
    assert.match((await reqRes.json()).error, /denied/i)
  })

  await t.test("M6: Denied resident cannot access protected media (403)", async () => {
    const mediaRes = await mediaViewHandler(residentApplicant.uid)(new Request("http://localhost/api/media/view", {
      method: "POST",
      headers: { Authorization: `Bearer ${residentApplicant.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        publicId: `talasys/proofs/${residentApplicant.uid}/id1`,
      }),
    }))
    assert.equal(mediaRes.status, 403)
    assert.match((await mediaRes.json()).error, /denied/i)
  })
})
