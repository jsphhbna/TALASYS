import { createHash } from "node:crypto"
import { getRequiredDocuments } from "../resident/resident-documents.ts"
import { deriveStatusesFromAge } from "../resident/resident-status.ts"
import {
  applyRegistrationClaims,
  parseRegistrationMediaClaim,
  preflightRegistrationAssets,
  registrationHttpError,
  type RegistrationAssetIdentity,
} from "./registration-media-claim.ts"

const ROOT_KEYS = new Set(["operationId", "resident", "proofs"])
const RESIDENT_KEYS = new Set([
  "firstName", "lastName", "middleInitial", "email", "gender", "dateOfBirth",
  "contactNumber", "street", "barangay", "city", "statuses",
])
const PROOF_KEYS = new Set(["name", "filename", "url", "uploadDate", "claimToken"])
const MANUAL_STATUSES = new Set(["Registered Voter"])
const GENDERS = new Set(["Male", "Female", "Other"])

export type RegistrationFinalizationDependencies = {
  auth: any
  db: any
  cloudName: string
  now: () => number
  verifyAsset: (asset: RegistrationAssetIdentity) => Promise<void>
}

type NormalizedResident = {
  firstName: string
  lastName: string
  middleInitial: string
  name: string
  email: string
  gender: string
  dateOfBirth: string
  contactNumber: string
  street: string
  barangay: string
  city: string
  address: string
  statuses: string[]
}

type NormalizedProof = {
  name: string
  filename: string
  url: string
  claimToken: string
  asset: RegistrationAssetIdentity
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw registrationHttpError(`${label} must be an object.`, 400, "INVALID_REGISTRATION_PAYLOAD")
  }
}

function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: Set<string>, label: string) {
  const unexpected = Object.keys(value).filter(key => !allowed.has(key))
  if (unexpected.length > 0) {
    throw registrationHttpError(`${label} contains unsupported fields.`, 400, "UNEXPECTED_REGISTRATION_FIELD")
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") throw registrationHttpError(`${label} is required.`, 400, "INVALID_REGISTRATION_PAYLOAD")
  const normalized = value.trim().replace(/\s+/g, " ")
  if (!normalized || normalized.length > maxLength) {
    throw registrationHttpError(`${label} is invalid.`, 400, "INVALID_REGISTRATION_PAYLOAD")
  }
  return normalized
}

function ageAt(dateOfBirth: string, now: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw registrationHttpError("Date of birth is invalid.", 400, "INVALID_REGISTRATION_PAYLOAD")
  }
  const [year, month, day] = dateOfBirth.split("-").map(Number)
  const birth = new Date(Date.UTC(year, month - 1, day))
  if (
    birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day ||
    birth.getTime() > now
  ) {
    throw registrationHttpError("Date of birth is invalid.", 400, "INVALID_REGISTRATION_PAYLOAD")
  }
  const current = new Date(now)
  let age = current.getUTCFullYear() - year
  if (current.getUTCMonth() < month - 1 || (current.getUTCMonth() === month - 1 && current.getUTCDate() < day)) age--
  if (age < 0 || age > 130) throw registrationHttpError("Date of birth is invalid.", 400, "INVALID_REGISTRATION_PAYLOAD")
  return age
}

function initials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
}

function normalizeResident(value: unknown, authEmail: string, now: number): NormalizedResident {
  assertPlainObject(value, "Resident")
  rejectUnexpectedKeys(value, RESIDENT_KEYS, "Resident")
  const firstName = requiredText(value.firstName, "First name", 80)
  const lastName = requiredText(value.lastName, "Last name", 80)
  const middleInitial = value.middleInitial === undefined || value.middleInitial === ""
    ? ""
    : requiredText(value.middleInitial, "Middle initial", 1).toUpperCase()
  const email = requiredText(value.email, "Email", 254).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email !== authEmail) {
    throw registrationHttpError("Registration email must match the authenticated account.", 403, "AUTH_EMAIL_MISMATCH")
  }
  const gender = requiredText(value.gender, "Gender", 20)
  if (!GENDERS.has(gender)) throw registrationHttpError("Gender is invalid.", 400, "INVALID_REGISTRATION_PAYLOAD")
  const dateOfBirth = requiredText(value.dateOfBirth, "Date of birth", 10)
  const age = ageAt(dateOfBirth, now)
  const contactNumber = requiredText(value.contactNumber, "Contact number", 11).replace(/\s/g, "")
  if (!/^\d{11}$/.test(contactNumber)) throw registrationHttpError("Contact number must contain exactly 11 digits.", 400, "INVALID_REGISTRATION_PAYLOAD")
  const street = requiredText(value.street, "Street", 160)
  const barangay = requiredText(value.barangay, "Barangay", 120)
  const city = requiredText(value.city, "City", 120)
  if (!Array.isArray(value.statuses) || value.statuses.length === 0 || value.statuses.length > 2) {
    throw registrationHttpError("Resident classifications are invalid.", 400, "INVALID_REGISTRATION_PAYLOAD")
  }
  const statuses = value.statuses.map(status => requiredText(status, "Resident classification", 40))
  if (new Set(statuses).size !== statuses.length) throw registrationHttpError("Resident classifications must be unique.", 400, "INVALID_REGISTRATION_PAYLOAD")
  const expectedAutomatic = deriveStatusesFromAge(age)[0]
  if (!statuses.includes(expectedAutomatic) || statuses.some(status => status !== expectedAutomatic && !MANUAL_STATUSES.has(status))) {
    throw registrationHttpError("Resident classifications do not match the supplied date of birth.", 400, "INVALID_REGISTRATION_PAYLOAD")
  }
  const canonicalStatuses = [expectedAutomatic, ...statuses.filter(status => MANUAL_STATUSES.has(status)).sort()]
  return {
    firstName,
    lastName,
    middleInitial,
    name: [firstName, middleInitial ? `${middleInitial}.` : "", lastName].filter(Boolean).join(" "),
    email,
    gender,
    dateOfBirth,
    contactNumber,
    street,
    barangay,
    city,
    address: [street, barangay, city].join(", "),
    statuses: canonicalStatuses,
  }
}

