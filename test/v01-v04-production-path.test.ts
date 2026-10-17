import test from "node:test"
import assert from "node:assert/strict"
import {
  computeHasUnsavedEdits,
  prepareAddDocTypePayload,
  prepareDeleteDocTypePayload,
  type EditableConfigFormData,
} from "../lib/superadmin/config-helpers.ts"
import {
  resolveDocumentSubject,
  validateBeneficiaryDetails,
} from "../lib/document-catalog.ts"
import { createAdminOperationsHandler } from "../app/api/admin/operations/route.ts"

// ---------------------------------------------------------------------------
// V01: Unsaved Configuration State Isolation Tests
// ---------------------------------------------------------------------------

test("V01: Scenario A - Adding document type preserves unsaved branding edits and maintains dirty state", () => {
  const baseline = {
    version: 2,
    barangayName: "Original Barangay",
    address: "Original City",
    contactNumber: "02-8111-0000",
    emailAddress: "info@brgy.gov.ph",
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {
      barangay_clearance: "Original template",
    },
  }

  // Operator edits contact number locally (draft)
  const draftFormData: EditableConfigFormData = {
    barangayName: "Original Barangay",
    address: "Original City",
    contactNumber: "02-8999-9999", // Unsaved edit!
    emailAddress: "info@brgy.gov.ph",
    barangayCaptainName: "",
    secretaryName: "",
    captainSignatureUrl: "",
    secretarySignatureUrl: "",
    templates: { ...baseline.templates },
  }

  // Initially dirty due to contact edit
  assert.equal(computeHasUnsavedEdits(draftFormData, null, null, baseline), true)

  // Operator adds a custom document type
  const payload = prepareAddDocTypePayload({
    docId: "cert_residency",
    docName: "Certificate of Residency",
    docIcon: "📄",
    docFee: 60,
    docHeader: "C E R T I F I C A T I O N",
    docTemplate: "Residency template content",
    baseline,
    effectiveDocTypes: ["Barangay Clearance"],
    effectiveDocFees: { "Barangay Clearance": 50 },
    existingCustomDocs: [],
  })

  // 1. Catalog update does NOT include unsaved branding edits
  assert.ok(!("contactNumber" in payload.updates))
  assert.equal(payload.updates.documentTypes.includes("Certificate of Residency"), true)
  assert.equal(payload.updates.documentFees["Certificate of Residency"], 60)
  assert.equal(payload.updates.templates.cert_residency, "Residency template content")
  // Only cert_residency template was committed, not unrelated draft state
  assert.equal(payload.updates.templates.barangay_clearance, "Original template")

  // 2. Updated baseline has new version and committed catalog
  const newBaseline = payload.updatedBaseline
  assert.equal(newBaseline.version, 3)

  // 3. Local form receives the new template while retaining unsaved contact number
  const nextFormData: EditableConfigFormData = {
    ...draftFormData,
    templates: {
      ...draftFormData.templates,
      cert_residency: "Residency template content",
    },
  }
  assert.equal(nextFormData.contactNumber, "02-8999-9999")

  // 4. Dirty state remains true because contact edit is still pending!
  const isStillDirty = computeHasUnsavedEdits(nextFormData, null, null, newBaseline)
  assert.equal(isStillDirty, true, "Dirty state must remain true for remaining unsaved branding edit")

  // 5. Subsequent save of remaining changes persists contact number
  const savedFormData = { ...nextFormData }
  const finalBaseline = {
    ...newBaseline,
    contactNumber: savedFormData.contactNumber,
    version: 4,
  }
  const isDirtyAfterSaveAll = computeHasUnsavedEdits(savedFormData, null, null, finalBaseline)
  assert.equal(isDirtyAfterSaveAll, false, "Dirty state must clear once all changes are persisted")
})

