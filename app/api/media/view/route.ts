import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase-admin"
import { isSensitiveMedia, canAccessMedia, generateSignedDeliveryUrl } from "@/lib/security/media-auth"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token for media delivery (#52)" },
        { status: 401 }
      )
    }

    const token = authHeader.split("Bearer ")[1].trim()
    let callerUid = ""
    let callerRole = ""

    if (adminAuth) {
      try {
        const decoded = await adminAuth.verifyIdToken(token, true)
        callerUid = decoded.uid
        callerRole = (decoded.role as string) || "resident"
      } catch (err) {
        return NextResponse.json({ error: "Unauthorized: Invalid or revoked session token" }, { status: 401 })
      }
    } else {
      // Mock / Dev fallback
      callerUid = "test-caller-uid"
      callerRole = "admin"
    }

    const body = await req.json().catch(() => ({}))
    const { publicId, mediaUrl, ownerUid } = body

    if (!publicId && !mediaUrl) {
      return NextResponse.json({ error: "Missing publicId or mediaUrl" }, { status: 400 })
    }

    const target = publicId || mediaUrl
    const sensitive = isSensitiveMedia(target)

    if (sensitive) {
      const access = canAccessMedia({
        publicId,
        mediaUrl,
        callerUid,
        callerRole,
        ownerUid,
      })

      if (!access.authorized) {
        return NextResponse.json(
          { error: access.reason || "Forbidden: Access to sensitive evidence denied" },
          { status: 403 }
        )
      }
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "talasys"
    const apiSecret = process.env.CLOUDINARY_API_SECRET || "talasys-secret"

    const authorizedUrl = generateSignedDeliveryUrl(
      publicId || "talasys/proofs/sample",
      cloudName,
      apiSecret,
      3600
    )

    return NextResponse.json({
      authorized: true,
      deliveryUrl: authorizedUrl,
      expiresIn: 3600,
    })
  } catch (error) {
    console.error("Media view route error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
