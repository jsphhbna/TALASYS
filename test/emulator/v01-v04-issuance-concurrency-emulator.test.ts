import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"
import {
  COLLECTION_USERS,
  COLLECTION_DOCUMENT_REQUESTS,
  COLLECTION_ACTIVITY_LOGS,
  COLLECTION_SYSTEM_CONFIG,
  SYSTEM_CONFIG_DOCUMENT_ID,
} from "../../lib/constants.ts"

const actorUid = "emulator-superadmin-v01-v04"

function operationDocumentId(operationId: string) {
  return `admin-op-${createHash("sha256").update(operationId).digest("hex")}`
}

const routeAuth = {
  verifyIdToken: async (token: string) => {
    if (token === "emulator-token") return { uid: actorUid }
    throw new Error("Unauthorized token")
  },
}

before(async () => {
  await adminDb.collection(COLLECTION_USERS).doc(actorUid).set({
    role: "superadmin",
    status: "Active",
    name: "V01-V04 Test SuperAdmin",
    email: "superadmin.v01v04@talasys.test",
  })
})

after(async () => {
  await adminDb.collection(COLLECTION_USERS).doc(actorUid).delete()
})

test("Emulator V01/V04: Real Firestore system.config.update enforces baseVersion and non-overlapping concurrency", async () => {
  const handler = createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb })
  const configRef = adminDb.collection(COLLECTION_SYSTEM_CONFIG).doc(SYSTEM_CONFIG_DOCUMENT_ID)

  // Seed baseline config at version 10
  await configRef.set({
    version: 10,
    barangayName: "Emulator Barangay",
    contactNumber: "02-8111-2222",
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: { barangay_clearance: "Standard Template" },
    updatedAt: Date.now(),
  })

  try {
    // 1. Missing baseVersion rejected with HTTP 400
    const missingBaseRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "system.config.update",
        operationId: "op-em-missing-base",
        payload: {
          updates: { barangayName: "Attempted Change" },
        },
      }),
    }))
    assert.equal(missingBaseRes.status, 400)
    assert.match((await missingBaseRes.json()).error, /concurrency precondition required/i)

    // 2. Stale version conflicting field rejected with HTTP 409
    const conflictRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "system.config.update",
        operationId: "op-em-conflict",
        payload: {
          baseVersion: 9, // Stale version
          baseConfig: { barangayName: "Old Name Before 10" },
          changedFields: ["barangayName"],
          updates: { barangayName: "Overlapping Proposed Name" },
        },
      }),
    }))
    assert.equal(conflictRes.status, 409)
    assert.match((await conflictRes.json()).error, /configuration conflict/i)

    // Verify Firestore remains unmutated after conflict
    const postConflictSnap = await configRef.get()
    assert.equal(postConflictSnap.data()?.version, 10)
    assert.equal(postConflictSnap.data()?.barangayName, "Emulator Barangay")

    // 3. Non-overlapping update succeeds and increments version in real Firestore transaction
    const nonOverlapRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "system.config.update",
        operationId: "op-em-non-overlap",
        payload: {
          baseVersion: 9, // Stale version, but changing only customDocumentTypes which did not change in version 10
          baseConfig: {
            customDocumentTypes: [],
            documentTypes: ["Barangay Clearance"],
          },
          changedFields: ["customDocumentTypes", "documentTypes"],
          updates: {
            customDocumentTypes: [{ id: "solo_parent", name: "Solo Parent", fee: 0 }],
            documentTypes: ["Barangay Clearance", "Solo Parent"],
          },
        },
      }),
    }))
    assert.equal(nonOverlapRes.status, 200)

    const postSuccessSnap = await configRef.get()
    assert.equal(postSuccessSnap.data()?.version, 11)
    assert.equal(postSuccessSnap.data()?.barangayName, "Emulator Barangay", "Existing barangayName preserved")
    assert.equal(postSuccessSnap.data()?.documentTypes.includes("Solo Parent"), true)

    // Audit log was recorded
    const auditDoc = await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-non-overlap")).get()
    assert.equal(auditDoc.exists, true)
    assert.equal(auditDoc.data()?.action, "system.config.update")
  } finally {
    // Cleanup
    await configRef.delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-missing-base")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-conflict")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-non-overlap")).delete()
  }
})

