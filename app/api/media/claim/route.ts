import { createHash, timingSafeEqual } from "node:crypto"
import { v2 as cloudinary } from "cloudinary"
import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { mediaRegistryDocumentId, parseCloudinaryAsset } from "../../../../lib/security/media-auth.ts"
import { verifyRegistrationTicket } from "../../../../lib/security/upload-ticket.ts"

type ClaimInput = { mediaUrl?: string; publicId?: string; claimToken?: string }
type AssetIdentity = {
  cloudName: string
  publicId: string
  resourceType: "image" | "video" | "raw"
  deliveryType: "authenticated"
  registryId: string
  capability?: string
}

type MediaClaimDependencies = {
  auth: any
  db: any
  cloudName: string
  now: () => number
  verifyAsset: (asset: AssetIdentity) => Promise<void>
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

function capabilityMatches(capability: string, expectedHash: string): boolean {
  const actual = Buffer.from(createHash("sha256").update(capability).digest("hex"), "hex")
  const expected = Buffer.from(expectedHash, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function parseClaim(item: ClaimInput, expectedCloudName: string): AssetIdentity {
  const rawTarget = typeof item.mediaUrl === "string" ? item.mediaUrl : typeof item.publicId === "string" ? item.publicId : ""
  if (!rawTarget) throw httpError("Every media claim requires an asset URL.", 400)
  const parsed = parseCloudinaryAsset(rawTarget)
  const publicId = parsed.publicId.replace(/^\//, "")
  if (!parsed.cloudName || parsed.cloudName !== expectedCloudName) throw httpError("Media claim cloud does not match the reserved product environment.", 403)
  if (parsed.deliveryType !== "authenticated") throw httpError("Only protected authenticated assets may be claimed.", 403)
  if (!publicId.startsWith("talasys/proofs/registration/")) throw httpError("Media claim is outside the registration proof namespace.", 403)
  if (!(["image", "video", "raw"] as const).includes(parsed.resourceType)) throw httpError("Unsupported media resource type.", 400)
  return {
    cloudName: parsed.cloudName,
    publicId,
    resourceType: parsed.resourceType,
    deliveryType: "authenticated",
    registryId: mediaRegistryDocumentId(parsed.cloudName, parsed.resourceType, publicId),
    capability: typeof item.claimToken === "string" ? item.claimToken : undefined,
  }
}

export function createCloudinaryAssetVerifier() {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || ""
  const apiSecret = process.env.CLOUDINARY_API_SECRET || ""
  if (!cloudName || !apiKey || !apiSecret) throw httpError("Cloudinary verification is unavailable.", 503)
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
  return async (asset: AssetIdentity) => {
    const result = await cloudinary.api.resource(asset.publicId, {
      resource_type: asset.resourceType,
      type: asset.deliveryType,
    })
    if (
      result?.public_id !== asset.publicId ||
      result?.resource_type !== asset.resourceType ||
      result?.type !== asset.deliveryType
    ) {
      throw httpError("Uploaded media does not match its reservation.", 409)
    }
  }
}

export function createFirestoreMediaClaimAdapter(db: any) {
  return async function claimReservedAssets(callerUid: string, assets: AssetIdentity[], now: number) {
    const refs = assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId))
    const preliminary = await Promise.all(refs.map(ref => ref.get()))
    for (let index = 0; index < assets.length; index++) {
      const snapshot = preliminary[index]
      if (!snapshot.exists) throw httpError("Media reservation was not found.", 404)
      const reservation = snapshot.data() || {}
      if (reservation.ownerUid === callerUid && reservation.status === "claimed") continue
      if (reservation.status !== "reserved") throw httpError("Media reservation is no longer claimable.", 409)
    }

    return db.runTransaction(async (transaction: any) => {
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
      let claimedCount = 0
      for (let index = 0; index < assets.length; index++) {
        const asset = assets[index]
        const snapshot = snapshots[index]
        if (!snapshot.exists) throw httpError("Media reservation was not found.", 404)
        const reservation = snapshot.data() || {}
        const exactIdentity = reservation.cloudName === asset.cloudName &&
          reservation.resourceType === asset.resourceType &&
          reservation.deliveryType === asset.deliveryType &&
          reservation.publicId === asset.publicId
        if (!exactIdentity) throw httpError("Media claim does not match its reservation.", 409)
        if (reservation.ownerUid === callerUid && reservation.status === "claimed") {
          claimedCount++
          continue
        }
        if (reservation.status !== "reserved" || reservation.ownerUid) throw httpError("Media is already owned by another account.", 409)
        if (!Number.isFinite(reservation.expiresAt) || now > reservation.expiresAt) throw httpError("Media claim capability has expired.", 410)
        if (!asset.capability || typeof reservation.capabilityHash !== "string" || !capabilityMatches(asset.capability, reservation.capabilityHash)) {
          throw httpError("Media claim capability is invalid.", 403)
        }
        claimedCount++
      }
      for (let index = 0; index < assets.length; index++) {
        const reservation = snapshots[index].data() || {}
        if (reservation.ownerUid === callerUid && reservation.status === "claimed") continue
        transaction.update(refs[index], {
          ownerUid: callerUid,
          status: "claimed",
          claimedAt: now,
          capabilityHash: null,
          expiresAt: null,
        })
      }
      return { claimedCount }
    })
  }
}

export function createMediaClaimHandler(injected?: Partial<MediaClaimDependencies>) {
  return async function POST(req: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb
      const cloudName = injected?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
      if (!auth || !db || !cloudName) throw httpError("Server media claim service is unavailable.", 503)
      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
      if (!authHeader?.startsWith("Bearer ")) throw httpError("Unauthorized: Missing authentication token for media claim", 401)
      let decoded: any
      try { decoded = await auth.verifyIdToken(authHeader.slice(7).trim(), true) }
      catch { throw httpError("Unauthorized: Invalid or revoked session token", 401) }

      const callerUid = decoded.uid
      const callerDoc = await db.collection("users").doc(callerUid).get()
      if (!callerDoc.exists) throw httpError("Caller account not found in system.", 403)
      const callerData = callerDoc.data() || {}
      if (["Locked", "Deleted", "Deleted by Resident"].includes(callerData.status)) throw httpError("Account is inactive or locked. Media claim forbidden.", 403)

      const body = await req.json().catch(() => ({}))
      if (body.ticket !== undefined && (typeof body.ticket !== "string" || !verifyRegistrationTicket(body.ticket))) {
        throw httpError("Registration ticket is invalid, expired, replayed, or forged.", 401)
      }
      if (!Array.isArray(body.claims) || body.claims.length === 0 || body.claims.length > 20) throw httpError("Between 1 and 20 media claims are required.", 400)
      const assets: AssetIdentity[] = body.claims.map((item: ClaimInput) => parseClaim(item || {}, cloudName))
      if (new Set(assets.map(asset => asset.registryId)).size !== assets.length) throw httpError("Duplicate media claims are not allowed.", 400)

      const preliminary = await Promise.all(assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId).get()))
      for (const snapshot of preliminary) if (!snapshot.exists) throw httpError("Media reservation was not found.", 404)
      const verifier = injected?.verifyAsset || createCloudinaryAssetVerifier()
      await Promise.all(assets.map(async (asset, index) => {
        const reservation = preliminary[index].data() || {}
        if (reservation.ownerUid === callerUid && reservation.status === "claimed") return
        await verifier(asset)
      }))

      const result = await createFirestoreMediaClaimAdapter(db)(callerUid, assets, (injected?.now || Date.now)())
      return NextResponse.json({ success: true, requestedCount: assets.length, claimedCount: result.claimedCount })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: error?.status || 500 })
    }
  }
}

export const POST = createMediaClaimHandler()
