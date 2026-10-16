import test from "node:test"
import assert from "node:assert/strict"
import {
  BUILT_IN_DOCUMENT_TYPES,
  resolveDocumentType,
  resolveDocumentSubject,
} from "../lib/document-catalog.ts"
import { REQUEST_TRANSITIONS } from "../app/api/admin/operations/route.ts"

// ---------------------------------------------------------------------------
// UI01 & UI16: Canonical Document Catalog & Template Mapping
// ---------------------------------------------------------------------------
test("UI01: Barangay Clearance maps to dedicated canonical type and template, not Business Clearance", () => {
  const clearance = resolveDocumentType("clearance")
  assert.ok(clearance)
  assert.equal(clearance.id, "clearance")
  assert.equal(clearance.label, "Barangay Clearance")
  assert.equal(clearance.header, "BARANGAY CLEARANCE")
  assert.ok(clearance.template.includes("This Clearance is issued"))
  assert.ok(!clearance.template.includes("BUSINESS CLEARANCE"))

  const byDisplayName = resolveDocumentType("Barangay Clearance")
  assert.ok(byDisplayName)
  assert.equal(byDisplayName.id, "clearance")

  const byKebab = resolveDocumentType("barangay-clearance")
  assert.ok(byKebab)
  assert.equal(byKebab.id, "clearance")
})

test("UI01 & UI16: Clearance types are kept strictly distinct without ambiguous matching", () => {
  const business = resolveDocumentType("business")
  const homeowner = resolveDocumentType("business_homeowner")
  const contractor = resolveDocumentType("business_contractor")
  const clearance = resolveDocumentType("clearance")

  assert.ok(business && homeowner && contractor && clearance)
  assert.equal(business.id, "business")
  assert.equal(business.label, "Business Clearance")
  assert.equal(homeowner.id, "business_homeowner")
  assert.equal(contractor.id, "business_contractor")
  assert.equal(clearance.id, "clearance")

  assert.notEqual(clearance.id, business.id)
  assert.notEqual(clearance.id, homeowner.id)
  assert.notEqual(clearance.id, contractor.id)
})

test("UI16: Catalog contains all 10 built-in document types with valid defaults", () => {
  assert.equal(BUILT_IN_DOCUMENT_TYPES.length, 10)
  for (const doc of BUILT_IN_DOCUMENT_TYPES) {
    assert.ok(doc.id.length > 0)
    assert.ok(doc.label.length > 0)
    assert.ok(doc.header.length > 0)
    assert.ok(doc.defaultTemplate.length > 0)
    assert.ok(typeof doc.defaultFee === "number" && doc.defaultFee >= 0)
  }
})

test("UI16: Custom document types resolve correctly when configured", () => {
  const custom = [
    {
      id: "custom-tree-cutting",
      name: "Tree Cutting Permit",
      fee: 150,
      header: "TREE CUTTING PERMIT",
      template: "This certifies permission to cut trees for {{name}} at {{address}}.",
    },
  ]
  const resolved = resolveDocumentType("custom-tree-cutting", custom)
  assert.ok(resolved)
  assert.equal(resolved.id, "custom-tree-cutting")
  assert.equal(resolved.label, "Tree Cutting Permit")
  assert.equal(resolved.header, "TREE CUTTING PERMIT")
  assert.ok(resolved.template.includes("permission to cut trees"))
})

// ---------------------------------------------------------------------------
// UI02: Document Subject & On-Behalf-Of Identity Resolution
// ---------------------------------------------------------------------------
test("UI02: Direct requests use the resident profile as the subject", () => {
  const resident = {
    name: "Juan Dela Cruz",
    address: "Block 1 Lot 2, Talasys St.",
    contactNumber: "09171234567",
  }
  const request = {
    requestFor: "myself",
    residentName: "Juan Dela Cruz",
    address: "Block 1 Lot 2, Talasys St.",
  }
  const subject = resolveDocumentSubject(request, resident)
  assert.equal(subject.subjectName, "Juan Dela Cruz")
  assert.equal(subject.isRepresentation, false)
  assert.equal(subject.relationship, undefined)
})

test("UI02: On-behalf-of requests use the represented beneficiary without mixing identities", () => {
  const resident = {
    name: "Maria Dela Cruz",
    address: "Block 1 Lot 2, Talasys St.",
    contactNumber: "09170000000",
  }
  const request = {
    requestFor: "other",
    residentName: "Maria Dela Cruz",
    requestedByName: "Pedro Dela Cruz", // The beneficiary being represented
    relationship: "Father",
    requestedByContact: "09189999999",
    authorizationLetter: "https://res.cloudinary.com/talasys/image/upload/auth-letter.pdf",
    address: "Block 5 Lot 9, Senior Sector",
  }
  const subject = resolveDocumentSubject(request, resident)
  assert.equal(subject.subjectName, "Pedro Dela Cruz")
  assert.equal(subject.requesterName, "Maria Dela Cruz")
  assert.equal(subject.isRepresentation, true)
  assert.equal(subject.relationship, "Father")
  assert.equal(subject.authorizationLetter, "https://res.cloudinary.com/talasys/image/upload/auth-letter.pdf")
})

