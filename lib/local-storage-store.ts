"use client"

import type { AuthUser } from "@/lib/auth-types"

export interface ResidentRequest {
  id: string
  refNumber: string
  documentType: string
  dateRequested: string
  status: "Approved" | "Pending" | "Rejected"
  purpose: string
  downloadUrl?: string
  createdAt: number
}

export interface ResidentNotification {
  id: string
  type: "urgent" | "success" | "info" | "read"
  title: string
  message: string
  timestamp: string
  isRead: boolean
  createdAt: number
}

export interface ResidentProofDocument {
  id: string
  name: string
  filename: string
  uploadDate: string
  status: "Valid" | "Pending" | "Expired"
}

export interface ResidentAccountRecord {
  id: string
  username: string
  password: string
  user: AuthUser
}

interface TalasysStorage {
  residentAccounts: ResidentAccountRecord[]
  requestsByResidentId: Record<string, ResidentRequest[]>
  notificationsByResidentId: Record<string, ResidentNotification[]>
  proofsByResidentId: Record<string, ResidentProofDocument[]>
}

interface CreateResidentAccountInput {
  name: string
  email: string
  password: string
  dateOfBirth: string
  contactNumber: string
  address: string
  statuses: string[]
  proofs: ResidentProofDocument[]
}

interface CreateResidentRequestInput {
  documentType: string
  purpose: string
}

const STORAGE_KEY = "talasys.storage.v1"
const SESSION_KEY = "talasys.session.user.v1"
const STORAGE_EVENT = "talasys-storage-updated"

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const getInitials = (name: string) => {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
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

const createDefaultStorage = (): TalasysStorage => {
  const residentId = "resident-1"

  const defaultResident: ResidentAccountRecord = {
    id: residentId,
    username: "user",
    password: "user123",
    user: {
      id: residentId,
      name: "Juan Dela Cruz",
      email: "juan.delacruz@email.com",
      initials: "JD",
      role: "resident",
      status: "Senior Citizen",
      dateOfBirth: "1960-03-15",
      contactNumber: "09171234567",
      address: "123 Rizal Street, Barangay San Jose, Manila, Metro Manila 1000",
      accountExpiry: formatDate(addDays(new Date(), 365)),
      isVerified: true,
    },
  }

  const now = Date.now()

  return {
    residentAccounts: [defaultResident],
    requestsByResidentId: {
      [residentId]: [
        {
          id: "1",
          refNumber: "REQ-2025-001",
          documentType: "Barangay Clearance",
          dateRequested: "Nov 25, 2025",
          status: "Approved",
          purpose: "Employment",
          downloadUrl: "/documents/barangay-clearance.pdf",
          createdAt: now - 5 * 24 * 60 * 60 * 1000,
        },
        {
          id: "2",
          refNumber: "REQ-2025-002",
          documentType: "Certificate of Indigency",
          dateRequested: "Nov 20, 2025",
          status: "Pending",
          purpose: "Medical",
          createdAt: now - 10 * 24 * 60 * 60 * 1000,
        },
        {
          id: "3",
          refNumber: "REQ-2025-003",
          documentType: "Certificate of Residency",
          dateRequested: "Nov 15, 2025",
          status: "Approved",
          purpose: "Bank Loan",
          downloadUrl: "/documents/residency-certificate.pdf",
          createdAt: now - 15 * 24 * 60 * 60 * 1000,
        },
        {
          id: "4",
          refNumber: "REQ-2025-004",
          documentType: "Barangay Clearance",
          dateRequested: "Nov 10, 2025",
          status: "Rejected",
          purpose: "Business",
          createdAt: now - 20 * 24 * 60 * 60 * 1000,
        },
        {
          id: "5",
          refNumber: "REQ-2025-005",
          documentType: "Certificate of Indigency",
          dateRequested: "Nov 5, 2025",
          status: "Approved",
          purpose: "Financial Aid",
          downloadUrl: "/documents/indigency-certificate.pdf",
          createdAt: now - 25 * 24 * 60 * 60 * 1000,
        },
      ],
    },
    notificationsByResidentId: {
      [residentId]: [
        {
          id: "1",
          type: "urgent",
          title: "Account Expiring Soon",
          message: "Your account will expire in 7 days. Please renew to continue using services.",
          timestamp: "Just now",
          isRead: false,
          createdAt: now - 1 * 60 * 1000,
        },
        {
          id: "2",
          type: "success",
          title: "Document Ready for Download",
          message: "Your Barangay Clearance (REQ-2025-001) is ready.",
          timestamp: "2 hours ago",
          isRead: false,
          createdAt: now - 2 * 60 * 60 * 1000,
        },
        {
          id: "3",
          type: "info",
          title: "Request Being Processed",
          message: "Your Certificate of Indigency request is under review.",
          timestamp: "1 day ago",
          isRead: false,
          createdAt: now - 24 * 60 * 60 * 1000,
        },
        {
          id: "4",
          type: "read",
          title: "Document Downloaded",
          message: "Certificate of Residency was downloaded successfully.",
          timestamp: "3 days ago",
          isRead: true,
          createdAt: now - 3 * 24 * 60 * 60 * 1000,
        },
        {
          id: "5",
          type: "read",
          title: "Welcome to TALASYS",
          message: "Your account has been successfully created.",
          timestamp: "Nov 1, 2025",
          isRead: true,
          createdAt: now - 10 * 24 * 60 * 60 * 1000,
        },
      ],
    },
    proofsByResidentId: {
      [residentId]: [
        {
          id: "1",
          name: "Senior Citizen ID",
          filename: "senior_id_scan.pdf",
          uploadDate: "Nov 1, 2025",
          status: "Valid",
        },
        {
          id: "2",
          name: "Voter's ID",
          filename: "voters_id.jpg",
          uploadDate: "Nov 1, 2025",
          status: "Valid",
        },
        {
          id: "3",
          name: "Face Verification",
          filename: "Captured on Nov 1, 2025",
          uploadDate: "Nov 1, 2025",
          status: "Valid",
        },
      ],
    },
  }
}

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const canUseStorage = () => typeof window !== "undefined"

const notifyStoreUpdated = () => {
  if (!canUseStorage()) return
  window.dispatchEvent(new Event(STORAGE_EVENT))
}

const readStorage = (): TalasysStorage => {
  const fallback = createDefaultStorage()
  if (!canUseStorage()) {
    return fallback
  }

  const parsed = safeParse<TalasysStorage>(window.localStorage.getItem(STORAGE_KEY), fallback)
  if (!window.localStorage.getItem(STORAGE_KEY)) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed))
  }
  return parsed
}

