import test from "node:test"
import assert from "node:assert/strict"
import {
  callRegistrationFinalizer,
  completeFreshRegistration,
  RegistrationFinalizationError,
  type RegistrationFinalizationPayload,
} from "../lib/resident/registration-finalization-client.ts"

const payload: RegistrationFinalizationPayload = {
  operationId: "12345678-1234-4234-8234-123456789abc",
  resident: {
    firstName: "Juan",
    lastName: "Dela Cruz",
    email: "juan@example.test",
    gender: "Male",
    dateOfBirth: "1990-01-01",
    contactNumber: "09171234567",
    street: "1 Main Street",
    barangay: "634",
    city: "Manila",
    statuses: ["Adult"],
  },
  proofs: [{ name: "Valid Government ID", filename: "id.jpg", url: "protected", claimToken: "secret" }],
}

test("lost finalization response retries the exact operation and never triggers Auth deletion", async () => {
  const observedBodies: string[] = []
  let calls = 0
  let deletes = 0
  let emails = 0
  const result = await completeFreshRegistration({
    finalize: () => callRegistrationFinalizer(async (_input, init) => {
      calls++
      observedBodies.push(String(init?.body))
      if (calls === 1) throw new TypeError("response connection lost after commit")
      return Response.json({ success: true, committed: true, idempotent: true, operationId: payload.operationId })
    }, "id-token", payload),
    deleteFreshAuth: async () => { deletes++ },
    sendVerificationEmail: async () => { emails++ },
    signOut: async () => {},
  })
  assert.equal(calls, 2)
  assert.equal(new Set(observedBodies).size, 1)
  assert.equal(deletes, 0)
  assert.equal(emails, 1)
  assert.equal(result.verificationEmailSent, true)
})

test("definitive pre-commit rejection permits fresh Auth cleanup", async () => {
  let deletes = 0
  await assert.rejects(
    () => completeFreshRegistration({
      finalize: () => callRegistrationFinalizer(async () => Response.json({
        success: false,
        committed: false,
        code: "PROOF_CAPABILITY_INVALID",
        error: "invalid proof",
      }, { status: 403 }), "id-token", payload),
      deleteFreshAuth: async () => { deletes++ },
      sendVerificationEmail: async () => assert.fail("email must not be sent"),
      signOut: async () => assert.fail("must not sign out through success path"),
    }),
    (error: unknown) => error instanceof RegistrationFinalizationError && error.outcome === "definitive",
  )
  assert.equal(deletes, 1)
})

test("ambiguous exhaustion preserves Auth and email failure does not undo finalized registration", async () => {
  let deletes = 0
  await assert.rejects(
    () => completeFreshRegistration({
      finalize: () => callRegistrationFinalizer(async () => { throw new TypeError("offline") }, "id-token", payload, { maxAttempts: 2 }),
      deleteFreshAuth: async () => { deletes++ },
      sendVerificationEmail: async () => assert.fail("email must not run without confirmation"),
      signOut: async () => {},
    }),
    (error: unknown) => error instanceof RegistrationFinalizationError && error.outcome === "ambiguous",
  )
  assert.equal(deletes, 0)

  let emails = 0
  const completed = await completeFreshRegistration({
    finalize: async () => {},
    deleteFreshAuth: async () => { deletes++ },
    sendVerificationEmail: async () => { emails++; throw new Error("mail unavailable") },
    signOut: async () => {},
  })
  assert.equal(emails, 1)
  assert.equal(deletes, 0)
  assert.equal(completed.verificationEmailSent, false)
})

test("server-reported unknown commit outcome is retried and never authorizes Auth cleanup", async () => {
  let calls = 0
  let deletes = 0
  await assert.rejects(
    () => completeFreshRegistration({
      finalize: () => callRegistrationFinalizer(async () => {
        calls++
        return Response.json({
          success: false,
          committed: "unknown",
          code: "FINALIZATION_COMMIT_UNKNOWN",
          error: "commit acknowledgement was lost",
        }, { status: 503 })
      }, "id-token", payload, { maxAttempts: 2 }),
      deleteFreshAuth: async () => { deletes++ },
      sendVerificationEmail: async () => {},
      signOut: async () => {},
    }),
    (error: unknown) => error instanceof RegistrationFinalizationError && error.outcome === "ambiguous",
  )
  assert.equal(calls, 2)
  assert.equal(deletes, 0)
})
