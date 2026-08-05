export type ChannelPrimaryMessageLanguage = "ko" | "en" | "unknown"
export type ChannelUserFacingLanguage = "ko" | "en"

export function detectPrimaryMessageLanguage(text: string): ChannelPrimaryMessageLanguage {
  const hangulUnits = countMatches(text, /[가-힣]+/g)
  const latinUnits = countMatches(text, /[A-Za-z]+/g)
  if (hangulUnits > 0 && latinUnits > 0) return hangulUnits >= latinUnits ? "ko" : "en"
  if (hangulUnits > 0) return "ko"
  if (latinUnits > 0) return "en"
  return "unknown"
}

export function resolveUserFacingMessageLanguage(text: string): ChannelUserFacingLanguage {
  const language = detectPrimaryMessageLanguage(text)
  return language === "ko" ? "ko" : "en"
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}
