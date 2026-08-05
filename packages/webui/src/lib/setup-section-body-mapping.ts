import type { SetupStepId } from "../contracts/setup"
import type { SetupDraft } from "../contracts/setup"
import type { UiShellResponse } from "../api/client"
import type { UnifiedSettingsSectionId } from "./unified-settings-ownership"
import type { SingleSettingsSectionLifecycle } from "./unified-settings-workspace"

export type SetupSimpleBodyId = "ai" | "channels" | "memory" | "schedules" | "test"

export type SetupSectionBodyOwner =
  | {
      sectionId: UnifiedSettingsSectionId
      source: "setup_step"
      setupStepId: SetupStepId
      lifecycle: "active"
    }
  | {
      sectionId: UnifiedSettingsSectionId
      source: "simple_body"
      simpleBodyId: SetupSimpleBodyId
      lifecycle: "active"
    }
  | {
      sectionId: UnifiedSettingsSectionId
      source: "sub_agent_view"
      lifecycle: "active"
    }
  | {
      sectionId: UnifiedSettingsSectionId
      source: "unavailable"
      lifecycle: "unavailable"
    }

export const SETUP_SECTION_BODY_OWNERS: readonly SetupSectionBodyOwner[] = [
  { sectionId: "basics", source: "setup_step", setupStepId: "personal", lifecycle: "active" },
  { sectionId: "ai", source: "simple_body", simpleBodyId: "ai", lifecycle: "active" },
  { sectionId: "connections", source: "simple_body", simpleBodyId: "channels", lifecycle: "active" },
  { sectionId: "sub_agents", source: "sub_agent_view", lifecycle: "active" },
  { sectionId: "automation", source: "simple_body", simpleBodyId: "schedules", lifecycle: "active" },
  { sectionId: "memory", source: "simple_body", simpleBodyId: "memory", lifecycle: "active" },
  { sectionId: "permissions", source: "setup_step", setupStepId: "security", lifecycle: "active" },
  { sectionId: "diagnostics", source: "simple_body", simpleBodyId: "test", lifecycle: "active" },
]

export function resolveSetupSectionBodyOwner(
  sectionId: string | null | undefined,
): SetupSectionBodyOwner | null {
  return SETUP_SECTION_BODY_OWNERS.find((item) => item.sectionId === sectionId) ?? null
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function buildSetupSectionLifecycles(input: {
  draft: SetupDraft
  persisted: SetupDraft
  shell: UiShellResponse | null
  aiInputDirty?: boolean
  automationAvailable?: boolean
  memoryAvailable?: boolean
}): Record<UnifiedSettingsSectionId, SingleSettingsSectionLifecycle> {
  const basicsDirty = !sameValue(
    { personal: input.draft.personal, mainAgent: input.draft.mainAgent },
    { personal: input.persisted.personal, mainAgent: input.persisted.mainAgent },
  )
  const aiDirty = Boolean(input.aiInputDirty) || !sameValue(
    { aiBackends: input.draft.aiBackends, routingProfiles: input.draft.routingProfiles },
    { aiBackends: input.persisted.aiBackends, routingProfiles: input.persisted.routingProfiles },
  )
  const connectionsDirty = !sameValue(
    { channels: input.draft.channels, mqtt: input.draft.mqtt, remoteAccess: input.draft.remoteAccess },
    { channels: input.persisted.channels, mqtt: input.persisted.mqtt, remoteAccess: input.persisted.remoteAccess },
  )
  const subAgentsDirty = !sameValue(input.draft.subAgents, input.persisted.subAgents)
  const permissionsDirty = !sameValue(input.draft.security, input.persisted.security)
  const channels = input.shell?.runtimeHealth.channels
  const connectionsActive = Boolean(
    channels?.telegramEnabled
    || channels?.slackEnabled
    || channels?.discordEnabled
    || channels?.googleChatEnabled
    || channels?.imessageEnabled
    || channels?.kakaoTalkEnabled
    || input.shell?.runtimeHealth.yeonjang.connectedExtensions,
  )

  return {
    basics: basicsDirty ? "unsaved" : "clean",
    ai: aiDirty
      ? "unsaved"
      : input.shell?.runtimeHealth.ai.configured && input.shell.runtimeHealth.ai.modelConfigured
        ? "active"
        : "clean",
    connections: connectionsDirty ? "unsaved" : connectionsActive ? "active" : "clean",
    sub_agents: subAgentsDirty
      ? "unsaved"
      : (input.draft.subAgents?.runtimeActiveAgentIds.length ?? 0) > 0
        ? "active"
        : "clean",
    automation: input.automationAvailable ? "active" : "unavailable",
    memory: input.memoryAvailable ? "active" : "unavailable",
    permissions: permissionsDirty ? "unsaved" : "clean",
    diagnostics: input.shell ? "active" : "unavailable",
  }
}
