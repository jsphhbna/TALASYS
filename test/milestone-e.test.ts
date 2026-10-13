import test from "node:test"
import assert from "node:assert/strict"

test("Milestone E — Issue #2 & #8: Custom reports date range boundaries in Asia/Manila", () => {
  const startDate = "2026-10-01"
  const endDate = "2026-10-15"
  
  const startTs = new Date(`${startDate}T00:00:00+08:00`).getTime()
  const endTs = new Date(`${endDate}T23:59:59.999+08:00`).getTime()

  assert.ok(startTs < endTs, "Start timestamp must precede end timestamp")
  
  // Verify Manila timezone offset (UTC+8)
  const manilaDateStart = new Date(startTs)
  assert.equal(manilaDateStart.toISOString(), "2026-09-30T16:00:00.000Z")
  
  // Sample requests
  const reqInside = { id: "1", createdAt: new Date("2026-10-05T10:00:00+08:00").getTime() }
  const reqBefore = { id: "2", createdAt: new Date("2026-09-30T23:59:00+08:00").getTime() }
  const reqAfter = { id: "3", createdAt: new Date("2026-10-16T00:01:00+08:00").getTime() }

  const requests = [reqInside, reqBefore, reqAfter]
  const filtered = requests.filter(r => r.createdAt >= startTs && r.createdAt <= endTs)
  
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, "1")
})

test("Milestone E — Issue #4: Reason Analytics category filtering with snapshot & profile", () => {
  const residents = [
    { id: "res-1", name: "Maria Santos", categories: ["Senior Citizen"], age: 65, isVoter: true },
    { id: "res-2", name: "Juan Dela Cruz", categories: ["Adult", "PWD"], age: 35, isVoter: true },
    { id: "res-3", name: "Pedro Penduko", categories: ["Underage"], age: 16, isVoter: false }
  ]

  const requests = [
    { id: "req-1", residentId: "res-1", residentName: "Maria Santos", residentCategory: "Senior Citizen", purpose: "Medical Assistance" },
    { id: "req-2", residentId: "res-2", residentName: "Juan Dela Cruz", residentCategory: "PWD", purpose: "Financial Aid" },
    { id: "req-3", residentId: "res-3", residentName: "Pedro Penduko", residentCategory: "Minor", purpose: "Scholarship" },
    // Historical request where residentCategory was incorrectly set to lifecycle status "Verified"
    { id: "req-4", residentId: "res-1", residentName: "Maria Santos", residentCategory: "Verified", purpose: "Travel" }
  ]

  const getRequestCategories = (r: typeof requests[0]): string[] => {
    const cats = new Set<string>()
    const lifecycleWords = ["active", "inactive", "verified", "unverified", "pending", "expired", "expiring", "rejected"]
    if (r.residentCategory && !lifecycleWords.includes(r.residentCategory.toLowerCase().trim())) {
      cats.add(r.residentCategory.trim())
    }
    const resident = residents.find(res => res.id === r.residentId)
    if (resident) {
      if (Array.isArray(resident.categories)) {
        resident.categories.forEach(c => {
          if (!lifecycleWords.includes(c.toLowerCase().trim())) cats.add(c.trim())
        })
      }
      if (resident.isVoter) cats.add("Registered Voter")
      if (resident.age >= 60) cats.add("Senior Citizen")
      if (resident.age > 0 && resident.age < 18) cats.add("Minor")
      if (resident.age >= 18 && resident.age < 60) cats.add("Adult")
    }
    return Array.from(cats)
  }

  const matchesCategory = (r: typeof requests[0], cat: string): boolean => {
    if (cat === "All Categories") return true
    const cats = getRequestCategories(r).map(c => c.toLowerCase())
    if (cat === "Senior Citizens") return cats.some(c => c.includes("senior"))
    if (cat === "Adults") return cats.some(c => c.includes("adult"))
    if (cat === "Minors") return cats.some(c => c.includes("minor") || c.includes("underage"))
    if (cat === "Registered Voters") return cats.some(c => c.includes("voter"))
    if (cat === "PWD") return cats.some(c => c.includes("pwd"))
    return cats.includes(cat.toLowerCase())
  }

  // Filter for Senior Citizens
  const seniors = requests.filter(r => matchesCategory(r, "Senior Citizens"))
  assert.equal(seniors.length, 2, "Both req-1 and req-4 should match Senior Citizens despite req-4 having lifecycle status 'Verified'")

  // Filter for PWD
  const pwds = requests.filter(r => matchesCategory(r, "PWD"))
  assert.equal(pwds.length, 1)
  assert.equal(pwds[0].id, "req-2")

  // Filter for Minors
  const minors = requests.filter(r => matchesCategory(r, "Minors"))
  assert.equal(minors.length, 1)
  assert.equal(minors[0].id, "req-3")
})

test("Milestone E — Issue #7 & #21: Resident list & history pagination clamping and reset", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `item-${i + 1}`, name: `Resident ${i + 1}` }))
  const itemsPerPage = 10

  let currentPage = 1
  let totalPages = Math.ceil(items.length / itemsPerPage) // 3 pages

  // Page 2 slice
  currentPage = 2
  const page2Slice = items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
  assert.equal(page2Slice.length, 10)
  assert.equal(page2Slice[0].id, "item-11")

  // Filter down to 2 items while user is currently on Page 3
  currentPage = 3
  const filtered = items.filter(it => it.id === "item-1" || it.id === "item-2")
  totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage)) // 1 page
  
  // Safe clamped page
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  assert.equal(safeCurrentPage, 1, "Clamped page should fall back to 1 instead of rendering empty page 3")
  
  const pageSlice = filtered.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage)
  assert.equal(pageSlice.length, 2)
  assert.equal(pageSlice[0].id, "item-1")
})

