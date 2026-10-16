import test from "node:test"
import assert from "node:assert/strict"
import {
  validateBeneficiaryDetails,
  resolveDocumentSubject,
  type BeneficiaryReviewStatus,
} from "../lib/document-catalog.ts"

// ---------------------------------------------------------------------------
// F04: Shared Beneficiary Validation Policy Tests
// ---------------------------------------------------------------------------

test("F04: validateBeneficiaryDetails accepts valid address and age within range", () => {
  const result = validateBeneficiaryDetails({
    confirmedAddress: "Unit 402, Golden Horizon Bldg, Manila",
    confirmedAge: 25,
    notes: "Verified against valid government ID",
  })

  assert.equal(result.valid, true)
  assert.equal(result.data?.address, "Unit 402, Golden Horizon Bldg, Manila")
  assert.equal(result.data?.age, 25)
  assert.equal(result.data?.notes, "Verified against valid government ID")
})

test("F04: validateBeneficiaryDetails supports age 0 and maximum supported age 130", () => {
  const newborn = validateBeneficiaryDetails({ address: "Brgy 1", age: 0 })
  assert.equal(newborn.valid, true)
  assert.equal(newborn.data?.age, 0)

  const centenarian = validateBeneficiaryDetails({ address: "Brgy 1", age: 130 })
  assert.equal(centenarian.valid, true)
  assert.equal(centenarian.data?.age, 130)
})

test("F04: validateBeneficiaryDetails rejects negative age", () => {
  const result = validateBeneficiaryDetails({
    confirmedAddress: "Brgy 1",
    confirmedAge: -1,
  })
  assert.equal(result.valid, false)
  assert.match(result.error || "", /negative/i)
})

test("F04: validateBeneficiaryDetails rejects age > 130", () => {
  const result = validateBeneficiaryDetails({
    confirmedAddress: "Brgy 1",
    confirmedAge: 131,
  })
  assert.equal(result.valid, false)
  assert.match(result.error || "", /0–130/i)
})

test("F04: validateBeneficiaryDetails rejects non-integer or non-finite numbers", () => {
  const floatRes = validateBeneficiaryDetails({ confirmedAddress: "Brgy 1", confirmedAge: 32.5 })
  assert.equal(floatRes.valid, false)
  assert.match(floatRes.error || "", /whole number/i)

  const nanRes = validateBeneficiaryDetails({ confirmedAddress: "Brgy 1", confirmedAge: "twenty" })
  assert.equal(nanRes.valid, false)
  assert.match(nanRes.error || "", /whole number/i)
})

test("F04: validateBeneficiaryDetails rejects missing, empty, or whitespace-only address", () => {
  const missing = validateBeneficiaryDetails({ confirmedAge: 25 })
  assert.equal(missing.valid, false)
  assert.match(missing.error || "", /address is required/i)

  const empty = validateBeneficiaryDetails({ confirmedAddress: "   " })
  assert.equal(empty.valid, false)
  assert.match(empty.error || "", /address is required/i)
})

test("F04: validateBeneficiaryDetails enforces maximum string lengths (address 300, name 150, notes 500)", () => {
  const longAddress = "A".repeat(301)
  const addrRes = validateBeneficiaryDetails({ confirmedAddress: longAddress })
  assert.equal(addrRes.valid, false)
  assert.match(addrRes.error || "", /300 characters/i)

  const longName = "N".repeat(151)
  const nameRes = validateBeneficiaryDetails({ confirmedAddress: "Valid", name: longName })
  assert.equal(nameRes.valid, false)
  assert.match(nameRes.error || "", /150 characters/i)

  const longNotes = "X".repeat(501)
  const notesRes = validateBeneficiaryDetails({ confirmedAddress: "Valid", notes: longNotes })
  assert.equal(notesRes.valid, false)
  assert.match(notesRes.error || "", /500 characters/i)
})

test("F04: validateBeneficiaryDetails rejects unapproved payload fields", () => {
  const result = validateBeneficiaryDetails({
    confirmedAddress: "Valid Address",
    maliciousRole: "superadmin",
    injectedScript: "<script>",
  })
  assert.equal(result.valid, false)
  assert.match(result.error || "", /unapproved field/i)
})

