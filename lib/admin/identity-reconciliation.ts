import { adminAuth, adminDb } from "../firebase-admin.ts"
import { isFullAdminRole, isSuperAdminRole } from "../auth/auth-types.ts"
import { COLLECTION_ACTIVITY_LOGS, COLLECTION_USERS, COLLECTION_VERIFICATIONS } from "../constants.ts"

export type ReconciliationAction = "sync-auth-to-firestore" | "sync-firestore-to-auth" | "release-lock"

/** Stages that may have in-flight external Auth writes and must NOT be reconciled */
const IN_FLIGHT_STAGES = new Set(["claimed", "auth-mutating", "auth-completed", "compensating"])

/** Stages that can be safely reconciled (external writes are quiesced) */
const RECONCILABLE_STAGES = new Set(["reconciliation-required", "compensated", "auth-failed"])

export interface ReconcileIdentityInput {
  residentId: string
  action: ReconciliationAction
  reconciliationId?: string
  actorUid: string
  actorName?: string
  ipAddress?: string
  notes?: string
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
  const reconciliationId = (input.reconciliationId && input.reconciliationId.trim()) || `rec-${residentId}-${now}-${Math.random().toString(36).slice(2, 10)}`

  // ─── Phase 1: Read and validate inside a transaction ────────────────
  const snapshot = await deps.db.runTransaction(async (transaction: any) => {
    const callerRef = deps.db.collection(COLLECTION_USERS).doc(input.actorUid)
    const residentRef = deps.db.collection(COLLECTION_USERS).doc(residentId)
    const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
    const [callerSnap, residentSnap, lockSnap] = await Promise.all([
      transaction.get(callerRef),
      transaction.get(residentRef),
      transaction.get(lockRef),
    ])

    // Authorize caller
    if (!callerSnap.exists) throw Object.assign(new Error("Caller account not found"), { status: 403 })
    const caller = callerSnap.data() || {}
    const authorized = isSuperAdminRole(caller.role) || isFullAdminRole(caller.role)
    if (!authorized || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) {
      throw Object.assign(new Error("Caller is not authorized to reconcile resident identities."), { status: 403 })
    }

    // Validate resident
    if (!residentSnap.exists || residentSnap.data()?.role !== "resident") {
      throw Object.assign(new Error("Target resident not found"), { status: 404 })
    }
    const resident = residentSnap.data() || {}
    const firestoreEmail = String(resident.email || "").trim().toLowerCase()

    // Validate lock state
    const lock = lockSnap.exists ? lockSnap.data() : null
    if (lock && IN_FLIGHT_STAGES.has(lock.status)) {
      throw Object.assign(new Error(
        `Cannot reconcile: lock is in stage '${lock.status}' which may have in-flight Auth writes. ` +
        `Wait for the operation to complete, fail, or reach reconciliation-required.`
      ), { status: 409 })
    }

    // Use set to handle both existing and non-existing lock documents
    transaction.set(lockRef, {
      residentId,
      operationId: lock?.operationId || `reconcile-${residentId}-${reconciliationId}`,
      attemptId: reconciliationId,
      status: "reconciling",
      reconciledBy: input.actorUid,
      previousStatus: lock?.status || null,
      previousOperationId: lock?.operationId || null,
      previousAttemptId: lock?.attemptId || null,
      updatedAt: now,
    })

    return {
      firestoreEmail,
      callerName: caller.name || "Administrator",
      lock,
    }
  })

  // ─── Phase 2: Auth mutation OUTSIDE the transaction ─────────────────
  const authUser = await deps.auth.getUser(residentId)
  const authEmail = authUser.email?.trim().toLowerCase() || ""
  let syncedEmail = ""
  let authMutated = false

  if (input.action === "sync-auth-to-firestore") {
    if (!authEmail) throw Object.assign(new Error("Target resident has no Auth email to sync from."), { status: 400 })
    syncedEmail = authEmail
    // No Auth mutation needed — we copy Auth → Firestore
  } else if (input.action === "sync-firestore-to-auth") {
    if (!snapshot.firestoreEmail) throw Object.assign(new Error("Target resident has no Firestore email to sync from."), { status: 400 })
    syncedEmail = snapshot.firestoreEmail
    if (authEmail !== snapshot.firestoreEmail) {
      try {
        await deps.auth.updateUser(residentId, { email: snapshot.firestoreEmail })
        authMutated = true
      } catch (authError: any) {
        // Auth mutation failed — leave lock in reconciling state for retry
        try {
          await deps.db.runTransaction(async (transaction: any) => {
            const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
            const lockSnap = await transaction.get(lockRef)
            if (lockSnap.data()?.attemptId !== reconciliationId) {
              throw Object.assign(new Error("Reconciliation ownership changed"), { status: 409 })
            }
            transaction.update(lockRef, {
              status: "reconciliation-required",
              error: `Auth sync failed: ${authError instanceof Error ? authError.message : String(authError)}`,
              updatedAt: Date.now(),
            })
          })
        } catch {
          // Best effort to restore lock state
        }
        throw Object.assign(new Error("Firebase Auth update failed during reconciliation."), { status: 502, cause: authError })
      }
    }
  } else if (input.action === "release-lock") {
    if (authEmail !== snapshot.firestoreEmail) {
      // Restore lock to previous state since we can't release with mismatched emails
      try {
        await deps.db.runTransaction(async (transaction: any) => {
          const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
          const lockSnap = await transaction.get(lockRef)
          if (lockSnap.data()?.attemptId !== reconciliationId) return
          transaction.update(lockRef, {
            status: snapshot.lock?.status || "reconciliation-required",
            error: `Release denied: Auth (${authEmail}) and Firestore (${snapshot.firestoreEmail}) emails differ.`,
            updatedAt: Date.now(),
          })
        })
      } catch {
        // Best effort
      }
      throw Object.assign(new Error(
        `Cannot release lock: Auth (${authEmail}) and Firestore (${snapshot.firestoreEmail}) emails differ. ` +
        `Choose sync-auth-to-firestore or sync-firestore-to-auth.`
      ), { status: 400 })
    }
    syncedEmail = snapshot.firestoreEmail
  } else {
    throw Object.assign(new Error("Unsupported reconciliation action"), { status: 400 })
  }

