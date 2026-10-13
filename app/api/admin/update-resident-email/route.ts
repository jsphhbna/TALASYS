import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { isAnyAdminRole } from "@/lib/auth/auth-types"

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "").trim()

    if (!adminAuth) {
      return NextResponse.json({ 
        warning: "Admin Auth not configured on this environment",
        synced: false 
      }, { status: 200 })
    }

    const decodedToken = await adminAuth.verifyIdToken(token)
    
    // Verify caller has administrative privileges
    let callerRole = decodedToken.role as string | undefined
    if (!callerRole && adminDb) {
      const adminDoc = await adminDb.collection("admins").doc(decodedToken.uid).get()
      if (adminDoc.exists) {
        callerRole = adminDoc.data()?.role
      }
    }

    if (!callerRole || !isAnyAdminRole(callerRole)) {
      return NextResponse.json({ error: "Unauthorized administrative access" }, { status: 403 })
    }

    const body = await req.json()
    const { residentId, newEmail } = body

    if (!residentId || !newEmail || !newEmail.includes("@")) {
      return NextResponse.json({ error: "Invalid resident ID or email address" }, { status: 400 })
    }

    // 1. Update Firebase Auth identity email
    await adminAuth.updateUser(residentId, { email: newEmail })

    // 2. Update Firestore user document
    if (adminDb) {
      await adminDb.collection("users").doc(residentId).update({
        email: newEmail,
        updatedAt: Date.now()
      })
    }

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