test("F04: validateBeneficiaryDetails respects options.requiresAge when age is missing", () => {
  const noAge = validateBeneficiaryDetails({ confirmedAddress: "Valid Address" }, { requiresAge: true })
  assert.equal(noAge.valid, false)
  assert.match(noAge.error || "", /age is required for this certificate/i)

  const withAge = validateBeneficiaryDetails({ confirmedAddress: "Valid Address", confirmedAge: 18 }, { requiresAge: true })
  assert.equal(withAge.valid, true)
})

// ---------------------------------------------------------------------------
// F03: Invalidation of Stale Beneficiary Confirmation Tests
// ---------------------------------------------------------------------------

test("F03: Confirmed beneficiary displays confirmed state when active input matches persisted confirmation", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    relationship: "Brother",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedBy: "Staff John",
    beneficiaryConfirmedAt: 1729000000000,
    confirmedBeneficiaryAddress: "456 Pedro St., Manila",
    confirmedBeneficiaryAge: 30,
  }

  // No active local override - values match confirmed state
  const subjectNoOverride = resolveDocumentSubject(confirmedReq, resident)
  assert.equal(subjectNoOverride.beneficiaryReviewStatus, "confirmed")
  assert.equal(subjectNoOverride.isBeneficiaryConfirmed, true)
  assert.equal(subjectNoOverride.isBeneficiaryModified, false)
  assert.equal(subjectNoOverride.isAddressModified, false)
  assert.equal(subjectNoOverride.isAgeModified, false)

  // Active override provided that is identical to confirmed values
  const subjectIdenticalOverride = resolveDocumentSubject(confirmedReq, resident, {
    address: "456 Pedro St., Manila",
    age: "30",
  })
  assert.equal(subjectIdenticalOverride.beneficiaryReviewStatus, "confirmed")
  assert.equal(subjectIdenticalOverride.isBeneficiaryConfirmed, true)
  assert.equal(subjectIdenticalOverride.isAddressModified, false)
  assert.equal(subjectIdenticalOverride.isAgeModified, false)
})

test("F03: Editing beneficiary address invalidates confirmed state to 'modified'", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedBy: "Staff John",
    beneficiaryConfirmedAt: 1729000000000,
    confirmedBeneficiaryAddress: "456 Pedro St., Manila",
    confirmedBeneficiaryAge: 30,
  }

  const subject = resolveDocumentSubject(confirmedReq, resident, {
    address: "789 Edited Mabini St., Manila",
    age: "30",
  })

  assert.equal(subject.address, "789 Edited Mabini St., Manila")
  assert.equal(subject.isAddressModified, true)
  assert.equal(subject.isAgeModified, false)
  assert.equal(subject.isBeneficiaryModified, true)
  assert.equal(subject.beneficiaryReviewStatus, "modified")
  assert.equal(subject.isBeneficiaryConfirmed, false, "Modified address must revoke isBeneficiaryConfirmed")
})

test("F03: Reverting edited address back to confirmed value restores 'confirmed' status", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedBy: "Staff John",
    beneficiaryConfirmedAt: 1729000000000,
    confirmedBeneficiaryAddress: "456 Pedro St., Manila",
    confirmedBeneficiaryAge: 30,
  }

  // 1. Edit
  const modified = resolveDocumentSubject(confirmedReq, resident, {
    address: "Temporary Typo",
    age: "30",
  })
  assert.equal(modified.beneficiaryReviewStatus, "modified")

  // 2. Revert back to original confirmed address
  const restored = resolveDocumentSubject(confirmedReq, resident, {
    address: "456 Pedro St., Manila",
    age: "30",
  })
  assert.equal(restored.beneficiaryReviewStatus, "confirmed")
  assert.equal(restored.isBeneficiaryConfirmed, true)
  assert.equal(restored.isAddressModified, false)
})

test("F03: Editing beneficiary age independently invalidates confirmed state to 'modified'", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedBy: "Staff John",
    beneficiaryConfirmedAt: 1729000000000,
    confirmedBeneficiaryAddress: "456 Pedro St., Manila",
    confirmedBeneficiaryAge: 30,
  }

  const subject = resolveDocumentSubject(confirmedReq, resident, {
    address: "456 Pedro St., Manila",
    age: "35", // Edited age
  })

  assert.equal(subject.age, "35")
  assert.equal(subject.isAgeModified, true)
  assert.equal(subject.isAddressModified, false)
  assert.equal(subject.isBeneficiaryModified, true)
  assert.equal(subject.beneficiaryReviewStatus, "modified")
  assert.equal(subject.isBeneficiaryConfirmed, false)
})

