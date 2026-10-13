import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import {
  isSensitiveMedia,
  canAccessMedia,
  generateSignedDeliveryUrl,
  parseCloudinaryAsset
} from "@/lib/security/media-auth"

export async function POST(req: Request) {
  try {
    // Fail closed if Firebase Admin is unconfigured on the server (#52)
    if (!adminAuth || !adminDb) {
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
      decoded = await adminAuth.verifyIdToken(token, true)
    } catch {
      return NextResponse.json({ error: "Unauthorized: Invalid or revoked session token" }, { status: 401 })
    }

    const callerUid = decoded.uid

    // Authoritative caller account lookup in Firestore `users` collection (#28, #30)
    const callerDoc = await adminDb.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Caller account not found in system." }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerRole = (callerData.role as string | undefined) || "resident"
    const callerStatus = callerData.status as string | undefined

    if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerRole === "Deleted") {
      return NextResponse.json({ error: "Account is inactive or locked. Media access forbidden." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { publicId, mediaUrl, recordId, recordType } = body

    if (!publicId && !mediaUrl) {
      return NextResponse.json({ error: "Missing publicId or mediaUrl parameter" }, { status: 400 })
    }

    const target = (publicId || mediaUrl).trim()
    const isSensitive = isSensitiveMedia(target)

    let authoritativeOwnerUid: string | undefined = undefined

    // For sensitive evidence: resolve asset ownership authoritatively from Firestore records.
    // NEVER trust client-supplied request-body `ownerUid` (#52).
    if (isSensitive) {
      const parsed = parseCloudinaryAsset(target)
      const cleanTargetId = parsed.publicId

      // Case A: Official barangay signature in system_config
      if (target.includes("talasys/signatures")) {
        // System asset: authoritative owner is system. Only Super Admin and Full Admin may view.
        authoritativeOwnerUid = "system"
      }
      // Case B: Explicit record reference provided (e.g. reviewing specific verification or request)
      else if (recordId && typeof recordId === "string") {
        if (recordType === "verification" || !recordType) {
          const verifDoc = await adminDb.collection("verifications").doc(recordId).get()
          if (verifDoc.exists) {
            const vData = verifDoc.data() || {}
            // Verify that this verification actually contains the requested media target
            const docsList = Array.isArray(vData.documents) ? vData.documents : []
            const hasDoc = docsList.some((d: any) => typeof d?.url === "string" && (d.url.includes(cleanTargetId) || d.url === target))
            const matchesDirect = vData.idPhotoUrl?.includes(cleanTargetId) || vData.selfiePhotoUrl?.includes(cleanTargetId) || vData.proofOfResidencyUrl?.includes(cleanTargetId)
            
            if (hasDoc || matchesDirect) {
              authoritativeOwnerUid = vData.residentId
            }
          }
        }
        
        if (!authoritativeOwnerUid && (recordType === "request" || !recordType)) {
          const reqDoc = await adminDb.collection("documentRequests").doc(recordId).get()
          if (reqDoc.exists) {
            const rData = reqDoc.data() || {}
            if (rData.receiptUrl?.includes(cleanTargetId) || rData.authorizationLetterUrl?.includes(cleanTargetId) || rData.authorizationLetter?.includes(cleanTargetId)) {
              authoritativeOwnerUid = rData.residentId
            }
          }
        }
      }

      // Case C: If not resolved via recordId, look in caller's own records if caller is a resident
      if (!authoritativeOwnerUid && callerRole === "resident") {
        // Check caller's own user record
        if (callerData.idPhotoUrl?.includes(cleanTargetId) || callerData.selfiePhotoUrl?.includes(cleanTargetId) || callerData.photoURL?.includes(cleanTargetId)) {
          authoritativeOwnerUid = callerUid
        }

        // Check caller's verifications
        if (!authoritativeOwnerUid) {
          const userVerifs = await adminDb.collection("verifications").where("residentId", "==", callerUid).limit(10).get()
          for (const doc of userVerifs.docs) {
            const v = doc.data() || {}
            const docsList = Array.isArray(v.documents) ? v.documents : []
            if (
              docsList.some((d: any) => typeof d?.url === "string" && (d.url.includes(cleanTargetId) || d.url === target)) ||
              v.idPhotoUrl?.includes(cleanTargetId) ||
              v.selfiePhotoUrl?.includes(cleanTargetId) ||
              v.proofOfResidencyUrl?.includes(cleanTargetId)
            ) {
              authoritativeOwnerUid = callerUid
              break
            }
          }
        }

        // Check caller's document requests
        if (!authoritativeOwnerUid) {
          const userReqs = await adminDb.collection("documentRequests").where("residentId", "==", callerUid).limit(10).get()
          for (const doc of userReqs.docs) {
            const r = doc.data() || {}
            if (r.receiptUrl?.includes(cleanTargetId) || r.authorizationLetterUrl?.includes(cleanTargetId) || r.authorizationLetter?.includes(cleanTargetId)) {
              authoritativeOwnerUid = callerUid
              break
            }
          }
        }
      }

      const access = canAccessMedia({
        publicId: target,
        mediaUrl: target,
        callerUid,
        callerRole,
        callerStatus,
        ownerUid: authoritativeOwnerUid,
      })

      if (!access.authorized) {
        return NextResponse.json(
          { error: access.reason || "Forbidden: Access to sensitive evidence denied" },
          { status: 403 }
        )
      }
    }

    // Generate genuine time-limited signed Cloudinary delivery URL (#52)
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
      expiresIn: 900,
    })
  } catch (error: any) {
    console.error("Media view route error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
