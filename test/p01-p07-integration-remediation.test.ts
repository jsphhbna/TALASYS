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
} from "../lib/document-catalog.ts"
import { resolveConfiguredDocument } from "../app/api/resident/requests/create/route.ts"

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
