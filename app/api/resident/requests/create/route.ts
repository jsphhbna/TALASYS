import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase-admin"
import { COLLECTION_DOCUMENT_REQUESTS, COLLECTION_NOTIFICATIONS, COLLECTION_SYSTEM_CONFIG, SYSTEM_CONFIG_DOCUMENT_ID } from "@/lib/constants"

// Statutory and standard baseline fees
const STANDARD_DOCUMENT_FEES: Record<string, number> = {
  "Barangay Clearance": 50,
  "Certificate of Indigency": 0, // Free by law
  "Certificate of Residency": 50,
  "Barangay ID": 100,
  "Business Permit / Clearance": 200,
  "First Time Jobseeker Certificate": 0, // Free under RA 11261
}

const STATUTORY_FREE_DOCUMENTS = new Set([
  "Certificate of Indigency",
  "First Time Jobseeker Certificate",
])

export async function POST(req: Request) {
  try {
    // Fail closed if Firebase Admin is unconfigured on the server (#56)
    if (!adminAuth || !adminDb) {
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
      decodedToken = await adminAuth.verifyIdToken(token, true)
    } catch {
      return NextResponse.json({ error: "Session invalid or expired. Please sign in again." }, { status: 401 })
    }

    const callerUid = decodedToken.uid

    // Authoritative caller account lookup in Firestore `users` collection (#56)
    const callerDoc = await adminDb.collection("users").doc(callerUid).get()
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

    if (callerStatus === "Locked" || callerStatus === "Deleted" || callerStatus === "Deleted by Resident" || callerStatus === "Expired") {
      return NextResponse.json({ error: "Account is inactive, expired, or locked. Document requests forbidden." }, { status: 403 })
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
    } = body

    if (!documentType || typeof documentType !== "string" || !(documentType in STANDARD_DOCUMENT_FEES)) {
      return NextResponse.json({ error: "Invalid or unsupported document type requested." }, { status: 400 })
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
    }

    // Duplicate check for active pending request of the same document type
    if (requestFor === "myself") {
      const activePendingSnap = await adminDb
        .collection(COLLECTION_DOCUMENT_REQUESTS)
        .where("residentId", "==", callerUid)
        .where("documentType", "==", documentType)
        .where("status", "==", "Pending")
        .get()

      if (!activePendingSnap.empty) {
        return NextResponse.json(
          { error: `You already have an active pending request for ${documentType}. Please wait for it to be processed.` },
          { status: 409 }
        )
      }
    }

    // Authoritatively derive document fee from system configuration and statutory policy (#56)
    // NEVER accept client-supplied documentFee or forged waivers!
    let authoritativeFee = STANDARD_DOCUMENT_FEES[documentType]

    const configDoc = await adminDb.collection(COLLECTION_SYSTEM_CONFIG).doc(SYSTEM_CONFIG_DOCUMENT_ID).get()
    if (configDoc.exists) {
      const configFees = configDoc.data()?.documentFees
      if (configFees && typeof configFees[documentType] === "number") {
        authoritativeFee = configFees[documentType]
      }
    }

    // Statutory exemptions: Indigency & First Time Jobseekers are legally guaranteed free
    if (STATUTORY_FREE_DOCUMENTS.has(documentType)) {
      authoritativeFee = 0
    }

    // Check indigent resident category demographic waiver
    const residentStatuses: string[] = Array.isArray(callerData.statuses) ? callerData.statuses : (callerData.status ? [callerData.status] : [])
    const isIndigent = residentStatuses.some(s => typeof s === "string" && s.toLowerCase().includes("indigent"))
    if (isIndigent && (documentType === "Barangay Clearance" || documentType === "Certificate of Residency")) {
      authoritativeFee = 0
    }

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
      dateRequested: manilaDate,
      status: "Pending",
      purpose: purpose.trim(),
      createdAt: now,
      statusTimestamps: { Pending: now },
      documentFee: authoritativeFee, // Authoritative server-derived fee
      paymentStatus, // Authoritative initial payment state
      paymentMethod: effectivePaymentMethod,
      paymentReferenceNumber: paymentRefNumber,
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

    const docRef = await adminDb.collection(COLLECTION_DOCUMENT_REQUESTS).add(requestPayload)

    // Create administrative notification
    await adminDb.collection(COLLECTION_NOTIFICATIONS).add({
      targetId: "admin",
      type: "info",
      title: "New Document Request",
      message: `${callerData.name || "A resident"} requested a ${documentType}.`,
      timestamp: "Just now",
      isRead: false,
      createdAt: now,
      residentName: callerData.name || "Resident",
      actionUrl: "/admin/requests",
    })

    return NextResponse.json({
      success: true,
      id: docRef.id,
      request: { id: docRef.id, ...requestPayload },
    })
  } catch (error: any) {
    console.error("Failed to create document request:", error)
    return NextResponse.json({ error: error.message || "Failed to submit document request" }, { status: 500 })
  }
}