test("V01: Scenario B - Deleting document type preserves unsaved template edits and maintains dirty state", () => {
  const baseline = {
    version: 4,
    barangayName: "Original Barangay",
    documentTypes: ["Barangay Clearance", "Health Certificate"],
    documentFees: { "Barangay Clearance": 50, "Health Certificate": 75 },
    customDocumentTypes: [{ id: "health_cert", name: "Health Certificate", fee: 75 }],
    templates: {
      barangay_clearance: "Original Clearance Template",
      health_cert: "Health Cert Template",
    },
  }

  // Operator has unsaved edits in Barangay Clearance template
  const draftFormData: EditableConfigFormData = {
    barangayName: "Original Barangay",
    address: "",
    contactNumber: "",
    emailAddress: "",
    barangayCaptainName: "",
    secretaryName: "",
    captainSignatureUrl: "",
    secretarySignatureUrl: "",
    templates: {
      barangay_clearance: "MODIFIED Clearance Template (Unsaved Draft)",
      health_cert: "Health Cert Template",
    },
  }

  assert.equal(computeHasUnsavedEdits(draftFormData, null, null, baseline), true)

  // Operator deletes custom document type "Health Certificate"
  const payload = prepareDeleteDocTypePayload({
    docName: "Health Certificate",
    docId: "health_cert",
    baseline,
    effectiveDocTypes: baseline.documentTypes,
    effectiveDocFees: baseline.documentFees,
    existingCustomDocs: baseline.customDocumentTypes,
  })

  // 1. Catalog updates remove health_cert
  assert.equal(payload.updates.documentTypes.includes("Health Certificate"), false)
  assert.equal("health_cert" in payload.updates.templates, false)
  // Committed templates does NOT leak the unsaved draft of barangay_clearance
  assert.equal(payload.updates.templates.barangay_clearance, "Original Clearance Template")

  // 2. Local form removes health_cert but preserves modified barangay_clearance
  const nextFormData: EditableConfigFormData = {
    ...draftFormData,
    templates: { ...draftFormData.templates },
  }
  delete nextFormData.templates.health_cert
  assert.equal(nextFormData.templates.barangay_clearance, "MODIFIED Clearance Template (Unsaved Draft)")

  // 3. Dirty state remains true because the modified template draft is still pending
  const isStillDirty = computeHasUnsavedEdits(nextFormData, null, null, payload.updatedBaseline)
  assert.equal(isStillDirty, true, "Dirty state must remain true because clearance template draft is unsaved")
})

test("V01: Discarding changes restores authoritative baseline and clears dirty state", () => {
  const baseline = {
    version: 1,
    contactNumber: "02-8123-4567",
    templates: { barangay_clearance: "Server Template" },
  }

  const modifiedFormData: EditableConfigFormData = {
    barangayName: "",
    address: "",
    contactNumber: "02-9999-9999",
    emailAddress: "",
    barangayCaptainName: "",
    secretaryName: "",
    captainSignatureUrl: "",
    secretarySignatureUrl: "",
    templates: { barangay_clearance: "Local Scratchpad" },
  }

  assert.equal(computeHasUnsavedEdits(modifiedFormData, null, null, baseline), true)

  // Discard action: reset formData to baseline
  const resetFormData: EditableConfigFormData = {
    ...modifiedFormData,
    contactNumber: baseline.contactNumber,
    templates: { ...baseline.templates },
  }

  assert.equal(computeHasUnsavedEdits(resetFormData, null, null, baseline), false)
})

// ---------------------------------------------------------------------------
// V02 & V03: Document Issuance, Reprint, and Beneficiary Consistency Tests
// ---------------------------------------------------------------------------

test("V02: resolveDocumentSubject preserves original issuance snapshot on reprint", () => {
  const resident = { fullName: "Requester Maria", address: "123 Old St" }

  // Initial issuance was done with Address A and Age 25
  const originalIssuedReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    relationship: "Brother",
    hasGenerated: true,
    generatedAt: 1729000000000,
    issuanceBeneficiaryName: "Pedro Beneficiary",
    issuanceBeneficiaryAddress: "Address A - 101 Historical Blvd",
    issuanceBeneficiaryAge: 25,
    // Database was later updated to Address B and Age 26
    confirmedBeneficiaryAddress: "Address B - 202 Newer Ave",
    confirmedBeneficiaryAge: 26,
    beneficiaryReviewStatus: "confirmed" as const,
    beneficiaryConfirmedAt: 1729100000000,
  }

  // Document resolver on reprint without manual input overrides
  const reprintSubject = resolveDocumentSubject(originalIssuedReq, resident)

  assert.equal(reprintSubject.subjectName, "Pedro Beneficiary")
  assert.equal(reprintSubject.address, "Address A - 101 Historical Blvd", "Reprint must use historical issuance address, not newer database address")
  assert.equal(reprintSubject.age, "25", "Reprint must use historical issuance age")
  assert.equal(reprintSubject.isReprint, true)
})

