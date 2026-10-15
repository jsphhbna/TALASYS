import { createHash, timingSafeEqual } from "node:crypto"
import { mediaRegistryDocumentId, parseCloudinaryAsset } from "./media-auth.ts"

export type RegistrationMediaClaimInput = {
  mediaUrl?: string
  publicId?: string
  claimToken?: string
}

export type RegistrationAssetIdentity = {
  cloudName: string
  publicId: string
  resourceType: "image" | "video" | "raw"
  deliveryType: "authenticated"
  registryId: string
  capability?: string
}

export function registrationHttpError(
  message: string,
  status: number,
  code = "REGISTRATION_REJECTED",
  committed: boolean | "unknown" = false,
) {
  return Object.assign(new Error(message), { status, code, committed })
}

export function registrationCapabilityMatches(capability: string, expectedHash: string): boolean {
  const actual = Buffer.from(createHash("sha256").update(capability).digest("hex"), "hex")
  const expected = Buffer.from(expectedHash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function parseRegistrationMediaClaim(
  item: RegistrationMediaClaimInput,
  expectedCloudName: string,
): RegistrationAssetIdentity {
  const rawTarget = typeof item.mediaUrl === "string"
    ? item.mediaUrl
    : typeof item.publicId === "string"
      ? item.publicId
      : ""
  if (!rawTarget) throw registrationHttpError("Every media claim requires an asset URL.", 400, "INVALID_PROOF")

  const parsed = parseCloudinaryAsset(rawTarget)
  const publicId = parsed.publicId.replace(/^\//, "")
  if (!parsed.cloudName || parsed.cloudName !== expectedCloudName) {
    throw registrationHttpError("Media claim cloud does not match the reserved product environment.", 403, "PROOF_IDENTITY_MISMATCH")
  }
  if (parsed.deliveryType !== "authenticated") {
    throw registrationHttpError("Only protected authenticated assets may be claimed.", 403, "PROOF_IDENTITY_MISMATCH")
  }
  if (!publicId.startsWith("talasys/proofs/registration/")) {
    throw registrationHttpError("Media claim is outside the registration proof namespace.", 403, "PROOF_IDENTITY_MISMATCH")
  }
  if (!( ["image", "video", "raw"] as const).includes(parsed.resourceType)) {
    throw registrationHttpError("Unsupported media resource type.", 400, "INVALID_PROOF")
  }

  return {
    cloudName: parsed.cloudName,
    publicId,
    resourceType: parsed.resourceType,
    deliveryType: "authenticated",
    registryId: mediaRegistryDocumentId(parsed.cloudName, parsed.resourceType, publicId),
    capability: typeof item.claimToken === "string" ? item.claimToken : undefined,
  }
}

export function validateRegistrationReservation(
  reservation: Record<string, unknown>,
  asset: RegistrationAssetIdentity,
  callerUid: string,
  now: number,
): "claim" | "already-claimed" {
  const exactIdentity = reservation.cloudName === asset.cloudName &&
    reservation.resourceType === asset.resourceType &&
    reservation.deliveryType === asset.deliveryType &&
    reservation.publicId === asset.publicId
  if (!exactIdentity) {
    throw registrationHttpError("Media claim does not match its reservation.", 409, "PROOF_IDENTITY_MISMATCH")
  }
  if (reservation.ownerUid === callerUid && reservation.status === "claimed") return "already-claimed"
  if (reservation.status !== "reserved" || reservation.ownerUid) {
    throw registrationHttpError("Media is already owned by another account.", 409, "PROOF_OWNER_CONFLICT")
  }
  if (!Number.isFinite(reservation.expiresAt) || now > Number(reservation.expiresAt)) {
    throw registrationHttpError("Media claim capability has expired.", 410, "PROOF_CAPABILITY_EXPIRED")
  }
  if (
    !asset.capability ||
    typeof reservation.capabilityHash !== "string" ||
    !registrationCapabilityMatches(asset.capability, reservation.capabilityHash)
  ) {
    throw registrationHttpError("Media claim capability is invalid.", 403, "PROOF_CAPABILITY_INVALID")
  }
  return "claim"
}

export async function preflightRegistrationAssets(options: {
  db: any
  callerUid: string
  assets: RegistrationAssetIdentity[]
  now: number
  verifyAsset: (asset: RegistrationAssetIdentity) => Promise<void>
}) {
  const { db, callerUid, assets, now, verifyAsset } = options
  const snapshots = await Promise.all(
    assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId).get()),
  )
  for (let index = 0; index < assets.length; index++) {
    const snapshot = snapshots[index]
    if (!snapshot.exists) {
      throw registrationHttpError("Media reservation was not found.", 404, "PROOF_RESERVATION_NOT_FOUND")
    }
    const disposition = validateRegistrationReservation(snapshot.data() || {}, assets[index], callerUid, now)
    if (disposition === "claim") await verifyAsset(assets[index])
  }
}

export function applyRegistrationClaims(options: {
  transaction: any
  refs: any[]
  snapshots: any[]
  assets: RegistrationAssetIdentity[]
  callerUid: string
  now: number
}) {
  const { transaction, refs, snapshots, assets, callerUid, now } = options
  for (let index = 0; index < assets.length; index++) {
    const snapshot = snapshots[index]
    if (!snapshot.exists) {
      throw registrationHttpError("Media reservation was not found.", 404, "PROOF_RESERVATION_NOT_FOUND")
    }
    const disposition = validateRegistrationReservation(snapshot.data() || {}, assets[index], callerUid, now)
    if (disposition === "claim") {
      transaction.update(refs[index], {
        ownerUid: callerUid,
        status: "claimed",
        claimedAt: now,
        capabilityHash: null,
        expiresAt: null,
      })
    }
  }
}
