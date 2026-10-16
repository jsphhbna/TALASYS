import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { isFullAdminRole, isSuperAdminRole } from "../../../../lib/auth/auth-types.ts"
import { coordinateIdentityEmailUpdate, type IdentityEmailDependencies, type IdentityEmailOperation, type IdentityEmailStatus } from "../../../../lib/admin/identity-email-operation.ts"
import { evaluateIdentityClaim } from "../../../../lib/admin/identity-coordination-policy.ts"
import { extractClientIp } from "../../../../lib/security/request-ip.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_USERS } from "../../../../lib/constants.ts"

const PROFILE_FIELDS = new Set(["name", "dateOfBirth", "contactNumber", "address", "statuses", "profilePicture"])

function cleanProfileUpdates(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.some(([key]) => !PROFILE_FIELDS.has(key))) throw Object.assign(new Error("Resident update contains a server-managed or unsupported field."), { status: 400 })
  return Object.fromEntries(entries.filter(([, fieldValue]) => fieldValue !== undefined))
}

async function changeOwnedState(db: any, operation: IdentityEmailOperation, status: IdentityEmailStatus, message: string, now: number, releaseLock: boolean) {
  await db.runTransaction(async (transaction: any) => {
    const operationRef = db.collection("identityOperations").doc(operation.id)
    const lockRef = db.collection("identityOperationLocks").doc(operation.residentId)
    const [operationSnapshot, lockSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(lockRef)])
    if (operationSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.operationId !== operation.id) {
      throw Object.assign(new Error("Stale identity attempt cannot change operation state."), { status: 409 })
    }
    transaction.update(operationRef, { status, error: message, leaseUntil: 0, updatedAt: now })
    if (releaseLock) {
      transaction.set(lockRef, { operationId: operation.id, attemptId: operation.attemptId, status, leaseUntil: 0, updatedAt: now })
    } else {
      transaction.update(lockRef, { status, error: message, updatedAt: now })
    }
  })
}

