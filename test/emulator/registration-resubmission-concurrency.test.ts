import { after, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createRegistrationResubmissionHandler } from "../../app/api/resident/registration/resubmit/route.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"
import { registrationOperationDocumentId } from "../../lib/security/registration-finalization.ts"
import { processRegistrationResubmission } from "../../lib/security/registration-resubmission.ts"
import { registrationHttpError } from "../../lib/security/registration-media-claim.ts"

const cloudName = "resubmit-concurrency-cloud"
const createdUids = new Set<string>()

function proofUrl(uid: string, id: string, cloud = cloudName) {
  return `https://res.cloudinary.com/${cloud}/image/authenticated/v1/talasys/proofs/${uid}/${id}.jpg`
}

function registryId(uid: string, id: string, cloud = cloudName) {
  return mediaRegistryDocumentId(cloud, "image", `talasys/proofs/${uid}/${id}`)
}

async function createIdentity(label: string) {
  const uid = `resub-${label}-${randomUUID()}`
  const email = `${uid}@example.test`
  await adminAuth.createUser({ uid, email, password: "Valid123!Password" })
  createdUids.add(uid)
  return { uid, email }
}

async function reserveProof(uid: string, id: string, overrides: Record<string, unknown> = {}) {
  await adminDb.collection("mediaRegistry").doc(registryId(uid, id)).set({
    cloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: `talasys/proofs/${uid}/${id}`,
    ownerUid: uid,
    status: "claimed",
    createdAt: Date.now(),
    testSuite: "resubmit-concurrency",
    ...overrides,
  })
}

function resubmitHandler(overrides: {
  verifyAsset?: (asset: any) => Promise<void>
} = {}) {
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
    verifyAsset: overrides.verifyAsset || (async () => {}),
  })
}

after(async () => {
  for (const uid of createdUids) {
    const operations = await adminDb.collection("registrationOperations").where("uid", "==", uid).get()
    const batch = adminDb.batch()
    for (const op of operations.docs) batch.delete(op.ref)
    const verifications = await adminDb.collection("verifications").where("residentId", "==", uid).get()
    for (const v of verifications.docs) batch.delete(v.ref)
    await batch.commit()

    await Promise.all([
      adminAuth.deleteUser(uid).catch(() => {}),
      adminDb.collection("users").doc(uid).delete(),
      adminDb.collection("residentVerificationLocks").doc(uid).delete(),
      adminDb.collection("verifications").doc(uid).delete(),
      adminDb.collection("notifications").doc(`reg-${uid}`).delete(),
    ])
  }
  const registrySnapshot = await adminDb.collection("mediaRegistry").where("testSuite", "==", "resubmit-concurrency").get()
  const registryBatch = adminDb.batch()
  for (const d of registrySnapshot.docs) registryBatch.delete(d.ref)
  await registryBatch.commit()
})

