import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { inspectRegistrationStatus } from "../../../../../lib/security/registration-status.ts"

export function createRegistrationStatusHandler(injected?: { auth?: any; db?: any }) {
  return async function GET(request: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb

      if (!auth || !db) {
        return NextResponse.json(
          { success: false, error: "Server registration status service is unavailable." },
          { status: 503 },
        )
      }

      const authorization = request.headers.get("authorization") || request.headers.get("Authorization")
      if (!authorization?.startsWith("Bearer ")) {
        return NextResponse.json(
          { success: false, error: "A valid authentication token is required." },
          { status: 401 },
        )
      }

      const idToken = authorization.slice(7).trim()
      let decoded: any
      try {
        decoded = await auth.verifyIdToken(idToken, true)
      } catch {
        return NextResponse.json(
          { success: false, error: "The authentication session is invalid or revoked." },
          { status: 401 },
        )
      }

      if (typeof decoded?.uid !== "string" || !decoded.uid) {
        return NextResponse.json(
          { success: false, error: "The authentication session has no user identity." },
          { status: 401 },
        )
      }

      let authUser: any
      try {
        authUser = await auth.getUser(decoded.uid)
      } catch {
        return NextResponse.json(
          { success: false, error: "The authenticated account could not be verified." },
          { status: 503 },
        )
      }

      const authEmail = typeof authUser?.email === "string" ? authUser.email.trim().toLowerCase() : ""
      const url = new URL(request.url)
      const operationId = url.searchParams.get("operationId")

      const result = await inspectRegistrationStatus(
        decoded.uid,
        authEmail,
        authUser?.emailVerified ?? false,
        { db, operationId },
      )

      return NextResponse.json({ success: true, ...result })
    } catch (error: any) {
      console.error("Registration status check failed:", error)
      return NextResponse.json(
        { success: false, error: error?.message || "Failed to check registration status." },
        { status: 500 },
      )
    }
  }
}

export const GET = createRegistrationStatusHandler()
