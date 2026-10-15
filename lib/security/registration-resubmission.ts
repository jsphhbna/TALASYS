import { createHash, randomUUID } from "node:crypto"
import { getRequiredDocuments } from "../resident/resident-documents.ts"
import { calculateAge } from "../resident/resident-status.ts"
import { mediaRegistryDocumentId, parseCloudinaryAsset } from "./media-auth.ts"
import {
  registrationCapabilityMatches,
  registrationHttpError,
  type RegistrationAssetIdentity,
} from "./registration-media-claim.ts"
import { registrationOperationDocumentId } from "./registration-finalization.ts"

export type RegistrationResubmissionProof = {
  name: string
  url: string
  filename?: string
  claimToken?: string
}

export type RegistrationResubmissionInput = {
  operationId?: string
  proofs: RegistrationResubmissionProof[]
  reason?: string
}

export type RegistrationResubmissionDependencies = {
  db: any
  cloudName?: string
  now?: () => number
  verifyAsset?: (asset: RegistrationAssetIdentity) => Promise<void>
}

export function normalizeDocumentTitle(title: string): string {
  const t = title.trim().toLowerCase()
  if (t === "valid id" || t === "valid government id") return "Valid Government ID"
  if (t === "parent's id" || t === "parent id" || t === "school id" || t === "school id or parent's valid id") return "School ID or Parent's Valid ID"
  if (t === "senior citizen id" || t === "senior id") return "Senior Citizen ID"
  if (t === "voter's id" || t === "voters id" || t === "voter's certificate" || t === "voter's id / certificate" || t === "voter's id or certification") return "Voter's ID / Certificate"
  return title.trim()
}

