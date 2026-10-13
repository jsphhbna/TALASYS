import test from "node:test"
import assert from "node:assert/strict"
import { createAuditTelemetryHandler } from "../app/api/audit/log/route.ts"
import { extractClientIp } from "../lib/security/request-ip.ts"

function fixture(role = "Full Access") {
  const writes: any[] = []
  const db: any = { collection(name: string) { return name === "users" ? { doc() { return { get: async () => ({ exists: true, data: () => ({ role, status: "Active", name: "Trusted Actor" }) }) } } } : { add: async (value: any) => { writes.push({ name, value }); return { id: "telemetry" } } } } }
  const auth: any = { verifyIdToken: async () => ({ uid: "trusted-uid" }) }
  return { handler: createAuditTelemetryHandler({ auth, db, now: () => 123 }), writes }
}

function request(body: any, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/audit/log", { method: "POST", headers: { Authorization: "Bearer token", "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
}

test("privileged mutation descriptions cannot be fabricated through audit endpoint", async () => {
  const state = fixture()
  const response = await state.handler(request({ action: "Deleted Admin", details: "I did it", actorUid: "victim" }))
  assert.equal(response.status, 403)
  assert.equal(state.writes.length, 0)
})

test("allowed telemetry is separated and actor cannot be substituted", async () => {
  const state = fixture()
  const response = await state.handler(request({ event: "admin_ui_error", actorUid: "forged", ipAddress: "1.2.3.4" }))
  assert.equal(response.status, 200)
  assert.equal(state.writes[0].name, "clientTelemetry")
  assert.equal(state.writes[0].value.actorUid, "trusted-uid")
  assert.equal(state.writes[0].value.authoritative, false)
})

test("View Only caller cannot submit telemetry that resembles admin authority", async () => {
  const state = fixture("resident")
  assert.equal((await state.handler(request({ event: "admin_ui_error" }))).status, 403)
  assert.equal(state.writes.length, 0)
})

test("forwarded IP headers are ignored unless an exact trusted proxy header is configured", () => {
  const prior = process.env.TRUSTED_PROXY_IP_HEADER
  delete process.env.TRUSTED_PROXY_IP_HEADER
  assert.equal(extractClientIp(new Headers({ "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "5.6.7.8" })), "Unknown")
  process.env.TRUSTED_PROXY_IP_HEADER = "x-verified-client-ip"
  assert.equal(extractClientIp(new Headers({ "x-verified-client-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" })), "1.2.3.4")
  if (prior === undefined) delete process.env.TRUSTED_PROXY_IP_HEADER; else process.env.TRUSTED_PROXY_IP_HEADER = prior
})
