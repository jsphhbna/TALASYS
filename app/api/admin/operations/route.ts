import { createHash, randomUUID } from "node:crypto"
import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { canManageRequestsRole, canManageResidentsRole, canManageVerificationsRole, isSuperAdminRole } from "../../../../lib/auth/auth-types.ts"
import { extractClientIp } from "../../../../lib/security/request-ip.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_DOCUMENT_REQUESTS, COLLECTION_NOTIFICATIONS, COLLECTION_SYSTEM_ALERTS, COLLECTION_SYSTEM_CONFIG, COLLECTION_USERS, COLLECTION_VERIFICATIONS, SYSTEM_CONFIG_DOCUMENT_ID } from "../../../../lib/constants.ts"

type Actor = { uid: string; name: string; email?: string; role: string }
type OperationBody = { operation?: string; operationId?: string; targetId?: string; payload?: Record<string, any> }

const INACTIVE = new Set(["Locked", "Deleted", "Deleted by Resident"])
const RESIDENT_PROFILE_FIELDS = new Set(["name", "dateOfBirth", "contactNumber", "address", "statuses", "profilePicture"])
const ADMIN_UPDATE_FIELDS = new Set(["name", "role", "status"])
const SYSTEM_CONFIG_FIELDS = new Set(["barangayName", "barangayCaptainName", "secretaryName", "captainSignatureUrl", "secretarySignatureUrl", "officialSignatureUrl", "contactNumber", "emailAddress", "address", "enabledModules", "documentTypes", "documentFees", "templates", "customDocumentTypes"])
const SYSTEM_ALERT_FIELDS = new Set(["severity", "title", "description", "metric"])
const ADMIN_ROLES = new Set(["admin", "Full Access", "Verification Only", "Documents Only", "View Only", "Resident Management", "Verifications", "Document Processing"])
const REQUEST_STATUSES = new Set(["Approved", "On Process", "Processing", "Awaiting Payment", "Ready for Pick Up", "Completed", "Rejected", "Cancelled"])
const REQUEST_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  "Pending": new Set(["Approved", "On Process", "Awaiting Payment", "Rejected", "Cancelled"]),
  "Approved": new Set(["On Process", "Awaiting Payment", "Rejected", "Cancelled"]),
  "On Process": new Set(["Awaiting Payment", "Ready for Pick Up", "Completed", "Rejected", "Cancelled"]),
  "Awaiting Payment": new Set(["On Process", "Ready for Pick Up", "Rejected", "Cancelled"]),
  "Ready for Pick Up": new Set(["Completed", "Cancelled"]),
}

function httpError(message: string, status: number) { return Object.assign(new Error(message), { status }) }
function safeObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {} }
function exactFields(value: Record<string, any>, allowed: Set<string>) {
  if (Object.keys(value).some(key => !allowed.has(key))) throw httpError("Operation contains unsupported or server-managed fields.", 400)
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined))
}
function operationDocumentId(operationId: string) { return `admin-op-${createHash("sha256").update(operationId).digest("hex")}` }

function authorize(role: string, operation: string) {
  if (operation.startsWith("resident.")) return canManageResidentsRole(role)
  if (operation === "verification.reject") return canManageVerificationsRole(role)
  if (operation.startsWith("request.")) return canManageRequestsRole(role)
  if (operation.startsWith("notification.")) return canManageResidentsRole(role) || canManageVerificationsRole(role) || canManageRequestsRole(role)
  if (operation.startsWith("admin.") || operation.startsWith("system.")) return isSuperAdminRole(role)
  return false
}

function auditEvent(actor: Actor, operation: string, operationId: string, targetId: string | undefined, ipAddress: string, before: unknown, after: unknown, now: number, payloadHash?: string) {
  return {
    actor: { id: actor.uid, name: actor.name, email: actor.email || "unknown", role: actor.role },
    action: operation, actionType: operation.split(".")[0], targetId: targetId || null,
    before, after, operationId, ipAddress, timestamp: now, createdAt: now, authoritative: true,
    ...(payloadHash ? { payloadHash } : {})
  }
}

