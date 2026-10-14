import { test } from "node:test"
import assert from "node:assert/strict"
import { describeDataLoadError } from "../lib/admin/data-load-error-state.ts"

test("A18 data error distinguishes stale data from an empty result", () => {
  assert.deepEqual(describeDataLoadError("permission-denied", true), {
    title: "Some data could not be refreshed",
    detail: "permission-denied Previously loaded sources remain visible.",
  })
})

test("A18 total failure is not presented as an empty result", () => {
  assert.deepEqual(describeDataLoadError("offline", false), {
    title: "Data failed to load",
    detail: "offline",
  })
})
