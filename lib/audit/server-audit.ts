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
 * Sends critical administrative mutation audit records to the server endpoint (#6),
 * ensuring authentic server IP capture and server-validated actor identity.
 */
export async function recordServerAudit(params: ServerAuditParams): Promise<void> {
  try {
    const token = await auth.currentUser?.getIdToken()
    if (!token) {
      console.warn("recordServerAudit: No authenticated session available.")
      return
    }

    const res = await fetch("/api/audit/log", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      console.error("Failed to author server audit log:", errData.error || res.statusText)
    }
  } catch (err) {
    console.error("recordServerAudit network error:", err)
  }
}
