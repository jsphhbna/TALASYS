import crypto from "crypto"

function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim().toLowerCase()
  return r === "superadmin" || r === "super admin"
}

function isFullAdminRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim().toLowerCase()
  return r === "admin" || r === "full access" || isSuperAdminRole(r)
}

function canManageVerificationsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Verification Only" || r === "Verifications"
}

function canManageRequestsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Document Processing" || r === "Documents Only"
}

export interface MediaAccessRequest {
  publicId?: string
  mediaUrl?: string
  callerUid?: string
  callerRole?: string
  callerStatus?: string
  ownerUid?: string
  assetPurpose?: "proof" | "receipt" | "signature" | "letter" | "profile" | "general"
}

const SENSITIVE_FOLDERS = [
  "talasys/proofs",
  "talasys/receipts",
  "talasys/signatures",
  "talasys/letters"
] as const

/**
 * Checks if a media asset path or URL contains sensitive evidence (#52).
 */
export function isSensitiveMedia(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false
  return SENSITIVE_FOLDERS.some(folder => pathOrUrl.includes(folder))
}

/**
 * Extracts publicId, resourceType, and format from a Cloudinary URL or path (#52).
 */
export function parseCloudinaryAsset(pathOrUrl: string): {
  publicId: string
  resourceType: "image" | "raw"
  format?: string
  folder?: string
} {
  const clean = pathOrUrl.split("?")[0].trim()
  const isPdf = clean.toLowerCase().endsWith(".pdf")
  const resourceType = isPdf ? "raw" : "image"

  // Match folder and filename from standard Cloudinary delivery or upload URL
  const match = clean.match(/(?:image|raw|auto)\/(?:upload|authenticated)\/(?:s--[^/]+--\/)?(?:v\d+\/)?(talasys\/[^?#]+)/)
  if (match) {
    const fullAssetPath = match[1]
    const extIndex = fullAssetPath.lastIndexOf(".")
    if (extIndex !== -1) {
      return {
        publicId: fullAssetPath.substring(0, extIndex),
        format: fullAssetPath.substring(extIndex + 1),
        resourceType,
        folder: fullAssetPath.substring(0, fullAssetPath.lastIndexOf("/"))
      }
    }
    return {
      publicId: fullAssetPath,
      resourceType,
      folder: fullAssetPath.substring(0, fullAssetPath.lastIndexOf("/"))
    }
  }

  // Fallback for publicId passed directly
  const extIndex = clean.lastIndexOf(".")
  if (extIndex !== -1 && !clean.includes("://")) {
    return {
      publicId: clean.substring(0, extIndex),
      format: clean.substring(extIndex + 1),
      resourceType
    }
  }

  return { publicId: clean, resourceType }
}

/**
 * Evaluates whether the caller possesses authorized permissions to access
 * a sensitive media asset based on authoritative record ownership and role (#52).
 */
export function canAccessMedia(params: MediaAccessRequest): { authorized: boolean; reason?: string } {
  const { callerUid, callerRole, callerStatus, ownerUid, mediaUrl = "", publicId = "" } = params

  if (!callerUid) {
    return { authorized: false, reason: "Unauthenticated: Missing caller identity" }
  }

  // Reject locked or deleted accounts immediately (#30, #52)
  if (
    callerStatus === "Locked" ||
    callerStatus === "Deleted" ||
    callerStatus === "Deleted by Resident" ||
    callerRole === "Deleted"
  ) {
    return { authorized: false, reason: "Forbidden: Caller account is locked or inactive." }
  }

  const assetPath = publicId || mediaUrl
  const isSignature = assetPath.includes("talasys/signatures")
  const isProof = assetPath.includes("talasys/proofs")
  const isReceipt = assetPath.includes("talasys/receipts")
  const isLetter = assetPath.includes("talasys/letters")

  // Signatures: only Super Admin and Full Admin may view official barangay signature assets
  if (isSignature) {
    if (isSuperAdminRole(callerRole) || isFullAdminRole(callerRole)) {
      return { authorized: true }
    }
    return { authorized: false, reason: "Forbidden: Only Super Admin and Full Access administrators may view official signatures." }
  }

  // Super Admin and Full Admin have global administrative inspection rights
  if (isSuperAdminRole(callerRole) || isFullAdminRole(callerRole)) {
    return { authorized: true }
  }

  // Verification administrators: allowed to inspect verification proofs
  if (isProof && canManageVerificationsRole(callerRole)) {
    return { authorized: true }
  }

  // Document Processing administrators: allowed to inspect receipts and authorization letters
  if ((isReceipt || isLetter) && canManageRequestsRole(callerRole)) {
    return { authorized: true }
  }

  // View Only administrators: read-only access to general proofs/receipts for audit review
  if (callerRole === "View Only") {
    return { authorized: true }
  }

  // Resident owner: allowed to inspect their own submitted proofs, letters, or receipts
  if (ownerUid && callerUid === ownerUid) {
    return { authorized: true }
  }

  return { 
    authorized: false, 
    reason: "Forbidden: Caller does not possess role or ownership permissions to access this evidence." 
  }
}

/**
 * Generates an authorized, time-limited Cloudinary delivery URL using token authentication (#52).
 */
export function generateSignedDeliveryUrl(
  publicId: string,
  cloudName: string,
  apiSecret: string,
  expiresInSeconds: number = 900
): { deliveryUrl: string; expiresAt: number } {
  if (!cloudName || !apiSecret) {
    throw new Error("Missing Cloudinary configuration parameters for signed delivery.")
  }

  const parsed = parseCloudinaryAsset(publicId)
  const resourceType = parsed.resourceType
  const cleanPublicId = parsed.publicId.replace(/^\//, "")
  const fileExt = parsed.format ? `.${parsed.format}` : (cleanPublicId.endsWith(".pdf") ? "" : ".webp")
  const assetPathWithExt = `${cleanPublicId}${fileExt}`

  const startTime = Math.floor(Date.now() / 1000)
  const expiresAt = startTime + expiresInSeconds

  // Cloudinary Token Authentication: st, exp, acl, hmac
  const acl = `/${resourceType}/authenticated/${cleanPublicId}*`
  const tokenPayload = `st=${startTime}~exp=${expiresAt}~acl=${acl}`
  const hmac = crypto.createHmac("sha256", apiSecret).update(tokenPayload).digest("hex")
  const token = `${tokenPayload}~hmac=${hmac}`

  // Cloudinary URL signature for authenticated resource
  const signatureString = `${assetPathWithExt}${apiSecret}`
  const urlSig = crypto.createHash("sha1").update(signatureString).digest("base64url").slice(0, 8)

  const deliveryUrl = `https://res.cloudinary.com/${cloudName}/${resourceType}/authenticated/s--${urlSig}--/${assetPathWithExt}?__cld_token__=${token}`

  return { deliveryUrl, expiresAt }
}

/**
 * Verifies whether a signed delivery URL token is still valid or has expired (#52).
 */
export function isDeliveryUrlExpired(url: string): boolean {
  try {
    const match = url.match(/exp=(\d+)/)
    if (!match) return false
    const expSeconds = parseInt(match[1], 10)
    const nowSeconds = Math.floor(Date.now() / 1000)
    return nowSeconds > expSeconds
  } catch {
    return true
  }
}
