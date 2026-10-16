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
import { escapeHtml } from "./security/sanitize.ts"

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
      'This is to certify that {{name}}, of legal age, Filipino, is a bonafide resident of {{barangay_name}} with postal address at {{address}}.\n\nThis certifies that the person named above has no derogatory record or pending criminal case filed against them in this Barangay.\n\nThis Clearance is issued upon the request of the above-named person for {{purpose}} purposes.\n\nIssued this {{date_ordinal_issued}}, at the Office of {{barangay_name}}, City of Manila.',
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

export type BeneficiaryReviewStatus = "missing" | "provided" | "confirmed" | "modified"

export interface ValidatedBeneficiaryDetails {
  name?: string
  address: string
  age?: number
  notes?: string
}

export interface BeneficiaryValidationResult {
  valid: boolean
  error?: string
  data?: ValidatedBeneficiaryDetails
}

/**
 * Shared production validator for confirmed beneficiary details (F04).
 * Enforces uniform constraints across confirmation, issuance, and API boundaries.
 */
export function validateBeneficiaryDetails(
  input: unknown,
  options?: { requiresAge?: boolean; requireName?: boolean }
): BeneficiaryValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, error: "Invalid beneficiary confirmation payload: must be an object." }
  }

  const payload = input as Record<string, unknown>

  // Disallow unapproved fields
  const allowedKeys = new Set([
    "confirmedAddress", "confirmedAge", "notes", "confirmedName",
    "name", "address", "age"
  ])
  for (const k of Object.keys(payload)) {
    if (!allowedKeys.has(k)) {
      return { valid: false, error: `Unapproved field in beneficiary payload: '${k}'.` }
    }
  }

  // Address: required non-empty string, max 300 chars
  const rawAddress = payload.confirmedAddress ?? payload.address
  if (typeof rawAddress !== "string" || !rawAddress.trim()) {
    return { valid: false, error: "Confirmed beneficiary address is required." }
  }
  const address = rawAddress.trim()
  if (address.length > 300) {
    return { valid: false, error: "Beneficiary address exceeds maximum allowed length (300 characters)." }
  }

  // Age: optional unless requiresAge is true; if present, must be integer in 0..130
  const rawAge = payload.confirmedAge !== undefined ? payload.confirmedAge : payload.age
  let age: number | undefined = undefined

  if (rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== "") {
    const ageNum = typeof rawAge === "number" ? rawAge : Number(String(rawAge).trim())
    if (!Number.isFinite(ageNum) || !Number.isInteger(ageNum)) {
      return { valid: false, error: "Beneficiary age must be a valid whole number." }
    }
    if (ageNum < 0) {
      return { valid: false, error: "Beneficiary age cannot be negative." }
    }
    if (ageNum > 130) {
      return { valid: false, error: "Beneficiary age exceeds supported range (0–130)." }
    }
    age = ageNum
  } else if (options?.requiresAge) {
    return { valid: false, error: "Beneficiary age is required for this certificate." }
  }

  // Name: optional unless requireName is true; max 150 chars
  const rawName = payload.confirmedName ?? payload.name
  let name: string | undefined = undefined
  if (rawName !== undefined && rawName !== null && String(rawName).trim() !== "") {
    if (typeof rawName !== "string") {
      return { valid: false, error: "Beneficiary name must be a string." }
    }
    const nameTrimmed = rawName.trim()
    if (nameTrimmed.length > 150) {
      return { valid: false, error: "Beneficiary name exceeds maximum allowed length (150 characters)." }
    }
    name = nameTrimmed
  } else if (options?.requireName) {
    return { valid: false, error: "Beneficiary name is required." }
  }

  // Notes: optional string, max 500 chars
  let notes: string | undefined = undefined
  if (payload.notes !== undefined && payload.notes !== null && String(payload.notes).trim() !== "") {
    if (typeof payload.notes !== "string") {
      return { valid: false, error: "Confirmation notes must be a string." }
    }
    const notesTrimmed = payload.notes.trim()
    if (notesTrimmed.length > 500) {
      return { valid: false, error: "Confirmation notes exceed maximum allowed length (500 characters)." }
    }
    notes = notesTrimmed
  }

  return {
    valid: true,
    data: {
      address,
      ...(age !== undefined ? { age } : {}),
      ...(name ? { name } : {}),
      ...(notes ? { notes } : {}),
    }
  }
}

export interface DocumentSubjectResolution {
  subjectName: string
  requesterName: string
  isRepresentation: boolean
  relationship?: string
  authorizationLetter?: string
  beneficiaryContact?: string
  address: string
  age: string
  isSubjectAddressMissing: boolean
  isSubjectAgeMissing: boolean
  civilStatus?: string
  beneficiaryReviewStatus: BeneficiaryReviewStatus
  beneficiaryConfirmedBy?: string
  beneficiaryConfirmedAt?: number
  isBeneficiaryConfirmed: boolean
  isBeneficiaryModified?: boolean
  isAddressModified?: boolean
  isAgeModified?: boolean
}

