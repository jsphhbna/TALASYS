/**
 * Trusted Request IP extraction utility for Next.js Server Components and Route Handlers (#6).
 *
 * Inspects proxy headers commonly provided by reverse proxies (Vercel, Nginx, Cloudflare)
 * and extracts the client IP address. Falls back to "Unknown" if headers are missing or invalid.
 * Never defaults to "localhost" in production.
 */

export function extractClientIp(reqOrHeaders: Request | Headers): string {
  try {
    const headers = reqOrHeaders instanceof Headers ? reqOrHeaders : (reqOrHeaders as Request)?.headers
    if (!headers) return "Unknown"

    // Cloudflare
    const cfIp = headers.get("cf-connecting-ip")
    if (cfIp && isValidIp(cfIp.trim())) {
      return cfIp.trim()
    }

    // Standard X-Forwarded-For: client, proxy1, proxy2...
    const forwardedFor = headers.get("x-forwarded-for")
    if (forwardedFor) {
      const firstIp = forwardedFor.split(",")[0].trim()
      if (isValidIp(firstIp)) {
        return firstIp
      }
    }

    // X-Real-IP
    const realIp = headers.get("x-real-ip")
    if (realIp && isValidIp(realIp.trim())) {
      return realIp.trim()
    }

    return "Unknown"
  } catch {
    return "Unknown"
  }
}

/**
 * Basic IPv4 / IPv6 format validator to prevent header injection or garbage values.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length > 45) return false
  
  // Basic IPv4: 4 octets
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  if (ipv4Regex.test(ip)) return true

  // IPv6: contains colons, valid hex chars
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^[0-9a-fA-F:]+$/
  if (ipv6Regex.test(ip) && ip.includes(":")) return true

  return false
}