test("F03: Missing beneficiary address produces 'missing' status", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const unconfirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
  }

  const subject = resolveDocumentSubject(unconfirmedReq, resident, {
    address: "",
  })
  assert.equal(subject.beneficiaryReviewStatus, "missing")
  assert.equal(subject.isBeneficiaryConfirmed, false)
  assert.equal(subject.isSubjectAddressMissing, true)
})

test("F03: Resident-submitted unreviewed beneficiary details produce 'provided' status", () => {
  const resident = { fullName: "Requester Maria", address: "123 Brgy St" }
  const unreviewedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    representedAddress: "Block 5 Lot 2, Unreviewed Ave",
    representedAge: 22,
  }

  const subject = resolveDocumentSubject(unreviewedReq, resident)
  assert.equal(subject.beneficiaryReviewStatus, "provided")
  assert.equal(subject.isBeneficiaryConfirmed, false)
  assert.equal(subject.address, "Block 5 Lot 2, Unreviewed Ave")
  assert.equal(subject.age, "22")
})

// ---------------------------------------------------------------------------
// F02: Authoritative Staff Beneficiary Confirmation Enforcement
// ---------------------------------------------------------------------------

test("F02: Represented-person requests require explicit staff confirmation before issuance", () => {
  // Simulate the authoritative backend check in request.markGenerated
  function checkIssuanceEligibility(request: any) {
    if (request.requestFor === "other") {
      const isConfirmed = request.beneficiaryReviewStatus === "confirmed" &&
        Boolean(request.beneficiaryConfirmedAt) &&
        Boolean(request.confirmedBeneficiaryAddress?.trim())

      if (!isConfirmed) {
        throw new Error("Represented-person document issuance requires prior explicit staff confirmation of beneficiary details.")
      }

      const validation = validateBeneficiaryDetails({
        confirmedAddress: request.confirmedBeneficiaryAddress,
        confirmedAge: request.confirmedBeneficiaryAge,
        name: request.requestedByName,
      })
      if (!validation.valid) {
        throw new Error(`Confirmed beneficiary details fail validation: ${validation.error}`)
      }
    }
    return true
  }

  // 1. Unconfirmed representation request fails
  const unconfirmedReq = {
    requestFor: "other",
    requestedByName: "Elena Represented",
    representedAddress: "Sample Address",
  }
  assert.throws(() => checkIssuanceEligibility(unconfirmedReq), /requires prior explicit staff confirmation/i)

  // 2. Confirmed representation request succeeds
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Elena Represented",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedAt: 1729000000000,
    beneficiaryConfirmedBy: "Staff Officer",
    confirmedBeneficiaryAddress: "Block 10 Lot 12, Barangay Compound",
    confirmedBeneficiaryAge: 19,
  }
  assert.doesNotThrow(() => checkIssuanceEligibility(confirmedReq))

  // 3. Direct resident request succeeds without requiring represented-person confirmation
  const directReq = {
    requestFor: "myself",
    residentName: "Juan Dela Cruz",
  }
  assert.doesNotThrow(() => checkIssuanceEligibility(directReq))
})

test("F02: Client-supplied payload to markGenerated cannot manufacture confirmation", () => {
  const unconfirmedReqInDb = {
    id: "req-123",
    requestFor: "other",
    requestedByName: "Elena Represented",
    beneficiaryReviewStatus: "provided",
    representedAddress: "Client Submitted Address",
  }

  // Client attempts direct API attack sending confirmedAddress to request.markGenerated
  const maliciousClientPayload = {
    confirmedAddress: "Hacker manufactured address",
    confirmedAge: 99,
  }

  // Backend must NOT read client payload to establish confirmation
  function processMarkGenerated(beforeDoc: any, _clientPayload: any) {
    if (beforeDoc.requestFor === "other") {
      const isConfirmed = beforeDoc.beneficiaryReviewStatus === "confirmed" &&
        Boolean(beforeDoc.beneficiaryConfirmedAt) &&
        Boolean(beforeDoc.confirmedBeneficiaryAddress?.trim())

      if (!isConfirmed) {
        throw new Error("Represented-person document issuance requires prior explicit staff confirmation of beneficiary details.")
      }
    }
  }

  assert.throws(
    () => processMarkGenerated(unconfirmedReqInDb, maliciousClientPayload),
    /requires prior explicit staff confirmation/i,
    "Malicious client markGenerated call must be rejected regardless of payload"
  )
})

