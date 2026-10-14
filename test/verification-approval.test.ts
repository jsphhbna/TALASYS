import test from "node:test"
import assert from "node:assert/strict"
import { coordinateVerificationApproval, type ApprovalCoordinatorDependencies, type ApprovalOperation, type VerificationType } from "../lib/admin/verification-approval.ts"

function operation(type: VerificationType, email = false): ApprovalOperation {
  return { id: `v-${type}`, verificationId: `v-${type}`, residentId: "resident", verificationType: type, actorUid: "admin", actorName: "Admin", attemptId: "attempt", oldEmail: email ? "old@example.test" : undefined, newEmail: email ? "new@example.test" : undefined, profileUpdates: {}, status: "auth-pending" }
}

function fixture(options: { type?: VerificationType; claim?: "claimed" | "completed" | "conflict"; authEmail?: string; authFailure?: boolean; completeFailure?: boolean; compensationFailure?: boolean } = {}) {
  const calls: string[] = []
  let authEmail = options.authEmail || "old@example.test"
  const op = operation(options.type || "registration", true)
  const deps: ApprovalCoordinatorDependencies = {
    async claim() { calls.push("claim"); return { outcome: options.claim || "claimed", operation: (options.claim || "claimed") === "claimed" ? op : undefined } },
    async getAuthEmail() { calls.push("get-auth"); return authEmail },
    async updateAuthEmail(_uid, email) { calls.push(`auth:${email}`); if (options.authFailure && email === "new@example.test") throw new Error("auth down"); if (options.compensationFailure && email === "old@example.test") throw new Error("compensation down"); authEmail = email },
    async owns() { calls.push("owns"); return true },
    async complete() { calls.push("complete"); if (options.completeFailure) throw new Error("firestore down") },
    async authFailed() { calls.push("auth-failed") },
    async reconciliationRequired() { calls.push("reconciliation") },
    async compensated() { calls.push("compensated") },
  }
  return { deps, calls, get authEmail() { return authEmail } }
}

for (const type of ["registration", "profile-edit", "reactivation"] as const) {
  test(`${type} approval completes through coordinated operation`, async () => {
    const state = fixture({ type })
    const result = await coordinateVerificationApproval(state.deps, { verificationId: `v-${type}`, actorUid: "admin", attemptId: "attempt", ipAddress: "127.0.0.1", now: () => 1 })
    assert.equal(result.outcome, "completed")
    assert.ok(state.calls.includes("complete"))
  })
}

test("concurrent claim conflict performs no Auth or completion mutation", async () => {
  const state = fixture({ claim: "conflict" })
  await assert.rejects(() => coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "other", ipAddress: "", now: () => 1 }), (error: any) => error.status === 409)
  assert.deepEqual(state.calls, ["claim"])
})

test("Auth failure returns verification to retryable state and never completes", async () => {
  const state = fixture({ authFailure: true })
  await assert.rejects(() => coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "a", ipAddress: "", now: () => 1 }), /not approved/)
  assert.ok(state.calls.includes("auth-failed"))
  assert.equal(state.calls.includes("complete"), false)
})

test("Firestore failure after Auth is compensated", async () => {
  const state = fixture({ completeFailure: true })
  await assert.rejects(() => coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "a", ipAddress: "", now: () => 1 }), /Auth email was restored/)
  assert.equal(state.authEmail, "old@example.test")
  assert.ok(state.calls.includes("compensated"))
})

test("failed compensation records reconciliation-required", async () => {
  const state = fixture({ completeFailure: true, compensationFailure: true })
  await assert.rejects(() => coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "a", ipAddress: "", now: () => 1 }), /requires reconciliation/)
  assert.ok(state.calls.includes("reconciliation"))
})

test("retry accepts Auth already at intended email and completes without duplicate Auth mutation", async () => {
  const state = fixture({ authEmail: "new@example.test" })
  await coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "retry", ipAddress: "", now: () => 1 })
  assert.equal(state.calls.some(call => call.startsWith("auth:")), false)
  assert.equal(state.calls.filter(call => call === "complete").length, 1)
})

test("already completed operation is idempotent", async () => {
  const state = fixture({ claim: "completed" })
  const result = await coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "retry", ipAddress: "", now: () => 1 })
  assert.equal(result.idempotent, true)
  assert.deepEqual(state.calls, ["claim"])
})

test("stale approval attempt cannot compensate a newer owner", async () => {
  const state = fixture({ completeFailure: true })
  state.deps.owns = async () => false
  await assert.rejects(() => coordinateVerificationApproval(state.deps, { verificationId: "v", actorUid: "admin", attemptId: "a", ipAddress: "", now: () => 1 }), (error: any) => error.status === 409)
  assert.equal(state.authEmail, "new@example.test")
  assert.equal(state.calls.includes("compensated"), false)
})
