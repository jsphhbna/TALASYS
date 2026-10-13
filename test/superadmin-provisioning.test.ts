import test from "node:test"
import assert from "node:assert/strict"
import { provisionSuperAdmin, type ProvisioningAdapter } from "../scripts/seed-superadmin.ts"

function fixture(options: { existing?: boolean; finalizeFailure?: boolean; deleteFailure?: boolean } = {}) {
  const calls: string[] = []
  let profile: Record<string, unknown> | null = options.existing ? { name: "Existing Name", contactNumber: "09990000000", address: "Existing Address", role: "resident" } : null
  const adapter: ProvisioningAdapter = {
    projectId: "fixture",
    async findAuthUser() { calls.push("find"); return options.existing ? { uid: "existing", displayName: "Existing Name" } : null },
    async createAuthUser() { calls.push("create-auth"); return { uid: "new" } },
    async updateAuthUser() { calls.push("update-auth") },
    async deleteAuthUser() { calls.push("delete-auth"); if (options.deleteFailure) throw new Error("delete failed") },
    async readProfile() { calls.push("read-profile"); return profile },
    async recordIntent() { calls.push("intent") },
    async finalize(input) { calls.push("finalize"); if (options.finalizeFailure) throw new Error("firestore failed"); profile = input.profile || profile },
    async recordFailure(_id, _message, compensated) { calls.push(`failure:${compensated}`) },
  }
  return { adapter, calls, get profile() { return profile } }
}

test("creates a new super admin through an intent and atomic finalization", async () => {
  const state = fixture()
  const result = await provisionSuperAdmin(state.adapter, { email: "new@example.test", password: "correct horse battery", operatorId: "operator", operationId: "op", now: () => 1 })
  assert.equal(result.created, true)
  assert.deepEqual(state.calls, ["find", "intent", "create-auth", "read-profile", "finalize"])
  assert.equal(state.profile?.role, "superadmin")
  assert.equal("contactNumber" in state.profile!, false)
})

test("existing account without explicit modification flags performs no writes", async () => {
  const state = fixture({ existing: true })
  await assert.rejects(() => provisionSuperAdmin(state.adapter, { email: "existing@example.test", password: "correct horse battery", operatorId: "operator" }), /No changes made/)
  assert.deepEqual(state.calls, ["find"])
})

test("explicit promotion preserves existing profile fields and does not reset password", async () => {
  const state = fixture({ existing: true })
  const result = await provisionSuperAdmin(state.adapter, { email: "existing@example.test", promoteExisting: true, operatorId: "operator", operationId: "op", now: () => 1 })
  assert.equal(result.passwordReset, false)
  assert.equal(state.calls.includes("update-auth"), false)
  assert.equal(state.profile?.contactNumber, "09990000000")
  assert.equal(state.profile?.address, "Existing Address")
  assert.equal(state.profile?.role, "superadmin")
})

test("Firestore failure after new Auth creation compensates by deleting Auth", async () => {
  const state = fixture({ finalizeFailure: true })
  await assert.rejects(() => provisionSuperAdmin(state.adapter, { email: "new@example.test", password: "correct horse battery", operatorId: "operator", operationId: "op" }), /requires no Auth cleanup/)
  assert.ok(state.calls.includes("delete-auth"))
  assert.ok(state.calls.includes("failure:true"))
})

test("failed compensation leaves durable reconciliation-required state", async () => {
  const state = fixture({ finalizeFailure: true, deleteFailure: true })
  await assert.rejects(() => provisionSuperAdmin(state.adapter, { email: "new@example.test", password: "correct horse battery", operatorId: "operator", operationId: "op" }), /requires reconciliation/)
  assert.ok(state.calls.includes("failure:false"))
})