test("V02: resolveDocumentSubject falls back to confirmed details for first-time issuance", () => {
  const resident = { fullName: "Requester Maria", address: "123 Old St" }

  const firstTimeReq = {
    requestFor: "other",
    requestedByName: "Pedro Beneficiary",
    hasGenerated: false,
    confirmedBeneficiaryName: "Pedro Beneficiary",
    confirmedBeneficiaryAddress: "Address B - 202 Newer Ave",
    confirmedBeneficiaryAge: 26,
    beneficiaryReviewStatus: "confirmed" as const,
    beneficiaryConfirmedAt: 1729100000000,
  }

  const subject = resolveDocumentSubject(firstTimeReq, resident)

  assert.equal(subject.subjectName, "Pedro Beneficiary")
  assert.equal(subject.address, "Address B - 202 Newer Ave")
  assert.equal(subject.age, "26")
  assert.equal(subject.isReprint, false)
})

test("V03: validateBeneficiaryDetails enforces name validation and rejects invalid fields", () => {
  // Missing address fails
  assert.equal(validateBeneficiaryDetails({ age: 25 }).valid, false)

  // Empty string address fails
  assert.equal(validateBeneficiaryDetails({ address: "   " }).valid, false)

  // Negative age fails
  assert.equal(validateBeneficiaryDetails({ address: "Valid", age: -5 }).valid, false)

  // Age > 130 fails
  assert.equal(validateBeneficiaryDetails({ address: "Valid", age: 131 }).valid, false)

  // Name length > 150 fails
  assert.equal(validateBeneficiaryDetails({ address: "Valid", name: "A".repeat(151) }).valid, false)

  // Valid payload succeeds
  const valid = validateBeneficiaryDetails({ address: "123 Main St", age: 30, name: "Juan Dela Cruz" })
  assert.equal(valid.valid, true)
  assert.equal(valid.data?.name, "Juan Dela Cruz")
  assert.equal(valid.data?.address, "123 Main St")
  assert.equal(valid.data?.age, 30)
})

// ---------------------------------------------------------------------------
// V04: Production Route Handler Mock-Database Integration Tests
// ---------------------------------------------------------------------------

function createMockFirestoreDb(initialData: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(initialData))

  function docRef(path: string) {
    return {
      path,
      id: path.split("/").pop(),
      async get() {
        const data = store.get(path)
        return {
          exists: data !== undefined && data !== null,
          data: () => data,
        }
      },
    }
  }

  function collection(name: string) {
    return {
      name,
      doc(id: string) {
        return docRef(`${name}/${id}`)
      },
    }
  }

  async function runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const reads = new Map<string, any>()
    const writes: Array<{ type: "set" | "update" | "delete"; path: string; data?: any; options?: any }> = []

    const transaction = {
      async get(ref: any) {
        const val = store.get(ref.path)
        reads.set(ref.path, val)
        return {
          exists: val !== undefined && val !== null,
          data: () => val,
        }
      },
      set(ref: any, data: any, options?: any) {
        writes.push({ type: "set", path: ref.path, data, options })
      },
      update(ref: any, data: any) {
        writes.push({ type: "update", path: ref.path, data })
      },
      delete(ref: any) {
        writes.push({ type: "delete", path: ref.path })
      },
      create(ref: any, data: any) {
        writes.push({ type: "set", path: ref.path, data })
      },
    }

    const result = await updateFunction(transaction)

    // Commit writes to mock store
    for (const w of writes) {
      if (w.type === "set") {
        if (w.options?.merge) {
          const prev = store.get(w.path) || {}
          store.set(w.path, { ...prev, ...w.data })
        } else {
          store.set(w.path, w.data)
        }
      } else if (w.type === "update") {
        const prev = store.get(w.path) || {}
        store.set(w.path, { ...prev, ...w.data })
      } else if (w.type === "delete") {
        store.delete(w.path)
      }
    }

    return result
  }

  return { collection, runTransaction, rawStore: store }
}