  // ─── Phase 3: Finalize Firestore changes in a fenced transaction ────
  try {
    await deps.db.runTransaction(async (transaction: any) => {
      const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
      const residentRef = deps.db.collection(COLLECTION_USERS).doc(residentId)
      const callerRef = deps.db.collection(COLLECTION_USERS).doc(input.actorUid)
      const [lockSnap, _residentSnap, callerSnap] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(residentRef),
        transaction.get(callerRef),
      ])

      // Re-validate ownership
      if (lockSnap.data()?.attemptId !== reconciliationId) {
        throw Object.assign(new Error("Reconciliation fence changed; another operation took over."), { status: 409 })
      }

      // Re-validate caller authorization
      const caller = callerSnap.exists ? callerSnap.data() || {} : {}
      const stillAuthorized = isSuperAdminRole(caller.role) || isFullAdminRole(caller.role)
      if (!stillAuthorized || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) {
        throw Object.assign(new Error("Caller authorization revoked during reconciliation."), { status: 403 })
      }

      // Apply Firestore email update for sync-auth-to-firestore
      if (input.action === "sync-auth-to-firestore") {
        transaction.update(residentRef, { email: authEmail, updatedAt: now })
      }

      // Verification recovery: do NOT auto-approve; leave in pending/incomplete state
      if (snapshot.lock?.verificationId) {
        const verifRef = deps.db.collection(COLLECTION_VERIFICATIONS).doc(snapshot.lock.verificationId)
        const verifSnap = await transaction.get(verifRef)
        if (verifSnap.exists && verifSnap.data()?.status === "processing") {
          // Release processing fence but leave verification as pending for re-approval
          transaction.update(verifRef, {
            status: "pending",
            processingOperationId: null,
            processingAttemptId: null,
            reconciledAt: now,
            updatedAt: now,
          })
        }
      }

      // Complete the lock
      const completedStatus = input.action === "sync-firestore-to-auth" ? "compensated" : "completed"
      transaction.set(lockRef, {
        residentId,
        operationId: snapshot.lock?.operationId || `reconcile-${residentId}-${reconciliationId}`,
        attemptId: reconciliationId,
        status: completedStatus,
        reconciledBy: input.actorUid,
        reconciledAction: input.action,
        reconciledAt: now,
        previousStatus: snapshot.lock?.status || null,
        previousOperationId: snapshot.lock?.operationId || null,
        notes: input.notes || null,
        updatedAt: now,
      })

      // Authoritative audit record
      const auditRef = deps.db.collection(COLLECTION_ACTIVITY_LOGS).doc(`reconcile-${residentId}-${reconciliationId}`)
      transaction.set(auditRef, {
        actor: { id: input.actorUid, name: input.actorName || snapshot.callerName },
        action: "Reconciled Resident Identity",
        actionType: "Identity Reconciliation",
        targetId: residentId,
        targetCollection: COLLECTION_USERS,
        before: {
          authEmail,
          firestoreEmail: snapshot.firestoreEmail,
          lockStatus: snapshot.lock?.status || null,
          lockOperationId: snapshot.lock?.operationId || null,
        },
        after: {
          syncedEmail,
          action: input.action,
          lockStatus: completedStatus,
          authMutated,
        },
        reconciliationId,
        notes: input.notes || null,
        ipAddress: input.ipAddress || "Unknown",
        timestamp: now,
        createdAt: now,
        authoritative: true,
      })
    })
  } catch (finalizeError: any) {
    if (finalizeError?.status === 409 || finalizeError?.status === 403) throw finalizeError
    // Finalization failed after Auth was already mutated — needs manual recovery
    if (authMutated) {
      try {
        await deps.db.runTransaction(async (transaction: any) => {
          const lockRef = deps.db.collection("identityOperationLocks").doc(residentId)
          const lockSnap = await transaction.get(lockRef)
          if (lockSnap.data()?.attemptId === reconciliationId) {
            transaction.update(lockRef, {
              status: "reconciliation-required",
              error: `Finalization failed after Auth mutation: ${finalizeError instanceof Error ? finalizeError.message : String(finalizeError)}`,
              updatedAt: Date.now(),
            })
          }
        })
      } catch {
        // Best effort
      }
    }
    throw Object.assign(new Error("Reconciliation finalization failed; lock remains in recovery state."), { status: 503, cause: finalizeError })
  }

  return {
    success: true,
    residentId,
    action: input.action,
    reconciliationId,
    syncedEmail,
    authMutated,
  }
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
