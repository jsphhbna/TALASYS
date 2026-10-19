import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore"
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

test("notification dismissals are private per-user state for every staff role", async () => {
  const viewerDb = environment.authenticatedContext("viewer").firestore()
  const adminDb = environment.authenticatedContext("full-admin").firestore()
  const residentDb = environment.authenticatedContext("resident").firestore()
  const lockedDb = environment.authenticatedContext("locked").firestore()
  const viewerDismissal = doc(viewerDb, "notificationDismissals", "viewer_shared-notification")

  await assertSucceeds(setDoc(viewerDismissal, {
    userId: "viewer",
    notificationId: "shared-notification",
    dismissedAt: Date.now(),
  }))
  await assertSucceeds(updateDoc(viewerDismissal, { dismissedAt: Date.now() + 1 }))
  await assertFails(updateDoc(viewerDismissal, { notificationId: "another-notification" }))
  await assertFails(setDoc(doc(viewerDb, "notificationDismissals", "arbitrary-id"), {
    userId: "viewer",
    notificationId: "shared-notification",
    dismissedAt: Date.now(),
  }))

  for (const staffId of ["verifier", "processor", "resident-manager", "full-admin", "superadmin"]) {
    const staffDb = environment.authenticatedContext(staffId).firestore()
    await assertSucceeds(setDoc(doc(staffDb, "notificationDismissals", `${staffId}_shared-notification`), {
      userId: staffId,
      notificationId: "shared-notification",
      dismissedAt: Date.now(),
    }))
  }

  await assertFails(getDoc(doc(adminDb, "notificationDismissals", "viewer_shared-notification")))
  await assertFails(setDoc(doc(adminDb, "notificationDismissals", "forged-viewer-dismissal"), {
    userId: "viewer",
    notificationId: "shared-notification",
    dismissedAt: Date.now(),
  }))
  await assertFails(setDoc(doc(residentDb, "notificationDismissals", "resident_shared-notification"), {
    userId: "resident",
    notificationId: "shared-notification",
    dismissedAt: Date.now(),
  }))
  await assertFails(setDoc(doc(lockedDb, "notificationDismissals", "locked_shared-notification"), {
    userId: "locked",
    notificationId: "shared-notification",
    dismissedAt: Date.now(),
  }))

  const ownDismissals = await assertSucceeds(getDocs(query(
    collection(viewerDb, "notificationDismissals"),
    where("userId", "==", "viewer"),
  )))
  assert.equal(ownDismissals.size, 1)
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
  await assertFails(setDoc(doc(db, "paymentOperations", "forged"), { status: "completed" }))
  await assertFails(getDoc(doc(db, "paymentOperations", "forged")))
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

  // 9. F01: Resident owner can delete their own rejected profile-edit verification to revert
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await setDoc(doc(db, "verifications", "rejected-profile-edit"), {
      residentId: "resident",
      userId: "resident",
      type: "profile-edit",
      status: "rejected",
    })
    await setDoc(doc(db, "verifications", "rejected-registration"), {
      residentId: "resident",
      userId: "resident",
      type: "registration",
      status: "rejected",
    })
  })
  // Another resident cannot delete it
  await assertFails(deleteDoc(doc(expiredDb, "verifications", "rejected-profile-edit")))
  // Resident cannot delete rejected registration verification
  await assertFails(deleteDoc(doc(otherResidentDb, "verifications", "rejected-registration")))
  // Resident owner CAN delete rejected profile-edit verification
  await assertSucceeds(deleteDoc(doc(otherResidentDb, "verifications", "rejected-profile-edit")))
})

