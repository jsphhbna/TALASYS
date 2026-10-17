import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../lib/firebase-admin.ts"
import { createAdminOperationsHandler } from "../../app/api/admin/operations/route.ts"
import { normalizeAuditLog } from "../../lib/security/audit-utils.ts"
import {
  COLLECTION_USERS,
  COLLECTION_ACTIVITY_LOGS,
  COLLECTION_NOTIFICATIONS,
} from "../../lib/constants.ts"

const createdUids = new Set<string>()
const cleanupDocs: Array<{ collection: string; id: string }> = []

after(async () => {
  for (const item of cleanupDocs) {
    await adminDb.collection(item.collection).doc(item.id).delete().catch(() => {})
  }
  for (const uid of createdUids) {
    await adminDb.collection(COLLECTION_USERS).doc(uid).delete().catch(() => {})
    await adminAuth.deleteUser(uid).catch(() => {})
  }
})

async function createTestIdentity(role: string, extraProfile: Record<string, any> = {}) {
  const uid = `fx04-${role}-${randomUUID().slice(0, 8)}`
  const email = `${uid}@talasys.test`
  await adminAuth.createUser({ uid, email, password: "Valid123!Password" })
  createdUids.add(uid)
  const profile = {
    uid,
    email,
    name: `Test ${role}`,
    role,
    status: "Active",
    isVerified: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...extraProfile,
  }
  await adminDb.collection(COLLECTION_USERS).doc(uid).set(profile)
  return { uid, email, name: profile.name }
}

function adminOps(callerUid: string) {
  return createAdminOperationsHandler({
    auth: {
      verifyIdToken: async () => ({ uid: callerUid }),
    } as any,
    db: adminDb,
  })
}

test("FX-04: Full Level 2 production-path photo removal, audit persistence, and resident notification delivery", async () => {
  const admin = await createTestIdentity("Resident Management")
  const targetResident = await createTestIdentity("resident", {
    profilePicture: "https://example.com/initial-avatar.jpg",
    address: "123 Barangay St, Zone 64",
    contactNumber: "09171234567",
  })
  const otherResident = await createTestIdentity("resident", {
    profilePicture: "https://example.com/other-avatar.jpg",
  })
  const viewOnlyAdmin = await createTestIdentity("Documents Only")

  const ops = adminOps(admin.uid)
  const viewOnlyOps = adminOps(viewOnlyAdmin.uid)

  // 1. Negative Test: View Only role must be denied
  const viewOnlyRes = await viewOnlyOps(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "resident.profilePhoto.remove",
      operationId: `op-vo-${randomUUID()}`,
      targetId: targetResident.uid,
      payload: { removePhotoReason: "Testing view only denial" },
    }),
  }))
  assert.equal(viewOnlyRes.status, 403)

  // 2. Negative Test: Removal without a reason must be rejected with HTTP 400
  const noReasonRes = await ops(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "resident.profilePhoto.remove",
      operationId: `op-noreason-${randomUUID()}`,
      targetId: targetResident.uid,
      payload: { removePhotoReason: "   " },
    }),
  }))
  assert.equal(noReasonRes.status, 400)
  const noReasonBody = await noReasonRes.json()
  assert.match(noReasonBody.error, /reason must be provided/i)

  // 3. Positive Test: Authorized Admin removes photo with valid reason
  const removalReason = "Photo does not meet official government ID standards (covered face)"
  const operationId = `op-photo-remove-${randomUUID()}`

  const removeRes = await ops(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "resident.profilePhoto.remove",
      operationId,
      targetId: targetResident.uid,
      payload: { removePhotoReason: removalReason },
    }),
  }))
  assert.equal(removeRes.status, 200)
  const removeBody = await removeRes.json()
  assert.equal(removeBody.idempotent, false)

  // 4. Verify Target Resident document state in Firestore
  const residentDoc = await adminDb.collection(COLLECTION_USERS).doc(targetResident.uid).get()
  assert.ok(residentDoc.exists, "Resident document must exist")
  const residentData = residentDoc.data()!
  assert.equal(residentData.profilePicture, "", "profilePicture must be authoritatively cleared")
  assert.equal(residentData.address, "123 Barangay St, Zone 64", "Other fields must remain uncorrupted")

  // 5. Verify Authoritative Audit Log in Firestore
  const auditSnapshot = await adminDb.collection(COLLECTION_ACTIVITY_LOGS)
    .where("targetId", "==", targetResident.uid)
    .get()
  assert.ok(auditSnapshot.docs.length >= 1, "At least one audit log must exist for target resident")
  const auditDocs = auditSnapshot.docs.map((d: any) => ({ id: d.id, ...d.data() as any }))
  const photoAudit = auditDocs.find((d: any) => d.operationId === operationId)
  assert.ok(photoAudit, "Audit record for this operationId must exist")
  assert.equal(photoAudit.action, "resident.profilePhoto.remove")
  assert.equal(photoAudit.actor?.id, admin.uid)

  // Verify normalizeAuditLog standardizes this event
  const normalizedAudit = normalizeAuditLog(photoAudit)
  assert.equal(normalizedAudit.action, "Removed Resident Profile Picture")
  assert.equal(normalizedAudit.actionType, "resident")
  assert.ok(normalizedAudit.details.includes(removalReason), "Details must display removal reason")

  // 6. Verify exactly one Notification document exists for Target Resident
  const notifSnapshot = await adminDb.collection(COLLECTION_NOTIFICATIONS)
    .where("targetId", "==", targetResident.uid)
    .get()
  assert.equal(notifSnapshot.docs.length, 1, "Target resident must have exactly one notification")
  const notifDoc = notifSnapshot.docs[0]
  cleanupDocs.push({ collection: COLLECTION_NOTIFICATIONS, id: notifDoc.id })
  const notifData = notifDoc.data()
  assert.equal(notifData.type, "warning")
  assert.equal(notifData.title, "Profile Picture Removed")
  assert.ok(notifData.message.includes(removalReason), "Notification message must contain removal reason")
  assert.equal(notifData.isRead, false, "Notification must be unread initially")
  assert.equal(notifData.operationId, operationId)

  // 7. Negative Test: Innocent / Other resident must NOT have received any notification
  const innocentNotifSnapshot = await adminDb.collection(COLLECTION_NOTIFICATIONS)
    .where("targetId", "==", otherResident.uid)
    .get()
  assert.equal(innocentNotifSnapshot.docs.length, 0, "Unrelated resident must not receive notification")

  // 8. Test Resident Mark as Read Lifecycle
  await adminDb.collection(COLLECTION_NOTIFICATIONS).doc(notifDoc.id).update({ isRead: true })
  const reloadedNotif = await adminDb.collection(COLLECTION_NOTIFICATIONS).doc(notifDoc.id).get()
  assert.equal(reloadedNotif.data()?.isRead, true, "Notification read status must persist as true")

  // 9. Negative Test: Duplicate submission with same operationId must be idempotent and not create duplicate notification
  const duplicateRes = await ops(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "resident.profilePhoto.remove",
      operationId,
      targetId: targetResident.uid,
      payload: { removePhotoReason: removalReason },
    }),
  }))
  assert.equal(duplicateRes.status, 200)
  assert.equal((await duplicateRes.json()).idempotent, true)

  const notifCountAfterDuplicate = await adminDb.collection(COLLECTION_NOTIFICATIONS)
    .where("targetId", "==", targetResident.uid)
    .get()
  assert.equal(notifCountAfterDuplicate.docs.length, 1, "Duplicate execution must not create second notification")
})
