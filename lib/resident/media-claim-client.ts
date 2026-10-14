export type RegistrationMediaClaim = { mediaUrl?: string; claimToken?: string }

export async function claimRegistrationMedia(
  fetcher: typeof fetch,
  idToken: string,
  claims: RegistrationMediaClaim[],
): Promise<void> {
  if (claims.length === 0) return
  const response = await fetcher("/api/media/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ claims }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.requestedCount !== claims.length || result.claimedCount !== claims.length) {
    throw new Error(result.error || "Registration proof ownership could not be confirmed. Please retry registration or contact support.")
  }
}