const mockAuth = {
  verifyIdToken: async (token: string) => {
    if (token === "superadmin-token") return { uid: "superadmin-1" }
    if (token === "admin-token") return { uid: "admin-1" }
    throw new Error("Invalid token")
  },
}

test("V04: createAdminOperationsHandler enforces missing baseVersion check (HTTP 400)", async () => {
  const db = createMockFirestoreDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5,
      barangayName: "Sample Barangay",
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer superadmin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-test-1",
      payload: {
        updates: { barangayName: "New Barangay" },
        // baseVersion omitted!
      },
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /concurrency precondition required/i)
})

test("V04: createAdminOperationsHandler rejects concurrent version conflict (HTTP 409)", async () => {
  const db = createMockFirestoreDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5, // Server is at 5
      barangayName: "Server Changed Name",
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer superadmin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-test-2",
      payload: {
        baseVersion: 4, // Client has stale baseVersion 4
        baseConfig: { barangayName: "Client Old Name" },
        changedFields: ["barangayName"],
        updates: { barangayName: "Client Proposed Name" },
      },
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.match(body.error, /configuration conflict/i)
  assert.deepEqual(body.conflictingFields, ["barangayName"])
})

test("V04: createAdminOperationsHandler flags conflict when baseConfig omits field during version mismatch (V01 concurrency)", async () => {
  const db = createMockFirestoreDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5,
      documentTypes: ["Barangay Clearance"],
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer superadmin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-test-3",
      payload: {
        baseVersion: 4, // Diverged
        baseConfig: {}, // Missing documentTypes in baseConfig!
        changedFields: ["documentTypes"],
        updates: { documentTypes: ["Barangay Clearance", "New Doc"] },
      },
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.match(body.error, /configuration conflict/i)
})

test("V04: createAdminOperationsHandler merges non-overlapping changes safely", async () => {
  const db = createMockFirestoreDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5, // Bumped by Admin B who updated contactNumber
      barangayName: "Original Brgy",
      contactNumber: "02-8888-8888",
      documentTypes: ["Barangay Clearance"],
      documentFees: { "Barangay Clearance": 50 },
      customDocumentTypes: [],
      templates: {},
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  // Admin A has baseVersion 4 (where contact was still old), but Admin A is ONLY changing customDocumentTypes
  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer superadmin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-test-4",
      payload: {
        baseVersion: 4,
        baseConfig: {
          customDocumentTypes: [],
          documentTypes: ["Barangay Clearance"],
        },
        changedFields: ["customDocumentTypes", "documentTypes"],
        updates: {
          customDocumentTypes: [{ id: "solo_parent", name: "Solo Parent", fee: 0 }],
          documentTypes: ["Barangay Clearance", "Solo Parent"],
        },
      },
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 200)
  const stored = db.rawStore.get("systemConfig/global")
  assert.equal(stored.version, 6)
  assert.equal(stored.contactNumber, "02-8888-8888", "Admin B's contactNumber must be preserved")
  assert.equal(stored.documentTypes.includes("Solo Parent"), true)
})

test("V04: createAdminOperationsHandler rejects routine beneficiary confirmation name mismatch (V03)", async () => {
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-101": {
      id: "req-101",
      requestFor: "other",
      requestedByName: "Original Beneficiary Pedro",
      status: "Approved",
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "request.confirmBeneficiary",
      operationId: "op-test-5",
      targetId: "req-101",
      payload: {
        name: "Substituted Identity Juan", // Identity substitution attempt!
        address: "123 Valid St",
        age: 30,
      },
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /must match requested beneficiary name/i)
})

