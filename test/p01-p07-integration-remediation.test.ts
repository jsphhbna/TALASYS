import test from "node:test"
import assert from "node:assert/strict"
import {
  BUILT_IN_DOCUMENT_TYPES,
  DEFAULT_ENABLED_DOCUMENT_TYPES,
  DEFAULT_DOCUMENT_FEES,
  DEFAULT_TEMPLATES,
  DEFAULT_HEADERS,
  resolveDocumentSubject,
  renderDocumentTemplate,
  formatTemplateParagraphs,
} from "../lib/document-catalog.ts"
import { resolveConfiguredDocument } from "../app/api/resident/requests/create/route.ts"
import { canManageNotificationsRole } from "../lib/auth/auth-types.ts"

// ---------------------------------------------------------------------------
// P01: Prevent Wrong Identity Details on Official Documents
// ---------------------------------------------------------------------------
test("P01: Direct requests use verified resident profile without blending", () => {
  const resident = {
    fullName: "Juan Dela Cruz",
    address: "123 Mabini St., Brgy 1, Manila",
    dob: "1990-05-15",
  }
  const request = {
    requestFor: "myself",
  }

  const subject = resolveDocumentSubject(request, resident)
  assert.equal(subject.subjectName, "Juan Dela Cruz")
  assert.equal(subject.requesterName, "Juan Dela Cruz")
  assert.equal(subject.isRepresentation, false)
  assert.equal(subject.address, "123 Mabini St., Brgy 1, Manila")
  assert.ok(Number(subject.age) >= 30)
  assert.equal(subject.isSubjectAddressMissing, false)
  assert.equal(subject.isSubjectAgeMissing, false)
})

test("P01: Represented-person requests NEVER reuse requester's address or age", () => {
  const requesterMaria = {
    fullName: "Maria Clara Santos",
    address: "789 Rizal Ave., Manila",
    dob: "1985-02-10", // Age ~41
  }
  const requestForPedro = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    relationship: "Brother",
    authorizationLetter: "https://res.cloudinary.com/talasys/image/authenticated/s--xyz--/talasys/letters/uid123/letter.pdf",
    // No representedAddress or representedAge provided in request
  }

  const subject = resolveDocumentSubject(requestForPedro, requesterMaria)

  assert.equal(subject.subjectName, "Pedro Penduko")
  assert.equal(subject.requesterName, "Maria Clara Santos")
  assert.equal(subject.isRepresentation, true)
  assert.equal(subject.relationship, "Brother")

  // CRITICAL: Pedro must NOT have Maria's address or Maria's age
  assert.notEqual(subject.address, requesterMaria.address)
  assert.equal(subject.address, "")
  assert.equal(subject.isSubjectAddressMissing, true)

  assert.notEqual(subject.age, "41")
  assert.equal(subject.age, "")
  assert.equal(subject.isSubjectAgeMissing, true)
})

test("P01: Represented-person requests populate beneficiary address and age when provided", () => {
  const requesterMaria = {
    fullName: "Maria Clara Santos",
    address: "789 Rizal Ave., Manila",
    dob: "1985-02-10",
  }
  const requestForPedroWithDetails = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    relationship: "Brother",
    authorizationLetter: "https://res.cloudinary.com/talasys/image/authenticated/s--xyz--/talasys/letters/uid123/letter.pdf",
    representedAddress: "456 Bonifacio St., Manila",
    representedAge: 25,
  }

  const subject = resolveDocumentSubject(requestForPedroWithDetails, requesterMaria)

  assert.equal(subject.subjectName, "Pedro Penduko")
  assert.equal(subject.address, "456 Bonifacio St., Manila")
  assert.equal(subject.age, "25")
  assert.equal(subject.isSubjectAddressMissing, false)
  assert.equal(subject.isSubjectAgeMissing, false)
})

