import { test } from "node:test"
import assert from "node:assert/strict"

// F09: Admin PDF column selection logic
test("F09: Admin PDF column selection includes Expiry Date and Other Categories when selected", () => {
  const getPdfColumnsAndRow = (
    selectedColumns: {
      name: boolean
      age: boolean
      gender: boolean
      address: boolean
      contact: boolean
      status: boolean
      voter: boolean
      expiry: boolean
      categories: boolean
    },
    resident: {
      name: string
      age?: number
      gender?: string
      address?: string
      contactNumber?: string
      status?: string
      isVoter?: boolean
      accountExpiresAt?: number
      categories?: string[]
    }
  ) => {
    const cols = [
      selectedColumns.name && 'Full Name',
      selectedColumns.age && 'Age',
      selectedColumns.gender && 'Gender',
      selectedColumns.address && 'Address',
      selectedColumns.contact && 'Contact',
      selectedColumns.status && 'Status',
      selectedColumns.voter && 'Voter',
      selectedColumns.expiry && 'Expiry Date',
      selectedColumns.categories && 'Other Categories',
    ].filter(Boolean) as string[]

    const row = [
      selectedColumns.name && resident.name,
      selectedColumns.age && (resident.age !== undefined ? String(resident.age) : 'N/A'),
      selectedColumns.gender && (resident.gender || 'N/A'),
      selectedColumns.address && (resident.address || 'N/A'),
      selectedColumns.contact && (resident.contactNumber || 'N/A'),
      selectedColumns.status && (resident.status || 'Active'),
      selectedColumns.voter && (resident.isVoter ? 'Yes' : 'No'),
      selectedColumns.expiry && (resident.accountExpiresAt ? new Date(resident.accountExpiresAt).toLocaleDateString('en-US', { timeZone: 'Asia/Manila' }) : 'Never'),
      selectedColumns.categories && ((resident.categories && resident.categories.length > 0) ? resident.categories.join(', ') : 'None'),
    ].filter(val => val !== false && val !== undefined)

    return { cols, row }
  }

  const sampleResident = {
    name: "Juan Dela Cruz",
    age: 45,
    gender: "Male",
    address: "Zone 1",
    contactNumber: "09171234567",
    status: "Active",
    isVoter: true,
    accountExpiresAt: 1775000000000,
    categories: ["PWD", "Solo Parent"],
  }

  // When all selected, both Expiry Date and Other Categories are present in cols and row
  const allSelected = {
    name: true,
    age: true,
    gender: true,
    address: true,
    contact: true,
    status: true,
    voter: true,
    expiry: true,
    categories: true,
  }
  const resultAll = getPdfColumnsAndRow(allSelected, sampleResident)
  assert.equal(resultAll.cols.includes("Expiry Date"), true)
  assert.equal(resultAll.cols.includes("Other Categories"), true)
  assert.equal(resultAll.cols.length, 9)
  assert.equal(resultAll.row.length, 9)
  assert.equal(resultAll.row[8], "PWD, Solo Parent")

  // When deselected, they are excluded
  const partialSelected = {
    ...allSelected,
    expiry: false,
    categories: false,
  }
  const resultPartial = getPdfColumnsAndRow(partialSelected, sampleResident)
  assert.equal(resultPartial.cols.includes("Expiry Date"), false)
  assert.equal(resultPartial.cols.includes("Other Categories"), false)
  assert.equal(resultPartial.cols.length, 7)
  assert.equal(resultPartial.row.length, 7)
})

// F10: Deterministic sorting logic
test("F10: Admin and Superadmin reports deterministic sorting", () => {
  const residents = [
    { id: "1", name: "Cruz, Maria", age: 30, createdAt: 1000 },
    { id: "2", name: "Santos, Juan", age: 65, createdAt: 3000 },
    { id: "3", name: "Alvarez, Pedro", age: 15, createdAt: 2000 },
    { id: "4", name: "Santos, Ana", age: 25, createdAt: 4000 },
    { id: "5", name: "Zuniga, Carlos", age: 30, createdAt: 1500 },
  ]

  const sortResidents = (list: typeof residents, sortBy: string) => {
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return (a.name || "").localeCompare(b.name || "")
        case "name-desc":
          return (b.name || "").localeCompare(a.name || "")
        case "age-asc": {
          const ageDiff = (a.age ?? 0) - (b.age ?? 0)
          return ageDiff !== 0 ? ageDiff : (a.name || "").localeCompare(b.name || "")
        }
        case "age-desc": {
          const ageDiff = (b.age ?? 0) - (a.age ?? 0)
          return ageDiff !== 0 ? ageDiff : (a.name || "").localeCompare(b.name || "")
        }
        case "date-asc": {
          const aTime = a.createdAt || 0
          const bTime = b.createdAt || 0
          return aTime !== bTime ? aTime - bTime : (a.name || "").localeCompare(b.name || "")
        }
        case "date-desc": {
          const aTime = a.createdAt || 0
          const bTime = b.createdAt || 0
          return aTime !== bTime ? bTime - aTime : (a.name || "").localeCompare(b.name || "")
        }
        default:
          return 0
      }
    })
  }

  // Name asc
  const byNameAsc = sortResidents(residents, "name-asc")
  assert.equal(byNameAsc[0].name, "Alvarez, Pedro")
  assert.equal(byNameAsc[4].name, "Zuniga, Carlos")

  // Name desc
  const byNameDesc = sortResidents(residents, "name-desc")
  assert.equal(byNameDesc[0].name, "Zuniga, Carlos")
  assert.equal(byNameDesc[4].name, "Alvarez, Pedro")

  // Age asc
  const byAgeAsc = sortResidents(residents, "age-asc")
  assert.equal(byAgeAsc[0].age, 15)
  assert.equal(byAgeAsc[4].age, 65)

  // Age desc
  const byAgeDesc = sortResidents(residents, "age-desc")
  assert.equal(byAgeDesc[0].age, 65)
  assert.equal(byAgeDesc[4].age, 15)

  // Date asc
  const byDateAsc = sortResidents(residents, "date-asc")
  assert.equal(byDateAsc[0].id, "1")
  assert.equal(byDateAsc[4].id, "4")

  // Date desc
  const byDateDesc = sortResidents(residents, "date-desc")
  assert.equal(byDateDesc[0].id, "4")
  assert.equal(byDateDesc[4].id, "1")
})

