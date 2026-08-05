import type { SetupDraft } from "../contracts/setup"
import {
  UNIFIED_SETTINGS_SECTIONS,
  type UnifiedSettingsSectionId,
} from "./unified-settings-ownership"

export type SettingsSectionLifecycle = "editable" | "read_only" | "destination_only"

export interface SettingsSectionOwnership {
  id: UnifiedSettingsSectionId
  fieldOwner: string
  queryOwner: string | null
  commandOwner: string | null
  lifecycle: SettingsSectionLifecycle
}

export type SettingsSectionOwnershipIssueCode =
  | "section_missing"
  | "section_unknown"
  | "section_duplicate"
  | "field_owner_duplicate"
  | "destination_command_forbidden"
  | "editable_command_missing"
  | "read_query_missing"

export interface SettingsSectionOwnershipIssue {
  code: SettingsSectionOwnershipIssueCode
  subject: string
}

export const SETTINGS_SECTION_OWNERSHIP: readonly SettingsSectionOwnership[] = [
  {
    id: "basics",
    fieldOwner: "PersonalSettingsForm",
    queryOwner: "setup.draft",
    commandOwner: "setup.identity.save",
    lifecycle: "editable",
  },
  {
    id: "ai",
    fieldOwner: "SetupPage.ai",
    queryOwner: "setup.draft",
    commandOwner: "setup.ai.save_and_test",
    lifecycle: "editable",
  },
  {
    id: "connections",
    fieldOwner: "SetupPage.connections",
    queryOwner: "setup.draft",
    commandOwner: "setup.connections.save",
    lifecycle: "editable",
  },
  {
    id: "sub_agents",
    fieldOwner: "SettingsDestinationPanel.agents",
    queryOwner: null,
    commandOwner: null,
    lifecycle: "destination_only",
  },
  {
    id: "automation",
    fieldOwner: "SettingsDestinationPanel.schedules",
    queryOwner: null,
    commandOwner: null,
    lifecycle: "destination_only",
  },
  {
    id: "memory",
    fieldOwner: "MemorySettingsOverviewPanel",
    queryOwner: "memory.inspector",
    commandOwner: null,
    lifecycle: "read_only",
  },
  {
    id: "permissions",
    fieldOwner: "SecuritySettingsForm",
    queryOwner: "setup.draft",
    commandOwner: "capability.policy.save",
    lifecycle: "editable",
  },
  {
    id: "diagnostics",
    fieldOwner: "SetupPage.diagnostics",
    queryOwner: "setup.checks",
    commandOwner: null,
    lifecycle: "read_only",
  },
]

export function validateSettingsSectionOwnership(
  entries: readonly ({ id: string } & Omit<SettingsSectionOwnership, "id">)[],
): { ok: boolean; issues: SettingsSectionOwnershipIssue[] } {
  const expectedIds = new Set(UNIFIED_SETTINGS_SECTIONS.map((section) => section.id))
  const issues: SettingsSectionOwnershipIssue[] = []
  const sectionCounts = new Map<string, number>()
  const fieldCounts = new Map<string, number>()

  for (const entry of entries) {
    sectionCounts.set(entry.id, (sectionCounts.get(entry.id) ?? 0) + 1)
    fieldCounts.set(entry.fieldOwner, (fieldCounts.get(entry.fieldOwner) ?? 0) + 1)
    if (!expectedIds.has(entry.id as UnifiedSettingsSectionId)) {
      issues.push({ code: "section_unknown", subject: entry.id })
    }
    if (entry.lifecycle === "destination_only" && entry.commandOwner !== null) {
      issues.push({ code: "destination_command_forbidden", subject: entry.id })
    }
    if (entry.lifecycle === "editable" && entry.commandOwner === null) {
      issues.push({ code: "editable_command_missing", subject: entry.id })
    }
    if (entry.lifecycle === "read_only" && entry.queryOwner === null) {
      issues.push({ code: "read_query_missing", subject: entry.id })
    }
  }

  for (const id of expectedIds) {
    const count = sectionCounts.get(id) ?? 0
    if (count === 0) issues.push({ code: "section_missing", subject: id })
    if (count > 1) issues.push({ code: "section_duplicate", subject: id })
  }
  for (const [owner, count] of fieldCounts) {
    if (count > 1) issues.push({ code: "field_owner_duplicate", subject: owner })
  }

  return { ok: issues.length === 0, issues }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function comparableAiDraft(draft: SetupDraft) {
  return {
    aiBackends: draft.aiBackends.map(({ credentials: _credentials, ...backend }) => backend),
    routingProfiles: draft.routingProfiles,
  }
}

export function settingsSectionDraftMatches(
  sectionId: UnifiedSettingsSectionId,
  expected: SetupDraft,
  authoritative: SetupDraft,
): boolean {
  switch (sectionId) {
    case "basics":
      return sameValue(
        { personal: expected.personal, mainAgent: expected.mainAgent },
        { personal: authoritative.personal, mainAgent: authoritative.mainAgent },
      )
    case "ai":
      return sameValue(comparableAiDraft(expected), comparableAiDraft(authoritative))
    case "connections":
      return sameValue(
        { channels: expected.channels, mqtt: expected.mqtt, remoteAccess: expected.remoteAccess },
        {
          channels: authoritative.channels,
          mqtt: authoritative.mqtt,
          remoteAccess: authoritative.remoteAccess,
        },
      )
    case "permissions":
      return sameValue(expected.security, authoritative.security)
    case "sub_agents":
    case "automation":
    case "memory":
    case "diagnostics":
      return true
  }
}
