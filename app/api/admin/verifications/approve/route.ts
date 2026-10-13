import { NextResponse } from "next/server.js"
import { randomUUID } from "node:crypto"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { canManageVerificationsRole } from "../../../../../lib/auth/auth-types.ts"
import { extractClientIp } from "../../../../../lib/security/request-ip.ts"
import { coordinateVerificationApproval, type ApprovalCoordinatorDependencies, type ApprovalOperation, type VerificationType } from "../../../../../lib/admin/verification-approval.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_NOTIFICATIONS, COLLECTION_USERS, COLLECTION_VERIFICATIONS } from "../../../../../lib/constants.ts"

function normalizedType(value: unknown): VerificationType | null {
  if (value === "profile-edit" || value === "reactivation") return value
  if (value === "registration" || value === undefined || value === null || value === "") return "registration"
  return null
}

function profileUpdates(verification: Record<string, any>, resident: Record<string, any>, now: number) {
  const type = normalizedType(verification.type)
  if (!type) throw Object.assign(new Error("Unsupported verification type"), { status: 400 })
  const updates: Record<string, unknown> = { updatedAt: now }
  if (type === "profile-edit") {
    if (!Array.isArray(verification.changes)) throw Object.assign(new Error("Profile edit has no valid changes"), { status: 400 })
    for (const change of verification.changes) {
      if (change.field === "Full Name") updates.name = change.newValue
      else if (change.field === "Date of Birth") updates.dateOfBirth = change.newValue
      else if (change.field === "Contact Number") updates.contactNumber = change.newValue
      else if (change.field === "Email Address") updates.email = String(change.newValue || "").trim().toLowerCase()
      else if (change.field === "Address") updates.address = change.newValue
      else if (change.field === "Resident Statuses") updates.statuses = change.newValue === "None" ? [] : String(change.newValue).split(", ")
      else if (/photo|picture/i.test(String(change.field))) updates.profilePicture = change.newValue
    }
  } else if (type === "reactivation") {
    updates.isVerified = true; updates.status = "Active"; updates.accountExpiry = now + 365 * 24 * 60 * 60 * 1000
  } else {
    updates.isVerified = true; updates.status = "Active"
  }
  if (resident.isVerified === false && type === "profile-edit") { updates.isVerified = true; updates.status = "Active" }
  return { type, updates, newEmail: typeof updates.email === "string" ? updates.email : undefined }
}

