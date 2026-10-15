import { randomUUID } from "node:crypto"
import { calculateAge } from "../resident/resident-status.ts"
import { registrationHttpError } from "./registration-media-claim.ts"
import { registrationOperationDocumentId } from "./registration-finalization.ts"

export type RegistrationResubmissionProof = {
  name: string
  url: string
  filename?: string
}

export type RegistrationResubmissionInput = {
  operationId?: string
  proofs: RegistrationResubmissionProof[]
  reason?: string
}

export async function processRegistrationResubmission(
  body: unknown,
  callerUid: string,
  dependencies: {
    db: any
    now?: () => number
  },
) {
  const { db } = dependencies
  const now = dependencies.now ? dependencies.now() : Date.now()

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw registrationHttpError("Resubmission payload must be an object.", 400, "INVALID_RESUBMISSION_PAYLOAD")
  }
  const payload = body as Record<string, unknown>

  // Validate proofs
  if (!Array.isArray(payload.proofs) || payload.proofs.length === 0 || payload.proofs.length > 10) {
    throw registrationHttpError("At least one proof document is required.", 400, "INVALID_PROOFS")
  }
  const proofs: RegistrationResubmissionProof[] = []
  for (let i = 0; i < payload.proofs.length; i++) {
    const item = payload.proofs[i]
    if (!item || typeof item !== "object") {
      throw registrationHttpError(`Proof ${i + 1} is invalid.`, 400, "INVALID_PROOFS")
    }
    const name = typeof item.name === "string" ? item.name.trim() : ""
    const url = typeof item.url === "string" ? item.url.trim() : ""
    const filename = typeof item.filename === "string" ? item.filename.trim() : name
    if (!name || !url) {
      throw registrationHttpError(`Proof ${i + 1} must include a valid name and URL.`, 400, "INVALID_PROOFS")
    }
    proofs.push({ name, url, filename })
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : ""
  const operationId = typeof payload.operationId === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(payload.operationId)
    ? payload.operationId
    : randomUUID()

  // 1. Idempotency check if operationId is supplied
  const operationRef = db.collection("registrationOperations").doc(registrationOperationDocumentId(callerUid, operationId))
  const existingOp = await operationRef.get()
  if (existingOp.exists) {
    const opData = existingOp.data() || {}
    if (opData.status === "completed" && opData.verificationId) {
      return { success: true, idempotent: true, verificationId: opData.verificationId }
    }
  }

  // 2. Authoritative resident validation
  const userRef = db.collection("users").doc(callerUid)
  const userDoc = await userRef.get()
  if (!userDoc.exists) {
    throw registrationHttpError("Resident account profile does not exist.", 404, "RESIDENT_NOT_FOUND")
  }
  const userData = userDoc.data() || {}
  if (userData.role !== "resident") {
    throw registrationHttpError("Only residents may submit registration verification.", 403, "FORBIDDEN_ROLE")
  }
  const status = userData.status || "Pending"
  if (status === "Locked" || status === "Deleted" || status === "Deleted by Resident") {
    throw registrationHttpError("Account is inactive or locked.", 403, "ACCOUNT_INACTIVE")
  }
  if (userData.isVerified === true) {
    throw registrationHttpError("Verified residents cannot resubmit initial registration. Use profile edit instead.", 400, "ALREADY_VERIFIED")
  }

  // 3. Inspect existing verifications for this resident
  const verificationsQuery = await db
    .collection("verifications")
    .where("residentId", "==", callerUid)
    .get()

  const verifications = verificationsQuery.docs.map((d: any) => ({ id: d.id, ...d.data() }))
  verifications.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))

  // Reject if a verification is already pending
  const hasPending = verifications.some((v: any) => v.status === "pending")
  if (hasPending) {
    throw registrationHttpError("A verification request is already pending review.", 409, "PENDING_VERIFICATION_EXISTS")
  }

  // Require that at least one previous registration verification was rejected
  const hasRejectedRegistration = verifications.some(
    (v: any) => v.type === "registration" && v.status === "rejected",
  )
  if (!hasRejectedRegistration) {
    throw registrationHttpError("Only rejected registrations are eligible for resubmission.", 400, "NOT_ELIGIBLE_FOR_RESUBMISSION")
  }

  // 4. Atomic transaction to create verification, notification, and operation record
  const newVerificationRef = db.collection("verifications").doc(`resubmit-${randomUUID()}`)
  const newNotificationRef = db.collection("notifications").doc(`resubmit-${randomUUID()}`)
  const submittedDate = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(now))

  await db.runTransaction(async (transaction: any) => {
    // Re-verify user within transaction
    const txUserDoc = await transaction.get(userRef)
    if (!txUserDoc.exists || txUserDoc.data()?.isVerified === true) {
      throw registrationHttpError("Resident status changed during submission.", 409, "CONCURRENT_MODIFICATION")
    }

    transaction.create(newVerificationRef, {
      residentId: callerUid,
      userId: callerUid,
      name: userData.name,
      initials: userData.initials,
      type: "registration",
      submittedDate,
      categories: userData.statuses || ["Resident"],
      gender: userData.gender || "",
      age: userData.dateOfBirth ? (calculateAge(userData.dateOfBirth, now) ?? 0) : 0,
      address: userData.address || "",
      contactNumber: userData.contactNumber || "",
      email: userData.email,
      dateOfBirth: userData.dateOfBirth || "",
      documents: proofs.map((p) => ({
        name: p.name,
        url: p.url,
        filename: p.filename,
        status: "pending",
        uploadDate: submittedDate,
      })),
      reason: reason || "Registration verification resubmission with updated documents",
      status: "pending",
      createdAt: now,
      operationId,
    })

    transaction.create(newNotificationRef, {
      targetId: "admin",
      type: "registration",
      title: "Registration Verification Resubmission",
      message: `${userData.name} resubmitted registration verification with updated documents.`,
      timestamp: "Just now",
      isRead: false,
      createdAt: now,
      residentName: userData.name,
      actionUrl: "/admin/verifications",
      verificationId: newVerificationRef.id,
      operationId,
    })

    transaction.create(operationRef, {
      uid: callerUid,
      operationId,
      status: "completed",
      verificationId: newVerificationRef.id,
      createdAt: now,
      completedAt: now,
    })
  })

  return {
    success: true,
    idempotent: false,
    verificationId: newVerificationRef.id,
  }
}
