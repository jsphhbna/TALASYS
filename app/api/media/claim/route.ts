import { v2 as cloudinary } from "cloudinary"
import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { verifyRegistrationTicket } from "../../../../lib/security/upload-ticket.ts"
import {
  applyRegistrationClaims,
  parseRegistrationMediaClaim,
  preflightRegistrationAssets,
  registrationHttpError,
  type RegistrationAssetIdentity,
  type RegistrationMediaClaimInput,
} from "../../../../lib/security/registration-media-claim.ts"

type MediaClaimDependencies = {
  auth: any
  db: any
  cloudName: string
  now: () => number
  verifyAsset: (asset: RegistrationAssetIdentity) => Promise<void>
}

function httpError(message: string, status: number) {
  return registrationHttpError(message, status)
}

export function createCloudinaryAssetVerifier() {
  const isE2E = process.env.TALASYS_E2E_MODE === "true" && Boolean(process.env.FIRESTORE_EMULATOR_HOST)
  if (isE2E) {
    return async (_asset: RegistrationAssetIdentity) => {
      return
    }
  }
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
  const apiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY || ""
  const apiSecret = process.env.CLOUDINARY_API_SECRET || ""
  if (!cloudName || !apiKey || !apiSecret) {
    throw registrationHttpError("Cloudinary verification is unavailable.", 503, "PROVIDER_VERIFICATION_UNAVAILABLE")
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
  return async (asset: RegistrationAssetIdentity) => {
    let result: any
    try {
      result = await cloudinary.api.resource(asset.publicId, {
        resource_type: asset.resourceType,
        type: asset.deliveryType,
      })
    } catch (err: any) {
      const httpCode = err?.error?.http_code || err?.status
      if (httpCode === 404 || err?.message?.toLowerCase().includes("not found")) {
        throw registrationHttpError("The uploaded proof asset does not exist on Cloudinary.", 404, "PROOF_ASSET_NOT_FOUND")
      }
      throw registrationHttpError("The uploaded proof could not be verified with the media provider.", 503, "PROVIDER_VERIFICATION_FAILED")
    }
    if (
      result?.public_id !== asset.publicId ||
      result?.resource_type !== asset.resourceType ||
      result?.type !== asset.deliveryType
    ) {
      throw registrationHttpError("Uploaded media does not match its reservation.", 409, "PROOF_IDENTITY_MISMATCH")
    }
  }
}

export function createFirestoreMediaClaimAdapter(db: any) {
  return async function claimReservedAssets(callerUid: string, assets: RegistrationAssetIdentity[], now: number) {
    const refs = assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId))
    return db.runTransaction(async (transaction: any) => {
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)))
      applyRegistrationClaims({ transaction, refs, snapshots, assets, callerUid, now })
      return { claimedCount: assets.length }
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
      const assets: RegistrationAssetIdentity[] = body.claims.map((item: RegistrationMediaClaimInput) => parseRegistrationMediaClaim(item || {}, cloudName))
      if (new Set(assets.map(asset => asset.registryId)).size !== assets.length) throw httpError("Duplicate media claims are not allowed.", 400)

      const now = (injected?.now || Date.now)()
      const verifier = injected?.verifyAsset || createCloudinaryAssetVerifier()
      await preflightRegistrationAssets({ db, callerUid, assets, now, verifyAsset: verifier })
      const result = await createFirestoreMediaClaimAdapter(db)(callerUid, assets, now)
      return NextResponse.json({ success: true, requestedCount: assets.length, claimedCount: result.claimedCount })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: error?.status || 500 })
    }
  }
}

export const POST = createMediaClaimHandler()
