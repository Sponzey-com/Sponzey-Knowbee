import type { UiLanguage } from "../stores/uiLanguage"

export const DEFAULT_MAIN_AGENT_NAME_KO = "노비"
export const DEFAULT_MAIN_AGENT_NAME_EN = "Knowbee"

export function defaultMainAgentNameForLanguage(language: UiLanguage | string | undefined): string {
  return language?.trim().toLowerCase().startsWith("ko")
    ? DEFAULT_MAIN_AGENT_NAME_KO
    : DEFAULT_MAIN_AGENT_NAME_EN
}

export function mainAgentNameForDraft(
  draft: { mainAgent?: { name?: string | undefined } | undefined },
  language: UiLanguage | string | undefined,
): string {
  return draft.mainAgent?.name?.trim() || defaultMainAgentNameForLanguage(language)
}

export function isDefaultMainAgentAlias(value: string | undefined): boolean {
  const normalized = value?.trim().normalize("NFKC").toLocaleLowerCase() ?? ""
  return normalized === "" || normalized === "knowbee" || normalized === "노비"
}

export function mainAgentLabelKo(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return isDefaultMainAgentAlias(trimmed) ? "메인 에이전트" : trimmed
}

export function mainAgentLabelEn(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return isDefaultMainAgentAlias(trimmed) ? "main agent" : trimmed
}

export function mainAgentSubjectKo(value: string | undefined): string {
  const label = mainAgentLabelKo(value)
  return `${label}${hasKoreanFinalConsonant(label) ? "이" : "가"}`
}

export function mainAgentSubjectEn(
  value: string | undefined,
  options: { sentenceStart?: boolean } = {},
): string {
  const trimmed = value?.trim() ?? ""
  if (!isDefaultMainAgentAlias(trimmed)) return trimmed
  return options.sentenceStart ? "The main agent" : "the main agent"
}

export function mainAgentPossessiveEn(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return isDefaultMainAgentAlias(trimmed) ? "the main agent's" : `${trimmed}'s`
}

function hasKoreanFinalConsonant(value: string): boolean {
  const lastHangul = [...value.trim()].reverse().find((char) => /[가-힣]/u.test(char))
  if (!lastHangul) return false
  const code = lastHangul.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return false
  return code % 28 !== 0
}
