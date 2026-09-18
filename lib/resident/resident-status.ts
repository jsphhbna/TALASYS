export type AutoResidentStatus = "Senior Citizen" | "Adult" | "Underage"

// The statuses in this list are automatically derived from age and must not be manually set.
// All other statuses (e.g. "Registered Voter") are considered manual and user-controlled.
const AUTO_DERIVED_STATUSES: AutoResidentStatus[] = ["Senior Citizen", "Adult", "Underage"]

/**
 * Calculates a resident's age from their date of birth string.
 *
 * @returns The age in whole years, or `null` if the date string is missing or invalid.
 */
export function calculateAge(dateOfBirth: string): number | null {
  if (!dateOfBirth) {
    return null
  }

  const birthDate = new Date(dateOfBirth)
  if (Number.isNaN(birthDate.getTime())) {
    return null
  }

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  return age
}

/**
 * Returns the single auto-derived status category for the given age.
 * Follows barangay classification: Senior Citizen (60+), Adult (18–59), Underage (<18).
 */
export function deriveStatusesFromAge(age: number): AutoResidentStatus[] {
  if (age >= 60) {
    return ["Senior Citizen"]
  }

  if (age >= 18) {
    return ["Adult"]
  }

  return ["Underage"]
}

/**
 * Merges a resident's manually chosen statuses (e.g. "Registered Voter") with
 * the auto-derived age category, replacing any previously auto-set status.
 *
 * Manual and auto statuses are intentionally kept separate: manual statuses
 * change based on the resident's choices, while auto statuses change based
 * on their age. Merging them avoids duplication (e.g. "Adult" AND "Senior Citizen").
 */
export function mergeWithAutoStatuses(existingStatuses: string[], age: number): string[] {
  const manualStatuses = existingStatuses.filter((status) => !AUTO_DERIVED_STATUSES.includes(status as AutoResidentStatus))
  return [...manualStatuses, ...deriveStatusesFromAge(age)]
}