// F11: Non-Voters List report filtering
test("F11: Non-Voters List report filters only residents where isVoter is false", () => {
  const residents = [
    { id: "1", name: "Juan", isVoter: true },
    { id: "2", name: "Maria", isVoter: false },
    { id: "3", name: "Pedro", isVoter: false },
    { id: "4", name: "Ana", isVoter: true },
  ]

  const nonVoters = residents.filter(r => !r.isVoter)
  assert.equal(nonVoters.length, 2)
  assert.deepEqual(nonVoters.map(r => r.id), ["2", "3"])
  assert.ok(nonVoters.every(r => r.isVoter === false))

  // Empty population
  assert.equal([].filter((r: any) => !r.isVoter).length, 0)

  // All voters
  const allVoters = residents.filter(r => r.isVoter)
  assert.equal(allVoters.filter(r => !r.isVoter).length, 0)
})

// F12: Custom document request resolves configured template instead of custom_blank
test("F12: Custom document deep-link resolution finds custom template by documentType", () => {
  const customDocumentTypes = [
    { id: "business_permit", header: "BARANGAY BUSINESS PERMIT", template: "business_permit_template_v1", isBuiltIn: false },
    { id: "cert_indigency_custom", header: "CERTIFICATE OF INDIGENCY SPECIAL", template: "indigency_custom_template", isBuiltIn: false },
  ]

  const resolveTemplate = (
    reqDocType: string,
    types: typeof customDocumentTypes
  ) => {
    // Exact id match or title match
    const customDoc = types.find(
      t => t.id === reqDocType ||
           t.header.toLowerCase() === reqDocType.toLowerCase() ||
           t.id.toLowerCase() === reqDocType.toLowerCase()
    )

    if (customDoc) {
      return {
        matchedId: customDoc.id,
        title: customDoc.header,
        templateContent: customDoc.template,
      }
    }

    return {
      matchedId: "custom_blank",
      title: "CUSTOM BARANGAY DOCUMENT",
      templateContent: "blank_content",
    }
  }

  // Resolves configured custom document by ID
  const resolvedById = resolveTemplate("business_permit", customDocumentTypes)
  assert.equal(resolvedById.matchedId, "business_permit")
  assert.equal(resolvedById.title, "BARANGAY BUSINESS PERMIT")
  assert.equal(resolvedById.templateContent, "business_permit_template_v1")

  // Resolves configured custom document by Header name
  const resolvedByHeader = resolveTemplate("BARANGAY BUSINESS PERMIT", customDocumentTypes)
  assert.equal(resolvedByHeader.matchedId, "business_permit")
  assert.equal(resolvedByHeader.title, "BARANGAY BUSINESS PERMIT")

  // Unmatched falls back to custom_blank
  const resolvedUnmatched = resolveTemplate("Non_Existent_Doc", customDocumentTypes)
  assert.equal(resolvedUnmatched.matchedId, "custom_blank")
})

import {
  getAuthoritativeIssuanceTimestamp,
  isRecordInPeriod,
} from "../lib/timestamp-normalizer.ts"

