import { test } from "node:test"
import assert from "node:assert/strict"
import {
  getAuthoritativeVerificationDecisionTimestamp,
  isVerificationInDecisionYear,
  getManilaEventMonth,
  getAvailableVerificationYears,
  getTopReasonsByDecisionYear,
  type VerificationRecordLike,
  type ActivityLogLike,
} from "../lib/security/verification-history-policy.ts"

test("D05: Verification History Decision Date Accuracy & Attribution", async (t) => {
  await t.test("Decision year vs submission year attribution (Dec 2026 submission, Jan 2027 denial)", () => {
    // Submitted Dec 20, 2026 (UTC timestamp ~ 1766200000000)
    // Denied Jan 3, 2027 (UTC timestamp ~ 1767400000000)
    const submissionMillis = new Date("2026-12-20T10:00:00Z").getTime()
    const denialMillis = new Date("2027-01-03T02:00:00Z").getTime()

    const deniedVerification: VerificationRecordLike = {
      id: "verif-dec-sub-jan-deny",
      type: "registration",
      status: "denied",
      denialReason: "Fabricated barangay clearance detected.",
      createdAt: submissionMillis,
      submittedDate: "Dec 20, 2026",
      deniedAt: denialMillis,
    }

    // 1. Authoritative timestamp is denialMillis, NOT submissionMillis
    const decisionTs = getAuthoritativeVerificationDecisionTimestamp(deniedVerification)
    assert.equal(decisionTs, denialMillis)

    // 2. Attribution in year 2026 vs 2027
    assert.equal(isVerificationInDecisionYear(deniedVerification, 2026), false)
    assert.equal(isVerificationInDecisionYear(deniedVerification, 2027), true)

    // 3. Month in 2027 is "Jan"
    assert.equal(getManilaEventMonth(denialMillis), "Jan")

    // 4. Reasons breakdown for 2026 vs 2027
    const reasons2026 = getTopReasonsByDecisionYear([], [deniedVerification], 2026)
    const denialGroup2026 = reasons2026.find(g => g.id === "denied-registration")
    assert.equal(denialGroup2026?.data.length, 0, "2026 reasons breakdown must not include Jan 2027 denial")

    const reasons2027 = getTopReasonsByDecisionYear([], [deniedVerification], 2027)
    const denialGroup2027 = reasons2027.find(g => g.id === "denied-registration")
    assert.equal(denialGroup2027?.data.length, 1)
    assert.equal(denialGroup2027?.data[0].reason, "Fabricated barangay clearance detected.")
    assert.equal(denialGroup2027?.data[0].count, 1)
  })

  await t.test("Rejection decision year vs submission year attribution", () => {
    const submissionMillis = new Date("2026-12-28T09:00:00Z").getTime()
    const rejectionMillis = new Date("2027-01-02T04:00:00Z").getTime()

    const rejectedVerification: VerificationRecordLike = {
      id: "verif-rej-cross-year",
      type: "registration",
      status: "rejected",
      rejectionReason: "ID photo is blurry and illegible",
      createdAt: submissionMillis,
      submittedDate: "Dec 28, 2026",
      rejectedAt: rejectionMillis,
    }

    assert.equal(isVerificationInDecisionYear(rejectedVerification, 2026), false)
    assert.equal(isVerificationInDecisionYear(rejectedVerification, 2027), true)

    const reasons2026 = getTopReasonsByDecisionYear([rejectedVerification], [], 2026)
    const rejGroup2026 = reasons2026.find(g => g.id === "registration")
    assert.equal(rejGroup2026?.data.length, 0)

    const reasons2027 = getTopReasonsByDecisionYear([rejectedVerification], [], 2027)
    const rejGroup2027 = reasons2027.find(g => g.id === "registration")
    assert.equal(rejGroup2027?.data.length, 1)
    assert.equal(rejGroup2027?.data[0].reason, "ID photo is blurry and illegible")
  })

  await t.test("Manila Midnight boundary crosses correctly (+08:00)", () => {
    // 2026-12-31T15:59:59Z in UTC is 2026-12-31 23:59:59 in Manila (+8) -> Year 2026, Dec
    const dec31Manila = new Date("2026-12-31T15:59:59Z").getTime()
    assert.equal(getManilaEventMonth(dec31Manila), "Dec")

    const verifDec31: VerificationRecordLike = {
      id: "verif-dec-31",
      status: "approved",
      approvedAt: dec31Manila,
    }
    assert.equal(isVerificationInDecisionYear(verifDec31, 2026), true)
    assert.equal(isVerificationInDecisionYear(verifDec31, 2027), false)

    // 2026-12-31T16:00:01Z in UTC is 2027-01-01 00:00:01 in Manila (+8) -> Year 2027, Jan
    const jan1Manila = new Date("2026-12-31T16:00:01Z").getTime()
    assert.equal(getManilaEventMonth(jan1Manila), "Jan")

    const verifJan1: VerificationRecordLike = {
      id: "verif-jan-1",
      status: "approved",
      approvedAt: jan1Manila,
    }
    assert.equal(isVerificationInDecisionYear(verifJan1, 2026), false)
    assert.equal(isVerificationInDecisionYear(verifJan1, 2027), true)
  })

  await t.test("Missing or submission-only timestamps are rejected honestly", () => {
    // Record with only createdAt or submittedDate, no decision timestamp
    const pendingRecord: VerificationRecordLike = {
      id: "verif-pending",
      status: "pending",
      createdAt: new Date("2026-06-15T00:00:00Z").getTime(),
      submittedDate: "Jun 15, 2026",
    }

    assert.equal(getAuthoritativeVerificationDecisionTimestamp(pendingRecord), null)
    assert.equal(isVerificationInDecisionYear(pendingRecord, 2026), false)
    assert.equal(isVerificationInDecisionYear(pendingRecord, 2027), false)
  })

  await t.test("Available verification years discovers decision years and activity log years", () => {
    const rejectedVerifs: VerificationRecordLike[] = [
      { id: "1", type: "registration", status: "rejected", rejectedAt: new Date("2025-05-01T00:00:00Z").getTime() },
    ]
    const deniedVerifs: VerificationRecordLike[] = [
      { id: "2", type: "registration", status: "denied", deniedAt: new Date("2027-02-01T00:00:00Z").getTime() },
    ]

    const logs: ActivityLogLike[] = [
      { actionType: "approved", timestamp: new Date("2026-08-10T00:00:00Z").getTime() },
    ]

    const years = getAvailableVerificationYears(logs, rejectedVerifs, deniedVerifs)
    // Must contain 2027, 2026, 2025 sorted descending
    assert.ok(years.includes("2027"))
    assert.ok(years.includes("2026"))
    assert.ok(years.includes("2025"))
    assert.equal(Number(years[0]) >= Number(years[1]) && Number(years[1]) >= Number(years[2]), true)
  })

  await t.test("Top reasons groups separate rejection from permanent denial reasons", () => {
    const rejectedRecords: VerificationRecordLike[] = [
      {
        id: "1",
        type: "registration",
        status: "rejected",
        rejectionReason: "Blurry document",
        rejectedAt: new Date("2026-03-01T00:00:00Z").getTime(),
      },
      {
        id: "2",
        type: "registration",
        status: "rejected",
        rejectionReason: "Blurry document",
        rejectedAt: new Date("2026-04-01T00:00:00Z").getTime(),
      },
      {
        id: "3",
        type: "registration",
        status: "rejected",
        rejectionReason: "Expired ID",
        rejectedAt: new Date("2026-05-01T00:00:00Z").getTime(),
      },
    ]

    const deniedRecords: VerificationRecordLike[] = [
      {
        id: "4",
        type: "registration",
        status: "denied",
        denialReason: "Fraudulent identity documents",
        deniedAt: new Date("2026-06-01T00:00:00Z").getTime(),
      },
    ]

    const groups = getTopReasonsByDecisionYear(rejectedRecords, deniedRecords, 2026)
    const rejGroup = groups.find(g => g.id === "registration")
    const denGroup = groups.find(g => g.id === "denied-registration")

    assert.equal(rejGroup?.data[0].reason, "Blurry document")
    assert.equal(rejGroup?.data[0].count, 2)
    assert.equal(rejGroup?.data[0].total, 3)

    assert.equal(denGroup?.data[0].reason, "Fraudulent identity documents")
    assert.equal(denGroup?.data[0].count, 1)
    assert.equal(denGroup?.data[0].total, 1)
  })

  // E04: Elimination of misleading updatedAt fallbacks & strict decision timestamp semantics
  await t.test("E04 Scenario 1: Denied Jan 3, updated March 10 -> attributed to Jan", () => {
    const deniedJan3 = new Date("2027-01-03T10:00:00Z").getTime()
    const updatedMarch10 = new Date("2027-03-10T14:00:00Z").getTime()
    const record: VerificationRecordLike = {
      id: "v-e04-1",
      status: "denied",
      deniedAt: deniedJan3,
      updatedAt: updatedMarch10,
    }
    const ts = getAuthoritativeVerificationDecisionTimestamp(record)
    assert.equal(ts, deniedJan3)
    assert.equal(getManilaEventMonth(ts), "Jan")
  })

  await t.test("E04 Scenario 2: Rejected Dec 2026, subsequently edited Jan 2027 -> attributed to Dec 2026", () => {
    const rejectedDec2026 = new Date("2026-12-28T08:00:00Z").getTime()
    const editedJan2027 = new Date("2027-01-15T09:00:00Z").getTime()
    const record: VerificationRecordLike = {
      id: "v-e04-2",
      status: "rejected",
      rejectedAt: rejectedDec2026,
      updatedAt: editedJan2027,
      rejectionReason: "Invalid proof of residency",
    }
    const ts = getAuthoritativeVerificationDecisionTimestamp(record)
    assert.equal(ts, rejectedDec2026)
    assert.equal(isVerificationInDecisionYear(record, 2026), true)
    assert.equal(isVerificationInDecisionYear(record, 2027), false)
    assert.equal(getManilaEventMonth(ts), "Dec")
  })

  await t.test("E04 Scenario 3: Approved Feb 14, updated later -> attributed to Feb", () => {
    const approvedFeb = new Date("2027-02-14T11:00:00Z").getTime()
    const updatedLater = new Date("2027-08-01T12:00:00Z").getTime()
    const record: VerificationRecordLike = {
      id: "v-e04-3",
      status: "approved",
      approvedAt: approvedFeb,
      updatedAt: updatedLater,
    }
    const ts = getAuthoritativeVerificationDecisionTimestamp(record)
    assert.equal(ts, approvedFeb)
    assert.equal(getManilaEventMonth(ts), "Feb")
  })

  await t.test("E04 Scenario 4: Missing authoritative decision timestamp but valid updatedAt remains unknown date", () => {
    const record: VerificationRecordLike = {
      id: "v-e04-4",
      status: "denied",
      updatedAt: Date.now(),
      createdAt: Date.now() - 100000,
    }
    // When deniedAt is missing, must NOT fall back to updatedAt
    assert.equal(getAuthoritativeVerificationDecisionTimestamp(record), null)
    assert.equal(isVerificationInDecisionYear(record, 2026), false)
    assert.equal(isVerificationInDecisionYear(record, 2027), false)
  })

  await t.test("E04 Scenario 5: Mixed timestamp representations (Firestore Timestamp object, ISO, epoch seconds)", () => {
    const ms = 1768478400000 // 2026-01-15 20:00:00 Manila (UTC+8)
    const firestoreTimestampObj = { seconds: Math.floor(ms / 1000), nanoseconds: 0 }
    const firestoreTimestampWithMillis = { toMillis: () => ms }
    const isoString = "2026-01-15T12:00:00.000Z"
    const epochSeconds = Math.floor(ms / 1000)

    const rec1: VerificationRecordLike = { id: "m1", status: "denied", deniedAt: firestoreTimestampObj }
    const rec2: VerificationRecordLike = { id: "m2", status: "rejected", rejectedAt: firestoreTimestampWithMillis }
    const rec3: VerificationRecordLike = { id: "m3", status: "approved", approvedAt: isoString }
    const rec4: VerificationRecordLike = { id: "m4", status: "denied", deniedAt: epochSeconds }

    assert.equal(getAuthoritativeVerificationDecisionTimestamp(rec1), ms)
    assert.equal(getAuthoritativeVerificationDecisionTimestamp(rec2), ms)
    assert.equal(getAuthoritativeVerificationDecisionTimestamp(rec3), ms)
    assert.equal(getAuthoritativeVerificationDecisionTimestamp(rec4), ms)
    assert.equal(getManilaEventMonth(getAuthoritativeVerificationDecisionTimestamp(rec1)), "Jan")
  })
})
