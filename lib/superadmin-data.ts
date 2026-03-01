// Superadmin Dashboard Data
// Centralized dummy data for the analytical command center

// === KPI Metrics ===
export const kpiMetrics = {
  totalPopulation: { value: 12458, change: +2.4, trend: "up" as const },
  activeRequests: { value: 47, change: +12.5, trend: "up" as const },
  pendingVerifications: { value: 18, change: -8.3, trend: "down" as const },
  avgProcessingDays: { value: 1.8, change: -15.0, trend: "down" as const },
  approvalRate: { value: 94.2, change: +1.1, trend: "up" as const },
}

// === Time-Series Data ===
export const dailyRequests = [
  { day: "Mon", requests: 18, approvals: 15 },
  { day: "Tue", requests: 24, approvals: 20 },
  { day: "Wed", requests: 31, approvals: 28 },
  { day: "Thu", requests: 22, approvals: 19 },
  { day: "Fri", requests: 35, approvals: 30 },
  { day: "Sat", requests: 12, approvals: 10 },
  { day: "Sun", requests: 8, approvals: 7 },
]

export const weeklyRequests = [
  { week: "W1", requests: 98, approvals: 85 },
  { week: "W2", requests: 112, approvals: 101 },
  { week: "W3", requests: 89, approvals: 78 },
  { week: "W4", requests: 134, approvals: 120 },
  { week: "W5", requests: 107, approvals: 96 },
  { week: "W6", requests: 145, approvals: 130 },
  { week: "W7", requests: 121, approvals: 110 },
  { week: "W8", requests: 150, approvals: 138 },
]

export const monthlyRequests = [
  { month: "Jul", requests: 320, approvals: 285 },
  { month: "Aug", requests: 345, approvals: 310 },
  { month: "Sep", requests: 298, approvals: 265 },
  { month: "Oct", requests: 410, approvals: 375 },
  { month: "Nov", requests: 380, approvals: 348 },
  { month: "Dec", requests: 290, approvals: 260 },
  { month: "Jan", requests: 425, approvals: 390 },
  { month: "Feb", requests: 460, approvals: 420 },
  { month: "Mar", requests: 390, approvals: 355 },
  { month: "Apr", requests: 510, approvals: 470 },
  { month: "May", requests: 485, approvals: 448 },
  { month: "Jun", requests: 540, approvals: 502 },
]

// === Distribution Data ===
export const populationDistribution = [
  { name: "Adults (18-59)", value: 8225, color: "#0C2340" },
  { name: "Seniors (60+)", value: 2341, color: "#1a3a5c" },
  { name: "Minors (<18)", value: 1892, color: "#2a5080" },
]

export const documentTypeBreakdown = [
  { name: "Brgy Clearance", value: 542, color: "#0C2340" },
  { name: "Cert of Indigency", value: 387, color: "#1a3a5c" },
  { name: "Cert of Residency", value: 234, color: "#2a5080" },
  { name: "Other", value: 89, color: "#C5A55A" },
]

export const requestPurposes = [
  { purpose: "Employment", count: 186, percentage: 34 },
  { purpose: "School Enrollment", count: 120, percentage: 22 },
  { purpose: "Bank/Loan", count: 98, percentage: 18 },
  { purpose: "Gov't ID Application", count: 66, percentage: 12 },
  { purpose: "Business Permit", count: 44, percentage: 8 },
  { purpose: "Other", count: 33, percentage: 6 },
]

// === Alerts & Anomalies ===
export type AlertSeverity = "critical" | "warning" | "info"

export interface SystemAlert {
  id: string
  severity: AlertSeverity
  title: string
  description: string
  timestamp: string
  metric?: string
}

