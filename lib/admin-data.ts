// Admin dummy data for all admin pages

export interface AdminResident {
  id: string
  name: string
  initials: string
  age: number
  gender: "Male" | "Female"
  address: string
  categories: string[]
  status: "Active" | "Expired" | "Expiring"
  isVoter: boolean
  expiryDate: string
  dateOfBirth: string
  contactNumber: string
  email: string
}

export interface PendingVerification {
  id: string
  name: string
  initials: string
  type: "registration" | "profile-edit" | "reactivation"
  submittedDate: string
  categories: string[]
  age?: number
  gender?: "Male" | "Female"
  address?: string
  changes?: {
    field: string
    oldValue: string
    newValue: string
  }[]
  reason?: string
  documents: {
    name: string
    status: "verified" | "pending" | "valid"
    uploadDate?: string
  }[]
}

export interface AdminDocumentRequest {
  id: string
  residentName: string
  residentInitials: string
  residentCategory: string
  documentType: string
  purpose: string
  dateRequested: string
  status: "Pending" | "Approved" | "Rejected"
  // Optional fields for requests submitted on behalf of someone else
  requestFor?: "myself" | "other"
  requestedByName?: string
  requestedByContact?: string
  relationship?: string
  authorizationLetter?: string // filename or URL
}

export interface AdminNotification {
  id: string
  type: "registration" | "expiring" | "reactivation" | "success" | "error" | "info"
  title: string
  message: string
  timestamp: string
  isRead: boolean
  residentName?: string
  actionUrl?: string
}

export interface ActivityLog {
  id: string
  time: string
  action: string
  actionType: "approved" | "rejected" | "generated" | "verified" | "sent"
  residentName?: string
  details: string
}

export const adminResidents: AdminResident[] = [
  {
    id: "1",
    name: "Rosa Martinez",
    initials: "RM",
    age: 67,
    gender: "Female",
    address: "Purok 2, Brgy. Sample, City",
    categories: ["Senior Citizen", "Voter"],
    status: "Active",
    isVoter: true,
    expiryDate: "May 2026",
    dateOfBirth: "March 15, 1958",
    contactNumber: "0917-123-4567",
    email: "rosa.martinez@email.com",
  },
  {
    id: "2",
    name: "Juan Carlos",
    initials: "JC",
    age: 72,
    gender: "Male",
    address: "Purok 1, Brgy. Sample, City",
    categories: ["Senior Citizen", "Voter"],
    status: "Active",
    isVoter: true,
    expiryDate: "Apr 2026",
    dateOfBirth: "June 10, 1953",
    contactNumber: "0918-234-5678",
    email: "juan.carlos@email.com",
  },
  {
    id: "3",
    name: "Maria Esperanza",
    initials: "ME",
    age: 65,
    gender: "Female",
    address: "Purok 3, Brgy. Sample, City",
    categories: ["Senior Citizen"],
    status: "Expiring",
    isVoter: false,
    expiryDate: "Dec 2025",
    dateOfBirth: "August 20, 1960",
    contactNumber: "0919-345-6789",
    email: "maria.esperanza@email.com",
  },
  {
    id: "4",
    name: "Pedro Reyes",
    initials: "PR",
    age: 70,
    gender: "Male",
    address: "Purok 2, Brgy. Sample, City",
    categories: ["Senior Citizen", "Voter"],
    status: "Expired",
    isVoter: true,
    expiryDate: "Oct 2025",
    dateOfBirth: "May 5, 1955",
    contactNumber: "0920-456-7890",
    email: "pedro.reyes@email.com",
  },
  {
    id: "5",
    name: "Lourdes Santos",
    initials: "LS",
    age: 68,
    gender: "Female",
    address: "Purok 4, Brgy. Sample, City",
    categories: ["Senior Citizen", "Voter"],
    status: "Active",
    isVoter: true,
    expiryDate: "Jun 2026",
    dateOfBirth: "February 12, 1957",
    contactNumber: "0921-567-8901",
    email: "lourdes.santos@email.com",
  },
]

