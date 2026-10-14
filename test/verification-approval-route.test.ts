import test from "node:test"
import assert from "node:assert/strict"
import { createApproveVerificationHandler } from "../app/api/admin/verifications/approve/route.ts"
import type { ApprovalCoordinatorDependencies } from "../lib/admin/verification-approval.ts"

const operation = { id: "v", verificationId: "v", residentId: "r", verificationType: "registration" as const, actorUid: "admin", actorName: "Admin", attemptId: "a", profileUpdates: {}, status: "auth-pending" as const }
function dependencies(claim: ApprovalCoordinatorDependencies["claim"]): ApprovalCoordinatorDependencies {
  return { claim, getAuthEmail: async () => undefined, updateAuthEmail: async () => {}, owns: async () => true, complete: async () => {}, authFailed: async () => {}, reconciliationRequired: async () => {}, compensated: async () => {} }
}
const auth: any = { verifyIdToken: async (token: string, revoked: boolean) => { assert.equal(revoked, true); if (token === "bad") throw new Error("bad"); return { uid: "admin" } } }

function request(token = "ok", body: any = { verificationId: "v", attemptId: "a" }) {
  return new Request("http://localhost/api/admin/verifications/approve", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
}

test("real route handler returns success with controlled coordinator", async () => {
  const handler = createApproveVerificationHandler({ auth, dependencies: dependencies(async () => ({ outcome: "claimed", operation })), uuid: () => "uuid" })
  const response = await handler(request())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).success, true)
})

test("real route handler rejects invalid/revoked authentication", async () => {
  const handler = createApproveVerificationHandler({ auth, dependencies: dependencies(async () => ({ outcome: "claimed", operation })) })
  const response = await handler(request("bad"))
  assert.equal(response.status, 401)
})

test("real route handler exposes authorization denial and concurrency conflict", async () => {
  const forbidden = createApproveVerificationHandler({ auth, dependencies: dependencies(async () => { throw Object.assign(new Error("Caller is locked"), { status: 403 }) }) })
  assert.equal((await forbidden(request())).status, 403)
  const conflict = createApproveVerificationHandler({ auth, dependencies: dependencies(async () => ({ outcome: "conflict" })) })
  assert.equal((await conflict(request())).status, 409)
})

test("real route handler returns actionable incomplete state", async () => {
  const deps = dependencies(async () => ({ outcome: "claimed", operation }))
  deps.complete = async () => { throw new Error("firestore unavailable") }
  const handler = createApproveVerificationHandler({ auth, dependencies: deps })
  const response = await handler(request())
  const body = await response.json()
  assert.equal(response.status, 503)
  assert.equal(body.operationIncomplete, true)
})
