import type { ToastProps } from "@/components/ui/toast"
import { toast } from "@/hooks/use-toast"

interface ToastPreset {
  title: string
  description: string
  variant?: ToastProps["variant"]
}

const presets = {
  missingInformation: {
    title: "Missing information",
    description: "Please fill in all required fields before continuing.",
    variant: "destructive",
  },
  missingDocuments: {
    title: "Missing documents",
    description: "Please upload all required documents before continuing.",
    variant: "destructive",
  },
  registrationCompleted: {
    title: "Registration completed",
    description: "Your account was created. Redirecting to login...",
  },
  accountExists: {
    title: "Account already exists",
    description: "An account with this email already exists.",
    variant: "destructive",
  },
  reasonRequired: {
    title: "Reason required",
    description: "Please provide a reason for the edit request.",
    variant: "destructive",
  },
  profileRequestSubmitted: {
    title: "Request submitted",
    description: "Your profile edit request has been sent for review.",
  },
  profileUpdated: {
    title: "Profile updated",
    description: "Your profile picture has been updated.",
  },
  uploadFailedSize: {
    title: "Upload failed",
    description: "File size exceeds 5MB limit.",
    variant: "destructive",
  },
  uploadFailedType: {
    title: "Invalid file type",
    description: "Please select an image file.",
    variant: "destructive",
  },
  documentRequestSubmitted: {
    title: "Request submitted",
    description: "You will receive a notification when your document is ready.",
  },
  reactivationStarted: {
    title: "Reactivation started",
    description: "You will be redirected to complete face verification and document upload.",
  },
  configSaved: {
    title: "Changes saved",
    description: "All system configuration changes were saved successfully.",
  },
  categoryReportDownloaded: {
    title: "PDF ready",
    description: "Category report PDF was downloaded successfully.",
  },
  reportGenerated: {
    title: "Report generated",
    description: "Your report has been generated successfully.",
  },
  reasonCsvExported: {
    title: "CSV exported",
    description: "Reason analytics CSV export completed.",
  },
  reasonPdfExported: {
    title: "PDF exported",
    description: "Reason analytics PDF export completed.",
  },
  auditCsvExported: {
    title: "CSV exported",
    description: "Audit logs CSV export completed.",
  },
  auditPdfExported: {
    title: "PDF exported",
    description: "Audit logs PDF export completed.",
  },
} as const satisfies Record<string, ToastPreset>

export type ToastPresetKey = keyof typeof presets

export function showToastPreset(key: ToastPresetKey) {
  toast(presets[key])
}

export function showDownloadStarted(documentType: string) {
  toast({
    title: "Download started",
    description: `Downloading ${documentType}`,
  })
}