export function createIdentityEmailDependencies(): IdentityEmailDependencies {
  if (!adminDb || !adminAuth) throw Object.assign(new Error("Server authentication service unavailable"), { status: 503 })
  return {
    async claim({ operationId, residentId, newEmail, profileUpdates, actorUid, attemptId, ipAddress, now }) {
      return adminDb.runTransaction(async (transaction: any) => {
        const callerRef = adminDb.collection(COLLECTION_USERS).doc(actorUid)
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(residentId)
        const operationRef = adminDb.collection("identityOperations").doc(operationId)
        const lockRef = adminDb.collection("identityOperationLocks").doc(residentId)
        const [callerSnapshot, residentSnapshot, operationSnapshot, lockSnapshot] = await Promise.all([
          transaction.get(callerRef), transaction.get(residentRef), transaction.get(operationRef), transaction.get(lockRef),
        ])
        if (!callerSnapshot.exists) throw Object.assign(new Error("Caller account record not found"), { status: 403 })
        const caller = callerSnapshot.data() || {}
        const authorized = isSuperAdminRole(caller.role) || isFullAdminRole(caller.role) || caller.role === "Resident Management"
        if (!authorized || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) throw Object.assign(new Error("Caller is not authorized to modify resident identities."), { status: 403 })
        if (!residentSnapshot.exists || residentSnapshot.data()?.role !== "resident") throw Object.assign(new Error("Target resident record not found."), { status: 404 })
        const targetResident = residentSnapshot.data() || {}
        if (targetResident.registrationDenied || Boolean(targetResident.deniedAt) || (!targetResident.isVerified && (targetResident.status === "Deleted" || targetResident.status === "Expired"))) {
          throw Object.assign(new Error("Cannot modify email for a permanently denied resident."), { status: 409 })
        }
        const existing = operationSnapshot.exists ? operationSnapshot.data() : null
        const lock = lockSnapshot.exists ? lockSnapshot.data() : null

        const claimResult = evaluateIdentityClaim(lock, existing, {
          operationId,
          attemptId,
          residentId,
          newEmail,
          profileUpdates,
        })

        if (claimResult.outcome === "completed") {
          if (existing && (existing.residentId !== residentId || existing.newEmail !== newEmail)) {
            throw Object.assign(new Error("Operation ID was already used for different input."), { status: 409 })
          }
          return { outcome: "completed" as const }
        }

        if (claimResult.outcome === "reconciliation-required") {
          throw Object.assign(new Error(claimResult.reason), { status: 409, requiresReconciliation: true, residentId })
        }

        if (claimResult.outcome === "conflict") {
          return { outcome: "conflict" as const }
        }
        const oldEmail = String(existing?.oldEmail || residentSnapshot.data()?.email || "").trim().toLowerCase()
        if (!oldEmail) throw Object.assign(new Error("Target resident has no authoritative email."), { status: 409 })
        if (existing && (existing.residentId !== residentId || existing.newEmail !== newEmail || JSON.stringify(existing.profileUpdates || {}) !== JSON.stringify(profileUpdates))) throw Object.assign(new Error("Operation ID was already used for different input."), { status: 409 })
        const effectiveNow = now || Date.now()
        const effectiveIp = ipAddress || "Unknown"
        const operation: IdentityEmailOperation = { id: operationId, residentId, actorUid, actorName: caller.name || "Administrator", attemptId, oldEmail, newEmail, profileUpdates, status: "claimed" }
        transaction.set(operationRef, { ...operation, ipAddress: effectiveIp, createdAt: existing?.createdAt || effectiveNow, updatedAt: effectiveNow })
        transaction.set(lockRef, { operationId, attemptId, residentId, operationType: "resident-email-update", status: "claimed", actorUid, actorName: caller.name || "Administrator", oldEmail, newEmail, ipAddress: effectiveIp, updatedAt: effectiveNow })
        return { outcome: "claimed" as const, operation }
      })
    },
    async getAuthEmail(uid) { return (await adminAuth.getUser(uid)).email },
    async updateAuthEmail(uid, email) { await adminAuth.updateUser(uid, { email }) },
    async owns(operation) {
      const [operationSnapshot, lockSnapshot] = await Promise.all([
        adminDb.collection("identityOperations").doc(operation.id).get(),
        adminDb.collection("identityOperationLocks").doc(operation.residentId).get(),
      ])
      return operationSnapshot.data()?.attemptId === operation.attemptId && lockSnapshot.data()?.attemptId === operation.attemptId && lockSnapshot.data()?.operationId === operation.id
    },
    async beginAuthMutation(operation, now) {
      await adminDb.runTransaction(async (transaction: any) => {
        const operationRef = adminDb.collection("identityOperations").doc(operation.id)
        const lockRef = adminDb.collection("identityOperationLocks").doc(operation.residentId)
        const [operationSnapshot, lockSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(lockRef)])
        if (operationSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.operationId !== operation.id) {
          throw Object.assign(new Error("Stale identity attempt cannot advance to Auth mutation."), { status: 409 })
        }
        transaction.update(operationRef, { status: "auth-mutating", updatedAt: now })
        transaction.update(lockRef, { status: "auth-mutating", updatedAt: now })
      })
    },
    async authSucceeded(operation, now) {
      await adminDb.runTransaction(async (transaction: any) => {
        const operationRef = adminDb.collection("identityOperations").doc(operation.id)
        const lockRef = adminDb.collection("identityOperationLocks").doc(operation.residentId)
        const [operationSnapshot, lockSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(lockRef)])
        if (operationSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.operationId !== operation.id) {
          throw Object.assign(new Error("Stale identity attempt cannot confirm Auth success."), { status: 409 })
        }
        transaction.update(operationRef, { status: "auth-completed", updatedAt: now })
        transaction.update(lockRef, { status: "auth-completed", updatedAt: now })
      })
    },
    async beginCompensation(operation, message, now) {
      try {
        await adminDb.runTransaction(async (transaction: any) => {
          const operationRef = adminDb.collection("identityOperations").doc(operation.id)
          const lockRef = adminDb.collection("identityOperationLocks").doc(operation.residentId)
          const [operationSnapshot, lockSnapshot] = await Promise.all([transaction.get(operationRef), transaction.get(lockRef)])
          if (operationSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.operationId !== operation.id) {
            throw Object.assign(new Error("Stale identity attempt cannot begin compensation."), { status: 409 })
          }
          transaction.update(operationRef, { status: "compensating", error: message, updatedAt: now })
          transaction.update(lockRef, { status: "compensating", error: message, updatedAt: now })
        })
        return true
      } catch (err: any) {
        if (err?.status === 409) return false
        throw err
      }
    },
    async complete(operation, now) {
      await adminDb.runTransaction(async (transaction: any) => {
        const callerRef = adminDb.collection(COLLECTION_USERS).doc(operation.actorUid)
        const operationRef = adminDb.collection("identityOperations").doc(operation.id)
        const lockRef = adminDb.collection("identityOperationLocks").doc(operation.residentId)
        const residentRef = adminDb.collection(COLLECTION_USERS).doc(operation.residentId)
        const [callerSnapshot, operationSnapshot, lockSnapshot, residentSnapshot] = await Promise.all([
          transaction.get(callerRef), transaction.get(operationRef), transaction.get(lockRef), transaction.get(residentRef),
        ])
        if (!callerSnapshot.exists) throw Object.assign(new Error("Caller account not found at completion"), { status: 403 })
        const caller = callerSnapshot.data() || {}
        const authorized = isSuperAdminRole(caller.role) || isFullAdminRole(caller.role) || caller.role === "Resident Management"
        if (!authorized || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) throw Object.assign(new Error("Caller authorization revoked during identity update."), { status: 403 })
        const stored = operationSnapshot.data()
        if (stored?.status === "completed" && stored?.attemptId === operation.attemptId) return
        if (stored?.attemptId !== operation.attemptId || lockSnapshot.data()?.attemptId !== operation.attemptId || lockSnapshot.data()?.operationId !== operation.id) throw Object.assign(new Error("Identity operation fence changed."), { status: 409 })
        if (!residentSnapshot.exists || residentSnapshot.data()?.role !== "resident") throw new Error("Resident disappeared during identity update.")
        const currentEmail = String(residentSnapshot.data()?.email || "").trim().toLowerCase()
        if (currentEmail !== operation.oldEmail && currentEmail !== operation.newEmail) throw Object.assign(new Error("Resident email changed during identity update."), { status: 409 })
        transaction.update(residentRef, { ...operation.profileUpdates, email: operation.newEmail, updatedAt: now })
        transaction.set(adminDb.collection(COLLECTION_ACTIVITY_LOGS).doc(`resident-identity-${operation.id}`), {
          actor: { id: operation.actorUid, name: operation.actorName }, action: "Updated Resident Identity", actionType: "Resident Edit",
          targetId: operation.residentId, targetCollection: COLLECTION_USERS, before: { email: operation.oldEmail }, after: { email: operation.newEmail, changedFields: Object.keys(operation.profileUpdates) },
          operationId: operation.id, ipAddress: stored?.ipAddress || "Unknown", timestamp: now, createdAt: now, authoritative: true,
        })
        transaction.update(operationRef, { status: "completed", completedAt: now, leaseUntil: 0, updatedAt: now })
        transaction.set(lockRef, { operationId: operation.id, attemptId: operation.attemptId, status: "completed", leaseUntil: 0, updatedAt: now })
      })
    },
    async authFailed(operation, message, now) { await changeOwnedState(adminDb, operation, "auth-failed", message, now, true) },
    async compensated(operation, message, now) { await changeOwnedState(adminDb, operation, "compensated", message, now, true) },
    async reconciliationRequired(operation, message, now) { await changeOwnedState(adminDb, operation, "reconciliation-required", message, now, false) },
  }
}

