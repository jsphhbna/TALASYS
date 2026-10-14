import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { deleteApp, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"
import { createFirestoreAdapter } from "../../scripts/migrate-cloudinary-access.ts"

const projectId = "talasys-rules-test"
const oldUrl = "https://res.cloudinary.com/talasys-test/image/upload/talasys/proofs/a.png"
const newUrl = oldUrl.replace("/upload/", "/authenticated/")

before(() => {
  process.env.FIREBASE_PROJECT_ID = projectId
})

after(async () => {
  await Promise.all(getApps().map(app => deleteApp(app)))
})

test("real Firestore adapter reads all documents before writes and updates nested references", async () => {
  const adapter = await createFirestoreAdapter()
  const db = getFirestore()
  await Promise.all([
    db.collection("verifications").doc("adapter-a").set({ documents: [{ url: oldUrl }] }),
    db.collection("documentRequests").doc("adapter-b").set({ gcashScreenshotUrl: oldUrl }),
  ])
  await adapter.updateReferences([
    { collection: "verifications", docId: "adapter-a", path: "documents.0.url", originalUrl: oldUrl },
    { collection: "documentRequests", docId: "adapter-b", path: "gcashScreenshotUrl", originalUrl: oldUrl },
  ], newUrl)
  const [a, b] = await Promise.all([db.collection("verifications").doc("adapter-a").get(), db.collection("documentRequests").doc("adapter-b").get()])
  assert.equal(a.data()?.documents[0].url, newUrl)
  assert.equal(b.data()?.gcashScreenshotUrl, newUrl)
})

test("real Firestore adapter refuses to overwrite a reference changed after scan", async () => {
  const adapter = await createFirestoreAdapter()
  const db = getFirestore()
  await db.collection("documentRequests").doc("adapter-race").set({ gcashScreenshotUrl: "https://example.test/new-owner-value" })
  await assert.rejects(adapter.updateReferences([
    { collection: "documentRequests", docId: "adapter-race", path: "gcashScreenshotUrl", originalUrl: oldUrl },
  ], newUrl), /changed since scan/)
  assert.equal((await db.collection("documentRequests").doc("adapter-race").get()).data()?.gcashScreenshotUrl, "https://example.test/new-owner-value")
})
