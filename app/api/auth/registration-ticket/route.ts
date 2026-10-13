import { NextResponse } from "next/server"
import { createRegistrationTicket } from "@/lib/security/upload-ticket"
import { rateLimit } from "@/lib/rate-limit"

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
    const { success, resetTime } = rateLimit(`reg-ticket:${ip}`, 10, 15 * 60 * 1000)

    if (!success) {
      return NextResponse.json(
        { error: "Too many registration ticket requests. Please try again later." },
        { status: 429, headers: { "X-RateLimit-Reset": resetTime.toString() } }
      )
    }

    const ticket = createRegistrationTicket()
    return NextResponse.json({ ticket, expiresIn: 900 })
  } catch (error) {
    console.error("Failed to generate registration ticket:", error)
    return NextResponse.json({ error: "Failed to issue registration ticket" }, { status: 500 })
  }
}