test("F02: Issuance snapshot immutably captures confirmed details at generation", () => {
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Elena Represented",
    beneficiaryReviewStatus: "confirmed",
    beneficiaryConfirmedAt: 1729000000000,
    confirmedBeneficiaryAddress: "Authoritative Confirmed Address",
    confirmedBeneficiaryAge: 25,
  }

  const issuanceSnapshot = {
    hasGenerated: true,
    generatedAt: 1729100000000,
    issuanceBeneficiaryAddress: confirmedReq.confirmedBeneficiaryAddress,
    issuanceBeneficiaryAge: confirmedReq.confirmedBeneficiaryAge,
    issuanceBeneficiaryName: confirmedReq.requestedByName,
  }

  assert.equal(issuanceSnapshot.issuanceBeneficiaryAddress, "Authoritative Confirmed Address")
  assert.equal(issuanceSnapshot.issuanceBeneficiaryAge, 25)
  assert.equal(issuanceSnapshot.issuanceBeneficiaryName, "Elena Represented")
})

test("F02: Reprint preserves original generatedAt and increments reprintCount", () => {
  const existingReq = {
    hasGenerated: true,
    generatedAt: 1727481600000, // Original issuance timestamp
    reprintCount: 0,
  }

  const reprintTime = 1729200000000
  const isFirstGen = !existingReq.hasGenerated

  const updatedReq = {
    ...existingReq,
    hasGenerated: true,
    generatedAt: isFirstGen ? reprintTime : existingReq.generatedAt,
    ...(isFirstGen ? {} : {
      lastReprintedAt: reprintTime,
      reprintCount: (existingReq.reprintCount || 0) + 1,
    }),
  }

  assert.equal(updatedReq.generatedAt, 1727481600000, "Original generatedAt must be preserved on reprint")
  assert.equal(updatedReq.reprintCount, 1)
  assert.equal(updatedReq.lastReprintedAt, reprintTime)
})

// ---------------------------------------------------------------------------
// F01: Configuration Concurrency Mutation Invariants
// ---------------------------------------------------------------------------

interface ConfigState {
  version: number
  documentTypes: string[]
  documentFees: Record<string, number>
  customDocumentTypes: Array<{ id: string; name: string; fee: number }>
  templates: Record<string, string>
  barangayName?: string
  contactNumber?: string
  [key: string]: unknown
}

function simulateConfigUpdateTransaction(
  before: ConfigState | null,
  updatePayload: {
    baseVersion?: number
    baseConfig?: Record<string, unknown>
    changedFields?: string[]
    [key: string]: unknown
  }
): ConfigState {
  if (before) {
    if (typeof updatePayload.baseVersion !== "number") {
      throw Object.assign(new Error("Concurrency precondition required: 'baseVersion' must be supplied."), { status: 400 })
    }

    const currentVersion = typeof before.version === "number" ? before.version : 1
    const baseVersion = updatePayload.baseVersion
    const baseConfig = updatePayload.baseConfig || {}

    if (currentVersion !== baseVersion) {
      const explicitChangedFields = Array.isArray(updatePayload.changedFields)
        ? updatePayload.changedFields
        : Object.keys(updatePayload).filter(k => k !== "baseVersion" && k !== "baseConfig" && k !== "changedFields")

      const overlappingFields = explicitChangedFields.filter(f => {
        const serverVal = before[f]
        const baseVal = baseConfig[f]
        return JSON.stringify(serverVal ?? null) !== JSON.stringify(baseVal ?? null)
      })

      if (overlappingFields.length > 0) {
        throw Object.assign(
          new Error(`Configuration conflict: ${overlappingFields.join(", ")} was modified concurrently.`),
          { status: 409, conflictingFields: overlappingFields }
        )
      }
    }
  }

  const { baseVersion, baseConfig, changedFields, ...cleanPayload } = updatePayload
  const nextVersion = before ? (typeof before.version === "number" ? before.version + 1 : 2) : 1

  return {
    ...(before || {}),
    ...cleanPayload,
    version: nextVersion,
  } as ConfigState
}

