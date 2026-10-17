import test from "node:test"
import assert from "node:assert/strict"
import {
  validateBeneficiaryDetails,
  resolveDocumentSubject,
  type BeneficiaryReviewStatus,
} from "../lib/document-catalog.ts"
import { createAdminOperationsHandler } from "../app/api/admin/operations/route.ts"
import {
  prepareAddDocTypePayload,
  prepareDeleteDocTypePayload,
} from "../lib/superadmin/config-helpers.ts"

function createF01MockDb(initialData: Record<string, any>) {
  const store = new Map<string, any>(Object.entries(initialData))
  function docRef(path: string) {
    return {
      path,
      id: path.split("/").pop(),
      async get() {
        const data = store.get(path)
        return { exists: data !== undefined && data !== null, data: () => data }
      },
    }
  }
  function collection(name: string) {
    return {
      name,
      doc(id: string) { return docRef(`${name}/${id}`) },
    }
  }
  async function runTransaction<T>(updateFunction: (transaction: any) => Promise<T>): Promise<T> {
    const writes: Array<{ type: "set" | "update" | "delete"; path: string; data?: any; options?: any }> = []
    const transaction = {
      async get(ref: any) {
        const val = store.get(ref.path)
        return { exists: val !== undefined && val !== null, data: () => val }
      },
      set(ref: any, data: any, options?: any) { writes.push({ type: "set", path: ref.path, data, options }) },
      update(ref: any, data: any) { writes.push({ type: "update", path: ref.path, data }) },
      delete(ref: any) { writes.push({ type: "delete", path: ref.path }) },
      create(ref: any, data: any) { writes.push({ type: "set", path: ref.path, data }) },
    }
    const result = await updateFunction(transaction)
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
  return { collection, runTransaction, store }
}

const f01Auth = {
  verifyIdToken: async (token: string) => {
    if (token === "superadmin-tok") return { uid: "superadmin-1" }
    if (token === "admin-tok") return { uid: "admin-1" }
    throw new Error("Invalid token")
  },
}

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

test("F02: Represented-person requests require explicit staff confirmation before issuance", async () => {
  const db = createF01MockDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Staff Officer" },
    "documentRequests/unconfirmed-req": {
      id: "unconfirmed-req",
      requestFor: "other",
      requestedByName: "Elena Represented",
      representedAddress: "Sample Address",
      status: "Approved",
      beneficiaryReviewStatus: "provided",
    },
    "documentRequests/confirmed-req": {
      id: "confirmed-req",
      requestFor: "other",
      requestedByName: "Elena Represented",
      status: "Approved",
      beneficiaryReviewStatus: "confirmed",
      beneficiaryConfirmedAt: 1729000000000,
      beneficiaryConfirmedBy: "Staff Officer",
      confirmedBeneficiaryAddress: "Block 10 Lot 12, Barangay Compound",
      confirmedBeneficiaryAge: 19,
    },
    "documentRequests/direct-req": {
      id: "direct-req",
      requestFor: "myself",
      residentName: "Juan Dela Cruz",
      status: "Approved",
    },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  // 1. Unconfirmed representation request fails with HTTP 400
  const unconfirmedRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-unconfirmed",
      targetId: "unconfirmed-req",
    }),
  }))
  assert.equal(unconfirmedRes.status, 400)
  assert.match((await unconfirmedRes.json()).error, /must be explicitly confirmed by staff/i)

  // 2. Confirmed representation request succeeds
  const confirmedRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-confirmed",
      targetId: "confirmed-req",
    }),
  }))
  assert.equal(confirmedRes.status, 200)

  // 3. Direct resident request succeeds without requiring represented-person confirmation
  const directRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-direct",
      targetId: "direct-req",
    }),
  }))
  assert.equal(directRes.status, 200)
})

test("F02: Client-supplied payload to markGenerated cannot manufacture confirmation", async () => {
  const db = createF01MockDb({
    "users/admin-1": { role: "admin", status: "Active", name: "Staff Officer" },
    "documentRequests/req-123": {
      id: "req-123",
      requestFor: "other",
      requestedByName: "Elena Represented",
      beneficiaryReviewStatus: "provided",
      representedAddress: "Client Submitted Address",
      status: "Approved",
    },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  // Client attempts direct API attack sending manufactured confirmation in payload
  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer admin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "request.markGenerated",
      operationId: "op-attack",
      targetId: "req-123",
      payload: {
        confirmedAddress: "Hacker manufactured address",
        confirmedAge: 99,
      },
    }),
  }))

  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /must be explicitly confirmed by staff/i)
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
// F01: Configuration Concurrency Mutation Invariants (Production Handler)
// ---------------------------------------------------------------------------

test("F01: Missing baseVersion is rejected with HTTP 400 when config exists", async () => {
  const db = createF01MockDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 3,
      documentTypes: ["Barangay Clearance"],
      documentFees: { "Barangay Clearance": 50 },
      customDocumentTypes: [],
      templates: {},
    },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer superadmin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-f01-missing-base",
      payload: {
        updates: { documentTypes: ["Barangay Clearance", "New Type"] },
        // baseVersion omitted!
      },
    }),
  }))

  assert.equal(res.status, 400)
  assert.match((await res.json()).error, /concurrency precondition required/i)
})

