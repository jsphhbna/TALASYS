import crypto from "crypto"

// Registration upload ticket secret (derived or environment-driven)
const TICKET_SECRET = process.env.REGISTRATION_TICKET_SECRET || process.env.CLOUDINARY_API_SECRET || "talasys-reg-ticket-secret"
const TICKET_TTL_MS = 15 * 60 * 1000 // 15 minutes

export interface RegistrationTicketPayload {
  purpose: "registration"
  issuedAt: number
  expiresAt: number
  nonce: string
}

/**
 * Creates a signed, tamper-proof ticket for pre-registration proof uploads (#51).
 */
export function createRegistrationTicket(): string {
  const payload: RegistrationTicketPayload = {
    purpose: "registration",
    issuedAt: Date.now(),
    expiresAt: Date.now() + TICKET_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  }
  const serialized = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const hmac = crypto.createHmac("sha256", TICKET_SECRET).update(serialized).digest("base64url")
  return `${serialized}.${hmac}`
}

/**
 * Validates a registration upload ticket.
 */
export function verifyRegistrationTicket(ticket?: string | null): boolean {
  if (!ticket) return false
  const parts = ticket.split(".")
  if (parts.length !== 2) return false

  const [serialized, receivedHmac] = parts
  const expectedHmac = crypto.createHmac("sha256", TICKET_SECRET).update(serialized).digest("base64url")

  if (receivedHmac !== expectedHmac) return false

  try {
    const payloadJson = Buffer.from(serialized, "base64url").toString("utf8")
    const payload: RegistrationTicketPayload = JSON.parse(payloadJson)
    if (payload.purpose !== "registration") return false
    if (Date.now() > payload.expiresAt) return false
    return true
  } catch {
    return false
  }
}