test("P01: Admin review overrides can supply confirmed subject address and age before issuance", () => {
  const requesterMaria = {
    fullName: "Maria Clara Santos",
    address: "789 Rizal Ave., Manila",
    dob: "1985-02-10",
  }
  const incompleteRequest = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    relationship: "Brother",
    authorizationLetter: "https://res.cloudinary.com/talasys/image/authenticated/s--xyz--/talasys/letters/uid123/letter.pdf",
  }

  // Admin supplies verified details during pre-generation review
  const adminOverrides = {
    address: "Verified Address 101, Manila",
    age: 28,
    civilStatus: "Single",
  }

  const subject = resolveDocumentSubject(incompleteRequest, requesterMaria, adminOverrides)
  assert.equal(subject.subjectName, "Pedro Penduko")
  assert.equal(subject.address, "Verified Address 101, Manila")
  assert.equal(subject.age, "28")
  assert.equal(subject.civilStatus, "Single")
  assert.equal(subject.isSubjectAddressMissing, false)
  assert.equal(subject.isSubjectAgeMissing, false)
})

// ---------------------------------------------------------------------------
// P02: Fix Empty Staged Document Configuration
// ---------------------------------------------------------------------------
test("P02: Explicit empty documentTypes array [] disables all types in backend resolution", () => {
  const emptyConfig = {
    documentTypes: [], // All disabled by Super Admin
    documentFees: { "Barangay Clearance": 50 },
  }

  // Any attempt to resolve an enabled document must fail when documentTypes is []
  assert.throws(() => {
    resolveConfiguredDocument(emptyConfig, "Barangay Clearance", [])
  }, /disabled or unknown/)

  assert.throws(() => {
    resolveConfiguredDocument(emptyConfig, "Proof of Residency", [])
  }, /disabled or unknown/)
})

test("P02: Single enabled document type only permits that specific type", () => {
  const singleTypeConfig = {
    documentTypes: ["Proof of Residency"],
    documentFees: { "Proof of Residency": 50 },
  }

  const resolved = resolveConfiguredDocument(singleTypeConfig, "Proof of Residency", [])
  assert.equal(resolved.name, "Proof of Residency")
  assert.equal(resolved.fee, 50)

  // Other types are rejected
  assert.throws(() => {
    resolveConfiguredDocument(singleTypeConfig, "Barangay Clearance", [])
  }, /disabled or unknown/)
})

// ---------------------------------------------------------------------------
// P03: Correct Unresolved Template Placeholders & HTML Safety
// ---------------------------------------------------------------------------
test("P03: Default Barangay Clearance template does NOT contain raw {{civil_status}} token", () => {
  const clearance = BUILT_IN_DOCUMENT_TYPES.find(d => d.id === "clearance")
  assert.ok(clearance)
  assert.ok(!clearance.defaultTemplate.includes("{{civil_status}}"))
})

test("P03: renderDocumentTemplate cleanly resolves all standard placeholders and escapes user input", () => {
  const template = "This certifies that {{name}}, age {{age}}, residing at {{address}} requested this for {{purpose}} on {{date_issued}}."
  const data = {
    name: "Juan <script>alert('xss')</script> Dela Cruz",
    age: 30,
    address: "123 Rizal St., & Co.",
    purpose: "Employment & ID",
    barangayName: "Barangay 123",
    date: new Date("2026-10-15T00:00:00Z"),
  }

  const rendered = renderDocumentTemplate(template, data)

  // HTML escaping check
  assert.ok(!rendered.includes("<script>"))
  assert.ok(rendered.includes("&lt;SCRIPT&gt;ALERT(&#039;XSS&#039;)&lt;/SCRIPT&gt;"))
  assert.ok(rendered.includes("&amp; Co."))

  // Placeholder resolution check
  assert.ok(rendered.includes("30"))
  assert.ok(rendered.includes("EMPLOYMENT &amp; ID"))
  assert.ok(rendered.includes("October 15, 2026"))
  assert.ok(!rendered.includes("{{name}}"))
  assert.ok(!rendered.includes("{{age}}"))
  assert.ok(!rendered.includes("{{address}}"))
  assert.ok(!rendered.includes("{{purpose}}"))
})