test("Resubmission Concurrency: Two racing resubmissions contend on residentVerificationLocks -> exactly one wins", async () => {
  const identity = await createIdentity("race-winner")
  const proofId1 = randomUUID()
  const proofId2 = randomUUID()
  await reserveProof(identity.uid, proofId1)
  await reserveProof(identity.uid, proofId2)

  await adminDb.collection("users").doc(identity.uid).set({
    name: "Juan Dela Cruz",
    initials: "JD",
    email: identity.email,
    role: "resident",
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1990-01-01",
  })

  // Prior rejected verification
  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "Blurry government ID",
    createdAt: Date.now() - 5000,
  })

  const opId1 = `op-race-1-${randomUUID()}`
  const opId2 = `op-race-2-${randomUUID()}`

  const req1 = new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: opId1,
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId1) }],
      reason: "Request 1 proof",
    }),
  })

  const req2 = new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: opId2,
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId2) }],
      reason: "Request 2 proof",
    }),
  })

  // Fire both requests concurrently
  const [res1, res2] = await Promise.all([
    resubmitHandler()(req1),
    resubmitHandler()(req2),
  ])

  const statuses = [res1.status, res2.status].sort()
  // Exactly one must succeed with 200, the other must fail with 409
  assert.deepEqual(statuses, [200, 409], `Expected [200, 409] but got [${res1.status}, ${res2.status}]`)

  const winnerJson = await (res1.status === 200 ? res1.json() : res2.json())
  const loserJson = await (res1.status === 409 ? res1.json() : res2.json())

  assert.equal(winnerJson.success, true)
  assert.equal(winnerJson.idempotent, false)
  assert.ok(winnerJson.verificationId)
  assert.equal(loserJson.code, "PENDING_VERIFICATION_EXISTS")

  // Verify Firestore state: exactly one pending verification
  const verifications = await adminDb
    .collection("verifications")
    .where("residentId", "==", identity.uid)
    .where("status", "==", "pending")
    .get()
  assert.equal(verifications.docs.length, 1)
  assert.equal(verifications.docs[0].id, winnerJson.verificationId)

  // Verify residentVerificationLocks is active and points to winner
  const lock = await adminDb.collection("residentVerificationLocks").doc(identity.uid).get()
  assert.equal(lock.exists, true)
  assert.equal(lock.data()?.activeVerificationStatus, "pending")
  assert.equal(lock.data()?.activeVerificationId, winnerJson.verificationId)
})

test("Resubmission Idempotency: Replaying exact operation succeeds, changed payload returns 409 conflict", async () => {
  const identity = await createIdentity("idempotent-test")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("users").doc(identity.uid).set({
    name: "Ana Reyes",
    initials: "AR",
    email: identity.email,
    role: "resident",
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1992-06-15",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID expired",
    createdAt: Date.now() - 5000,
  })

  const operationId = `op-idemp-${randomUUID()}`
  const initialPayload = {
    operationId,
    proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
    reason: "Clear new passport photo",
  }

  // 1. Initial execution succeeds
  const initialRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(initialPayload),
  }))
  assert.equal(initialRes.status, 200)
  const initialJson = await initialRes.json()
  assert.equal(initialJson.success, true)
  assert.equal(initialJson.idempotent, false)
  const originalVerificationId = initialJson.verificationId

  // 2. Replay with identical payload -> returns idempotent: true with same verificationId
  const replayRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(initialPayload),
  }))
  assert.equal(replayRes.status, 200)
  const replayJson = await replayRes.json()
  assert.equal(replayJson.success, true)
  assert.equal(replayJson.idempotent, true)
  assert.equal(replayJson.verificationId, originalVerificationId)

  // 3. Replay with changed reason -> returns 409 IDEMPOTENCY_CONFLICT
  const changedReasonPayload = { ...initialPayload, reason: "Completely different reason" }
  const changedReasonRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(changedReasonPayload),
  }))
  assert.equal(changedReasonRes.status, 409)
  const changedReasonJson = await changedReasonRes.json()
  assert.equal(changedReasonJson.code, "IDEMPOTENCY_CONFLICT")

  // 4. Replay with changed proof URL -> returns 409 IDEMPOTENCY_CONFLICT
  const changedProofPayload = {
    ...initialPayload,
    proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, randomUUID()) }],
  }
  const changedProofRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(changedProofPayload),
  }))
  assert.equal(changedProofRes.status, 409)
  const changedProofJson = await changedProofRes.json()
  assert.equal(changedProofJson.code, "IDEMPOTENCY_CONFLICT")
})

test("Resubmission Cross-Operation Collision: Cannot reuse finalization operationId for resubmission", async () => {
  const identity = await createIdentity("cross-op")
  const operationId = `cross-op-shared-${randomUUID()}`
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  // Seed a completed registration-finalization operation record
  const opDocId = registrationOperationDocumentId(identity.uid, operationId)
  await adminDb.collection("registrationOperations").doc(opDocId).set({
    uid: identity.uid,
    operationId,
    operationType: "registration-finalization",
    targetId: identity.uid,
    payloadHash: "dummy-hash",
    status: "completed",
    createdAt: Date.now() - 10000,
  })

  await adminDb.collection("users").doc(identity.uid).set({
    name: "Cross Op Resident",
    initials: "CO",
    email: identity.email,
    role: "resident",
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1994-04-10",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID blurry",
    createdAt: Date.now() - 5000,
  })

  // Attempt resubmission using the finalization operationId
  const res = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId,
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
      reason: "Trying cross operation id",
    }),
  }))

  assert.equal(res.status, 409)
  const json = await res.json()
  assert.equal(json.code, "IDEMPOTENCY_CONFLICT")
})

