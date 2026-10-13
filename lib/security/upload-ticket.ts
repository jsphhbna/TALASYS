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
  if (!ticket || typeof ticket !== "string") return false
  const parts = ticket.split(".")
  if (parts.length !== 2) return false

  let secret: string
  try {
    secret = getTicketSecret()
  } catch {
    return false
  }

  const [serialized, receivedHmac] = parts
  const expectedHmac = crypto.createHmac("sha256", secret).update(serialized).digest("base64url")

  if (receivedHmac !== expectedHmac) return false

  try {
    const payloadJson = Buffer.from(serialized, "base64url").toString("utf8")
    const payload: RegistrationTicketPayload = JSON.parse(payloadJson)
    if (payload.purpose !== "registration") return false
    if (Date.now() > payload.expiresAt) return false
    if (consumedNonces.has(payload.nonce)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Validates AND consumes a registration upload ticket to prevent replay (#51).
 */
export function verifyAndConsumeRegistrationTicket(ticket?: string | null): boolean {
  if (!verifyRegistrationTicket(ticket)) return false
  try {
    const [serialized] = (ticket as string).split(".")
    const payloadJson = Buffer.from(serialized, "base64url").toString("utf8")
    const payload: RegistrationTicketPayload = JSON.parse(payloadJson)
    pruneConsumedNonces()
    consumedNonces.set(payload.nonce, payload.expiresAt)
    return true
  } catch {
    return false
  }
}