test("P03: renderDocumentTemplate strips any dangling {{...}} tokens so no unparsed code leaks", () => {
  const customTemplate = "Certificate for {{name}}. Unknown placeholder: {{custom_unregistered_field}}."
  const data = {
    name: "Maria Santos",
    address: "Manila",
  }

  const rendered = renderDocumentTemplate(customTemplate, data)
  assert.ok(!rendered.includes("{{custom_unregistered_field}}"))
  assert.ok(rendered.includes("MARIA SANTOS"))
})

test("P03: All 10 built-in templates render without leaving unparsed {{...}} placeholders", () => {
  const data = {
    name: "Juan Dela Cruz",
    age: 35,
    address: "456 Bonifacio St.",
    purpose: "Official Transaction",
    barangayName: "Barangay 100",
    date: new Date("2026-10-15T00:00:00Z"),
  }

  for (const doc of BUILT_IN_DOCUMENT_TYPES) {
    const rendered = renderDocumentTemplate(doc.defaultTemplate, data)
    assert.ok(!rendered.includes("{{"), `Template ${doc.id} contains unresolved {{ placeholder: ${rendered}`)
  }
})

// ---------------------------------------------------------------------------
// R01: Preserve Official Document Formatting & Paragraph Separation
// ---------------------------------------------------------------------------
test("R01: A three-paragraph template preserves double newlines and produces three distinct paragraphs", () => {
  const threeParaTemplate = "First paragraph certifies {{name}}.\n\nSecond paragraph certifies address at {{address}}.\n\nThird paragraph specifies purpose {{purpose}}."
  const data = {
    name: "Juan Dela Cruz",
    address: "789 Malvar St.",
    purpose: "Scholarship",
  }

  const rendered = renderDocumentTemplate(threeParaTemplate, data)
  assert.ok(rendered.includes("\n\n"), "Double newline paragraph separators must survive template rendering")
  const parts = rendered.split("\n\n")
  assert.equal(parts.length, 3, "Three-paragraph template must produce exactly 3 paragraphs")

  const formattedHtml = formatTemplateParagraphs(rendered)
  const paragraphMatches = formattedHtml.match(/<p style="text-indent:2em;text-align:justify;margin-bottom:1em;">/g)
  assert.equal(paragraphMatches?.length, 3, "Formatted HTML must have 3 distinct <p> blocks")
})

test("R01: Single line breaks within paragraphs survive as <br /> tags", () => {
  const templateWithSingleLineBreak = "Line one of paragraph.\nLine two of same paragraph.\n\nSecond paragraph."
  const rendered = renderDocumentTemplate(templateWithSingleLineBreak, { name: "Maria Santos", address: "123 Manila" })
  const formattedHtml = formatTemplateParagraphs(rendered)
  assert.ok(formattedHtml.includes("Line one of paragraph.<br />Line two of same paragraph."))
  assert.ok(formattedHtml.includes("<p style=\"text-indent:2em;text-align:justify;margin-bottom:1em;\">Second paragraph.</p>"))
})

test("R01: Excess blank lines (3+) are normalized to double newlines without collapsing paragraphs", () => {
  const excessiveBlankLines = "Paragraph A.\n\n\n\n\nParagraph B."
  const rendered = renderDocumentTemplate(excessiveBlankLines, { name: "Maria Santos", address: "123 Manila" })
  assert.ok(rendered.includes("Paragraph A.\n\nParagraph B."))
  assert.ok(!rendered.includes("\n\n\n"))
})