test("SEC-F02: Direct client SDK updates to payment fields are strictly denied by Firestore rules", async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    for (const [id, status, paymentStatus] of [
      ["paid-request", "On Process", "paid"],
      ["waived-request", "On Process", "waived"],
      ["cancelled-request", "Cancelled", "unpaid"],
      ["rejected-request", "Rejected", "unpaid"],
      ["completed-request", "Completed", "unpaid"],
      ["legitimate-unpaid", "On Process", "unpaid"],
      ["cash-unpaid", "On Process", "unpaid"],
      ["pending-cancel-test", "Pending", "unpaid"],
    ]) await setDoc(doc(db, "documentRequests", id), { residentId: "resident", status, paymentStatus })
  })
  const residentDb = environment.authenticatedContext("resident").firestore()

  // Client SDK payment submission attempts MUST FAIL (SEC-F02 requires server endpoint POST /api/resident/requests/pay)
  const gcashPayment = {
    paymentStatus: "pending_verification",
    paymentMethod: "gcash",
    gcashRefNumber: "REF-VALID",
    gcashScreenshotUrl: "https://res.cloudinary.com/talasys-cloud/image/authenticated/s--xyz--/v1/talasys/receipts/resident/receipt.jpg",
    paymentSubmittedAt: 1,
  }
  await assertFails(updateDoc(doc(residentDb, "documentRequests", "legitimate-unpaid"), gcashPayment))

  const cashPayment = {
    paymentStatus: "pending_verification",
    paymentMethod: "cash",
    paymentSubmittedAt: 1,
  }
  await assertFails(updateDoc(doc(residentDb, "documentRequests", "cash-unpaid"), cashPayment))

  // Forged receipt URL payment attempt fails
  const forgedPayment = {
    paymentStatus: "pending_verification",
    paymentMethod: "gcash",
    gcashRefNumber: "REF-FORGED",
    gcashScreenshotUrl: "https://res.cloudinary.com/talasys-cloud/image/authenticated/s--xyz--/v1/talasys/receipts/other-user/receipt.jpg",
    paymentSubmittedAt: 1,
  }
  await assertFails(updateDoc(doc(residentDb, "documentRequests", "legitimate-unpaid"), forgedPayment))

  // Only cancellation transition by resident on Pending requests is allowed via client SDK
  await assertSucceeds(updateDoc(doc(residentDb, "documentRequests", "pending-cancel-test"), {
    status: "Cancelled",
    cancelledAt: 1,
    statusTimestamps: { cancelled: 1 },
  }))
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

