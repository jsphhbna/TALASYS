import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createRegistrationFinalizationHandler } from "../../app/api/resident/registration/finalize/route.ts"
import { createRegistrationStatusHandler } from "../../app/api/resident/registration/status/route.ts"
import { createRegistrationResubmissionHandler } from "../../app/api/resident/registration/resubmit/route.ts"
import { createCloudinarySignHandler } from "../../app/api/cloudinary/sign/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"
import { calculateAge, deriveStatusesFromAge } from "../../lib/resident/resident-status.ts"
import {
  callRegistrationFinalizer,
  completeFreshRegistration,
} from "../../lib/resident/registration-finalization-client.ts"

const cloudName = "recovery-resubmission-cloud"
const createdUids = new Set<string>()

function proofUrl(id: string, cloud = cloudName) {
  return `https://res.cloudinary.com/${cloud}/image/authenticated/v1/talasys/proofs/registration/${id}.jpg`
}

function registryId(id: string) {
  return mediaRegistryDocumentId(cloudName, "image", `talasys/proofs/registration/${id}`)
}

async function createIdentity(label: string) {
  const uid = `rec-${label}-${randomUUID()}`
  const email = `${uid}@example.test`
  await adminAuth.createUser({ uid, email, password: "Valid123!Password" })
  createdUids.add(uid)
  return { uid, email }
}

async function reserve(id: string, capability: string, overrides: Record<string, unknown> = {}) {
  await adminDb.collection("mediaRegistry").doc(registryId(id)).set({
    cloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: `talasys/proofs/registration/${id}`,
    ownerUid: null,
    status: "reserved",
    capabilityHash: createHash("sha256").update(capability).digest("hex"),
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    testSuite: "recovery-resubmission",
    ...overrides,
  })
}

function body(email: string, id: string, capability: string, operationId = randomUUID()) {
  return {
    operationId,
    resident: {
      firstName: "Maria",
      lastName: "Santos",
      middleInitial: "B",
      email,
      gender: "Female",
      dateOfBirth: "1995-05-15",
      contactNumber: "09181234567",
      street: "123 Mabini St",
      barangay: "634",
      city: "Manila",
      statuses: ["Adult"],
    },
    proofs: [{
      name: "Valid Government ID",
      filename: "valid-id.jpg",
      url: proofUrl(id),
      uploadDate: "Oct 15, 2026",
      claimToken: capability,
    }],
  }
}

function request(uid: string, value: unknown) {
  return new Request("http://localhost/api/resident/registration/finalize", {
    method: "POST",
    headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" },
    body: JSON.stringify(value),
  })
}

function finalizationHandler(overrides: {
  verifyAsset?: (asset: any) => Promise<void>
  getUser?: (uid: string) => Promise<any>
  verifyIdToken?: (token: string, checkRevoked: boolean) => Promise<any>
} = {}) {
  return createRegistrationFinalizationHandler({
    auth: {
      verifyIdToken: overrides.verifyIdToken || (async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      }),
      getUser: overrides.getUser || ((uid: string) => adminAuth.getUser(uid)),
    },
    db: adminDb,
    cloudName,
    now: Date.now,
    verifyAsset: overrides.verifyAsset || (async () => {}),
  })
}

function statusHandler(overrides: {
  getUser?: (uid: string) => Promise<any>
  verifyIdToken?: (token: string, checkRevoked: boolean) => Promise<any>
} = {}) {
  return createRegistrationStatusHandler({
    auth: {
      verifyIdToken: overrides.verifyIdToken || (async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      }),
      getUser: overrides.getUser || ((uid: string) => adminAuth.getUser(uid)),
    },
    db: adminDb,
  })
}

function resubmitHandler(overrides: {
  verifyIdToken?: (token: string, checkRevoked: boolean) => Promise<any>
} = {}) {
  return createRegistrationResubmissionHandler({
    auth: {
      verifyIdToken: overrides.verifyIdToken || (async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      }),
    },
    db: adminDb,
  })
}

function signHandler(overrides: {
  verifyIdToken?: (token: string, checkRevoked: boolean) => Promise<any>
} = {}) {
  return createCloudinarySignHandler({
    auth: {
      verifyIdToken: overrides.verifyIdToken || (async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      }),
    },
    db: adminDb,
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
      adminDb.collection("verifications").doc(uid).delete(),
      adminDb.collection("notifications").doc(`reg-${uid}`).delete(),
    ])
  }
  const registrySnapshot = await adminDb.collection("mediaRegistry").where("testSuite", "==", "recovery-resubmission").get()
  const registryBatch = adminDb.batch()
  for (const d of registrySnapshot.docs) registryBatch.delete(d.ref)
  await registryBatch.commit()
})

// ============================================================================
// SECTION 1: AUTH PRESERVATION ON RETRY FAILURES & CONCURRENCY
// ============================================================================

