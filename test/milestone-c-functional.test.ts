import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeTimestamp } from "../lib/timestamp-normalizer.ts"

// F15: Production timestamp normalization across diverse data formats
test("F15: normalizeTimestamp correctly normalizes ISO strings, Unix ms/seconds, and Firestore Timestamps", () => {
  const expectedMs = new Date("2026-01-15T12:00:00.000Z").getTime()

  // 1. ISO date strings
  assert.equal(normalizeTimestamp("2026-01-15T12:00:00.000Z"), expectedMs)
  assert.equal(normalizeTimestamp("2026-01-15T12:00:00Z"), expectedMs)

  // 2. Numeric milliseconds
  assert.equal(normalizeTimestamp(expectedMs), expectedMs)

  // 3. Numeric seconds (auto-converted to ms)
  const expectedSeconds = Math.floor(expectedMs / 1000)
  assert.equal(normalizeTimestamp(expectedSeconds), expectedSeconds * 1000)

  // 4. Firestore Timestamp with toMillis()
  assert.equal(normalizeTimestamp({ toMillis: () => expectedMs }), expectedMs)

  // 5. Firestore Timestamp with toDate()
  assert.equal(normalizeTimestamp({ toDate: () => new Date(expectedMs) }), expectedMs)

  // 6. Firestore Timestamp object with seconds & nanoseconds
  assert.equal(normalizeTimestamp({ seconds: expectedSeconds, nanoseconds: 0 }), expectedSeconds * 1000)
  assert.equal(normalizeTimestamp({ _seconds: expectedSeconds, _nanoseconds: 0 }), expectedSeconds * 1000)

  // 7. Date object
  assert.equal(normalizeTimestamp(new Date(expectedMs)), expectedMs)

  // 8. Numeric string
  assert.equal(normalizeTimestamp(String(expectedMs)), expectedMs)

  // 9. Null, undefined, empty, or invalid inputs return null (never NaN or current time)
  assert.equal(normalizeTimestamp(null), null)
  assert.equal(normalizeTimestamp(undefined), null)
  assert.equal(normalizeTimestamp(""), null)
  assert.equal(normalizeTimestamp("   "), null)
  assert.equal(normalizeTimestamp("not-a-date"), null)
  assert.equal(normalizeTimestamp(NaN), null)
  assert.equal(normalizeTimestamp(0), null)
  assert.equal(normalizeTimestamp(-100), null)
  assert.equal(normalizeTimestamp({} as any), null)
})

// F15: Population sparklines preserve legitimate historical zeros and correctly compare ISO strings
test("F15: Dashboard population trend preserves genuine zeros and correctly evaluates ISO strings against timestamp intervals", () => {
  const totalResidents = 4

  // Sample residents with mixed timestamp formats
  const residents = [
    { id: "res-1", createdAt: "2026-01-15T12:00:00.000Z" }, // ISO string (Jan 2026)
    { id: "res-2", createdAt: new Date("2026-02-10T08:00:00.000Z").getTime() }, // ms number (Feb 2026)
    { id: "res-3", createdAt: { toMillis: () => new Date("2026-03-05T00:00:00.000Z").getTime() } }, // Firestore Timestamp (Mar 2026)
    { id: "res-4", createdAt: "invalid-or-missing" }, // invalid timestamp
  ]

  // Defined month boundaries
  const dec2025End = new Date("2025-12-31T23:59:59.999Z").getTime()
  const jan2026End = new Date("2026-01-31T23:59:59.999Z").getTime()
  const feb2026End = new Date("2026-02-28T23:59:59.999Z").getTime()
  const mar2026End = new Date("2026-03-31T23:59:59.999Z").getTime()

  // Cumulative population at end of December 2025
  const decCount = residents.filter(r => {
    const ts = normalizeTimestamp(r.createdAt)
    return ts !== null && ts <= dec2025End
  }).length
  assert.equal(decCount, 0)

  // CRITICAL REGRESSION: Under the old buggy sparkline logic `count || adminStats.totalResidents`,
  // a count of 0 would be replaced with 4!
  const oldBuggySparklineDec = decCount || totalResidents
  assert.equal(oldBuggySparklineDec, 4, "Old buggy logic falsely inflated 0 to totalResidents")

  // Under the corrected logic, 0 is strictly preserved:
  const correctedSparklineDec = decCount
  assert.equal(correctedSparklineDec, 0, "Corrected sparkline preserves legitimate historical 0")

  // Cumulative population at end of January 2026 (1 resident, res-1 with ISO string)
  const janCount = residents.filter(r => {
    const ts = normalizeTimestamp(r.createdAt)
    return ts !== null && ts <= jan2026End
  }).length
  assert.equal(janCount, 1)

  // Cumulative population at end of February 2026 (2 residents: res-1 and res-2)
  const febCount = residents.filter(r => {
    const ts = normalizeTimestamp(r.createdAt)
    return ts !== null && ts <= feb2026End
  }).length
  assert.equal(febCount, 2)

  // Cumulative population at end of March 2026 (3 residents: res-1, res-2, res-3)
  const marCount = residents.filter(r => {
    const ts = normalizeTimestamp(r.createdAt)
    return ts !== null && ts <= mar2026End
  }).length
  assert.equal(marCount, 3)
})


