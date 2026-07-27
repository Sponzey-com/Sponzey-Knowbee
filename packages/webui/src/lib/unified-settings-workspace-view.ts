import type { UiShellResponse } from "../api/client"
import type { SetupDraft } from "../contracts/setup"
import type { UiLanguage } from "../stores/uiLanguage"
import {
  buildSingleSettingsWorkspace,
  type SingleSettingsSectionLifecycle,
} from "./unified-settings-workspace"
import {
  buildUnifiedSettingsViewForSetupDraft,
} from "./unified-settings-view"
import type { UnifiedSettingsSectionId } from "./unified-settings-ownership"

export interface BuildSingleSettingsWorkspaceForSetupInput {
  draft: SetupDraft
  shell: UiShellResponse | null
  language: UiLanguage
  adminEnabled: boolean
  selectedSectionId?: string | null
  selectedAgentId?: string | null
  lifecycleBySection: Partial<Record<UnifiedSettingsSectionId, SingleSettingsSectionLifecycle>>
}

export function buildSingleSettingsWorkspaceForSetup(
  input: BuildSingleSettingsWorkspaceForSetupInput,
) {
  const lifecycleBySection = {
    ...input.lifecycleBySection,
    ...(input.shell
      ? {}
      : { diagnostics: "unavailable" as const }),
  }

  return {
    workspace: buildSingleSettingsWorkspace({
      locale: input.language,
      adminEnabled: input.adminEnabled,
      selectedSectionId: input.selectedSectionId,
      lifecycleBySection,
    }),
    subAgents: buildUnifiedSettingsViewForSetupDraft({
      draft: input.draft,
      language: input.language,
      selectedAgentId: input.selectedAgentId,
    }),
  }
}
