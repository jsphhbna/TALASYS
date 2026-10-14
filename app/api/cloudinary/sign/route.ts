import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { verifyAndConsumeRegistrationTicket } from "@/lib/security/upload-ticket"
import { extractClientIp } from "@/lib/security/request-ip"
import { rateLimit } from "@/lib/rate-limit"
import { isSuperAdminRole, isFullAdminRole } from "@/lib/auth/auth-types"
import crypto from "crypto"

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

export async function POST(req: Request) {
  try {
    const secret = process.env.CLOUDINARY_API_SECRET
    if (!secret) {
      console.error("Cloudinary sign error: CLOUDINARY_API_SECRET is not configured on the server.")
      return NextResponse.json({ error: "Server configuration error: Missing Cloudinary secret." }, { status: 500 })
    }

    const ip = extractClientIp(req)
    const { success, resetTime } = rateLimit(`sign:${ip}`, 30, 60 * 1000)
    if (!success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before retrying." },
        { status: 429, headers: { "X-RateLimit-Reset": resetTime.toString() } }
      )
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    const body = await req.json().catch(() => ({}))
    const registrationTicket = body.ticket || req.headers.get("x-registration-ticket")

    let callerType: "admin" | "resident" | "registration-applicant" | null = null
    let callerRole: string | null = null
    let callerUid: string | null = null

    // 1. Authenticate via Firebase Auth ID token if provided (#51)
    if (authHeader && authHeader.startsWith("Bearer ")) {
      if (!adminAuth || !adminDb) {
        return NextResponse.json(
          { error: "Server authentication service is unavailable. Missing Firebase Admin configuration." },
          { status: 503 }
        )
      }

      const idToken = authHeader.replace("Bearer ", "").trim()
      let decodedToken: any
      try {
        decodedToken = await adminAuth.verifyIdToken(idToken, true)
      } catch (err) {
        return NextResponse.json({ error: "Unauthorized: Invalid or revoked session token." }, { status: 401 })
      }

      callerUid = decodedToken.uid

      // Authoritative account verification in `users` collection (#28, #30)
      const callerDoc = await adminDb.collection("users").doc(callerUid).get()
      if (!callerDoc.exists) {
        return NextResponse.json({ error: "Caller account record not found in system." }, { status: 403 })
      }

      const callerData = callerDoc.data() || {}
      const callerStatus = callerData.status as string | undefined
      callerRole = (callerData.role as string | undefined) || "resident"

      if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerRole === "Deleted") {
        return NextResponse.json({ error: "Account is inactive or locked. Upload signing forbidden." }, { status: 403 })
      }

      callerType = callerRole === "resident" ? "resident" : "admin"
    } 
    // 2. Alternatively, authenticate via single-use registration ticket for new residents (#51)
    else if (registrationTicket) {
      const isValidTicket = verifyAndConsumeRegistrationTicket(registrationTicket)
      if (!isValidTicket) {
        return NextResponse.json(
          { error: "Unauthorized: Invalid, expired, or replayed registration ticket." },
          { status: 401 }
        )
      }
      callerType = "registration-applicant"
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

    // 5. Bind the asset identity to the authenticated owner. This prevents a
    // resident from attaching another resident's copied URL as new evidence.
    const publicId = `${callerUid || "registration"}/${crypto.randomUUID()}`

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
    const claimToken = callerType === "registration-applicant" ? crypto.randomBytes(32).toString("hex") : undefined

    // 8. Server-controlled asset registry: record ownership or pre-registration claim requirement (A02)
    if (adminDb) {
      try {
        const fullPublicId = `${targetFolder}/${publicId}`
        const assetRegistryKey = crypto.createHash("sha256").update(fullPublicId).digest("hex")
        await adminDb.collection("mediaRegistry").doc(assetRegistryKey).set({
          publicId: fullPublicId,
          folder: targetFolder,
          ownerUid: callerUid || null,
          status: callerUid ? "claimed" : "unclaimed",
          claimToken: claimToken || null,
          createdAt: Date.now(),
        })
      } catch (regError) {
        console.warn("Could not register asset in mediaRegistry:", regError)
      }
    }

    return NextResponse.json({
      signature,
      timestamp,
      folder: targetFolder,
      publicId,
      type,
      apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
      ...(claimToken ? { claimToken } : {})
    })
  } catch (error: any) {
    console.error("Cloudinary sign error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