test("Resubmission Lifecycle Matrix: Active, Expired, Locked, Deleted, and Admin roles are rejected", async () => {
  const identity = await createIdentity("lifecycle-tester")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID blurry",
    createdAt: Date.now() - 5000,
  })

  const makeReq = () => new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
      reason: "Testing lifecycle states",
    }),
  })

  // 1. Role: admin -> 403 FORBIDDEN_ROLE
  await adminDb.collection("users").doc(identity.uid).set({
    role: "admin", status: "Active", email: identity.email,
  })
  const adminRes = await resubmitHandler()(makeReq())
  assert.equal(adminRes.status, 403)
  assert.equal((await adminRes.json()).code, "FORBIDDEN_ROLE")

  // 2. Role: resident, status: Active -> 400 ALREADY_VERIFIED
  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident", status: "Active", isVerified: true, email: identity.email, statuses: ["Adult"],
  })
  const activeRes = await resubmitHandler()(makeReq())
  assert.equal(activeRes.status, 400)
  assert.equal((await activeRes.json()).code, "ALREADY_VERIFIED")

  // 3. Role: resident, status: Expired -> 400 EXPIRED_ACCOUNT
  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident", status: "Expired", isVerified: false, email: identity.email, statuses: ["Adult"],
  })
  const expiredRes = await resubmitHandler()(makeReq())
  assert.equal(expiredRes.status, 400)
  assert.equal((await expiredRes.json()).code, "EXPIRED_ACCOUNT")

  // 4. Role: resident, status: Locked -> 403 ACCOUNT_INACTIVE
  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident", status: "Locked", isVerified: false, email: identity.email, statuses: ["Adult"],
  })
  const lockedRes = await resubmitHandler()(makeReq())
  assert.equal(lockedRes.status, 403)
  assert.equal((await lockedRes.json()).code, "ACCOUNT_INACTIVE")

  // 5. Role: resident, status: Deleted -> 403 ACCOUNT_INACTIVE
  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident", status: "Deleted", isVerified: false, email: identity.email, statuses: ["Adult"],
  })
  const deletedRes = await resubmitHandler()(makeReq())
  assert.equal(deletedRes.status, 403)
  assert.equal((await deletedRes.json()).code, "ACCOUNT_INACTIVE")
})