function normalizeProofs(value: unknown, statuses: string[], cloudName: string): NormalizedProof[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) {
    throw registrationHttpError("Registration proofs are required.", 400, "INVALID_PROOF")
  }
  const proofs = value.map((proof, index) => {
    assertPlainObject(proof, `Proof ${index + 1}`)
    rejectUnexpectedKeys(proof, PROOF_KEYS, `Proof ${index + 1}`)
    const name = requiredText(proof.name, `Proof ${index + 1} name`, 120)
    const filename = requiredText(proof.filename, `Proof ${index + 1} filename`, 255)
    const url = requiredText(proof.url, `Proof ${index + 1} URL`, 2048)
    const claimToken = requiredText(proof.claimToken, `Proof ${index + 1} capability`, 512)
    return { name, filename, url, claimToken, asset: parseRegistrationMediaClaim({ mediaUrl: url, claimToken }, cloudName) }
  })
  if (new Set(proofs.map(proof => proof.asset.registryId)).size !== proofs.length) {
    throw registrationHttpError("Duplicate registration proofs are not allowed.", 400, "INVALID_PROOF")
  }
  const requiredNames = new Set(getRequiredDocuments(statuses, "register").map(document => document.title))
  const suppliedNames = new Set(proofs.map(proof => proof.name))
  if (requiredNames.size !== suppliedNames.size || [...requiredNames].some(name => !suppliedNames.has(name))) {
    throw registrationHttpError("The required documents do not match the resident classifications.", 400, "REQUIRED_PROOF_MISMATCH")
  }
  return proofs
}

