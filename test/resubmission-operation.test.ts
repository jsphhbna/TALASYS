import test from "node:test"
import assert from "node:assert/strict"
import {
  computeResubmissionPayloadFingerprint,
  getOrGenerateResubmissionOperationId,
  clearResubmissionOperationId,
} from "../lib/resident/resubmission-operation.ts"

class MockSessionStorage {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
}

test("R12: computeResubmissionPayloadFingerprint normalizes proofs and reason deterministically", () => {
  const proofsA = [
    { name: "Valid Government ID ", url: "https://example.test/id.jpg", filename: "my-id.jpg" },
    { name: "Voter's ID", url: "https://example.test/voter.jpg", filename: "voter.jpg" },
  ]
  const proofsB = [
    { name: "voter's id", url: "https://example.test/voter.jpg", filename: "VOTER.jpg" },
    { name: "valid government id", url: "https://example.test/id.jpg", filename: "my-id.jpg" },
  ]

  const fpA = computeResubmissionPayloadFingerprint(proofsA, " Resubmitting clearer photos ")
  const fpB = computeResubmissionPayloadFingerprint(proofsB, "Resubmitting clearer photos")

  assert.equal(fpA, fpB, "Fingerprints should be identical regardless of document order or casing")

  const fpChangedReason = computeResubmissionPayloadFingerprint(proofsA, "Different reason")
  assert.notEqual(fpA, fpChangedReason, "Different reason must produce different fingerprint")

  const fpChangedProof = computeResubmissionPayloadFingerprint(
    [{ name: "Valid Government ID", url: "https://example.test/new-id.jpg", filename: "new.jpg" }],
    "Resubmitting clearer photos",
  )
  assert.notEqual(fpA, fpChangedProof, "Different proof URL must produce different fingerprint")
})

test("R12: getOrGenerateResubmissionOperationId preserves operationId across retries and refreshes", () => {
  const storage = new MockSessionStorage() as unknown as Storage
  const residentId = "resident-r12-test"
  const proofs = [{ name: "Valid Government ID", url: "https://example.test/proof.jpg" }]
  const reason = "Clear copy of passport"

  // 1. Initial attempt generates fresh operationId
  const first = getOrGenerateResubmissionOperationId(residentId, proofs, reason, storage)
  assert.ok(first.operationId)
  assert.equal(first.isReplay, false)
  assert.match(first.operationId, /^[A-Za-z0-9_-]{16,80}$/)

  // 2. Retry with same payload reuses the operationId (simulating retry after lost network response)
  const retry = getOrGenerateResubmissionOperationId(residentId, proofs, reason, storage)
  assert.equal(retry.operationId, first.operationId)
  assert.equal(retry.isReplay, true)

  // 3. Simulated component remount / browser refresh: re-reads storage and preserves operationId
  const remount = getOrGenerateResubmissionOperationId(residentId, proofs, reason, storage)
  assert.equal(remount.operationId, first.operationId)
  assert.equal(remount.isReplay, true)

  // 4. Changing payload produces a NEW operationId
  const modifiedProofs = [{ name: "Valid Government ID", url: "https://example.test/different-proof.jpg" }]
  const modified = getOrGenerateResubmissionOperationId(residentId, modifiedProofs, reason, storage)
  assert.notEqual(modified.operationId, first.operationId)
  assert.equal(modified.isReplay, false)

  // 5. Subsequent retry of modified payload reuses the modified operationId
  const modifiedRetry = getOrGenerateResubmissionOperationId(residentId, modifiedProofs, reason, storage)
  assert.equal(modifiedRetry.operationId, modified.operationId)
  assert.equal(modifiedRetry.isReplay, true)

  // 6. Clearing storage resets state
  clearResubmissionOperationId(residentId, storage)
  const afterClear = getOrGenerateResubmissionOperationId(residentId, modifiedProofs, reason, storage)
  assert.notEqual(afterClear.operationId, modified.operationId)
  assert.equal(afterClear.isReplay, false)
})

test("R12: getOrGenerateResubmissionOperationId does not persist sensitive tokens or secrets", () => {
  const storage = new MockSessionStorage() as unknown as Storage
  const residentId = "resident-safe-storage"
  const proofs = [
    {
      name: "Valid Government ID",
      url: "https://example.test/proof.jpg",
      claimToken: "super-secret-capability-token-never-store-this",
      idToken: "bearer-token-12345",
    } as unknown as { name: string; url: string },
  ]
  const reason = "Clear copy of passport"

  getOrGenerateResubmissionOperationId(residentId, proofs, reason, storage)

  const raw = storage.getItem(`talasys_resubmit_op_${residentId}`)
  assert.ok(raw)
  assert.equal(raw.includes("super-secret-capability-token"), false, "Must never persist claimToken")
  assert.equal(raw.includes("bearer-token"), false, "Must never persist idToken")

  const parsed = JSON.parse(raw)
  assert.deepEqual(Object.keys(parsed).sort(), ["createdAt", "fingerprint", "operationId"].sort())
})

test("R12: getOrGenerateResubmissionOperationId handles null or throwing storage gracefully", () => {
  const proofs = [{ name: "Valid Government ID", url: "https://example.test/proof.jpg" }]
  const reason = "Clear copy of passport"

  // Null storage (e.g. SSR environment)
  const noStorage = getOrGenerateResubmissionOperationId("res-1", proofs, reason, null)
  assert.ok(noStorage.operationId)
  assert.equal(noStorage.isReplay, false)

  // Throwing storage (e.g. SecurityError in iframe or storage disabled)
  const throwingStorage = {
    getItem() { throw new Error("Storage blocked by security policy") },
    setItem() { throw new Error("Storage blocked by security policy") },
    removeItem() { throw new Error("Storage blocked by security policy") },
  } as unknown as Storage

  const throwingResult = getOrGenerateResubmissionOperationId("res-2", proofs, reason, throwingStorage)
  assert.ok(throwingResult.operationId)
  assert.equal(throwingResult.isReplay, false)

  // clearResubmissionOperationId does not throw with throwing storage
  assert.doesNotThrow(() => {
    clearResubmissionOperationId("res-2", throwingStorage)
  })
})