async function executeFirestoreOperation(db: any, actorUid: string, body: Required<Pick<OperationBody, "operation" | "operationId">> & OperationBody, ipAddress: string, now: number) {
  const operation = body.operation
  const operationId = body.operationId
  const targetId = typeof body.targetId === "string" ? body.targetId : undefined
  const payload = safeObject(body.payload)
  const payloadHash = createHash("sha256").update(JSON.stringify(payload || {})).digest("hex")
  return db.runTransaction(async (transaction: any) => {
    const callerRef = db.collection(COLLECTION_USERS).doc(actorUid)
    const auditRef = db.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId(operationId))
    let targetRef: any = null
    if (operation.startsWith("resident.") || operation.startsWith("admin.")) targetRef = targetId ? db.collection(COLLECTION_USERS).doc(targetId) : null
    else if (operation === "verification.reject") targetRef = targetId ? db.collection(COLLECTION_VERIFICATIONS).doc(targetId) : null
    else if (operation.startsWith("request.")) targetRef = targetId ? db.collection(COLLECTION_DOCUMENT_REQUESTS).doc(targetId) : null
    else if (operation === "system.alert.dismiss") targetRef = targetId ? db.collection(COLLECTION_SYSTEM_ALERTS).doc(targetId) : null
    else if (operation === "system.config.update") targetRef = db.collection(COLLECTION_SYSTEM_CONFIG).doc(SYSTEM_CONFIG_DOCUMENT_ID)
    const snapshots = await Promise.all([transaction.get(callerRef), transaction.get(auditRef), ...(targetRef ? [transaction.get(targetRef)] : [])])
    const callerSnapshot = snapshots[0]
    const auditSnapshot = snapshots[1]
    const targetSnapshot = targetRef ? snapshots[2] : null
    if (!callerSnapshot.exists) throw httpError("Caller account not found.", 403)
    const callerData = callerSnapshot.data() || {}
    if (INACTIVE.has(callerData.status) || !authorize(callerData.role, operation)) throw httpError("Caller is not authorized for this operation.", 403)
    if (auditSnapshot.exists) {
      const existingAudit = auditSnapshot.data() || {}
      if (
        existingAudit.actor?.id !== actorUid ||
        existingAudit.action !== operation ||
        (existingAudit.targetId || undefined) !== (targetId || undefined) ||
        (existingAudit.payloadHash && existingAudit.payloadHash !== payloadHash)
      ) {
        throw httpError("Idempotency conflict: operationId was already executed with different actor, operation, target, or payload.", 409)
      }
      return { idempotent: true }
    }
    if (targetRef && !targetSnapshot?.exists && operation !== "system.config.update") throw httpError("Target record not found.", 404)
    const actor: Actor = { uid: actorUid, name: callerData.name || "Administrator", email: callerData.email, role: callerData.role }
    const before = targetSnapshot?.data() || null
    let after: Record<string, any> | null = null
    let notification: { id: string; value: Record<string, any> } | null = null

    if (operation === "resident.update") {
      if (before.role !== "resident") throw httpError("Target is not a resident.", 403)
      const updates = exactFields(safeObject(payload.updates), RESIDENT_PROFILE_FIELDS)
      if (!Object.keys(updates).length) throw httpError("No supported resident fields were supplied.", 400)
      after = { ...updates, updatedAt: now }
      if (typeof payload.removePhotoReason === "string" && payload.removePhotoReason.trim()) notification = { id: `resident-photo-${operationDocumentId(operationId)}`, value: { targetId, type: "warning", title: "Profile Picture Removed", message: `Your profile picture was removed by an administrator. Reason: ${payload.removePhotoReason.trim()}`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
      transaction.update(targetRef, after)
    } else if (["resident.delete", "resident.deactivate", "resident.activate"].includes(operation)) {
      if (before.role !== "resident") throw httpError("Target is not a resident.", 403)
      after = { status: operation === "resident.delete" ? "Deleted" : operation === "resident.deactivate" ? "Expired" : "Active", updatedAt: now }
      transaction.update(targetRef, after)
    } else if (operation === "verification.reject") {
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : ""
      if (reason.length < 10) throw httpError("Rejection requires a reason of at least 10 characters.", 400)
      if (before.status !== "pending") throw httpError("Verification is no longer pending.", 409)
      after = { status: "rejected", rejectionReason: reason, rejectedAt: now, rejectedBy: actor.name, rejectedByUid: actor.uid }
      transaction.update(targetRef, after)
      const residentId = before.residentId || before.userId
      if (residentId) notification = { id: `verification-rejected-${operationDocumentId(operationId)}`, value: { targetId: residentId, type: "error", title: "Verification Rejected", message: `Your verification was rejected: ${reason}`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
    } else if (operation === "request.updateStatus") {
      if (["Cancelled", "Rejected", "Completed"].includes(before.status)) {
        throw httpError(`Cannot transition request out of terminal state '${before.status}'.`, 409)
      }
      let status = payload.status
      if (!REQUEST_STATUSES.has(status)) throw httpError("Unsupported request status.", 400)
      if (status === "Processing") status = "On Process"
      const currentStatus = before.status === "Processing" ? "On Process" : before.status
      if (!REQUEST_TRANSITIONS[currentStatus]?.has(status)) {
        throw httpError(`Request cannot transition from '${currentStatus}' to '${status}'.`, 409)
      }
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : ""
      if (status === "Rejected" && reason.length < 10) throw httpError("Rejection requires a reason of at least 10 characters.", 400)
      after = { status, ...(reason ? { rejectionReason: reason, rejectReason: reason } : {}), [`statusTimestamps.${status}`]: now }
      transaction.update(targetRef, after)
      if (before.residentId) notification = { id: `request-status-${operationDocumentId(operationId)}`, value: { targetId: before.residentId, type: status === "Rejected" ? "error" : "info", title: `Document ${status}`, message: `Your request for ${before.documentType || "document"} is now ${status}.${reason ? ` Reason: ${reason}` : ""}`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
    } else if (operation === "request.delete") {
      after = null
      transaction.delete(targetRef)
    } else if (operation === "request.markGenerated") {
      after = { hasGenerated: true, updatedAt: now }; transaction.update(targetRef, after)
    } else if (operation === "request.confirmPayment") {
      if (["Cancelled", "Rejected", "Completed"].includes(before.status)) {
        throw httpError("Cannot confirm payment for a cancelled, rejected, or completed request.", 409)
      }
      if (before.paymentStatus === "paid") throw httpError("Payment is already confirmed.", 409)
      if (before.paymentStatus === "waived") throw httpError("Payment for this request has been waived and cannot be paid.", 409)
      const method = payload.paymentMethod === "gcash" ? "gcash" : "cash"
      const receiptNumber = `REC-${new Date(now).getFullYear()}-${operationDocumentId(operationId).slice(-8).toUpperCase()}`
      after = { paymentStatus: "paid", paymentConfirmedAt: now, paymentConfirmedBy: actor.name, receiptNumber, paymentMethod: method, ...(payload.paymentReference ? { [method === "gcash" ? "gcashRefNumber" : "paymentReferenceNumber"]: String(payload.paymentReference) } : {}), ...(["Pending", "Awaiting Payment"].includes(before.status) ? { status: "On Process", "statusTimestamps.On Process": now } : {}) }
      transaction.update(targetRef, after)
      if (before.residentId) notification = { id: `payment-confirmed-${operationDocumentId(operationId)}`, value: { targetId: before.residentId, type: "success", title: "Payment Confirmed", message: `Your payment for ${before.documentType || "document"} has been confirmed. Receipt #: ${receiptNumber}`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
    } else if (operation === "request.markPayLater") {
      if (["Cancelled", "Rejected", "Completed"].includes(before.status)) {
        throw httpError("Cannot update payment option on a terminal request.", 409)
      }
      if (before.paymentStatus === "paid" || before.paymentStatus === "waived") {
        throw httpError("Cannot transition a paid or waived request to unpaid.", 409)
      }
      after = { paymentStatus: "unpaid", paymentMethod: "cash", updatedAt: now }; transaction.update(targetRef, after)
      if (before.residentId) notification = { id: `payment-later-${operationDocumentId(operationId)}`, value: { targetId: before.residentId, type: "info", title: "Payment Option Updated", message: `Your payment method for ${before.documentType || "document"} was marked as Pay Later by the admin.`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
    } else if (operation === "request.waivePayment") {
      if (["Cancelled", "Rejected", "Completed"].includes(before.status)) {
        throw httpError("Cannot waive payment for a cancelled, rejected, or completed request.", 409)
      }
      if (before.paymentStatus === "paid") throw httpError("Cannot waive an already paid request.", 409)
      if (before.paymentStatus === "waived") throw httpError("Payment is already waived.", 409)
      after = { status: "On Process", paymentStatus: "waived", paymentConfirmedAt: now, paymentConfirmedBy: actor.name, "statusTimestamps.On Process": now }; transaction.update(targetRef, after)
      if (before.residentId) notification = { id: `payment-waived-${operationDocumentId(operationId)}`, value: { targetId: before.residentId, type: "info", title: "Fee Waived", message: `The document fee for your ${before.documentType || "document"} request has been waived.`, timestamp: "Just now", isRead: false, createdAt: now, operationId } }
    } else if (operation === "admin.update") {
      if (targetId === actorUid) throw httpError("Use a separate recovery process to change your own privileged account.", 409)
      if (before.role === "resident" || isSuperAdminRole(before.role)) throw httpError("Target is not a mutable delegated administrator.", 403)
      const updates = exactFields(safeObject(payload.updates), ADMIN_UPDATE_FIELDS)
      if (updates.role && !ADMIN_ROLES.has(updates.role)) throw httpError("Unsupported administrator role.", 400)
      after = { ...updates, updatedAt: now }; transaction.update(targetRef, after)
    } else if (operation === "admin.delete") {
      if (targetId === actorUid || isSuperAdminRole(before.role) || before.role === "resident") throw httpError("Target administrator cannot be deleted by this operation.", 403)
      after = { status: "Deleted", updatedAt: now }; transaction.update(targetRef, after)
    } else if (operation === "system.alert.create") {
      const alert = exactFields(safeObject(payload.alert), SYSTEM_ALERT_FIELDS)
      if (!alert.title || !alert.description || !["critical", "warning", "info"].includes(alert.severity)) throw httpError("Invalid system alert.", 400)
      const value = { ...alert, timestamp: now, createdByUid: actorUid }
      const alertRef = db.collection(COLLECTION_SYSTEM_ALERTS).doc(operationDocumentId(operationId))
      after = value; transaction.set(alertRef, value)
    } else if (operation === "system.alert.dismiss") {
      after = null; transaction.delete(targetRef)
    } else if (operation === "system.config.update") {
      const updates = exactFields(safeObject(payload.updates), SYSTEM_CONFIG_FIELDS)
      if (!Object.keys(updates).length) throw httpError("No configuration fields supplied.", 400)
      after = { ...updates, updatedAt: now }; transaction.set(targetRef, after, { merge: true })
    } else if (operation === "notification.create") {
      const value = safeObject(payload.notification)
      if (typeof value.targetId !== "string" || typeof value.title !== "string" || typeof value.message !== "string") throw httpError("Invalid notification payload.", 400)
      after = { ...value, createdAt: now, operationId }
      transaction.set(db.collection(COLLECTION_NOTIFICATIONS).doc(operationDocumentId(operationId)), after)
    } else {
      throw httpError("Unsupported admin operation.", 400)
    }

    if (notification) transaction.set(db.collection(COLLECTION_NOTIFICATIONS).doc(notification.id), notification.value)
    transaction.create(auditRef, auditEvent(actor, operation, operationId, targetId, ipAddress, before, after, now, payloadHash))
    return { idempotent: false }
  })
}

export async function createAdminAccount(db: any, auth: any, actorUid: string, operationId: string, payload: Record<string, any>, ipAddress: string, now: number, executionId: string = randomUUID(), onStage?: (stage: string) => Promise<void>) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
  const password = typeof payload.password === "string" ? payload.password : ""
  const name = typeof payload.name === "string" ? payload.name.trim() : ""
  const role = typeof payload.role === "string" ? payload.role : "admin"
  const attemptId = (typeof payload.attemptId === "string" && payload.attemptId) || randomUUID()
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || !ADMIN_ROLES.has(role)) throw httpError("Valid admin name, email, password, and role are required.", 400)
  const operationRef = db.collection("adminAccountOperations").doc(operationDocumentId(operationId))
  const deterministicUid = `adm-${createHash("sha256").update(operationId).digest("hex").slice(0, 28)}`
  const canonicalPayloadHash = createHash("sha256").update(JSON.stringify({ email, name, role })).digest("hex")

  const claimed = await db.runTransaction(async (transaction: any) => {
    const callerRef = db.collection(COLLECTION_USERS).doc(actorUid)
    const [callerSnapshot, operationSnapshot] = await Promise.all([transaction.get(callerRef), transaction.get(operationRef)])
    const caller = callerSnapshot.data() || {}
    if (!callerSnapshot.exists || INACTIVE.has(caller.status) || !isSuperAdminRole(caller.role)) throw httpError("Only an active Super Admin can create administrators.", 403)
    const existing = operationSnapshot.data()
    if (existing?.status === "completed") {
      if (existing.email !== email || existing.name !== name || existing.role !== role || existing.actorUid !== actorUid || existing.payloadHash !== canonicalPayloadHash) {
        throw httpError("Idempotency conflict: operationId was already executed with different parameters.", 409)
      }
      return { completed: true, actor: caller }
    }
    if (existing && (existing.email !== email || existing.uid !== deterministicUid)) throw httpError("Operation ID was already used for different input.", 409)
    if (existing?.status === "reconciliation-required") throw httpError("Administrator provisioning requires reconciliation before retry.", 409)
    if (existing && ["auth-pending", "auth-created", "finalizing", "compensating"].includes(existing.status)) {
      throw httpError(`Administrator provisioning is actively running by attempt '${existing.attemptId}'. Concurrent execution is blocked.`, 409)
    }
    transaction.set(operationRef, {
      operationId, attemptId, executionId, uid: deterministicUid, email, name, role, actorUid,
      payloadHash: canonicalPayloadHash, status: "auth-pending",
      createdAt: existing?.createdAt || now, updatedAt: now
    })
    return { completed: false, actor: caller }
  })
  if (claimed.completed) return { idempotent: true }
  await onStage?.("claimed")

  let created = false
  try {
    try {
      const existing = await auth.getUser(deterministicUid)
      if (existing.email?.toLowerCase() !== email) throw httpError("Deterministic account identity conflicts with this operation.", 409)
    } catch (error: any) {
      if (error?.status === 409) throw error
      if (error?.code !== "auth/user-not-found") throw error
      await auth.createUser({ uid: deterministicUid, email, password, displayName: name, emailVerified: true })
      created = true
    }

    await db.runTransaction(async (transaction: any) => {
      const operationSnapshot = await transaction.get(operationRef)
      const currentOp = operationSnapshot.data()
      if (currentOp?.attemptId !== attemptId || currentOp?.executionId !== executionId || currentOp?.status !== "auth-pending") {
        throw httpError("Administrator operation no longer owns the Auth creation stage.", 409)
      }
      transaction.update(operationRef, { status: "auth-created", authCreatedByExecution: created ? executionId : currentOp.authCreatedByExecution || null, updatedAt: Date.now() })
    })
    await onStage?.("auth-created")
    await onStage?.("before-finalize")

    await db.runTransaction(async (transaction: any) => {
      const callerRef = db.collection(COLLECTION_USERS).doc(actorUid)
      const userRef = db.collection(COLLECTION_USERS).doc(deterministicUid)
      const auditRef = db.collection(COLLECTION_ACTIVITY_LOGS).doc(operationDocumentId(operationId))
      const [callerSnapshot, operationSnapshot, userSnapshot, auditSnapshot] = await Promise.all([transaction.get(callerRef), transaction.get(operationRef), transaction.get(userRef), transaction.get(auditRef)])
      const caller = callerSnapshot.data() || {}
      if (!callerSnapshot.exists || INACTIVE.has(caller.status) || !isSuperAdminRole(caller.role)) throw httpError("Super Admin authority changed before finalization.", 409)
      const currentOp = operationSnapshot.data()
      if (currentOp?.uid !== deterministicUid) throw httpError("Administrator operation fence changed.", 409)
      if (currentOp?.attemptId !== attemptId) throw httpError("Administrator operation attempt changed; concurrent execution detected.", 409)
      if (currentOp?.executionId !== executionId || currentOp?.status !== "auth-created") throw httpError("Administrator execution fence changed before finalization.", 409)
      transaction.update(operationRef, { status: "finalizing", updatedAt: Date.now() })
      transaction.set(userRef, { email, name, role, status: "Active", initials: name.slice(0, 2).toUpperCase(), isOnline: false, lastActive: "Never", createdDate: new Date(now).toISOString().slice(0, 10), createdAt: now, isVerified: true })
      transaction.create(auditRef, auditEvent({ uid: actorUid, name: caller.name || "Super Admin", email: caller.email, role: caller.role }, "admin.create", operationId, deterministicUid, ipAddress, null, { email, name, role }, now, canonicalPayloadHash))
      transaction.update(operationRef, { status: "completed", attemptId, executionId, completedAt: now, updatedAt: now })
    })
    await onStage?.("completed")
    return { idempotent: false, uid: deterministicUid }
  } catch (error) {
    let compensated = !created
    if (created) {
      try {
        const ownsCompensation = await db.runTransaction(async (transaction: any) => {
          const opSnap = await transaction.get(operationRef)
          const opData = opSnap.data()
          if (
            opData?.attemptId !== attemptId ||
            opData?.executionId !== executionId ||
            opData?.authCreatedByExecution !== executionId ||
            !["auth-created", "finalizing"].includes(opData?.status)
          ) return false
          transaction.update(operationRef, { status: "compensating", compensationExecutionId: executionId, error: error instanceof Error ? error.message : String(error), updatedAt: Date.now() })
          return true
        })
        if (!ownsCompensation) throw httpError("Administrator execution no longer owns compensation.", 409)
        await onStage?.("compensating")
        await auth.deleteUser(deterministicUid)
        compensated = true
      } catch {
        compensated = false
      }
    }
    try {
      await db.runTransaction(async (transaction: any) => {
        const opSnap = await transaction.get(operationRef)
        const opData = opSnap.data()
        if (opData?.status === "completed") return
        if (opData?.attemptId !== attemptId || opData?.executionId !== executionId) return
        if (created && opData?.status !== "compensating") return
        transaction.update(operationRef, {
          status: compensated ? "compensated" : "reconciliation-required",
          attemptId,
          executionId,
          error: error instanceof Error ? error.message : String(error),
          updatedAt: Date.now(),
        })
      })
    } catch {
      // Best-effort status update
    }
    throw Object.assign(new Error(compensated ? "Administrator creation failed and Auth was restored; retry the same operation." : "Administrator creation requires reconciliation."), { status: 503, cause: error })
  }
}

export function createAdminOperationsHandler(injected?: { auth?: typeof adminAuth; db?: typeof adminDb; uuid?: () => string; now?: () => number; onAdminCreateStage?: (stage: string) => Promise<void> }) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb
      if (!auth || !db) return NextResponse.json({ error: "Server administration service unavailable" }, { status: 503 })
      const header = req.headers.get("authorization")
      if (!header?.startsWith("Bearer ")) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 })
      let decoded: any
      try { decoded = await auth.verifyIdToken(header.slice(7), true) } catch { return NextResponse.json({ error: "Session invalid or expired" }, { status: 401 }) }
      const body = await req.json().catch(() => ({})) as OperationBody
      if (typeof body.operation !== "string" || !body.operation) throw httpError("operation is required", 400)
      const operationId = typeof body.operationId === "string" && body.operationId ? body.operationId : (injected?.uuid || randomUUID)()
      if (operationId.length > 128) throw httpError("operationId is too long", 400)
      const now = (injected?.now || Date.now)()
      const result = body.operation === "admin.create"
        ? await createAdminAccount(db, auth, decoded.uid, operationId, safeObject(body.payload), extractClientIp(req), now, (injected?.uuid || randomUUID)(), injected?.onAdminCreateStage)
        : await executeFirestoreOperation(db, decoded.uid, { ...body, operation: body.operation, operationId }, extractClientIp(req), now)
      return NextResponse.json({ success: true, operationId, ...result })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Admin operation failed", operationIncomplete: error?.status === 503 }, { status: error?.status || 500 })
    }
  }
}

export const POST = createAdminOperationsHandler()
