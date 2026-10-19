import test from "node:test"
import assert from "node:assert/strict"
import { createCloudinarySignHandler } from "../app/api/cloudinary/sign/route.ts"
import { createRegistrationTicket } from "../lib/security/upload-ticket.ts"

process.env.CLOUDINARY_API_SECRET = "test-cloudinary-secret-12345"
process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test-cloud"
process.env.TRUSTED_PROXY_IP_HEADER = "x-forwarded-for"

function createMockDb(users: Record<string, any> = {}) {
  return {
    collection(colName: string) {
      if (colName === "users") {
        return {
          doc(id: string) {
            return {
              get: async () => ({
                exists: Boolean(users[id]),
                data: () => users[id] || {},
              }),
            }
          },
        }
      }
      if (colName === "mediaRegistry") {
        return {
          doc(_id: string) {
            return {
              create: async () => {},
            }
          },
        }
      }
      return {
        doc() {
          return {
            get: async () => ({ exists: false, data: () => ({}) }),
            set: async () => {},
            create: async () => {},
          }
        },
      }
    },
  }
}

test("SEC-F03: rotating unverified bearer tokens with Unknown IP cannot evade rate limiting", async () => {
  const auth: any = {
    verifyIdToken: async (token: string) => {
      if (token.startsWith("valid-")) {
        return { uid: token.replace("valid-", "") }
      }
      throw new Error("Invalid token")
    },
  }
  const db: any = createMockDb()
  const handler = createCloudinarySignHandler({ auth, db })

  // Send 60 requests with unique random fake tokens with Unknown IP (no IP headers)
  for (let i = 0; i < 60; i++) {
    const req = new Request("http://localhost/api/cloudinary/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer fake-token-rotation-${i}-${Math.random()}`,
      },
      body: JSON.stringify({ folder: "talasys/receipts" }),
    })
    const res = await handler(req)
    // First 60 fail with 401 Unauthorized because the token is invalid
    assert.equal(res.status, 401, `Request ${i} should be 401 unauthorized`)
  }

  // Request 61 with yet another distinct fake token MUST return 429
  const overflowReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer fake-token-rotation-61-${Math.random()}`,
    },
    body: JSON.stringify({ folder: "talasys/receipts" }),
  })
  const overflowRes = await handler(overflowReq)
  assert.equal(overflowRes.status, 429, "61st request from unknown IP must be rate-limited (429)")
  const body = await overflowRes.json()
  assert.match(body.error, /Too many upload requests/i)
})

test("SEC-F03: valid authenticated user receives per-user rate limit", async () => {
  const userId = `user-rate-test-${Date.now()}`
  const auth: any = {
    verifyIdToken: async (token: string) => {
      if (token === "valid-user-token") {
        return { uid: userId }
      }
      throw new Error("Invalid token")
    },
  }
  const db: any = createMockDb({
    [userId]: { role: "resident", status: "Active" },
  })
  const handler = createCloudinarySignHandler({ auth, db })

  // Send requests with distinct known IP so pre-auth IP limit doesn't interfere
  const clientIp = `198.51.100.${Math.floor(Math.random() * 250) + 1}`
  for (let i = 0; i < 30; i++) {
    const req = new Request("http://localhost/api/cloudinary/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-user-token",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({ folder: "talasys/receipts" }),
    })
    const res = await handler(req)
    assert.equal(res.status, 200, `Request ${i} should succeed for valid user`)
  }

  // 31st request from the same user should hit the per-user limit
  const overflowReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-user-token",
      "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}`, // different IP, same user
    },
    body: JSON.stringify({ folder: "talasys/receipts" }),
  })
  const overflowRes = await overflowReq && (await handler(overflowReq))
  assert.equal(overflowRes.status, 429, "31st request for same user must be rate-limited (429)")
  const body = await overflowRes.json()
  assert.match(body.error, /Too many upload requests for this account/i)
})

test("SEC-F03: rotating invalid registration tickets cannot evade IP rate limiting and valid ticket permits single use", async () => {
  const db: any = createMockDb()
  const handler = createCloudinarySignHandler({ db })
  const clientIp = "198.51.100.99"

  // 1. Rotating invalid registration tickets cannot bypass IP rate limit
  for (let i = 0; i < 30; i++) {
    const req = new Request("http://localhost/api/cloudinary/sign", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({
        ticket: `invalid-ticket-attempt-${i}-${Math.random()}`,
        folder: "talasys/proofs",
      }),
    })
    const res = await handler(req)
    assert.equal(res.status, 401, `Invalid ticket ${i} should be rejected with 401`)
  }

  // 31st request from same IP must hit IP rate limit (429) even with a different invalid ticket
  const overflowReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": clientIp,
    },
    body: JSON.stringify({
      ticket: "invalid-ticket-attempt-31",
      folder: "talasys/proofs",
    }),
  })
  const overflowRes = await handler(overflowReq)
  assert.equal(overflowRes.status, 429, "31st request with invalid ticket must be rate limited (429)")
  const body = await overflowRes.json()
  assert.match(body.error, /Too many upload requests/i)

  // 2. Valid registration ticket succeeds on a distinct IP, but replay is rejected
  const freshIp = "198.51.100.100"
  const validTicket = createRegistrationTicket()
  const validReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": freshIp,
    },
    body: JSON.stringify({
      ticket: validTicket,
      folder: "talasys/proofs",
    }),
  })
  const validRes = await handler(validReq)
  assert.equal(validRes.status, 200, "Valid registration ticket must succeed")

  // Replay of the consumed registration ticket must fail with 401
  const replayReq = new Request("http://localhost/api/cloudinary/sign", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": freshIp,
    },
    body: JSON.stringify({
      ticket: validTicket,
      folder: "talasys/proofs",
    }),
  })
  const replayRes = await handler(replayReq)
  assert.equal(replayRes.status, 401, "Replayed registration ticket must be rejected with 401")
})
