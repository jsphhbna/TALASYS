import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { parseCloudinaryAsset } from "@/lib/security/media-auth"
import { verifyRegistrationTicket } from "@/lib/security/upload-ticket"
import crypto from "crypto"

export async function POST(req: Request) {
  try {
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: "Server authentication service is unavailable. Missing Firebase Admin configuration." },
        { status: 503 }
      )
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized: Missing authentication token for media claim" },
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
    const callerDoc = await adminDb.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Caller account not found in system." }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerStatus = callerData.status as string | undefined
    if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident") {
      return NextResponse.json({ error: "Account is inactive or locked. Media claim forbidden." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { claims = [], ticket } = body

    let ticketNonce: string | null = null
    if (ticket && typeof ticket === "string") {
      try {
        const [serialized] = ticket.split(".")
        const payload = JSON.parse(Buffer.from(serialized, "base64url").toString("utf8"))
        if (payload?.nonce) {
          ticketNonce = payload.nonce
        }
      } catch {
        // Invalid ticket format
      }
    }

    let claimedCount = 0
    const now = Date.now()

    if (Array.isArray(claims)) {
      for (const item of claims) {
        const rawTarget = typeof item === "string" ? item : (item?.publicId || item?.mediaUrl || "")
        if (!rawTarget) continue

        const parsed = parseCloudinaryAsset(rawTarget)
        const fullPublicId = parsed.publicId.replace(/^\//, "")
        const assetRegistryKey = crypto.createHash("sha256").update(fullPublicId).digest("hex")

        const assetDocRef = adminDb.collection("mediaRegistry").doc(assetRegistryKey)
        const assetDoc = await assetDocRef.get()

        if (!assetDoc.exists) {
          // If asset was uploaded under registration namespace with a claim token, register and claim it
          if (item?.claimToken && typeof item.claimToken === "string" && fullPublicId.includes("/registration/")) {
            await assetDocRef.set({
              publicId: fullPublicId,
              ownerUid: callerUid,
              status: "claimed",
              claimedAt: now,
              claimToken: item.claimToken,
              createdAt: now,
            })
            claimedCount++
          }
          continue
        }

        const assetData = assetDoc.data() || {}

        // Already claimed by this caller
        if (assetData.ownerUid === callerUid) {
          claimedCount++
          continue
        }

        // Must be currently unclaimed to be claimed
        if (assetData.status !== "unclaimed") {
          continue
        }

        const tokenMatch = item?.claimToken && typeof item.claimToken === "string" && assetData.claimToken === item.claimToken
        const nonceMatch = ticketNonce && assetData.ticketNonce === ticketNonce

        if (tokenMatch || nonceMatch) {
          await assetDocRef.update({
            ownerUid: callerUid,
            status: "claimed",
            claimedAt: now,
          })
          claimedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      claimedCount,
    })
  } catch (error: any) {
    console.error("Media claim error:", error)
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 })
  }
}
