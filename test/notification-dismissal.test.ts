import test from "node:test"
import assert from "node:assert/strict"
import {
  chunkNotificationIds,
  notificationDismissalDocumentId,
  NOTIFICATION_WRITE_BATCH_SIZE,
} from "../lib/notifications/notification-dismissal.ts"

test("notification dismissal batches are bounded and de-duplicate retries", () => {
  const ids = Array.from({ length: NOTIFICATION_WRITE_BATCH_SIZE + 1 }, (_, index) => `notification-${index}`)
  ids.push("notification-0")

  const batches = chunkNotificationIds(ids)
  assert.equal(batches.length, 2)
  assert.equal(batches[0].length, NOTIFICATION_WRITE_BATCH_SIZE)
  assert.equal(batches[1].length, 1)
  assert.equal(new Set(batches.flat()).size, NOTIFICATION_WRITE_BATCH_SIZE + 1)
})

test("notification dismissal IDs bind the user and source notification", () => {
  assert.equal(
    notificationDismissalDocumentId("staff-a", "notification-1"),
    "staff-a_notification-1",
  )
  assert.notEqual(
    notificationDismissalDocumentId("staff-a", "notification-1"),
    notificationDismissalDocumentId("staff-b", "notification-1"),
  )
})

test("notification dismissal batching rejects invalid sizes", () => {
  assert.throws(() => chunkNotificationIds(["one"], 0), /positive integer/)
})