export function canonicalResubmissionPayloadHash(
  callerUid: string,
  proofs: Array<{ name: string; filename?: string; url: string; asset: RegistrationAssetIdentity }>,
  reason: string,
) {
  const canonical = {
    callerUid,
    reason: reason.trim(),
    proofs: proofs
      .map(p => ({
        name: normalizeDocumentTitle(p.name),
        filename: p.filename || p.name,
        cloudName: p.asset.cloudName,
        resourceType: p.asset.resourceType,
        deliveryType: p.asset.deliveryType,
        publicId: p.asset.publicId,
      }))
      .sort((a, b) => a.publicId.localeCompare(b.publicId)),
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export function parseResubmissionProof(
  item: RegistrationResubmissionProof,
  callerUid: string,
  expectedCloudName: string,
): { name: string; filename: string; url: string; claimToken?: string; asset: RegistrationAssetIdentity } {
  const name = typeof item.name === "string" ? item.name.trim() : ""
  const url = typeof item.url === "string" ? item.url.trim() : ""
  const filename = typeof item.filename === "string" && item.filename.trim() ? item.filename.trim() : name
  const claimToken = typeof item.claimToken === "string" && item.claimToken.trim() ? item.claimToken.trim() : undefined

  if (!name || !url) {
    throw registrationHttpError("Each proof document must include a valid name and URL.", 400, "INVALID_PROOFS")
  }

  const parsed = parseCloudinaryAsset(url)
  const publicId = parsed.publicId.replace(/^\//, "")

  if (!parsed.cloudName || (expectedCloudName && parsed.cloudName !== expectedCloudName)) {
    throw registrationHttpError("Media claim cloud does not match the configured cloud environment.", 403, "PROOF_IDENTITY_MISMATCH")
  }
  if (parsed.deliveryType !== "authenticated") {
    throw registrationHttpError("Only protected authenticated assets may be submitted as verification proofs.", 403, "PROOF_IDENTITY_MISMATCH")
  }
  if (!(["image", "video", "raw"] as const).includes(parsed.resourceType)) {
    throw registrationHttpError("Unsupported media resource type.", 400, "INVALID_PROOF")
  }

  const isResidentOwnedNamespace = publicId.startsWith(`talasys/proofs/${callerUid}/`)
  const isRegistrationNamespace = publicId.startsWith("talasys/proofs/registration/")

  if (!isResidentOwnedNamespace && !isRegistrationNamespace) {
    throw registrationHttpError("Media claim is outside the allowed proof namespace.", 403, "PROOF_IDENTITY_MISMATCH")
  }

  const effectiveCloudName = parsed.cloudName || expectedCloudName
  const asset: RegistrationAssetIdentity = {
    cloudName: effectiveCloudName,
    publicId,
    resourceType: parsed.resourceType,
    deliveryType: "authenticated",
    registryId: mediaRegistryDocumentId(effectiveCloudName, parsed.resourceType, publicId),
    capability: claimToken,
  }

  return { name, filename, url, claimToken, asset }
}

export async function processRegistrationResubmission(
  body: unknown,
  callerUid: string,
  dependencies: RegistrationResubmissionDependencies,
) {
  const { db } = dependencies
  const cloudName = dependencies.cloudName || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || ""
  const now = dependencies.now ? dependencies.now() : Date.now()

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw registrationHttpError("Resubmission payload must be an object.", 400, "INVALID_RESUBMISSION_PAYLOAD")
  }
  const payload = body as Record<string, unknown>

  // Validate proofs input
  if (!Array.isArray(payload.proofs) || payload.proofs.length === 0 || payload.proofs.length > 4) {
    throw registrationHttpError("Between 1 and 4 proof documents are required.", 400, "INVALID_PROOFS")
  }

  const normalizedProofs = payload.proofs.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw registrationHttpError(`Proof ${index + 1} is invalid.`, 400, "INVALID_PROOFS")
    }
    return parseResubmissionProof(item as RegistrationResubmissionProof, callerUid, cloudName)
  })

  // Check for duplicate proof assets
  const registryIds = new Set(normalizedProofs.map(p => p.asset.registryId))
  if (registryIds.size !== normalizedProofs.length) {
    throw registrationHttpError("Duplicate registration proofs are not allowed.", 400, "INVALID_PROOF")
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : ""
  const operationId = typeof payload.operationId === "string" && /^[A-Za-z0-9_-]{16,80}$/.test(payload.operationId)
    ? payload.operationId
    : randomUUID()

  const payloadHash = canonicalResubmissionPayloadHash(callerUid, normalizedProofs, reason)

  // 1. Idempotency preflight check
  const operationRef = db.collection("registrationOperations").doc(registrationOperationDocumentId(callerUid, operationId))
  const existingOp = await operationRef.get()
  if (existingOp.exists) {
    const opData = existingOp.data() || {}
    if (
      opData.uid !== callerUid ||
      opData.operationId !== operationId ||
      (opData.operationType && opData.operationType !== "registration-resubmission") ||
      (opData.targetId && opData.targetId !== callerUid) ||
      opData.payloadHash !== payloadHash
    ) {
      throw registrationHttpError("This resubmission operation was already used with different parameters.", 409, "IDEMPOTENCY_CONFLICT", "unknown")
    }
    if (opData.status === "completed" && opData.verificationId) {
      return { success: true, idempotent: true, verificationId: opData.verificationId }
    }
    throw registrationHttpError("Resubmission operation is in an inconsistent state.", 409, "OPERATION_STATE_CONFLICT", "unknown")
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
  if (status === "Active" || userData.isVerified === true) {
    throw registrationHttpError("Verified residents cannot resubmit initial registration. Use profile edit instead.", 400, "ALREADY_VERIFIED")
  }
  if (status === "Expired") {
    throw registrationHttpError("Expired accounts must submit a reactivation request, not initial registration resubmission.", 400, "EXPIRED_ACCOUNT")
  }
  if (status === "Locked" || status === "Deleted" || status === "Deleted by Resident") {
    throw registrationHttpError("Account is inactive or locked.", 403, "ACCOUNT_INACTIVE")
  }
  if (status !== "Pending") {
    throw registrationHttpError("Account is not in a pending verification state.", 400, "INVALID_LIFECYCLE_STATE")
  }

  // Validate required documents against resident classifications
  const residentStatuses = Array.isArray(userData.statuses) && userData.statuses.length > 0 ? userData.statuses : ["Adult"]
  const requiredConfigs = getRequiredDocuments(residentStatuses, "register")
  const requiredTitles = new Set(requiredConfigs.map(c => normalizeDocumentTitle(c.title)))
  const suppliedTitles = new Set(normalizedProofs.map(p => normalizeDocumentTitle(p.name)))

  if (requiredTitles.size !== suppliedTitles.size || [...requiredTitles].some(req => !suppliedTitles.has(req))) {
    throw registrationHttpError("The submitted proof documents do not match the required documents for your resident classifications.", 400, "REQUIRED_PROOF_MISMATCH")
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

  // 4. Preflight media reservations and verify assets with provider
  const assets = normalizedProofs.map(p => p.asset)
  const mediaSnapshots = await Promise.all(
    assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId).get()),
  )

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i]
    const snap = mediaSnapshots[i]
    if (!snap.exists) {
      throw registrationHttpError("Media reservation was not found.", 404, "PROOF_RESERVATION_NOT_FOUND")
    }
    const reg = snap.data() || {}
    const exactIdentity = reg.cloudName === asset.cloudName &&
      reg.resourceType === asset.resourceType &&
      reg.deliveryType === asset.deliveryType &&
      reg.publicId === asset.publicId

    if (!exactIdentity) {
      throw registrationHttpError("Media claim does not match its reservation.", 409, "PROOF_IDENTITY_MISMATCH")
    }

    if (reg.ownerUid === callerUid && reg.status === "claimed") {
      // Already owned by caller
    } else if (reg.status === "reserved" && !reg.ownerUid) {
      // Reserved asset: verify capability
      if (!Number.isFinite(reg.expiresAt) || now > Number(reg.expiresAt)) {
        throw registrationHttpError("Media claim capability has expired.", 410, "PROOF_CAPABILITY_EXPIRED")
      }
      if (
        !asset.capability ||
        typeof reg.capabilityHash !== "string" ||
        !registrationCapabilityMatches(asset.capability, reg.capabilityHash)
      ) {
        throw registrationHttpError("Media claim capability is invalid.", 403, "PROOF_CAPABILITY_INVALID")
      }
    } else {
      throw registrationHttpError("Media is already owned by another account.", 409, "PROOF_OWNER_CONFLICT")
    }

    if (dependencies.verifyAsset) {
      try {
        await dependencies.verifyAsset(asset)
      } catch (err) {
        throw registrationHttpError("The uploaded proof could not be verified with the media provider.", 503, "PROVIDER_VERIFICATION_FAILED")
      }
    }
  }

  // 5. Atomic transaction to create verification, notification, lock, and operation record
  const newVerificationRef = db.collection("verifications").doc(`resubmit-${randomUUID()}`)
  const newNotificationRef = db.collection("notifications").doc(`resubmit-${randomUUID()}`)
  const lockRef = db.collection("residentVerificationLocks").doc(callerUid)
  const reservationRefs = assets.map(asset => db.collection("mediaRegistry").doc(asset.registryId))

  const submittedDate = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(now))

  let txResult: { idempotent: boolean }
  try {
    txResult = await db.runTransaction(async (transaction: any) => {
      // Re-check operation within transaction
      const txOpSnap = await transaction.get(operationRef)
      if (txOpSnap.exists) {
        const opData = txOpSnap.data() || {}
        if (
          opData.uid !== callerUid ||
          opData.operationId !== operationId ||
          (opData.operationType && opData.operationType !== "registration-resubmission") ||
          (opData.targetId && opData.targetId !== callerUid) ||
          opData.payloadHash !== payloadHash
        ) {
          throw registrationHttpError("This resubmission operation was already used with different parameters.", 409, "IDEMPOTENCY_CONFLICT", "unknown")
        }
        if (opData.status === "completed" && opData.verificationId) {
          return { idempotent: true }
        }
        throw registrationHttpError("Resubmission operation is in an inconsistent state.", 409, "OPERATION_STATE_CONFLICT", "unknown")
      }

      // Check lock and user within transaction
      const [txLockSnap, txUserSnap, ...txReservationSnaps] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(userRef),
        ...reservationRefs.map(ref => transaction.get(ref)),
      ])

      if (txLockSnap.exists) {
        const lockData = txLockSnap.data() || {}
        if (lockData.activeVerificationStatus === "pending") {
          throw registrationHttpError("A verification request is already pending review.", 409, "PENDING_VERIFICATION_EXISTS", "unknown")
        }
      }

      if (!txUserSnap.exists) {
        throw registrationHttpError("Resident account profile does not exist.", 404, "RESIDENT_NOT_FOUND", "unknown")
      }
      const txUserData = txUserSnap.data() || {}
      if (txUserData.status !== "Pending" || txUserData.isVerified === true) {
        throw registrationHttpError("Resident status changed during submission.", 409, "CONCURRENT_MODIFICATION", "unknown")
      }
      if (txUserData.hasPendingVerification === true) {
        throw registrationHttpError("A verification request is already pending review.", 409, "PENDING_VERIFICATION_EXISTS", "unknown")
      }

      // Claim any unowned reserved assets in transaction
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i]
        const snap = txReservationSnaps[i]
        if (!snap.exists) {
          throw registrationHttpError("Media reservation was not found.", 404, "PROOF_RESERVATION_NOT_FOUND", "unknown")
        }
        const reg = snap.data() || {}
        if (reg.ownerUid === callerUid && reg.status === "claimed") {
          // already claimed
        } else if (reg.status === "reserved" && !reg.ownerUid) {
          transaction.update(reservationRefs[i], {
            ownerUid: callerUid,
            status: "claimed",
            claimedAt: now,
            capabilityHash: null,
            expiresAt: null,
          })
        } else {
          throw registrationHttpError("Media is already owned by another account.", 409, "PROOF_OWNER_CONFLICT", "unknown")
        }
      }

      transaction.create(newVerificationRef, {
        residentId: callerUid,
        userId: callerUid,
        name: txUserData.name,
        initials: txUserData.initials,
        type: "registration",
        submittedDate,
        categories: txUserData.statuses || ["Resident"],
        gender: txUserData.gender || "",
        age: txUserData.dateOfBirth ? (calculateAge(txUserData.dateOfBirth, now) ?? 0) : 0,
        address: txUserData.address || "",
        contactNumber: txUserData.contactNumber || "",
        email: txUserData.email,
        dateOfBirth: txUserData.dateOfBirth || "",
        documents: normalizedProofs.map((p) => ({
          name: normalizeDocumentTitle(p.name),
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
        message: `${txUserData.name} resubmitted registration verification with updated documents.`,
        timestamp: "Just now",
        isRead: false,
        createdAt: now,
        residentName: txUserData.name,
        actionUrl: "/admin/verifications",
        verificationId: newVerificationRef.id,
        operationId,
      })

      transaction.set(lockRef, {
        residentId: callerUid,
        activeVerificationId: newVerificationRef.id,
        activeVerificationStatus: "pending",
        lastOperationId: operationId,
        createdAt: txLockSnap.exists ? (txLockSnap.data()?.createdAt || now) : now,
        updatedAt: now,
      })

      transaction.update(userRef, {
        hasPendingVerification: true,
        pendingVerificationId: newVerificationRef.id,
        updatedAt: now,
      })

      transaction.create(operationRef, {
        uid: callerUid,
        operationId,
        operationType: "registration-resubmission",
        targetId: callerUid,
        payloadHash,
        status: "completed",
        verificationId: newVerificationRef.id,
        proofRegistryIds: assets.map(a => a.registryId),
        createdAt: now,
        completedAt: now,
      })

      return { idempotent: false }
    })
  } catch (error: any) {
    if (error?.committed === false) throw error
    if (error?.status) throw error
    throw Object.assign(new Error("Registration resubmission commit outcome is unknown. Retry the same operation."), {
      status: 503,
      code: "RESUBMISSION_COMMIT_UNKNOWN",
      committed: "unknown",
    })
  }

  return {
    success: true,
    idempotent: txResult.idempotent,
    verificationId: newVerificationRef.id,
  }
}
