export type AutoResidentStatus = "Senior Citizen" | "Adult" | "Underage"

// The statuses in this list are automatically derived from age and must not be manually set.
// All other statuses (e.g. "Registered Voter") are considered manual and user-controlled.
const AUTO_DERIVED_STATUSES: AutoResidentStatus[] = ["Senior Citizen", "Adult", "Underage"]

/**
 * Calculates a resident's age from their date of birth string using the Asia/Manila calendar day.
 * Asia/Manila is UTC+8 with no Daylight Saving Time. The calculation evaluates calendar day
 * boundaries independently of the host machine's timezone.
 *
 * @param dateOfBirth Date string in YYYY-MM-DD or standard parseable format.
 * @param referenceTimeMs Epoch millisecond reference timestamp (defaults to Date.now()).
 * @returns The age in whole years, or `null` if the date string is missing or invalid.
 */
export function calculateAge(dateOfBirth: string, referenceTimeMs: number = Date.now()): number | null {
  if (!dateOfBirth) {
    return null
  }

  // Parse YYYY-MM-DD if formatted, or fallback to Date parsing
  let year: number
  let month: number
  let day: number
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    ;[year, month, day] = dateOfBirth.split("-").map(Number)
    const birth = new Date(Date.UTC(year, month - 1, day))
    if (birth.getUTCFullYear() !== year || birth.getUTCMonth() !== month - 1 || birth.getUTCDate() !== day) {
      return null
    }
  } else {
    const parsed = new Date(dateOfBirth)
    if (Number.isNaN(parsed.getTime())) {
      return null
    }
    year = parsed.getUTCFullYear()
    month = parsed.getUTCMonth() + 1
    day = parsed.getUTCDate()
  }

  // Shift to Asia/Manila calendar day (UTC+08:00)
  const manilaDate = new Date(referenceTimeMs + 8 * 60 * 60 * 1000)
  const currentYear = manilaDate.getUTCFullYear()
  const currentMonth = manilaDate.getUTCMonth() + 1
  const currentDay = manilaDate.getUTCDate()

  let age = currentYear - year
  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age--
  }

  if (age < 0 || age > 130) {
    return null
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
