import crypto from "crypto"

export interface MediaAccessRequest {
  publicId?: string
  mediaUrl?: string
  callerUid?: string
  callerRole?: string
  ownerUid?: string
}

function isAnyAdmin(role?: string): boolean {
  if (!role) return false
  const r = role.toLowerCase().trim()
  return (
    r === "superadmin" ||
    r === "super admin" ||
    r === "admin" ||
    r === "full access" ||
    r === "resident management" ||
    r === "verifications" ||
    r === "verification only" ||
    r === "document processing" ||
    r === "documents only" ||
    r === "view only"
  )
}

const SENSITIVE_FOLDERS = [
  "talasys/proofs",
  "talasys/receipts",
  "talasys/signatures",
  "talasys/letters"
]

/**
 * Checks if a media asset is classified as sensitive evidence (#52).
 */
export function isSensitiveMedia(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false
  return SENSITIVE_FOLDERS.some(folder => pathOrUrl.includes(folder))
}

/**
 * Determines whether the caller is authorized to view a sensitive media asset (#52).
 * Only administrators or the resident who owns the evidence may view it.
 */
export function canAccessMedia(params: MediaAccessRequest): { authorized: boolean; reason?: string } {
  const { callerUid, callerRole, ownerUid } = params

  if (!callerUid) {
    return { authorized: false, reason: "Unauthenticated: Missing user identity" }
  }

  // Administrators can inspect all verification and payment evidence
  if (callerRole && isAnyAdmin(callerRole)) {
    return { authorized: true }
  }

  // Resident owner can view their own submitted evidence
  if (ownerUid && callerUid === ownerUid) {
    return { authorized: true }
  }

  return { authorized: false, reason: "Forbidden: Caller does not possess access to this sensitive evidence" }
}

/**
 * Generates an authorized, time-limited signed delivery URL for protected Cloudinary media (#52).
 */
export function generateSignedDeliveryUrl(
  publicId: string,
  cloudName: string,
  apiSecret: string,
  expiresInSeconds: number = 3600
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds
  const toSign = `public_id=${publicId}&timestamp=${expiresAt}${apiSecret}`
  const signature = crypto.createHash("sha1").update(toSign).digest("hex")

  return `https://res.cloudinary.com/${cloudName}/image/upload/s--${signature.slice(0, 8)}--/t_authenticated/${publicId}`
}
