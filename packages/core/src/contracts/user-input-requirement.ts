export const USER_INPUT_RESOLUTION_KINDS = [
  "provide_value",
  "choose_option",
  "confirm_scope",
] as const

export type UserInputResolutionKind =
  (typeof USER_INPUT_RESOLUTION_KINDS)[number]

export interface UserInputRequirement {
  resolutionKind: UserInputResolutionKind
  missingFields: string[]
}

export function parseUserInputRequirement(
  value: unknown,
): UserInputRequirement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const candidate = value as Partial<Record<string, unknown>>
  if (
    typeof candidate.resolutionKind !== "string"
    || !USER_INPUT_RESOLUTION_KINDS.includes(
      candidate.resolutionKind as UserInputResolutionKind,
    )
    || !Array.isArray(candidate.missingFields)
  ) {
    return null
  }
  const missingFields = candidate.missingFields
    .filter((field): field is string => typeof field === "string")
    .map((field) => field.trim())
    .filter(Boolean)
  const uniqueMissingFields = [...new Set(missingFields)]
  if (
    uniqueMissingFields.length === 0
    || uniqueMissingFields.length !== candidate.missingFields.length
    || uniqueMissingFields.length !== missingFields.length
    || uniqueMissingFields.length > 8
    || uniqueMissingFields.some((field) => field.length > 64)
  ) {
    return null
  }
  return {
    resolutionKind: candidate.resolutionKind as UserInputResolutionKind,
    missingFields: uniqueMissingFields,
  }
}