export const allResidents: AdminResident[] = [
  ...adminResidents,
  {
    id: "6",
    name: "Carlos Mendez",
    initials: "CM",
    age: 35,
    gender: "Male",
    address: "Purok 5, Brgy. Sample, City",
    categories: ["Adult", "Voter"],
    status: "Active",
    isVoter: true,
    expiryDate: "Mar 2027",
    dateOfBirth: "April 10, 1990",
    contactNumber: "0922-678-9012",
    email: "carlos.mendez@email.com",
  },
  {
    id: "7",
    name: "Ana Garcia",
    initials: "AG",
    age: 28,
    gender: "Female",
    address: "Purok 1, Brgy. Sample, City",
    categories: ["Adult", "Voter"],
    status: "Active",
    isVoter: true,
    expiryDate: "Jul 2026",
    dateOfBirth: "September 22, 1997",
    contactNumber: "0923-789-0123",
    email: "ana.garcia@email.com",
  },
  {
    id: "8",
    name: "Sofia Cruz",
    initials: "SC",
    age: 15,
    gender: "Female",
    address: "Purok 2, Brgy. Sample, City",
    categories: ["Underage"],
    status: "Active",
    isVoter: false,
    expiryDate: "Jan 2028",
    dateOfBirth: "November 5, 2010",
    contactNumber: "0924-890-1234",
    email: "sofia.cruz@email.com",
  },
  {
    id: "9",
    name: "Miguel Torres",
    initials: "MT",
    age: 42,
    gender: "Male",
    address: "Purok 3, Brgy. Sample, City",
    categories: ["Adult"],
    status: "Active",
    isVoter: false,
    expiryDate: "Sep 2026",
    dateOfBirth: "January 18, 1983",
    contactNumber: "0925-901-2345",
    email: "miguel.torres@email.com",
  },
  {
    id: "10",
    name: "Elena Rodriguez",
    initials: "ER",
    age: 52,
    gender: "Female",
    address: "Purok 4, Brgy. Sample, City",
    categories: ["Adult", "Voter"],
    status: "Expiring",
    isVoter: true,
    expiryDate: "Dec 2025",
    dateOfBirth: "March 30, 1973",
    contactNumber: "0926-012-3456",
    email: "elena.rodriguez@email.com",
  },
]

export const pendingVerifications: PendingVerification[] = [
  {
    id: "1",
    name: "Maria Santos",
    initials: "MS",
    type: "registration",
    submittedDate: "Nov 27",
    categories: ["Senior", "Voter"],
    age: 67,
    gender: "Female",
    address: "Purok 3, Brgy. Sample, City",
    documents: [
      { name: "Birth Certificate", status: "verified" },
      { name: "Senior Citizen ID", status: "pending" },
      { name: "Voter's Certificate / ID", status: "pending" },
    ],
  },
  {
    id: "2",
    name: "Luis Ramos",
    initials: "LR",
    type: "registration",
    submittedDate: "Nov 26",
    categories: ["Adult", "Voter"],
    documents: [{ name: "Birth Certificate", status: "verified" }],
  },
  {
    id: "3",
    name: "Rosa Perez",
    initials: "RP",
    type: "profile-edit",
    submittedDate: "Nov 27",
    categories: ["Address Change", "Contact Update"],
    changes: [
      {
        field: "ADDRESS",
        oldValue: "Purok 2, Brgy. Sample, City",
        newValue: "Purok 5, Brgy. Sample, City",
      },
      {
        field: "CONTACT NUMBER",
        oldValue: "0917-123-4567",
        newValue: "0919-876-5432",
      },
    ],
    reason: "Moved to new address within the barangay",
    documents: [{ name: "Proof of New Address (Utility Bill)", status: "pending", uploadDate: "Nov 27, 2024" }],
  },
  {
    id: "4",
    name: "Elena Dizon",
    initials: "ED",
    type: "reactivation",
    submittedDate: "Nov 27",
    age: 68,
    gender: "Female",
    categories: ["Expired", "Senior • Voter"],
    reason: "I need to request barangay clearance for medical assistance",
    documents: [
      { name: "Senior Citizen ID (Still Valid)", status: "valid" },
      { name: "Voter's ID (Still Valid)", status: "valid" },
    ],
  },
  {
    id: "5",
    name: "Lucas Fernandez",
    initials: "LF",
    type: "profile-edit",
    submittedDate: "Nov 26",
    age: 14,
    gender: "Male",
    categories: ["Minor", "Contact Update"],
    changes: [
      {
        field: "CONTACT NUMBER",
        oldValue: "0917-111-2222",
        newValue: "0919-333-4444",
      },
    ],
    reason: "Parent's new contact number",
    documents: [
      { name: "Parent's Valid ID", status: "pending", uploadDate: "Nov 26, 2024" },
      { name: "Birth Certificate (On File)", status: "valid" },
    ],
  },
]

