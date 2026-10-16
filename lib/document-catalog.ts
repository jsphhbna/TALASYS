/**
 * TALASYS Canonical Document Catalog
 *
 * Single source of truth for:
 * - Built-in document types and canonical IDs
 * - Official display names, icons, descriptions, and default fees
 * - Dedicated templates and official certificate headers
 * - Standard purpose options
 * - Legacy alias resolution
 * - Subject resolution for requests on behalf of another individual
 */

export interface DocumentCatalogItem {
  id: string
  label: string
  icon: string
  description: string
  defaultFee: number
  header: string
  defaultTemplate: string
  purposeOptions: string[]
  aliases: string[]
  enabledByDefault: boolean
}

export const BUILT_IN_DOCUMENT_TYPES: DocumentCatalogItem[] = [
  {
    id: "clearance",
    label: "Barangay Clearance",
    icon: "📄",
    description: "General clearance for employment, identification, and transactions",
    defaultFee: 50,
    header: "BARANGAY CLEARANCE",
    defaultTemplate:
      'This is to certify that {{name}}, of legal age, {{civil_status}}, Filipino, is a bonafide resident of {{barangay_name}} with postal address at {{address}}.\n\nThis certifies that the person named above has no derogatory record or pending criminal case filed against them in this Barangay.\n\nThis Clearance is issued upon the request of the above-named person for {{purpose}} purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.',
    purposeOptions: ["Employment", "Postal ID", "Police Clearance", "Bank Account", "Other"],
    aliases: ["clearance", "barangay-clearance", "barangay clearance", "Barangay Clearance"],
    enabledByDefault: true,
  },
  {
    id: "indigency",
    label: "Certificate of Indigency",
    icon: "📋",
    description: "For medical, financial, or legal assistance",
    defaultFee: 0,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify that {{name}} is a bonafide resident of {{barangay_name}} with postal address {{address}}.\n\nThis further certifies that the said person belongs to indigent families in our Barangay.\n\nThis Certification is issued upon the request of the above-named person for {{purpose}} purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.',
    purposeOptions: ["Medical Assistance", "Financial Assistance", "Scholarship", "Legal Aid", "Other"],
    aliases: ["indigency", "certificate-of-indigency", "certificate of indigency", "Certificate of Indigency"],
    enabledByDefault: true,
  },
  {
    id: "residency",
    label: "Proof of Residency",
    icon: "🏠",
    description: "Proof of residence for various legal and institutional purposes",
    defaultFee: 50,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify {{name}} is a bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above-mentioned name for {{purpose}} purposes.\n\nIssued this {{date_day_issued}}, City of Manila.',
    purposeOptions: ["Bank Requirement", "School Requirement", "Employment", "Other"],
    aliases: ["residency", "certificate-of-residency", "proof-of-residency", "proof of residency", "Proof of Residency", "Certificate of Residency"],
    enabledByDefault: true,
  },
  {
    id: "business",
    label: "Business Clearance",
    icon: "🏢",
    description: "General business clearance or commercial activity",
    defaultFee: 150,
    header: "BARANGAY BUSINESS CLEARANCE",
    defaultTemplate:
      'This is to certify that {{name}} located at {{address}} with Business Style _________________ conducted "__________________" at _________________ today {{date_issued}}.\n\nThis Certification is issued upon the request of the above-cited for whatever legal purpose this is intended.\n\nDonation for venue Php 500.00\n\nCity Manila, {{date_issued}}.',
    purposeOptions: ["New Business", "Renewal", "Permit", "Other"],
    aliases: ["business", "business-clearance", "business clearance", "Business Clearance"],
    enabledByDefault: true,
  },
  {
    id: "business_homeowner",
    label: "Business Clearance (Homeowner)",
    icon: "🏡",
    description: "Business clearance for residential homeowners",
    defaultFee: 150,
    header: "BARANGAY BUSINESS CLEARANCE",
    defaultTemplate:
      'This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located at {{address}}. This is under the territorial jurisdiction of {{barangay_name}}.\n\nThis certification is issued upon the request of the above-cited person for whatever purposes it may serve.\n\nIssued this {{date_ordinal_issued}}, City of Manila.',
    purposeOptions: ["Business Application", "Other"],
    aliases: ["business_homeowner", "business-clearance-homeowner", "Business Clearance (Homeowner)"],
    enabledByDefault: true,
  },
  {
    id: "business_contractor",
    label: "Business Clearance (Contractor)",
    icon: "👷",
    description: "Business clearance for contractors and construction",
    defaultFee: 150,
    header: "BARANGAY CLEARANCE",
    defaultTemplate:
      'This is to certify that {{name}} is hereby issued Barangay Clearance for "__________________" entity located along {{address}} Under the territorial jurisdiction of {{barangay_name}}.\n\nThis certification is issued upon the request of the above-cited name for whatever legal purpose this is intended.\n\nCity of Manila, {{date_issued}}.',
    purposeOptions: ["Contractor Registration", "Other"],
    aliases: ["business_contractor", "business-clearance-contractor", "Business Clearance (Contractor)"],
    enabledByDefault: true,
  },
  {
    id: "funeral",
    label: "Funeral Certification",
    icon: "🕊️",
    description: "Certification for funeral and burial assistance",
    defaultFee: 0,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify that {{name}}, age {{age}}, is a bonafide resident of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for FUNERAL ASSISTANCE purposes.\n\nCity of Manila, {{date_issued}}.',
    purposeOptions: ["Burial Assistance", "Financial Aid", "Other"],
    aliases: ["funeral", "funeral-certification", "Funeral Certification"],
    enabledByDefault: true,
  },
  {
    id: "pwd_adult",
    label: "PWD Certification (Adult)",
    icon: "♿",
    description: "For adult Person with Disability application purposes",
    defaultFee: 0,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify that {{name}} is a bonified resident and registered voter of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.',
    purposeOptions: ["PWD ID Application", "Discount Availment", "Other"],
    aliases: ["pwd_adult", "pwd-adult", "PWD Certification (Adult)"],
    enabledByDefault: true,
  },
  {
    id: "pwd_minor",
    label: "PWD Certification (Minor)",
    icon: "🚸",
    description: "For minor Person with Disability application purposes",
    defaultFee: 0,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify that {{name}} {{age}} years old of age, is a bonified resident of {{barangay_name}}, with postal address located at {{address}}.\n\nThis Certification is issued upon the request of the above-named person for <strong>PWD-Application</strong> purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.',
    purposeOptions: ["PWD ID Application", "Discount Availment", "Other"],
    aliases: ["pwd_minor", "pwd-minor", "PWD Certification (Minor)"],
    enabledByDefault: true,
  },
  {
    id: "osca",
    label: "OSCA Certification",
    icon: "👵",
    description: "For Senior Citizen (OSCA) ID application",
    defaultFee: 0,
    header: "C E R T I F I C A T I O N",
    defaultTemplate:
      'This is to certify that {{name}} is bonafide resident of {{barangay_name}}, with postal address at {{address}}.\n\nThis Certification is issued upon the request of the above cited person for <strong>OSCA ID application</strong> purposes.\n\nCity of Manila, {{date_issued}}.',
    purposeOptions: ["OSCA ID Application", "Other"],
    aliases: ["osca", "osca-certification", "OSCA Certification"],
    enabledByDefault: true,
  },
]

