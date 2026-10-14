import crypto from "crypto"

const TICKET_TTL_MS = 15 * 60 * 1000 // 15 minutes bounded lifetime

// In-memory nonce store to prevent ticket replay attacks (#51)
const consumedNonces = new Map<string, number>()

function pruneConsumedNonces() {
  const now = Date.now()
  for (const [nonce, expiresAt] of consumedNonces.entries()) {
    if (now > expiresAt) {
      consumedNonces.delete(nonce)
    }
  }
}

function getTicketSecret(): string {
  const secret = process.env.REGISTRATION_TICKET_SECRET || process.env.CLOUDINARY_API_SECRET
  if (!secret) {
    throw new Error("Registration ticket signing secret is not configured on the server.")
  }
  return secret
}

export interface RegistrationTicketPayload {
  purpose: "registration"
  issuedAt: number
  expiresAt: number
  nonce: string
}

function readVerifiedTicket(ticket?: string | null, allowConsumed = false): RegistrationTicketPayload | null {
  if (!ticket || typeof ticket !== "string") return null
  const parts = ticket.split(".")
  if (parts.length !== 2) return null

  let secret: string
  try {
    secret = getTicketSecret()
  } catch {
    return null
  }

  const [serialized, receivedHmac] = parts
  const expectedHmac = crypto.createHmac("sha256", secret).update(serialized).digest()
  let suppliedHmac: Buffer
  try {
    suppliedHmac = Buffer.from(receivedHmac, "base64url")
  } catch {
    return null
  }
  if (suppliedHmac.length !== expectedHmac.length || !crypto.timingSafeEqual(suppliedHmac, expectedHmac)) return null

  try {
    const payload = JSON.parse(Buffer.from(serialized, "base64url").toString("utf8")) as RegistrationTicketPayload
    if (payload.purpose !== "registration" || typeof payload.nonce !== "string") return null
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) || Date.now() > payload.expiresAt) return null
    if (!allowConsumed && consumedNonces.has(payload.nonce)) return null
    return payload
  } catch {
    return null
  }
}

/**
 * Creates a signed, tamper-proof ticket for pre-registration proof uploads (#51).
 * Fails closed if server secret is unconfigured.
 */
export function createRegistrationTicket(customTtlMs?: number): string {
  const secret = getTicketSecret()
  const now = Date.now()
  const ttl = typeof customTtlMs === "number" 
    ? (customTtlMs < 10000 && customTtlMs > -10000 ? customTtlMs * 1000 : customTtlMs)
    : TICKET_TTL_MS
  const payload: RegistrationTicketPayload = {
    purpose: "registration",
    issuedAt: now,
    expiresAt: now + ttl,
    nonce: crypto.randomBytes(16).toString("hex"),
  }
  const serialized = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const hmac = crypto.createHmac("sha256", secret).update(serialized).digest("base64url")
  return `${serialized}.${hmac}`
}

/**
 * Validates a registration upload ticket and ensures it is active and untampered (#51).
 */
export function verifyRegistrationTicket(ticket?: string | null): boolean {
  return readVerifiedTicket(ticket) !== null
}

/**
 * Validates AND consumes a registration upload ticket to prevent replay (#51).
 */
export function verifyAndConsumeRegistrationTicket(ticket?: string | null): boolean {
  return consumeRegistrationTicket(ticket) !== null
}

/** Validates before exposing payload fields, then consumes the nonce. */
export function consumeRegistrationTicket(ticket?: string | null): RegistrationTicketPayload | null {
  pruneConsumedNonces()
  const payload = readVerifiedTicket(ticket)
  if (!payload) return null
  consumedNonces.set(payload.nonce, payload.expiresAt)
  return payload
}