export function createUpdateResidentEmailHandler(injected?: { auth?: typeof adminAuth; dependencies?: IdentityEmailDependencies; uuid?: () => string }) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth || adminAuth
      if (!auth) return NextResponse.json({ error: "Server authentication service unavailable" }, { status: 503 })
      const header = req.headers.get("authorization")
      if (!header?.startsWith("Bearer ")) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 })
      let decoded: any
      try { decoded = await auth.verifyIdToken(header.slice(7), true) } catch { return NextResponse.json({ error: "Session invalid or expired" }, { status: 401 }) }
      const body = await req.json().catch(() => ({}))
      const residentId = typeof body.residentId === "string" ? body.residentId.trim() : ""
      const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : ""
      if (!residentId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) return NextResponse.json({ error: "Valid residentId and newEmail are required" }, { status: 400 })
      const operationId = typeof body.operationId === "string" && body.operationId ? body.operationId : (injected?.uuid || randomUUID)()
      const attemptId = typeof body.attemptId === "string" && body.attemptId ? body.attemptId : (injected?.uuid || randomUUID)()
      const result = await coordinateIdentityEmailUpdate(injected?.dependencies || createIdentityEmailDependencies(), {
        operationId, residentId, newEmail, profileUpdates: cleanProfileUpdates(body.profileUpdates), actorUid: decoded.uid, attemptId, ipAddress: extractClientIp(req),
      })
      return NextResponse.json({ success: true, operationId, ...result })
    } catch (error: any) {
      const status = error?.code === "auth/email-already-exists" || error?.code === "auth/email-already-in-use" ? 400 : error?.status || 500
      return NextResponse.json({
        error: error?.message || "Identity update failed",
        operationIncomplete: status === 503 || !!error?.requiresReconciliation,
        requiresReconciliation: !!error?.requiresReconciliation,
        residentId: error?.residentId,
      }, { status })
    }
  }
}

export const POST = createUpdateResidentEmailHandler()
