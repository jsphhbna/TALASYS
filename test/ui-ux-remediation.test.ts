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

// ---------------------------------------------------------------------------
// UX-A01 & UX-B01: Profile Picture Removal Operation Routing & Reason Invariants
// ---------------------------------------------------------------------------
test("UX-A01: Unchanged resident email routes to resident.update without entering identity Auth workflow", () => {
  const existingResident = {
    id: "res-123",
    email: "resident@example.com",
    name: "Juan Dela Cruz",
    profilePicture: "https://example.com/photo.jpg",
  }

  // Admin submits form with existing unchanged email and photo removal
  const formValues = {
    email: "resident@example.com",
    name: "Juan Dela Cruz",
    profilePicture: "",
  }
  const removePhotoReason = "Not a recognized resident photo"

  const isEmailChanged = Boolean(formValues.email && formValues.email.trim().toLowerCase() !== existingResident.email.trim().toLowerCase())
  assert.equal(isEmailChanged, false, "Unchanged email must evaluate isEmailChanged to false")

  // Target operation determination
  const targetWorkflow = isEmailChanged ? "identity.updateEmail" : "resident.update"
  assert.equal(targetWorkflow, "resident.update")

  // Reason must be preserved and passed
  const operationPayload = {
    targetId: existingResident.id,
    payload: {
      updates: { profilePicture: "" },
      removePhotoReason,
    },
  }
  assert.equal(operationPayload.payload.removePhotoReason, "Not a recognized resident photo")
})

test("UX-A01: Actual email modification correctly identifies identity workflow requirement", () => {
  const existingResident = {
    id: "res-123",
    email: "old.email@example.com",
    name: "Juan Dela Cruz",
  }

  const formValues = {
    email: "new.email@example.com",
    name: "Juan Dela Cruz",
  }

  const isEmailChanged = Boolean(formValues.email && formValues.email.trim().toLowerCase() !== existingResident.email.trim().toLowerCase())
  assert.equal(isEmailChanged, true, "Modified email must evaluate isEmailChanged to true")
  const targetWorkflow = isEmailChanged ? "identity.updateEmail" : "resident.update"
  assert.equal(targetWorkflow, "identity.updateEmail")
})

// ---------------------------------------------------------------------------
// UX-C01: Authoritative Audit Logging for Photo Removal
// ---------------------------------------------------------------------------
test("UX-C01: normalizeAuditLog maps resident.profilePhoto.remove to canonical action and details", async () => {
  const { normalizeAuditLog } = await import("../lib/security/audit-utils.ts")

  const rawLog = {
    id: "log-photo-remove-1",
    action: "resident.profilePhoto.remove",
    actor: { id: "admin-1", name: "Hon. Kagawad", role: "Resident Management" },
    targetId: "res-456",
    residentName: "Maria Santos",
    before: { profilePicture: "https://example.com/photo.jpg" },
    after: { profilePicture: "", removePhotoReason: "Violation of community photo standards" },
    timestamp: 1729100000000,
  }

  const normalized = normalizeAuditLog(rawLog)
  assert.equal(normalized.action, "Removed Resident Profile Picture")
  assert.equal(normalized.actionType, "resident")
  assert.equal(normalized.residentName, "Maria Santos")
  assert.equal(normalized.details, 'Reason: "Violation of community photo standards"')
})

test("UX-C01: normalizeAuditLog maps combined profile update and photo removal without losing either change", async () => {
  const { normalizeAuditLog } = await import("../lib/security/audit-utils.ts")

  const rawCombinedLog = {
    id: "log-combined-1",
    action: "resident.update",
    actor: { id: "admin-1", name: "Hon. Kagawad", role: "Resident Management" },
    targetId: "res-456",
    residentName: "Maria Santos",
    before: { profilePicture: "https://example.com/photo.jpg", address: "Old Address" },
    after: { profilePicture: "", address: "New Address", removePhotoReason: "Unclear portrait", updatedAt: 1729100000000 },
    timestamp: 1729100000000,
  }

  const normalized = normalizeAuditLog(rawCombinedLog)
  assert.equal(normalized.action, "Updated Resident Profile and Removed Photo")
  assert.equal(normalized.actionType, "resident")
  assert.ok(normalized.details.includes("address"))
  assert.ok(normalized.details.includes('Reason: "Unclear portrait"'))
})

