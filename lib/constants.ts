// ─── Firestore Collection Names ───
// Centralizing collection names prevents silent typos that only fail at runtime.
export const COLLECTION_USERS = "users"
export const COLLECTION_DOCUMENT_REQUESTS = "documentRequests"
export const COLLECTION_NOTIFICATIONS = "notifications"
export const COLLECTION_VERIFICATIONS = "verifications"
export const COLLECTION_ACTIVITY_LOGS = "activityLogs"
export const COLLECTION_SYSTEM_ALERTS = "systemAlerts"
export const COLLECTION_SYSTEM_CONFIG = "systemConfig"
export const SYSTEM_CONFIG_DOCUMENT_ID = "global"

// ─── Bootstrap Superadmin ───
// A single hardcoded account ensures the system can never be fully locked out.
// The password here is the initial bootstrap value; it should be changed after first login.
export const SUPERADMIN_EMAIL = "superadmin@barangay.gov.ph"
export const SUPERADMIN_BOOTSTRAP_PASSWORD = "superadmin123"
export const SUPERADMIN_FIRESTORE_ID = "superadmin-bootstrap"
export const SUPERADMIN_DISPLAY_NAME = "Super Admin"
export const SUPERADMIN_INITIALS = "SA"

// ─── Local / Session Storage Keys ───
export const SUPERADMIN_LOCAL_STORAGE_KEY = "talasys.superadmin"
export const RESIDENT_SESSION_STORAGE_KEY = "talasys.session.user.v2"

// ─── Master Storage Event ───
export const MASTER_STORAGE_UPDATED_EVENT = "talasys-master-storage-updated"

// ─── Inactivity Timeout ───
// Admin and superadmin sessions expire after 15 minutes of inactivity for security compliance.
export const ADMIN_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

// ─── Account Expiry ───
// Resident accounts are valid for 180 days from registration by barangay policy.
export const ACCOUNT_EXPIRY_DAYS = 180

// ─── Image Compression ───
// Images are capped at 1200px and compressed to WebP at 70% quality
// to reduce Cloudinary upload time without noticeable quality loss.
export const IMAGE_MAX_DIMENSION_PX = 1200
export const IMAGE_COMPRESSION_QUALITY = 0.7
export const IMAGE_UPLOAD_TIMEOUT_MS = 20_000
export const IMAGE_COMPRESSION_TIMEOUT_MS = 8_000

// ─── Cloudinary ───
// Secrets must be loaded from environment variables; never hardcode them.
export const CLOUDINARY_CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME as string
export const CLOUDINARY_API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY as string
// NOTE: The API secret is intentionally not exposed to the browser via NEXT_PUBLIC_.
// It is only used server-side for signed upload signature generation.
// If it appears here, it means the project has not yet migrated to a server-side signing endpoint.
export const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET as string

// ─── UI Badge Colors ───
// Consistent role/action colors used across audit logs and admin badges.
export const COLOR_ADMIN_BLUE = "#3b82f6"
export const COLOR_ADMIN_GREEN = "#10b981"
export const COLOR_ADMIN_RED = "#ef4444"
export const COLOR_ADMIN_AMBER = "#f59e0b"
export const COLOR_SUPERADMIN_GOLD = "#C5A55A"
export const COLOR_SUPERADMIN_NAVY = "#0C2340"
export const COLOR_SUPERADMIN_SLATE = "#2a5080"
export const COLOR_NEUTRAL_GRAY = "#94a3b8"

// ─── System Placeholder Labels ───
export const SYSTEM_ADMIN_DISPLAY_NAME = "System Admin"
export const SYSTEM_ADMIN_INITIALS = "AD"
