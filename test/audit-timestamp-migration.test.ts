import test from "node:test"
import assert from "node:assert/strict"
import { migrateAuditTimestamps, normalizeAuditTimestamp, type AuditRecord, type AuditTimestampUpdate } from "../scripts/migrate-audit-timestamps.ts"

function adapter(records: AuditRecord[], failCommit = 0) {
  const writes: AuditTimestampUpdate[][] = []
  let commits = 0
  return {
    projectId: "fixture-project",
    writes,
    async readPage({ startAfter, limit }: { startAfter?: string; limit: number }) {
      const start = startAfter ? records.findIndex(record => record.id === startAfter) + 1 : 0
      return records.slice(start, start + limit)
    },
    async commit(updates: AuditTimestampUpdate[]) {
      commits++
      if (failCommit && commits === failCommit) throw new Error("injected failure")
      writes.push(structuredClone(updates))
      for (const update of updates) {
        const record = records.find(item => item.id === update.id)!
        record.timestamp = update.timestamp
        record.migrationHistory = { ...(record.migrationHistory || {}), auditTimestampV1: update.history }
      }
    },
  }
}

test("conversion policy normalizes supported formats and rejects invalid values", () => {
  assert.deepEqual(normalizeAuditTimestamp("1700000000"), { ok: true, milliseconds: 1700000000000, kind: "numeric-epoch-seconds" })
  assert.equal(normalizeAuditTimestamp("2024-01-02T03:04:05Z").ok, true)
  assert.deepEqual(normalizeAuditTimestamp(1700000000000), { ok: false, reason: "already-normalized" })
  assert.deepEqual(normalizeAuditTimestamp("not-a-date"), { ok: false, reason: "unparseable-string" })
})

test("dry-run reads canonical records and performs zero writes", async () => {
  const fixture = adapter([{ id: "a", timestamp: "1700000000" }])
  const result = await migrateAuditTimestamps({ adapter: fixture })
  assert.equal(result.collection, "activityLogs")
  assert.equal(result.eligible, 1)
  assert.equal(result.written, 0)
  assert.equal(fixture.writes.length, 0)
})

test("more than 400 records use fresh chunks and rerun idempotently", async () => {
  const records = Array.from({ length: 805 }, (_, index) => ({ id: String(index).padStart(4, "0"), timestamp: "1700000000" }))
  const fixture = adapter(records)
  const first = await migrateAuditTimestamps({ adapter: fixture, commit: true })
  assert.equal(first.written, 805)
  assert.deepEqual(fixture.writes.map(chunk => chunk.length), [400, 400, 5])
  const second = await migrateAuditTimestamps({ adapter: fixture, commit: true })
  assert.equal(second.written, 0)
  assert.equal(second.skipped["already-normalized"], 805)
})

test("invalid values are skipped with explicit reasons", async () => {
  const fixture = adapter([{ id: "a", timestamp: "bad" }, { id: "b", timestamp: null }, { id: "c", timestamp: 1700000000000 }])
  const result = await migrateAuditTimestamps({ adapter: fixture, commit: true })
  assert.deepEqual(result.skipped, { "unparseable-string": 1, "missing-or-unsupported": 1, "already-normalized": 1 })
})

test("partial commit failure exposes progress and rejects", async () => {
  const records = Array.from({ length: 450 }, (_, index) => ({ id: String(index).padStart(4, "0"), timestamp: "1700000000" }))
  const fixture = adapter(records, 2)
  await assert.rejects(
    () => migrateAuditTimestamps({ adapter: fixture, commit: true }),
    (error: Error & { partialResult?: { written: number; committedChunks: number } }) => {
      assert.equal(error.partialResult?.written, 400)
      assert.equal(error.partialResult?.committedChunks, 1)
      return true
    },
  )
})