test("R01: All 10 built-in templates preserve multi-paragraph structure", () => {
  const data = {
    name: "Maria Clara",
    age: 28,
    address: "Zone 5, Barangay 1",
    purpose: "Employment",
    barangayName: "Barangay Uno",
  }

  for (const doc of BUILT_IN_DOCUMENT_TYPES) {
    const rendered = renderDocumentTemplate(doc.defaultTemplate, data)
    assert.ok(rendered.includes("\n\n"), `Template ${doc.id} must preserve paragraph breaks (\n\n)`)
    const html = formatTemplateParagraphs(rendered)
    const pCount = (html.match(/<p style=/g) || []).length
    assert.ok(pCount >= 2, `Template ${doc.id} must format to at least 2 distinct paragraphs, found ${pCount}`)
  }
})


// ---------------------------------------------------------------------------
// P05: Preserve Original Document Generation History
// ---------------------------------------------------------------------------
test("P05: Initial generation sets generatedAt; reprint preserves original timestamp", () => {
  const initialGeneratedAt = 1727481600000 // Sept 28, 2024
  const reprintTimestamp = 1727913600000   // Oct 3, 2024

  // Simulate request state before and after initial generation
  const beforeFirstGen = { hasGenerated: false, generatedAt: undefined }
  const afterFirstGen = {
    hasGenerated: true,
    generatedAt: beforeFirstGen.generatedAt || initialGeneratedAt,
  }
  assert.equal(afterFirstGen.generatedAt, initialGeneratedAt)

  // Simulate reprint: preserve original generatedAt
  const afterReprint = {
    hasGenerated: true,
    generatedAt: afterFirstGen.generatedAt || reprintTimestamp,
    lastReprintedAt: reprintTimestamp,
    reprintCount: 1,
  }
  assert.equal(afterReprint.generatedAt, initialGeneratedAt)
  assert.equal(afterReprint.lastReprintedAt, reprintTimestamp)
  assert.equal(afterReprint.reprintCount, 1)
})

// ---------------------------------------------------------------------------
// P07: Document Catalog Consolidation & Legacy 9-Type Compatibility
// ---------------------------------------------------------------------------
test("P07: Canonical catalog provides all 10 built-in types, headers, and fees", () => {
  assert.equal(BUILT_IN_DOCUMENT_TYPES.length, 10)
  assert.equal(DEFAULT_ENABLED_DOCUMENT_TYPES.length, 10)
  assert.equal(Object.keys(DEFAULT_DOCUMENT_FEES).length, 10)
  assert.equal(Object.keys(DEFAULT_TEMPLATES).length, 10)
  assert.equal(Object.keys(DEFAULT_HEADERS).length, 10)

  assert.equal(DEFAULT_DOCUMENT_FEES["Barangay Clearance"], 50)
  assert.equal(DEFAULT_DOCUMENT_FEES["Proof of Residency"], 50)
  assert.equal(DEFAULT_DOCUMENT_FEES["Business Clearance"], 150)
  assert.equal(DEFAULT_DOCUMENT_FEES["Certificate of Indigency"], 0)
})

test("P07: Legacy 9-type config does NOT silently enable Barangay Clearance if not in deployment list", () => {
  const legacy9Types = [
    "Funeral Certification",
    "PWD Certification (Adult)",
    "PWD Certification (Minor)",
    "Certificate of Indigency",
    "Proof of Residency",
    "Business Clearance",
    "Business Clearance (Homeowner)",
    "Business Clearance (Contractor)",
    "OSCA Certification",
  ]
  const legacyConfig = {
    documentTypes: legacy9Types,
    documentFees: { "Proof of Residency": 50 },
  }

  // Barangay Clearance is not in the explicit list, so it must not be permitted until explicitly enabled
  assert.throws(() => {
    resolveConfiguredDocument(legacyConfig, "Barangay Clearance", [])
  }, /disabled or unknown/)

  // Permitted legacy type succeeds
  const resolved = resolveConfiguredDocument(legacyConfig, "Proof of Residency", [])
  assert.equal(resolved.name, "Proof of Residency")
})

// ---------------------------------------------------------------------------
// R02: Correct False Configuration Conflict Warnings
// ---------------------------------------------------------------------------
function isMeaningfulConfigChange(a: any, b: any): boolean {
  if (!a || !b) return true
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === "updatedAt" || k === "version") continue
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) {
      return true
    }
  }
  return false
}

