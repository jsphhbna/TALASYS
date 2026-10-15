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

export interface InputFileMetadata {
  field?: string
  name?: string
  size?: number
  lastModified?: number
}

export interface UploadedProofDocument {
  name: string
  url: string
  filename?: string
  status?: string
  uploadDate?: string
}

export interface StoredResubmissionAttempt {
  operationId: string
  inputFingerprint: string
  uploadedDocuments: UploadedProofDocument[]
  reason: string
  createdAt: number
}

export function computeInputFilesFingerprint(
  files: Array<InputFileMetadata | null | undefined>,
  reason: string,
): string {
  const normalizedFiles = (files || [])
    .filter((f): f is InputFileMetadata => f !== null && f !== undefined)
    .map(f => {
      const field = typeof f.field === "string" ? f.field.trim().toLowerCase() : ""
      const name = typeof f.name === "string" ? f.name.trim().toLowerCase() : ""
      const size = typeof f.size === "number" ? f.size : 0
      const lastModified = typeof f.lastModified === "number" ? f.lastModified : 0
      return `${field}|${name}|${size}|${lastModified}`
    })
    .sort()
    .join(";")
  return `${normalizedFiles}::${(reason || "").trim()}`
}

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

export function getStoredResubmissionAttempt(
  residentId: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): StoredResubmissionAttempt | null {
  if (!storage) return null
  const key = `talasys_resubmit_op_${residentId}`
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      typeof parsed?.operationId === "string" &&
      /^[A-Za-z0-9_-]{16,80}$/.test(parsed.operationId) &&
      typeof parsed?.inputFingerprint === "string" &&
      Array.isArray(parsed?.uploadedDocuments) &&
      typeof parsed?.createdAt === "number" &&
      Date.now() - parsed.createdAt < 24 * 60 * 60 * 1000 // 24hr expiration
    ) {
      return {
        operationId: parsed.operationId,
        inputFingerprint: parsed.inputFingerprint,
        uploadedDocuments: parsed.uploadedDocuments,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
        createdAt: parsed.createdAt,
      }
    }
  } catch {
    // Storage read/parse error
  }
  return null
}

export function storeResubmissionAttempt(
  residentId: string,
  attempt: {
    operationId: string
    inputFingerprint: string
    uploadedDocuments: UploadedProofDocument[]
    reason: string
  },
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): void {
  if (!storage) return
  const key = `talasys_resubmit_op_${residentId}`
  try {
    // Strictly sanitize uploadedDocuments: never persist tokens, capabilities, secrets, or binary content
    const sanitizedDocuments: UploadedProofDocument[] = (attempt.uploadedDocuments || []).map(doc => ({
      name: typeof doc.name === "string" ? doc.name.trim() : "",
      url: typeof doc.url === "string" ? doc.url.trim() : "",
      filename: typeof doc.filename === "string" ? doc.filename.trim() : undefined,
      status: typeof doc.status === "string" ? doc.status : "pending",
      uploadDate: typeof doc.uploadDate === "string" ? doc.uploadDate : undefined,
    }))

    storage.setItem(key, JSON.stringify({
      operationId: attempt.operationId,
      inputFingerprint: attempt.inputFingerprint,
      uploadedDocuments: sanitizedDocuments,
      reason: attempt.reason.trim(),
      createdAt: Date.now(),
    }))
  } catch {
    // Storage write failure, non-blocking
  }
}

export function getOrPrepareResubmissionAttempt(
  residentId: string,
  inputFiles: Array<InputFileMetadata | null | undefined>,
  reason: string,
  storage: Storage | null = typeof window !== "undefined" ? window.sessionStorage : null,
): {
  operationId: string
  inputFingerprint: string
  uploadedDocuments: UploadedProofDocument[] | null
  isReplay: boolean
} {
  const inputFingerprint = computeInputFilesFingerprint(inputFiles, reason)
  const stored = getStoredResubmissionAttempt(residentId, storage)

  if (stored && stored.inputFingerprint === inputFingerprint && stored.uploadedDocuments.length > 0) {
    return {
      operationId: stored.operationId,
      inputFingerprint,
      uploadedDocuments: stored.uploadedDocuments,
      isReplay: true,
    }
  }

  const newOpId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  return {
    operationId: newOpId,
    inputFingerprint,
    uploadedDocuments: null,
    isReplay: false,
  }
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
          (parsed.fingerprint === fingerprint || parsed.inputFingerprint === fingerprint)
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
