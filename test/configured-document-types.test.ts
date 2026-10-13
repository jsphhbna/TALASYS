import test from "node:test"
import assert from "node:assert/strict"
import { resolveConfiguredDocument } from "../app/api/resident/requests/create/route.ts"

const config = {
  documentTypes: ["Barangay Clearance", "Custom Permit", "Free Certificate"],
  documentFees: { "Barangay Clearance": 50, "Custom Permit": 125, "Free Certificate": 25 },
  customDocumentTypes: [{ id: "custom-permit", name: "Custom Permit", fee: 999 }],
  feeWaiverPolicy: { enabled: true, documentTypes: ["Free Certificate"], eligibleStatuses: ["Approved Beneficiary"] },
}

test("enabled standard and custom types resolve stable IDs and authoritative fees", () => {
  assert.deepEqual(resolveConfiguredDocument(config, "Barangay Clearance", []), { id: "barangay-clearance", name: "Barangay Clearance", fee: 50 })
  assert.deepEqual(resolveConfiguredDocument(config, "Custom Permit", []), { id: "custom-permit", name: "Custom Permit", fee: 125 })
})

test("disabled or unknown types are rejected", () => {
  assert.throws(() => resolveConfiguredDocument(config, "Disabled Permit", []), /disabled or unknown/)
})

test("forged client fee is irrelevant and invalid configured fees fail safely", () => {
  assert.equal(resolveConfiguredDocument(config, "Custom Permit", []).fee, 125)
  assert.throws(() => resolveConfiguredDocument({ ...config, documentFees: { "Custom Permit": -1 } }, "Custom Permit", []), /invalid/)
})

test("free request applies only through explicit configured policy and exact eligible status", () => {
  assert.equal(resolveConfiguredDocument(config, "Free Certificate", ["Approved Beneficiary"]).fee, 0)
  assert.equal(resolveConfiguredDocument(config, "Free Certificate", ["Other"]).fee, 25)
})