test("Issue 1: First request commits, response is lost, retry experiences auth.getUser failure -> Auth preserved", async () => {
  const identity = await createIdentity("lost-user-fail")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)

  // 1. First request commits successfully
  const firstResponse = await finalizationHandler()(request(identity.uid, payload))
  assert.equal(firstResponse.status, 200)

  // 2. Retry experiences transient auth.getUser failure
  const failingHandler = finalizationHandler({
    getUser: async () => { throw new Error("transient Auth service outage") },
  })
  const retryResponse = await failingHandler(request(identity.uid, payload))
  assert.equal(retryResponse.status, 503)
  const retryJson = await retryResponse.json()
  assert.equal(retryJson.committed, "unknown")

  // Critical invariant: Auth identity must remain intact in Firebase Auth
  const authRecord = await adminAuth.getUser(identity.uid)
  assert.equal(authRecord.uid, identity.uid)
  // Firestore registration records must also remain intact
  const userDoc = await adminDb.collection("users").doc(identity.uid).get()
  assert.equal(userDoc.exists, true)
})

test("Issue 1: First request commits, response is lost, retry experiences token verification failure -> Auth preserved", async () => {
  const identity = await createIdentity("lost-token-fail")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)

  // 1. First request commits
  const firstResponse = await finalizationHandler()(request(identity.uid, payload))
  assert.equal(firstResponse.status, 200)

  // 2. Retry experiences token verification failure
  const failingTokenHandler = finalizationHandler({
    verifyIdToken: async () => { throw new Error("token expired or network failure") },
  })
  const retryResponse = await failingTokenHandler(request(identity.uid, payload))
  assert.equal(retryResponse.status, 401)
  const retryJson = await retryResponse.json()
  assert.equal(retryJson.committed, "unknown")

  // Auth preserved
  const authRecord = await adminAuth.getUser(identity.uid)
  assert.equal(authRecord.uid, identity.uid)
})

test("Issue 1: First request commits, response is lost, retry with conflicting payload returns 409 -> Auth preserved", async () => {
  const identity = await createIdentity("lost-conflict")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)

  // 1. First request commits
  const firstResponse = await finalizationHandler()(request(identity.uid, payload))
  assert.equal(firstResponse.status, 200)

  // 2. Retry sends conflicting payload with same operationId
  const conflictingPayload = structuredClone(payload)
  conflictingPayload.resident.firstName = "ConflictingName"
  const conflictResponse = await finalizationHandler()(request(identity.uid, conflictingPayload))
  assert.equal(conflictResponse.status, 409)
  const conflictJson = await conflictResponse.json()
  assert.equal(conflictJson.code, "IDEMPOTENCY_CONFLICT")
  assert.equal(conflictJson.committed, "unknown")

  // Auth preserved and original Firestore record unchanged
  const authRecord = await adminAuth.getUser(identity.uid)
  assert.equal(authRecord.uid, identity.uid)
  const userDoc = await adminDb.collection("users").doc(identity.uid).get()
  assert.equal(userDoc.data()?.firstName, "Maria")
})

test("Issue 1: Preflight fails before commit -> Auth preserved, zero Firestore registration writes", async () => {
  const identity = await createIdentity("preflight-fail")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  payload.resident.gender = "InvalidGender"

  const response = await finalizationHandler()(request(identity.uid, payload))
  assert.equal(response.status, 400)
  const json = await response.json()
  assert.equal(json.committed, false)

  // Auth preserved
  const authRecord = await adminAuth.getUser(identity.uid)
  assert.equal(authRecord.uid, identity.uid)
  // No registration written
  const userDoc = await adminDb.collection("users").doc(identity.uid).get()
  assert.equal(userDoc.exists, false)
})

// ============================================================================
// SECTION 2: SERVER-AUTHORITATIVE REGISTRATION RECOVERY
// ============================================================================

