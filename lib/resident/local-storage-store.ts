"use client"

import type { AuthUser } from "@/lib/auth"
import {
  generateId,
  getInitials,
  readMasterStorage,
  writeMasterStorage,
  subscribeToMasterStorage,
  type MasterDocumentRequest,
  type MasterNotification,
  type ResidentAccountRecord,
  type ResidentProofDocument,
  type MasterStorage,
} from "../master-store"
import { RESIDENT_SESSION_STORAGE_KEY } from "../constants"
import {
  callRegistrationFinalizer,
  completeFreshRegistration,
  type RegistrationFinalizationPayload,
} from "./registration-finalization-client"

// ─── Re-exported Types for Backwards Compatibility ───

export type ResidentRequest = MasterDocumentRequest
export type ResidentNotification = MasterNotification
export type { ResidentAccountRecord, ResidentProofDocument }

export interface CreateResidentAccountInput {
  name: string
  email: string
  password: string
  gender: string
  dateOfBirth: string
  contactNumber: string
  address: string
  statuses: string[]
  proofs: ResidentProofDocument[]
  profilePicture?: string

  firstName?: string
  lastName?: string
  middleInitial?: string
  street?: string
  barangay?: string
  city?: string
  operationId?: string
}

export interface CreateResidentRequestInput {
  documentType: string
  purpose: string
  requestFor?: "myself" | "other"
  requestedByName?: string
  requestedByContact?: string
  relationship?: string
  authorizationLetter?: string
  paymentMethod?: "gcash" | "cash"
  documentFee?: number
  gcashRefNumber?: string
  gcashScreenshotUrl?: string
}

// ─── Helpers ───

const isBrowserEnvironment = () => typeof window !== "undefined"

const formatDateDisplay = (date: Date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

const addDaysToDate = (date: Date, days: number) => {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() + days)
  return nextDate
}

const resolvePrimaryStatus = (statuses: string[]) => {
  if (statuses.includes("Senior Citizen")) return "Senior Citizen"
  if (statuses.includes("Underage")) return "Under 18"
  if (statuses.includes("Registered Voter")) return "Registered Voter"
  if (statuses.includes("Adult")) return "Adult"
  return "Resident"
}

// ─── API Proxies ───

// Legacy passthroughs retained for backward compatibility with older call sites.
export const readStorage = readMasterStorage
export const writeStorage = writeMasterStorage
export const subscribeToResidentStorage = subscribeToMasterStorage

export const loadSessionUser = () => {
  if (!isBrowserEnvironment()) return null
  try {
    const rawSession = window.localStorage.getItem(RESIDENT_SESSION_STORAGE_KEY)
    return rawSession ? (JSON.parse(rawSession) as AuthUser) : null
  } catch {
    return null
  }
}

export const saveSessionUser = (user: AuthUser | null) => {
  if (!isBrowserEnvironment()) return
  if (!user) {
    window.localStorage.removeItem(RESIDENT_SESSION_STORAGE_KEY)
    return
  }
  window.localStorage.setItem(RESIDENT_SESSION_STORAGE_KEY, JSON.stringify(user))
}

export const findResidentByCredentials = (username: string) => {
  const storage = readMasterStorage()
  return storage.residents.find((residentAccount) =>
    residentAccount.username.toLowerCase() === username.toLowerCase()
  ) ?? null
}

export const findResidentByEmail = (email: string) => {
  const storage = readMasterStorage()
  return storage.residents.find((residentAccount) =>
    residentAccount.user.email.toLowerCase() === email.toLowerCase()
  ) ?? null
}

/**
 * Registers a new resident account in Firebase Auth and Firestore, then
 * submits a verification request to the admin queue and sends welcome notifications.
 *
 * The user is signed out after all writes complete because they must verify their
 * email before logging in. Leaving them signed in would cause `onAuthStateChanged`
 * to fire and attempt to load their profile before Firestore writes finish,
 * resulting in permission-denied race condition errors.
 */
const freshRegistrationUids = new Set<string>()

