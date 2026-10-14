import test from "node:test"
import assert from "node:assert/strict"
import { collectCursorPages } from "../lib/firestore-pagination.ts"

test("cursor pagination returns old queue entries beyond 200 without truncating totals", async () => {
  const source = Array.from({ length: 251 }, (_, index) => ({ id: index, status: index === 250 ? "Pending" : "Completed" }))
  const result = await collectCursorPages(async (cursor, size) => {
    const start = cursor === null ? 0 : Number(cursor)
    const items = source.slice(start, start + size)
    return { items, nextCursor: start + items.length < source.length ? start + items.length : null }
  }, 200)
  assert.equal(result.length, 251)
  assert.equal(result.filter(item => item.status === "Pending").length, 1)
  assert.equal(result.at(-1)?.id, 250)
})

test("cursor pagination returns complete audit history and old report periods beyond 500", async () => {
  const source = Array.from({ length: 621 }, (_, index) => ({ id: index, year: index >= 600 ? 2024 : 2026 }))
  const result = await collectCursorPages(async (cursor, size) => {
    const start = cursor === null ? 0 : Number(cursor)
    const items = source.slice(start, start + size)
    return { items, nextCursor: start + items.length < source.length ? start + items.length : null }
  }, 250)
  assert.equal(result.length, 621)
  assert.equal(result.filter(item => item.year === 2024).length, 21)
})
