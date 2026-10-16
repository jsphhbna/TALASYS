import { NextResponse } from "next/server.js"
import { adminAuth, adminDb } from "../../../../../lib/firebase-admin.ts"
import { COLLECTION_DOCUMENT_REQUESTS, COLLECTION_NOTIFICATIONS, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID } from "../../../../../lib/constants.ts"
import { parseCloudinaryAsset } from "../../../../../lib/security/media-auth.ts"

function isOwnedProtectedAsset(url: unknown, residentId: string, folder: "talasys/receipts" | "talasys/letters"): boolean {
  if (typeof url !== "string") return false
  const parsed = parseCloudinaryAsset(url)
  const expectedCloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
  return !!expectedCloud && parsed.cloudName === expectedCloud && parsed.deliveryType === "authenticated" && parsed.publicId.startsWith(`${folder}/${residentId}/`)
}

export function resolveConfiguredDocument(config: Record<string, any>, documentType: string, residentStatuses: string[]) {
  const enabled = Array.isArray(config.documentTypes) ? config.documentTypes : []
  const custom = Array.isArray(config.customDocumentTypes) ? config.customDocumentTypes : []
  if (!enabled.includes(documentType)) throw Object.assign(new Error("Document type is disabled or unknown."), { status: 400 })
  const customEntry = custom.find((entry: any) => entry?.name === documentType)
  const configuredFee = config.documentFees?.[documentType] ?? customEntry?.fee
  if (typeof configuredFee !== "number" || !Number.isFinite(configuredFee) || configuredFee < 0) throw Object.assign(new Error("Document fee configuration is missing or invalid."), { status: 503 })
  let fee = configuredFee
  const policy = config.feeWaiverPolicy
  if (policy?.enabled === true && Array.isArray(policy.documentTypes) && policy.documentTypes.includes(documentType) && Array.isArray(policy.eligibleStatuses)) {
    const normalized = residentStatuses.map(status => status.toLowerCase())
    if (policy.eligibleStatuses.some((status: unknown) => typeof status === "string" && normalized.includes(status.toLowerCase()))) fee = 0
  }
  const id = typeof customEntry?.id === "string" && customEntry.id ? customEntry.id : documentType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return { id, name: documentType, fee }
}

