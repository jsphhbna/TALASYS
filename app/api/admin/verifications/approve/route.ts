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
        if (existing?.attemptId !== attemptId && existing?.leaseUntil > now && ["auth-pending", "reconciliation-required"].includes(existing.status)) return { outcome: "conflict" as const }
        if (!["pending", "processing"].includes(verification.status || "pending")) throw Object.assign(new Error("Verification is no longer pending"), { status: 409 })
        if (!verification.residentId) throw Object.assign(new Error("Verification has no resident"), { status: 400 })
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(verification.residentId)
        const residentSnapshot = await transaction.get(residentRef)
        if (!residentSnapshot.exists || residentSnapshot.data()?.role !== "resident") throw Object.assign(new Error("Target resident not found"), { status: 404 })
        const resident = residentSnapshot.data() || {}
        const calculated = profileUpdates(verification, resident, now)
        const operation: ApprovalOperation = { id: verificationId, verificationId, residentId: verification.residentId, verificationType: calculated.type, actorUid, actorName: caller.name || "Administrator", attemptId, oldEmail: resident.email?.toLowerCase(), newEmail: calculated.newEmail, profileUpdates: calculated.updates, status: "auth-pending" }
        const persistedOperation = Object.fromEntries(Object.entries({ ...operation, attemptId, ipAddress, leaseUntil: now + 120_000, status: "auth-pending", createdAt: existing?.createdAt || now, updatedAt: now }).filter(([, value]) => value !== undefined))
        transaction.set(opRef, persistedOperation)
        transaction.update(verificationRef, { status: "processing", processingOperationId: verificationId, processingAttemptId: attemptId, processingBy: actorUid, updatedAt: now })
        return { outcome: "claimed" as const, operation }
      })
    },
    async getAuthEmail(uid) { return (await adminAuth.getUser(uid)).email },
    async updateAuthEmail(uid, email) { await adminAuth.updateUser(uid, { email }) },
    async owns(operation) {
      const snapshot = await operationRef(operation.verificationId).get()
      const value = snapshot.data()
      return snapshot.exists && value?.attemptId === operation.attemptId && ["auth-pending", "reconciliation-required"].includes(value.status)
    },
    async complete(operation, now) {
      await adminDb.runTransaction(async (transaction: any) => {
        const opRef = operationRef(operation.verificationId)
        const verificationRef = adminDb.collection(COLLECTION_VERIFICATIONS).doc(operation.verificationId)
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(operation.residentId)
        const [opSnapshot, verificationSnapshot, residentSnapshot] = await Promise.all([transaction.get(opRef), transaction.get(verificationRef), transaction.get(residentRef)])
        const storedOperation = opSnapshot.data()
        const storedVerification = verificationSnapshot.data()
        if (storedOperation?.status === "completed" && storedOperation?.attemptId === operation.attemptId) return
        if (storedOperation?.attemptId !== operation.attemptId || !["auth-pending", "reconciliation-required"].includes(storedOperation?.status)) throw Object.assign(new Error("Approval attempt no longer owns this operation"), { status: 409 })
        if (storedVerification?.status !== "processing" || storedVerification?.processingOperationId !== operation.verificationId || storedVerification?.processingAttemptId !== operation.attemptId) throw Object.assign(new Error("Verification processing fence changed"), { status: 409 })
        if (!residentSnapshot.exists || residentSnapshot.data()?.role !== "resident") throw new Error("Resident disappeared during approval")
        const currentResidentEmail = String(residentSnapshot.data()?.email || "").toLowerCase()
        if (operation.newEmail && currentResidentEmail !== String(operation.oldEmail || "").toLowerCase() && currentResidentEmail !== operation.newEmail.toLowerCase()) throw Object.assign(new Error("Resident identity changed during approval"), { status: 409 })
        const actionPrefix = operation.verificationType === "profile-edit" ? "Profile Edit" : operation.verificationType === "reactivation" ? "Reactivation" : "Verification"
        transaction.update(residentRef, operation.profileUpdates)
        transaction.update(verificationRef, { status: "approved", approvedAt: now, approvedBy: operation.actorName, approvedByUid: operation.actorUid, processingOperationId: null, processingAttemptId: null })
        transaction.set(adminDb.collection(COLLECTION_NOTIFICATIONS).doc(`verification-approved-${operation.verificationId}`), { targetId: operation.residentId, type: "success", title: `${actionPrefix} Approved`, message: `Your ${actionPrefix.toLowerCase()} has been approved.`, timestamp: "Just now", isRead: false, createdAt: now, operationId: operation.verificationId })
        transaction.set(adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(`verification-approved-${operation.verificationId}`), { actor: { id: operation.actorUid, name: operation.actorName }, action: `Approved ${actionPrefix}`, actionType: "approved", targetId: operation.residentId, targetCollection: COLLECTION_VERIFICATIONS, before: { verificationStatus: "pending", email: operation.oldEmail || null }, after: { verificationStatus: "approved", email: operation.newEmail || operation.oldEmail || null }, operationId: operation.verificationId, ipAddress: opSnapshot.data()?.ipAddress || "Unknown", timestamp: now, createdAt: now })
        transaction.update(opRef, { status: "completed", completedAt: now, leaseUntil: 0 })
      })
    },
    async authFailed(operation, message, now) { await finalizeOwnedFailure(adminDb, operationRef(operation.verificationId), operation, "auth-failed", message, now, true) },
    async reconciliationRequired(operation, message, now) { await finalizeOwnedFailure(adminDb, operationRef(operation.verificationId), operation, "reconciliation-required", message, now, false) },
    async compensated(operation, message, now) { await finalizeOwnedFailure(adminDb, operationRef(operation.verificationId), operation, "compensated", message, now, true) },
  }
}

async function finalizeOwnedFailure(db: any, opRef: any, operation: ApprovalOperation, status: string, message: string, now: number, releaseVerification: boolean) {
  await db.runTransaction(async (transaction: any) => {
    const verificationRef = db.collection(COLLECTION_VERIFICATIONS).doc(operation.verificationId)
    const [opSnapshot, verificationSnapshot] = await Promise.all([transaction.get(opRef), transaction.get(verificationRef)])
    if (opSnapshot.data()?.attemptId !== operation.attemptId) throw Object.assign(new Error("Stale approval attempt cannot change operation state"), { status: 409 })
    if (releaseVerification && (verificationSnapshot.data()?.processingAttemptId !== operation.attemptId || verificationSnapshot.data()?.processingOperationId !== operation.verificationId)) throw Object.assign(new Error("Stale approval attempt cannot release verification"), { status: 409 })
    transaction.update(opRef, { status, error: message, leaseUntil: 0, updatedAt: now })
    if (releaseVerification) transaction.update(verificationRef, { status: "pending", processingOperationId: null, processingAttemptId: null, updatedAt: now })
  })
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