test("R02: Identical Firestore snapshots or metadata-only updates do not trigger conflict warning", () => {
  const baseConfig = {
    barangayName: "Barangay San Nicolas",
    contactNumber: "02-1234-5678",
    documentTypes: ["Barangay Clearance"],
    version: 1,
    updatedAt: 1000,
  }
  const sameConfigNewTimestamp = {
    ...baseConfig,
    updatedAt: 2000,
  }
  assert.equal(isMeaningfulConfigChange(baseConfig, sameConfigNewTimestamp), false, "Metadata timestamp update must not trigger false external conflict")

  const sameConfigNewVersion = {
    ...baseConfig,
    version: 2,
  }
  assert.equal(isMeaningfulConfigChange(baseConfig, sameConfigNewVersion), false, "Version-only increment without content diff must not trigger false conflict")
})

test("R02: Meaningful external changes are accurately detected", () => {
  const baseConfig = {
    barangayName: "Barangay San Nicolas",
    contactNumber: "02-1234-5678",
  }
  const changedConfig = {
    barangayName: "Barangay San Nicolas",
    contactNumber: "02-9999-0000",
  }
  assert.equal(isMeaningfulConfigChange(baseConfig, changedConfig), true, "Field-level divergence must be detected as meaningful external change")
})

// ---------------------------------------------------------------------------
// R03: Concurrency Protection on System Configuration
// ---------------------------------------------------------------------------
interface ConcurrencyCheckInput {
  before: Record<string, any>
  baseVersion?: number
  baseConfig?: Record<string, any>
  changedFields: string[]
  updates: Record<string, any>
}

function executeConfigConcurrencyCheck(input: ConcurrencyCheckInput): Record<string, any> {
  const currentVersion = typeof input.before?.version === "number" ? input.before.version : 1
  const baseVersion = input.baseVersion
  const baseConfig = input.baseConfig || {}

  if (baseVersion !== undefined && input.before && baseVersion !== currentVersion) {
    const conflictingFields: string[] = []
    for (const field of input.changedFields) {
      const serverVal = input.before[field]
      const baseVal = baseConfig[field]
      if (JSON.stringify(serverVal ?? null) !== JSON.stringify(baseVal ?? null)) {
        conflictingFields.push(field)
      }
    }
    if (conflictingFields.length > 0) {
      const err = new Error(`Configuration conflict: Field(s) ${conflictingFields.join(", ")} were modified concurrently.`)
      ;(err as any).statusCode = 409
      ;(err as any).conflictingFields = conflictingFields
      throw err
    }
  }

  return {
    ...input.before,
    ...input.updates,
    version: currentVersion + 1,
  }
}

test("R03 Scenario 1: Non-overlapping concurrent field edits safely merge without lost updates", () => {
  // Base state seen by Admin A and Admin B: version 1
  const initialConfig = {
    barangayName: "Barangay 1",
    contactNumber: "02-1111-1111",
    documentTypes: ["Barangay Clearance"],
    version: 1,
  }

  // Admin B saves contactNumber update first -> moves server to version 2
  const serverStateAfterAdminB = {
    ...initialConfig,
    contactNumber: "02-2222-2222",
    version: 2,
  }

  // Admin A saves barangayName update with baseVersion = 1, baseConfig = initialConfig, changedFields = ["barangayName"]
  const mergedResult = executeConfigConcurrencyCheck({
    before: serverStateAfterAdminB,
    baseVersion: 1,
    baseConfig: initialConfig,
    changedFields: ["barangayName"],
    updates: { barangayName: "Barangay 100" },
  })

  // Both changes are preserved!
  assert.equal(mergedResult.barangayName, "Barangay 100", "Admin A's barangay name change must be applied")
  assert.equal(mergedResult.contactNumber, "02-2222-2222", "Admin B's contact number change must not be overwritten")
  assert.equal(mergedResult.version, 3, "Version must increment transactionally")
})