export function createFirestoreApprovalDependencies(): ApprovalCoordinatorDependencies {
  if (!adminDb || !adminAuth) throw Object.assign(new Error("Server authentication service unavailable"), { status: 503 })
  const operationRef = (verificationId: string) => adminDb.collection("verificationApprovalOperations").doc(verificationId)
  return {
    async claim({ verificationId, actorUid, attemptId, ipAddress, now }) {
      return adminDb.runTransaction(async (transaction: any) => {
        const callerRef = adminDb.collection(COLLECTION_USERS).doc(actorUid)
        const verificationRef = adminDb.collection(COLLECTION_VERIFICATIONS).doc(verificationId)
        const opRef = operationRef(verificationId)
        const [callerSnapshot, verificationSnapshot, operationSnapshot] = await Promise.all([transaction.get(callerRef), transaction.get(verificationRef), transaction.get(opRef)])
        if (!callerSnapshot.exists) throw Object.assign(new Error("Caller account not found"), { status: 403 })
        const caller = callerSnapshot.data() || {}
        if (!canManageVerificationsRole(caller.role) || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) throw Object.assign(new Error("Caller is not authorized to approve verifications"), { status: 403 })
        if (!verificationSnapshot.exists) throw Object.assign(new Error("Verification not found"), { status: 404 })
        const verification = verificationSnapshot.data() || {}
        const existing = operationSnapshot.exists ? operationSnapshot.data() : null
        if (verification.status === "approved" || existing?.status === "completed") return { outcome: "completed" as const }
        if (existing?.status === "auth-pending" && existing.attemptId !== attemptId && existing.leaseUntil > now) return { outcome: "conflict" as const }
        if (!["pending", "processing"].includes(verification.status || "pending")) throw Object.assign(new Error("Verification is no longer pending"), { status: 409 })
        if (!verification.residentId) throw Object.assign(new Error("Verification has no resident"), { status: 400 })
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(verification.residentId)
        const residentSnapshot = await transaction.get(residentRef)
        if (!residentSnapshot.exists || residentSnapshot.data()?.role !== "resident") throw Object.assign(new Error("Target resident not found"), { status: 404 })
        const resident = residentSnapshot.data() || {}
        const calculated = profileUpdates(verification, resident, now)
        const operation: ApprovalOperation = { id: verificationId, verificationId, residentId: verification.residentId, verificationType: calculated.type, actorUid, actorName: caller.name || "Administrator", oldEmail: resident.email?.toLowerCase(), newEmail: calculated.newEmail, profileUpdates: calculated.updates, status: "auth-pending" }
        transaction.set(opRef, { ...operation, attemptId, ipAddress, leaseUntil: now + 120_000, status: "auth-pending", createdAt: existing?.createdAt || now, updatedAt: now })
        transaction.update(verificationRef, { status: "processing", processingOperationId: verificationId, processingBy: actorUid, updatedAt: now })
        return { outcome: "claimed" as const, operation }
      })
    },
    async getAuthEmail(uid) { return (await adminAuth.getUser(uid)).email },
    async updateAuthEmail(uid, email) { await adminAuth.updateUser(uid, { email }) },
    async complete(operation, now) {
      await adminDb.runTransaction(async (transaction: any) => {
        const opRef = operationRef(operation.verificationId)
        const verificationRef = adminDb.collection(COLLECTION_VERIFICATIONS).doc(operation.verificationId)
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(operation.residentId)
        const [opSnapshot, verificationSnapshot, residentSnapshot] = await Promise.all([transaction.get(opRef), transaction.get(verificationRef), transaction.get(residentRef)])
        if (opSnapshot.data()?.status === "completed" || verificationSnapshot.data()?.status === "approved") return
        if (opSnapshot.data()?.status !== "auth-pending" && opSnapshot.data()?.status !== "reconciliation-required") throw new Error("Approval operation is not resumable")
        if (!residentSnapshot.exists) throw new Error("Resident disappeared during approval")
        const actionPrefix = operation.verificationType === "profile-edit" ? "Profile Edit" : operation.verificationType === "reactivation" ? "Reactivation" : "Verification"
        transaction.update(residentRef, operation.profileUpdates)
        transaction.update(verificationRef, { status: "approved", approvedAt: now, approvedBy: operation.actorName, approvedByUid: operation.actorUid, processingOperationId: null })
        transaction.set(adminDb.collection(COLLECTION_NOTIFICATIONS).doc(`verification-approved-${operation.verificationId}`), { targetId: operation.residentId, type: "success", title: `${actionPrefix} Approved`, message: `Your ${actionPrefix.toLowerCase()} has been approved.`, timestamp: "Just now", isRead: false, createdAt: now, operationId: operation.verificationId })
        transaction.set(adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(`verification-approved-${operation.verificationId}`), { actor: { id: operation.actorUid, name: operation.actorName }, action: `Approved ${actionPrefix}`, actionType: "approved", targetId: operation.residentId, targetCollection: COLLECTION_VERIFICATIONS, before: { verificationStatus: "pending", email: operation.oldEmail || null }, after: { verificationStatus: "approved", email: operation.newEmail || operation.oldEmail || null }, operationId: operation.verificationId, ipAddress: opSnapshot.data()?.ipAddress || "Unknown", timestamp: now, createdAt: now })
        transaction.update(opRef, { status: "completed", completedAt: now, leaseUntil: 0 })
      })
    },
    async authFailed(operation, message, now) { const batch = adminDb.batch(); batch.update(operationRef(operation.verificationId), { status: "auth-failed", error: message, leaseUntil: 0, updatedAt: now }); batch.update(adminDb.collection(COLLECTION_VERIFICATIONS).doc(operation.verificationId), { status: "pending", processingOperationId: null, updatedAt: now }); await batch.commit() },
    async reconciliationRequired(operation, message, now) { await operationRef(operation.verificationId).update({ status: "reconciliation-required", error: message, leaseUntil: 0, updatedAt: now }) },
    async compensated(operation, message, now) { const batch = adminDb.batch(); batch.update(operationRef(operation.verificationId), { status: "compensated", error: message, leaseUntil: 0, updatedAt: now }); batch.update(adminDb.collection(COLLECTION_VERIFICATIONS).doc(operation.verificationId), { status: "pending", processingOperationId: null, updatedAt: now }); await batch.commit() },
  }
}

export function createApproveVerificationHandler(injected?: { auth?: typeof adminAuth; dependencies?: ApprovalCoordinatorDependencies; uuid?: () => string }) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth || adminAuth
      if (!auth) return NextResponse.json({ error: "Server authentication service unavailable" }, { status: 503 })
      const header = req.headers.get("authorization")
      if (!header?.startsWith("Bearer ")) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 })
      let decoded: any
      try { decoded = await auth.verifyIdToken(header.slice(7), true) } catch { return NextResponse.json({ error: "Session invalid or expired" }, { status: 401 }) }
      const body = await req.json().catch(() => ({}))
      if (typeof body.verificationId !== "string" || !body.verificationId) return NextResponse.json({ error: "verificationId is required" }, { status: 400 })
      const result = await coordinateVerificationApproval(injected?.dependencies || createFirestoreApprovalDependencies(), { verificationId: body.verificationId, actorUid: decoded.uid, attemptId: typeof body.attemptId === "string" ? body.attemptId : (injected?.uuid || randomUUID)(), ipAddress: extractClientIp(req) })
      return NextResponse.json({ success: true, ...result })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Approval failed", operationIncomplete: error?.status === 503 }, { status: error?.status || 500 })
    }
  }
}

export const POST = createApproveVerificationHandler()
