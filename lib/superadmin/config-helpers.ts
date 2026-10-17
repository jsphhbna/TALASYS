/**
 * Superadmin Configuration Isolation & Dirty State Helpers
 *
 * Enforces separation between:
 * 1. Saved authoritative configuration (baseline).
 * 2. Locally edited configuration fields (formData).
 * 3. Catalog changes being committed (add/delete document types).
 * 4. Pending unsaved edits unrelated to catalog operations (branding, contact, other templates).
 *
 * Resolves V01: prevents loss of unsaved configuration edits.
 */

export interface EditableConfigFormData {
  barangayName: string
  address: string
  contactNumber: string
  emailAddress: string
  barangayCaptainName: string
  secretaryName: string
  captainSignatureUrl: string
  secretarySignatureUrl: string
  templates: Record<string, string>
}

export const CONFIG_STRING_FIELDS = [
  "barangayName",
  "address",
  "contactNumber",
  "emailAddress",
  "barangayCaptainName",
  "secretaryName",
  "captainSignatureUrl",
  "secretarySignatureUrl",
] as const

/**
 * Computes whether there are active unsaved local modifications
 * compared to the authoritative server baseline.
 */
export function computeHasUnsavedEdits(
  currentFormData: EditableConfigFormData,
  currentStagedDocTypes: string[] | null,
  currentStagedFees: Record<string, number> | null,
  baseline: any
): boolean {
  if (!baseline) return false

  for (const f of CONFIG_STRING_FIELDS) {
    if ((currentFormData[f] || "") !== (baseline[f] || "")) {
      return true
    }
  }

  const formTemplates = currentFormData.templates || {}
  const baseTemplates = baseline.templates || {}
  const allTemplateKeys = Array.from(new Set([...Object.keys(formTemplates), ...Object.keys(baseTemplates)]))
  for (const key of allTemplateKeys) {
    if ((formTemplates[key] || "") !== (baseTemplates[key] || "")) {
      return true
    }
  }

  if (
    currentStagedDocTypes !== null &&
    JSON.stringify(currentStagedDocTypes) !== JSON.stringify(baseline.documentTypes || [])
  ) {
    return true
  }

  if (
    currentStagedFees !== null &&
    JSON.stringify(currentStagedFees) !== JSON.stringify(baseline.documentFees || {})
  ) {
    return true
  }

  return false
}

/**
 * Prepares the minimal catalog-only update payload for adding a document type,
 * ensuring only the new document's template is committed and any unsaved local drafts
 * for other templates or branding fields remain intact in local form state.
 */
export function prepareAddDocTypePayload(params: {
  docId: string
  docName: string
  docIcon: string
  docFee: number
  docHeader: string
  docTemplate: string
  baseline: any
  effectiveDocTypes: string[]
  effectiveDocFees: Record<string, number>
  existingCustomDocs: any[]
}) {
  const newDocTypes = [...params.effectiveDocTypes, params.docName]
  const newFees = { ...params.effectiveDocFees, [params.docName]: params.docFee }
  const newCustomDocTypes = [
    ...(params.existingCustomDocs || []),
    {
      id: params.docId,
      name: params.docName,
      icon: params.docIcon,
      fee: params.docFee,
      header: params.docHeader,
    },
  ]
  const committedTemplates = {
    ...(params.baseline.templates || {}),
    [params.docId]: params.docTemplate,
  }

  const baseDocTypes = Array.isArray(params.baseline.documentTypes)
    ? params.baseline.documentTypes
    : []
  const baseFees = params.baseline.documentFees || {}
  const baseCustomDocs = params.baseline.customDocumentTypes || []
  const baseTemplates = params.baseline.templates || {}

  return {
    updates: {
      documentTypes: newDocTypes,
      documentFees: newFees,
      customDocumentTypes: newCustomDocTypes,
      templates: committedTemplates,
    },
    baseConfig: {
      documentTypes: baseDocTypes,
      documentFees: baseFees,
      customDocumentTypes: baseCustomDocs,
      templates: baseTemplates,
    },
    changedFields: ["documentTypes", "documentFees", "customDocumentTypes", "templates"],
    updatedBaseline: {
      ...params.baseline,
      documentTypes: newDocTypes,
      documentFees: newFees,
      customDocumentTypes: newCustomDocTypes,
      templates: committedTemplates,
      version: (params.baseline.version || 1) + 1,
    },
  }
}

/**
 * Prepares the minimal catalog-only update payload for deleting a document type,
 * ensuring only the deleted document's template is removed and any unsaved local drafts
 * for other templates or branding fields remain intact in local form state.
 */
export function prepareDeleteDocTypePayload(params: {
  docName: string
  docId: string
  baseline: any
  effectiveDocTypes: string[]
  effectiveDocFees: Record<string, number>
  existingCustomDocs: any[]
}) {
  const newDocTypes = params.effectiveDocTypes.filter((t) => t !== params.docName)
  const newFees = { ...params.effectiveDocFees }
  delete newFees[params.docName]
  const newCustomDocTypes = (params.existingCustomDocs || []).filter(
    (d: any) => d.name !== params.docName
  )

  const committedTemplates = { ...(params.baseline.templates || {}) }
  delete committedTemplates[params.docId]

  const baseDocTypes = Array.isArray(params.baseline.documentTypes)
    ? params.baseline.documentTypes
    : []
  const baseFees = params.baseline.documentFees || {}
  const baseCustomDocs = params.baseline.customDocumentTypes || []
  const baseTemplates = params.baseline.templates || {}

  return {
    updates: {
      documentTypes: newDocTypes,
      documentFees: newFees,
      customDocumentTypes: newCustomDocTypes,
      templates: committedTemplates,
    },
    baseConfig: {
      documentTypes: baseDocTypes,
      documentFees: baseFees,
      customDocumentTypes: baseCustomDocs,
      templates: baseTemplates,
    },
    changedFields: ["documentTypes", "documentFees", "customDocumentTypes", "templates"],
    updatedBaseline: {
      ...params.baseline,
      documentTypes: newDocTypes,
      documentFees: newFees,
      customDocumentTypes: newCustomDocTypes,
      templates: committedTemplates,
      version: (params.baseline.version || 1) + 1,
    },
  }
}
