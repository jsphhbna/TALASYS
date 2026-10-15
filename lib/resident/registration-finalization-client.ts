export type RegistrationFinalizationProof = {
  name: string
  filename: string
  url: string
  uploadDate?: string
  claimToken: string
}

export type RegistrationFinalizationPayload = {
  operationId: string
  resident: {
    firstName: string
    lastName: string
    middleInitial?: string
    email: string
    gender: string
    dateOfBirth: string
    contactNumber: string
    street: string
    barangay: string
    city: string
    statuses: string[]
  }
  proofs: RegistrationFinalizationProof[]
}

export class RegistrationFinalizationError extends Error {
  readonly code: string
  readonly outcome: "definitive" | "ambiguous"
  readonly committed: false | "unknown"

  constructor(message: string, options: { code: string; outcome: "definitive" | "ambiguous" }) {
    super(message)
    this.name = "RegistrationFinalizationError"
    this.code = options.code
    this.outcome = options.outcome
    this.committed = options.outcome === "definitive" ? false : "unknown"
  }
}

export async function callRegistrationFinalizer(
  fetcher: typeof fetch,
  idToken: string,
  payload: RegistrationFinalizationPayload,
  options: { maxAttempts?: number; onRetry?: (attempt: number) => void } = {},
) {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 5))
  let lastTransportError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetcher("/api/resident/registration/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.success === true && result.committed === true) return result
      if (result.committed === false) {
        throw new RegistrationFinalizationError(
          result.error || "Registration was rejected before it was committed.",
          { code: result.code || "FINALIZATION_REJECTED", outcome: "definitive" },
        )
      }
      throw new RegistrationFinalizationError(
        "Registration completion could not be confirmed. Keep this page open and retry with the same account.",
        { code: "FINALIZATION_OUTCOME_UNKNOWN", outcome: "ambiguous" },
      )
    } catch (error) {
      if (error instanceof RegistrationFinalizationError) {
        if (error.outcome === "definitive" || attempt >= maxAttempts) throw error
        lastTransportError = error
        options.onRetry?.(attempt + 1)
        continue
      }
      lastTransportError = error
      if (attempt < maxAttempts) {
        options.onRetry?.(attempt + 1)
        continue
      }
    }
  }
  throw new RegistrationFinalizationError(
    `Registration may have completed, but the server response could not be confirmed. Retry from this page; your account was preserved.${lastTransportError instanceof Error && lastTransportError.message ? ` (${lastTransportError.message})` : ""}`,
    { code: "FINALIZATION_OUTCOME_UNKNOWN", outcome: "ambiguous" },
  )
}

export async function completeFreshRegistration(options: {
  finalize: () => Promise<unknown>
  deleteFreshAuth: () => Promise<void>
  sendVerificationEmail: () => Promise<void>
  signOut: () => Promise<void>
}) {
  try {
    await options.finalize()
  } catch (error) {
    if (error instanceof RegistrationFinalizationError && error.outcome === "definitive") {
      try { await options.deleteFreshAuth() } catch { /* preserve the authoritative rejection */ }
    }
    throw error
  }

  let verificationEmailSent = true
  try {
    await options.sendVerificationEmail()
  } catch {
    verificationEmailSent = false
  }
  let signedOut = true
  try {
    await options.signOut()
  } catch {
    signedOut = false
  }
  return { verificationEmailSent, signedOut }
}