// =========================================================================
// MILESTONE E01: Comprehensive Denied-Account Firestore Client Authorization
// =========================================================================
test("Milestone E01: Denied accounts fail closed across all direct Firestore client operations", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()

    // 1. Seed permanently denied resident (status: Deleted, registrationDenied: true, deniedAt set)
    await setDoc(doc(db, "users", "denied-resident"), {
      name: "Denied Resident",
      role: "resident",
      status: "Deleted",
      isVerified: false,
      registrationDenied: true,
      deniedAt: Date.now() - 100000,
      denialReason: "Fraudulent records",
    })

    // 2. Seed denied resident with status Expired (legacy inconsistency from D01, registrationDenied: true)
    await setDoc(doc(db, "users", "expired-denied-resident"), {
      name: "Expired Denied Resident",
      role: "resident",
      status: "Expired",
      isVerified: false,
      registrationDenied: true,
      deniedAt: Date.now() - 200000,
      denialReason: "Fabricated identity",
    })

    // 3. Seed ordinary legitimate pending applicant
    await setDoc(doc(db, "users", "pending-applicant"), {
      name: "Pending Applicant",
      role: "resident",
      status: "Pending",
      isVerified: false,
      registrationDenied: false,
      hasPendingVerification: true,
      pendingVerificationId: "verif-pending-app",
    })

    // 4. Seed correctably rejected applicant
    await setDoc(doc(db, "users", "rejected-applicant"), {
      name: "Rejected Applicant",
      role: "resident",
      status: "Pending",
      isVerified: false,
      registrationDenied: false,
      hasPendingVerification: false,
    })

    // 5. Seed requests for denied resident
    await setDoc(doc(db, "documentRequests", "denied-pending-req"), {
      residentId: "denied-resident",
      status: "Pending",
      documentType: "Barangay Clearance",
    })
    await setDoc(doc(db, "documentRequests", "denied-cancelled-req"), {
      residentId: "denied-resident",
      status: "Cancelled",
      documentType: "Barangay Clearance",
    })

    // 6. Seed verifications for denied resident
    await setDoc(doc(db, "verifications", "denied-reg-verif"), {
      residentId: "denied-resident",
      userId: "denied-resident",
      type: "registration",
      status: "denied",
      denialReason: "Fraudulent records",
    })
    await setDoc(doc(db, "verifications", "denied-profile-edit"), {
      residentId: "denied-resident",
      userId: "denied-resident",
      type: "profile-edit",
      status: "pending",
    })
    await setDoc(doc(db, "verifications", "denied-reactivation"), {
      residentId: "denied-resident",
      userId: "denied-resident",
      type: "reactivation",
      status: "pending",
    })

    // 7. Seed notifications for denied resident
    await setDoc(doc(db, "notifications", "denied-notif"), {
      targetId: "denied-resident",
      type: "alert",
      title: "Notice of Denial",
      message: "Application denied",
      isRead: false,
    })

    // 8. Seed verifications and notifications for pending and rejected applicants
    await setDoc(doc(db, "verifications", "verif-pending-app"), {
      residentId: "pending-applicant",
      userId: "pending-applicant",
      type: "registration",
      status: "pending",
    })
    await setDoc(doc(db, "notifications", "pending-notif"), {
      targetId: "pending-applicant",
      type: "info",
      title: "Application Received",
      isRead: false,
    })
    await setDoc(doc(db, "verifications", "verif-rejected-app"), {
      residentId: "rejected-applicant",
      userId: "rejected-applicant",
      type: "registration",
      status: "rejected",
      rejectionReason: "Blurry document",
    })
    await setDoc(doc(db, "notifications", "rejected-notif"), {
      targetId: "rejected-applicant",
      type: "warning",
      title: "Please Resubmit Documents",
      isRead: false,
    })

    // 9. System config and alerts
    await setDoc(doc(db, "systemConfig", "global"), { active: true, baranggay: "Barangay Test" })
    await setDoc(doc(db, "systemAlerts", "global"), { message: "System maintenance upcoming" })
  })

  const deniedDb = environment.authenticatedContext("denied-resident").firestore()
  const expiredDeniedDb = environment.authenticatedContext("expired-denied-resident").firestore()
  const pendingDb = environment.authenticatedContext("pending-applicant").firestore()
  const rejectedDb = environment.authenticatedContext("rejected-applicant").firestore()
  const verifiedResidentDb = environment.authenticatedContext("resident").firestore()
  const superAdminDb = environment.authenticatedContext("superadmin").firestore()

  // 1. Denied resident cannot read their ordinary profile document
  await assertFails(getDoc(doc(deniedDb, "users", "denied-resident")))

  // 2. Denied resident cannot read their existing document requests
  await assertFails(getDoc(doc(deniedDb, "documentRequests", "denied-pending-req")))

  // 3. Denied resident cannot delete a Pending document request
  await assertFails(deleteDoc(doc(deniedDb, "documentRequests", "denied-pending-req")))

  // 4. Denied resident cannot delete a Cancelled document request
  await assertFails(deleteDoc(doc(deniedDb, "documentRequests", "denied-cancelled-req")))

  // 5. Denied resident cannot read ordinary verification records
  await assertFails(getDoc(doc(deniedDb, "verifications", "denied-reg-verif")))

  // 6. Denied resident cannot withdraw profile-edit or reactivation verifications
  await assertFails(deleteDoc(doc(deniedDb, "verifications", "denied-profile-edit")))
  await assertFails(deleteDoc(doc(deniedDb, "verifications", "denied-reactivation")))

  // 7. Denied resident cannot create Admin-targeted notifications
  await assertFails(setDoc(doc(deniedDb, "notifications", "forged-denied-notif"), {
    targetId: "admin",
    type: "alert",
    title: "Denied applicant forged notification",
  }))

  // 8. Denied resident cannot update or delete their existing notifications
  await assertFails(updateDoc(doc(deniedDb, "notifications", "denied-notif"), { isRead: true }))
  await assertFails(deleteDoc(doc(deniedDb, "notifications", "denied-notif")))

  // 9. Denied resident cannot access system resources (systemAlerts, systemConfig)
  await assertFails(getDoc(doc(deniedDb, "systemAlerts", "global")))
  await assertFails(getDoc(doc(deniedDb, "systemConfig", "global")))

  // 10. A denied resident with status = "Expired" but registrationDenied = true remains blocked across all collections
  await assertFails(getDoc(doc(expiredDeniedDb, "users", "expired-denied-resident")))
  await assertFails(getDoc(doc(expiredDeniedDb, "documentRequests", "denied-pending-req")))
  await assertFails(getDoc(doc(expiredDeniedDb, "verifications", "denied-reg-verif")))
  await assertFails(getDoc(doc(expiredDeniedDb, "notifications", "denied-notif")))
  await assertFails(getDoc(doc(expiredDeniedDb, "systemConfig", "global")))
  await assertFails(setDoc(doc(expiredDeniedDb, "notifications", "forged-exp-notif"), {
    targetId: "admin",
    type: "reactivation",
    title: "Attempted reactivation on denied account",
  }))

  // 11. An ordinary Pending applicant retains legitimate permissions
  await assertSucceeds(getDoc(doc(pendingDb, "users", "pending-applicant")))
  await assertSucceeds(getDoc(doc(pendingDb, "verifications", "verif-pending-app")))
  await assertSucceeds(getDoc(doc(pendingDb, "notifications", "pending-notif")))
  await assertSucceeds(getDoc(doc(pendingDb, "systemConfig", "global")))
  await assertSucceeds(getDoc(doc(pendingDb, "systemAlerts", "global")))

  // 12. A rejected applicant retains legitimate permissions to inspect profile and verification
  await assertSucceeds(getDoc(doc(rejectedDb, "users", "rejected-applicant")))
  await assertSucceeds(getDoc(doc(rejectedDb, "verifications", "verif-rejected-app")))
  await assertSucceeds(getDoc(doc(rejectedDb, "notifications", "rejected-notif")))

  // 13. A verified resident retains normal permissions
  await assertSucceeds(getDoc(doc(verifiedResidentDb, "users", "resident")))
  await assertSucceeds(getDoc(doc(verifiedResidentDb, "documentRequests", "existing")))
  await assertSucceeds(getDoc(doc(verifiedResidentDb, "systemConfig", "global")))

  // 14. Authorized Super Admin permissions remain intact
  await assertSucceeds(getDoc(doc(superAdminDb, "users", "denied-resident")))
  await assertSucceeds(getDoc(doc(superAdminDb, "documentRequests", "denied-pending-req")))
  await assertSucceeds(getDoc(doc(superAdminDb, "verifications", "denied-reg-verif")))
  await assertSucceeds(deleteDoc(doc(superAdminDb, "verifications", "denied-profile-edit")))

  // 15. A resident cannot access another resident's data
  await assertFails(getDoc(doc(pendingDb, "users", "resident")))
  await assertFails(getDoc(doc(pendingDb, "documentRequests", "existing")))
  await assertFails(getDoc(doc(pendingDb, "verifications", "denied-reg-verif")))
  await assertFails(getDoc(doc(pendingDb, "notifications", "denied-notif")))

  // 16. A denied resident cannot clear registrationDenied or alter server-managed lifecycle fields
  await assertFails(updateDoc(doc(deniedDb, "users", "denied-resident"), {
    registrationDenied: false,
  }))
  await assertFails(updateDoc(doc(deniedDb, "users", "denied-resident"), {
    status: "Active",
    isVerified: true,
  }))
})

