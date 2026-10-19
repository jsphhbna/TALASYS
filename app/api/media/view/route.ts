import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import crypto from "node:crypto"
import {
  isSensitiveMedia,
  canAccessMedia,
  generateSignedDeliveryUrl,
  mediaRegistryDocumentId,
  parseCloudinaryAsset,
  sameCloudinaryAsset
} from "../../../../lib/security/media-auth.ts"

function matches(value: unknown, target: string): boolean {
  return typeof value === "string" && sameCloudinaryAsset(value, target)
}

function verificationContains(data: Record<string, any>, target: string): boolean {
  const documents = Array.isArray(data.documents) ? data.documents : Object.values(data.documents || {})
  return documents.some((item: any) => matches(item?.url ?? item, target)) ||
    [data.idPhotoUrl, data.selfiePhotoUrl, data.proofOfResidencyUrl, data.profilePicture, data.newProfilePicture].some(value => matches(value, target)) ||
    (Array.isArray(data.changes) && data.changes.some((change: any) => /photo|picture|proof|document|signature/i.test(String(change?.field || "")) && matches(change?.newValue, target)))
}

function requestContains(data: Record<string, any>, target: string): boolean {
  return [data.receiptUrl, data.gcashScreenshotUrl, data.authorizationLetterUrl, data.authorizationLetter].some(value => matches(value, target))
}