export const systemAlerts: SystemAlert[] = [
  {
    id: "a1",
    severity: "critical",
    title: "Request spike detected",
    description: "Document requests are 68% above the weekly average. Review staffing.",
    timestamp: "12 min ago",
    metric: "+68%",
  },
  {
    id: "a2",
    severity: "warning",
    title: "23 accounts expiring soon",
    description: "Accounts expiring within 30 days. Send notifications to affected residents.",
    timestamp: "1 hour ago",
    metric: "23",
  },
  {
    id: "a3",
    severity: "warning",
    title: "Verification backlog growing",
    description: "Pending verifications increased 40% over last week. 18 items in queue.",
    timestamp: "3 hours ago",
    metric: "+40%",
  },
  {
    id: "a4",
    severity: "info",
    title: "Monthly report ready",
    description: "The February 2026 barangay operations report is ready for review.",
    timestamp: "5 hours ago",
  },
]

// === Processing Pipeline ===
export const processingPipeline = {
  submitted: 47,
  underReview: 18,
  approved: 502,
  rejected: 38,
}

// === Recent Admin Activity ===
export interface AdminActivity {
  admin: string
  initials: string
  action: string
  detail: string
  timestamp: string
  type: "approval" | "verification" | "rejection" | "generation" | "system"
}

export const recentAdminActivity: AdminActivity[] = [
  {
    admin: "Juan D.",
    initials: "JD",
    action: "Approved",
    detail: "5 document requests (Brgy Clearance)",
    timestamp: "2 min ago",
    type: "approval",
  },
  {
    admin: "Maria R.",
    initials: "MR",
    action: "Verified",
    detail: "3 resident accounts",
    timestamp: "15 min ago",
    type: "verification",
  },
  {
    admin: "Pedro S.",
    initials: "PS",
    action: "Rejected",
    detail: "1 request - incomplete documents",
    timestamp: "1 hour ago",
    type: "rejection",
  },
  {
    admin: "Ana C.",
    initials: "AC",
    action: "Generated",
    detail: "Monthly operations report",
    timestamp: "2 hours ago",
    type: "generation",
  },
  {
    admin: "System",
    initials: "SY",
    action: "Auto-flagged",
    detail: "3 accounts for expiry review",
    timestamp: "4 hours ago",
    type: "system",
  },
]

// === Performance Metrics ===
export const performanceMetrics = {
  approvalRate: 94.2,
  avgTurnaroundHours: 43.2,
  todayProcessed: 14,
  todayPending: 8,
  satisfactionScore: 4.6,
}

// === Sparkline data for KPI cards ===
export const populationSparkline = [12100, 12180, 12250, 12290, 12340, 12400, 12458]
export const requestsSparkline = [32, 28, 41, 38, 52, 44, 47]
export const verificationsSparkline = [24, 20, 18, 22, 15, 20, 18]
export const processingSparkline = [2.4, 2.1, 2.0, 1.9, 1.8, 1.9, 1.8]
export const approvalSparkline = [91.5, 92.0, 93.1, 93.8, 94.0, 93.9, 94.2]

// === Admin Accounts (used by admins page) ===
export const adminAccounts = [
  {
    id: "admin-1",
    name: "Juan Dela Cruz",
    initials: "JD",
    email: "juan@barangay.gov.ph",
    role: "Full Access",
    status: "Active",
    isOnline: true,
    lastActive: "2 minutes ago",
    createdDate: "Jan 15, 2025",
  },
  {
    id: "admin-2",
    name: "Maria Reyes",
    initials: "MR",
    email: "maria@barangay.gov.ph",
    role: "Verification Only",
    status: "Active",
    isOnline: true,
    lastActive: "15 minutes ago",
    createdDate: "Feb 1, 2025",
  },
  {
    id: "admin-3",
    name: "Pedro Santos",
    initials: "PS",
    email: "pedro@barangay.gov.ph",
    role: "Documents Only",
    status: "Active",
    isOnline: false,
    lastActive: "1 hour ago",
    createdDate: "Mar 10, 2025",
  },
  {
    id: "admin-4",
    name: "Ana Cruz",
    initials: "AC",
    email: "ana@barangay.gov.ph",
    role: "Full Access",
    status: "Active",
    isOnline: true,
    lastActive: "5 minutes ago",
    createdDate: "Apr 5, 2025",
  },
  {
    id: "admin-5",
    name: "Roberto Lim",
    initials: "RL",
    email: "roberto@barangay.gov.ph",
    role: "View Only",
    status: "Locked",
    isOnline: false,
    lastActive: "3 days ago",
    createdDate: "May 20, 2025",
  },
]

