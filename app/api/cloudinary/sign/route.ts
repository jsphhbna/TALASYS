import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../lib/firebase-admin.ts"
import { consumeRegistrationTicket } from "../../../../lib/security/upload-ticket.ts"
import { extractClientIp } from "../../../../lib/security/request-ip.ts"
import { rateLimit } from "../../../../lib/rate-limit.ts"
import { isSuperAdminRole, isFullAdminRole } from "../../../../lib/auth/auth-types.ts"
import crypto from "crypto"
import { mediaRegistryDocumentId } from "../../../../lib/security/media-auth.ts"

const ALLOWED_FOLDERS = [
  "talasys/residents",
  "talasys/proofs",
  "talasys/receipts",
  "talasys/signatures",
  "talasys/letters"
] as const

type AllowedFolder = typeof ALLOWED_FOLDERS[number]

const SENSITIVE_FOLDERS = new Set<AllowedFolder>([
  "talasys/proofs",
  "talasys/receipts",
  "talasys/signatures",
  "talasys/letters",
  "talasys/residents"
])

const REGISTRATION_RESERVATION_TTL_MS = 60 * 60 * 1000

export function createCloudinarySignHandler(injected?: { auth?: any; db?: any }) {
  return async function POST(req: Request) {
  try {
    const secret = process.env.CLOUDINARY_API_SECRET
    if (!secret) {
      console.error("Cloudinary sign error: CLOUDINARY_API_SECRET is not configured on the server.")
      return NextResponse.json({ error: "Server configuration error: Missing Cloudinary secret." }, { status: 500 })
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    const body = await req.json().catch(() => ({}))
    const registrationTicket = body.ticket || req.headers.get("x-registration-ticket")

    const ip = extractClientIp(req)
    // SEC-03: Avoid shared Unknown IP denial of service. When IP is unverified/Unknown,
    // isolate rate limiting buckets by bearer token hash or registration ticket prefix.
    const rateLimitKey = ip !== "Unknown"
      ? `sign:${ip}`
      : (authHeader
          ? `sign:auth:${crypto.createHash("sha256").update(authHeader).digest("hex").slice(0, 16)}`
          : (registrationTicket
              ? `sign:ticket:${String(registrationTicket).slice(0, 16)}`
              : `sign:unknown`))

    const { success, resetTime } = rateLimit(rateLimitKey, 30, 60 * 1000)
    if (!success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before retrying." },
        { status: 429, headers: { "X-RateLimit-Reset": resetTime.toString() } }
      )
    }

    let callerType: "admin" | "resident" | "registration-applicant" | null = null
    let callerRole: string | null = null
    let callerUid: string | null = null
    let registrationTicketNonce: string | null = null

    // 1. Authenticate via Firebase Auth ID token if provided (#51)
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb
      if (!auth || !db) {
        return NextResponse.json(
          { error: "Server authentication service is unavailable. Missing Firebase Admin configuration." },
          { status: 503 }
        )
      }

      const idToken = authHeader.replace("Bearer ", "").trim()
      let decodedToken: any
      try {
        decodedToken = await auth.verifyIdToken(idToken, true)
      } catch (err) {
        return NextResponse.json({ error: "Unauthorized: Invalid or revoked session token." }, { status: 401 })
      }

      callerUid = decodedToken.uid

      // Authoritative account verification in `users` collection (#28, #30)
      const callerDoc = await db.collection("users").doc(callerUid).get()
      if (!callerDoc.exists) {
        // Authenticated user with no user document is an incomplete registration applicant (#2).
        // They receive strictly registration-scoped proof upload authorization without broader privileges.
        callerType = "registration-applicant"
      } else {
        const callerData = callerDoc.data() || {}
        const callerStatus = callerData.status as string | undefined
        callerRole = (callerData.role as string | undefined) || "resident"

        if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerRole === "Deleted") {
          return NextResponse.json({ error: "Account is inactive or locked. Upload signing forbidden." }, { status: 403 })
        }

        callerType = callerRole === "resident" ? "resident" : "admin"
      }
    } 
    // 2. Alternatively, authenticate via single-use registration ticket for new residents (#51)
    else if (registrationTicket) {
      const verifiedTicket = consumeRegistrationTicket(registrationTicket)
      if (!verifiedTicket) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid, expired, or replayed registration ticket." },
          { status: 401 }
        )
      }
      callerType = "registration-applicant"
      registrationTicketNonce = verifiedTicket.nonce
    }

    // Reject unauthenticated requests
    if (!callerType) {
      return NextResponse.json(
        { error: "Unauthorized: Upload signing requires an active user session or a valid registration ticket." },
        { status: 401 }
      )
    }

    const requestedFolder = (body.folder || "").trim() as AllowedFolder

    // 3. Enforce upload folders and purposes strictly by caller role (#51)
    let targetFolder: AllowedFolder

    if (callerType === "registration-applicant") {
      // Registration applicants can ONLY upload proofs; NEVER signatures or other folders
      if (requestedFolder && requestedFolder !== "talasys/proofs") {
        return NextResponse.json(
          { error: "Registration applicants may only upload documents to the proofs folder." },
          { status: 403 }
        )
      }
      targetFolder = "talasys/proofs"
    } else if (callerType === "resident") {
      // Residents can upload proofs, profile photos, receipts, or authorization letters
      // Residents CANNOT upload official signatures
      if (requestedFolder === "talasys/signatures") {
        return NextResponse.json(
          { error: "Residents are not permitted to upload official signatures." },
          { status: 403 }
        )
      }
      if (requestedFolder && ALLOWED_FOLDERS.includes(requestedFolder)) {
        targetFolder = requestedFolder
      } else {
        targetFolder = "talasys/residents"
      }
    } else {
      // Administrative roles
      if (callerRole === "View Only") {
        return NextResponse.json({ error: "View Only administrators cannot upload media." }, { status: 403 })
      }

      const isSuper = isSuperAdminRole(callerRole)
      const isFull = isFullAdminRole(callerRole)

      if (requestedFolder === "talasys/signatures" && !isSuper && !isFull) {
        return NextResponse.json({ error: "Only Super Admin and Full Access administrators may upload official signatures." }, { status: 403 })
      }

      if (callerRole === "Document Processing" && requestedFolder === "talasys/proofs") {
        return NextResponse.json({ error: "Document Processing role cannot upload verification proofs." }, { status: 403 })
      }

      targetFolder = ALLOWED_FOLDERS.includes(requestedFolder) ? requestedFolder : "talasys/residents"
    }

    // 4. Determine delivery protection type: sensitive folders use authenticated delivery (#52)
    const isProtected = SENSITIVE_FOLDERS.has(targetFolder)
    const type = isProtected ? "authenticated" : undefined

    // 5. Bind the asset identity to the authenticated owner. For registration applicants
    // (whether unfinalized Auth users or ticket holders), publicId must reside strictly
    // in the registration namespace for finalization claim verification.
    const isRegistrationApplicant = callerType === "registration-applicant"
    const publicId = isRegistrationApplicant
      ? `registration/${crypto.randomUUID()}`
      : `${callerUid || "registration"}/${crypto.randomUUID()}`

    // 6. Server-generated timestamp
    const timestamp = Math.floor(Date.now() / 1000)

    // 7. Sign parameters in strict alphabetical order as required by Cloudinary
    let signatureString: string
    if (type) {
      signatureString = `folder=${targetFolder}&public_id=${publicId}&timestamp=${timestamp}&type=${type}${secret}`
    } else {
      signatureString = `folder=${targetFolder}&public_id=${publicId}&timestamp=${timestamp}${secret}`
    }

    const signature = crypto.createHash("sha1").update(signatureString).digest("hex")
    const claimToken = isRegistrationApplicant ? crypto.randomBytes(32).toString("base64url") : undefined

    // 8. Server-controlled asset registry: record ownership or pre-registration claim requirement (A02)
    const db = injected?.db || adminDb
    if (!db) {
      return NextResponse.json({ error: "Server media registry is unavailable." }, { status: 503 })
    }
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
      if (!cloudName) throw new Error("Cloudinary cloud name is not configured")
      const fullPublicId = `${targetFolder}/${publicId}`
      const resourceType = "image"
      const assetRegistryKey = mediaRegistryDocumentId(cloudName, resourceType, fullPublicId)
      const reservationExpiresAt = Date.now() + REGISTRATION_RESERVATION_TTL_MS
      await db.collection("mediaRegistry").doc(assetRegistryKey).create({
        cloudName,
        publicId: fullPublicId,
        folder: targetFolder,
        resourceType,
        deliveryType: type || "upload",
        ownerUid: isRegistrationApplicant ? null : callerUid,
        status: isRegistrationApplicant ? "reserved" : "claimed",
        capabilityHash: claimToken ? crypto.createHash("sha256").update(claimToken).digest("hex") : null,
        ticketNonce: registrationTicketNonce,
        expiresAt: claimToken ? reservationExpiresAt : null,
        createdAt: Date.now(),
      })
    } catch (regError) {
      console.error("Could not create media reservation:", regError)
      return NextResponse.json({ error: "Unable to reserve the protected upload. Please retry." }, { status: 503 })
    }

    return NextResponse.json({
      signature,
      timestamp,
      folder: targetFolder,
      publicId,
      type,
      apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || process.env.CLOUDINARY_API_KEY,
      ...(claimToken ? { claimToken } : {})
    })
  } catch (error: any) {
    console.error("Cloudinary sign error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
}

export const POST = createCloudinarySignHandler()
