export type UploadField = "validId" | "parentId" | "seniorId" | "votersId"

export type UploadTheme = "red" | "blue" | "purple" | "green"

export interface RequiredDocumentConfig {
  field: UploadField
  title: string
  description: string
  theme: UploadTheme
}

/**
 * Returns the list of required proof documents for a resident based on their statuses.
 *
 * @param statuses - The resident's current status categories (e.g. ["Adult", "Registered Voter"]).
 * @param mode - `"register"` shows category-specific descriptions; `"profile"` shows a generic
 *               message used when re-uploading documents during a profile edit request.
 */
export function getRequiredDocuments(statuses: string[], mode: "register" | "profile"): RequiredDocumentConfig[] {
  const profileModeDescription = "Upload supporting document if this status is being changed"

  return [
    ...(statuses.includes("Underage")
      ? [{
          field: "parentId" as const,
          title: "School ID or Parent's Valid ID",
          description: mode === "register" ? "Required for: Underage (Under 18 years old)" : profileModeDescription,
          theme: "red" as const,
        }]
      : []),
    ...(statuses.includes("Adult") && !statuses.includes("Senior Citizen")
      ? [{
          field: "validId" as const,
          title: "Valid Government ID",
          description:
            mode === "register"
              ? "Required for: Adult (Valid ID: National ID, Driver's License, or Passport)"
              : profileModeDescription,
          theme: "blue" as const,
        }]
      : []),
    ...(statuses.includes("Senior Citizen")
      ? [{
          field: "seniorId" as const,
          title: "Senior Citizen ID",
          description: mode === "register" ? "Required for: Senior Citizen (60 and above)" : profileModeDescription,
          theme: "purple" as const,
        }]
      : []),
    ...(statuses.includes("Registered Voter")
      ? [{
          field: "votersId" as const,
          title: mode === "register" ? "Voter's ID / Certificate" : "Voter's ID or Certification",
          description: mode === "register" ? "Required for: Registered Voter" : profileModeDescription,
          theme: "green" as const,
        }]
      : []),
  ]
}