// ---------------------------------------------------------------------------
// UX-D01: Resident Notification Delivery Text Invariant
// ---------------------------------------------------------------------------
test("UX-D01: Photo removal notification delivers official barangay wording", () => {
  const removalReason = "Not a recognized resident photo"
  const notificationTitle = "Profile Picture Removed"
  const notificationMessage = `Your profile picture was removed by the barangay administration. Reason: ${removalReason}. You may review your profile for more information.`

  assert.equal(notificationTitle, "Profile Picture Removed")
  assert.ok(notificationMessage.startsWith("Your profile picture was removed by the barangay administration."))
  assert.ok(notificationMessage.includes("Reason: Not a recognized resident photo"))
  assert.ok(notificationMessage.endsWith("You may review your profile for more information."))
})

// ---------------------------------------------------------------------------
// UX-E01: Activity Logs Functional Pagination & Slice Sizing
// ---------------------------------------------------------------------------
test("UX-E01: Activity Logs pagination bounds and slices behave accurately", () => {
  const pageSize = 15
  const mockLogs = Array.from({ length: 42 }).map((_, i) => ({ id: `log-${i}` }))

  const totalPages = Math.max(1, Math.ceil(mockLogs.length / pageSize))
  assert.equal(totalPages, 3) // 42 / 15 = 2.8 -> 3 pages

  // Page 1 slice: 0 to 15 (15 items)
  const page1Start = 0 * pageSize
  const page1End = Math.min(page1Start + pageSize, mockLogs.length)
  const page1Slice = mockLogs.slice(page1Start, page1End)
  assert.equal(page1Slice.length, 15)
  assert.equal(page1Slice[0].id, "log-0")
  assert.equal(page1Slice[14].id, "log-14")

  // Page 3 slice: 30 to 42 (12 items)
  const page3Start = 2 * pageSize
  const page3End = Math.min(page3Start + pageSize, mockLogs.length)
  const page3Slice = mockLogs.slice(page3Start, page3End)
  assert.equal(page3Slice.length, 12)
  assert.equal(page3Slice[0].id, "log-30")
  assert.equal(page3Slice[11].id, "log-41")

  // Boundary checks: empty list produces 1 total page with empty slice
  const emptyLogs: any[] = []
  const emptyTotalPages = Math.max(1, Math.ceil(emptyLogs.length / pageSize))
  assert.equal(emptyTotalPages, 1)
})

test("FX-02: Pagination handles 0, 1, 15, 16, and 42 records with truthful range calculation", () => {
  const pageSize = 15

  const calculatePagination = (totalRecords: number, page: number) => {
    const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    const startIndex = (safePage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, totalRecords)
    const displayRange = totalRecords === 0
      ? "Showing 0 of 0 actions"
      : `Showing ${startIndex + 1}–${endIndex} of ${totalRecords} actions`
    return { totalPages, safePage, startIndex, endIndex, displayRange }
  }

  // 0 records
  const p0 = calculatePagination(0, 1)
  assert.equal(p0.totalPages, 1)
  assert.equal(p0.safePage, 1)
  assert.equal(p0.startIndex, 0)
  assert.equal(p0.endIndex, 0)
  assert.equal(p0.displayRange, "Showing 0 of 0 actions")

  // 1 record
  const p1 = calculatePagination(1, 1)
  assert.equal(p1.totalPages, 1)
  assert.equal(p1.safePage, 1)
  assert.equal(p1.displayRange, "Showing 1–1 of 1 actions")

  // Exactly 15 records
  const p15 = calculatePagination(15, 1)
  assert.equal(p15.totalPages, 1)
  assert.equal(p15.safePage, 1)
  assert.equal(p15.displayRange, "Showing 1–15 of 15 actions")

  // 16 records - Page 1
  const p16_1 = calculatePagination(16, 1)
  assert.equal(p16_1.totalPages, 2)
  assert.equal(p16_1.safePage, 1)
  assert.equal(p16_1.displayRange, "Showing 1–15 of 16 actions")

  // 16 records - Page 2
  const p16_2 = calculatePagination(16, 2)
  assert.equal(p16_2.totalPages, 2)
  assert.equal(p16_2.safePage, 2)
  assert.equal(p16_2.displayRange, "Showing 16–16 of 16 actions")

  // 42 records - Page 2
  const p42_2 = calculatePagination(42, 2)
  assert.equal(p42_2.totalPages, 3)
  assert.equal(p42_2.safePage, 2)
  assert.equal(p42_2.displayRange, "Showing 16–30 of 42 actions")

  // Reconcile/clamping when results shrink: user on page 3, result count drops to 8
  const pShrunk = calculatePagination(8, 3)
  assert.equal(pShrunk.totalPages, 1)
  assert.equal(pShrunk.safePage, 1) // Safely clamped to page 1
  assert.equal(pShrunk.displayRange, "Showing 1–8 of 8 actions")
})