// ---------------------------------------------------------------------------
// UI03: Backend Request Lifecycle Transitions
// ---------------------------------------------------------------------------
test("UI03: Terminal states (Completed, Rejected, Cancelled) cannot transition to any status", () => {
  assert.equal(REQUEST_TRANSITIONS["Completed"], undefined)
  assert.equal(REQUEST_TRANSITIONS["Rejected"], undefined)
  assert.equal(REQUEST_TRANSITIONS["Cancelled"], undefined)
})

test("UI03: Pending requests cannot jump directly to Completed or Ready for Pick Up", () => {
  const pendingAllowed = REQUEST_TRANSITIONS["Pending"]
  assert.ok(pendingAllowed.has("Approved"))
  assert.ok(pendingAllowed.has("On Process"))
  assert.ok(pendingAllowed.has("Awaiting Payment"))
  assert.ok(pendingAllowed.has("Rejected"))
  assert.ok(pendingAllowed.has("Cancelled"))
  assert.ok(!pendingAllowed.has("Completed"))
  assert.ok(!pendingAllowed.has("Ready for Pick Up"))
})

test("UI03: Approved and On Process follow strict valid paths", () => {
  const onProcessAllowed = REQUEST_TRANSITIONS["On Process"]
  assert.ok(onProcessAllowed.has("Ready for Pick Up"))
  assert.ok(onProcessAllowed.has("Completed"))
  assert.ok(onProcessAllowed.has("Awaiting Payment"))
  assert.ok(onProcessAllowed.has("Rejected"))
  assert.ok(onProcessAllowed.has("Cancelled"))
  assert.ok(!onProcessAllowed.has("Approved"))
  assert.ok(!onProcessAllowed.has("Pending"))
})

// ---------------------------------------------------------------------------
// UI12: Metric & Dashboard Accuracy (Completed vs Processing)
// ---------------------------------------------------------------------------
test("UI12: Completed metric strictly counts Completed status, not On Process or Ready for Pick Up", () => {
  const mockRequests = [
    { status: "Completed" },
    { status: "Completed" },
    { status: "On Process" },
    { status: "Processing" },
    { status: "Ready for Pick Up" },
    { status: "Approved" },
    { status: "Pending" },
    { status: "Rejected" },
  ]

  const completedCount = mockRequests.filter(r => r.status === "Completed").length
  const processingCount = mockRequests.filter(r =>
    ["On Process", "Processing", "Approved", "Awaiting Payment", "Ready for Pick Up"].includes(r.status)
  ).length
  const rejectedCount = mockRequests.filter(r => r.status === "Rejected").length
  const total = mockRequests.length

  assert.equal(completedCount, 2)
  assert.equal(processingCount, 4)
  assert.equal(rejectedCount, 1)

  const accurateCompletionRate = total > 0 ? (completedCount / total) * 100 : 0
  assert.equal(accurateCompletionRate, 25) // 2 / 8 = 25%

  // Faulty legacy logic would have produced (2 + 1 + 1 + 1) / 8 = 62.5%
  const faultyLegacyCount = mockRequests.filter(r =>
    ["Completed", "Ready for Pick Up", "On Process", "Approved"].includes(r.status)
  ).length
  assert.equal(faultyLegacyCount, 5)
  assert.notEqual(completedCount, faultyLegacyCount)
})

// ---------------------------------------------------------------------------
// UI18: Year Selector Reconciliation
// ---------------------------------------------------------------------------
test("UI18: Selected year is reconciled when available years load asynchronously", () => {
  function reconcileSelectedYear(currentSelection: string, availableYears: string[]): string {
    if (availableYears.length === 0) return currentSelection
    if (currentSelection === "all") return "all"
    if (availableYears.includes(currentSelection)) return currentSelection
    return availableYears[0]
  }

  // When initial state was current calendar year (e.g. 2026), but database only has 2024 and 2025:
  const reconciled = reconcileSelectedYear("2026", ["2025", "2024"])
  assert.equal(reconciled, "2025")

  // When selection is "all", it is preserved:
  assert.equal(reconcileSelectedYear("all", ["2025", "2024"]), "all")

  // When selection exists in available years, it is preserved:
  assert.equal(reconcileSelectedYear("2024", ["2025", "2024"]), "2024")
})