test("UI04 & P04: notification ownership and staff read-only boundaries are enforced", async () => {
  const viewerDb = environment.authenticatedContext("viewer").firestore()
  const fullAdminDb = environment.authenticatedContext("full-admin").firestore()
  const residentDb = environment.authenticatedContext("resident").firestore()
  const lockedDb = environment.authenticatedContext("locked").firestore()
  const deletedDb = environment.authenticatedContext("deleted").firestore()

  // Seed sample admin and resident notifications
  await environment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore()
    await setDoc(doc(adminDb, "notifications", "existing-admin-notif"), {
      targetId: "admin",
      type: "info",
      title: "System Update",
      message: "Scheduled maintenance tonight",
      isRead: false,
      createdAt: Date.now(),
    })
    await setDoc(doc(adminDb, "notifications", "existing-resident-notif"), {
      targetId: "resident",
      type: "info",
      title: "Document Ready",
      message: "Your document is ready for pickup",
      isRead: false,
      createdAt: Date.now(),
    })
  })

  // 1. View Only creates notification targeting resident -> denied
  await assertFails(setDoc(doc(viewerDb, "notifications", "viewer-to-resident"), {
    targetId: "resident",
    type: "info",
    title: "Notice",
    message: "Denied",
  }))

  // 2. View Only creates notification targeting Admin -> denied
  await assertFails(setDoc(doc(viewerDb, "notifications", "viewer-to-admin"), {
    targetId: "admin",
    type: "info",
    title: "Admin Notice",
    message: "Denied",
  }))

  // 3. View Only modifies existing notification message -> denied
  await assertFails(updateDoc(doc(viewerDb, "notifications", "existing-admin-notif"), {
    message: "Tampered message",
  }))

  // 4. View Only changes notification target ID -> denied
  await assertFails(updateDoc(doc(viewerDb, "notifications", "existing-admin-notif"), {
    targetId: "viewer",
  }))

  // 5. View Only deletes notification -> denied
  await assertFails(deleteDoc(doc(viewerDb, "notifications", "existing-admin-notif")))
  await assertFails(deleteDoc(doc(fullAdminDb, "notifications", "existing-admin-notif")))

  // 6. View Only read access behaves according to policy (can read admin notifications)
  await assertSucceeds(getDoc(doc(viewerDb, "notifications", "existing-admin-notif")))
  // View Only cannot read another resident's personal notification
  await assertFails(getDoc(doc(viewerDb, "notifications", "existing-resident-notif")))

  // 7. Actual resident creates permitted Admin alert -> allowed
  await assertSucceeds(setDoc(doc(residentDb, "notifications", "resident-alert-to-admin"), {
    targetId: "admin",
    type: "alert",
    title: "Urgent Inquiry",
    message: "Permitted inquiry from resident",
    createdAt: Date.now(),
  }))

  // SEC-01: Resident creates Admin notification with unsafe protocol or external actionUrl -> denied
  await assertFails(setDoc(doc(residentDb, "notifications", "resident-xss-action-url"), {
    targetId: "admin",
    type: "info",
    title: "Malicious Link",
    message: "Click here",
    actionUrl: "javascript:alert(1)",
    createdAt: Date.now(),
  }))
  await assertFails(setDoc(doc(residentDb, "notifications", "resident-phishing-action-url"), {
    targetId: "admin",
    type: "info",
    title: "Phishing Link",
    message: "Log in here",
    actionUrl: "https://evil.example.com/steal-creds",
    createdAt: Date.now(),
  }))
  // SEC-01: Resident creates Admin notification with permitted internal actionUrl -> succeeds
  await assertSucceeds(setDoc(doc(residentDb, "notifications", "resident-payment-action-url"), {
    targetId: "admin",
    type: "info",
    title: "Payment Submitted",
    message: "Payment submitted for review",
    actionUrl: "/admin/requests/payments",
    createdAt: Date.now(),
  }))
  await assertSucceeds(setDoc(doc(residentDb, "notifications", "resident-verification-action-url"), {
    targetId: "admin",
    type: "reactivation",
    title: "Reactivation Requested",
    message: "Account reactivation requested",
    actionUrl: "/admin/verifications",
    createdAt: Date.now(),
  }))

  // 8. Resident impersonates another resident -> denied
  await assertFails(setDoc(doc(residentDb, "notifications", "resident-impersonate-user"), {
    targetId: "viewer",
    type: "info",
    title: "Spoofed Message",
    message: "Targeting non-admin is forbidden",
    createdAt: Date.now(),
  }))

  // 9. Authorized operational Admin creates permitted notification -> allowed
  await assertSucceeds(setDoc(doc(fullAdminDb, "notifications", "operational-admin-broadcast"), {
    targetId: "resident",
    type: "info",
    title: "Barangay General Assembly",
    message: "Attendance requested",
    createdAt: Date.now(),
  }))

  // 10. Authorized Admin updates read state without unauthorized content changes
  // Updating isRead alone -> succeeds
  await assertSucceeds(updateDoc(doc(fullAdminDb, "notifications", "existing-admin-notif"), {
    isRead: true,
  }))
  // Updating content (message/targetId) -> denied
  await assertFails(updateDoc(doc(fullAdminDb, "notifications", "existing-admin-notif"), {
    message: "Unauthorized content modification",
  }))
  await assertFails(updateDoc(doc(fullAdminDb, "notifications", "existing-admin-notif"), {
    targetId: "full-admin",
  }))

  // 11. Locked or deleted accounts cannot exploit notification exceptions
  await assertFails(setDoc(doc(lockedDb, "notifications", "locked-attempt"), {
    targetId: "admin",
    type: "alert",
    title: "Locked Attempt",
  }))
  await assertFails(setDoc(doc(deletedDb, "notifications", "deleted-attempt"), {
    targetId: "admin",
    type: "alert",
    title: "Deleted Attempt",
  }))

  // 12. Resident updates read state on own notification -> succeeds; content update -> denied
  await assertSucceeds(updateDoc(doc(residentDb, "notifications", "existing-resident-notif"), {
    isRead: true,
  }))
  await assertFails(updateDoc(doc(residentDb, "notifications", "existing-resident-notif"), {
    message: "Resident cannot alter message",
  }))
  await assertSucceeds(deleteDoc(doc(residentDb, "notifications", "existing-resident-notif")))
})