const writeStorage = (next: TalasysStorage) => {
  if (!canUseStorage()) return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notifyStoreUpdated()
}

const getRequests = (storage: TalasysStorage, residentId: string) => {
  return storage.requestsByResidentId[residentId] ?? []
}

const getNotifications = (storage: TalasysStorage, residentId: string) => {
  return storage.notificationsByResidentId[residentId] ?? []
}

const getProofs = (storage: TalasysStorage, residentId: string) => {
  return storage.proofsByResidentId[residentId] ?? []
}

export const subscribeToResidentStorage = (listener: () => void) => {
  if (!canUseStorage()) {
    return () => undefined
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener()
    }
  }

  window.addEventListener(STORAGE_EVENT, listener)
  window.addEventListener("storage", onStorage)

  return () => {
    window.removeEventListener(STORAGE_EVENT, listener)
    window.removeEventListener("storage", onStorage)
  }
}

export const loadSessionUser = () => {
  if (!canUseStorage()) return null
  return safeParse<AuthUser | null>(window.localStorage.getItem(SESSION_KEY), null)
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
  const storage = readStorage()
  return (
    storage.residentAccounts.find(
      (account) => account.username.toLowerCase() === username.toLowerCase() && account.password === password,
    ) ?? null
  )
}

export const findResidentByEmail = (email: string) => {
  const storage = readStorage()
  return storage.residentAccounts.find((account) => account.user.email.toLowerCase() === email.toLowerCase()) ?? null
}

export const registerResidentAccount = (input: CreateResidentAccountInput) => {
  const storage = readStorage()
  const normalizedEmail = input.email.trim().toLowerCase()
  const username = normalizedEmail

  const usernameTaken = storage.residentAccounts.some((account) => account.username === username)
  const emailTaken = storage.residentAccounts.some((account) => account.user.email.toLowerCase() === normalizedEmail)

  if (usernameTaken || emailTaken) {
    throw new Error("An account with this email already exists.")
  }

  const id = `resident-${generateId()}`
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
    password: input.password,
    user,
  }

  storage.residentAccounts.push(residentAccount)
  storage.requestsByResidentId[id] = []
  storage.proofsByResidentId[id] = input.proofs
  storage.notificationsByResidentId[id] = [
    {
      id: generateId(),
      type: "success",
      title: "Welcome to TALASYS",
      message: "Your account has been created successfully.",
      timestamp: "Just now",
      isRead: false,
      createdAt: Date.now(),
    },
  ]

  writeStorage(storage)

  return user
}

export const updateResidentUser = (residentId: string, updates: Partial<AuthUser>) => {
  const storage = readStorage()
  const account = storage.residentAccounts.find((item) => item.id === residentId)
  if (!account) {
    return null
  }

  account.user = {
    ...account.user,
    ...updates,
  }

  writeStorage(storage)
  return account.user
}

export const getResidentRequests = (residentId: string) => {
  const storage = readStorage()
  return getRequests(storage, residentId).slice().sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentNotifications = (residentId: string) => {
  const storage = readStorage()
  return getNotifications(storage, residentId).slice().sort((a, b) => b.createdAt - a.createdAt)
}

export const getResidentProofs = (residentId: string) => {
  const storage = readStorage()
  return getProofs(storage, residentId)
}

export const markAllResidentNotificationsRead = (residentId: string) => {
  const storage = readStorage()
  const notifications = getNotifications(storage, residentId)

  storage.notificationsByResidentId[residentId] = notifications.map((notification) => ({
    ...notification,
    isRead: true,
    type: notification.type === "urgent" ? "urgent" : "read",
  }))

  writeStorage(storage)
}

export const createResidentRequest = (residentId: string, input: CreateResidentRequestInput) => {
  const storage = readStorage()
  const requests = getRequests(storage, residentId)
  const sequence = requests.length + 1
  const year = new Date().getFullYear()
  const refNumber = `REQ-${year}-${sequence.toString().padStart(3, "0")}`

  const request: ResidentRequest = {
    id: generateId(),
    refNumber,
    documentType: input.documentType,
    dateRequested: formatDate(new Date()),
    status: "Pending",
    purpose: input.purpose,
    createdAt: Date.now(),
  }

  storage.requestsByResidentId[residentId] = [request, ...requests]

  const notifications = getNotifications(storage, residentId)
  storage.notificationsByResidentId[residentId] = [
    {
      id: generateId(),
      type: "info",
      title: "Request Submitted",
      message: `${input.documentType} (${refNumber}) is now being processed.`,
      timestamp: "Just now",
      isRead: false,
      createdAt: Date.now(),
    },
    ...notifications,
  ]

  writeStorage(storage)

  return request
}