export const registerResidentAccount = async (input: CreateResidentAccountInput) => {
  const { auth } = await import("@/lib/firebase")
  const { createUserWithEmailAndPassword, updateProfile, sendEmailVerification, signOut } = await import("firebase/auth")
  const { preRegistrationClaimTokens } = await import("./cloudinary")
  const normalizedEmail = input.email.trim().toLowerCase()
  const existingFreshUser = auth.currentUser &&
    auth.currentUser.email?.trim().toLowerCase() === normalizedEmail &&
    freshRegistrationUids.has(auth.currentUser.uid)
      ? auth.currentUser
      : null
  const user = existingFreshUser || (await createUserWithEmailAndPassword(auth, normalizedEmail, input.password)).user
  freshRegistrationUids.add(user.uid)

  try {
    if (!existingFreshUser) await updateProfile(user, { displayName: input.name.trim() })
    const proofs = input.proofs.filter(proof => typeof proof.url === "string" && proof.url)
    const finalizationProofs = proofs.map(proof => {
      const claimToken = preRegistrationClaimTokens.get(proof.url as string)
      if (!claimToken) throw new Error(`The upload capability for ${proof.name} is missing. Upload the document again.`)
      return {
        name: proof.name,
        filename: proof.filename,
        url: proof.url as string,
        uploadDate: proof.uploadDate,
        claimToken,
      }
    })
    const payload: RegistrationFinalizationPayload = {
      operationId: input.operationId || crypto.randomUUID(),
      resident: {
        firstName: input.firstName || "",
        lastName: input.lastName || "",
        middleInitial: input.middleInitial || "",
        email: normalizedEmail,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        contactNumber: input.contactNumber,
        street: input.street || "",
        barangay: input.barangay || "",
        city: input.city || "",
        statuses: input.statuses,
      },
      proofs: finalizationProofs,
    }
    const idToken = await user.getIdToken()
    const completion = await completeFreshRegistration({
      finalize: () => callRegistrationFinalizer(fetch, idToken, payload),
      deleteFreshAuth: async () => {
        await user.delete()
        freshRegistrationUids.delete(user.uid)
      },
      sendVerificationEmail: () => sendEmailVerification(user),
      signOut: () => signOut(auth),
    })
    for (const proof of proofs) preRegistrationClaimTokens.delete(proof.url as string)
    freshRegistrationUids.delete(user.uid)

    const residentUser: AuthUser = {
      id: user.uid,
      name: input.name.trim(),
      email: normalizedEmail,
      initials: getInitials(input.name),
      role: "resident",
      status: "Pending",
      statuses: input.statuses,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      contactNumber: input.contactNumber,
      address: input.address,
      accountExpiry: "",
      isVerified: false,
      profilePicture: "",
      createdAt: Date.now(),
      firstName: input.firstName,
      lastName: input.lastName,
      middleInitial: input.middleInitial,
      street: input.street,
      barangay: input.barangay,
      city: input.city,
    }
    return { ...residentUser, verificationEmailSent: completion.verificationEmailSent }
  } catch (error) {
    if (!freshRegistrationUids.has(user.uid)) throw error
    if (error instanceof Error && error.name === "RegistrationFinalizationError") throw error
    try { await user.delete() } catch { /* the caller still receives the original pre-request failure */ }
    freshRegistrationUids.delete(user.uid)
    throw error
  }
}

export const cancelResidentRequest = (requestId: string) => {
  const storage = readMasterStorage()
  const requestIndex = storage.documentRequests.findIndex((request) => request.id === requestId)
  if (requestIndex !== -1 && storage.documentRequests[requestIndex].status === "Pending") {
    // Physically remove the request rather than marking it cancelled to keep the
    // resident's request history clean and protect their data privacy preference.
    storage.documentRequests.splice(requestIndex, 1)
    writeMasterStorage(storage)
    return true
  }
  return false
}

