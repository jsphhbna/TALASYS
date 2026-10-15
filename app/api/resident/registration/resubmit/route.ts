import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { processRegistrationResubmission } from "../../../../../lib/security/registration-resubmission.ts"

export function createRegistrationResubmissionHandler(injected?: { auth?: any; db?: any }) {
  return async function POST(request: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb

      if (!auth || !db) {
        return NextResponse.json(
          { success: false, error: "Server registration resubmission service is unavailable." },
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

      const body = await request.json().catch(() => ({}))
      const result = await processRegistrationResubmission(body, decoded.uid, { db })

      return NextResponse.json(result)
    } catch (error: any) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      return NextResponse.json(
        {
          success: false,
          code: error?.code || "RESUBMISSION_FAILED",
          error: error?.message || "Registration resubmission failed.",
        },
        { status },
      )
    }
  }
}

export const POST = createRegistrationResubmissionHandler()
