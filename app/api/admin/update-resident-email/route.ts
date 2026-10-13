import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { isSuperAdminRole, isFullAdminRole } from "@/lib/auth/auth-types"
import { extractClientIp } from "@/lib/security/request-ip"
import { COLLECTION_ACTIVITY_LOGS } from "@/lib/constants"

export async function POST(req: Request) {
  try {
    // Fail closed if Firebase Admin is not configured on the server
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: "Server authentication service is unavailable. Missing Firebase Admin configuration." },
        { status: 503 }
      )
    }

    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "").trim()

    // Verify token with checkRevoked=true to reject locked or revoked sessions (#30)
    let decodedToken
    try {
      decodedToken = await adminAuth.verifyIdToken(token, true)
    } catch (authErr: any) {
      return NextResponse.json({ error: "Session invalid or expired. Please sign in again." }, { status: 401 })
    }

    const callerUid = decodedToken.uid

    // Read current role and account status authoritatively from Firestore `users` collection (#28, #30)
    const callerDoc = await adminDb.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Caller account record not found" }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerRole = callerData.role as string | undefined
    const callerStatus = callerData.status as string | undefined

    // Reject locked, deleted, or disabled callers
    if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident") {
      return NextResponse.json({ error: "Account is locked or inactive. Operation forbidden." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { residentId, newEmail, verificationId } = body

    if (!residentId || typeof residentId !== "string" || !newEmail || typeof newEmail !== "string" || !newEmail.includes("@")) {
      return NextResponse.json({ error: "Invalid resident ID or email address parameter" }, { status: 400 })
    }

    const normalizedNewEmail = newEmail.trim().toLowerCase()

    // Authorization checks by role
    const isSuper = isSuperAdminRole(callerRole)
    const isFull = isFullAdminRole(callerRole)
    const isResidentMgmt = callerRole === "Resident Management"
    const isVerificationAdmin = callerRole === "Verification Only" || callerRole === "Verifications"

    // View Only, Document Processing, and unauthorized roles must NEVER modify identities
    if (!isSuper && !isFull && !isResidentMgmt && !isVerificationAdmin) {
      return NextResponse.json({ error: "Unauthorized: Your role does not have permission to modify resident identities." }, { status: 403 })
    }

    // Verification Only admins can ONLY change email as part of an authorized pending profile-edit verification review
    if (isVerificationAdmin && !isSuper && !isFull && !isResidentMgmt) {
      if (!verificationId) {
        return NextResponse.json({ 
          error: "Verification administrators may only modify emails as part of an approved pending profile edit review." 
        }, { status: 403 })
      }

      const verifDoc = await adminDb.collection("verifications").doc(verificationId).get()
      if (!verifDoc.exists) {
        return NextResponse.json({ error: "Associated verification record not found." }, { status: 404 })
      }

      const verifData = verifDoc.data() || {}
      if (verifData.residentId !== residentId || verifData.type !== "profile-edit" || verifData.status !== "pending") {
        return NextResponse.json({ 
          error: "Verification record does not match a pending profile edit for this resident." 
        }, { status: 403 })
      }

      // Check that the verification changes actually include this email change
      const requestedEmailChange = Array.isArray(verifData.changes) && verifData.changes.some(
        (c: any) => c.field === "Email Address" && (c.newValue || "").trim().toLowerCase() === normalizedNewEmail
      )
      if (!requestedEmailChange) {
        return NextResponse.json({ 
          error: "The requested email does not match the pending verification submission." 
        }, { status: 403 })
      }
    }

    // Verify target exists and is strictly a resident (never modify privileged accounts)
    const targetDoc = await adminDb.collection("users").doc(residentId).get()
    if (!targetDoc.exists) {
      return NextResponse.json({ error: "Target resident record not found." }, { status: 404 })
    }

    const targetData = targetDoc.data() || {}
    if (targetData.role !== "resident") {
      return NextResponse.json({ error: "Forbidden: Target account is not a resident. Cannot modify privileged accounts." }, { status: 403 })
    }

    const oldEmail = targetData.email || "unknown"
    if (oldEmail.toLowerCase() === normalizedNewEmail) {
      return NextResponse.json({ error: "New email address must be different from current email." }, { status: 400 })
    }

    // 1. Update Firebase Auth identity email
    await adminAuth.updateUser(residentId, { email: normalizedNewEmail })

    // 2. Update Firestore user document
    await adminDb.collection("users").doc(residentId).update({
      email: normalizedNewEmail,
      updatedAt: Date.now()
    })

    // 3. Create server-authored audit record with authenticated actor identity and trusted request IP
    const clientIp = extractClientIp(req)
    const now = Date.now()
    const manilaDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila"
    }).format(new Date(now))

    await adminDb.collection(COLLECTION_ACTIVITY_LOGS).add({
      actor: {
        id: callerUid,
        name: callerData.name || "Administrator",
        email: callerData.email || decodedToken.email || "unknown",
        role: callerRole
      },
      action: "Updated Resident Email",
      actionType: "Resident Edit",
      targetId: residentId,
      targetName: targetData.name || "Resident",
      details: `Email changed from ${oldEmail} to ${normalizedNewEmail}`,
      ipAddress: clientIp,
      timestamp: now,
      date: manilaDate,
      createdAt: now
    })

    return NextResponse.json({
      success: true,
      message: "Email synchronized in both Firebase Auth and Firestore successfully"
    })
  } catch (error: any) {
    console.error("Failed to update resident email:", error)
    if (error.code === "auth/email-already-in-use") {
      return NextResponse.json({ error: "Email address is already in use by another account" }, { status: 400 })
    }
    return NextResponse.json({ error: error.message || "Failed to synchronize email" }, { status: 500 })
  }
}
