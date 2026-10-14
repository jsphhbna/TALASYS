import test from "node:test"
import assert from "node:assert/strict"
import { coordinateIdentityEmailUpdate, type IdentityEmailDependencies, type IdentityEmailOperation } from "../lib/admin/identity-email-operation.ts"

test("reproduce auth compensation race where A overwrites B after ownership check", async () => {
  let authEmail = "old@example.test"
  let firestoreEmail = "old@example.test"
  let activeOwner: string | null = null

  let pauseResolve!: () => void
  const pausePromise = new Promise<void>(resolve => { pauseResolve = resolve })
  let notifyPaused!: () => void
  const aPausedPromise = new Promise<void>(resolve => { notifyPaused = resolve })

  const operationA: IdentityEmailOperation = {
    id: "opA",
    residentId: "resident1",
    actorUid: "adminA",
    actorName: "Admin A",
    attemptId: "attemptA",
    oldEmail: "old@example.test",
    newEmail: "newa@example.test",
    profileUpdates: {},
    status: "auth-pending",
  }

  const operationB: IdentityEmailOperation = {
    id: "opB",
    residentId: "resident1",
    actorUid: "adminB",
    actorName: "Admin B",
    attemptId: "attemptB",
    oldEmail: "newa@example.test",
    newEmail: "newb@example.test",
    profileUpdates: {},
    status: "auth-pending",
  }

  const depsA: IdentityEmailDependencies = {
    async claim() {
      activeOwner = "attemptA"
      return { outcome: "claimed", operation: operationA }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) {
      if (email === operationA.oldEmail) {
        // Pause BEFORE the compensation write lands
        notifyPaused?.()
        await pausePromise
      }
      authEmail = email
    },
    async owns(op) { return activeOwner === op.attemptId },
    async complete() {
      throw new Error("Firestore transient completion failure")
    },
    async authFailed() {},
    async compensated(op) {
      if (activeOwner !== op.attemptId) {
        throw Object.assign(new Error("Stale identity attempt cannot change operation state."), { status: 409 })
      }
    },
    async reconciliationRequired() {},
  }

  const depsB: IdentityEmailDependencies = {
    async claim() {
      activeOwner = "attemptB"
      return { outcome: "claimed", operation: operationB }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) { authEmail = email },
    async owns(op) { return activeOwner === op.attemptId },
    async complete() {
      firestoreEmail = operationB.newEmail
      activeOwner = "completedB"
    },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  let errorA: any = null
  const attemptAPromise = coordinateIdentityEmailUpdate(depsA, {
    operationId: "opA",
    residentId: "resident1",
    newEmail: "newa@example.test",
    actorUid: "adminA",
    attemptId: "attemptA",
    ipAddress: "127.0.0.1",
  }).catch((err: any) => { errorA = err })

  await aPausedPromise

  const resultB = await coordinateIdentityEmailUpdate(depsB, {
    operationId: "opB",
    residentId: "resident1",
    newEmail: "newb@example.test",
    actorUid: "adminB",
    attemptId: "attemptB",
    ipAddress: "127.0.0.1",
  })
  assert.equal(resultB.outcome, "completed")

  pauseResolve?.()
  await attemptAPromise

  assert.ok(errorA, "Attempt A should fail its compensation fence")
  // With the unfenced mock deps, A's compensation write still lands on Auth,
  // creating Auth/Firestore inconsistency. This proves the race exists in
  // an uncoordinated system.
  assert.equal(authEmail, "old@example.test")
  assert.equal(firestoreEmail, "newb@example.test")
  assert.notEqual(authEmail, firestoreEmail, "Auth and Firestore disagree due to stale compensation write!")
})

test("repaired coordinator prevents Attempt B takeover while Attempt A is unresolved in compensation", async () => {
  let authEmail = "old@example.test"
  let residentLock: { operationId: string; attemptId: string; status: string } | null = null

  let pauseResolve!: () => void
  const pausePromise = new Promise<void>(resolve => { pauseResolve = resolve })
  let notifyPaused!: () => void
  const aPausedPromise = new Promise<void>(resolve => { notifyPaused = resolve })

  const operationA: IdentityEmailOperation = {
    id: "opA",
    residentId: "resident1",
    actorUid: "adminA",
    actorName: "Admin A",
    attemptId: "attemptA",
    oldEmail: "old@example.test",
    newEmail: "newa@example.test",
    profileUpdates: {},
    status: "claimed",
  }

  const depsA: IdentityEmailDependencies = {
    async claim() {
      residentLock = { operationId: "opA", attemptId: "attemptA", status: "claimed" }
      return { outcome: "claimed", operation: operationA }
    },
    async getAuthEmail() { return authEmail },
    async beginAuthMutation() {
      if (residentLock) residentLock.status = "auth-mutating"
    },
    async authSucceeded() {
      if (residentLock) residentLock.status = "auth-completed"
    },
    async updateAuthEmail(_uid, email) {
      if (email === operationA.oldEmail) {
        notifyPaused?.()
        await pausePromise
      }
      authEmail = email
    },
    async owns(op) {
      return residentLock?.attemptId === op.attemptId
    },
    async beginCompensation() {
      if (residentLock) residentLock.status = "compensating"
      return true
    },
    async complete() {
      throw new Error("Firestore transient completion failure")
    },
    async authFailed() {},
    async compensated() {
      if (residentLock) residentLock.status = "compensated"
    },
    async reconciliationRequired() {
      if (residentLock) residentLock.status = "reconciliation-required"
    },
  }

  const depsB: IdentityEmailDependencies = {
    async claim() {
      // Repaired boundary: cannot claim while resident lock is active or compensating
      if (residentLock && ["claimed", "auth-mutating", "auth-completed", "compensating"].includes(residentLock.status)) {
        return { outcome: "conflict" }
      }
      return { outcome: "claimed" }
    },
    async getAuthEmail() { return authEmail },
    async updateAuthEmail(_uid, email) { authEmail = email },
    async owns() { return true },
    async complete() {},
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  // 1. Start Attempt A
  const attemptAPromise = coordinateIdentityEmailUpdate(depsA, {
    operationId: "opA",
    residentId: "resident1",
    newEmail: "newa@example.test",
    actorUid: "adminA",
    attemptId: "attemptA",
    ipAddress: "127.0.0.1",
  }).catch((err: any) => err)

  // 2. Wait until A is paused in compensation
  await aPausedPromise
  assert.equal(authEmail, "newa@example.test")
  assert.equal((residentLock as any)?.status, "compensating")

  // 3. Attempt B tries to claim ownership while A is compensating: REJECTED!
  await assert.rejects(
    coordinateIdentityEmailUpdate(depsB, {
      operationId: "opB",
      residentId: "resident1",
      newEmail: "newb@example.test",
      actorUid: "adminB",
      attemptId: "attemptB",
      ipAddress: "127.0.0.1",
    }),
    (err: any) => err.status === 409
  )

  // 4. Release A
  pauseResolve?.()
  const errorA = await attemptAPromise
  assert.equal(errorA?.status, 503)

  // 5. Auth is safely restored to old value without overwriting any competing attempt
  assert.equal(authEmail, "old@example.test")
  // No firestoreEmail variable in this test — Firestore completion was never called.
  // The lock reflects a terminal compensation state, and Auth/Firestore remain at old.
})