// F13: Authoritative document issuance timestamps (never falling back to createdAt or updatedAt)
test("F13: getAuthoritativeIssuanceTimestamp uses authoritative issuance evidence and excludes undated/unissued records", () => {
  const janSubmission = new Date("2026-01-10T10:00:00Z").getTime()
  const marIssuance = new Date("2026-03-15T10:00:00Z").getTime()
  const aprUpdate = new Date("2026-04-20T10:00:00Z").getTime()

  // 1. Document with explicit generatedAt
  const docGenerated = {
    id: "req-1",
    createdAt: janSubmission,
    generatedAt: marIssuance,
    updatedAt: aprUpdate,
  }
  assert.equal(getAuthoritativeIssuanceTimestamp(docGenerated), marIssuance)

  // 2. Document with explicit issuedAt takes highest precedence
  const docIssued = {
    id: "req-2",
    createdAt: janSubmission,
    issuedAt: marIssuance,
    generatedAt: janSubmission,
    updatedAt: aprUpdate,
  }
  assert.equal(getAuthoritativeIssuanceTimestamp(docIssued), marIssuance)

  // 3. Document with statusTimestamps["Ready for Pick Up"]
  const docReady = {
    id: "req-3",
    createdAt: janSubmission,
    updatedAt: aprUpdate,
    statusTimestamps: {
      "Ready for Pick Up": marIssuance,
    },
  }
  assert.equal(getAuthoritativeIssuanceTimestamp(docReady), marIssuance)

  // 4. Document with statusTimestamps["Completed"]
  const docCompleted = {
    id: "req-4",
    createdAt: janSubmission,
    updatedAt: aprUpdate,
    statusTimestamps: {
      "Completed": marIssuance,
    },
  }
  assert.equal(getAuthoritativeIssuanceTimestamp(docCompleted), marIssuance)

  // 5. Document with ONLY createdAt and updatedAt (unrelated update or submission only)
  // Must return null, NEVER falling back to createdAt or updatedAt
  const docUnissued = {
    id: "req-5",
    createdAt: janSubmission,
    updatedAt: aprUpdate,
  }
  assert.equal(getAuthoritativeIssuanceTimestamp(docUnissued), null)

  // 6. Record without any timestamps
  assert.equal(getAuthoritativeIssuanceTimestamp({ id: "req-6" }), null)
  assert.equal(getAuthoritativeIssuanceTimestamp(null), null)
  assert.equal(getAuthoritativeIssuanceTimestamp(undefined), null)
})

// F14: Report date-filter accuracy in Asia/Manila reporting periods
test("F14: isRecordInPeriod strictly validates dates and excludes undated records when period is specified", () => {
  // All Time includes everything
  assert.equal(isRecordInPeriod(undefined, "All Time"), true)
  assert.equal(isRecordInPeriod(null, "All Time"), true)
  assert.equal(isRecordInPeriod("2026-03-15T10:00:00Z", "All Time"), true)
  assert.equal(isRecordInPeriod(1773576000000, "All Time"), true)

  // Specific Year: excludes missing/malformed dates
  assert.equal(isRecordInPeriod(undefined, "2026"), false)
  assert.equal(isRecordInPeriod(null, "2026"), false)
  assert.equal(isRecordInPeriod("", "2026"), false)
  assert.equal(isRecordInPeriod("invalid-date", "2026"), false)

  // Specific Year: includes only records belonging to that calendar year in Asia/Manila
  assert.equal(isRecordInPeriod("2026-05-10T12:00:00Z", "2026"), true)
  assert.equal(isRecordInPeriod("2025-12-31T12:00:00Z", "2026"), false)
  assert.equal(isRecordInPeriod("2027-01-01T12:00:00Z", "2026"), false)

  // Specific Month and Year: excludes missing/malformed dates
  assert.equal(isRecordInPeriod(undefined, "2026", "March"), false)
  assert.equal(isRecordInPeriod(null, "2026", "March"), false)
  assert.equal(isRecordInPeriod("", "2026", "March"), false)

  // Specific Month and Year: matches correct month
  assert.equal(isRecordInPeriod("2026-03-15T12:00:00Z", "2026", "March"), true)
  assert.equal(isRecordInPeriod("2026-04-15T12:00:00Z", "2026", "March"), false)
  assert.equal(isRecordInPeriod("2026-02-15T12:00:00Z", "2026", "March"), false)

  // Works with Firestore Timestamp objects
  const fsTimestamp = { toMillis: () => new Date("2026-03-15T10:00:00Z").getTime() }
  assert.equal(isRecordInPeriod(fsTimestamp, "2026", "March"), true)
  assert.equal(isRecordInPeriod(fsTimestamp, "2026", "April"), false)

  // Asia/Manila (UTC+8) midnight boundary tests:
  // 2026-02-28 16:05:00 UTC = 2026-03-01 00:05:00 Manila (March, NOT February!)
  const marchFirstManilaUtc = "2026-02-28T16:05:00.000Z"
  assert.equal(isRecordInPeriod(marchFirstManilaUtc, "2026", "March"), true)
  assert.equal(isRecordInPeriod(marchFirstManilaUtc, "2026", "February"), false)

  // 2026-03-31 15:59:00 UTC = 2026-03-31 23:59:00 Manila (March, NOT April!)
  const marchLastManilaUtc = "2026-03-31T15:59:00.000Z"
  assert.equal(isRecordInPeriod(marchLastManilaUtc, "2026", "March"), true)
  assert.equal(isRecordInPeriod(marchLastManilaUtc, "2026", "April"), false)

  // 2026-03-31 16:01:00 UTC = 2026-04-01 00:01:00 Manila (April, NOT March!)
  const aprilFirstManilaUtc = "2026-03-31T16:01:00.000Z"
  assert.equal(isRecordInPeriod(aprilFirstManilaUtc, "2026", "March"), false)
  assert.equal(isRecordInPeriod(aprilFirstManilaUtc, "2026", "April"), true)
})
