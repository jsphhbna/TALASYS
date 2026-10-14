import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { adminDb } from "../../lib/firebase-admin.ts"
import { createMediaClaimHandler } from "../../app/api/media/claim/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"

const cloudName = "claim-test-cloud"
const callerUid = "media-claim-owner"
const otherUid = "media-claim-other"
const auth = { verifyIdToken: async (token: string) => ({ uid: token }) }
const verifyAsset = async () => {}

function url(id: string, cloud = cloudName) {
  return `https://res.cloudinary.com/${cloud}/image/authenticated/v1/talasys/proofs/registration/${id}.jpg`
}

function registryId(id: string) {
  return mediaRegistryDocumentId(cloudName, "image", `talasys/proofs/registration/${id}`)
}

function capabilityHash(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

async function reserve(id: string, capability: string, overrides: Record<string, unknown> = {}) {
  await adminDb.collection("mediaRegistry").doc(registryId(id)).set({
    cloudName,
    resourceType: "image",
    deliveryType: "authenticated",
    publicId: `talasys/proofs/registration/${id}`,
    ownerUid: null,
    status: "reserved",
    capabilityHash: capabilityHash(capability),
    expiresAt: Date.now() + 60_000,
    createdAt: Date.now(),
    ...overrides,
  })
}

function request(uid: string, claims: unknown[], ticket?: string) {
  return new Request("http://localhost/api/media/claim", {
    method: "POST",
    headers: { Authorization: `Bearer ${uid}`, "Content-Type": "application/json" },
    body: JSON.stringify({ claims, ...(ticket === undefined ? {} : { ticket }) }),
  })
}

function handler() {
  return createMediaClaimHandler({ auth, db: adminDb, cloudName, verifyAsset, now: Date.now })
}

before(async () => {
  await Promise.all([
    adminDb.collection("users").doc(callerUid).set({ role: "resident", status: "Pending" }),
    adminDb.collection("users").doc(otherUid).set({ role: "resident", status: "Pending" }),
  ])
})

after(async () => {
  const reservations = await adminDb.collection("mediaRegistry").where("cloudName", "==", cloudName).get()
  const batch = adminDb.batch()
  for (const document of reservations.docs) batch.delete(document.ref)
  batch.delete(adminDb.collection("users").doc(callerUid))
  batch.delete(adminDb.collection("users").doc(otherUid))
  await batch.commit()
})

test("media claim denies forged capabilities, unknown reservations, wrong clouds, expiry, and conflicting owners without writes", async () => {
  await reserve("forged", "genuine")
  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("forged"), claimToken: "invented" }]))).status, 403)
  assert.equal((await adminDb.collection("mediaRegistry").doc(registryId("forged")).get()).data()?.status, "reserved")

  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("unknown"), claimToken: "invented" }]))).status, 404)
  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("forged", "foreign-cloud"), claimToken: "genuine" }]))).status, 403)

  await reserve("expired", "expired-cap", { expiresAt: Date.now() - 1 })
  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("expired"), claimToken: "expired-cap" }]))).status, 410)

  await reserve("owned", "old-cap", { ownerUid: otherUid, status: "claimed", capabilityHash: null, expiresAt: null })
  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("owned"), claimToken: "old-cap" }]))).status, 409)

  await reserve("ticket", "ticket-cap")
  assert.equal((await handler()(request(callerUid, [{ mediaUrl: url("ticket"), claimToken: "ticket-cap" }], "forged.ticket"))).status, 401)
  assert.equal((await adminDb.collection("mediaRegistry").doc(registryId("ticket")).get()).data()?.status, "reserved")
})

test("genuine reservation is claimed atomically and same-owner retry does not require or reveal the capability", async () => {
  await reserve("genuine", "genuine-cap")
  const first = await handler()(request(callerUid, [{ mediaUrl: url("genuine"), claimToken: "genuine-cap" }]))
  assert.equal(first.status, 200)
  assert.deepEqual(await first.json(), { success: true, requestedCount: 1, claimedCount: 1 })
  const stored = (await adminDb.collection("mediaRegistry").doc(registryId("genuine")).get()).data()
  assert.equal(stored?.ownerUid, callerUid)
  assert.equal(stored?.status, "claimed")
  assert.equal(stored?.capabilityHash, null)

  const retry = await handler()(request(callerUid, [{ mediaUrl: url("genuine") }]))
  assert.equal(retry.status, 200)
  assert.equal((await retry.json()).claimedCount, 1)
})

test("concurrent claimers cannot overwrite the transaction winner", async () => {
  await reserve("race", "race-cap")
  const responses = await Promise.all([
    handler()(request(callerUid, [{ mediaUrl: url("race"), claimToken: "race-cap" }])),
    handler()(request(otherUid, [{ mediaUrl: url("race"), claimToken: "race-cap" }])),
  ])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409])
  const owner = (await adminDb.collection("mediaRegistry").doc(registryId("race")).get()).data()?.ownerUid
  assert.ok(owner === callerUid || owner === otherUid)
})