test("Issue 2: GET /api/resident/registration/status distinguishes completed, incomplete, rejected, and existing resident", async () => {
  // 1. Incomplete registration applicant (Auth account created, but no user document in Firestore)
  const incompleteIdentity = await createIdentity("status-incomplete")
  const incompleteReq = new Request("http://localhost/api/resident/registration/status", {
    headers: { Authorization: `Bearer ${incompleteIdentity.uid}` },
  })
  const incompleteRes = await statusHandler()(incompleteReq)
  assert.equal(incompleteRes.status, 200)
  const incompleteData = await incompleteRes.json()
  assert.equal(incompleteData.status, "incomplete")
  assert.equal(incompleteData.uid, incompleteIdentity.uid)

  // 2. Completed registration (finalized, pending verification)
  const completedIdentity = await createIdentity("status-completed")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(completedIdentity.email, id, capability)
  await finalizationHandler()(request(completedIdentity.uid, payload))

  const completedReq = new Request(`http://localhost/api/resident/registration/status?operationId=${payload.operationId}`, {
    headers: { Authorization: `Bearer ${completedIdentity.uid}` },
  })
  const completedRes = await statusHandler()(completedReq)
  assert.equal(completedRes.status, 200)
  const completedData = await completedRes.json()
  assert.equal(completedData.status, "completed")
  assert.equal(completedData.uid, completedIdentity.uid)

  // 3. Rejected registration
  const rejectedIdentity = await createIdentity("status-rejected")
  await adminDb.collection("users").doc(rejectedIdentity.uid).set({
    role: "resident", status: "Pending", isVerified: false, email: rejectedIdentity.email,
  })
  await adminDb.collection("verifications").doc(rejectedIdentity.uid).set({
    residentId: rejectedIdentity.uid, status: "rejected", type: "registration",
    rejectionReason: "ID image is blurry and illegible", createdAt: Date.now(),
  })
  const rejectedReq = new Request("http://localhost/api/resident/registration/status", {
    headers: { Authorization: `Bearer ${rejectedIdentity.uid}` },
  })
  const rejectedRes = await statusHandler()(rejectedReq)
  assert.equal(rejectedRes.status, 200)
  const rejectedData = await rejectedRes.json()
  assert.equal(rejectedData.status, "rejected")
  assert.equal(rejectedData.details.verificationStatus, "rejected")
  assert.equal(rejectedData.details.rejectionReason, "ID image is blurry and illegible")

  // 4. Existing active resident
  const existingIdentity = await createIdentity("status-existing")
  await adminDb.collection("users").doc(existingIdentity.uid).set({
    role: "resident", status: "Active", isVerified: true, email: existingIdentity.email,
  })
  const existingReq = new Request("http://localhost/api/resident/registration/status", {
    headers: { Authorization: `Bearer ${existingIdentity.uid}` },
  })
  const existingRes = await statusHandler()(existingReq)
  assert.equal(existingRes.status, 200)
  const existingData = await existingRes.json()
  assert.equal(existingData.status, "existing-resident")
})

test("Issue 2: Cloudinary sign route grants incomplete registration applicants strictly proofs-folder signing", async () => {
  const incompleteIdentity = await createIdentity("sign-incomplete")
  process.env.CLOUDINARY_API_SECRET = "mock_secret"
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = cloudName

  // 1. Allowed: proofs folder
  const allowedReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${incompleteIdentity.uid}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ folder: "talasys/proofs" }),
  })
  const allowedRes = await signHandler()(allowedReq)
  assert.equal(allowedRes.status, 200)
  const allowedData = await allowedRes.json()
  assert.equal(allowedData.folder, "talasys/proofs")
  assert.ok(allowedData.publicId.startsWith("registration/"))
  assert.ok(typeof allowedData.claimToken === "string" && allowedData.claimToken)

  // Verify registry entry was created as reserved
  const fullId = `talasys/proofs/${allowedData.publicId}`
  const registryDoc = await adminDb.collection("mediaRegistry").doc(mediaRegistryDocumentId(cloudName, "image", fullId)).get()
  assert.equal(registryDoc.exists, true)
  assert.equal(registryDoc.data()?.status, "reserved")
  assert.equal(registryDoc.data()?.ownerUid, null)

  // 2. Forbidden: arbitrary/privileged folders like signatures or residents
  for (const forbiddenFolder of ["talasys/signatures", "talasys/residents", "talasys/letters"]) {
    const forbiddenReq = new Request("http://localhost/api/cloudinary/sign", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${incompleteIdentity.uid}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folder: forbiddenFolder }),
    })
    const forbiddenRes = await signHandler()(forbiddenReq)
    assert.equal(forbiddenRes.status, 403)
  }
})

// ============================================================================
// SECTION 3: REGISTRATION RESUBMISSION HARDENING
// ============================================================================