test("Resubmission Document Requirements: Classification mismatch and unauthenticated delivery rejected", async () => {
  const identity = await createIdentity("proof-validator")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  // Resident is Underage (requires School ID or Parent's Valid ID)
  await adminDb.collection("users").doc(identity.uid).set({
    name: "Young Resident",
    initials: "YR",
    email: identity.email,
    role: "resident",
    status: "Pending",
    statuses: ["Underage"],
    isVerified: false,
    dateOfBirth: "2012-08-20",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID unclear",
    createdAt: Date.now() - 5000,
  })

  // 1. Submitting Valid Government ID instead of Parent/School ID -> 400 REQUIRED_PROOF_MISMATCH
  const wrongDocRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
      reason: "Wrong document submitted",
    }),
  }))
  assert.equal(wrongDocRes.status, 400)
  assert.equal((await wrongDocRes.json()).code, "REQUIRED_PROOF_MISMATCH")

  // 2. Submitting unauthenticated delivery type (upload instead of authenticated) -> 403 PROOF_IDENTITY_MISMATCH
  const unauthUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1/talasys/proofs/${identity.uid}/${proofId}.jpg`
  const unauthRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "School ID or Parent's Valid ID", url: unauthUrl }],
    }),
  }))
  assert.equal(unauthRes.status, 403)
  assert.equal((await unauthRes.json()).code, "PROOF_IDENTITY_MISMATCH")

  // 3. Submitting duplicate proofs -> 400 INVALID_PROOF
  const dupRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [
        { name: "School ID or Parent's Valid ID", url: proofUrl(identity.uid, proofId) },
        { name: "School ID or Parent's Valid ID", url: proofUrl(identity.uid, proofId) },
      ],
    }),
  }))
  assert.equal(dupRes.status, 400)
  assert.equal((await dupRes.json()).code, "INVALID_PROOF")
})

test("R10: Missing Cloudinary configuration or provider verifier fails closed", async () => {
  const identity = await createIdentity("r10-failclosed")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident",
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1990-01-01",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID blurry",
    createdAt: Date.now() - 5000,
  })

  const payload = {
    proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
    reason: "Resubmitting with new scan",
  }

  // 1. Calling production handler without verifyAsset and without env config fails closed
  const originalKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY
  const originalSecret = process.env.CLOUDINARY_API_SECRET
  try {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY
    delete process.env.CLOUDINARY_API_SECRET

    const noConfigHandler = createRegistrationResubmissionHandler({
      auth: {
        verifyIdToken: async () => ({ uid: identity.uid }),
      },
      db: adminDb,
      cloudName,
    })

    const res = await noConfigHandler(new Request("http://localhost/api/resident/registration/resubmit", {
      method: "POST",
      headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }))

    assert.equal(res.status, 503)
    const json = await res.json()
    assert.equal(json.code, "PROVIDER_VERIFICATION_UNAVAILABLE")
  } finally {
    if (originalKey) process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY = originalKey
    if (originalSecret) process.env.CLOUDINARY_API_SECRET = originalSecret
  }

  // 2. Calling processRegistrationResubmission without verifyAsset dependency fails closed
  await assert.rejects(
    async () => {
      await processRegistrationResubmission(payload, identity.uid, {
        db: adminDb,
        cloudName,
      })
    },
    (err: any) => {
      assert.equal(err?.status, 503)
      assert.equal(err?.code, "PROVIDER_VERIFICATION_REQUIRED")
      return true
    },
  )
})

test("R10: Provider lookup failure, identity mismatch, and provider error fail closed with zero database writes", async () => {
  const identity = await createIdentity("r10-provider-failures")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident",
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1990-01-01",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID blurry",
    createdAt: Date.now() - 5000,
  })

  const makeReq = () => new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
      reason: "Resubmitting with new scan",
    }),
  })

  // 1. Provider asset lookup failure (404)
  const lookupFailHandler = resubmitHandler({
    verifyAsset: async () => {
      throw registrationHttpError("The uploaded proof asset does not exist on Cloudinary.", 404, "PROOF_ASSET_NOT_FOUND")
    },
  })
  const lookupRes = await lookupFailHandler(makeReq())
  assert.equal(lookupRes.status, 404)
  assert.equal((await lookupRes.json()).code, "PROOF_ASSET_NOT_FOUND")

  // 2. Provider asset identity mismatch (409)
  const mismatchHandler = resubmitHandler({
    verifyAsset: async () => {
      throw registrationHttpError("Uploaded media does not match its reservation.", 409, "PROOF_IDENTITY_MISMATCH")
    },
  })
  const mismatchRes = await mismatchHandler(makeReq())
  assert.equal(mismatchRes.status, 409)
  assert.equal((await mismatchRes.json()).code, "PROOF_IDENTITY_MISMATCH")

  // 3. Provider network or server error (503)
  const providerErrorHandler = resubmitHandler({
    verifyAsset: async () => {
      throw new Error("Cloudinary connection reset by peer")
    },
  })
  const errorRes = await providerErrorHandler(makeReq())
  assert.equal(errorRes.status, 503)
  assert.equal((await errorRes.json()).code, "PROVIDER_VERIFICATION_FAILED")

  // Verify Zero writes in Firestore
  const verifs = await adminDb.collection("verifications")
    .where("residentId", "==", identity.uid)
    .where("status", "==", "pending")
    .get()
  assert.equal(verifs.empty, true, "No pending verification should be written after provider failure")

  const notifs = await adminDb.collection("notifications")
    .where("residentName", "==", "Juan Dela Cruz")
    .get()
  assert.equal(notifs.docs.filter((d: any) => d.data().residentId === identity.uid).length, 0)

  const lock = await adminDb.collection("residentVerificationLocks").doc(identity.uid).get()
  assert.equal(lock.exists, false, "No lock should be written after provider failure")
})

test("R11: Concurrent same-operation requests converge on single authoritative verification ID", async () => {
  const identity = await createIdentity("r11-same-op-race")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident",
    name: "Maria Santos",
    initials: "MS",
    email: identity.email,
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1992-05-15",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "Expired ID",
    createdAt: Date.now() - 5000,
  })

  const sharedOperationId = `op-same-race-${randomUUID()}`
  const payload = {
    operationId: sharedOperationId,
    proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
    reason: "New renewed government ID",
  }

  const makeReq = () => new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })

  // Fire both requests concurrently with the EXACT SAME operationId
  const [res1, res2] = await Promise.all([
    resubmitHandler()(makeReq()),
    resubmitHandler()(makeReq()),
  ])

  // BOTH requests must return HTTP 200 success!
  assert.equal(res1.status, 200, `res1 returned ${res1.status}`)
  assert.equal(res2.status, 200, `res2 returned ${res2.status}`)

  const json1 = await res1.json()
  const json2 = await res2.json()

  assert.equal(json1.success, true)
  assert.equal(json2.success, true)

  // One is the initial commit (idempotent: false), the other is the idempotent replay (idempotent: true)
  const idempotentFlags = [json1.idempotent, json2.idempotent].sort()
  assert.deepEqual(idempotentFlags, [false, true], "One should be initial commit and the other idempotent replay")

  // CRITICAL R11 ASSERTION: Both responses MUST return the EXACT SAME verificationId!
  assert.equal(json1.verificationId, json2.verificationId, "Both same-operation requests must return the identical authoritative verification ID")

  // Verify database: exactly ONE pending verification document exists with that exact ID
  const verifications = await adminDb.collection("verifications")
    .where("residentId", "==", identity.uid)
    .where("status", "==", "pending")
    .get()
  assert.equal(verifications.docs.length, 1)
  assert.equal(verifications.docs[0].id, json1.verificationId)

  // Verify operation document recorded that exact verificationId
  const opDoc = await adminDb.collection("registrationOperations")
    .doc(registrationOperationDocumentId(identity.uid, sharedOperationId))
    .get()
  assert.equal(opDoc.exists, true)
  assert.equal(opDoc.data()?.status, "completed")
  assert.equal(opDoc.data()?.verificationId, json1.verificationId)

  // Verify lock and user pending records match the exact verificationId
  const lockDoc = await adminDb.collection("residentVerificationLocks").doc(identity.uid).get()
  assert.equal(lockDoc.data()?.activeVerificationId, json1.verificationId)

  const userDoc = await adminDb.collection("users").doc(identity.uid).get()
  assert.equal(userDoc.data()?.pendingVerificationId, json1.verificationId)
})

test("R11: Lost HTTP response followed by same-operation retry recovers original verification ID", async () => {
  const identity = await createIdentity("r11-lost-response")
  const proofId = randomUUID()
  await reserveProof(identity.uid, proofId)

  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident",
    name: "Elena Ramos",
    initials: "ER",
    email: identity.email,
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1994-03-22",
  })

  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "Unreadable text",
    createdAt: Date.now() - 5000,
  })

  const operationId = `op-lost-${randomUUID()}`
  const payload = {
    operationId,
    proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId) }],
    reason: "High resolution scan",
  }

  // 1. First attempt commits, but client simulates lost response (e.g. dropped socket)
  const firstRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
  assert.equal(firstRes.status, 200)
  const firstJson = await firstRes.json()
  const originalVerificationId = firstJson.verificationId

  // 2. Client retries with exact same operationId and payload
  const retryRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }))
  assert.equal(retryRes.status, 200)
  const retryJson = await retryRes.json()
  assert.equal(retryJson.success, true)
  assert.equal(retryJson.idempotent, true)
  assert.equal(retryJson.verificationId, originalVerificationId)

  // 3. Exactly one verification exists in database
  const verifications = await adminDb.collection("verifications")
    .where("residentId", "==", identity.uid)
    .where("status", "==", "pending")
    .get()
  assert.equal(verifications.docs.length, 1)
  assert.equal(verifications.docs[0].id, originalVerificationId)
})

test("R13: Lost response with fresh retry receives 409 PENDING_VERIFICATION_EXISTS with authoritative verification ID", async () => {
  const identity = await createIdentity("r13-fresh-recovery")
  const proofId1 = randomUUID()
  const proofId2 = randomUUID()
  await reserveProof(identity.uid, proofId1)
  await reserveProof(identity.uid, proofId2)

  await adminDb.collection("users").doc(identity.uid).set({
    role: "resident",
    name: "R13 Resident",
    initials: "RR",
    email: identity.email,
    status: "Pending",
    statuses: ["Adult"],
    isVerified: false,
    dateOfBirth: "1994-03-22",
  })

  // Prior rejected verification
  await adminDb.collection("verifications").doc(`rejected-${identity.uid}`).set({
    residentId: identity.uid,
    status: "rejected",
    type: "registration",
    rejectionReason: "Photo blurry",
    createdAt: Date.now() - 5000,
  })

  // 1. Initial attempt commits on server
  const opId1 = `op-r13-${randomUUID()}`
  const initialRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: opId1,
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId1) }],
      reason: "Initial clearer photo",
    }),
  }))
  assert.equal(initialRes.status, 200)
  const initialJson = await initialRes.json()
  const authoritativeVerificationId = initialJson.verificationId
  assert.ok(authoritativeVerificationId)

  // 2. Client loses response, and retries with a fresh upload (new operation ID, new URL)
  // Server detects pending verification and returns 409 PENDING_VERIFICATION_EXISTS
  // containing the authoritative verificationId so client can recover it without duplicate submission!
  const opId2 = `op-r13-fresh-${randomUUID()}`
  const freshRetryRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: opId2,
      proofs: [{ name: "Valid Government ID", url: proofUrl(identity.uid, proofId2) }],
      reason: "Fresh upload attempt",
    }),
  }))
  assert.equal(freshRetryRes.status, 409)
  const freshRetryJson = await freshRetryRes.json()
  assert.equal(freshRetryJson.success, false)
  assert.equal(freshRetryJson.code, "PENDING_VERIFICATION_EXISTS")
  assert.equal(freshRetryJson.verificationId, authoritativeVerificationId)

  // 3. Exactly one pending verification exists in database
  const verifications = await adminDb.collection("verifications")
    .where("residentId", "==", identity.uid)
    .where("status", "==", "pending")
    .get()
  assert.equal(verifications.docs.length, 1)
  assert.equal(verifications.docs[0].id, authoritativeVerificationId)
})

test("R14: Server-authoritative verification.delete clears pending state, unlocks resident, and writes audit", async () => {
  const superAdmin = await createIdentity("r14-superadmin")
  const regularResident = await createIdentity("r14-regular-resident")
  const targetResident = await createIdentity("r14-target-resident")

  await adminDb.collection("users").doc(superAdmin.uid).set({
    role: "superadmin",
    status: "Active",
    isVerified: true,
    name: "Super Admin User",
    email: superAdmin.email,
  })

  await adminDb.collection("users").doc(regularResident.uid).set({
    role: "resident",
    status: "Active",
    isVerified: true,
    name: "Regular Resident User",
    email: regularResident.email,
  })

  const verifId = `reg-verif-r14-${randomUUID()}`
  await adminDb.collection("users").doc(targetResident.uid).set({
    role: "resident",
    status: "Pending",
    isVerified: false,
    hasPendingVerification: true,
    pendingVerificationId: verifId,
    name: "Target Resident",
    email: targetResident.email,
    statuses: ["Adult"],
  })

  await adminDb.collection("verifications").doc(verifId).set({
    residentId: targetResident.uid,
    userId: targetResident.uid,
    type: "registration",
    status: "pending",
    name: "Target Resident",
    email: targetResident.email,
    createdAt: Date.now(),
  })

  await adminDb.collection("residentVerificationLocks").doc(targetResident.uid).set({
    residentId: targetResident.uid,
    activeVerificationId: verifId,
    activeVerificationStatus: "pending",
    createdAt: Date.now(),
  })

  const adminOps = (callerUid: string) => createAdminOperationsHandler({
    auth: {
      verifyIdToken: async () => ({ uid: callerUid }),
    } as any,
    db: adminDb,
  })

  // 1. Non-superadmin cannot execute verification.delete (403)
  const deniedRes = await adminOps(regularResident.uid)(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: `Bearer ${regularResident.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "verification.delete",
      operationId: `op-del-denied-${randomUUID()}`,
      targetId: verifId,
    }),
  }))
  assert.equal(deniedRes.status, 403)

  // Verification and locks still intact
  assert.equal((await adminDb.collection("verifications").doc(verifId).get()).exists, true)
  assert.equal((await adminDb.collection("users").doc(targetResident.uid).get()).data()?.hasPendingVerification, true)

  // 2. Super Admin executes verification.delete successfully
  const deleteOpId = `op-del-success-${randomUUID()}`
  const deleteRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "verification.delete",
      operationId: deleteOpId,
      targetId: verifId,
    }),
  }))
  assert.equal(deleteRes.status, 200)
  const deleteJson = await deleteRes.json()
  assert.equal(deleteJson.success, true)
  assert.equal(deleteJson.idempotent, false)

  // 3. Verification document is deleted
  assert.equal((await adminDb.collection("verifications").doc(verifId).get()).exists, false)

  // 4. Resident user record has pending flags cleared
  const userSnap = await adminDb.collection("users").doc(targetResident.uid).get()
  assert.equal(userSnap.data()?.hasPendingVerification, false)
  assert.equal(userSnap.data()?.pendingVerificationId, null)

  // 5. Verification lock is cleared/unlocked
  const lockSnap = await adminDb.collection("residentVerificationLocks").doc(targetResident.uid).get()
  assert.equal(lockSnap.data()?.activeVerificationStatus, "deleted")
  assert.equal(lockSnap.data()?.activeVerificationId, null)

  // 6. Authoritative audit log was created
  const auditLogs = await adminDb.collection("activityLogs").where("targetId", "==", verifId).get()
  assert.equal(auditLogs.docs.length, 1)
  const auditData = auditLogs.docs[0].data()
  assert.equal(auditData.action, "verification.delete")
  assert.equal(auditData.actor.id, superAdmin.uid)
  assert.equal(auditData.authoritative, true)
  assert.equal(auditData.before.type, "registration")
  assert.equal(auditData.after, null)

  // 7. Idempotent replay succeeds without modification
  const replayRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "verification.delete",
      operationId: deleteOpId,
      targetId: verifId,
    }),
  }))
  assert.equal(replayRes.status, 200)
  const replayJson = await replayRes.json()
  assert.equal(replayJson.success, true)
  assert.equal(replayJson.idempotent, true)

  // 8. Super Admin deleting nonexistent verification produces 404
  const notFoundRes = await adminOps(superAdmin.uid)(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: `Bearer ${superAdmin.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "verification.delete",
      operationId: `op-del-404-${randomUUID()}`,
      targetId: "nonexistent-verif-id",
    }),
  }))
  assert.equal(notFoundRes.status, 404)
})