export function createMediaViewHandler(injected?: { auth?: any; db?: any }) {
  return async function POST(req: Request) {
    const auth = injected?.auth || adminAuth
    const db = injected?.db || adminDb
    try {
      // Fail closed if Firebase Admin is unconfigured on the server (#52)
      if (!auth || !db) {
        return NextResponse.json(
          { error: "Server authentication service is unavailable. Missing Firebase Admin configuration." },
          { status: 503 }
        )
      }

      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      const apiSecret = process.env.CLOUDINARY_API_SECRET

      // Fail closed if Cloudinary signing secrets are unconfigured; NEVER use fallback secrets (#52)
      if (!cloudName || !apiSecret) {
        return NextResponse.json(
          { error: "Server media delivery service is unconfigured. Missing Cloudinary secrets." },
          { status: 500 }
        )
      }

      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json(
          { error: "Unauthorized: Missing authentication token for media delivery (#52)" },
          { status: 401 }
        )
      }

      const token = authHeader.replace("Bearer ", "").trim()
      let decoded: any
      try {
        decoded = await auth.verifyIdToken(token, true)
      } catch {
        return NextResponse.json({ error: "Unauthorized: Invalid or revoked session token" }, { status: 401 })
      }

      const callerUid = decoded.uid

      // Authoritative caller account lookup in Firestore `users` collection (#28, #30)
      const callerDoc = await db.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Caller account not found in system." }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerRole = (callerData.role as string | undefined) || "resident"
    const callerStatus = callerData.status as string | undefined

    if (callerData.registrationDenied || Boolean(callerData.deniedAt) || callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerRole === "Deleted" || (!callerData.isVerified && callerStatus === "Expired")) {
      return NextResponse.json({ error: "Account is inactive, locked, or registration was denied. Media access forbidden." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { publicId, mediaUrl, recordId, recordType } = body

    if (!publicId && !mediaUrl) {
      return NextResponse.json({ error: "Missing publicId or mediaUrl parameter" }, { status: 400 })
    }

    const target = (publicId || mediaUrl).trim()
    const isSensitive = isSensitiveMedia(target)

    let authoritativeOwnerUid: string | undefined = undefined

    // For sensitive evidence: resolve asset ownership authoritatively.
    // Client-writable references must NEVER establish asset ownership over another user's namespace (A02).
    if (isSensitive) {
      const parsed = parseCloudinaryAsset(target)
      const cleanPublicId = parsed.publicId.replace(/^\//, "")

      // Case A: Official barangay signature in system_config
      if (cleanPublicId.startsWith("talasys/signatures/")) {
        // System asset: authoritative owner is system. Only Super Admin and Full Admin may view.
        authoritativeOwnerUid = "system"
      }
      // Case B: Validated owner namespace or server-controlled mediaRegistry (A02)
      else {
        const namespaceMatch = cleanPublicId.match(/^talasys\/(proofs|receipts|letters|residents)\/([^/]+)\/(.+)$/)
        if (namespaceMatch) {
          const [, , namespaceOwner] = namespaceMatch
          if (namespaceOwner !== "registration") {
            // Validated owner namespace: authoritatively owned by namespaceOwner
            authoritativeOwnerUid = namespaceOwner
          } else {
            // Pre-registration namespace: resolve from server-controlled mediaRegistry
            const assetRegistryKey = mediaRegistryDocumentId(parsed.cloudName || cloudName, parsed.resourceType, cleanPublicId)
            let regDoc = await adminDb.collection("mediaRegistry").doc(assetRegistryKey).get()
            // Read-only compatibility for reservations issued before exact
            // Cloudinary identity became part of the registry key.
            if (!regDoc.exists) {
              const legacyKey = crypto.createHash("sha256").update(cleanPublicId).digest("hex")
              regDoc = await adminDb.collection("mediaRegistry").doc(legacyKey).get()
            }
            if (regDoc.exists && regDoc.data()?.status === "claimed" && regDoc.data()?.ownerUid) {
              authoritativeOwnerUid = regDoc.data().ownerUid
            } else if (callerRole && callerRole !== "resident") {
              // Administrators with appropriate review role may inspect pending unverified applicant assets
              authoritativeOwnerUid = "pending-applicant"
            }
          }
        }
      }

      // Case C: Non-namespaced legacy assets: resolve via mediaRegistry or record reference
      if (!authoritativeOwnerUid) {
        const assetRegistryKey = mediaRegistryDocumentId(parsed.cloudName || cloudName, parsed.resourceType, cleanPublicId)
        let regDoc = await adminDb.collection("mediaRegistry").doc(assetRegistryKey).get()
        if (!regDoc.exists) {
          const legacyKey = crypto.createHash("sha256").update(cleanPublicId).digest("hex")
          regDoc = await adminDb.collection("mediaRegistry").doc(legacyKey).get()
        }
        if (regDoc.exists && regDoc.data()?.ownerUid) {
          authoritativeOwnerUid = regDoc.data().ownerUid
        }
      }

      if (!authoritativeOwnerUid && recordId && typeof recordId === "string") {
        if (recordType === "user") {
          const userDoc = await adminDb.collection("users").doc(recordId).get()
          if (userDoc.exists) {
            const userData = userDoc.data() || {}
            if ([userData.idPhotoUrl, userData.selfiePhotoUrl, userData.proofOfResidencyUrl, userData.profilePicture, userData.photoURL].some(value => matches(value, target))) {
              authoritativeOwnerUid = recordId
            }
          }
        }

        if (recordType === "verification" || !recordType) {
          const verifDoc = await adminDb.collection("verifications").doc(recordId).get()
          if (verifDoc.exists) {
            const vData = verifDoc.data() || {}
            if (verificationContains(vData, target)) {
              authoritativeOwnerUid = vData.residentId || vData.userId
            }
          }
        }
        
        if (!authoritativeOwnerUid && (recordType === "request" || !recordType)) {
          const reqDoc = await adminDb.collection("documentRequests").doc(recordId).get()
          if (reqDoc.exists) {
            const rData = reqDoc.data() || {}
            if (requestContains(rData, target)) {
              authoritativeOwnerUid = rData.residentId
            }
          }
        }
      }

      // Case C: If not resolved via recordId, look in caller's own records if caller is a resident
      if (!authoritativeOwnerUid && callerRole === "resident") {
        // Check caller's own user record
        if ([callerData.idPhotoUrl, callerData.selfiePhotoUrl, callerData.proofOfResidencyUrl, callerData.profilePicture, callerData.photoURL].some(value => matches(value, target))) {
          authoritativeOwnerUid = callerUid
        }

        // Check caller's verifications
        if (!authoritativeOwnerUid) {
          const userVerifs = await adminDb.collection("verifications").where("residentId", "==", callerUid).get()
          for (const doc of userVerifs.docs) {
            const v = doc.data() || {}
            if (verificationContains(v, target)) {
              authoritativeOwnerUid = callerUid
              break
            }
          }
        }

        // Check caller's document requests
        if (!authoritativeOwnerUid) {
          const userReqs = await adminDb.collection("documentRequests").where("residentId", "==", callerUid).get()
          for (const doc of userReqs.docs) {
            const r = doc.data() || {}
            if (requestContains(r, target)) {
              authoritativeOwnerUid = callerUid
              break
            }
          }
        }
      }

      if (!authoritativeOwnerUid) {
        return NextResponse.json({ error: "Forbidden: Asset is not attached to an authoritative record." }, { status: 403 })
      }

      const access = canAccessMedia({
        publicId: target,
        mediaUrl: target,
        callerUid,
        callerRole,
        callerStatus,
        callerRegistrationDenied: Boolean(callerData.registrationDenied || callerData.deniedAt),
        ownerUid: authoritativeOwnerUid,
      })

      if (!access.authorized) {
        return NextResponse.json(
          { error: access.reason || "Forbidden: Access to sensitive evidence denied" },
          { status: 403 }
        )
      }
    }

    // Generate genuine cryptographically signed Cloudinary delivery URL (#52)
    const { deliveryUrl, expiresAt } = generateSignedDeliveryUrl(
      target,
      cloudName,
      apiSecret,
      900 // 15 minute bounded validity
    )

    return NextResponse.json({
      authorized: true,
      deliveryUrl,
      expiresAt,
      expiresIn: null,
      timeLimited: false,
    })
  } catch (error: any) {
    console.error("Media view route error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
}

export const POST = createMediaViewHandler()
