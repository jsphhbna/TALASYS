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
import { RESIDENT_SESSION_STORAGE_KEY, ACCOUNT_EXPIRY_DAYS } from "../constants"

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
export const registerResidentAccount = async (input: CreateResidentAccountInput) => {
  const { auth, db } = await import("@/lib/firebase")
  const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth")
  const { doc, setDoc, addDoc, collection } = await import("firebase/firestore")

  const normalizedEmail = input.email.trim().toLowerCase()

  const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, input.password)
  await updateProfile(userCredential.user, { displayName: input.name.trim() })
  
  const { sendEmailVerification } = await import("firebase/auth")
  try {
    await sendEmailVerification(userCredential.user)
  } catch (verificationEmailError) {
    console.error("Failed to send verification email during registration (uid:", userCredential.user.uid, "):", verificationEmailError)
  }

  const newUserId = userCredential.user.uid
  
  const residentUser: AuthUser = {
    id: newUserId,
    name: input.name.trim(),
    email: normalizedEmail,
    initials: getInitials(input.name),
    role: "resident",
    status: resolvePrimaryStatus(input.statuses),
    statuses: input.statuses,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth,
    contactNumber: input.contactNumber,
    address: input.address,
    accountExpiry: formatDateDisplay(addDaysToDate(new Date(), ACCOUNT_EXPIRY_DAYS)),
    isVerified: false,
    profilePicture: input.profilePicture || "",
    createdAt: Date.now(),
    firstName: input.firstName,
    lastName: input.lastName,
    middleInitial: input.middleInitial,
    street: input.street,
    barangay: input.barangay,
    city: input.city,
  }

  const userDocRef = doc(db, "users", newUserId)
  await setDoc(userDocRef, residentUser)

  // Cross-module sync: push a verification record to the admin queue so they
  // can review the registration documents before granting the resident full access.
  await setDoc(doc(db, "verifications", newUserId), {
    residentId: newUserId,
    name: input.name.trim(),
    initials: getInitials(input.name),
    type: "registration",
    submittedDate: formatDateDisplay(new Date()),
    categories: input.statuses,
    gender: input.gender,
    age: input.dateOfBirth ? Math.floor((new Date().getTime() - new Date(input.dateOfBirth).getTime()) / 31557600000) : 0,
    address: input.address,
    contactNumber: input.contactNumber,
    email: normalizedEmail,
    dateOfBirth: input.dateOfBirth,
    documents: input.proofs.map(proof => ({ name: proof.name, status: "pending", uploadDate: proof.uploadDate, url: proof.url || "" })),
    status: "pending"
  })

  await addDoc(collection(db, "notifications"), {
    targetId: newUserId,
    type: "success",
    title: "Welcome to TALASYS",
    message: "Your account has been created successfully. Your verification has been submitted to the admin team.",
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
  })

  await addDoc(collection(db, "notifications"), {
    targetId: "admin",
    type: "registration",
    title: "New Resident Registration",
    message: `${input.name.trim()} has registered and requires verification.`,
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
    residentName: input.name.trim(),
    actionUrl: "/admin/verifications"
  })

  // Sign out after all writes complete — see JSDoc above for the full rationale.
  const { signOut } = await import("firebase/auth")
  await signOut(auth)

  return residentUser
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