export const deleteResidentAccount = (residentId: string) => {
  const storage = readMasterStorage()
  const residentIndex = storage.residents.findIndex(resident => resident.id === residentId)
  if (residentIndex !== -1) {
    storage.residents.splice(residentIndex, 1)
  }
  
  // Cascading delete: remove all data associated with this resident to prevent orphaned records.
  storage.documentRequests = storage.documentRequests.filter(request => request.residentId !== residentId)
  storage.notifications = storage.notifications.filter(notification => notification.targetId !== residentId)
  storage.verifications = storage.verifications.filter(verification => verification.residentId !== residentId)
  
  writeMasterStorage(storage)
  return true
}

export const updateResidentUser = (residentId: string, updates: Partial<AuthUser>) => {
  const storage = readMasterStorage()
  const residentAccount = storage.residents.find((account) => account.id === residentId)
  if (!residentAccount) return null

  residentAccount.user = { ...residentAccount.user, ...updates }
  writeMasterStorage(storage)
  return residentAccount.user
}

export const getResidentRequests = (residentId: string) => {
  return readMasterStorage().documentRequests
    .filter(request => request.residentId === residentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentNotifications = (residentId: string) => {
  return readMasterStorage().notifications
    .filter(notification => notification.targetId === residentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentVerification = (residentId: string) => {
  const storage = readMasterStorage()
  return storage.verifications.find((verification) => verification.residentId === residentId) || null
}

export const getResidentSystemConfig = () => {
  return readMasterStorage().systemConfig
}

export const getResidentProofs = (residentId: string) => {
  const verification = getResidentVerification(residentId)
  if (verification && verification.documents.length > 0) {
    return verification.documents.map((proofDocument, index) => ({
      id: `proof-${residentId}-${index}`,
      name: proofDocument.name,
      filename: proofDocument.name,
      uploadDate: proofDocument.uploadDate || "N/A",
      status: proofDocument.status === "verified" || proofDocument.status === "valid" ? "Valid" as const : "Pending" as const,
    }))
  }
  return []
}

export const markAllResidentNotificationsRead = (residentId: string) => {
  const storage = readMasterStorage()
  storage.notifications.forEach(notification => {
    if (notification.targetId === residentId) {
      notification.isRead = true
      if (notification.type !== "urgent") notification.type = "read"
    }
  })
  writeMasterStorage(storage)
}

/**
 * Creates a new document request on behalf of a resident and notifies both
 * the resident and the admin team.
 *
 * @throws {Error} if the resident account cannot be found in the store.
 */
export const createResidentRequest = (residentId: string, input: CreateResidentRequestInput) => {
  const storage = readMasterStorage()

  const residentAccount = storage.residents.find((account) => account.id === residentId)
  if (!residentAccount) throw new Error(`Resident not found (id: ${residentId}). The account may have been deleted.`)

  const requestYear = new Date().getFullYear()
  const requestSequence = storage.documentRequests.length + 1
  const refNumber = `REQ-${requestYear}-${requestSequence.toString().padStart(3, "0")}`

  const documentRequest: MasterDocumentRequest = {
    id: generateId(),
    residentId,
    residentName: residentAccount.user.name,
    residentInitials: residentAccount.user.initials,
    residentCategory: residentAccount.user.status || "Resident",
    refNumber,
    documentType: input.documentType,
    dateRequested: formatDateDisplay(new Date()),
    status: "Pending",
    purpose: input.purpose,
    createdAt: Date.now(),
  }

  storage.documentRequests.push(documentRequest)

  storage.notifications.push({
    id: generateId(),
    targetId: residentId,
    type: "info",
    title: "Request Submitted",
    message: `${input.documentType} (${refNumber}) is now being processed.`,
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
  })

  storage.notifications.push({
    id: generateId(),
    targetId: "admin",
    type: "info",
    title: "New Document Request",
    message: `${residentAccount.user.name} requested a ${input.documentType}.`,
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
    residentName: residentAccount.user.name,
    actionUrl: "/admin/requests"
  })

  writeMasterStorage(storage)
  return documentRequest
}
