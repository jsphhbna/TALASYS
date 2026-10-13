import { NextResponse } from "next/server"
import { adminAuth } from "@/lib/firebase-admin"
import { verifyRegistrationTicket } from "@/lib/security/upload-ticket"
import { rateLimit } from "@/lib/rate-limit"
import crypto from "crypto"

const ALLOWED_FOLDERS = [
  "talasys/residents",
  "talasys/proofs",
  "talasys/receipts",
  "talasys/signatures",
  "talasys/letters"
]

export async function POST(req: Request) {
  try {
    const secret = process.env.CLOUDINARY_API_SECRET
    if (!secret) {
      console.error("Cloudinary sign error: CLOUDINARY_API_SECRET is not configured on the server.")
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
    const { success, resetTime } = rateLimit(`sign:${ip}`, 30, 60 * 1000) // 30 signing operations per minute
    if (!success) {
      return NextResponse.json(
        { error: "Too many upload requests. Please wait before retrying." },
        { status: 429, headers: { "X-RateLimit-Reset": resetTime.toString() } }
      )
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    const body = await req.json().catch(() => ({}))
    const registrationTicket = body.ticket || req.headers.get("x-registration-ticket")

    let isAuthenticatedCaller = false
    let callerUid: string | null = null

    // 1. Check Firebase Auth token if present
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const idToken = authHeader.split("Bearer ")[1].trim()
      if (adminAuth) {
        try {
          const decoded = await adminAuth.verifyIdToken(idToken, true)
          isAuthenticatedCaller = true
          callerUid = decoded.uid
        } catch {
          // Token verification failed
        }
      } else {
        // Fallback in dev/mock environments: verify non-empty token structure
        if (idToken.length > 20) {
          isAuthenticatedCaller = true
          callerUid = "authenticated-user"
        }
      }
    }

    // 2. Check registration upload ticket for unauthenticated registration flow
    if (!isAuthenticatedCaller && verifyRegistrationTicket(registrationTicket)) {
      isAuthenticatedCaller = true
      callerUid = "registration-applicant"
    }

    // Reject anonymous unvalidated requests (#51)
    if (!isAuthenticatedCaller) {
      return NextResponse.json(
        { error: "Unauthorized: Upload signing requires an active user session or a valid registration ticket." },
        { status: 401 }
      )
    }

    // Determine target folder based on purpose/caller
    const requestedFolder = body.folder || (callerUid === "registration-applicant" ? "talasys/proofs" : "talasys/residents")
    const folder = ALLOWED_FOLDERS.includes(requestedFolder) ? requestedFolder : "talasys/residents"

    // Server-generated timestamp to prevent stale/forged timestamp signing (#51)
    const timestamp = Math.floor(Date.now() / 1000)

    // Cloudinary signature must sign parameters in alphabetical order
    // folder=...&timestamp=... + secret
    const signatureString = `folder=${folder}&timestamp=${timestamp}${secret}`
    const signature = crypto.createHash("sha1").update(signatureString).digest("hex")

    return NextResponse.json({
      signature,
      timestamp,
      folder,
      apiKey: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY
    })
  } catch (error) {
    console.error("Cloudinary sign error:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