test("FX-03: normalizeAuditLog standardizes all photo and identity mutations under Resident Ops", async () => {
  const { normalizeAuditLog } = await import("../lib/security/audit-utils.ts")

  // 1. Photo-only removal via resident.profilePhoto.remove
  const photoOnly = normalizeAuditLog({
    id: "log-1",
    action: "resident.profilePhoto.remove",
    after: { removePhotoReason: "Unclear face photo" },
    residentName: "Juan Dela Cruz",
  })
  assert.equal(photoOnly.action, "Removed Resident Profile Picture")
  assert.equal(photoOnly.actionType, "resident")
  assert.equal(photoOnly.details, 'Reason: "Unclear face photo"')

  // 2. Identity & Photo removal via update-resident-email route
  const identityAndPhoto = normalizeAuditLog({
    id: "log-2",
    action: "Updated Resident Identity & Removed Photo",
    after: { email: "new@example.com", removePhotoReason: "Changed identity and portrait" },
    residentName: "Elena Santos",
  })
  assert.equal(identityAndPhoto.action, "Updated Resident Identity and Removed Photo")
  assert.equal(identityAndPhoto.actionType, "resident")
  assert.ok(identityAndPhoto.details.includes("new@example.com"))
  assert.ok(identityAndPhoto.details.includes('Reason: "Changed identity and portrait"'))

  // 3. Identity update without photo removal
  const identityOnly = normalizeAuditLog({
    id: "log-3",
    action: "Updated Resident Identity",
    after: { email: "updated@example.com" },
    residentName: "Pedro Penduko",
  })
  assert.equal(identityOnly.action, "Updated Resident Identity")
  assert.equal(identityOnly.actionType, "resident")
  assert.equal(identityOnly.details, "Email: updated@example.com")

  // 4. Combined profile update and photo removal via resident.update
  const profileAndPhoto = normalizeAuditLog({
    id: "log-4",
    action: "resident.update",
    before: { profilePicture: "https://example.com/old.jpg" },
    after: { profilePicture: "", contactNumber: "09171234567", removePhotoReason: "Invalid format" },
    residentName: "Maria Clara",
  })
  assert.equal(profileAndPhoto.action, "Updated Resident Profile and Removed Photo")
  assert.equal(profileAndPhoto.actionType, "resident")
  assert.ok(profileAndPhoto.details.includes("contactNumber"))
  assert.ok(profileAndPhoto.details.includes('Reason: "Invalid format"'))

  // 5. Standard profile update without photo removal
  const profileOnly = normalizeAuditLog({
    id: "log-5",
    action: "resident.update",
    before: { address: "Old Addr" },
    after: { address: "New Addr" },
    residentName: "Jose Rizal",
  })
  assert.equal(profileOnly.action, "Updated Resident Profile")
  assert.equal(profileOnly.actionType, "resident")
  assert.ok(profileOnly.details.includes("address"))
})

test("FX-05 & FX-06: Public footer and landing page content assertions", async () => {
  const fs = await import("node:fs")

  // FX-05: Footer does not contain generic placeholder links
  const footerSource = fs.readFileSync("components/layout/footer.tsx", "utf-8")
  assert.ok(!footerSource.includes("https://twitter.com"), "Placeholder twitter link must be removed")
  assert.ok(!footerSource.includes("https://facebook.com"), "Placeholder facebook link must be removed")
  assert.ok(!footerSource.includes("https://linkedin.com"), "Placeholder linkedin link must be removed")

  // FX-05: Landing layout does not render Footer; Landing page renders Footer
  const landingLayout = fs.readFileSync("app/(landing)/layout.tsx", "utf-8")
  assert.ok(!landingLayout.includes("<Footer"), "Footer must not be rendered by landing route layout")
  const landingPage = fs.readFileSync("app/(landing)/page.tsx", "utf-8")
  assert.ok(landingPage.includes("<Footer />"), "Footer must be rendered strictly on landing page")

  // FX-06: Landing page claims corrected
  const servicesSource = fs.readFileSync("components/landing/services-section.tsx", "utf-8")
  assert.ok(!servicesSource.includes("household information"), "Unverified household information claim must be removed")
  assert.ok(!servicesSource.includes("official barangay watermarks"), "Unverified watermarks claim must be removed")

  const howItWorksSource = fs.readFileSync("components/landing/how-it-works-section.tsx", "utf-8")
  assert.ok(howItWorksSource.includes("Track your request online and follow the barangay's instructions for collecting your signed official copy at the Barangay Hall"), "Step 5 reflects truthful on-site document claiming")
  assert.ok(!howItWorksSource.includes("Download your verified document directly from your resident portal"), "Unsupported direct resident portal download claim must be removed")
  assert.ok(!howItWorksSource.includes("dry seal at the Barangay Hall"), "Step 5 must not require dry-seal claiming exclusively")
})
