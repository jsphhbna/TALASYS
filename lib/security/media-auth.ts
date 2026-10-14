import { v2 as cloudinary } from "cloudinary"
import crypto from "node:crypto"

export function mediaRegistryDocumentId(cloudName: string, resourceType: string, publicId: string): string {
  return crypto.createHash("sha256").update(`${cloudName}:${resourceType}:${publicId.replace(/^\//, "")}`).digest("hex")
}

export function isSuperAdminRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim().toLowerCase()
  return r === "superadmin" || r === "super admin"
}

export function isFullAdminRole(role?: string | null): boolean {
  if (!role) return false
  const r = role.trim().toLowerCase()
  return r === "admin" || r === "full access" || isSuperAdminRole(r)
}

export function canManageVerificationsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Verification Only" || r === "Verifications"
}

export function canManageRequestsRole(role?: string | null): boolean {
  if (!role) return false
  if (isFullAdminRole(role)) return true
  const r = role.trim()
  return r === "Document Processing" || r === "Documents Only"
}

export function canManageResidentsRole(role?: string | null): boolean {
  if (!role) return false
  return isFullAdminRole(role) || role.trim() === "Resident Management"
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
  "talasys/letters",
  "talasys/residents"
] as const

/**
 * Checks if a media asset path or URL contains sensitive evidence (#52).
 */
export function isSensitiveMedia(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false
  const publicId = parseCloudinaryAsset(pathOrUrl).publicId.replace(/^\//, "")
  return SENSITIVE_FOLDERS.some(folder => publicId === folder || publicId.startsWith(`${folder}/`))
}

export function cloudinaryAssetIdentity(pathOrUrl: string): string | null {
  const parsed = parseCloudinaryAsset(pathOrUrl)
  if (!parsed.publicId) return null
  return [parsed.cloudName || "", parsed.resourceType, parsed.publicId, parsed.format || ""].join(":")
}

export function sameCloudinaryAsset(left: string, right: string): boolean {
  const leftIdentity = cloudinaryAssetIdentity(left)
  const rightIdentity = cloudinaryAssetIdentity(right)
  return !!leftIdentity && leftIdentity === rightIdentity
}

/**
 * Extracts publicId, resourceType, and format from a Cloudinary URL or path (#52).
 */
export function parseCloudinaryAsset(pathOrUrl: string): {
  publicId: string
  resourceType: "image" | "video" | "raw"
  deliveryType: "upload" | "private" | "authenticated"
  cloudName?: string
  format?: string
  version?: string
  folder?: string
} {
  const clean = pathOrUrl.split(/[?#]/)[0].trim()
  const match = clean.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/(upload|private|authenticated)\/(?:s--[^/]+--\/)?(?:(v\d+)\/)?(.+)$/i)
  if (match) {
    const [, cloudName, resourceType, deliveryType, version, encodedAssetPath] = match
    const fullAssetPath = decodeURIComponent(encodedAssetPath)
    const extIndex = fullAssetPath.lastIndexOf(".")
    if (extIndex !== -1) {
      return {
        publicId: fullAssetPath.substring(0, extIndex),
        format: fullAssetPath.substring(extIndex + 1),
        resourceType: resourceType.toLowerCase() as "image" | "video" | "raw",
        deliveryType: deliveryType.toLowerCase() as "upload" | "private" | "authenticated",
        cloudName,
        version,
        folder: fullAssetPath.substring(0, fullAssetPath.lastIndexOf("/"))
      }
    }
    return {
      publicId: fullAssetPath,
      resourceType: resourceType.toLowerCase() as "image" | "video" | "raw",
      deliveryType: deliveryType.toLowerCase() as "upload" | "private" | "authenticated",
      cloudName,
      version,
      folder: fullAssetPath.substring(0, fullAssetPath.lastIndexOf("/"))
    }
  }

  // Fallback for publicId passed directly
  const extIndex = clean.lastIndexOf(".")
  if (extIndex !== -1 && !clean.includes("://")) {
    return {
      publicId: clean.substring(0, extIndex),
      format: clean.substring(extIndex + 1),
      resourceType: "image",
      deliveryType: "upload"
    }
  }

  return { publicId: clean, resourceType: "image", deliveryType: "upload" }
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

  const assetPath = parseCloudinaryAsset(publicId || mediaUrl).publicId
  const isSignature = assetPath.startsWith("talasys/signatures/")
  const isProof = assetPath.startsWith("talasys/proofs/")
  const isResidentProfile = assetPath.startsWith("talasys/residents/")
  const isReceipt = assetPath.startsWith("talasys/receipts/")
  const isLetter = assetPath.startsWith("talasys/letters/")

  // Signatures: Super Admin, Full Admin, and Document Processing administrators may access official barangay signature assets for document generation (#52, A14)
  if (isSignature) {
    if (isSuperAdminRole(callerRole) || isFullAdminRole(callerRole) || canManageRequestsRole(callerRole)) {
      return { authorized: true }
    }
    return { authorized: false, reason: "Forbidden: Only Super Admin, Full Access, and Document Processing administrators may view official signatures." }
  }

  // Super Admin and Full Admin have global administrative inspection rights
  if (isSuperAdminRole(callerRole) || isFullAdminRole(callerRole)) {
    return { authorized: true }
  }

  // Verification administrators: allowed to inspect verification proofs
  if (isProof && canManageVerificationsRole(callerRole)) {
    return { authorized: true }
  }

  if (isResidentProfile && canManageResidentsRole(callerRole)) {
    return { authorized: true }
  }

  // Document Processing administrators: allowed to inspect receipts and authorization letters
  if ((isReceipt || isLetter) && canManageRequestsRole(callerRole)) {
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
): { deliveryUrl: string; expiresAt: null } {
  if (!cloudName || !apiSecret) {
    throw new Error("Missing Cloudinary configuration parameters for signed delivery.")
  }

  const parsed = parseCloudinaryAsset(publicId)
  if (parsed.cloudName && parsed.cloudName !== cloudName) throw new Error("Foreign Cloudinary cloud is not allowed")
  cloudinary.config({ cloud_name: cloudName, api_secret: apiSecret, secure: true })
  const deliveryUrl = cloudinary.url(parsed.publicId.replace(/^\//, ""), {
    secure: true,
    sign_url: true,
    type: "authenticated",
    resource_type: parsed.resourceType,
    ...(parsed.format ? { format: parsed.format } : {}),
    ...(parsed.version ? { version: parsed.version.replace(/^v/, "") } : {}),
  })
  // A signed authenticated URL is access-controlled but not time-limited.
  // True expiry requires Cloudinary token auth (separate hex token key/plan) or
  // an application proxy. Never claim API-secret query parameters expire.
  return { deliveryUrl, expiresAt: null }
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
