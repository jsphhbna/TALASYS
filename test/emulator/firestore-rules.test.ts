import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore"
import { fetchOrderedCollectionPages } from "../../lib/firestore-pagination.ts"
import { normalizeAuditLog } from "../../lib/security/audit-utils.ts"

let environment: RulesTestEnvironment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "talasys-rules-test",
    firestore: {
      rules: await readFile("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const users = [
      ["resident", { role: "resident", status: "Active", isVerified: true }],
      ["locked", { role: "resident", status: "Locked", isVerified: true }],
      ["viewer", { role: "View Only", status: "Active" }],
      ["verifier", { role: "Verification Only", status: "Active" }],
      ["processor", { role: "Document Processing", status: "Active" }],
      ["resident-manager", { role: "Resident Management", status: "Active" }],
      ["full-admin", { role: "Full Access", status: "Active" }],
      ["retry-admin", { role: "Full Access ", status: "Active" }],
      ["superadmin", { role: "Super Admin", status: "Active" }],
    ] as const
    for (const [id, data] of users) await setDoc(doc(db, "users", id), data)
    await setDoc(doc(db, "verifications", "pending"), {
      residentId: "resident",
      status: "pending",
      type: "registration",
    })
    await setDoc(doc(db, "documentRequests", "existing"), {
      residentId: "resident",
      status: "Pending",
      paymentStatus: "not_required",
    })
  })
})

after(async () => environment?.cleanup())

test("unauthenticated and locked clients cannot read resident records", async () => {
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users", "resident")))
  await assertFails(getDoc(doc(environment.authenticatedContext("locked").firestore(), "users", "locked")))
})

test("View Only cannot mutate users, requests, or verifications", async () => {
  const db = environment.authenticatedContext("viewer").firestore()
  await assertFails(updateDoc(doc(db, "users", "resident"), { contactNumber: "tampered" }))
  await assertFails(updateDoc(doc(db, "documentRequests", "existing"), { status: "Approved" }))
  await assertFails(updateDoc(doc(db, "verifications", "pending"), { status: "approved" }))
})

test("resident direct request creation and forged fee fields are denied", async () => {
  const db = environment.authenticatedContext("resident").firestore()
  await assertFails(setDoc(doc(db, "documentRequests", "forged"), {
    residentId: "resident",
    documentType: "Clearance",
    amount: 0,
    feeWaived: true,
    status: "Pending",
  }))
})

test("specialized roles are limited to their assigned mutation scope", async () => {
  const verifierDb = environment.authenticatedContext("verifier").firestore()
  await assertFails(updateDoc(doc(verifierDb, "verifications", "pending"), { status: "approved" }))
  await assertFails(updateDoc(doc(verifierDb, "documentRequests", "existing"), { status: "Approved" }))

  const processorDb = environment.authenticatedContext("processor").firestore()
  await assertFails(updateDoc(doc(processorDb, "documentRequests", "existing"), { status: "Approved" }))
  await assertFails(updateDoc(doc(processorDb, "verifications", "pending"), { status: "rejected" }))
})

test("approval and resident server-managed fields cannot be bypassed by any admin client", async () => {
  for (const uid of ["verifier", "resident-manager", "full-admin"]) {
    const db = environment.authenticatedContext(uid).firestore()
    await assertFails(updateDoc(doc(db, "users", "resident"), { isVerified: true, status: "Active" }))
    await assertFails(updateDoc(doc(db, "users", "resident"), { email: `${uid}@example.test` }))
    await assertFails(updateDoc(doc(db, "verifications", "pending"), { status: "approved", approvedBy: uid }))
  }
})

test("resident retains only explicit self-service profile and request transitions", async () => {
  const db = environment.authenticatedContext("resident").firestore()
  await assertSucceeds(updateDoc(doc(db, "users", "resident"), { contactNumber: "09170000000" }))
  await assertFails(updateDoc(doc(db, "users", "resident"), { email: "forged@example.test" }))
  await assertSucceeds(updateDoc(doc(db, "documentRequests", "existing"), { status: "Cancelled", cancelledAt: 1, statusTimestamps: { Cancelled: 1 } }))
})

test("Auth-only identities cannot author initial registration state", async () => {
  const db = environment.authenticatedContext("auth-only").firestore()
  await assertFails(setDoc(doc(db, "users", "auth-only"), {
    role: "resident", status: "Pending", isVerified: false, accountExpiry: "",
  }))
  await assertFails(setDoc(doc(db, "verifications", "auth-only"), {
    residentId: "auth-only", userId: "auth-only", type: "registration", status: "pending",
  }))
  await assertFails(setDoc(doc(db, "notifications", "reg-auth-only"), {
    targetId: "admin", type: "registration", title: "forged",
  }))
  await assertFails(setDoc(doc(db, "registrationOperations", "forged"), { status: "completed" }))
})