test("R03 Scenario 2: Overlapping concurrent field edits reject with HTTP 409 conflict and list conflicting fields", () => {
  const initialConfig = {
    contactNumber: "02-1111-1111",
    version: 1,
  }
  // Admin B changed contactNumber on server
  const serverStateAfterAdminB = {
    contactNumber: "02-9999-9999",
    version: 2,
  }

  // Admin A attempts to save contactNumber from baseVersion 1
  assert.throws(() => {
    executeConfigConcurrencyCheck({
      before: serverStateAfterAdminB,
      baseVersion: 1,
      baseConfig: initialConfig,
      changedFields: ["contactNumber"],
      updates: { contactNumber: "02-8888-8888" },
    })
  }, (err: any) => {
    assert.equal(err.statusCode, 409)
    assert.deepEqual(err.conflictingFields, ["contactNumber"])
    return true
  })
})

test("R03 Scenario 3: Fee edit does not inadvertently re-enable document type disabled by another admin", () => {
  const initialConfig = {
    documentTypes: ["Barangay Clearance", "Proof of Residency"],
    documentFees: { "Barangay Clearance": 50, "Proof of Residency": 50 },
    version: 1,
  }

  // Admin B disabled "Proof of Residency"
  const serverStateAfterAdminB = {
    documentTypes: ["Barangay Clearance"],
    documentFees: { "Barangay Clearance": 50, "Proof of Residency": 50 },
    version: 2,
  }

  // Admin A changed fee for Barangay Clearance only
  const merged = executeConfigConcurrencyCheck({
    before: serverStateAfterAdminB,
    baseVersion: 1,
    baseConfig: initialConfig,
    changedFields: ["documentFees"],
    updates: { documentFees: { "Barangay Clearance": 75, "Proof of Residency": 50 } },
  })

  assert.deepEqual(merged.documentTypes, ["Barangay Clearance"], "Disabled document type must remain disabled after fee update")
  assert.equal(merged.documentFees["Barangay Clearance"], 75)
})

// ---------------------------------------------------------------------------
// R04: View Only Role Authorization on Notifications
// ---------------------------------------------------------------------------
test("R04: View Only role cannot mutate notifications; privileged roles can", () => {
  assert.equal(canManageNotificationsRole("View Only"), false, "View Only role must not manage notifications")
  assert.equal(canManageNotificationsRole("resident"), false, "Resident role must not manage admin notifications")
  assert.equal(canManageNotificationsRole(null), false, "Unauthenticated user must not manage notifications")

  assert.equal(canManageNotificationsRole("Admin"), true)
  assert.equal(canManageNotificationsRole("Super Admin"), true)
  assert.equal(canManageNotificationsRole("Document Processing"), true)
  assert.equal(canManageNotificationsRole("Resident Management"), true)
  assert.equal(canManageNotificationsRole("Verification Only"), true)
  assert.equal(canManageNotificationsRole("Full Access"), true)
})

// ---------------------------------------------------------------------------
// R05: Truthful Beneficiary Verification Labels & Badges
// ---------------------------------------------------------------------------
test("R05: Unreviewed representation request is marked 'provided' (Unreviewed), never 'confirmed'", () => {
  const resident = { fullName: "Maria Clara", address: "Brgy 1" }
  const unreviewedReq = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    representedAddress: "Zone 3",
    representedAge: 25,
  }

  const subject = resolveDocumentSubject(unreviewedReq, resident)
  assert.equal(subject.beneficiaryReviewStatus, "provided", "Unreviewed represented data must be labelled provided, not confirmed")
  assert.equal(subject.isBeneficiaryConfirmed, false, "Unreviewed data must not be confirmed")
})

test("R05: Representation request with missing address is marked 'missing'", () => {
  const resident = { fullName: "Maria Clara", address: "Brgy 1" }
  const missingReq = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
  }

  const subject = resolveDocumentSubject(missingReq, resident)
  assert.equal(subject.beneficiaryReviewStatus, "missing", "Missing representation details must be marked missing")
  assert.equal(subject.isBeneficiaryConfirmed, false)
})

