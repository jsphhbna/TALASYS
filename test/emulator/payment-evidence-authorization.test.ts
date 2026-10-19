import { before, after, test } from "node:test"
import assert from "node:assert/strict"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createResidentPayHandler, paymentOperationDocumentId } from "../../app/api/resident/requests/pay/route.ts"
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

  // Additional document requests for SEC-F04 & SEC-F05
  await adminDb.collection("documentRequests").doc("req-waived-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "waived",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-idempotent-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "unpaid",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-optional-screenshot-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "unpaid",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-pending-correction-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
    paymentStatus: "pending_verification",
    gcashRefNumber: "GCASH-OLD-001",
    paymentMethod: "gcash",
    createdAt: Date.now(),
  })

  await adminDb.collection("documentRequests").doc("req-concurrent-a").set({
    residentId: residentA,
    documentType: "Barangay Clearance",
    status: "On Process",
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

  const assetIdUnclaimed = `talasys/receipts/${residentA}/unclaimed-receipt`
  const regDocIdUnclaimed = mediaRegistryDocumentId(cloudName, "image", assetIdUnclaimed)
  await adminDb.collection("mediaRegistry").doc(regDocIdUnclaimed).set({
    cloudName,
    publicId: assetIdUnclaimed,
    folder: "talasys/receipts",
    resourceType: "image",
    deliveryType: "authenticated",
    ownerUid: residentA,
    status: "reserved",
    createdAt: Date.now(),
  })

  const assetIdExpired = `talasys/receipts/${residentA}/expired-receipt`
  const regDocIdExpired = mediaRegistryDocumentId(cloudName, "image", assetIdExpired)
  await adminDb.collection("mediaRegistry").doc(regDocIdExpired).set({
    cloudName,
    publicId: assetIdExpired,
    folder: "talasys/receipts",
    resourceType: "image",
    deliveryType: "authenticated",
    ownerUid: residentA,
    status: "claimed",
    expiresAt: Date.now() - 60000,
    createdAt: Date.now() - 120000,
  })
})

after(async () => {
  // Cleanup test documents
  const cleanupUsers = [residentA, residentB, lockedResident]
  for (const uid of cleanupUsers) {
    await adminDb.collection("users").doc(uid).delete().catch(() => {})
  }
  const cleanupRequests = [
    "req-valid-unpaid-a",
    "req-cash-unpaid-a",
    "req-already-paid-a",
    "req-cancelled-a",
    "req-waived-a",
    "req-idempotent-a",
    "req-optional-screenshot-a",
    "req-pending-correction-a",
    "req-concurrent-a",
  ]
  for (const id of cleanupRequests) {
    await adminDb.collection("documentRequests").doc(id).delete().catch(() => {})
  }
  const cleanupAssets = [
    mediaRegistryDocumentId(cloudName, "image", `talasys/receipts/${residentA}/genuine-receipt-123`),
    mediaRegistryDocumentId(cloudName, "image", `talasys/receipts/${residentB}/receipt-b-456`),
    mediaRegistryDocumentId(cloudName, "image", `talasys/receipts/${residentA}/unclaimed-receipt`),
    mediaRegistryDocumentId(cloudName, "image", `talasys/receipts/${residentA}/expired-receipt`),
  ]
  for (const id of cleanupAssets) {
    await adminDb.collection("mediaRegistry").doc(id).delete().catch(() => {})
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

// -------------------------------------------------------------
// SEC-F04: Full Payment Media Identity Validation
// -------------------------------------------------------------
test("SEC-F04: Cloudinary screenshot URL with foreign cloud name is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const foreignCloudUrl = `https://res.cloudinary.com/attacker-cloud/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/genuine-receipt-123.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-FOREIGN-CLOUD",
    gcashScreenshotUrl: foreignCloudUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 403, "Foreign cloud name must be rejected with HTTP 403")
  const data = await res.json()
  assert.match(data.error, /cloud account does not match/i)
})

test("SEC-F04: Cloudinary screenshot URL with non-image resource type is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const rawUrl = `https://res.cloudinary.com/${cloudName}/raw/authenticated/v1/talasys/receipts/${residentA}/raw-file.pdf`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-RAW-RESOURCE",
    gcashScreenshotUrl: rawUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Non-image resource type must be rejected with HTTP 400")
  const data = await res.json()
  assert.match(data.error, /image resource/i)
})