export const DEFAULT_ENABLED_DOCUMENT_TYPES: string[] = BUILT_IN_DOCUMENT_TYPES.map(d => d.label)

export const DEFAULT_DOCUMENT_FEES: Record<string, number> = Object.fromEntries(
  BUILT_IN_DOCUMENT_TYPES.map(d => [d.label, d.defaultFee])
)

export const DEFAULT_TEMPLATES: Record<string, string> = Object.fromEntries(
  BUILT_IN_DOCUMENT_TYPES.map(d => [d.id, d.defaultTemplate])
)

export const DEFAULT_HEADERS: Record<string, string> = Object.fromEntries(
  BUILT_IN_DOCUMENT_TYPES.map(d => [d.id, d.header])
)

export const BUILT_IN_PURPOSE_OPTIONS: Record<string, string[]> = Object.fromEntries(
  BUILT_IN_DOCUMENT_TYPES.map(d => [d.id, d.purposeOptions])
)

/**
 * Resolves a document type from an ID, label, or legacy alias against built-in and custom types.
 */
export function resolveDocumentType(
  rawInput: string | null | undefined,
  customTypes: any[] = []
): { id: string; label: string; isBuiltIn: boolean; defaultFee: number; header: string; template: string; icon: string } | null {
  if (!rawInput || typeof rawInput !== "string") return null
  const trimmed = rawInput.trim()
  const lower = trimmed.toLowerCase()

  // 1. Direct match on built-in ID
  const byId = BUILT_IN_DOCUMENT_TYPES.find(d => d.id === trimmed || d.id.toLowerCase() === lower)
  if (byId) {
    return {
      id: byId.id,
      label: byId.label,
      isBuiltIn: true,
      defaultFee: byId.defaultFee,
      header: byId.header,
      template: byId.defaultTemplate,
      icon: byId.icon,
    }
  }

  // 2. Direct match on built-in label or alias
  const byLabelOrAlias = BUILT_IN_DOCUMENT_TYPES.find(
    d => d.label.toLowerCase() === lower || d.aliases.some(a => a.toLowerCase() === lower)
  )
  if (byLabelOrAlias) {
    return {
      id: byLabelOrAlias.id,
      label: byLabelOrAlias.label,
      isBuiltIn: true,
      defaultFee: byLabelOrAlias.defaultFee,
      header: byLabelOrAlias.header,
      template: byLabelOrAlias.defaultTemplate,
      icon: byLabelOrAlias.icon,
    }
  }

  // 3. Match custom document types
  const custom = customTypes.find(
    (c: any) =>
      c?.id === trimmed ||
      c?.name === trimmed ||
      (c?.id && c.id.toLowerCase() === lower) ||
      (c?.name && c.name.toLowerCase() === lower)
  )
  if (custom) {
    return {
      id: custom.id,
      label: custom.name,
      isBuiltIn: false,
      defaultFee: typeof custom.fee === "number" ? custom.fee : 0,
      header: custom.header || "C E R T I F I C A T I O N",
      template: custom.template || "",
      icon: custom.icon || "📄",
    }
  }

  return null
}

export interface DocumentSubjectResolution {
  subjectName: string
  requesterName: string
  isRepresentation: boolean
  relationship?: string
  authorizationLetter?: string
  address: string
  age: string
}

/**
 * Resolves the subject details for document generation, correctly separating
 * represented beneficiaries from requesting residents (UI02).
 */
export function resolveDocumentSubject(
  request: any,
  resident: any
): DocumentSubjectResolution {
  const isRepresentation = request?.requestFor === "other" && Boolean(request?.requestedByName?.trim())
  const requesterName = resident?.fullName || resident?.name || "Authorized Resident"
  const subjectName = isRepresentation ? request.requestedByName.trim() : requesterName
  const relationship = isRepresentation ? (request.relationship?.trim() || "Authorized Representative") : undefined
  const authorizationLetter = isRepresentation ? request.authorizationLetter : undefined
  const address = resident?.address || "__________________"
  const age = resident?.age?.toString() || "___"

  return {
    subjectName,
    requesterName,
    isRepresentation,
    relationship,
    authorizationLetter,
    address,
    age,
  }
}