export const adminDocumentRequests: AdminDocumentRequest[] = [
  {
    id: "1",
    residentName: "Pedro Reyes",
    residentInitials: "PR",
    residentCategory: "Senior Citizen",
    documentType: "Brgy. Clearance",
    purpose: "Employment",
    dateRequested: "Nov 27",
    status: "Pending",
  },
  {
    id: "2",
    residentName: "Maria Santos",
    residentInitials: "MS",
    residentCategory: "Registered Voter",
    documentType: "Cert. of Indigency",
    purpose: "Medical Assistance",
    dateRequested: "Nov 26",
    status: "Approved",
  },
  {
    id: "3",
    residentName: "Juan Carlos",
    residentInitials: "JC",
    residentCategory: "Adult",
    documentType: "Cert. of Residency",
    purpose: "Bank Requirement",
    dateRequested: "Nov 26",
    status: "Approved",
  },
  {
    id: "4",
    residentName: "Ana Garcia",
    residentInitials: "AG",
    residentCategory: "Minor",
    documentType: "Brgy. Clearance",
    purpose: "School Requirement",
    dateRequested: "Nov 25",
    status: "Approved",
  },
  // Example: request made by a representative with authorization letter attached
  {
    id: "5",
    residentName: "Sofia Cruz",
    residentInitials: "SC",
    residentCategory: "Underage",
    documentType: "Brgy. Clearance",
    purpose: "School Enrollment",
    dateRequested: "Dec 02",
    status: "Pending",
    requestFor: "other",
    requestedByName: "Elena Rodriguez",
    requestedByContact: "0926-012-3456",
    relationship: "Parent",
    authorizationLetter: "authorization_elena_rodriguez.pdf",
  },
]

export const adminNotifications: AdminNotification[] = [
  {
    id: "1",
    type: "registration",
    title: "New Registration Submitted",
    message: "Maria Santos has submitted a new registration request.",
    timestamp: "2 minutes ago",
    isRead: false,
    residentName: "Maria Santos",
    actionUrl: "/admin/verifications",
  },
  {
    id: "2",
    type: "expiring",
    title: "Accounts Expiring Soon",
    message: "15 resident accounts will expire within 30 days.",
    timestamp: "1 hour ago",
    isRead: false,
    actionUrl: "/admin/residents",
  },
  {
    id: "3",
    type: "reactivation",
    title: "Reactivation Request",
    message: "Jose Garcia is requesting account reactivation.",
    timestamp: "3 hours ago",
    isRead: false,
    residentName: "Jose Garcia",
    actionUrl: "/admin/verifications",
  },
  {
    id: "4",
    type: "success",
    title: "Profile Edit Approved",
    message: "You approved Ana Cruz's profile edit request.",
    timestamp: "Yesterday at 4:30 PM",
    isRead: true,
  },
  {
    id: "5",
    type: "info",
    title: "Document Request Completed",
    message: "Clearance for Pedro Reyes has been generated.",
    timestamp: "Yesterday at 2:15 PM",
    isRead: true,
  },
]

