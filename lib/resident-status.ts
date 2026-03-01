export type AutoResidentStatus = "Senior Citizen" | "Adult" | "Underage"

const autoStatuses: AutoResidentStatus[] = ["Senior Citizen", "Adult", "Underage"]

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

export function deriveStatusesFromAge(age: number): AutoResidentStatus[] {
  if (age >= 60) {
    return ["Senior Citizen"]
  }

  if (age >= 18) {
    return ["Adult"]
  }

  return ["Underage"]
}

export function mergeWithAutoStatuses(existingStatuses: string[], age: number): string[] {
  const manualStatuses = existingStatuses.filter((status) => !autoStatuses.includes(status as AutoResidentStatus))
  return [...manualStatuses, ...deriveStatusesFromAge(age)]
}
