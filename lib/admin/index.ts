// Admin domain — admin-facing store operations and types
export {
  getAdminResidents,
  updateAdminResident,
  deleteAdminResident,
  addAdminResident,
  getAdminVerifications,
  getAdminRejectedVerifications,
  getAdminDeniedVerifications,
  addAdminVerification,
  approveVerification,
  rejectVerification,
  denyRegistration,
  getAdminDocumentRequests,
  addAdminDocumentRequest,
  updateDocumentRequestStatus,
  deleteAdminDocumentRequest,
  getAdminNotifications,
  addAdminNotification,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  deleteAdminNotification,
  getAdminActivityLogs,
  addAdminActivityLog,
  clearAdminActivityLogs,
  getAdminDashboardStats,
  subscribeToAdminStorage,
} from "./admin-store"
export type {
  AdminResident,
  AdminDocumentRequest,
  AdminNotification,
  PendingVerification,
  ActivityLog,
} from "./admin-store"

export {
  isAdminPaymentQueueEligible,
  TERMINAL_REQUEST_STATUSES,
} from "./payment-queue-policy"
export type { PaymentQueueCandidate } from "./payment-queue-policy"