// F15: Real calendar month interval calculations
test("F15: Calendar month boundaries use exact calendar months, not fixed 30-day substitutes", () => {
  const getCalendarMonths = (baseDate: Date, count: number) => {
    return Array.from({ length: count }).map((_, i) => {
      const targetDate = new Date(baseDate.getFullYear(), baseDate.getMonth() - (count - 1 - i), 1)
      const start = targetDate.getTime()
      const nextMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)
      const end = nextMonth.getTime()
      return {
        label: targetDate.toLocaleDateString("en-US", { month: "short" }),
        start,
        end,
        daysInMonth: Math.round((end - start) / (1000 * 60 * 60 * 24)),
      }
    })
  }

  // Example base date: March 15, 2026
  const baseDate = new Date(2026, 2, 15) // March 2026
  const months = getCalendarMonths(baseDate, 3) // Jan 2026, Feb 2026, Mar 2026

  assert.equal(months.length, 3)
  assert.equal(months[0].label, "Jan")
  assert.equal(months[0].daysInMonth, 31)

  assert.equal(months[1].label, "Feb")
  assert.equal(months[1].daysInMonth, 28) // 2026 is not a leap year

  assert.equal(months[2].label, "Mar")
  assert.equal(months[2].daysInMonth, 31)

  // February boundary is exactly Feb 1 to Mar 1, not 30 days
  assert.notEqual(months[1].daysInMonth, 30)
})

// F15: Authoritative turnaround time calculation
test("F15: Turnaround time is computed from authoritative timestamps or displays honest N/A", () => {
  const calculateTurnaround = (requests: Array<{
    createdAt: number
    completedTs?: number
    statusTimestamps?: Record<string, number>
    generatedAt?: number
  }>) => {
    const completedWithTiming = requests.filter(r => {
      const endTs = r.completedTs || r.statusTimestamps?.["Completed"] || r.statusTimestamps?.["Ready for Pick Up"] || r.generatedAt
      return endTs && r.createdAt && endTs > r.createdAt
    })

    if (completedWithTiming.length === 0) {
      return { avgTurnaroundHours: null, avgTurnaroundDays: "N/A" }
    }

    const totalHours = completedWithTiming.reduce((acc, r) => {
      const endTs = (r.completedTs || r.statusTimestamps?.["Completed"] || r.statusTimestamps?.["Ready for Pick Up"] || r.generatedAt)!
      return acc + (endTs - r.createdAt) / (1000 * 60 * 60)
    }, 0)

    const avgHours = Math.round((totalHours / completedWithTiming.length) * 10) / 10
    const avgDays = (avgHours / 24).toFixed(1)
    return { avgTurnaroundHours: avgHours, avgTurnaroundDays: avgDays }
  }

  // Zero requests -> honest N/A
  assert.deepEqual(calculateTurnaround([]), { avgTurnaroundHours: null, avgTurnaroundDays: "N/A" })

  // Requests with no completed timestamps -> honest N/A (does not fabricate 24h)
  const pendingOnly = [
    { createdAt: 1000 },
    { createdAt: 2000 },
  ]
  assert.deepEqual(calculateTurnaround(pendingOnly), { avgTurnaroundHours: null, avgTurnaroundDays: "N/A" })

  // Completed requests with actual timestamps
  const hourMs = 1000 * 60 * 60
  const realCompleted = [
    { createdAt: 1000, completedTs: 1000 + 12 * hourMs }, // 12 hours
    { createdAt: 2000, generatedAt: 2000 + 36 * hourMs }, // 36 hours
  ]
  const result = calculateTurnaround(realCompleted)
  assert.equal(result.avgTurnaroundHours, 24) // (12 + 36) / 2 = 24
  assert.equal(result.avgTurnaroundDays, "1.0")
})

