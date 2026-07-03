import {
  buildUnifiedSettingsViewModel,
  type UnifiedSettingsLifecycleState,
  type UnifiedSettingsViewModel,
} from "../../../core/src/ui/unified-settings.js"
import type { SetupDraft, SetupSubAgentDraftItem, SetupSubAgentMonitoringEvent } from "../contracts/setup"
import type { UiLanguage } from "../stores/uiLanguage"

const ROOT_AGENT_ID = "agent:knowbee"

export interface BuildUnifiedSettingsViewForSetupDraftInput {
  draft: SetupDraft
  language: UiLanguage
  selectedAgentId?: string | null | undefined
  lifecycleState?: UnifiedSettingsLifecycleState | undefined
  now?: number | undefined
}

export function buildUnifiedSettingsViewForSetupDraft(
  input: BuildUnifiedSettingsViewForSetupDraftInput,
): UnifiedSettingsViewModel {
  const subAgents = input.draft.subAgents
  const activeItems = activeSubAgentItems(subAgents?.items ?? [])
  const productName = input.language === "ko" ? "노비" : "Knowbee"

  return buildUnifiedSettingsViewModel({
    locale: input.language,
    productName,
    lifecycleState: input.lifecycleState ?? "drafting",
    mode: subAgents?.orchestrationEnabled ? "orchestration" : "single_knowbee",
    rootAgent: {
      id: ROOT_AGENT_ID,
      displayName: "Knowbee",
      nickname: productName,
    },
    selectedAgentId: input.selectedAgentId ?? undefined,
    agents: activeItems.map((item) => ({
      id: item.agentId,
      displayName: item.displayName,
      nickname: item.nickname,
      role: item.role,
      workDescription: item.description,
      parentId: item.parentAgentId ?? ROOT_AGENT_ID,
      detail: buildUnifiedSettingsAgentDetail(item, input.draft, input.language, input.now),
    })),
  })
}

function activeSubAgentItems(items: SetupSubAgentDraftItem[]): SetupSubAgentDraftItem[] {
  return items.filter((item) => item.status !== "archived")
}

function buildUnifiedSettingsAgentDetail(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
  now: number | undefined,
) {
  const subAgents = draft.subAgents
  const monitoringEvents = subAgents?.monitoring?.events?.filter((event) =>
    event.actorAgentId === item.agentId || event.targetAgentId === item.agentId
  ) ?? []
  const monitoringProjection = buildMonitoringProjectionForAgent(item, draft, language, now)

  return {
    model: {
      mode: item.modelPolicy?.mode ?? "inherit",
      providerLabel: item.modelPolicy?.providerId,
      modelLabel: item.modelPolicy?.modelId,
      fallbackModelLabel: item.modelPolicy?.fallbackModelId,
    },
    skillMcp: {
      enabledSkillCount: item.skillMcpBindings?.enabledSkillIds.length ?? 0,
      enabledMcpServerCount: item.skillMcpBindings?.enabledMcpServerIds.length ?? 0,
      enabledToolCount: item.skillMcpBindings?.enabledToolNames.length ?? 0,
    },
    memory: {
      rawWindowSize: item.memoryPolicy?.rawWindowSize,
      compactThreshold: item.memoryPolicy?.compactThreshold,
      capsuleMode: item.memoryPolicy?.capsuleMode,
      handoffCapsuleAllowed: item.memoryPolicy?.handoffCapsuleAllowed,
    },
    permissions: {
      permissionProfile: typeof item.capabilityPolicy?.permissionProfile === "string"
        ? item.capabilityPolicy.permissionProfile
        : item.capabilityPolicy?.permissionProfile?.profileId,
      allowedCount: item.capabilityPolicy?.allowedCapabilityIds.length ?? 0,
      deniedCount: item.capabilityPolicy?.deniedCapabilityIds.length ?? 0,
      approvalRequiredCount: item.capabilityPolicy?.approvalRequiredCapabilityIds.length ?? 0,
      osSensitiveCount: item.capabilityPolicy?.osSensitiveCapabilityIds.length ?? 0,
    },
    delegation: {
      canDelegate: item.delegationPolicy?.canDelegate ?? false,
      directChildOnly: item.delegationPolicy?.directChildOnly ?? true,
      allowedChildCount: item.delegationPolicy?.allowedChildAgentIds.length ?? 0,
      resultReviewRequired: item.delegationPolicy?.resultReviewRequired ?? false,
      redelegationAllowed: item.delegationPolicy?.redelegationAllowed ?? false,
      maxParallelSessions: item.delegationPolicy?.maxParallelSessions ?? 1,
    },
    monitoring: {
      logLevel: subAgents?.monitoring?.logLevel ?? item.capabilityPolicy?.logVisibility ?? "product",
      eventCount: monitoringProjection.traceItems.length || monitoringEvents.length,
      activeRunCount: subAgents?.monitoring?.activeRunIds?.length ?? 0,
      stale: monitoringProjection.state === "stale",
      state: monitoringProjection.state,
      treePaths: monitoringProjection.treePaths,
      traceItems: monitoringProjection.traceItems,
    },
  }
}

