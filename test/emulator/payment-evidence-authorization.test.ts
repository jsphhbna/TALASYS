import { before, after, test } from "node:test"
import assert from "node:assert/strict"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createResidentPayHandler } from "../../app/api/resident/requests/pay/route.ts"
import { mediaRegistryDocumentId } from "../../lib/security/media-auth.ts"

const cloudName = "talasys-test-cloud"
const residentA = "pay-test-resident-a"
const residentB = "pay-test-resident-b"
const lockedResident = "pay-test-locked-resident"

let activeCaller = residentA

const routeAuth: any = {
  verifyIdToken: async (token: string) => {
    if (token === "invalid-token") throw new Error("Invalid token")
    if (token === "caller-b") return { uid: residentB }
    if (token === "caller-locked") return { uid: lockedResident }
    return { uid: residentA }
  },
}

const mockVerifier = async (_publicId: string, _deliveryType: string) => {}

function createPayRequest(token: string, body: Record<string, any>) {
  return new Request("http://localhost/api/resident/requests/pay", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

before(async () => {
  process.env.TALASYS_E2E_MODE = "true"
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = cloudName

  // Seed user accounts
  await adminDb.collection("users").doc(residentA).set({
    name: "Resident A",
    email: "resident-a@example.test",
    role: "resident",
    status: "Active",
  })

  await adminDb.collection("users").doc(residentB).set({
    name: "Resident B",
    email: "resident-b@example.test",
    role: "resident",
    status: "Active",
  })

  await adminDb.collection("users").doc(lockedResident).set({
    name: "Locked Resident",
    email: "locked@example.test",
    role: "resident",
    status: "Locked",
  })

  // Seed document requests
  await adminDb.collection("documentRequests").doc("req-valid-unpaid-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "unpaid",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-cash-unpaid-a").set({
    residentId: residentA,
    documentType: "Certificate of Residency",
    status: "Pending",
    paymentStatus: "unpaid",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-already-paid-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "paid",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-cancelled-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "Cancelled",
    paymentStatus: "unpaid",
    createdAt: Date.now(),
  })

  // Seed mediaRegistry entries
  const assetIdA = `talasys/receipts/${residentA}/genuine-receipt-123`
  const regDocIdA = mediaRegistryDocumentId(cloudName, "image", assetIdA)
  await adminDb.collection("mediaRegistry").doc(regDocIdA).set({
    cloudName,
    publicId: assetIdA,
    folder: "talasys/receipts",
    resourceType: "image",
    deliveryType: "authenticated",
    ownerUid: residentA,
    status: "claimed",
    createdAt: Date.now(),
  })

  const assetIdB = `talasys/receipts/${residentB}/receipt-b-456`
  const regDocIdB = mediaRegistryDocumentId(cloudName, "image", assetIdB)
  await adminDb.collection("mediaRegistry").doc(regDocIdB).set({
    cloudName,
    publicId: assetIdB,
    folder: "talasys/receipts",
    resourceType: "image",
    deliveryType: "authenticated",
    ownerUid: residentB,
    status: "claimed",
    createdAt: Date.now(),
  })
})

after(async () => {
  // Cleanup test documents
  const cleanupUsers = [residentA, residentB, lockedResident]
  for (const uid of cleanupUsers) {
    await adminDb.collection("users").doc(uid).delete()
  }
  const cleanupRequests = ["req-valid-unpaid-a", "req-cash-unpaid-a", "req-already-paid-a", "req-cancelled-a"]
  for (const id of cleanupRequests) {
    await adminDb.collection("documentRequests").doc(id).delete()
  }
})

test("SEC-F02: Legitimate GCash payment submission with verified mediaRegistry asset succeeds", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const screenshotUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/genuine-receipt-123.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-REF-00123",
    gcashScreenshotUrl: screenshotUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 200, "Valid GCash payment submission must succeed with HTTP 200")
  const data = await res.json()
  assert.equal(data.success, true)
  assert.equal(data.paymentStatus, "pending_verification")

  // Verify atomic Firestore state
  const updatedDoc = await adminDb.collection("documentRequests").doc("req-valid-unpaid-a").get()
  const reqData = updatedDoc.data()
  assert.equal(reqData?.paymentStatus, "pending_verification")
  assert.equal(reqData?.paymentMethod, "gcash")
  assert.equal(reqData?.gcashRefNumber, "GCASH-REF-00123")
  assert.equal(reqData?.gcashScreenshotUrl, screenshotUrl)
  assert.ok(reqData?.paymentSubmittedAt > 0)

  // Verify admin notification was created
  const notifSnapshot = await adminDb
    .collection("notifications")
    .where("actionUrl", "==", "/admin/requests/payments")
    .where("targetId", "==", "admin")
    .get()
  assert.ok(notifSnapshot.size > 0, "Admin payment notification must be created atomically")
})

test("SEC-F02: Legitimate Cash payment submission with clean parameters succeeds", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-cash-unpaid-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 200, "Valid Cash payment submission must succeed with HTTP 200")
  const data = await res.json()
  assert.equal(data.success, true)

  const updatedDoc = await adminDb.collection("documentRequests").doc("req-cash-unpaid-a").get()
  const reqData = updatedDoc.data()
  assert.equal(reqData?.paymentStatus, "pending_verification")
  assert.equal(reqData?.paymentMethod, "cash")
  assert.equal(reqData?.gcashRefNumber, "")
  assert.equal(reqData?.gcashScreenshotUrl, "")
})

test("SEC-F02: Cross-user payment attempt (Resident B attempting to pay for Resident A's request) is forbidden", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-b", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 403, "Paying for another resident's request must be rejected with HTTP 403")
  const data = await res.json()
  assert.match(data.error, /do not have permission/i)
})

test("SEC-F02: Unregistered receipt screenshot (not found in mediaRegistry) is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const fakeScreenshotUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/unregistered-photo-999.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-REF-00999",
    gcashScreenshotUrl: fakeScreenshotUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 404, "Unregistered receipt asset must be rejected with HTTP 404")
  const data = await res.json()
  assert.match(data.error, /not registered/i)
})

test("SEC-F02: Receipt screenshot belonging to another resident is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  // Resident A tries to use Resident B's receipt
  const otherScreenshotUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentB}/receipt-b-456.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-REF-SPOOF",
    gcashScreenshotUrl: otherScreenshotUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 403, "Using another resident's receipt asset must be rejected with HTTP 403")
  const data = await res.json()
  assert.match(data.error, /owned by this resident/i)
})

test("SEC-F02: Cash payment with GCash reference or screenshot is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-cash-unpaid-a",
    paymentMethod: "cash",
    gcashRefNumber: "REF-ILLEGAL",
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Cash payment with GCash ref must return HTTP 400")
})

test("SEC-F02: GCash payment without reference number is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "   ",
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "GCash payment without ref number must return HTTP 400")
})

test("SEC-F02: Payment submission on an already paid request is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-already-paid-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Payment submission on already paid request must return HTTP 400")
  const data = await res.json()
  assert.match(data.error, /not eligible/i)
})

test("SEC-F02: Payment submission on a cancelled request is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-cancelled-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Payment submission on cancelled request must return HTTP 400")
  const data = await res.json()
  assert.match(data.error, /not permitted for requests in status: Cancelled/i)
})

test("SEC-F02: Locked or deleted resident account cannot submit payment", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-locked", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 403, "Locked account must return HTTP 403")
  const data = await res.json()
  assert.match(data.error, /Account is inactive, expired, locked/i)
})