export const activityLogs: ActivityLog[] = [
  {
    id: "1",
    time: "2:45 PM",
    action: "Approved Clearance",
    actionType: "approved",
    residentName: "Pedro Reyes",
    details: "Barangay Clearance for employment",
  },
  {
    id: "2",
    time: "2:30 PM",
    action: "Approved Registration",
    actionType: "approved",
    residentName: "Luis Ramos",
    details: "New resident registration",
  },
  {
    id: "3",
    time: "1:15 PM",
    action: "Rejected Registration",
    actionType: "rejected",
    residentName: "Carlos Mendez",
    details: "Invalid birth certificate",
  },
  {
    id: "4",
    time: "12:00 PM",
    action: "Generated Report",
    actionType: "generated",
    details: "Senior Citizens PDF (423 records)",
  },
  {
    id: "5",
    time: "11:30 AM",
    action: "Verified Documents",
    actionType: "verified",
    residentName: "Maria Santos",
    details: "Senior ID and Voter ID verified",
  },
  {
    id: "6",
    time: "10:45 AM",
    action: "Approved Profile Edit",
    actionType: "approved",
    residentName: "Ana Cruz",
    details: "Address change approved",
  },
  {
    id: "7",
    time: "10:00 AM",
    action: "Sent Notification",
    actionType: "sent",
    residentName: "15 residents",
    details: "Account expiry reminder",
  },
  {
    id: "8",
    time: "9:30 AM",
    action: "Approved Reactivation",
    actionType: "approved",
    residentName: "Roberto Tan",
    details: "Account reactivated after 6 months",
  },
]

// ─── Analytical datasets for enhanced admin pages ───

export const dashboardWeeklyTrend = [
  { day: "Mon", requests: 14, verifications: 8, documents: 12 },
  { day: "Tue", requests: 18, verifications: 10, documents: 15 },
  { day: "Wed", requests: 12, verifications: 6, documents: 9 },
  { day: "Thu", requests: 22, verifications: 14, documents: 18 },
  { day: "Fri", requests: 20, verifications: 12, documents: 16 },
  { day: "Sat", requests: 8, verifications: 4, documents: 5 },
  { day: "Sun", requests: 5, verifications: 2, documents: 3 },
]

export const verificationFlowTrend = [
  { week: "W1", pending: 12, approved: 18, rejected: 3 },
  { week: "W2", pending: 15, approved: 22, rejected: 4 },
  { week: "W3", pending: 8, approved: 14, rejected: 2 },
  { week: "W4", pending: 10, approved: 20, rejected: 5 },
]

export const requestTypeTrend = [
  { month: "Aug", clearance: 42, residency: 28, indigency: 18 },
  { month: "Sep", clearance: 38, residency: 32, indigency: 22 },
  { month: "Oct", clearance: 45, residency: 25, indigency: 20 },
  { month: "Nov", clearance: 52, residency: 30, indigency: 26 },
]

export const generationVolumeTrend = [
  { month: "Aug", count: 86 },
  { month: "Sep", count: 92 },
  { month: "Oct", count: 88 },
  { month: "Nov", count: 108 },
]

export const categoryPopulationTrend = [
  { month: "Aug", senior: 410, minor: 595, adult: 1780, voter: 1860 },
  { month: "Sep", senior: 415, minor: 600, adult: 1795, voter: 1870 },
  { month: "Oct", senior: 420, minor: 608, adult: 1805, voter: 1882 },
  { month: "Nov", senior: 423, minor: 612, adult: 1812, voter: 1892 },
]

export const logActionFrequency = [
  { hour: "8AM", actions: 4 },
  { hour: "9AM", actions: 8 },
  { hour: "10AM", actions: 12 },
  { hour: "11AM", actions: 10 },
  { hour: "12PM", actions: 6 },
  { hour: "1PM", actions: 9 },
  { hour: "2PM", actions: 14 },
  { hour: "3PM", actions: 11 },
  { hour: "4PM", actions: 7 },
  { hour: "5PM", actions: 3 },
]

export const notificationSummary = [
  { type: "Registrations", count: 8, color: "#3b82f6" },
  { type: "Expiring", count: 15, color: "#f59e0b" },
  { type: "Requests", count: 5, color: "#8b5cf6" },
  { type: "System", count: 3, color: "#64748b" },
]