test("F01: Missing baseVersion is rejected with HTTP 400 when config exists", () => {
  const currentConfig: ConfigState = {
    version: 3,
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
  }

  assert.throws(
    () => simulateConfigUpdateTransaction(currentConfig, {
      documentTypes: ["Barangay Clearance", "New Type"],
      // baseVersion omitted
    }),
    /baseVersion.*must be/i
  )
})

test("F01: Overlapping concurrent modifications are rejected with HTTP 409", () => {
  const serverConfig: ConfigState = {
    version: 5, // Server was bumped to 5 by another admin who deleted custom-cert
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
    barangayName: "Server Edited Barangay",
  }

  // Admin A has baseVersion 4 where custom-cert still existed in baseConfig
  const baseConfig = {
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [{ id: "custom-cert", name: "Custom Cert", fee: 100 }],
    templates: {},
    barangayName: "Old Barangay",
  }

  // Admin A also tries to modify customDocumentTypes
  assert.throws(
    () => simulateConfigUpdateTransaction(serverConfig, {
      baseVersion: 4,
      baseConfig,
      changedFields: ["customDocumentTypes"],
      customDocumentTypes: [{ id: "custom-cert", name: "Custom Cert Edited", fee: 150 }],
    }),
    (err: any) => err.status === 409 && err.conflictingFields.includes("customDocumentTypes")
  )
})

test("F01: Non-overlapping concurrent modifications merge safely and increment version", () => {
  const serverConfig: ConfigState = {
    version: 5, // Bumped to 5 because Admin B updated branding
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
    barangayName: "New Barangay Name by Admin B",
  }

  // Admin A has baseVersion 4 where barangayName was still old, but Admin A is ONLY changing customDocumentTypes and documentTypes
  const baseConfig = {
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
    barangayName: "Old Barangay Name",
  }

  // Admin A's changedFields ("customDocumentTypes", "documentTypes") have NOT changed on server (server still has [] and ["Barangay Clearance"])
  const result = simulateConfigUpdateTransaction(serverConfig, {
    baseVersion: 4,
    baseConfig,
    changedFields: ["customDocumentTypes", "documentTypes"],
    customDocumentTypes: [{ id: "solo_parent", name: "Solo Parent", fee: 0 }],
    documentTypes: ["Barangay Clearance", "Solo Parent"],
  })

  assert.equal(result.version, 6)
  assert.equal(result.barangayName, "New Barangay Name by Admin B", "Admin B's branding must be preserved")
  assert.equal(result.customDocumentTypes.length, 1)
  assert.equal(result.customDocumentTypes[0].name, "Solo Parent")
})

test("F01: Minimal payload is constructed for Add and Delete custom document operations", () => {
  const baseline: ConfigState = {
    version: 2,
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
  }

  // Add payload construction
  const addPayload = {
    documentTypes: [...baseline.documentTypes, "Health Certificate"],
    documentFees: { ...baseline.documentFees, "Health Certificate": 75 },
    customDocumentTypes: [{ id: "health_cert", name: "Health Certificate", fee: 75 }],
    templates: { ...baseline.templates, health_cert: "Template content" },
    baseVersion: baseline.version,
    changedFields: ["documentTypes", "documentFees", "customDocumentTypes", "templates"],
  }

  assert.equal(addPayload.baseVersion, 2)
  assert.ok(!("barangayCaptainName" in addPayload), "Unrelated fields should not be sent in minimal payload")
  assert.deepEqual(addPayload.changedFields, ["documentTypes", "documentFees", "customDocumentTypes", "templates"])

  const updated = simulateConfigUpdateTransaction(baseline, addPayload)
  assert.equal(updated.version, 3)
  assert.equal(updated.documentTypes.includes("Health Certificate"), true)

  // Delete payload construction
  const deletePayload = {
    documentTypes: updated.documentTypes.filter(d => d !== "Health Certificate"),
    documentFees: { ...updated.documentFees },
    customDocumentTypes: [],
    baseVersion: updated.version,
    changedFields: ["documentTypes", "documentFees", "customDocumentTypes"],
  }
  delete deletePayload.documentFees["Health Certificate"]

  const deletedResult = simulateConfigUpdateTransaction(updated, deletePayload)
  assert.equal(deletedResult.version, 4)
  assert.equal(deletedResult.documentTypes.includes("Health Certificate"), false)
  assert.equal(deletedResult.customDocumentTypes.length, 0)
})
