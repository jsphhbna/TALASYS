/**
 * Resubmission Operation Id & Payload Tracking
 *
 * Guarantees that frontend retries across network interruptions, ambiguous
 * responses, duplicate clicks, and browser refreshes preserve a stable
 * operation ID bound to the logical resubmission attempt.
 *
 * Security Invariant: Never persists claim capabilities, ID tokens, passwords,
 * or sensitive proof secrets. Only stores non-sensitive operation metadata in sessionStorage.
 */

export function computeResubmissionPayloadFingerprint(
  proofs: Array<{ name?: string; url?: string; filename?: string }>,
  reason: string,
): string {
  const normalizedProofs = (proofs || [])
    .map(p => {
      const name = typeof p?.name === "string" ? p.name.trim().toLowerCase() : ""
      const filename = typeof p?.filename === "string" ? p.filename.trim().toLowerCase() : name
      const url = typeof p?.url === "string" ? p.url.trim() : ""
      return `${name}|${filename}|${url}`
    })
    .sort()
    .join(";")
  return `${normalizedProofs}::${(reason || "").trim()}`
}

export function getOrGenerateResubmissionOperationId(
  residentId: string,
  proofs: Array<{ name?: string; url?: string; filename?: string }>,
  reason: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): { operationId: string; isReplay: boolean } {
  const fingerprint = computeResubmissionPayloadFingerprint(proofs, reason)
  const key = `talasys_resubmit_op_${residentId}`

  if (storage) {
    try {
      const raw = storage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (
          typeof parsed?.operationId === "string" &&
          /^[A-Za-z0-9_-]{16,80}$/.test(parsed.operationId) &&
          parsed.fingerprint === fingerprint
        ) {
          return { operationId: parsed.operationId, isReplay: true }
        }
      }
    } catch {
      // Storage read failure, continue to generate fresh ID
    }
  }

  const newOpId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  if (storage) {
    try {
      storage.setItem(key, JSON.stringify({
        operationId: newOpId,
        fingerprint,
        createdAt: Date.now(),
      }))
    } catch {
      // Storage write failure, non-blocking
    }
  }

  return { operationId: newOpId, isReplay: false }
}

export function clearResubmissionOperationId(
  residentId: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): void {
  if (!storage) return
  try {
    storage.removeItem(`talasys_resubmit_op_${residentId}`)
  } catch {
    // Ignore storage deletion failure
  }
}