test("V04: createAdminOperationsHandler rejects unconfirmed represented generation (HTTP 400)", async () => {
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-unconfirmed": {
      id: "req-unconfirmed",
      requestFor: "other",
      requestedByName: "Pedro Beneficiary",
      beneficiaryReviewStatus: "provided", // Not confirmed!
      status: "Approved",
    },
  })

  const handler = createAdminOperationsHandler({ auth: mockAuth as any, db: db as any })

  const req = new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-test-6",
      targetId: "req-unconfirmed",
    }),
  })

  const res = await handler(req)
  assert.equal(res.status, 400)
  const body = await res.json()
  assert.match(body.error, /must be explicitly confirmed by staff/i)
})

test("V04: createAdminOperationsHandler captures snapshot on first gen and preserves on reprint (V02)", async () => {
  const genTime = 1729000000000
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-confirmed": {
      id: "req-confirmed",
      requestFor: "other",
      requestedByName: "Pedro Beneficiary",
      status: "Approved",
      beneficiaryReviewStatus: "confirmed",
      beneficiaryConfirmedAt: genTime - 1000,
      confirmedBeneficiaryAddress: "Initial Address A",
      confirmedBeneficiaryAge: 25,
      hasGenerated: false,
    },
  })

  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => genTime,
  })

  // 1. Initial generation
  const res1 = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-gen-1",
      targetId: "req-confirmed",
    }),
  }))
  assert.equal(res1.status, 200)

  const docAfterGen = db.rawStore.get("documentRequests/req-confirmed")
  assert.equal(docAfterGen.hasGenerated, true)
  assert.equal(docAfterGen.generatedAt, genTime)
  assert.equal(docAfterGen.issuanceBeneficiaryAddress, "Initial Address A")
  assert.equal(docAfterGen.issuanceBeneficiaryAge, 25)
  assert.equal(docAfterGen.issuanceBeneficiaryName, "Pedro Beneficiary")

  // 2. Someone updates confirmedBeneficiaryAddress in the database to Address B
  docAfterGen.confirmedBeneficiaryAddress = "Newer Address B"
  docAfterGen.confirmedBeneficiaryAge = 26

  // 3. Admin reprints the document
  const reprintTime = genTime + 50000
  const reprintHandler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => reprintTime,
  })

  const res2 = await reprintHandler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-reprint-1",
      targetId: "req-confirmed",
    }),
  }))
  assert.equal(res2.status, 200)

  const docAfterReprint = db.rawStore.get("documentRequests/req-confirmed")
  assert.equal(docAfterReprint.generatedAt, genTime, "Original generatedAt must be preserved on reprint")
  assert.equal(docAfterReprint.lastReprintedAt, reprintTime)
  assert.equal(docAfterReprint.reprintCount, 1)
  assert.equal(docAfterReprint.issuanceBeneficiaryAddress, "Initial Address A", "Original issuance address must be preserved on reprint")
  assert.equal(docAfterReprint.issuanceBeneficiaryAge, 25, "Original issuance age must be preserved on reprint")
})

