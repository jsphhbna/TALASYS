import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server.js"
import { adminAuth } from "../../../../lib/firebase-admin.ts"
import { extractClientIp } from "../../../../lib/security/request-ip.ts"
import { reconcileResidentIdentity, createDefaultReconciliationDependencies, type ReconciliationAction } from "../../../../lib/admin/identity-reconciliation.ts"

export function createReconcileIdentityHandler(injected?: { auth?: typeof adminAuth; dependencies?: ReturnType<typeof createDefaultReconciliationDependencies>; uuid?: () => string }) {
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
      const action = (body.action || body.resolution) as ReconciliationAction
      if (!residentId || !["sync-auth-to-firestore", "sync-firestore-to-auth", "release-lock"].includes(action)) {
        return NextResponse.json({ error: "Valid residentId and action ('sync-auth-to-firestore' | 'sync-firestore-to-auth' | 'release-lock') are required" }, { status: 400 })
      }
      const reconciliationId = typeof body.reconciliationId === "string" && body.reconciliationId
        ? body.reconciliationId
        : (injected?.uuid || randomUUID)()
      const result = await reconcileResidentIdentity(injected?.dependencies || createDefaultReconciliationDependencies(), {
        residentId,
        action,
        reconciliationId,
        actorUid: decoded.uid,
        actorName: body.actorName,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        expectedOperationId: typeof body.expectedOperationId === "string" ? body.expectedOperationId : undefined,
        expectedAttemptId: typeof body.expectedAttemptId === "string" ? body.expectedAttemptId : undefined,
        forceRecover: Boolean(body.forceRecover),
        ipAddress: extractClientIp(req),
      })
      return NextResponse.json(result)
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Reconciliation failed" }, { status: error?.status || 500 })
    }
  }
}

export const POST = createReconcileIdentityHandler()