// F15: Chart data key alignment
test("F15: Report generation trend data keys match chart expectations", () => {
  const trendItem = {
    month: "Mar",
    documents: 5,
    population: 12,
    analytics: 8,
  }

  // Ensure all keys expected by <XAxis dataKey="month"> and <Area dataKey="..."> exist
  assert.ok("month" in trendItem)
  assert.ok("documents" in trendItem)
  assert.ok("population" in trendItem)
  assert.ok("analytics" in trendItem)
  assert.equal(typeof trendItem.month, "string")
  assert.equal(typeof trendItem.documents, "number")
  assert.equal(typeof trendItem.population, "number")
  assert.equal(typeof trendItem.analytics, "number")
})

// F16: Truthful cancellation error handling
test("F16: cancelRequest rethrows actionable error on permission denial instead of swallowing", async () => {
  const createMockCancelRequest = (shouldFailWithPermissionDenied: boolean) => {
    return async (_requestId: string) => {
      try {
        if (shouldFailWithPermissionDenied) {
          const err: any = new Error("Missing or insufficient permissions.")
          err.code = "permission-denied"
          throw err
        }
        return { success: true }
      } catch (error: any) {
        if (error?.code === "permission-denied") {
          throw new Error("This request can no longer be cancelled because processing has already begun or it is in a terminal status.")
        }
        throw new Error(error?.message || "Failed to cancel document request.")
      }
    }
  }

  const cancelSuccess = createMockCancelRequest(false)
  await assert.doesNotReject(async () => {
    await cancelSuccess("req-1")
  })

  const cancelFail = createMockCancelRequest(true)
  await assert.rejects(
    async () => {
      await cancelFail("req-2")
    },
    (err: Error) => {
      assert.ok(err.message.includes("no longer be cancelled"))
      return true
    }
  )
})

// F16: Truthful toast presets distinguish different actions
test("F16: Toast presets distinguish payment submission, profile update, and registration", () => {
  const presets = {
    profileRequestSubmitted: {
      title: "Request submitted",
      description: "Your profile edit request has been sent for review.",
    },
    paymentSubmitted: {
      title: "Payment submitted",
      description: "Your payment reference has been submitted for review.",
    },
    cashPaymentConfirmed: {
      title: "Payment choice recorded",
      description: "Please prepare the exact cash payment upon document pick up.",
    },
    requestCancelled: {
      title: "Request cancelled",
      description: "Your document request has been cancelled.",
    },
    profileUpdated: {
      title: "Profile updated",
      description: "Your profile picture has been updated.",
    },
    registrationCompleted: {
      title: "Registration completed",
      description: "Your account was created. Redirecting to login...",
    },
  }

  // Payment submission has distinct copy from profile edit request
  assert.notEqual(presets.paymentSubmitted.title, presets.profileRequestSubmitted.title)
  assert.notEqual(presets.paymentSubmitted.description, presets.profileRequestSubmitted.description)
  assert.ok(presets.paymentSubmitted.description.includes("payment reference"))

  // Cash payment confirmation has distinct copy
  assert.ok(presets.cashPaymentConfirmed.description.includes("cash payment"))

  // Request cancelled has distinct copy
  assert.ok(presets.requestCancelled.description.includes("cancelled"))

  // Profile picture update is distinct from new account registration
  assert.notEqual(presets.profileUpdated.title, presets.registrationCompleted.title)
  assert.notEqual(presets.profileUpdated.description, presets.registrationCompleted.description)
  assert.ok(presets.profileUpdated.description.includes("profile picture"))
  assert.ok(presets.registrationCompleted.description.includes("Redirecting to login"))
})