test("V04: createAdminOperationsHandler supports explicit request.reissueCorrected with historical archiving (V02)", async () => {
  const origTime = 1729000000000
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-reissue": {
      id: "req-reissue",
      requestFor: "myself",
      residentName: "Maria Dela Cruz",
      status: "Approved",
      hasGenerated: true,
      generatedAt: origTime,
      issuanceBeneficiaryAddress: "Old Address 1",
      issuanceBeneficiaryAge: 28,
    },
  })

  const correctionTime = origTime + 100000
  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => correctionTime,
  })

  // Short reason (< 10 chars) rejected
  const shortRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reissueCorrected",
      operationId: "op-reissue-short",
      targetId: "req-reissue",
      payload: {
        address: "New Valid Address 2",
        correctionReason: "Typo", // Too short!
      },
    }),
  }))
  assert.equal(shortRes.status, 400)
  assert.match((await shortRes.json()).error, /at least 10 characters/i)

  // Valid reissueCorrected call
  const validRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reissueCorrected",
      operationId: "op-reissue-valid",
      targetId: "req-reissue",
      payload: {
        address: "New Corrected Address 2",
        age: 29,
        correctionReason: "Official change of residence submitted with utility bill proof",
      },
    }),
  }))
  assert.equal(validRes.status, 200)

  const doc = db.rawStore.get("documentRequests/req-reissue")
  assert.equal(doc.isCorrectedIssuance, true)
  assert.equal(doc.lastCorrectedAt, correctionTime)
  assert.equal(doc.issuanceBeneficiaryAddress, "New Corrected Address 2")
  assert.equal(doc.issuanceBeneficiaryAge, 29)
  assert.equal(doc.issuanceHistory.length, 1)
  assert.equal(doc.issuanceHistory[0].beneficiaryAddress, "Old Address 1")
  assert.equal(doc.issuanceHistory[0].supersededAt, correctionTime)
  assert.equal(doc.issuanceHistory[0].supersededBy, "Admin Officer")
})
// ---------------------------------------------------------------------------
// MT01: Authorized Reprinting of Completed Requests Tests
// ---------------------------------------------------------------------------

test("MT01: Completed + previously generated request supports authorized reprint (status remains Completed)", async () => {
  const origGenTime = 1729000000000
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-completed-gen": {
      id: "req-completed-gen",
      requestFor: "myself",
      residentName: "Elena Ramos",
      status: "Completed",
      hasGenerated: true,
      generatedAt: origGenTime,
      issuanceDate: new Date(origGenTime).toISOString(),
      issuanceBeneficiaryAddress: "789 Completed St",
      issuanceBeneficiaryAge: 35,
      issuanceBeneficiaryName: "Elena Ramos",
      reprintCount: 0,
    },
  })

  const reprintTime = origGenTime + 200000
  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => reprintTime,
  })

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-mt01-reprint-completed",
      targetId: "req-completed-gen",
    }),
  }))
  assert.equal(res.status, 200)

  const doc = db.rawStore.get("documentRequests/req-completed-gen")
  assert.equal(doc.status, "Completed", "Status must strictly remain Completed")
  assert.equal(doc.generatedAt, origGenTime, "Original generatedAt must be preserved")
  assert.equal(doc.lastReprintedAt, reprintTime, "lastReprintedAt must be recorded")
  assert.equal(doc.reprintCount, 1, "reprintCount must increment to 1")
  assert.equal(doc.issuanceBeneficiaryAddress, "789 Completed St", "Original issuance address preserved")
  assert.equal(doc.issuanceBeneficiaryAge, 35, "Original issuance age preserved")
  assert.equal(doc.issuanceBeneficiaryName, "Elena Ramos", "Original issuance name preserved")
})

test("MT01: Completed + never generated request denies reprint (HTTP 409 on markGenerated, HTTP 400 on reprint)", async () => {
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-completed-ungen": {
      id: "req-completed-ungen",
      requestFor: "myself",
      residentName: "Unissued Resident",
      status: "Completed",
      hasGenerated: false,
    },
  })

  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
  })

  const res1 = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-mt01-ungen-1",
      targetId: "req-completed-ungen",
    }),
  }))
  assert.equal(res1.status, 409)
  assert.match((await res1.json()).error, /terminal state 'Completed'/i)

  const res2 = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-ungen-2",
      targetId: "req-completed-ungen",
    }),
  }))
  assert.equal(res2.status, 400)
  assert.match((await res2.json()).error, /not been generated previously/i)
})

test("MT01: Rejected and Cancelled requests deny reprint under existing policy (HTTP 409)", async () => {
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-rejected": {
      id: "req-rejected",
      status: "Rejected",
      hasGenerated: true,
      generatedAt: 1729000000000,
    },
    "documentRequests/req-cancelled": {
      id: "req-cancelled",
      status: "Cancelled",
      hasGenerated: true,
      generatedAt: 1729000000000,
    },
  })

  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
  })

  const resRej = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-mt01-rej",
      targetId: "req-rejected",
    }),
  }))
  assert.equal(resRej.status, 409)

  const resCan = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-can",
      targetId: "req-cancelled",
    }),
  }))
  assert.equal(resCan.status, 409)
})

