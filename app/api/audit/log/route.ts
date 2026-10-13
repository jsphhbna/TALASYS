import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { extractClientIp } from "@/lib/security/request-ip"
import { isAnyAdminRole } from "@/lib/auth/auth-types"
import { COLLECTION_ACTIVITY_LOGS } from "@/lib/constants"

export async function POST(req: Request) {
  try {
    // Fail closed if Firebase Admin is unconfigured (#6)
    if (!adminAuth || !adminDb) {
      return NextResponse.json(
        { error: "Server authentication service unavailable. Missing Firebase Admin configuration." },
        { status: 503 }
      )
    }

    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "").trim()
    let decodedToken: any
    try {
      decodedToken = await adminAuth.verifyIdToken(token, true)
    } catch {
      return NextResponse.json({ error: "Session invalid or expired" }, { status: 401 })
    }

    const callerUid = decodedToken.uid

    // Authoritative caller account lookup in Firestore `users` collection (#6, #28, #30)
    const callerDoc = await adminDb.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Caller account not found" }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerRole = (callerData.role as string | undefined) || "unknown"
    const callerStatus = callerData.status as string | undefined

    if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerRole === "Deleted") {
      return NextResponse.json({ error: "Account is inactive or locked. Audit logging forbidden." }, { status: 403 })
    }

    // Only administrative roles may write administrative audit events
    if (!isAnyAdminRole(callerRole)) {
      return NextResponse.json({ error: "Only administrators may log administrative audit actions." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { action, actionType, details, targetId, targetName, targetCollection } = body

    if (!action || typeof action !== "string" || !details || typeof details !== "string") {
      return NextResponse.json({ error: "Invalid audit action or details parameters" }, { status: 400 })
    }

    // Extract real client IP at server boundary using trusted proxy headers (#6)
    const clientIp = extractClientIp(req)

    const now = Date.now()
    const manilaDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila"
    }).format(new Date(now))

    const manilaTime = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Manila"
    }).format(new Date(now))

    const callerName = callerData.name || decodedToken.name || "Administrator"
    const callerEmail = callerData.email || decodedToken.email || "unknown"
    const callerInitials = callerName.substring(0, 2).toUpperCase()

    const logPayload = {
      actor: {
        id: callerUid,
        name: callerName,
        email: callerEmail,
        role: callerRole,
        initials: callerInitials
      },
      admin: {
        name: callerName,
        email: callerEmail,
        initials: callerInitials,
        color: callerRole.toLowerCase().includes("super") ? "#d97706" : "#2563eb"
      },
      role: callerRole,
      action: action.trim(),
      actionType: (actionType || action).trim(),
      details: details.trim(),
      targetId: targetId || null,
      targetName: targetName || null,
      targetCollection: targetCollection || null,
      ipAddress: clientIp, // Real server-captured IP
      timestamp: now,
      date: manilaDate,
      time: manilaTime,
      createdAt: now
    }

    const docRef = await adminDb.collection(COLLECTION_ACTIVITY_LOGS).add(logPayload)

    return NextResponse.json({
      success: true,
      logId: docRef.id,
      ipAddress: clientIp
    })
  } catch (error: any) {
    console.error("Audit log route error:", error)
    return NextResponse.json({ error: error.message || "Failed to author audit log" }, { status: 500 })
  }
}