test("direct client registration resubmission is denied in favor of server-authoritative route", async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", "unverified-resident"), {
      role: "resident", status: "Pending", isVerified: false,
    })
  })
  const db = environment.authenticatedContext("unverified-resident").firestore()
  await assertFails(setDoc(doc(db, "verifications", "registration-resubmission"), {
    residentId: "unverified-resident", userId: "unverified-resident", type: "registration", status: "pending",
  }))
  await assertFails(setDoc(doc(db, "notifications", "registration-resubmission"), {
    targetId: "admin", type: "registration", title: "Registration Verification Resubmission",
  }))
})

test("profile-edit and reactivation client workflows remain allowed for existing residents", async () => {
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), "users", "expired-resident"), {
      role: "resident", status: "Expired", isVerified: true,
    })
  })
  const residentDb = environment.authenticatedContext("resident").firestore()
  await assertSucceeds(setDoc(doc(residentDb, "verifications", "profile-edit-new"), {
    residentId: "resident", userId: "resident", type: "profile-edit", status: "pending",
  }))
  const expiredDb = environment.authenticatedContext("expired-resident").firestore()
  await assertSucceeds(setDoc(doc(expiredDb, "verifications", "reactivation-new"), {
    residentId: "expired-resident", userId: "expired-resident", type: "reactivation", status: "pending",
  }))
  await assertSucceeds(setDoc(doc(expiredDb, "notifications", "reactivation-new"), {
    targetId: "admin", type: "reactivation", title: "Reactivation",
  }))
})

test("R09: resident cannot delete pending registration verifications, while profile-edit and reactivation withdrawal remain allowed", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, "users", "unverified-reg-user"), {
      role: "resident",
      status: "Pending",
      isVerified: false,
      hasPendingVerification: true,
      pendingVerificationId: "reg-verif-1",
    })
    await setDoc(doc(db, "verifications", "reg-verif-1"), {
      residentId: "unverified-reg-user",
      userId: "unverified-reg-user",
      type: "registration",
      status: "pending",
    })
    await setDoc(doc(db, "residentVerificationLocks", "unverified-reg-user"), {
      activeVerificationStatus: "pending",
      activeVerificationId: "reg-verif-1",
    })
    await setDoc(doc(db, "verifications", "profile-edit-verif"), {
      residentId: "resident",
      userId: "resident",
      type: "profile-edit",
      status: "pending",
    })
    await setDoc(doc(db, "verifications", "reactivation-verif"), {
      residentId: "expired-resident",
      userId: "expired-resident",
      type: "reactivation",
      status: "pending",
    })
    await setDoc(doc(db, "verifications", "profile-edit-verif-admin"), {
      residentId: "other-user",
      userId: "other-user",
      type: "profile-edit",
      status: "pending",
    })
  })

  const regUserDb = environment.authenticatedContext("unverified-reg-user").firestore()
  const otherResidentDb = environment.authenticatedContext("resident").firestore()
  const expiredDb = environment.authenticatedContext("expired-resident").firestore()
  const superAdminDb = environment.authenticatedContext("superadmin").firestore()

  // 1. Resident cannot delete their own pending registration verification
  await assertFails(deleteDoc(doc(regUserDb, "verifications", "reg-verif-1")))

  // 2. Another resident cannot delete the registration verification
  await assertFails(deleteDoc(doc(otherResidentDb, "verifications", "reg-verif-1")))

  // 3. Pending registration remains reviewable and untouched
  const adminDb = environment.authenticatedContext("verifier").firestore()
  const snap = await getDoc(doc(adminDb, "verifications", "reg-verif-1"))
  assert.equal(snap.exists(), true)
  assert.equal(snap.data()?.status, "pending")

  // 4. Unauthorized deletion does not alter pending flags or locks
  const userSnap = await getDoc(doc(regUserDb, "users", "unverified-reg-user"))
  assert.equal(userSnap.data()?.hasPendingVerification, true)
  assert.equal(userSnap.data()?.pendingVerificationId, "reg-verif-1")

  // 5. Legitimate profile-edit withdrawal by owner remains functional
  await assertSucceeds(deleteDoc(doc(otherResidentDb, "verifications", "profile-edit-verif")))

  // 6. Legitimate reactivation withdrawal by owner remains functional
  await assertSucceeds(deleteDoc(doc(expiredDb, "verifications", "reactivation-verif")))

  // 7. Direct client deletion of registration verifications is denied even for SuperAdmin (R14)
  await assertFails(deleteDoc(doc(superAdminDb, "verifications", "reg-verif-1")))

  // 8. SuperAdmin can directly delete non-registration verifications if needed
  await assertSucceeds(deleteDoc(doc(superAdminDb, "verifications", "profile-edit-verif-admin")))
})