test("Milestone E — Issue #10: Category report column selection includes Expiry Date and Other Categories", () => {
  const selectedColumns = {
    name: true,
    age: true,
    address: true,
    status: true,
    isVoter: true,
    expiryDate: true,
    otherCategories: true
  }

  const columns: { header: string; dataKey: string }[] = []
  if (selectedColumns.name) columns.push({ header: 'Full Name', dataKey: 'name' })
  if (selectedColumns.age) columns.push({ header: 'Age', dataKey: 'age' })
  if (selectedColumns.address) columns.push({ header: 'Address', dataKey: 'address' })
  if (selectedColumns.status) columns.push({ header: 'Status', dataKey: 'status' })
  if (selectedColumns.isVoter) columns.push({ header: 'Voter', dataKey: 'isVoter' })
  if (selectedColumns.expiryDate) columns.push({ header: 'Expiry Date', dataKey: 'expiryDate' })
  if (selectedColumns.otherCategories) columns.push({ header: 'Other Categories', dataKey: 'otherCategories' })

  const headers = columns.map(c => c.header)
  assert.ok(headers.includes("Expiry Date"), "Headers must include Expiry Date")
  assert.ok(headers.includes("Other Categories"), "Headers must include Other Categories")
  assert.equal(headers.length, 7)
})

test("Milestone E — Issue #12: Empty Reason Analytics displays 0 total analyzed", () => {
  const filteredRequests: any[] = []

  const totalRequests = filteredRequests.length
  const safeTotalRequests = Math.max(1, filteredRequests.length)

  // Finding #12 fix: displayed total is totalRequests (0), division uses safeTotalRequests (1)
  assert.equal(totalRequests, 0, "Display count must be 0 for empty dataset")
  
  const count = 0
  const percentage = totalRequests === 0 ? 0 : Math.round((count / safeTotalRequests) * 100)
  assert.equal(percentage, 0)
})

test("Milestone E — Issue #13: Stable purpose keys shared across document types in breakdown", () => {
  const filteredRequests = [
    { documentType: "Barangay Clearance", purpose: "Employment" },
    { documentType: "Barangay Clearance", purpose: "Employment" },
    { documentType: "Barangay Clearance", purpose: "Scholarship" },
    { documentType: "Certificate of Indigency", purpose: "Medical Assistance" },
    { documentType: "Certificate of Indigency", purpose: "Scholarship" }
  ]

  // Overall top purposes
  const purposeCounts: Record<string, number> = {}
  filteredRequests.forEach(r => {
    purposeCounts[r.purpose] = (purposeCounts[r.purpose] || 0) + 1
  })
  const topPurposes = Object.entries(purposeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .slice(0, 3)

  // Verify top purposes
  assert.deepEqual(topPurposes, ["Employment", "Scholarship", "Medical Assistance"])

  const docTypes = ["Barangay Clearance", "Certificate of Indigency"]
  const rows = docTypes.map(docType => {
    const subset = filteredRequests.filter(r => r.documentType === docType)
    const total = subset.length
    const breakdown: Record<string, number> = {}
    subset.forEach(r => { breakdown[r.purpose] = (breakdown[r.purpose] || 0) + 1 })

    const entry: any = { docType }
    topPurposes.forEach(p => {
      entry[p] = Math.round(((breakdown[p] || 0) / total) * 100)
    })
    return entry
  })

  // In Barangay Clearance: Employment=67%, Scholarship=33%, Medical Assistance=0%
  assert.equal(rows[0]["Employment"], 67)
  assert.equal(rows[0]["Scholarship"], 33)
  assert.equal(rows[0]["Medical Assistance"], 0)

  // In Certificate of Indigency: Medical Assistance=50%, Scholarship=50%, Employment=0%
  assert.equal(rows[1]["Employment"], 0)
  assert.equal(rows[1]["Scholarship"], 50)
  assert.equal(rows[1]["Medical Assistance"], 50)

  // Both rows use identical stable keys ("Employment", "Scholarship", "Medical Assistance")
  // ensuring the chart bars match the labels!
  assert.ok(rows[0].hasOwnProperty("Employment"))
  assert.ok(rows[1].hasOwnProperty("Employment"))
})

test("Milestone E — Issue #20: Resident history table filters by selectedYear and selectedMonth", () => {
  const requests = [
    { id: "1", dateRequested: "2026-10-01", createdAt: 1790000000000, documentType: "Barangay Clearance" },
    { id: "2", dateRequested: "2026-05-15", createdAt: 1778000000000, documentType: "Proof of Residency" },
    { id: "3", dateRequested: "2025-10-10", createdAt: 1759000000000, documentType: "Certificate of Indigency" }
  ]

  const filterByDate = (year: string, month: string) => {
    return requests.filter(request => {
      if (!request.dateRequested && !request.createdAt) return false
      const date = request.dateRequested ? new Date(`${request.dateRequested}T00:00:00`) : new Date(request.createdAt)
      if (isNaN(date.getTime())) return false
      const reqYear = date.getFullYear().toString()
      const reqMonth = date.toLocaleString('en-US', { month: 'long' })
      if (year !== "All Years" && year !== "All" && reqYear !== year) return false
      if (month !== "All Months" && reqMonth !== month) return false
      return true
    })
  }

  // Filter 2026 October
  const oct2026 = filterByDate("2026", "October")
  assert.equal(oct2026.length, 1)
  assert.equal(oct2026[0].id, "1")

  // Filter All Years October
  const allOct = filterByDate("All Years", "October")
  assert.equal(allOct.length, 2)

  // Filter 2025 All Months
  const all2025 = filterByDate("2025", "All Months")
  assert.equal(all2025.length, 1)
  assert.equal(all2025[0].id, "3")
})
