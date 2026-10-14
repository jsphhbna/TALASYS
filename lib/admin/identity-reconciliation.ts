import { adminAuth, adminDb } from "../firebase-admin.ts"
import { isFullAdminRole, isSuperAdminRole } from "../auth/auth-types.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_USERS, COLLECTION_VERIFICATIONS } from "../constants.ts"

export type ReconciliationAction = "sync-auth-to-firestore" | "sync-firestore-to-auth" | "release-lock"

export interface ReconcileIdentityInput {
  residentId: string
  action: ReconciliationAction
  actorUid: string
  actorName?: string
  ipAddress?: string
  now?: number
}

export interface ReconcileIdentityDependencies {
  auth: {
    getUser(uid: string): Promise<{ email?: string }>
    updateUser(uid: string, properties: { email: string }): Promise<void>
  }
  db: any
}

export async function reconcileResidentIdentity(deps: ReconcileIdentityDependencies, input: ReconcileIdentityInput) {
  const now = input.now || Date.now()
  const residentId = input.residentId.trim()
  if (!residentId) throw Object.assign(new Error("residentId is required"), { status: 400 })

  const callerDoc = await deps.db.collection(COLLECTION_USERS).doc(input.actorUid).get()
  if (!callerDoc.exists) throw Object.assign(new Error("Caller account not found"), { status: 403 })
  const caller = callerDoc.data() || {}
  const authorized = isSuperAdminRole(caller.role) || isFullAdminRole(caller.role)
  if (!authorized || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) {
    throw Object.assign(new Error("Caller is not authorized to reconcile resident identities."), { status: 403 })
  }

  const authUser = await deps.auth.getUser(residentId)
  const authEmail = authUser.email?.trim().toLowerCase() || ""

  return deps.db.runTransaction(async (transaction: any) => {
    const residentRef = deps.db.collection(COLLECTION_USERS).doc(residentId)
    const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
    const [residentSnap, lockSnap] = await Promise.all([
      transaction.get(residentRef),
      transaction.get(lockRef),
    ])

    if (!residentSnap.exists || residentSnap.data()?.role !== "resident") {
      throw Object.assign(new Error("Target resident not found"), { status: 404 })
    }
    const resident = residentSnap.data() || {}
    const firestoreEmail = String(resident.email || "").trim().toLowerCase()
    const lock = lockSnap.exists ? lockSnap.data() : null

    let syncedEmail = ""
    if (input.action === "sync-auth-to-firestore") {
      if (!authEmail) throw Object.assign(new Error("Target resident has no Auth email to sync from."), { status: 400 })
      syncedEmail = authEmail
      transaction.update(residentRef, { email: authEmail, updatedAt: now })
      if (lockRef) {
        transaction.set(lockRef, {
          residentId,
          operationId: lock?.operationId || `reconcile-${residentId}`,
          attemptId: `rec-${now}`,
          status: "completed",
          reconciledBy: input.actorUid,
          reconciledAt: now,
          updatedAt: now,
        })
      }
    } else if (input.action === "sync-firestore-to-auth") {
      if (!firestoreEmail) throw Object.assign(new Error("Target resident has no Firestore email to sync from."), { status: 400 })
      syncedEmail = firestoreEmail
      await deps.auth.updateUser(residentId, { email: firestoreEmail })
      if (lockRef) {
        transaction.set(lockRef, {
          residentId,
          operationId: lock?.operationId || `reconcile-${residentId}`,
          attemptId: `rec-${now}`,
          status: "compensated",
          reconciledBy: input.actorUid,
          reconciledAt: now,
          updatedAt: now,
        })
      }
    } else if (input.action === "release-lock") {
      if (authEmail !== firestoreEmail) {
        throw Object.assign(new Error(`Cannot release lock: Auth (${authEmail}) and Firestore (${firestoreEmail}) emails differ. Choose sync-auth-to-firestore or sync-firestore-to-auth.`), { status: 400 })
      }
      syncedEmail = firestoreEmail
      transaction.set(lockRef, {
        residentId,
        operationId: lock?.operationId || `reconcile-${residentId}`,
        attemptId: `rec-${now}`,
        status: "completed",
        reconciledBy: input.actorUid,
        reconciledAt: now,
        updatedAt: now,
      })
    } else {
      throw Object.assign(new Error("Unsupported reconciliation action"), { status: 400 })
    }

    if (lock?.verificationId) {
      const verifRef = deps.db.collection(COLLECTION_VERIFICATIONS).doc(lock.verificationId)
      transaction.update(verifRef, {
        status: input.action === "sync-auth-to-firestore" ? "approved" : "pending",
        processingOperationId: null,
        processingAttemptId: null,
        reconciledAt: now,
        updatedAt: now,
      })
    }

    const auditRef = deps.db.collection(COLLECTION_ACTIVITY_LOGS).doc(`reconcile-${residentId}-${now}`)
    transaction.set(auditRef, {
      actor: { id: input.actorUid, name: input.actorName || caller.name || "Administrator" },
      action: "Reconciled Resident Identity",
      actionType: "Identity Reconciliation",
      targetId: residentId,
      targetCollection: COLLECTION_USERS,
      before: { authEmail, firestoreEmail, lockStatus: lock?.status || null },
      after: { syncedEmail, action: input.action, lockStatus: "reconciled" },
      ipAddress: input.ipAddress || "Unknown",
      timestamp: now,
      createdAt: now,
      authoritative: true,
    })

    return {
      success: true,
      residentId,
      action: input.action,
      syncedEmail,
    }
  })
}

export function createDefaultReconciliationDependencies(): ReconcileIdentityDependencies {
  if (!adminDb || !adminAuth) throw Object.assign(new Error("Server administration service unavailable"), { status: 503 })
  return {
    auth: {
      async getUser(uid) { return adminAuth.getUser(uid) },
      async updateUser(uid, props) { await adminAuth.updateUser(uid, props) },
    },
    db: adminDb,
  }
}