test("SEC-F04: Cloudinary screenshot URL with non-authenticated delivery type is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const uploadUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1/talasys/receipts/${residentA}/genuine-receipt-123.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-WRONG-DELIVERY",
    gcashScreenshotUrl: uploadUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Upload delivery type must be rejected with HTTP 400")
  const data = await res.json()
  assert.match(data.error, /authenticated delivery/i)
})

test("SEC-F04: Path traversal attempt in screenshot URL is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const traversalUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/../admin/secret.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-TRAVERSAL",
    gcashScreenshotUrl: traversalUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Path traversal in screenshot URL must be rejected with HTTP 400")
  const data = await res.json()
  assert.match(data.error, /malformed public id/i)
})

test("SEC-F04: Screenshot asset in mediaRegistry with non-claimed status is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const unclaimedUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/unclaimed-receipt.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-UNCLAIMED",
    gcashScreenshotUrl: unclaimedUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 403, "Unclaimed asset in mediaRegistry must be rejected with HTTP 403")
  const data = await res.json()
  assert.match(data.error, /claimed status/i)
})

test("SEC-F04: Screenshot asset in mediaRegistry with expired reservation is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const expiredUrl = `https://res.cloudinary.com/${cloudName}/image/authenticated/s--xyz--/v1/talasys/receipts/${residentA}/expired-receipt.jpg`
  const req = createPayRequest("caller-a", {
    requestId: "req-valid-unpaid-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-EXPIRED",
    gcashScreenshotUrl: expiredUrl,
  })

  const res = await handler(req)
  assert.equal(res.status, 410, "Expired asset in mediaRegistry must be rejected with HTTP 410")
  const data = await res.json()
  assert.match(data.error, /expired/i)
})

test("SEC-F04: GCash payment submission without screenshot (optional screenshot) succeeds", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-optional-screenshot-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-NO-SCREENSHOT-123",
  })

  const res = await handler(req)
  assert.equal(res.status, 200, "GCash payment without screenshot must succeed with HTTP 200")
  const data = await res.json()
  assert.equal(data.success, true)
  assert.equal(data.paymentStatus, "pending_verification")

  const updatedDoc = await adminDb.collection("documentRequests").doc("req-optional-screenshot-a").get()
  const reqData = updatedDoc.data()
  assert.equal(reqData?.paymentStatus, "pending_verification")
  assert.equal(reqData?.gcashRefNumber, "GCASH-NO-SCREENSHOT-123")
  assert.equal(reqData?.gcashScreenshotUrl, "")
})

// -------------------------------------------------------------
// SEC-F05: Payment Idempotency & Notification Deduplication
// -------------------------------------------------------------
test("SEC-F05: Replaying exact payment submission with same idempotencyKey is idempotent and creates no duplicate notification", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const idempotencyKey = "idem-key-test-replay-0000000001"
  const payload = {
    requestId: "req-idempotent-a",
    paymentMethod: "cash",
    idempotencyKey,
  }

  // Count notifications before first submission
  const notifsBefore = await adminDb.collection("notifications").where("actionUrl", "==", "/admin/requests/payments").get()
  const countBefore = notifsBefore.size

  // First submission
  const req1 = createPayRequest("caller-a", payload)
  const res1 = await handler(req1)
  assert.equal(res1.status, 200)
  const body1 = await res1.json()
  assert.equal(body1.success, true)
  assert.equal(body1.idempotent, false)

  // Verify notification was created
  const notifsAfterFirst = await adminDb.collection("notifications").where("actionUrl", "==", "/admin/requests/payments").get()
  assert.equal(notifsAfterFirst.size, countBefore + 1, "Exactly one notification must be created on first submission")

  // Second submission: identical replay
  const req2 = createPayRequest("caller-a", payload)
  const res2 = await handler(req2)
  assert.equal(res2.status, 200)
  const body2 = await res2.json()
  assert.equal(body2.success, true)
  assert.equal(body2.idempotent, true, "Replay must return idempotent: true")

  // Verify notification count DID NOT increase
  const notifsAfterSecond = await adminDb.collection("notifications").where("actionUrl", "==", "/admin/requests/payments").get()
  assert.equal(notifsAfterSecond.size, countBefore + 1, "Notification count must NOT increase on idempotent replay")
})

