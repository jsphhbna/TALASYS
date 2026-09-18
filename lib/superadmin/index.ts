// SuperAdmin domain — system-level admin account management, audit logs, alerts, and config
export {
  getAdminAccounts,
  findAdminByCredentials,
  addAdminAccount,
  updateAdminAccount,
  deleteAdminAccount,
  getAuditLogs,
  addAuditLog,
  clearAuditLogs,
  getSystemAlerts,
  addSystemAlert,
  dismissSystemAlert,
  getSystemConfig,
  updateSystemConfig,
  getSuperAdminStats,
  subscribeToSAStorage,
} from "./superadmin-store"
export type { AdminAccount, SystemAlert, SystemConfig, AuditLog, AlertSeverity } from "./superadmin-store"