function buildMonitoringProjectionForAgent(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
  now: number | undefined,
) {
  const monitoring = draft.subAgents?.monitoring
  const events = validMonitoringEvents(monitoring?.events)
  const relevantEvents = events.filter((event) => monitoringEventTouchesAgent(event, item.agentId, draft))
  const activeRunCount = monitoring?.activeRunIds?.length ?? 0
  const stale = typeof now === "number" &&
    typeof monitoring?.refreshedAt === "number" &&
    typeof monitoring.staleAfterMs === "number" &&
    monitoring.refreshedAt + monitoring.staleAfterMs < now
  const state = stale
    ? "stale"
    : relevantEvents.length > 0
      ? "loaded"
      : activeRunCount > 0
        ? "partial"
        : "idle"
  return {
    state,
    treePaths: Array.from(new Set(
      relevantEvents
        .flatMap(monitoringEventAgentIds)
        .map((agentId) => agentTreePathLabel(agentId, draft, language))
        .filter(Boolean),
    )),
    traceItems: relevantEvents.map((event) => monitoringTraceInputForEvent(event, draft, language)),
  }
}

function validMonitoringEvents(events: SetupSubAgentMonitoringEvent[] | undefined): SetupSubAgentMonitoringEvent[] {
  return [...(events ?? [])]
    .filter((event): event is SetupSubAgentMonitoringEvent =>
      Boolean(event?.eventId && event.runId && event.actorAgentId && event.kind && event.status),
    )
    .sort((left, right) => left.at - right.at)
}

function monitoringTraceInputForEvent(
  event: SetupSubAgentMonitoringEvent,
  draft: SetupDraft,
  language: UiLanguage,
) {
  return {
    actorLabel: monitoringLabelForAgentId(event.actorAgentId, draft, language),
    targetLabel: monitoringLabelForAgentId(event.targetAgentId, draft, language),
    kind: event.kind,
    status: event.status,
    summary: event.summary,
    reason: event.reason,
    reviewStatus: event.reviewStatus,
    quality: event.quality,
    latestResultSummary: event.latestResultSummary,
    redelegationSummary: redelegationSummaryForEvent(event, draft, language),
  }
}

function monitoringLabelForAgentId(
  agentId: string | undefined,
  draft: SetupDraft,
  language: UiLanguage,
): string {
  if (!agentId) return language === "ko" ? "대상 없음" : "No target"
  if (agentId === ROOT_AGENT_ID) return language === "ko" ? "노비" : "Knowbee"
  const item = draft.subAgents?.items.find((candidate) => candidate.agentId === agentId)
  return item?.nickname?.trim() || item?.displayName?.trim() || (language === "ko" ? "알 수 없는 에이전트" : "Unknown agent")
}

function agentPathIds(agentId: string | undefined, draft: SetupDraft): string[] {
  if (!agentId) return []
  if (agentId === ROOT_AGENT_ID) return [ROOT_AGENT_ID]
  const byId = new Map((draft.subAgents?.items ?? []).map((candidate) => [candidate.agentId, candidate]))
  const path: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = agentId
  while (current && !seen.has(current)) {
    seen.add(current)
    path.unshift(current)
    if (current === ROOT_AGENT_ID) break
    const found = byId.get(current)
    current = found ? (found.parentAgentId ?? ROOT_AGENT_ID) : undefined
  }
  if (path[0] !== ROOT_AGENT_ID) path.unshift(ROOT_AGENT_ID)
  return path
}

function agentTreePathLabel(agentId: string | undefined, draft: SetupDraft, language: UiLanguage): string {
  return agentPathIds(agentId, draft)
    .map((pathAgentId) => monitoringLabelForAgentId(pathAgentId, draft, language))
    .join(" -> ")
}

function monitoringEventAgentIds(event: SetupSubAgentMonitoringEvent): string[] {
  return [
    event.actorAgentId,
    event.targetAgentId,
    event.redelegation?.previousChildAgentId,
    event.redelegation?.nextTargetAgentId,
  ].filter((agentId): agentId is string => Boolean(agentId))
}

function monitoringEventTouchesAgent(event: SetupSubAgentMonitoringEvent, agentId: string, draft: SetupDraft): boolean {
  return monitoringEventAgentIds(event).some((eventAgentId) => eventAgentId === agentId || agentPathIds(eventAgentId, draft).includes(agentId))
}

function redelegationSummaryForEvent(
  event: SetupSubAgentMonitoringEvent,
  draft: SetupDraft,
  language: UiLanguage,
): string | undefined {
  const redelegation = event.redelegation
  if (!redelegation) return undefined
  const nextTarget = monitoringLabelForAgentId(redelegation.nextTargetAgentId, draft, language)
  return [
    redelegation.previousResultSummary
      ? language === "ko" ? `이전 결과: ${redelegation.previousResultSummary}` : `Previous result: ${redelegation.previousResultSummary}`
      : "",
    redelegation.refinedInstructionSummary ?? "",
    redelegation.changedInputSummary
      ? language === "ko" ? `변경 입력: ${redelegation.changedInputSummary}` : `Changed input: ${redelegation.changedInputSummary}`
      : "",
    redelegation.validationMethod
      ? language === "ko" ? `검증: ${redelegation.validationMethod}` : `Validation: ${redelegation.validationMethod}`
      : "",
    redelegation.nextTargetAgentId
      ? language === "ko" ? `다시 위임 대상: ${nextTarget}` : `Redelegated to: ${nextTarget}`
      : "",
  ].filter(Boolean).join(" · ")
}
