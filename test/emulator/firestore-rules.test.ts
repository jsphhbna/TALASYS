import { after, before, test } from "node:test"
import { readFile } from "node:fs/promises"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore"

let environment: RulesTestEnvironment

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "talasys-rules-test",
    firestore: {
      rules: await readFile("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  })

  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const users = [
      ["resident", { role: "resident", status: "Active", isVerified: true }],
      ["locked", { role: "resident", status: "Locked", isVerified: true }],
      ["viewer", { role: "View Only", status: "Active" }],
      ["verifier", { role: "Verification Only", status: "Active" }],
      ["processor", { role: "Document Processing", status: "Active" }],
    ] as const
    for (const [id, data] of users) await setDoc(doc(db, "users", id), data)
    await setDoc(doc(db, "verifications", "pending"), {
      residentId: "resident",
      status: "pending",
      type: "registration",
    })
    await setDoc(doc(db, "documentRequests", "existing"), {
      residentId: "resident",
      status: "Pending",
      paymentStatus: "not_required",
    })
  })
})

after(async () => environment?.cleanup())

test("unauthenticated and locked clients cannot read resident records", async () => {
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users", "resident")))
  await assertFails(getDoc(doc(environment.authenticatedContext("locked").firestore(), "users", "locked")))
})

test("View Only cannot mutate users, requests, or verifications", async () => {
  const db = environment.authenticatedContext("viewer").firestore()
  await assertFails(updateDoc(doc(db, "users", "resident"), { contactNumber: "tampered" }))
  await assertFails(updateDoc(doc(db, "documentRequests", "existing"), { status: "Approved" }))
  await assertFails(updateDoc(doc(db, "verifications", "pending"), { status: "approved" }))
})

test("resident direct request creation and forged fee fields are denied", async () => {
  const db = environment.authenticatedContext("resident").firestore()
  await assertFails(setDoc(doc(db, "documentRequests", "forged"), {
    residentId: "resident",
    documentType: "Clearance",
    amount: 0,
    feeWaived: true,
    status: "Pending",
  }))
})

test("specialized roles are limited to their assigned mutation scope", async () => {
  const verifierDb = environment.authenticatedContext("verifier").firestore()
  await assertSucceeds(updateDoc(doc(verifierDb, "verifications", "pending"), { status: "approved" }))
  await assertFails(updateDoc(doc(verifierDb, "documentRequests", "existing"), { status: "Approved" }))

  const processorDb = environment.authenticatedContext("processor").firestore()
  await assertSucceeds(updateDoc(doc(processorDb, "documentRequests", "existing"), { status: "Approved" }))
  await assertFails(updateDoc(doc(processorDb, "verifications", "pending"), { status: "rejected" }))
})

test("clients cannot write authoritative audit evidence or telemetry", async () => {
  const db = environment.authenticatedContext("verifier").firestore()
  await assertFails(setDoc(doc(db, "activityLogs", "forged"), { action: "Approved" }))
  await assertFails(setDoc(doc(db, "clientTelemetry", "forged"), { event: "fake" }))
})