function canonicalPayloadHash(resident: NormalizedResident, proofs: NormalizedProof[]) {
  const canonical = {
    resident,
    proofs: proofs
      .map(proof => ({
        name: proof.name,
        filename: proof.filename,
        cloudName: proof.asset.cloudName,
        resourceType: proof.asset.resourceType,
        deliveryType: proof.asset.deliveryType,
        publicId: proof.asset.publicId,
      }))
      .sort((left, right) => left.publicId.localeCompare(right.publicId)),
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

export function registrationOperationDocumentId(uid: string, operationId: string) {
  return createHash("sha256").update(`${uid}:${operationId}`).digest("hex")
}

export async function finalizeResidentRegistration(
  body: unknown,
  callerUid: string,
  authEmail: string,
  dependencies: Omit<RegistrationFinalizationDependencies, "auth">,
) {
  assertPlainObject(body, "Request")
  rejectUnexpectedKeys(body, ROOT_KEYS, "Request")
  const operationId = requiredText(body.operationId, "Operation ID", 80)
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(operationId)) {
    throw registrationHttpError("A valid operation ID is required.", 400, "INVALID_OPERATION_ID")
  }
  const now = dependencies.now()
  const resident = normalizeResident(body.resident, authEmail, now)
  const proofs = normalizeProofs(body.proofs, resident.statuses, dependencies.cloudName)
  const assets = proofs.map(proof => proof.asset)
  const payloadHash = canonicalPayloadHash(resident, proofs)
  const operationRef = dependencies.db.collection("registrationOperations").doc(registrationOperationDocumentId(callerUid, operationId))
  const existingOperation = await operationRef.get()
  if (existingOperation.exists) {
    const existing = existingOperation.data() || {}
    if (existing.uid !== callerUid || existing.operationId !== operationId || existing.payloadHash !== payloadHash) {
      throw registrationHttpError("This registration operation was already used with different data.", 409, "IDEMPOTENCY_CONFLICT")
    }
    if (existing.status !== "completed") {
      throw registrationHttpError("Registration finalization is not in a completed state.", 409, "OPERATION_STATE_CONFLICT")
    }
    return { idempotent: true, operationId, residentId: callerUid }
  }

  try {
    await preflightRegistrationAssets({
      db: dependencies.db,
      callerUid,
      assets,
      now,
      verifyAsset: dependencies.verifyAsset,
    })
  } catch (error: any) {
    if (error?.committed === false) throw error
    throw registrationHttpError("The uploaded proof could not be verified with the media provider.", 503, "PROVIDER_VERIFICATION_FAILED")
  }

  const userRef = dependencies.db.collection("users").doc(callerUid)
  const verificationRef = dependencies.db.collection("verifications").doc(callerUid)
  const notificationRef = dependencies.db.collection("notifications").doc(`reg-${callerUid}`)
  const reservationRefs = assets.map(asset => dependencies.db.collection("mediaRegistry").doc(asset.registryId))
  const submittedDate = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(now))

  let result: { idempotent: boolean }
  try {
    result = await dependencies.db.runTransaction(async (transaction: any) => {
    const operationSnapshot = await transaction.get(operationRef)
    if (operationSnapshot.exists) {
      const existing = operationSnapshot.data() || {}
      if (existing.uid !== callerUid || existing.operationId !== operationId || existing.payloadHash !== payloadHash) {
        throw registrationHttpError("This registration operation was already used with different data.", 409, "IDEMPOTENCY_CONFLICT")
      }
      if (existing.status !== "completed") {
        throw registrationHttpError("Registration finalization is not in a completed state.", 409, "OPERATION_STATE_CONFLICT")
      }
      return { idempotent: true }
    }

    const [userSnapshot, verificationSnapshot, notificationSnapshot, ...reservationSnapshots] = await Promise.all([
      transaction.get(userRef),
      transaction.get(verificationRef),
      transaction.get(notificationRef),
      ...reservationRefs.map(ref => transaction.get(ref)),
    ])
    if (userSnapshot.exists || verificationSnapshot.exists || notificationSnapshot.exists) {
      throw registrationHttpError("Authoritative registration records already exist without this operation.", 409, "REGISTRATION_STATE_CONFLICT")
    }

    applyRegistrationClaims({
      transaction,
      refs: reservationRefs,
      snapshots: reservationSnapshots,
      assets,
      callerUid,
      now,
    })

    const residentProfile = {
      id: callerUid,
      name: resident.name,
      email: resident.email,
      initials: initials(resident.firstName, resident.lastName),
      role: "resident",
      status: "Pending",
      statuses: resident.statuses,
      gender: resident.gender,
      dateOfBirth: resident.dateOfBirth,
      contactNumber: resident.contactNumber,
      address: resident.address,
      accountExpiry: "",
      isVerified: false,
      profilePicture: "",
      createdAt: now,
      firstName: resident.firstName,
      lastName: resident.lastName,
      middleInitial: resident.middleInitial,
      street: resident.street,
      barangay: resident.barangay,
      city: resident.city,
    }
    transaction.create(userRef, residentProfile)
    transaction.create(verificationRef, {
      residentId: callerUid,
      userId: callerUid,
      name: resident.name,
      initials: residentProfile.initials,
      type: "registration",
      submittedDate,
      categories: resident.statuses,
      gender: resident.gender,
      age: ageAt(resident.dateOfBirth, now),
      address: resident.address,
      contactNumber: resident.contactNumber,
      email: resident.email,
      dateOfBirth: resident.dateOfBirth,
      documents: proofs.map(proof => ({ name: proof.name, status: "pending", uploadDate: submittedDate, url: proof.url })),
      status: "pending",
      createdAt: now,
      operationId,
    })
    transaction.create(notificationRef, {
      targetId: "admin",
      type: "registration",
      title: "New Resident Registration",
      message: `${resident.name} has registered and requires verification.`,
      timestamp: "Just now",
      isRead: false,
      createdAt: now,
      residentName: resident.name,
      actionUrl: "/admin/verifications",
      operationId,
    })
    transaction.create(operationRef, {
      uid: callerUid,
      operationId,
      payloadHash,
      status: "completed",
      userId: callerUid,
      verificationId: callerUid,
      notificationId: `reg-${callerUid}`,
      proofRegistryIds: assets.map(asset => asset.registryId),
      createdAt: now,
      completedAt: now,
    })
    return { idempotent: false }
    })
  } catch (error: any) {
    if (error?.committed === false) throw error
    throw Object.assign(new Error("Registration commit outcome is unknown. Retry the same operation."), {
      status: 503,
      code: "FINALIZATION_COMMIT_UNKNOWN",
      committed: "unknown",
    })
  }

  return { ...result, operationId, residentId: callerUid }
}