export function createResidentRequestHandler(injected?: { auth?: any; db?: any }) {
  return async function POST(req: Request) {
    const auth = injected?.auth || adminAuth
    const db = injected?.db || adminDb
    try {
      // Fail closed if Firebase Admin is unconfigured on the server (#56)
      if (!auth || !db) {
        return NextResponse.json(
          { error: "Server request processing service is unavailable. Missing Firebase Admin configuration." },
          { status: 503 }
        )
      }

      const authHeader = req.headers.get("authorization") || req.headers.get("Authorization")
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Missing or invalid authorization token." }, { status: 401 })
      }

      const token = authHeader.replace("Bearer ", "").trim()
      let decodedToken: any
      try {
        decodedToken = await auth.verifyIdToken(token, true)
      } catch {
        return NextResponse.json({ error: "Session invalid or expired. Please sign in again." }, { status: 401 })
      }

      const callerUid = decodedToken.uid

      // Authoritative caller account lookup in Firestore `users` collection (#56)
      const callerDoc = await db.collection("users").doc(callerUid).get()
    if (!callerDoc.exists) {
      return NextResponse.json({ error: "Resident account record not found in system." }, { status: 403 })
    }

    const callerData = callerDoc.data() || {}
    const callerRole = callerData.role as string | undefined
    const callerStatus = callerData.status as string | undefined
    const isVerified = Boolean(callerData.isVerified)

    // Reject non-residents, locked, or deleted accounts
    if (callerRole !== "resident") {
      return NextResponse.json({ error: "Only residents may submit document requests." }, { status: 403 })
    }

    if (callerData.registrationDenied || Boolean(callerData.deniedAt) || callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerStatus === "Expired") {
      return NextResponse.json({ error: "Account is inactive, expired, locked, or registration was denied. Document requests forbidden." }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const {
      documentType,
      purpose,
      requestFor = "myself",
      requestedByName,
      requestedByContact,
      relationship,
      authorizationLetter,
      paymentMethod = "cash",
      gcashRefNumber,
      gcashScreenshotUrl,
      idempotencyKey,
    } = body
    const additionalDetails = typeof body.additionalDetails === "string" && body.additionalDetails.trim() ? body.additionalDetails.trim().slice(0, 1000) : undefined

    if (!documentType || typeof documentType !== "string") {
      return NextResponse.json({ error: "Invalid or unsupported document type requested." }, { status: 400 })
    }
    if (typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey)) {
      return NextResponse.json({ error: "A valid idempotencyKey is required." }, { status: 400 })
    }

    if (!purpose || typeof purpose !== "string" || purpose.trim().length === 0) {
      return NextResponse.json({ error: "Purpose of request is required." }, { status: 400 })
    }

    // Check account verification requirement for official barangay documents
    if (!isVerified) {
      return NextResponse.json(
        { error: "Your resident account must be verified before requesting official documents. Please complete identity verification first." },
        { status: 403 }
      )
    }

    // Validation for requests made on behalf of another person
    if (requestFor === "other") {
      if (!requestedByName || typeof requestedByName !== "string" || !requestedByName.trim()) {
        return NextResponse.json({ error: "Full name of the person represented is required." }, { status: 400 })
      }
      if (!relationship || typeof relationship !== "string" || !relationship.trim()) {
        return NextResponse.json({ error: "Relationship to the person is required." }, { status: 400 })
      }
      if (!authorizationLetter || typeof authorizationLetter !== "string") {
        return NextResponse.json({ error: "An authorization letter is mandatory when requesting for another individual." }, { status: 400 })
      }
      if (!isOwnedProtectedAsset(authorizationLetter, callerUid, "talasys/letters")) {
        return NextResponse.json({ error: "Authorization letter is not an authenticated asset owned by this resident." }, { status: 400 })
      }
    }
    const expiry = callerData.accountExpiry ? new Date(callerData.accountExpiry).getTime() : NaN
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return NextResponse.json({ error: "Resident verification has expired. Reactivate the account before requesting documents." }, { status: 403 })
    }

    if (gcashScreenshotUrl && !isOwnedProtectedAsset(gcashScreenshotUrl, callerUid, "talasys/receipts")) {
      return NextResponse.json({ error: "Payment screenshot is not an authenticated asset owned by this resident." }, { status: 400 })
    }

    const configDoc = await adminDb.collection(COLLECTION_SYSTEM_CONFIG).doc(SYSTEM_CONFIG_DOCUMENT_ID).get()
    if (!configDoc.exists) return NextResponse.json({ error: "Document request configuration is unavailable." }, { status: 503 })
    const residentStatuses: string[] = Array.isArray(callerData.statuses) ? callerData.statuses : (callerData.status ? [callerData.status] : [])
    let configuredDocument
    try { configuredDocument = resolveConfiguredDocument(configDoc.data() || {}, documentType, residentStatuses) }
    catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }) }
    const authoritativeFee = configuredDocument.fee

    // Authoritative initial payment state
    const requiresPayment = authoritativeFee > 0
    let paymentStatus: "unpaid" | "pending_verification" | "waived"
    let effectivePaymentMethod: "gcash" | "cash" | null = null
    let paymentRefNumber: string | null = null

    const requestYear = new Date().getFullYear()
    const now = Date.now()

    if (!requiresPayment) {
      paymentStatus = "waived"
      effectivePaymentMethod = null
      paymentRefNumber = null
    } else {
      effectivePaymentMethod = paymentMethod === "gcash" ? "gcash" : "cash"
      paymentRefNumber = `PAY-${requestYear}-${now.toString().slice(-5)}`

      if (effectivePaymentMethod === "gcash" && gcashRefNumber) {
        paymentStatus = "pending_verification"
      } else {
        paymentStatus = "unpaid"
      }
    }

    const refNumber = `REQ-${requestYear}-${Math.floor(100 + Math.random() * 900).toString()}`
    const manilaDate = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(new Date(now))

    const requestPayload = {
      residentId: callerUid,
      residentName: callerData.name || "Resident",
      residentInitials: callerData.initials || "R",
      residentCategory: callerData.status || "Resident",
      refNumber,
      documentType,
      documentTypeId: configuredDocument.id,
      dateRequested: manilaDate,
      status: "Pending",
      purpose: purpose.trim(),
      createdAt: now,
      statusTimestamps: { Pending: now },
      documentFee: authoritativeFee, // Authoritative server-derived fee
      paymentStatus, // Authoritative initial payment state
      paymentMethod: effectivePaymentMethod,
      paymentReferenceNumber: paymentRefNumber,
      idempotencyKey,
      ...(additionalDetails ? { additionalDetails } : {}),
      ...(gcashRefNumber ? { gcashRefNumber } : {}),
      ...(gcashScreenshotUrl ? { gcashScreenshotUrl } : {}),
      ...(requestFor === "other"
        ? {
            requestFor: "other",
            requestedByName: requestedByName.trim(),
            requestedByContact: (requestedByContact || "").trim(),
            relationship: relationship.trim(),
            authorizationLetter,
          }
        : { requestFor: "myself" }),
    }

    const docRef = adminDb.collection(COLLECTION_DOCUMENT_REQUESTS).doc(`req_${callerUid}_${idempotencyKey}`)
    const notificationRef = adminDb.collection(COLLECTION_NOTIFICATIONS).doc(`request_${callerUid}_${idempotencyKey}`)
    const stored = await adminDb.runTransaction(async (transaction: any) => {
      const existing = await transaction.get(docRef)
      if (existing.exists) return { idempotent: true, data: existing.data() }
      if (requestFor === "myself") {
        const activeQuery = adminDb.collection(COLLECTION_DOCUMENT_REQUESTS).where("residentId", "==", callerUid).where("documentTypeId", "==", configuredDocument.id).where("status", "==", "Pending")
        const active = await transaction.get(activeQuery)
        if (!active.empty) throw Object.assign(new Error(`You already have an active pending request for ${documentType}.`), { status: 409 })
      }
      transaction.create(docRef, requestPayload)
      transaction.create(notificationRef, {
      targetId: "admin",
      type: "info",
      title: "New Document Request",
      message: `${callerData.name || "A resident"} requested a ${documentType}.`,
      timestamp: "Just now",
      isRead: false,
      createdAt: now,
      residentName: callerData.name || "Resident",
      actionUrl: "/admin/requests",
      operationId: idempotencyKey,
      })
      return { idempotent: false, data: requestPayload }
    })

    return NextResponse.json({
      success: true,
      id: docRef.id,
      idempotent: stored.idempotent,
      request: { id: docRef.id, ...stored.data },
    })
  } catch (error: any) {
    console.error("Failed to create document request:", error)
    return NextResponse.json({ error: error.message || "Failed to submit document request" }, { status: error.status || 500 })
  }
}
}

export const POST = createResidentRequestHandler()