test("Issue 3: POST /api/resident/registration/resubmit enforces lifecycle rules and prevents duplicate pending requests", async () => {
  const identity = await createIdentity("resubmit-test")
  await adminDb.collection("users").doc(identity.uid).set({
    name: "Maria Santos",
    initials: "MS",
    email: identity.email,
    role: "resident",
    status: "Pending",
    isVerified: false,
    dateOfBirth: "1995-05-15",
  })

  // 1. Attempt resubmission without prior rejection -> rejected with 400
  const noRejectRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid ID", url: "https://example.test/id.jpg" }],
    }),
  }))
  assert.equal(noRejectRes.status, 400)

  // 2. Set prior rejected verification
  const priorVRef = adminDb.collection("verifications").doc(`rejected-${identity.uid}`)
  await priorVRef.set({
    residentId: identity.uid,
    userId: identity.uid,
    type: "registration",
    status: "rejected",
    rejectionReason: "ID blurry",
    createdAt: Date.now() - 10000,
  })

  // 3. Resubmission succeeds
  const successRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid ID", url: "https://example.test/new-id.jpg" }],
      reason: "Uploaded clearer photo",
    }),
  }))
  assert.equal(successRes.status, 200)
  const successJson = await successRes.json()
  assert.equal(successJson.success, true)
  assert.ok(successJson.verificationId)

  // Verify verification document created with pending status
  const newV = await adminDb.collection("verifications").doc(successJson.verificationId).get()
  assert.equal(newV.exists, true)
  assert.equal(newV.data()?.status, "pending")
  assert.equal(newV.data()?.type, "registration")

  // 4. Attempt duplicate resubmission while pending -> rejected with 409
  const duplicateRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid ID", url: "https://example.test/another-id.jpg" }],
    }),
  }))
  assert.equal(duplicateRes.status, 409)

  // 5. Approved resident cannot resubmit registration
  await adminDb.collection("users").doc(identity.uid).update({ isVerified: true })
  const approvedRes = await resubmitHandler()(new Request("http://localhost/api/resident/registration/resubmit", {
    method: "POST",
    headers: { Authorization: `Bearer ${identity.uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      proofs: [{ name: "Valid ID", url: "https://example.test/new-id.jpg" }],
    }),
  }))
  assert.equal(approvedRes.status, 400)
})

// ============================================================================
// SECTION 4: ASIA/MANILA CALENDAR DAY AGE CALCULATION REGRESSIONS
// ============================================================================

test("Issue 4: Asia/Manila birthday classification handles Manila midnight and edge cases independently of host timezone", () => {
  // Test 1: Resident born 2008-10-15 turns 18 at Manila midnight on 2026-10-15
  // Manila midnight (2026-10-15T00:00:00+08:00) in UTC is 2026-10-14T16:00:00.000Z
  const manilaMidnight18 = Date.parse("2026-10-14T16:00:00.000Z")
  const ageAtMidnight = calculateAge("2008-10-15", manilaMidnight18)
  assert.equal(ageAtMidnight, 18)
  assert.deepEqual(deriveStatusesFromAge(ageAtMidnight!), ["Adult"])

  // 1ms before Manila midnight (2026-10-14T23:59:59.999+08:00 = 2026-10-14T15:59:59.999Z)
  const beforeMidnight18 = Date.parse("2026-10-14T15:59:59.999Z")
  const ageBeforeMidnight = calculateAge("2008-10-15", beforeMidnight18)
  assert.equal(ageBeforeMidnight, 17)
  assert.deepEqual(deriveStatusesFromAge(ageBeforeMidnight!), ["Underage"])

  // Date immediately before birthday (2026-10-14 at noon Manila time)
  const dayBefore18 = Date.parse("2026-10-14T04:00:00.000Z")
  assert.equal(calculateAge("2008-10-15", dayBefore18), 17)

  // Date immediately after birthday (2026-10-16 at noon Manila time)
  const dayAfter18 = Date.parse("2026-10-16T04:00:00.000Z")
  assert.equal(calculateAge("2008-10-15", dayAfter18), 18)

  // Test 2: Resident born 1966-10-15 turns 60 at Manila midnight on 2026-10-15
  const ageAtMidnight60 = calculateAge("1966-10-15", manilaMidnight18)
  assert.equal(ageAtMidnight60, 60)
  assert.deepEqual(deriveStatusesFromAge(ageAtMidnight60!), ["Senior Citizen"])

  const ageBeforeMidnight60 = calculateAge("1966-10-15", beforeMidnight18)
  assert.equal(ageBeforeMidnight60, 59)
  assert.deepEqual(deriveStatusesFromAge(ageBeforeMidnight60!), ["Adult"])

  // Test 3: February 29 leap day birthday in non-leap year (2026)
  // Born 2008-02-29
  // In 2026 (non-leap year): on Feb 28 Manila time, age is 17
  const feb28Manila = Date.parse("2026-02-28T04:00:00.000Z")
  assert.equal(calculateAge("2008-02-29", feb28Manila), 17)

  // On March 1 Manila time, age is 18
  const mar1Manila = Date.parse("2026-03-01T04:00:00.000Z")
  assert.equal(calculateAge("2008-02-29", mar1Manila), 18)

  // In 2028 (leap year): on Feb 28 age 19, on Feb 29 age 20
  const feb28Leap = Date.parse("2028-02-28T04:00:00.000Z")
  const feb29Leap = Date.parse("2028-02-29T04:00:00.000Z")
  assert.equal(calculateAge("2008-02-29", feb28Leap), 19)
  assert.equal(calculateAge("2008-02-29", feb29Leap), 20)
})