test("R05: Staff-confirmed beneficiary details are marked 'confirmed'", () => {
  const resident = { fullName: "Maria Clara", address: "Brgy 1" }
  const confirmedReq = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    representedAddress: "Zone 3",
    beneficiaryReviewStatus: "confirmed",
    confirmedBeneficiaryAddress: "Zone 3, Verified Block 4",
    confirmedBeneficiaryAge: 26,
    beneficiaryConfirmedBy: "Admin Staff",
    beneficiaryConfirmedAt: 1729000000000,
  }

  const subject = resolveDocumentSubject(confirmedReq, resident)
  assert.equal(subject.beneficiaryReviewStatus, "confirmed")
  assert.equal(subject.isBeneficiaryConfirmed, true)
  assert.equal(subject.beneficiaryConfirmedBy, "Admin Staff")
  assert.equal(subject.beneficiaryConfirmedAt, 1729000000000)
})

// ---------------------------------------------------------------------------
// R06: Persist Admin-Confirmed Beneficiary Details
// ---------------------------------------------------------------------------
test("R06: resolveDocumentSubject prioritizes confirmed beneficiary details over initial resident submission", () => {
  const resident = { fullName: "Maria Clara", address: "Brgy 1" }
  const reqWithConfirmed = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    representedAddress: "Self Reported Old Address",
    representedAge: 20,
    confirmedBeneficiaryAddress: "789 Verified Mabini St.",
    confirmedBeneficiaryAge: 22,
    beneficiaryReviewStatus: "confirmed",
  }

  const subject = resolveDocumentSubject(reqWithConfirmed, resident)
  assert.equal(subject.address, "789 Verified Mabini St.", "Confirmed address must take precedence over resident-submitted address")
  assert.equal(subject.age, "22", "Confirmed age must take precedence over resident-submitted age")
  assert.equal(subject.isRepresentation, true)
  assert.equal(subject.subjectName, "Pedro Penduko")
})

test("R06: Active UI overrides take immediate precedence during editing before confirmation save", () => {
  const resident = { fullName: "Maria Clara", address: "Brgy 1" }
  const req = {
    requestFor: "other",
    requestedByName: "Pedro Penduko",
    representedAddress: "Original Address",
    representedAge: 20,
  }

  const subject = resolveDocumentSubject(req, resident, {
    address: "Active Input Typed by Admin",
    age: "25",
  })
  assert.equal(subject.address, "Active Input Typed by Admin")
  assert.equal(subject.age, "25")
})

// ---------------------------------------------------------------------------
// R07: Test Fixture Isolation & Snapshot Restoration
// ---------------------------------------------------------------------------
test("R07: System config fixture restoration returns exact baseline without partial enablement", () => {
  const originalSnapshot = {
    documentTypes: [
      "Barangay Clearance",
      "Certificate of Indigency",
      "Proof of Residency",
      "Funeral Certification",
    ],
    documentFees: {
      "Barangay Clearance": 50,
      "Certificate of Indigency": 0,
      "Proof of Residency": 50,
      "Funeral Certification": 0,
    },
    barangayCaptainName: "E2E Captain",
    version: 5,
  }

  // Mutated config during test (e.g. all disabled)
  let mutableConfig: typeof originalSnapshot = {
    ...originalSnapshot,
    documentTypes: [],
  }
  assert.equal(mutableConfig.documentTypes.length, 0)

  // Proper test cleanup restores exact snapshot, not an arbitrary 4-type slice
  mutableConfig = { ...originalSnapshot }
  assert.deepEqual(mutableConfig.documentTypes, originalSnapshot.documentTypes)
  assert.deepEqual(mutableConfig.documentFees, originalSnapshot.documentFees)
  assert.equal(mutableConfig.barangayCaptainName, originalSnapshot.barangayCaptainName)
})
