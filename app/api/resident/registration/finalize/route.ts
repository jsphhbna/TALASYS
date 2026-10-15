import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { createCloudinaryAssetVerifier } from "../../../media/claim/route.ts"
import {
  finalizeResidentRegistration,
  type RegistrationFinalizationDependencies,
} from "../../../../../lib/security/registration-finalization.ts"
import { registrationHttpError } from "../../../../../lib/security/registration-media-claim.ts"

type HandlerDependencies = Partial<RegistrationFinalizationDependencies>

export function createRegistrationFinalizationHandler(injected?: HandlerDependencies) {
  return async function POST(request: Request) {
    try {
      const auth = injected?.auth || adminAuth
      const db = injected?.db || adminDb
      const cloudName = injected?.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
      if (!auth || !db || !cloudName) {
        throw registrationHttpError("Server registration finalization is unavailable.", 503, "FINALIZATION_UNAVAILABLE")
      }
      const authorization = request.headers.get("authorization") || request.headers.get("Authorization")
      if (!authorization?.startsWith("Bearer ")) {
        throw registrationHttpError("A valid authentication token is required.", 401, "AUTH_REQUIRED")
      }
      let decoded: any
      try {
        decoded = await auth.verifyIdToken(authorization.slice(7).trim(), true)
      } catch {
        throw registrationHttpError("The authentication session is invalid or revoked.", 401, "AUTH_INVALID")
      }
      if (typeof decoded?.uid !== "string" || !decoded.uid) {
        throw registrationHttpError("The authentication session has no user identity.", 401, "AUTH_INVALID")
      }
      let authUser: any
      try { authUser = await auth.getUser(decoded.uid) }
      catch { throw registrationHttpError("The authenticated account could not be verified.", 503, "AUTH_LOOKUP_FAILED") }
      const authEmail = typeof authUser?.email === "string" ? authUser.email.trim().toLowerCase() : ""
      if (!authEmail) throw registrationHttpError("The authenticated account has no email address.", 400, "AUTH_EMAIL_REQUIRED")

      const body = await request.json().catch(() => ({}))
      const result = await finalizeResidentRegistration(body, decoded.uid, authEmail, {
        db,
        cloudName,
        now: injected?.now || Date.now,
        verifyAsset: injected?.verifyAsset || createCloudinaryAssetVerifier(),
      })
      return NextResponse.json({ success: true, committed: true, ...result })
    } catch (error: any) {
      const status = Number.isInteger(error?.status) ? error.status : 500
      return NextResponse.json({
        success: false,
        committed: error?.committed === false ? false : "unknown",
        code: error?.code || "FINALIZATION_FAILED",
        error: error?.message || "Registration finalization failed.",
      }, { status })
    }
  }
}

export const POST = createRegistrationFinalizationHandler()
