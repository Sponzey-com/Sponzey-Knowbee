import type { UnifiedSettingsSectionId } from "./unified-settings-ownership"

export const SETTINGS_SECTION_IDS: readonly UnifiedSettingsSectionId[] = [
  "basics",
  "ai",
  "connections",
  "sub_agents",
  "automation",
  "memory",
  "permissions",
  "diagnostics",
]

export function resolveSettingsSectionId(
  value: string | null | undefined,
): UnifiedSettingsSectionId {
  return SETTINGS_SECTION_IDS.includes(value as UnifiedSettingsSectionId)
    ? (value as UnifiedSettingsSectionId)
    : "basics"
}

export function settingsSectionPath(sectionId: UnifiedSettingsSectionId): string {
  return `/settings/${sectionId}`
}
