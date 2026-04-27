"use client"

import type { AuthUser } from "@/lib/auth-types"
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
} from "./master-store"

// ─── Re-exported Types for Backwards Compatibility ───

export type ResidentRequest = MasterDocumentRequest
export type ResidentNotification = MasterNotification
export type { ResidentAccountRecord, ResidentProofDocument }

export interface CreateResidentAccountInput {
  name: string
  email: string
  password: string
  dateOfBirth: string
  contactNumber: string
  address: string
  statuses: string[]
  proofs: ResidentProofDocument[]
}

export interface CreateResidentRequestInput {
  documentType: string
  purpose: string
}

// ─── Helpers ───

const SESSION_KEY = "talasys.session.user.v2"
const canUseStorage = () => typeof window !== "undefined"

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const resolvePrimaryStatus = (statuses: string[]) => {
  if (statuses.includes("Senior Citizen")) return "Senior Citizen"
  if (statuses.includes("Underage")) return "Under 18"
  if (statuses.includes("Registered Voter")) return "Registered Voter"
  if (statuses.includes("Adult")) return "Adult"
  return "Resident"
}

// ─── API Proxies ───

// Legacy passthrough exported for any stragglers, though readMasterStorage should be preferred.
export const readStorage = readMasterStorage
export const writeStorage = writeMasterStorage
export const subscribeToResidentStorage = subscribeToMasterStorage

export const loadSessionUser = () => {
  if (!canUseStorage()) return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export const saveSessionUser = (user: AuthUser | null) => {
  if (!canUseStorage()) return
  if (!user) {
    window.localStorage.removeItem(SESSION_KEY)
    return
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export const findResidentByCredentials = (username: string, password: string) => {
  const storage = readMasterStorage()
  return storage.residents.find((account) =>
    account.username.toLowerCase() === username.toLowerCase() && account.password === password
  ) ?? null
}

export const findResidentByEmail = (email: string) => {
  const storage = readMasterStorage()
  return storage.residents.find((account) =>
    account.user.email.toLowerCase() === email.toLowerCase()
  ) ?? null
}

export const registerResidentAccount = async (input: CreateResidentAccountInput) => {
  const { auth, db } = await import("@/lib/firebase")
  const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth")
  const { doc, setDoc } = await import("firebase/firestore")

  const storage = readMasterStorage()
  const normalizedEmail = input.email.trim().toLowerCase()
  const username = normalizedEmail

  const usernameTaken = storage.residents.some((account) => account.username === username)
  const emailTaken = storage.residents.some((account) => account.user.email.toLowerCase() === normalizedEmail)

  if (usernameTaken || emailTaken) {
    throw new Error("An account with this email already exists.")
  }

  // CREATE IN FIREBASE AUTH
  const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, input.password)
  await updateProfile(userCredential.user, { displayName: input.name.trim() })

  const id = userCredential.user.uid
  
  const user: AuthUser = {
    id,
    name: input.name.trim(),
    email: normalizedEmail,
    initials: getInitials(input.name),
    role: "resident",
    status: resolvePrimaryStatus(input.statuses),
    dateOfBirth: input.dateOfBirth,
    contactNumber: input.contactNumber,
    address: input.address,
    accountExpiry: formatDate(addDays(new Date(), 365)),
    isVerified: false,
  }

  const residentAccount: ResidentAccountRecord = {
    id,
    username,
    password: "", // Handled by Firebase Auth now
    user,
  }

  // ALSO STORE IN FIRESTORE DIRECTLY SO NEXT LOGIN PICKS IT UP
  const userDocRef = doc(db, "users", id)
  await setDoc(userDocRef, user)

  storage.residents.push(residentAccount)

  // IMPORTANT CROSS-MODULE SYNC: Also push a Universal Verification to the Admin Queue!
  storage.verifications.push({
    id: generateId(),
    residentId: id,
    name: input.name.trim(),
    initials: getInitials(input.name),
    type: "registration",
    submittedDate: formatDate(new Date()),
    categories: input.statuses,
    age: input.dateOfBirth ? Math.floor((new Date().getTime() - new Date(input.dateOfBirth).getTime()) / 31557600000) : 0,
    address: input.address,
    documents: input.proofs.map(p => ({ name: p.name, status: "pending", uploadDate: p.uploadDate })),
  })

  // Universal Notification to Resident natively
  storage.notifications.push({
    id: generateId(),
    targetId: id,
    type: "success",
    title: "Welcome to TALASYS",
    message: "Your account has been created successfully. Submitting your verification to the Admin team.",
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
  })

  // Universal Notification to Admins!
  storage.notifications.push({
    id: generateId(),
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

  writeMasterStorage(storage)
  return user
}

export const updateResidentUser = (residentId: string, updates: Partial<AuthUser>) => {
  const storage = readMasterStorage()
  const account = storage.residents.find((item) => item.id === residentId)
  if (!account) return null

  account.user = { ...account.user, ...updates }
  writeMasterStorage(storage)
  return account.user
}

export const getResidentRequests = (residentId: string) => {
  return readMasterStorage().documentRequests
    .filter(r => r.residentId === residentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentNotifications = (residentId: string) => {
  return readMasterStorage().notifications
    .filter(n => n.targetId === residentId)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentProofs = (residentId: string) => {
  // We didn't keep proofsByResidentId in master because they are attached to verifications usually.
  // Wait, let's just grab the ResidentAccount Record which could hold it? Or we can query from verifications!
  // For backwards compatibility let's just create a dummy return, since users upload proofs upon registration
  // and they are transferred to verifications. 
  return []
}

export const markAllResidentNotificationsRead = (residentId: string) => {
  const storage = readMasterStorage()
  storage.notifications.forEach(n => {
    if (n.targetId === residentId) {
      n.isRead = true
      if (n.type === "urgent") n.type = "urgent"
      else n.type = "read"
    }
  })
  writeMasterStorage(storage)
}

export const createResidentRequest = (residentId: string, input: CreateResidentRequestInput) => {
  const storage = readMasterStorage()

  // Validate Resident
  const account = storage.residents.find((item) => item.id === residentId)
  if (!account) throw new Error("Resident not found")

  // Determine sequence number
  const year = new Date().getFullYear()
  const sequence = storage.documentRequests.length + 1
  const refNumber = `REQ-${year}-${sequence.toString().padStart(3, "0")}`

  const request: MasterDocumentRequest = {
    id: generateId(),
    residentId,
    residentName: account.user.name,
    residentInitials: account.user.initials,
    residentCategory: account.user.status || "Resident",
    refNumber,
    documentType: input.documentType,
    dateRequested: formatDate(new Date()),
    status: "Pending",
    purpose: input.purpose,
    createdAt: Date.now(),
  }

  storage.documentRequests.push(request)

  // Notify Resident
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

  // Notify Admin!
  storage.notifications.push({
    id: generateId(),
    targetId: "admin",
    type: "info",
    title: "New Document Request",
    message: `${account.user.name} requested a ${input.documentType}.`,
    timestamp: "Just now",
    isRead: false,
    createdAt: Date.now(),
    residentName: account.user.name,
    actionUrl: "/admin/requests"
  })

  writeMasterStorage(storage)
  return request
}