test("Emulator V02/V03/V04: Real Firestore confirmation, generation snapshot, reprint preservation, and corrected reissue", async () => {
  const handler = createAdminOperationsHandler({ auth: routeAuth as any, db: adminDb })
  const reqId = "em-req-doc-1"
  const reqRef = adminDb.collection(COLLECTION_DOCUMENT_REQUESTS).doc(reqId)

  // Seed represented document request in Approved status
  await reqRef.set({
    id: reqId,
    requestFor: "other",
    residentId: "resident-requester-1",
    residentName: "Maria Requester",
    requestedByName: "Pedro Beneficiary",
    relationship: "Brother",
    status: "Approved",
    documentType: "Barangay Clearance",
    beneficiaryReviewStatus: "provided",
    representedAddress: "Draft Address 1",
    representedAge: 25,
    hasGenerated: false,
    createdAt: Date.now(),
  })

  try {
    // 1. Unconfirmed generation attempt is rejected by real route (HTTP 400)
    const unconfirmedGenRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.markGenerated",
        operationId: "op-em-gen-unconfirmed",
        targetId: reqId,
      }),
    }))
    assert.equal(unconfirmedGenRes.status, 400)
    assert.match((await unconfirmedGenRes.json()).error, /must be explicitly confirmed by staff/i)

    // 2. Beneficiary confirmation with identity substitution rejected (HTTP 400) (V03)
    const substRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.confirmBeneficiary",
        operationId: "op-em-subst",
        targetId: reqId,
        payload: {
          name: "Substituted Identity Juan", // Attempted name change!
          address: "123 Valid Confirmed St",
          age: 25,
        },
      }),
    }))
    assert.equal(substRes.status, 400)
    assert.match((await substRes.json()).error, /must match requested beneficiary name/i)

    // 3. Routine confirmation with matching name succeeds (V03)
    const confirmRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.confirmBeneficiary",
        operationId: "op-em-confirm-valid",
        targetId: reqId,
        payload: {
          name: "Pedro Beneficiary",
          address: "Address A - 100 Historic St",
          age: 25,
        },
      }),
    }))
    assert.equal(confirmRes.status, 200)

    const confirmedDoc = (await reqRef.get()).data()
    assert.equal(confirmedDoc?.beneficiaryReviewStatus, "confirmed")
    assert.equal(confirmedDoc?.confirmedBeneficiaryName, "Pedro Beneficiary")
    assert.equal(confirmedDoc?.confirmedBeneficiaryAddress, "Address A - 100 Historic St")

    // 4. Initial generation records immutable issuance snapshot (V02)
    const genRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.markGenerated",
        operationId: "op-em-gen-initial",
        targetId: reqId,
      }),
    }))
    assert.equal(genRes.status, 200)

    const issuedDoc = (await reqRef.get()).data()
    assert.equal(issuedDoc?.hasGenerated, true)
    assert.equal(issuedDoc?.issuanceBeneficiaryName, "Pedro Beneficiary")
    assert.equal(issuedDoc?.issuanceBeneficiaryAddress, "Address A - 100 Historic St")
    assert.equal(issuedDoc?.issuanceBeneficiaryAge, 25)
    const originalGeneratedAt = issuedDoc?.generatedAt
    assert.ok(originalGeneratedAt > 0)

    // 5. Simulate an external or subsequent update to confirmedBeneficiaryAddress in Firestore
    await reqRef.update({
      confirmedBeneficiaryAddress: "Address B - 200 Later St",
      confirmedBeneficiaryAge: 26,
    })

    // 6. Reprint request.markGenerated strictly preserves original issuance snapshot (V02)
    const reprintRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.markGenerated",
        operationId: "op-em-reprint",
        targetId: reqId,
      }),
    }))
    assert.equal(reprintRes.status, 200)

    const reprintedDoc = (await reqRef.get()).data()
    assert.equal(reprintedDoc?.generatedAt, originalGeneratedAt, "Original generatedAt must remain unchanged on reprint")
    assert.equal(reprintedDoc?.reprintCount, 1)
    assert.equal(reprintedDoc?.issuanceBeneficiaryAddress, "Address A - 100 Historic St", "Reprint must preserve original issuance address")
    assert.equal(reprintedDoc?.issuanceBeneficiaryAge, 25, "Reprint must preserve original issuance age")

    // 7. Authorized corrected reissue updates address and archives previous issuance (V02)
    const reissueRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.reissueCorrected",
        operationId: "op-em-reissue-corrected",
        targetId: reqId,
        payload: {
          address: "Address C - 300 Officially Corrected Ave",
          age: 26,
          correctionReason: "Resident presented updated proof of residency and deed of sale",
        },
      }),
    }))
    assert.equal(reissueRes.status, 200)

    const correctedDoc = (await reqRef.get()).data()
    assert.equal(correctedDoc?.isCorrectedIssuance, true)
    assert.equal(correctedDoc?.issuanceBeneficiaryAddress, "Address C - 300 Officially Corrected Ave")
    assert.equal(correctedDoc?.issuanceBeneficiaryAge, 26)
    assert.equal(correctedDoc?.issuanceHistory?.length, 1)
    assert.equal(correctedDoc?.issuanceHistory[0].beneficiaryAddress, "Address A - 100 Historic St")
    assert.equal(correctedDoc?.issuanceHistory[0].correctionReason, "Resident presented updated proof of residency and deed of sale")

    // 8. MT01: Completed request supports authorized reprint without altering status or original generation time
    await reqRef.update({ status: "Completed" })
    const completedReprintRes = await handler(new Request("http://localhost/api/admin/operations", {
      method: "POST",
      headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "request.reprint",
        operationId: "op-em-completed-reprint",
        targetId: reqId,
      }),
    }))
    assert.equal(completedReprintRes.status, 200)

    const completedDoc = (await reqRef.get()).data()
    assert.equal(completedDoc?.status, "Completed", "Status must remain Completed")
    assert.equal(completedDoc?.reprintCount, 2, "reprintCount increments from 1 to 2")
    assert.equal(completedDoc?.generatedAt, originalGeneratedAt, "Original generatedAt unchanged")
    assert.equal(completedDoc?.issuanceBeneficiaryAddress, "Address C - 300 Officially Corrected Ave", "Preserves latest archival snapshot")

    // 9. MT01: Concurrent reprints execute transactionally in real Firestore without lost increments
    const [concRes1, concRes2] = await Promise.all([
      handler(new Request("http://localhost/api/admin/operations", {
        method: "POST",
        headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "request.markGenerated",
          operationId: "op-em-conc-reprint-1",
          targetId: reqId,
        }),
      })),
      handler(new Request("http://localhost/api/admin/operations", {
        method: "POST",
        headers: { Authorization: "Bearer emulator-token", "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "request.reprint",
          operationId: "op-em-conc-reprint-2",
          targetId: reqId,
        }),
      })),
    ])
    assert.equal(concRes1.status, 200)
    assert.equal(concRes2.status, 200)

    const postConcDoc = (await reqRef.get()).data()
    assert.equal(postConcDoc?.status, "Completed")
    assert.equal(postConcDoc?.reprintCount, 4, "Two concurrent reprints transactionally increment counter (2 + 2 = 4)")
  } finally {
    // Cleanup
    await reqRef.delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-gen-unconfirmed")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-subst")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-confirm-valid")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-gen-initial")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-reprint")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-reissue-corrected")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-completed-reprint")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-conc-reprint-1")).delete()
    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId("op-em-conc-reprint-2")).delete()
  }
})
