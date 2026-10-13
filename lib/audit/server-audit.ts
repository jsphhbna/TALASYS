import { auth } from "@/lib/firebase"

interface ServerAuditParams {
  action: string
  actionType?: string
  details: string
  targetId?: string
  targetName?: string
  targetCollection?: string
}

/**
 * Legacy compatibility wrapper for non-authoritative UI telemetry.
 * Critical audit records must be authored by the server mutation itself.
 */
export async function recordServerAudit(params: ServerAuditParams): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) {
      throw new Error("No authenticated session available for telemetry")
    }

    const res = await fetch("/api/audit/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        event: "admin_ui_mutation_observed",
        targetId: params.targetId,
        targetCollection: params.targetCollection,
      }),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || res.statusText || "Telemetry write failed")
    }
  } catch (err) {
    throw err
  }
}
