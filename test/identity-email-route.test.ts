import test from "node:test"
import assert from "node:assert/strict"
import { createUpdateResidentEmailHandler } from "../app/api/admin/update-resident-email/route.ts"
import type { IdentityEmailDependencies, IdentityEmailOperation } from "../lib/admin/identity-email-operation.ts"

const operation: IdentityEmailOperation = { id: "op", residentId: "resident", actorUid: "admin", actorName: "Admin", attemptId: "attempt", oldEmail: "old@example.test", newEmail: "new@example.test", profileUpdates: {}, status: "auth-pending" }
const auth: any = { verifyIdToken: async (_token: string, revoked: boolean) => { assert.equal(revoked, true); return { uid: "admin" } } }
function deps(claim: IdentityEmailDependencies["claim"]): IdentityEmailDependencies {
  return { claim, getAuthEmail: async () => operation.oldEmail, updateAuthEmail: async () => {}, owns: async () => true, complete: async () => {}, authFailed: async () => {}, compensated: async () => {}, reconciliationRequired: async () => {} }
}
function request(body: any = {}) { return new Request("http://localhost/api/admin/update-resident-email", { method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json" }, body: JSON.stringify({ residentId: "resident", newEmail: operation.newEmail, operationId: "op", attemptId: "attempt", ...body }) }) }

test("legacy identity route delegates to durable coordinator", async () => {
  const handler = createUpdateResidentEmailHandler({ auth, dependencies: deps(async input => {
    assert.equal(input.operationId, "op")
    return { outcome: "claimed", operation }
  }) })
  assert.equal((await handler(request())).status, 200)
})

test("identity route rejects server-managed profile fields before coordinator", async () => {
  let claimed = false
  const handler = createUpdateResidentEmailHandler({ auth, dependencies: deps(async () => { claimed = true; return { outcome: "claimed", operation } }) })
  assert.equal((await handler(request({ profileUpdates: { role: "superadmin" } }))).status, 400)
  assert.equal(claimed, false)
})

test("authorization denial from persisted claim is exposed and no Auth change occurs", async () => {
  let authChanged = false
  const dependencies = deps(async () => { throw Object.assign(new Error("Verification Only cannot edit identities"), { status: 403 }) })
  dependencies.updateAuthEmail = async () => { authChanged = true }
  const handler = createUpdateResidentEmailHandler({ auth, dependencies })
  assert.equal((await handler(request())).status, 403)
  assert.equal(authChanged, false)
})
