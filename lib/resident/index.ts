// Resident domain — registration, session, requests, documents, status, media upload, OCR
export {
  loadSessionUser,
  saveSessionUser,
  findResidentByCredentials,
  findResidentByEmail,
  registerResidentAccount,
  cancelResidentRequest,
  deleteResidentAccount,
  updateResidentUser,
  getResidentRequests,
  getResidentNotifications,
  getResidentVerification,
  getResidentSystemConfig,
  getResidentProofs,
  markAllResidentNotificationsRead,
  createResidentRequest,
  readStorage,
  writeStorage,
  subscribeToResidentStorage,
} from "./local-storage-store"
export type {
  ResidentRequest,
  ResidentNotification,
  ResidentAccountRecord,
  ResidentProofDocument,
  CreateResidentAccountInput,
  CreateResidentRequestInput,
} from "./local-storage-store"

export { uploadFileToCloudinary } from "./cloudinary"

export {
  getRequiredDocuments,
} from "./resident-documents"
export type { UploadField, UploadTheme, RequiredDocumentConfig } from "./resident-documents"

export {
  calculateAge,
  deriveStatusesFromAge,
  mergeWithAutoStatuses,
} from "./resident-status"
export type { AutoResidentStatus } from "./resident-status"

export { parseIdImage } from "./ocr-parser"
export type { ParsedIdData } from "./ocr-parser"