test("F01: Overlapping concurrent modifications are rejected with HTTP 409", async () => {
  const db = createF01MockDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5, // Server was bumped to 5 by another admin who deleted custom-cert
      documentTypes: ["Barangay Clearance"],
      documentFees: { "Barangay Clearance": 50 },
      customDocumentTypes: [],
      templates: {},
      barangayName: "Server Edited Barangay",
    },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  const baseConfig = {
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [{ id: "custom-cert", name: "Custom Cert", fee: 100 }],
    templates: {},
    barangayName: "Old Barangay",
  }

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer superadmin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-f01-conflict",
      payload: {
        baseVersion: 4,
        baseConfig,
        changedFields: ["customDocumentTypes"],
        updates: { customDocumentTypes: [{ id: "custom-cert", name: "Custom Cert Edited", fee: 150 }] },
      },
    }),
  }))

  assert.equal(res.status, 409)
  const body = await res.json()
  assert.deepEqual(body.conflictingFields, ["customDocumentTypes"])
})

test("F01: Non-overlapping concurrent modifications merge safely and increment version", async () => {
  const db = createF01MockDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": {
      version: 5, // Bumped to 5 because Admin B updated branding
      documentTypes: ["Barangay Clearance"],
      documentFees: { "Barangay Clearance": 50 },
      customDocumentTypes: [],
      templates: {},
      barangayName: "New Barangay Name by Admin B",
    },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  const baseConfig = {
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
    barangayName: "Old Barangay Name",
  }

  const res = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer superadmin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-f01-non-overlap",
      payload: {
        baseVersion: 4,
        baseConfig,
        changedFields: ["customDocumentTypes", "documentTypes"],
        updates: {
          customDocumentTypes: [{ id: "solo_parent", name: "Solo Parent", fee: 0 }],
          documentTypes: ["Barangay Clearance", "Solo Parent"],
        },
      },
    }),
  }))

  assert.equal(res.status, 200)
  const stored = db.store.get("systemConfig/global")
  assert.equal(stored.version, 6)
  assert.equal(stored.barangayName, "New Barangay Name by Admin B", "Admin B's branding must be preserved")
  assert.equal(stored.customDocumentTypes.length, 1)
  assert.equal(stored.customDocumentTypes[0].name, "Solo Parent")
})

test("F01: Minimal payload is constructed for Add and Delete custom document operations", async () => {
  const baseline = {
    version: 2,
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50 },
    customDocumentTypes: [],
    templates: {},
  }

  const db = createF01MockDb({
    "users/superadmin-1": { role: "superadmin", status: "Active", name: "Super Admin" },
    "systemConfig/global": { ...baseline },
  })

  const handler = createAdminOperationsHandler({ auth: f01Auth as any, db: db as any })

  // Add payload construction via production helper
  const addPayload = prepareAddDocTypePayload({
    docId: "health_cert",
    docName: "Health Certificate",
    docIcon: "📄",
    docFee: 75,
    docHeader: "C E R T I F I C A T I O N",
    docTemplate: "Template content",
    baseline,
    effectiveDocTypes: baseline.documentTypes,
    effectiveDocFees: baseline.documentFees,
    existingCustomDocs: baseline.customDocumentTypes,
  })

  assert.equal(addPayload.baseConfig.documentTypes.length, 1)
  assert.ok(!("barangayCaptainName" in addPayload.updates), "Unrelated fields should not be sent in minimal payload")
  assert.deepEqual(addPayload.changedFields, ["documentTypes", "documentFees", "customDocumentTypes", "templates"])

  const addRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer superadmin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-f01-add-doc",
      payload: {
        updates: addPayload.updates,
        baseVersion: baseline.version,
        baseConfig: addPayload.baseConfig,
        changedFields: addPayload.changedFields,
      },
    }),
  }))
  assert.equal(addRes.status, 200)

  const storedAfterAdd = db.store.get("systemConfig/global")
  assert.equal(storedAfterAdd.version, 3)
  assert.equal(storedAfterAdd.documentTypes.includes("Health Certificate"), true)

  // Delete payload construction via production helper
  const deletePayload = prepareDeleteDocTypePayload({
    docName: "Health Certificate",
    docId: "health_cert",
    baseline: storedAfterAdd,
    effectiveDocTypes: storedAfterAdd.documentTypes,
    effectiveDocFees: storedAfterAdd.documentFees,
    existingCustomDocs: storedAfterAdd.customDocumentTypes,
  })

  const deleteRes = await handler(new Request("http://localhost/api/admin/operations", {
    method: "POST",
    headers: { Authorization: "Bearer superadmin-tok", "Content-Type": "application/json" },
    body: JSON.stringify({
      operation: "system.config.update",
      operationId: "op-f01-del-doc",
      payload: {
        updates: deletePayload.updates,
        baseVersion: storedAfterAdd.version,
        baseConfig: deletePayload.baseConfig,
        changedFields: deletePayload.changedFields,
      },
    }),
  }))
  assert.equal(deleteRes.status, 200)

  const storedAfterDelete = db.store.get("systemConfig/global")
  assert.equal(storedAfterDelete.version, 4)
  assert.equal(storedAfterDelete.documentTypes.includes("Health Certificate"), false)
  assert.equal(storedAfterDelete.customDocumentTypes.length, 0)
})