test("A07 resident payment submission preserves paid, waived, and terminal request states", async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [id, status, paymentStatus] of [
      ["paid-request", "On Process", "paid"],
      ["waived-request", "On Process", "waived"],
      ["cancelled-request", "Cancelled", "unpaid"],
      ["rejected-request", "Rejected", "unpaid"],
      ["completed-request", "Completed", "unpaid"],
      ["legitimate-unpaid", "On Process", "unpaid"],
    ]) await setDoc(doc(db, "documentRequests", id), { residentId: "resident", status, paymentStatus })
  })
  const residentDb = environment.authenticatedContext("resident").firestore()
  const payment = { paymentStatus: "pending_verification", paymentMethod: "gcash", gcashRefNumber: "REF-1", gcashScreenshotUrl: "protected", paymentSubmittedAt: 1 }
  for (const id of ["paid-request", "waived-request", "cancelled-request", "rejected-request", "completed-request"]) {
    await assertFails(updateDoc(doc(residentDb, "documentRequests", id), payment))
  }
  await assertSucceeds(updateDoc(doc(residentDb, "documentRequests", "legitimate-unpaid"), payment))
})

test("clients cannot write authoritative audit evidence or telemetry", async () => {
  const db = environment.authenticatedContext("verifier").firestore()
  await assertFails(setDoc(doc(db, "activityLogs", "forged"), { action: "Approved" }))
  await assertFails(setDoc(doc(db, "clientTelemetry", "forged"), { event: "fake" }))
})

test("A18 denied admin query recovers after the authoritative role is corrected", async () => {
  const deniedDb = environment.authenticatedContext("retry-admin").firestore()
  await assertFails(getDocs(collection(deniedDb, "documentRequests")))
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "retry-admin"), { role: "Full Access" })
  })
  await assertSucceeds(getDocs(collection(deniedDb, "documentRequests")))
})

test("A11/A12 production cursor adapter returns complete queues, periods, and normalized fresh audit events", async () => {
  const requestIds = Array.from({ length: 205 }, (_, index) => `page-request-${String(index).padStart(3, "0")}`)
  const logIds = Array.from({ length: 505 }, (_, index) => `page-log-${String(index).padStart(3, "0")}`)
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await Promise.all(requestIds.map((id, index) => setDoc(doc(db, "documentRequests", id), {
      residentId: "resident", status: index === 204 ? "Pending" : "Completed", hasGenerated: index % 2 === 0,
      createdAt: index === 204 ? Date.UTC(2024, 0, 1) : Date.UTC(2026, 0, 1) + index,
    })))
    await Promise.all(logIds.map((id, index) => setDoc(doc(db, "activityLogs", id), {
      action: index === 504 ? "verification.reject" : "verification.approve",
      actor: { id: "full-admin", name: "Fresh Admin", role: "Full Access" },
      targetCollection: "verifications", targetId: "resident", timestamp: Date.UTC(2026, 0, 1) + index, authoritative: true,
    })))
  })
  const db = environment.authenticatedContext("full-admin").firestore()
  const requests = await fetchOrderedCollectionPages<any>(db as any, "documentRequests", "createdAt", 200)
  const logs = await fetchOrderedCollectionPages<any>(db as any, "activityLogs", "timestamp", 250)
  assert.equal(requests.filter(item => item.id.startsWith("page-request-")).length, 205)
  assert.ok(requests.some(item => item.id === "page-request-204" && item.status === "Pending" && new Date(item.createdAt).getUTCFullYear() === 2024))
  assert.equal(requests.filter(item => item.id.startsWith("page-request-") && item.hasGenerated === true).length, 103)
  assert.equal(logs.filter(item => item.id.startsWith("page-log-")).length, 505)
  const rejection = normalizeAuditLog(logs.find(item => item.id === "page-log-504"))
  assert.equal(rejection.actionType, "rejected")
  assert.equal(rejection.actor.name, "Fresh Admin")
  assert.equal(rejection.targetId, "resident")
})