test("SEC-F05: Reusing idempotencyKey with conflicting payment payload returns 409 conflict", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const idempotencyKey = "idem-key-test-replay-0000000001" // Reusing the key from the previous test
  const conflictingPayload = {
    requestId: "req-idempotent-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-CONFLICT-999",
    idempotencyKey,
  }

  const req = createPayRequest("caller-a", conflictingPayload)
  const res = await handler(req)
  assert.equal(res.status, 409, "Conflicting payload with reused idempotencyKey must return HTTP 409")
  const data = await res.json()
  assert.match(data.error, /different payment details/i)
})

test("SEC-F05: Payment submission on waived request is rejected", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-waived-a",
    paymentMethod: "cash",
  })

  const res = await handler(req)
  assert.equal(res.status, 400, "Payment submission on waived request must return HTTP 400")
  const data = await res.json()
  assert.match(data.error, /waived/i)
})

test("SEC-F05: Legitimate correction in pending_verification with new idempotency key succeeds", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const req = createPayRequest("caller-a", {
    requestId: "req-pending-correction-a",
    paymentMethod: "gcash",
    gcashRefNumber: "GCASH-CORRECTED-REF-002",
    idempotencyKey: "idem-key-correction-0000000000002",
  })

  const res = await handler(req)
  assert.equal(res.status, 200, "Correction submission must return HTTP 200")
  const data = await res.json()
  assert.equal(data.success, true)

  const updatedDoc = await adminDb.collection("documentRequests").doc("req-pending-correction-a").get()
  assert.equal(updatedDoc.data()?.gcashRefNumber, "GCASH-CORRECTED-REF-002")
  assert.equal(updatedDoc.data()?.lastPaymentOperationId, "idem-key-correction-0000000000002")
})

test("SEC-F05: Concurrent submissions with same idempotencyKey converge without race conditions", async () => {
  const handler = createResidentPayHandler({
    auth: routeAuth,
    db: adminDb,
    cloudName,
    verifyCloudinaryAsset: mockVerifier,
  })

  const idempotencyKey = "idem-key-concurrent-000000000003"
  const payload = {
    requestId: "req-concurrent-a",
    paymentMethod: "cash",
    idempotencyKey,
  }

  // Fire two concurrent requests
  const [res1, res2] = await Promise.all([
    handler(createPayRequest("caller-a", payload)),
    handler(createPayRequest("caller-a", payload)),
  ])

  assert.equal(res1.status, 200)
  assert.equal(res2.status, 200)

  // Verify only one notification document exists with the deterministic ID
  const operationDocId = paymentOperationDocumentId(residentA, "req-concurrent-a", idempotencyKey)
  const deterministicNotifId = `pay_${operationDocId}`
  const notifDoc = await adminDb.collection("notifications").doc(deterministicNotifId).get()
  assert.equal(notifDoc.exists, true, "Deterministic notification must exist")

  // Verify paymentOperations document exists
  const opDoc = await adminDb.collection("paymentOperations").doc(operationDocId).get()
  assert.equal(opDoc.exists, true, "Payment operation record must exist")
  assert.equal(opDoc.data()?.status, "completed")
})