// === Audit Logs (used by audit page) ===
export const auditLogs = [
  {
    id: "log-1",
    date: "Feb 19, 2026",
    timestamp: "2:34 PM",
    admin: { name: "Juan Dela Cruz", initials: "JD", color: "#3b82f6" },
    actionType: "Approved Doc",
    details: "Approved Barangay Clearance for Maria Santos (REQ-2026-0847)",
    ipAddress: "192.168.1.101",
  },
  {
    id: "log-2",
    date: "Feb 19, 2026",
    timestamp: "2:15 PM",
    admin: { name: "Maria Reyes", initials: "MR", color: "#10b981" },
    actionType: "Verified Account",
    details: "Verified resident account for Pedro Reyes (RES-2026-1234)",
    ipAddress: "192.168.1.102",
  },
  {
    id: "log-3",
    date: "Feb 19, 2026",
    timestamp: "1:50 PM",
    admin: { name: "Pedro Santos", initials: "PS", color: "#f59e0b" },
    actionType: "Rejected Doc",
    details: "Rejected Certificate of Indigency — incomplete documents (REQ-2026-0845)",
    ipAddress: "192.168.1.103",
  },
  {
    id: "log-4",
    date: "Feb 19, 2026",
    timestamp: "1:30 PM",
    admin: { name: "Juan Dela Cruz", initials: "JD", color: "#3b82f6" },
    actionType: "Generated Doc",
    details: "Generated Barangay Clearance PDF for Ana Cruz (REQ-2026-0844)",
    ipAddress: "192.168.1.101",
  },
  {
    id: "log-5",
    date: "Feb 19, 2026",
    timestamp: "12:45 PM",
    admin: { name: "Maria Reyes", initials: "MR", color: "#10b981" },
    actionType: "Approved Doc",
    details: "Approved Certificate of Residency for Roberto Lim (REQ-2026-0843)",
    ipAddress: "192.168.1.102",
  },
  {
    id: "log-6",
    date: "Feb 19, 2026",
    timestamp: "11:20 AM",
    admin: { name: "Juan Dela Cruz", initials: "JD", color: "#3b82f6" },
    actionType: "Config Edit",
    details: "Updated document processing workflow settings",
    ipAddress: "192.168.1.101",
  },
  {
    id: "log-7",
    date: "Feb 19, 2026",
    timestamp: "10:05 AM",
    admin: { name: "Pedro Santos", initials: "PS", color: "#f59e0b" },
    actionType: "Login",
    details: "Admin login — session started",
    ipAddress: "192.168.1.103",
  },
  {
    id: "log-8",
    date: "Feb 18, 2026",
    timestamp: "4:30 PM",
    admin: { name: "Maria Reyes", initials: "MR", color: "#10b981" },
    actionType: "Verified Account",
    details: "Verified 3 resident accounts (bulk verification)",
    ipAddress: "192.168.1.102",
  },
  {
    id: "log-9",
    date: "Feb 18, 2026",
    timestamp: "3:15 PM",
    admin: { name: "Juan Dela Cruz", initials: "JD", color: "#3b82f6" },
    actionType: "Approved Doc",
    details: "Approved 4 Barangay Clearance requests (batch)",
    ipAddress: "192.168.1.101",
  },
  {
    id: "log-10",
    date: "Feb 18, 2026",
    timestamp: "2:00 PM",
    admin: { name: "Pedro Santos", initials: "PS", color: "#f59e0b" },
    actionType: "Generated Doc",
    details: "Generated monthly operations report for January 2026",
    ipAddress: "192.168.1.103",
  },
]