test("MT01: Explicit request.reprint operation succeeds and increments reprintCount transactionally", async () => {
  const origGenTime = 1729000000000
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "documentRequests/req-reprint-op": {
      id: "req-reprint-op",
      status: "Completed",
      hasGenerated: true,
      generatedAt: origGenTime,
      issuanceDate: new Date(origGenTime).toISOString(),
      issuanceBeneficiaryAddress: "456 Archival St",
      issuanceBeneficiaryAge: 40,
      issuanceBeneficiaryName: "Archival Resident",
      reprintCount: 2,
    },
  })

  const reprintTime = origGenTime + 300000
  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => reprintTime,
  })

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-explicit-reprint",
      targetId: "req-reprint-op",
    }),
  }))
  assert.equal(res.status, 200)

  const doc = db.rawStore.get("documentRequests/req-reprint-op")
  assert.equal(doc.status, "Completed")
  assert.equal(doc.reprintCount, 3)
  assert.equal(doc.lastReprintedAt, reprintTime)
  assert.equal(doc.generatedAt, origGenTime)

  // Retrying with identical operationId does NOT increment count twice (idempotency)
  const resRetry = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-explicit-reprint",
      targetId: "req-reprint-op",
    }),
  }))
  assert.equal(resRetry.status, 200)
  const docAfterRetry = db.rawStore.get("documentRequests/req-reprint-op")
  assert.equal(docAfterRetry.reprintCount, 3, "Idempotent retry must not increment count twice")
})

test("MT01: View Only role attempting reprint is denied with HTTP 403", async () => {
  const db = createMockFirestoreDb({
    "users/admin-viewonly": { role: "View Only", status: "Active", name: "View Only Staff" },
    "documentRequests/req-issued": {
      id: "req-issued",
      status: "Completed",
      hasGenerated: true,
      generatedAt: 1729000000000,
    },
  })

  const viewOnlyAuth = {
    verifyIdToken: async (token: string) => {
      if (token === "viewonly-token") return { uid: "admin-viewonly" }
      throw new Error("Invalid token")
    },
  }

  const handler = createAdminOperationsHandler({
    auth: viewOnlyAuth as any,
    db: db as any,
  })

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer viewonly-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-viewonly-reprint",
      targetId: "req-issued",
    }),
  }))
  assert.equal(res.status, 403)
  assert.match((await res.json()).error, /not authorized/i)
})

test("MT01: Reprint after profile change strictly preserves original issuance snapshot", async () => {
  const origTime = 1729000000000
  const db = createMockFirestoreDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Admin Officer" },
    "users/resident-1": {
      role: "resident",
      status: "Active",
      name: "Resident A",
      address: "New Address 2026 (Updated in Profile)",
      age: 35,
    },
    "documentRequests/req-profile-change": {
      id: "req-profile-change",
      residentId: "resident-1",
      requestFor: "myself",
      residentName: "Resident A",
      status: "Completed",
      hasGenerated: true,
      generatedAt: origTime,
      issuanceBeneficiaryAddress: "Original Historical Address 2024",
      issuanceBeneficiaryAge: 33,
      issuanceBeneficiaryName: "Resident A",
      reprintCount: 0,
    },
  })

  const handler = createAdminOperationsHandler({
    auth: mockAuth as any,
    db: db as any,
    now: () => origTime + 500000,
  })

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.reprint",
      operationId: "op-mt01-profile-change-reprint",
      targetId: "req-profile-change",
    }),
  }))
  assert.equal(res.status, 200)

  const doc = db.rawStore.get("documentRequests/req-profile-change")
  assert.equal(doc.issuanceBeneficiaryAddress, "Original Historical Address 2024", "Must not substitute newer profile address")
  assert.equal(doc.issuanceBeneficiaryAge, 33, "Must not substitute newer profile age")
  assert.equal(doc.generatedAt, origTime, "Original generatedAt unchanged")
})
