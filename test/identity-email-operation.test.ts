import test from "node:test"
import assert from "node:assert/strict"
import { coordinateIdentityEmailUpdate, type IdentityEmailDependencies, type IdentityEmailOperation } from "../lib/admin/identity-email-operation.ts"

function fixture(options: { authEmail?: string; authFailure?: boolean; completeFailure?: boolean; completeConflict?: boolean; compensationFailure?: boolean; owns?: boolean; claim?: "claimed" | "completed" | "conflict" } = {}) {
  const calls: string[] = []
  let authEmail = options.authEmail || "old@example.test"
  const operation: IdentityEmailOperation = { id: "op", residentId: "resident", actorUid: "admin", actorName: "Admin", attemptId: "attempt", oldEmail: "old@example.test", newEmail: "new@example.test", profileUpdates: { contactNumber: "123" }, status: "auth-pending" }
  const deps: IdentityEmailDependencies = {
    async claim() { calls.push("claim"); return { outcome: options.claim || "claimed", operation: (options.claim || "claimed") === "claimed" ? operation : undefined } },
    async getAuthEmail() { calls.push("get-auth"); return authEmail },
    async updateAuthEmail(_uid, email) { calls.push(`auth:${email}`); if (options.authFailure && email === operation.newEmail) throw new Error("auth down"); if (options.compensationFailure && email === operation.oldEmail) throw new Error("restore down"); authEmail = email },
    async owns() { calls.push("owns"); return options.owns !== false },
    async complete() { calls.push("complete"); if (options.completeConflict) throw Object.assign(new Error("resident changed"), { status: 409 }); if (options.completeFailure) throw new Error("firestore down") },
    async authFailed() { calls.push("auth-failed") },
    async compensated() { calls.push("compensated") },
    async reconciliationRequired() { calls.push("reconciliation") },
  }
  return { deps, calls, get authEmail() { return authEmail } }
}

const input = { operationId: "op", residentId: "resident", newEmail: "new@example.test", profileUpdates: { contactNumber: "123" }, actorUid: "admin", attemptId: "attempt", ipAddress: "127.0.0.1", now: () => 1 }

test("identity coordinator records intent before Auth and completes", async () => {
  const state = fixture()
  assert.equal((await coordinateIdentityEmailUpdate(state.deps, input)).outcome, "completed")
  assert.deepEqual(state.calls.slice(0, 4), ["claim", "get-auth", "auth:new@example.test", "complete"])
})

test("retry completes when Auth already has intended email without repeating mutation", async () => {
  const state = fixture({ authEmail: "new@example.test" })
  await coordinateIdentityEmailUpdate(state.deps, input)
  assert.equal(state.calls.some(call => call.startsWith("auth:")), false)
  assert.ok(state.calls.includes("complete"))
})

test("Auth failure is retryable and Firestore completion is not attempted", async () => {
  const state = fixture({ authFailure: true })
  await assert.rejects(coordinateIdentityEmailUpdate(state.deps, input), /no Firestore profile change/)
  assert.ok(state.calls.includes("auth-failed"))
  assert.equal(state.calls.includes("complete"), false)
})

test("Firestore failure compensates Auth only while the attempt still owns the fence", async () => {
  const state = fixture({ completeFailure: true })
  await assert.rejects(coordinateIdentityEmailUpdate(state.deps, input), /Auth was restored/)
  assert.equal(state.authEmail, "old@example.test")
  assert.ok(state.calls.includes("compensated"))

  const stale = fixture({ completeFailure: true, owns: false })
  await assert.rejects(coordinateIdentityEmailUpdate(stale.deps, input), (error: any) => error.status === 409)
  assert.equal(stale.authEmail, "new@example.test")
  assert.equal(stale.calls.includes("compensated"), false)
})

test("failed compensation is persisted as reconciliation-required", async () => {
  const state = fixture({ completeFailure: true, compensationFailure: true })
  await assert.rejects(coordinateIdentityEmailUpdate(state.deps, input), /requires reconciliation/)
  assert.ok(state.calls.includes("reconciliation"))
})

test("owned finalization conflict becomes reconciliation-required instead of leaving silent drift", async () => {
  const state = fixture({ completeConflict: true })
  await assert.rejects(coordinateIdentityEmailUpdate(state.deps, input), /reconciliation is required/)
  assert.ok(state.calls.includes("reconciliation"))
  assert.equal(state.calls.includes("compensated"), false)
})

test("completed operation is idempotent", async () => {
  const state = fixture({ claim: "completed" })
  assert.equal((await coordinateIdentityEmailUpdate(state.deps, input)).idempotent, true)
  assert.deepEqual(state.calls, ["claim"])
})