// === Reason Analytics (used by analytics page) ===
export const reasonAnalytics = [
  { rank: 1, reason: "Employment Requirement", count: 1648, percentage: 34 },
  { rank: 2, reason: "School Enrollment", count: 1066, percentage: 22 },
  { rank: 3, reason: "Bank/Loan Application", count: 873, percentage: 18 },
  { rank: 4, reason: "Government ID Application", count: 582, percentage: 12 },
  { rank: 5, reason: "Business Permit", count: 388, percentage: 8 },
  { rank: 6, reason: "Medical/Hospital", count: 194, percentage: 4 },
  { rank: 7, reason: "Travel/Immigration", count: 97, percentage: 2 },
]

// =====================================================
// ENHANCED PAGE DATASETS
// =====================================================

// === Admin Management — Activity Trend ===
export const adminActivityTrend = [
  { month: "Sep", logins: 180, actions: 420 },
  { month: "Oct", logins: 195, actions: 460 },
  { month: "Nov", logins: 210, actions: 510 },
  { month: "Dec", logins: 175, actions: 380 },
  { month: "Jan", logins: 220, actions: 530 },
  { month: "Feb", logins: 240, actions: 580 },
]

export const roleDistribution = [
  { name: "Full Access", value: 2, color: "#0C2340" },
  { name: "Verification Only", value: 1, color: "#2a5080" },
  { name: "Documents Only", value: 1, color: "#C5A55A" },
  { name: "View Only", value: 1, color: "#94a3b8" },
]

export const adminRecentActions = [
  { admin: "Juan D.", action: "Approved 5 clearance requests", time: "2 min ago", type: "approval" as const },
  { admin: "Maria R.", action: "Verified 3 resident accounts", time: "15 min ago", type: "verification" as const },
  { admin: "Ana C.", action: "Generated monthly report", time: "1 hr ago", type: "generation" as const },
  { admin: "Pedro S.", action: "Rejected incomplete request", time: "2 hr ago", type: "rejection" as const },
  { admin: "Juan D.", action: "Updated system configuration", time: "3 hr ago", type: "system" as const },
]

// === System Reports — Generation Trends ===
export const reportGenerationTrend = [
  { month: "Sep", population: 12, documents: 34, analytics: 6 },
  { month: "Oct", population: 15, documents: 42, analytics: 8 },
  { month: "Nov", population: 14, documents: 38, analytics: 7 },
  { month: "Dec", population: 10, documents: 28, analytics: 5 },
  { month: "Jan", population: 18, documents: 48, analytics: 9 },
  { month: "Feb", population: 20, documents: 52, analytics: 11 },
]

export const reportTypeBreakdown = [
  { name: "Population", value: 89, color: "#0C2340" },
  { name: "Document", value: 242, color: "#2a5080" },
  { name: "Analytics", value: 46, color: "#C5A55A" },
  { name: "Custom", value: 23, color: "#94a3b8" },
]

// === Category Reports — Population Trends ===
export const categoryTrendData = [
  { month: "Jul", seniors: 2280, adults: 8050, minors: 1820, voters: 7050 },
  { month: "Aug", seniors: 2290, adults: 8080, minors: 1830, voters: 7080 },
  { month: "Sep", seniors: 2300, adults: 8100, minors: 1840, voters: 7100 },
  { month: "Oct", seniors: 2310, adults: 8140, minors: 1855, voters: 7130 },
  { month: "Nov", seniors: 2320, adults: 8170, minors: 1870, voters: 7170 },
  { month: "Dec", seniors: 2325, adults: 8190, minors: 1875, voters: 7190 },
  { month: "Jan", seniors: 2330, adults: 8200, minors: 1880, voters: 7200 },
  { month: "Feb", seniors: 2341, adults: 8225, minors: 1892, voters: 7234 },
]

