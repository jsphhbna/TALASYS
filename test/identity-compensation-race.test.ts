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
      console.log("[depsA] claim called")
      activeOwner = "attemptA"
      return { outcome: "claimed", operation: operationA }
    },
    async getAuthEmail() {
      console.log("[depsA] getAuthEmail returning", authEmail)
      return authEmail
    },
    async updateAuthEmail(_uid, email) {
      console.log("[depsA] updateAuthEmail called with", email)
      if (email === operationA.oldEmail) {
        console.log("[depsA] pausing before compensation write")
        notifyPaused?.()
        await pausePromise
        console.log("[depsA] unpaused from compensation pause")
      }
      authEmail = email
    },
    async owns(op) {
      console.log("[depsA] owns called for", op.attemptId, "activeOwner is", activeOwner)
      return activeOwner === op.attemptId
    },
    async complete() {
      console.log("[depsA] complete called - throwing transient failure")
      throw new Error("Firestore transient completion failure")
    },
    async authFailed() {
      console.log("[depsA] authFailed called")
    },
    async compensated(op) {
      console.log("[depsA] compensated called for", op.attemptId, "activeOwner is", activeOwner)
      if (activeOwner !== op.attemptId) {
        throw Object.assign(new Error("Stale identity attempt cannot change operation state."), { status: 409 })
      }
    },
    async reconciliationRequired() {
      console.log("[depsA] reconciliationRequired called")
    },
  }

  const depsB: IdentityEmailDependencies = {
    async claim() {
      console.log("[depsB] claim called")
      activeOwner = "attemptB"
      return { outcome: "claimed", operation: operationB }
    },
    async getAuthEmail() {
      console.log("[depsB] getAuthEmail returning", authEmail)
      return authEmail
    },
    async updateAuthEmail(_uid, email) {
      console.log("[depsB] updateAuthEmail called with", email)
      authEmail = email
    },
    async owns(op) {
      console.log("[depsB] owns called for", op.attemptId, "activeOwner is", activeOwner)
      return activeOwner === op.attemptId
    },
    async complete() {
      console.log("[depsB] complete called")
      firestoreEmail = operationB.newEmail
      activeOwner = "completedB"
    },
    async authFailed() {},
    async compensated() {},
    async reconciliationRequired() {},
  }

  console.log("Starting Attempt A...")
  let errorA: any = null
  const attemptAPromise = coordinateIdentityEmailUpdate(depsA, {
    operationId: "opA",
    residentId: "resident1",
    newEmail: "newa@example.test",
    actorUid: "adminA",
    attemptId: "attemptA",
    ipAddress: "127.0.0.1",
  }).catch((err: any) => {
    console.log("Attempt A caught error:", err?.message, err?.status)
    errorA = err
  })

  console.log("Waiting for A to pause...")
  await aPausedPromise
  console.log("A is paused! Running Attempt B...")

  const resultB = await coordinateIdentityEmailUpdate(depsB, {
    operationId: "opB",
    residentId: "resident1",
    newEmail: "newb@example.test",
    actorUid: "adminB",
    attemptId: "attemptB",
    ipAddress: "127.0.0.1",
  })
  console.log("Attempt B finished with outcome:", resultB.outcome)

  console.log("Unpausing A...")
  pauseResolve?.()
  await attemptAPromise
  console.log("Attempt A promise completed. Final authEmail:", authEmail, "firestoreEmail:", firestoreEmail)

  assert.ok(errorA, "Attempt A should fail its compensation fence")
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
  assert.equal(firestoreEmail, "old@example.test")
  assert.equal(authEmail, firestoreEmail, "Auth and Firestore maintain strict parity!")
})

