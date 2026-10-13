import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { extractClientIp } from "../../../../lib/security/request-ip.ts"
import { isAnyAdminRole } from "../../../../lib/auth/auth-types.ts"

const ALLOWED_TELEMETRY = new Set(["admin_ui_mutation_observed", "admin_ui_error"])

/**
 * This endpoint records non-authoritative UI telemetry only. Authoritative
 * mutation audits are written in the same trusted server operation/transaction
 * as the mutation (for example verification approval). Client input can never
 * create an activityLogs record.
 */
export function createAuditTelemetryHandler(injected?: { auth?: any; db?: any; now?: () => number }) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth ?? adminAuth
      const db = injected?.db ?? adminDb
      if (!auth || !db) return NextResponse.json({ error: "Server telemetry service unavailable" }, { status: 503 })
      const header = req.headers.get("authorization")
      if (!header?.startsWith("Bearer ")) return NextResponse.json({ error: "Missing authorization token" }, { status: 401 })
      let decoded: any
      try { decoded = await auth.verifyIdToken(header.slice(7), true) } catch { return NextResponse.json({ error: "Session invalid or expired" }, { status: 401 }) }
      const callerSnapshot = await db.collection("users").doc(decoded.uid).get()
      const caller = callerSnapshot.exists ? callerSnapshot.data() || {} : null
      if (!caller || !isAnyAdminRole(caller.role) || ["Locked", "Deleted", "Deleted by Resident"].includes(caller.status)) return NextResponse.json({ error: "Telemetry caller is not authorized" }, { status: 403 })
      const body = await req.json().catch(() => ({}))
      if (body.action || body.actionType || body.details) return NextResponse.json({ error: "Client-authored mutation audit descriptions are forbidden" }, { status: 403 })
      if (!ALLOWED_TELEMETRY.has(body.event)) return NextResponse.json({ error: "Unsupported telemetry event" }, { status: 400 })
      const now = (injected?.now || Date.now)()
      const ref = await db.collection("clientTelemetry").add({ event: body.event, actorUid: decoded.uid, actorRole: caller.role, targetId: typeof body.targetId === "string" ? body.targetId : null, targetCollection: typeof body.targetCollection === "string" ? body.targetCollection : null, ipAddress: extractClientIp(req), timestamp: now, createdAt: now, authoritative: false })
      return NextResponse.json({ success: true, telemetryId: ref.id, authoritative: false })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Telemetry write failed" }, { status: 500 })
    }
  }
}

export const POST = createAuditTelemetryHandler()
