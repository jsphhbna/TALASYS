export type UploadField = "validId" | "parentId" | "seniorId" | "votersId"

export type UploadTheme = "red" | "blue" | "purple" | "green"

export interface RequiredDocumentConfig {
  field: UploadField
  title: string
  description: string
  theme: UploadTheme
}

export function getRequiredDocuments(statuses: string[], mode: "register" | "profile"): RequiredDocumentConfig[] {
  const profileDescription = "Upload supporting document if this status is being changed"

  return [
    ...(statuses.includes("Underage")
      ? [{
          field: "parentId" as const,
          title: "Parent's Valid Government ID",
          description: mode === "register" ? "Required for: Underage (Under 18 years old)" : profileDescription,
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
              : profileDescription,
          theme: "blue" as const,
        }]
      : []),
    ...(statuses.includes("Senior Citizen")
      ? [{
          field: "seniorId" as const,
          title: "Senior Citizen ID",
          description: mode === "register" ? "Required for: Senior Citizen (60 and above)" : profileDescription,
          theme: "purple" as const,
        }]
      : []),
    ...(statuses.includes("Registered Voter")
      ? [{
          field: "votersId" as const,
          title: mode === "register" ? "Voter's ID / Certificate" : "Voter's ID or Certification",
          description: mode === "register" ? "Required for: Registered Voter" : profileDescription,
          theme: "green" as const,
        }]
      : []),
  ]
}