function calculateAgeFromDob(dob?: string): string {
  if (!dob) return ""
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return ""
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age >= 0 ? String(age) : ""
}

/**
 * Resolves the subject details for document generation, correctly separating
 * represented beneficiaries from requesting residents (UI02, P01, R05, R06, F03).
 * Never silently reuses the requester's age or address for represented beneficiaries.
 * Accurately tracks staff confirmation status and detects local edits (F03).
 */
export function resolveDocumentSubject(
  request: any,
  resident: any,
  adminOverrides?: { address?: string; age?: string | number; civilStatus?: string }
): DocumentSubjectResolution {
  const isRepresentation = request?.requestFor === "other" && Boolean(request?.requestedByName?.trim())
  const requesterName = resident?.fullName || resident?.name || "Authorized Resident"
  const subjectName = isRepresentation ? request.requestedByName.trim() : requesterName
  const relationship = isRepresentation ? (request.relationship?.trim() || "Authorized Representative") : undefined
  const authorizationLetter = isRepresentation ? request.authorizationLetter : undefined
  const beneficiaryContact = isRepresentation ? request.requestedByContact : undefined

  let address = ""
  let age = ""
  let isBeneficiaryConfirmed = false
  let isBeneficiaryModified = false
  let isAddressModified = false
  let isAgeModified = false
  let beneficiaryReviewStatus: BeneficiaryReviewStatus = "missing"

  if (isRepresentation) {
    const hasPersistedConfirmation = Boolean(
      (request?.beneficiaryReviewStatus === "confirmed" || request?.beneficiaryConfirmedAt) &&
      request?.confirmedBeneficiaryAddress
    )

    // Precedence: explicit admin overrides -> confirmed issuance values -> resident-submitted values
    const effectiveAddress = adminOverrides?.address !== undefined
      ? adminOverrides.address.trim()
      : (request?.confirmedBeneficiaryAddress?.trim() ||
         request?.representedAddress?.trim() ||
         request?.subjectAddress?.trim() ||
         "")

    const rawAge = adminOverrides?.age !== undefined
      ? adminOverrides.age
      : (request?.confirmedBeneficiaryAge !== undefined
          ? request.confirmedBeneficiaryAge
          : (request?.representedAge !== undefined ? request.representedAge : request?.subjectAge))
    const effectiveAge = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== "" ? String(rawAge).trim() : ""

    address = effectiveAddress
    age = effectiveAge

    if (!address) {
      beneficiaryReviewStatus = "missing"
      isBeneficiaryConfirmed = false
    } else if (hasPersistedConfirmation) {
      const persistedAddress = (request?.confirmedBeneficiaryAddress || "").trim()
      const persistedAge = request?.confirmedBeneficiaryAge !== undefined && request?.confirmedBeneficiaryAge !== null
        ? String(request.confirmedBeneficiaryAge).trim()
        : ""

      isAddressModified = adminOverrides?.address !== undefined && adminOverrides.address.trim() !== persistedAddress
      isAgeModified = adminOverrides?.age !== undefined && effectiveAge !== persistedAge

      if (isAddressModified || isAgeModified) {
        beneficiaryReviewStatus = "modified"
        isBeneficiaryConfirmed = false
        isBeneficiaryModified = true
      } else {
        beneficiaryReviewStatus = "confirmed"
        isBeneficiaryConfirmed = true
        isBeneficiaryModified = false
      }
    } else if (address.length > 0 || age.length > 0) {
      beneficiaryReviewStatus = "provided"
      isBeneficiaryConfirmed = false
    } else {
      beneficiaryReviewStatus = "missing"
      isBeneficiaryConfirmed = false
    }
  } else {
    address = adminOverrides?.address?.trim() || resident?.address?.trim() || ""
    const residentDob = resident?.dateOfBirth || resident?.dob || resident?.birthDate
    const rawAge = adminOverrides?.age !== undefined ? adminOverrides.age : (resident?.age !== undefined ? resident.age : calculateAgeFromDob(residentDob))
    age = rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== "" ? String(rawAge).trim() : ""
  }

  const isSubjectAddressMissing = !address
  const isSubjectAgeMissing = !age
  const civilStatus = adminOverrides?.civilStatus?.trim() || (!isRepresentation ? (resident?.civilStatus?.trim() || "") : "")

  return {
    subjectName,
    requesterName,
    isRepresentation,
    relationship,
    authorizationLetter,
    beneficiaryContact,
    address,
    age,
    isSubjectAddressMissing,
    isSubjectAgeMissing,
    civilStatus,
    beneficiaryReviewStatus,
    beneficiaryConfirmedBy: request?.beneficiaryConfirmedBy,
    beneficiaryConfirmedAt: request?.beneficiaryConfirmedAt,
    isBeneficiaryConfirmed,
    isBeneficiaryModified,
    isAddressModified,
    isAgeModified,
  }
}

