import test from "node:test"
import assert from "node:assert/strict"
import { claimRegistrationMedia } from "../lib/resident/media-claim-client.ts"

const claims = [{ mediaUrl: "https://example.test/proof", claimToken: "capability" }]

test("registration caller accepts only an HTTP success that confirms every requested claim", async () => {
  let observedAuthorization = ""
  await claimRegistrationMedia(async (_input, init) => {
    observedAuthorization = new Headers(init?.headers).get("authorization") || ""
    return Response.json({ success: true, requestedCount: 1, claimedCount: 1 })
  }, "resident-token", claims)
  assert.equal(observedAuthorization, "Bearer resident-token")
})

test("registration caller rejects HTTP errors and incomplete claim counts", async () => {
  await assert.rejects(
    () => claimRegistrationMedia(async () => Response.json({ error: "expired" }, { status: 410 }), "token", claims),
    /expired/,
  )
  await assert.rejects(
    () => claimRegistrationMedia(async () => Response.json({ success: true, requestedCount: 1, claimedCount: 0 }), "token", claims),
    /could not be confirmed/,
  )
})