export const categoryDistribution = [
  { name: "Adults (18-59)", value: 8225, color: "#0C2340", change: +2.1 },
  { name: "Seniors (60+)", value: 2341, color: "#2a5080", change: +1.8 },
  { name: "Minors (<18)", value: 1892, color: "#C5A55A", change: +3.2 },
]

// === System Configuration — Health & Changes ===
export const systemHealthMetrics = {
  uptime: 99.7,
  storageUsed: 42,
  storageTotal: 100,
  lastBackup: "2 hours ago",
  responseTime: 145,
  activeModules: 4,
  totalModules: 6,
  activeDocTypes: 5,
  totalDocTypes: 6,
}

export const configChangeLog = [
  { action: "Updated Barangay Captain signature", admin: "Super Admin", time: "1 day ago", type: "branding" },
  { action: "Enabled Email Notifications module", admin: "Super Admin", time: "3 days ago", type: "module" },
  { action: "Modified Clearance template body", admin: "Super Admin", time: "5 days ago", type: "template" },
  { action: "Added First Time Job Seeker doc type", admin: "Super Admin", time: "1 week ago", type: "document" },
  { action: "Updated barangay contact number", admin: "Super Admin", time: "2 weeks ago", type: "branding" },
]

// === Audit Logs — Activity Distribution ===
export const auditHourlyActivity = [
  { hour: "6AM", actions: 5 },
  { hour: "7AM", actions: 12 },
  { hour: "8AM", actions: 28 },
  { hour: "9AM", actions: 45 },
  { hour: "10AM", actions: 52 },
  { hour: "11AM", actions: 48 },
  { hour: "12PM", actions: 22 },
  { hour: "1PM", actions: 35 },
  { hour: "2PM", actions: 58 },
  { hour: "3PM", actions: 50 },
  { hour: "4PM", actions: 42 },
  { hour: "5PM", actions: 18 },
]

export const auditActionBreakdown = [
  { name: "Approvals", value: 312, color: "#10b981" },
  { name: "Verifications", value: 198, color: "#3b82f6" },
  { name: "Rejections", value: 87, color: "#ef4444" },
  { name: "Doc Generation", value: 156, color: "#C5A55A" },
  { name: "Logins", value: 89, color: "#0C2340" },
  { name: "Config Changes", value: 50, color: "#94a3b8" },
]

export const auditWeeklyTrend = [
  { day: "Mon", actions: 142 },
  { day: "Tue", actions: 168 },
  { day: "Wed", actions: 155 },
  { day: "Thu", actions: 147 },
  { day: "Fri", actions: 180 },
  { day: "Sat", actions: 62 },
  { day: "Sun", actions: 38 },
]

// === Reason Analytics — Enhanced trends ===
export const reasonTrendData = [
  { month: "Jan", employment: 450, school: 500, bank: 520, govId: 200 },
  { month: "Feb", employment: 440, school: 490, bank: 515, govId: 195 },
  { month: "Mar", employment: 460, school: 480, bank: 510, govId: 210 },
  { month: "Apr", employment: 430, school: 485, bank: 520, govId: 205 },
  { month: "May", employment: 420, school: 475, bank: 510, govId: 215 },
  { month: "Jun", employment: 470, school: 470, bank: 505, govId: 220 },
]

export const reasonByDocType = [
  { docType: "Brgy Clearance", employment: 45, school: 30, bank: 15, other: 10 },
  { docType: "Cert Indigency", employment: 10, school: 35, bank: 15, other: 40 },
  { docType: "Cert Residency", employment: 20, school: 10, bank: 50, other: 20 },
  { docType: "Business Clr", employment: 5, school: 0, bank: 0, other: 95 },
]