export interface DocumentTemplateData {
  name: string
  address: string
  age?: string | number
  civilStatus?: string
  purpose?: string
  barangayName?: string
  date?: Date
}

/**
 * Authoritative document template renderer (P03).
 * Resolves standard placeholders:
 * - {{name}}, {{address}}, {{age}}, {{civil_status}}, {{purpose}}
 * - {{date_issued}}, {{date_ordinal_issued}}, {{date_day_issued}}, {{barangay_name}}
 *
 * Guarantees:
 * 1. Values are safely HTML-escaped.
 * 2. Unprovided optional placeholders (like civil_status) clean up without hanging punctuation.
 * 3. Any unparsed {{...}} placeholder tokens are stripped, preventing code leaks into official certificates.
 * 4. Dangerous script tags and inline handlers are neutralized.
 */
export function renderDocumentTemplate(
  template: string,
  data: DocumentTemplateData
): string {
  if (!template || typeof template !== "string") return ""

  const d = data.date || new Date()
  const formatter = new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "Asia/Manila" })
  const day = formatter.format(d)
  const suffix = ["11", "12", "13"].includes(day)
    ? "th"
    : day.endsWith("1")
    ? "st"
    : day.endsWith("2")
    ? "nd"
    : day.endsWith("3")
    ? "rd"
    : "th"
  const ordinalDay = `${day}${suffix}`
  const monthYear = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" })

  const dateIssued = d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" })
  const dateOrdinalIssued = `${ordinalDay} day of ${monthYear}`
  const dateDayIssued = `${ordinalDay} of ${monthYear}`

  const safeName = `<strong>${escapeHtml((data.name || "").toUpperCase())}</strong>`
  const safeAddress = data.address?.trim()
    ? `<strong>${escapeHtml(data.address.trim())}</strong>`
    : `<strong>[ADDRESS REQUIRED]</strong>`
  const safeAge = data.age !== undefined && data.age !== null && String(data.age).trim() !== ""
    ? escapeHtml(String(data.age).trim())
    : `<strong>[AGE REQUIRED]</strong>`
  const safeCivilStatus = data.civilStatus?.trim() ? escapeHtml(data.civilStatus.trim()) : ""
  const safePurpose = `<strong>${escapeHtml((data.purpose || "GENERAL").toUpperCase())}</strong>`
  const safeDateIssued = `<strong>${escapeHtml(dateIssued)}</strong>`
  const safeDateOrdinalIssued = `<strong>${escapeHtml(dateOrdinalIssued)}</strong>`
  const safeDateDayIssued = `<strong>${escapeHtml(dateDayIssued)}</strong>`
  const safeBarangayName = escapeHtml(data.barangayName?.trim() || "__________________")

  let resolved = template
    .replace(/{{name}}/g, safeName)
    .replace(/{{address}}/g, safeAddress)
    .replace(/{{age}}/g, safeAge)
    .replace(/{{civil_status}}/g, safeCivilStatus)
    .replace(/{{purpose}}/g, safePurpose)
    .replace(/{{date_issued}}/g, safeDateIssued)
    .replace(/{{date_ordinal_issued}}/g, safeDateOrdinalIssued)
    .replace(/{{date_day_issued}}/g, safeDateDayIssued)
    .replace(/{{barangay_name}}/g, safeBarangayName)

  // Clean up any double commas or punctuation left if civil_status or other optional token was empty
  // Use horizontal whitespace matching ([ \t]) so that line breaks and paragraphs are preserved (R01)
  resolved = resolved
    .replace(/,[ \t]*,/g, ",")
    .replace(/,[ \t]*\./g, ".")
    .replace(/[ \t]{2,}/g, " ")

  // Normalize CRLF to LF and cap excessive blank lines to double newlines while preserving paragraph separation
  resolved = resolved.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n")

  // Prevent any lingering unresolved {{...}} tokens from leaking into official documents
  resolved = resolved.replace(/{{\s*[\w.-]+\s*}}/g, "")

  // Neutralize script tags and dangerous HTML attributes
  resolved = resolved.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
  resolved = resolved.replace(/\bon\w+\s*=/gi, "data-blocked-handler=")
  resolved = resolved.replace(/javascript:/gi, "blocked-scheme:")

  return resolved
}

/**
 * Formats resolved template text into structured HTML paragraphs with Philippine barangay document indentation,
 * converting double line breaks into paragraphs and single line breaks into line breaks (R01).
 */
export function formatTemplateParagraphs(resolved: string): string {
  if (!resolved || typeof resolved !== "string") return ""
  return resolved
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      if (p.startsWith("<p") && p.endsWith("</p>")) {
        return p
      }
      const withBr = p.replace(/\n/g, "<br />")
      return `<p style="text-indent:2em;text-align:justify;margin-bottom:1em;">${withBr}</p>`
    })
    .join("")
}
