import { after, test } from "node:test"
import assert from "node:assert/strict"
import { createHash, randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createRegistrationFinalizationHandler } from "../../app/api/resident/registration/finalize/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"
import { registrationOperationDocumentId } from "../../lib/security/registration-finalization.ts"
import {
  callRegistrationFinalizer,
  completeFreshRegistration,
} from "../../lib/resident/registration-finalization-client.ts"

const cloudName = "registration-finalization-cloud"
const createdUids = new Set<string>()

function proofUrl(id: string, cloud = cloudName) {
  return `https://res.cloudinary.com/${cloud}/image/authenticated/v1/talasys/proofs/registration/${id}.jpg`
}

function registryId(id: string) {
  return mediaRegistryDocumentId(cloudName, "image", `talasys/proofs/registration/${id}`)
}

async function createIdentity(label: string) {
  const uid = `registration-${label}-${randomUUID()}`
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
    testSuite: "registration-finalization",
    ...overrides,
  })
}

function body(email: string, id: string, capability: string, operationId = randomUUID()) {
  return {
    operationId,
    resident: {
      firstName: "Juan",
      lastName: "Dela Cruz",
      middleInitial: "A",
      email,
      gender: "Male",
      dateOfBirth: "1990-01-01",
      contactNumber: "09171234567",
      street: "1 Main Street",
      barangay: "634",
      city: "Manila",
      statuses: ["Adult"],
    },
    proofs: [{
      name: "Valid Government ID",
      filename: "government-id.jpg",
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

function handler(verifyAsset: (asset: any) => Promise<void> = async () => {}) {
  return createRegistrationFinalizationHandler({
    auth: {
      verifyIdToken: async (token: string, checkRevoked: boolean) => {
        assert.equal(checkRevoked, true)
        await adminAuth.getUser(token)
        return { uid: token }
      },
      getUser: (uid: string) => adminAuth.getUser(uid),
    },
    db: adminDb,
    cloudName,
    now: Date.now,
    verifyAsset,
  })
}

async function assertNoRegistration(uid: string, operationId: string, id: string, expectedReservationStatus = "reserved") {
  const [user, verification, notification, operation, reservation] = await Promise.all([
    adminDb.collection("users").doc(uid).get(),
    adminDb.collection("verifications").doc(uid).get(),
    adminDb.collection("notifications").doc(`reg-${uid}`).get(),
    adminDb.collection("registrationOperations").doc(registrationOperationDocumentId(uid, operationId)).get(),
    adminDb.collection("mediaRegistry").doc(registryId(id)).get(),
  ])
  assert.equal(user.exists, false)
  assert.equal(verification.exists, false)
  assert.equal(notification.exists, false)
  assert.equal(operation.exists, false)
  if (reservation.exists) {
    assert.equal(reservation.data()?.status, expectedReservationStatus)
    assert.equal(reservation.data()?.ownerUid, expectedReservationStatus === "claimed" ? "another-user" : null)
  }
}

after(async () => {
  for (const uid of createdUids) {
    const operations = await adminDb.collection("registrationOperations").where("uid", "==", uid).get()
    const operationBatch = adminDb.batch()
    for (const operation of operations.docs) operationBatch.delete(operation.ref)
    await operationBatch.commit()
    await Promise.all([
      adminAuth.deleteUser(uid).catch(() => {}),
      adminDb.collection("users").doc(uid).delete(),
      adminDb.collection("verifications").doc(uid).delete(),
      adminDb.collection("notifications").doc(`reg-${uid}`).delete(),
    ])
  }
  for (const collectionName of ["mediaRegistry"]) {
    const snapshot = await adminDb.collection(collectionName).where("testSuite", "==", "registration-finalization").get()
    const batch = adminDb.batch()
    for (const document of snapshot.docs) batch.delete(document.ref)
    await batch.commit()
  }
})

test("atomic registration finalization creates one authoritative registration and claims its proof", async () => {
  const identity = await createIdentity("success")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  const response = await handler()(request(identity.uid, payload))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).idempotent, false)
  const authUser = await adminAuth.getUser(identity.uid)
  const [user, verification, notification, operation, reservation] = await Promise.all([
    adminDb.collection("users").doc(identity.uid).get(),
    adminDb.collection("verifications").doc(identity.uid).get(),
    adminDb.collection("notifications").doc(`reg-${identity.uid}`).get(),
    adminDb.collection("registrationOperations").doc(registrationOperationDocumentId(identity.uid, payload.operationId)).get(),
    adminDb.collection("mediaRegistry").doc(registryId(id)).get(),
  ])
  assert.equal(authUser.email, identity.email)
  assert.deepEqual({ role: user.data()?.role, status: user.data()?.status, isVerified: user.data()?.isVerified, accountExpiry: user.data()?.accountExpiry }, {
    role: "resident", status: "Pending", isVerified: false, accountExpiry: "",
  })
  assert.equal(verification.data()?.type, "registration")
  assert.equal(verification.data()?.status, "pending")
  assert.equal(notification.data()?.type, "registration")
  assert.equal(operation.data()?.status, "completed")
  assert.equal(reservation.data()?.ownerUid, identity.uid)
  assert.equal(reservation.data()?.status, "claimed")
  assert.equal(reservation.data()?.capabilityHash, null)
  assert.equal(reservation.data()?.expiresAt, null)
})

test("finalization replay is idempotent and a changed payload conflicts without mutation", async () => {
  const identity = await createIdentity("replay")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  assert.equal((await handler()(request(identity.uid, payload))).status, 200)
  const replay = await handler()(request(identity.uid, payload))
  assert.equal(replay.status, 200)
  assert.equal((await replay.json()).idempotent, true)
  const changed = structuredClone(payload)
  changed.resident.firstName = "Changed"
  assert.equal((await handler()(request(identity.uid, changed))).status, 409)
  assert.equal((await adminDb.collection("users").doc(identity.uid).get()).data()?.name, "Juan A. Dela Cruz")
  assert.equal((await adminDb.collection("notifications").where("operationId", "==", payload.operationId).get()).size, 1)
  assert.equal((await adminDb.collection("verifications").where("operationId", "==", payload.operationId).get()).size, 1)
})

test("concurrent identical finalizations resolve to one logical registration", async () => {
  const identity = await createIdentity("concurrent")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  const responses = await Promise.all([
    handler()(request(identity.uid, payload)),
    handler()(request(identity.uid, payload)),
  ])
  assert.deepEqual(responses.map(response => response.status), [200, 200])
  const results = await Promise.all(responses.map(response => response.json()))
  assert.equal(results.filter(result => result.idempotent === false).length, 1)
  assert.equal(results.filter(result => result.idempotent === true).length, 1)
  assert.equal((await adminDb.collection("notifications").where("operationId", "==", payload.operationId).get()).size, 1)
})

test("lost response after a committed transaction retries the same operation without deleting Auth or duplicating records", async () => {
  const identity = await createIdentity("lost-response")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  let calls = 0
  let authDeleteAttempts = 0
  let emailAttempts = 0
  const route = handler()
  const completion = await completeFreshRegistration({
    finalize: () => callRegistrationFinalizer(async (_input, init) => {
      calls++
      const response = await route(new Request("http://localhost/api/resident/registration/finalize", init))
      if (calls === 1) {
        assert.equal(response.status, 200)
        throw new TypeError("simulated response loss after commit")
      }
      return response
    }, identity.uid, payload),
    deleteFreshAuth: async () => { authDeleteAttempts++ },
    sendVerificationEmail: async () => { emailAttempts++ },
    signOut: async () => {},
  })
  assert.equal(completion.verificationEmailSent, true)
  assert.equal(calls, 2)
  assert.equal(authDeleteAttempts, 0)
  assert.equal(emailAttempts, 1)
  assert.equal((await adminAuth.getUser(identity.uid)).uid, identity.uid)
  assert.equal((await adminDb.collection("users").where("id", "==", identity.uid).get()).size, 1)
  assert.equal((await adminDb.collection("verifications").where("operationId", "==", payload.operationId).get()).size, 1)
  assert.equal((await adminDb.collection("notifications").where("operationId", "==", payload.operationId).get()).size, 1)
  assert.equal((await adminDb.collection("registrationOperations").where("uid", "==", identity.uid).get()).size, 1)
  assert.equal((await adminDb.collection("mediaRegistry").doc(registryId(id)).get()).data()?.ownerUid, identity.uid)
})

test("invalid, unknown, expired, wrong resource/public identity, and conflicting proof reservations produce zero registration writes", async () => {
  for (const scenario of ["forged", "unknown", "expired", "identity", "resource", "owner"] as const) {
    const identity = await createIdentity(scenario)
    const id = randomUUID()
    const capability = randomUUID()
    if (scenario !== "unknown") {
      await reserve(id, capability, scenario === "expired"
        ? { expiresAt: Date.now() - 1 }
        : scenario === "identity"
          ? { publicId: `talasys/proofs/registration/${id}-different` }
          : scenario === "resource"
            ? { resourceType: "video" }
          : scenario === "owner"
            ? { status: "claimed", ownerUid: "another-user", capabilityHash: null, expiresAt: null }
            : {})
    }
    const payload = body(identity.email, id, scenario === "forged" ? "forged-capability" : capability)
    const response = await handler()(request(identity.uid, payload))
    assert.ok([403, 404, 409, 410].includes(response.status), `${scenario} returned ${response.status}`)
    await assertNoRegistration(identity.uid, payload.operationId, id, scenario === "owner" ? "claimed" : "reserved")
  }

  const identity = await createIdentity("wrong-cloud")
  const id = randomUUID()
  const payload = body(identity.email, id, randomUUID())
  payload.proofs[0].url = proofUrl(id, "wrong-cloud")
  assert.equal((await handler()(request(identity.uid, payload))).status, 403)
  await assertNoRegistration(identity.uid, payload.operationId, id)
})

test("provider verification failure happens before the transaction and leaves every Firestore effect uncommitted", async () => {
  const identity = await createIdentity("provider")
  const id = randomUUID()
  const capability = randomUUID()
  await reserve(id, capability)
  const payload = body(identity.email, id, capability)
  const response = await handler(async () => { throw new Error("controlled provider rejection") })(request(identity.uid, payload))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).committed, false)
  await assertNoRegistration(identity.uid, payload.operationId, id)
})

test("server validation rejects privileged fields and Auth-email mismatches before any write", async () => {
  for (const scenario of ["privileged", "email-mismatch"] as const) {
    const identity = await createIdentity(`validation-${scenario}`)
    const id = randomUUID()
    const capability = randomUUID()
    await reserve(id, capability)
    const payload: any = body(identity.email, id, capability)
    if (scenario === "privileged") payload.resident.role = "admin"
    else payload.resident.email = "different@example.test"
    const response = await handler()(request(identity.uid, payload))
    assert.ok([400, 403].includes(response.status))
    await assertNoRegistration(identity.uid, payload.operationId, id)
  }
})
