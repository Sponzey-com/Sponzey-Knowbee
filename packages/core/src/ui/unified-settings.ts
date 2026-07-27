export type UnifiedSettingsMode = "direct_main_agent" | "orchestration"
export type UnifiedSettingsMonitoringState = "idle" | "loaded" | "stale" | "partial" | "failed"
export type UnifiedSettingsMonitoringTone = "info" | "warning" | "success" | "error"

export type UnifiedSettingsLifecycleState =
  | "empty"
  | "drafting"
  | "validating"
  | "ready_to_save"
  | "saving"
  | "saved"
  | "activating"
  | "active"
  | "needs_attention"
  | "failed"
  | "cancelled"

export type UnifiedSettingsLifecycleEvent =
  | { type: "draft_started" }
  | { type: "field_changed" }
  | { type: "validation_requested" }
  | { type: "validation_succeeded" }
  | { type: "validation_failed"; reasonCode?: string }
  | { type: "save_requested" }
  | { type: "save_succeeded" }
  | { type: "save_failed"; reasonCode?: string }
  | { type: "activation_requested" }
  | { type: "activation_succeeded" }
  | { type: "activation_failed"; reasonCode?: string }
  | { type: "attention_acknowledged" }
  | { type: "cancel_requested" }

export interface UnifiedSettingsTransitionResult {
  state: UnifiedSettingsLifecycleState
  reasonCode?: string
}

export interface UnifiedSettingsRootAgentInput {
  id: string
  agentName?: string | undefined
}

export interface UnifiedSettingsAgentDetailInput {
  model?: {
    mode?: "inherit" | "override" | undefined
    providerLabel?: string | undefined
    modelLabel?: string | undefined
    fallbackModelLabel?: string | undefined
  } | undefined
  skillMcp?: {
    enabledSkillCount?: number | undefined
    enabledMcpServerCount?: number | undefined
    enabledToolCount?: number | undefined
  } | undefined
  memory?: {
    rawWindowSize?: number | undefined
    compactThreshold?: number | undefined
    capsuleMode?: string | undefined
    handoffCapsuleAllowed?: boolean | undefined
  } | undefined
  permissions?: {
    permissionProfile?: string | undefined
    allowedCount?: number | undefined
    deniedCount?: number | undefined
    approvalRequiredCount?: number | undefined
    osSensitiveCount?: number | undefined
  } | undefined
  delegation?: {
    canDelegate?: boolean | undefined
    directChildOnly?: boolean | undefined
    allowedChildCount?: number | undefined
    resultReviewRequired?: boolean | undefined
    redelegationAllowed?: boolean | undefined
    maxParallelSessions?: number | undefined
  } | undefined
  monitoring?: {
    logLevel?: string | undefined
    eventCount?: number | undefined
    activeRunCount?: number | undefined
    stale?: boolean | undefined
    state?: UnifiedSettingsMonitoringState | undefined
    treePaths?: string[] | undefined
    traceItems?: UnifiedSettingsMonitoringTraceInput[] | undefined
    reviewSummary?: string | undefined
    latestResultSummary?: string | undefined
  } | undefined
}

export interface UnifiedSettingsMonitoringTraceInput {
  actorLabel: string
  targetLabel?: string | undefined
  kind: string
  status: string
  summary?: string | undefined
  reason?: string | undefined
  reviewStatus?: string | undefined
  quality?: string | undefined
  latestResultSummary?: string | undefined
  redelegationSummary?: string | undefined
  atLabel?: string | undefined
}

export interface UnifiedSettingsAgentInput {
  id: string
  agentName?: string | undefined
  role?: string | undefined
  workDescription?: string | undefined
  parentId?: string | undefined
  detail?: UnifiedSettingsAgentDetailInput | undefined
}

export type UnifiedSettingsReadinessStatus = "ready" | "skipped" | "needs_attention" | "blocked"
export type UnifiedSettingsReadinessSeverity = "attention" | "blocked"

export type UnifiedSettingsReadinessIssueCode =
  | "sub_agent_required"
  | "agent_name_required"
  | "role_required"
  | "work_description_required"
  | "agent_name_duplicate"
  | "reserved_root_name"

export interface UnifiedSettingsReadinessIssue {
  code: UnifiedSettingsReadinessIssueCode
  severity: UnifiedSettingsReadinessSeverity
  agentId?: string | undefined
  field?: "agentName" | "role" | "workDescription" | undefined
}

export interface EvaluateUnifiedSettingsReadinessInput {
  mode: UnifiedSettingsMode
  rootAgent: UnifiedSettingsRootAgentInput
  agents: UnifiedSettingsAgentInput[]
}

export interface UnifiedSettingsReadinessResult {
  status: UnifiedSettingsReadinessStatus
  issues: UnifiedSettingsReadinessIssue[]
  reasonCodes: string[]
}

const RESERVED_ROOT_NAMES = new Set(["knowbee", "노비"])

function normalizeUnifiedSettingsMode(value: unknown): UnifiedSettingsMode {
  return value === "orchestration" ? "orchestration" : "direct_main_agent"
}

const TRANSITIONS: Record<UnifiedSettingsLifecycleState, Partial<Record<UnifiedSettingsLifecycleEvent["type"], UnifiedSettingsLifecycleState>>> = {
  empty: {
    draft_started: "drafting",
    cancel_requested: "cancelled",
  },
  drafting: {
    field_changed: "drafting",
    validation_requested: "validating",
    cancel_requested: "cancelled",
  },
  validating: {
    validation_succeeded: "ready_to_save",
    validation_failed: "needs_attention",
    cancel_requested: "cancelled",
  },
  ready_to_save: {
    field_changed: "drafting",
    save_requested: "saving",
    cancel_requested: "cancelled",
  },
  saving: {
    save_succeeded: "saved",
    save_failed: "failed",
    cancel_requested: "cancelled",
  },
  saved: {
    field_changed: "drafting",
    activation_requested: "activating",
    cancel_requested: "cancelled",
  },
  activating: {
    activation_succeeded: "active",
    activation_failed: "failed",
    cancel_requested: "cancelled",
  },
  active: {
    field_changed: "drafting",
    cancel_requested: "cancelled",
  },
  needs_attention: {
    field_changed: "drafting",
    validation_requested: "validating",
    cancel_requested: "cancelled",
  },
  failed: {
    field_changed: "drafting",
    validation_requested: "validating",
    cancel_requested: "cancelled",
  },
  cancelled: {
    draft_started: "drafting",
  },
}

export function transitionUnifiedSettingsState(
  state: UnifiedSettingsLifecycleState,
  event: UnifiedSettingsLifecycleEvent,
): UnifiedSettingsTransitionResult {
  const nextState = TRANSITIONS[state]?.[event.type]
  if (!nextState) return { state: "failed", reasonCode: "invalid_transition" }

  if (event.type === "validation_failed" || event.type === "save_failed" || event.type === "activation_failed") {
    return { state: nextState, reasonCode: event.reasonCode ?? event.type }
  }

  return { state: nextState }
}

export function evaluateUnifiedSettingsReadiness(input: EvaluateUnifiedSettingsReadinessInput): UnifiedSettingsReadinessResult {
  const issues: UnifiedSettingsReadinessIssue[] = []
  const mode = normalizeUnifiedSettingsMode(input.mode)

  if (mode === "direct_main_agent" && input.agents.length === 0) {
    return { status: "skipped", issues, reasonCodes: ["direct_main_agent_without_sub_agents"] }
  }

  if (mode === "orchestration" && input.agents.length === 0) {
    issues.push({ code: "sub_agent_required", severity: "attention" })
  }

  pushRequiredFieldIssues(issues, input.agents)
  pushReservedNameIssues(issues, input.rootAgent, input.agents)
  pushDuplicateIssues(issues, input.agents)

  const reasonCodes = [...new Set(issues.map((issue) => issue.code))]
  if (issues.some((issue) => issue.severity === "blocked")) return { status: "blocked", issues, reasonCodes }
  if (issues.length > 0) return { status: "needs_attention", issues, reasonCodes }
  return { status: "ready", issues, reasonCodes }
}

function pushRequiredFieldIssues(issues: UnifiedSettingsReadinessIssue[], agents: UnifiedSettingsAgentInput[]): void {
  for (const item of agents) {
    if (!agentNameForReadiness(item)) {
      issues.push({ code: "agent_name_required", severity: "attention", agentId: item.id, field: "agentName" })
    }
    if (!item.role?.trim()) {
      issues.push({ code: "role_required", severity: "attention", agentId: item.id, field: "role" })
    }
    if (!item.workDescription?.trim()) {
      issues.push({ code: "work_description_required", severity: "attention", agentId: item.id, field: "workDescription" })
    }
  }
}

function pushReservedNameIssues(
  issues: UnifiedSettingsReadinessIssue[],
  rootAgent: UnifiedSettingsRootAgentInput,
  agents: UnifiedSettingsAgentInput[],
): void {
  const reserved = new Set([
    ...RESERVED_ROOT_NAMES,
    normalizeName(rootAgent.agentName),
  ].filter(Boolean))
  for (const item of agents) {
    if (reserved.has(normalizeName(agentNameForReadiness(item)))) {
      issues.push({ code: "reserved_root_name", severity: "blocked", agentId: item.id, field: "agentName" })
    }
  }
}

function pushDuplicateIssues(issues: UnifiedSettingsReadinessIssue[], agents: UnifiedSettingsAgentInput[]): void {
  const names = new Map<string, UnifiedSettingsAgentInput[]>()

  for (const item of agents) {
    pushGrouped(names, normalizeName(agentNameForReadiness(item)), item)
  }

  for (const items of names.values()) {
    if (items.length < 2) continue
    for (const item of items) {
      issues.push({ code: "agent_name_duplicate", severity: "blocked", agentId: item.id, field: "agentName" })
    }
  }
}

function pushGrouped(groups: Map<string, UnifiedSettingsAgentInput[]>, key: string, item: UnifiedSettingsAgentInput): void {
  if (!key) return
  const group = groups.get(key)
  if (group) {
    group.push(item)
    return
  }
  groups.set(key, [item])
}

function normalizeName(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase()
}

function agentNameForReadiness(item: UnifiedSettingsAgentInput): string {
  return item.agentName?.trim() ?? ""
}

export type UnifiedSettingsLocale = "ko" | "en"
export type UnifiedSettingsSectionId = "required_setup" | "sub_agents" | "monitoring" | "diagnostics"
export type UnifiedSettingsSectionStatus = UnifiedSettingsReadinessStatus | "idle"
export type UnifiedSettingsDetailSectionId = "model" | "skill_mcp" | "memory" | "permissions" | "delegation" | "monitoring"
export type UnifiedSettingsActionId =
  | "create_first_sub_agent"
  | "review_issues"
  | "save_settings"
  | "activate_settings"
  | "select_agent"

export interface UnifiedSettingsActionView {
  id: UnifiedSettingsActionId
  label: string
  disabled: boolean
  disabledReason?: "readiness_blocked" | "not_ready_to_save" | "not_saved" | "no_sub_agents_configured" | undefined
  payload?: {
    agentId?: string | undefined
  } | undefined
}

export interface UnifiedSettingsSectionView {
  id: UnifiedSettingsSectionId
  title: string
  status: UnifiedSettingsSectionStatus
  itemCount: number
}

export interface UnifiedSettingsAgentView {
  label: string
  description: string
  role: string
  status: UnifiedSettingsReadinessStatus
  statusLabel: string
  parentLabel?: string | undefined
  childCount: number
  action: UnifiedSettingsActionView
}

export interface UnifiedSettingsDetailSectionView {
  id: UnifiedSettingsDetailSectionId
  title: string
  status: UnifiedSettingsSectionStatus
  summary: string
  itemCount: number
}

export interface UnifiedSettingsMonitoringTraceView {
  actorLabel: string
  targetLabel: string
  kind: string
  kindLabel: string
  status: string
  statusLabel: string
  tone: UnifiedSettingsMonitoringTone
  summary: string
  reason: string
  reviewStatus: string
  quality: string
  qualityLabel: string
  latestResultSummary: string
  redelegationSummary: string
  atLabel: string
}

export interface UnifiedSettingsMonitoringView {
  state: UnifiedSettingsMonitoringState
  statusLabel: string
  activeRunCount: number
  eventCount: number
  treePaths: string[]
  traceItems: UnifiedSettingsMonitoringTraceView[]
  reviewSummary: string
  latestResultSummary: string
}

export interface UnifiedSettingsSelectedAgentDetailView {
  label: string
  sections: UnifiedSettingsDetailSectionView[]
  monitoring?: UnifiedSettingsMonitoringView | undefined
}

export interface UnifiedSettingsGraphNodeView {
  label: string
  statusLabel: string
}

export interface UnifiedSettingsGraphEdgeView {
  sourceLabel: string
  targetLabel: string
}

export interface UnifiedSettingsViewModel {
  title: string
  summary: {
    productName: string
    mode: UnifiedSettingsMode
    lifecycleState: UnifiedSettingsLifecycleState
    status: UnifiedSettingsReadinessStatus
    statusLabel: string
    totalAgentCount: number
    issueCount: number
    primaryAction: UnifiedSettingsActionView
  }
  sections: UnifiedSettingsSectionView[]
  actions: UnifiedSettingsActionView[]
  agents: UnifiedSettingsAgentView[]
  selectedAgent?: UnifiedSettingsAgentView | undefined
  selectedAgentDetail?: UnifiedSettingsSelectedAgentDetailView | undefined
  graph: {
    nodes: UnifiedSettingsGraphNodeView[]
    edges: UnifiedSettingsGraphEdgeView[]
  }
  diagnostics: {
    issueCount: number
    blockedCount: number
    reasonCodes: string[]
    redactedFieldCount: number
  }
}

export interface BuildUnifiedSettingsViewModelInput extends EvaluateUnifiedSettingsReadinessInput {
  locale: UnifiedSettingsLocale
  productName: string
  lifecycleState: UnifiedSettingsLifecycleState
  selectedAgentId?: string | undefined
}

interface SanitizedText {
  value: string
  redactedCount: number
}

export function buildUnifiedSettingsViewModel(rawInput: BuildUnifiedSettingsViewModelInput): UnifiedSettingsViewModel {
  const input: BuildUnifiedSettingsViewModelInput = {
    ...rawInput,
    mode: normalizeUnifiedSettingsMode(rawInput.mode),
  }
  const readiness = evaluateUnifiedSettingsReadiness(input)
  const labels = buildUnifiedSettingsLabels(input.locale)
  const rootLabel = sanitizeText(input.rootAgent.agentName, input.productName)
  const redactionCounter = { count: rootLabel.redactedCount }
  const childCountByParentId = countChildrenByParentId(input)
  const labelByAgentId = new Map<string, string>([[input.rootAgent.id, rootLabel.value]])
  const agents = input.agents.map((item): UnifiedSettingsAgentView => {
    const label = firstSafeText([item.agentName], labels.fallbackAgentLabel)
    const role = sanitizeText(item.role, labels.fallbackRole)
    const description = sanitizeText(item.workDescription, labels.fallbackDescription)
    const status = readinessStatusForAgent(readiness, item.id)
    redactionCounter.count += label.redactedCount + role.redactedCount + description.redactedCount
    labelByAgentId.set(item.id, label.value)
    return {
      label: label.value,
      description: description.value,
      role: role.value,
      status,
      statusLabel: labels.status[status],
      parentLabel: labelByAgentId.get(item.parentId ?? input.rootAgent.id) ?? rootLabel.value,
      childCount: childCountByParentId.get(item.id) ?? 0,
      action: {
        id: "select_agent",
        label: labels.selectAgent,
        disabled: false,
        payload: { agentId: item.id },
      },
    }
  })

  const selectedAgentIndex = resolveSelectedAgentIndex(input)
  const selectedAgent = selectedAgentIndex >= 0 ? agents[selectedAgentIndex] : undefined
  const selectedAgentDetailResult = selectedAgent && input.agents[selectedAgentIndex]
    ? buildSelectedAgentDetail(input.agents[selectedAgentIndex], selectedAgent, labels)
    : undefined
  if (selectedAgentDetailResult) redactionCounter.count += selectedAgentDetailResult.redactedCount
  const actions = buildUnifiedSettingsActions(input, readiness, labels)
  if (selectedAgentIndex >= 0) {
    actions.push({
      id: "select_agent",
      label: labels.selectAgent,
      disabled: false,
      payload: { agentId: input.agents[selectedAgentIndex]?.id },
    })
  }

  const primaryAction = buildPrimaryAction(input, readiness, labels)
  return {
    title: labels.title,
    summary: {
      productName: input.productName,
      mode: input.mode,
      lifecycleState: input.lifecycleState,
      status: readiness.status,
      statusLabel: labels.status[readiness.status],
      totalAgentCount: input.agents.length,
      issueCount: readiness.issues.length,
      primaryAction,
    },
    sections: buildSections(input, readiness, labels),
    actions,
    agents,
    selectedAgent,
    selectedAgentDetail: selectedAgentDetailResult?.view,
    graph: buildGraph(input, labelByAgentId, rootLabel.value, readiness, labels),
    diagnostics: {
      issueCount: readiness.issues.length,
      blockedCount: readiness.issues.filter((issue) => issue.severity === "blocked").length,
      reasonCodes: readiness.reasonCodes,
      redactedFieldCount: redactionCounter.count,
    },
  }
}

function buildUnifiedSettingsLabels(locale: UnifiedSettingsLocale) {
  if (locale === "en") {
    return {
      title: "Sub-Agent Settings",
      requiredSetup: "Required Setup",
      subAgents: "Sub-Agents",
      monitoring: "Monitoring",
      diagnostics: "Diagnostics",
      createFirstSubAgent: "Add Sub-Agent",
      reviewIssues: "Review Required Items",
      saveSettings: "Save",
      activateSettings: "Activate",
      selectAgent: "View Selected Agent",
      fallbackAgentLabel: "Sub-Agent",
      fallbackDescription: "No description",
      fallbackRole: "No role",
      status: {
        ready: "Ready",
        skipped: "Not Used",
        needs_attention: "Needs Attention",
        blocked: "Blocked",
      },
      detail: {
        model: "Model",
        skillMcp: "Work Abilities / External Features",
        workAbilityCount: "Work abilities",
        externalFeatureCount: "External features",
        toolCount: "Tools",
        memory: "Memory",
        permissions: "Permissions",
        delegation: "Delegation",
        monitoring: "Monitoring",
        defaultProvider: "Provider",
        defaultModel: "Model",
        defaultFallbackModel: "Fallback",
        inheritModel: "Inherits default model",
        overrideModel: "Override",
        defaultMemory: "Default memory policy",
        noDelegation: "No child delegation",
        reviewOn: "review on",
        reviewOff: "review off",
        redelegationOn: "redelegation on",
        redelegationOff: "redelegation off",
        monitoringLoaded: "Loaded",
        monitoringIdle: "No trace events yet.",
        monitoringStale: "Refresh needed",
        monitoringPartial: "Partial trace",
        monitoringFailed: "Trace unavailable",
        noTrace: "No trace events yet.",
        noTarget: "No target",
        noResult: "No result",
        finalDeliveryAfterParentReview: "Final delivery prepared after parent review",
        parentAggregating: "Parent is aggregating child results.",
        parentReviewing: "Parent is reviewing child results.",
        redelegatedAfterReview: "Child result was refined and redelegated.",
        checkingRuntimeTrace: "Runtime trace is being checked.",
        secretRedacted: "[secret redacted]",
        internalId: "[internal id]",
        diagnosticRedacted: "[diagnostic redacted]",
      },
    }
  }

  return {
    title: "서브 에이전트 설정",
    requiredSetup: "필수 설정",
    subAgents: "서브 에이전트",
    monitoring: "모니터링",
    diagnostics: "진단",
    createFirstSubAgent: "서브 에이전트 추가",
    reviewIssues: "확인 항목 검토",
    saveSettings: "저장",
    activateSettings: "활성화",
    selectAgent: "선택한 에이전트 보기",
    fallbackAgentLabel: "서브 에이전트",
    fallbackDescription: "설명 미정",
    fallbackRole: "역할 미정",
    status: {
      ready: "준비됨",
      skipped: "사용 안 함",
      needs_attention: "확인 필요",
      blocked: "차단됨",
    },
    detail: {
      model: "모델",
      skillMcp: "작업 능력/외부 기능",
      workAbilityCount: "작업 능력",
      externalFeatureCount: "외부 기능",
      toolCount: "도구",
      memory: "메모리",
      permissions: "권한",
      delegation: "위임",
      monitoring: "모니터링",
      defaultProvider: "제공자",
      defaultModel: "모델",
      defaultFallbackModel: "대체 모델",
      inheritModel: "기본 모델 상속",
      overrideModel: "명시 모델",
      defaultMemory: "기본 메모리 정책",
      noDelegation: "하위 위임 없음",
      reviewOn: "검토 켬",
      reviewOff: "검토 끔",
      redelegationOn: "재위임 켬",
      redelegationOff: "재위임 끔",
      monitoringLoaded: "불러옴",
      monitoringIdle: "아직 trace event가 없습니다.",
      monitoringStale: "갱신 필요",
      monitoringPartial: "부분 trace",
      monitoringFailed: "trace 확인 불가",
      noTrace: "아직 trace event가 없습니다.",
      noTarget: "대상 없음",
      noResult: "결과 없음",
      finalDeliveryAfterParentReview: "부모 검토 후 final delivery 준비",
      parentAggregating: "부모가 하위 결과를 취합 중입니다.",
      parentReviewing: "부모가 하위 결과를 검토 중입니다.",
      redelegatedAfterReview: "하위 결과를 정리해 다시 위임했습니다.",
      checkingRuntimeTrace: "runtime trace를 확인 중입니다.",
      secretRedacted: "[secret redacted]",
      internalId: "[internal id]",
      diagnosticRedacted: "[진단 원문 숨김]",
    },
  }
}

function buildSections(
  input: BuildUnifiedSettingsViewModelInput,
  readiness: UnifiedSettingsReadinessResult,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsSectionView[] {
  return [
    {
      id: "required_setup",
      title: labels.requiredSetup,
      status: readiness.status,
      itemCount: readiness.issues.length,
    },
    {
      id: "sub_agents",
      title: labels.subAgents,
      status: readiness.status,
      itemCount: input.agents.length,
    },
    {
      id: "monitoring",
      title: labels.monitoring,
      status: input.agents.length > 0 ? "ready" : "idle",
      itemCount: input.agents.length,
    },
    {
      id: "diagnostics",
      title: labels.diagnostics,
      status: readiness.issues.length > 0 ? readiness.status : "ready",
      itemCount: readiness.issues.length,
    },
  ]
}

function buildUnifiedSettingsActions(
  input: BuildUnifiedSettingsViewModelInput,
  readiness: UnifiedSettingsReadinessResult,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsActionView[] {
  const saveDisabledReason = saveDisabledReasonFor(input, readiness)
  const activateDisabledReason = activateDisabledReasonFor(input, readiness)
  return [
    buildPrimaryAction(input, readiness, labels),
    {
      id: "save_settings",
      label: labels.saveSettings,
      disabled: Boolean(saveDisabledReason),
      disabledReason: saveDisabledReason,
    },
    {
      id: "activate_settings",
      label: labels.activateSettings,
      disabled: Boolean(activateDisabledReason),
      disabledReason: activateDisabledReason,
    },
  ]
}

function buildPrimaryAction(
  input: BuildUnifiedSettingsViewModelInput,
  readiness: UnifiedSettingsReadinessResult,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsActionView {
  if (input.agents.length === 0) {
    return {
      id: "create_first_sub_agent",
      label: labels.createFirstSubAgent,
      disabled: false,
    }
  }
  if (readiness.status === "blocked" || readiness.status === "needs_attention") {
    return {
      id: "review_issues",
      label: labels.reviewIssues,
      disabled: false,
    }
  }
  return {
    id: "save_settings",
    label: labels.saveSettings,
    disabled: Boolean(saveDisabledReasonFor(input, readiness)),
    disabledReason: saveDisabledReasonFor(input, readiness),
  }
}

function buildSelectedAgentDetail(
  input: UnifiedSettingsAgentInput,
  agent: UnifiedSettingsAgentView,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): { view: UnifiedSettingsSelectedAgentDetailView; redactedCount: number } {
  const redactionCounter = { count: 0 }
  const detail = input.detail ?? {}
  const monitoring = buildMonitoringDetailProjection(detail.monitoring, labels, redactionCounter)
  const sections = [
    buildModelDetailSection(detail.model, labels, redactionCounter),
    buildSkillMcpDetailSection(detail.skillMcp, labels),
    buildMemoryDetailSection(detail.memory, labels, redactionCounter),
    buildPermissionDetailSection(detail.permissions, labels, redactionCounter),
    buildDelegationDetailSection(detail.delegation, labels),
    monitoring.section,
  ]
  return {
    view: {
      label: agent.label,
      sections,
      monitoring: monitoring.view,
    },
    redactedCount: redactionCounter.count,
  }
}

function buildModelDetailSection(
  input: UnifiedSettingsAgentDetailInput["model"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
  redactionCounter: { count: number },
): UnifiedSettingsDetailSectionView {
  const provider = sanitizeText(input?.providerLabel, labels.detail.defaultProvider)
  const model = sanitizeText(input?.modelLabel, labels.detail.defaultModel)
  const fallback = sanitizeText(input?.fallbackModelLabel, labels.detail.defaultFallbackModel)
  redactionCounter.count += provider.redactedCount + model.redactedCount + fallback.redactedCount
  if (input?.mode === "override") {
    const fallbackText = fallback.value === labels.detail.defaultFallbackModel ? "" : `, ${fallback.value}`
    return {
      id: "model",
      title: labels.detail.model,
      status: "ready",
      summary: `${labels.detail.overrideModel}: ${provider.value} / ${model.value}${fallbackText}`,
      itemCount: 1,
    }
  }
  return {
    id: "model",
    title: labels.detail.model,
    status: input ? "ready" : "idle",
    summary: labels.detail.inheritModel,
    itemCount: 0,
  }
}

function buildSkillMcpDetailSection(
  input: UnifiedSettingsAgentDetailInput["skillMcp"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsDetailSectionView {
  const skillCount = safeCount(input?.enabledSkillCount)
  const mcpCount = safeCount(input?.enabledMcpServerCount)
  const toolCount = safeCount(input?.enabledToolCount)
  const total = skillCount + mcpCount + toolCount
  return {
    id: "skill_mcp",
    title: labels.detail.skillMcp,
    status: total > 0 ? "ready" : "idle",
    summary: `${labels.detail.workAbilityCount} ${skillCount}, ${labels.detail.externalFeatureCount} ${mcpCount}, ${labels.detail.toolCount} ${toolCount}`,
    itemCount: total,
  }
}

function buildMemoryDetailSection(
  input: UnifiedSettingsAgentDetailInput["memory"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
  redactionCounter: { count: number },
): UnifiedSettingsDetailSectionView {
  const rawWindowSize = safeCount(input?.rawWindowSize)
  const compactThreshold = safeCount(input?.compactThreshold)
  const capsuleMode = sanitizeText(input?.capsuleMode, "capsule")
  redactionCounter.count += capsuleMode.redactedCount
  if (rawWindowSize > 0 || compactThreshold > 0) {
    return {
      id: "memory",
      title: labels.detail.memory,
      status: "ready",
      summary: `Raw ${rawWindowSize}, 압축 ${compactThreshold}, ${capsuleMode.value}`,
      itemCount: [rawWindowSize, compactThreshold, input?.handoffCapsuleAllowed ? 1 : 0].filter((value) => value > 0).length,
    }
  }
  return {
    id: "memory",
    title: labels.detail.memory,
    status: input ? "ready" : "idle",
    summary: labels.detail.defaultMemory,
    itemCount: 0,
  }
}

function buildPermissionDetailSection(
  input: UnifiedSettingsAgentDetailInput["permissions"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
  redactionCounter: { count: number },
): UnifiedSettingsDetailSectionView {
  const profile = sanitizeText(input?.permissionProfile, "profile")
  redactionCounter.count += profile.redactedCount
  const allowed = safeCount(input?.allowedCount)
  const denied = safeCount(input?.deniedCount)
  const approval = safeCount(input?.approvalRequiredCount)
  const osSensitive = safeCount(input?.osSensitiveCount)
  return {
    id: "permissions",
    title: labels.detail.permissions,
    status: allowed + denied + approval + osSensitive > 0 ? "ready" : input ? "ready" : "idle",
    summary: `${profile.value}, 허용 ${allowed}, 차단 ${denied}, 승인 ${approval}, OS ${osSensitive}`,
    itemCount: allowed + denied + approval + osSensitive,
  }
}

function buildDelegationDetailSection(
  input: UnifiedSettingsAgentDetailInput["delegation"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsDetailSectionView {
  if (!input?.canDelegate) {
    return {
      id: "delegation",
      title: labels.detail.delegation,
      status: input ? "ready" : "idle",
      summary: labels.detail.noDelegation,
      itemCount: 0,
    }
  }
  const childCount = safeCount(input.allowedChildCount)
  const review = input.resultReviewRequired ? labels.detail.reviewOn : labels.detail.reviewOff
  const redelegation = input.redelegationAllowed ? labels.detail.redelegationOn : labels.detail.redelegationOff
  const maxParallelSessions = Math.max(1, safeCount(input.maxParallelSessions))
  return {
    id: "delegation",
    title: labels.detail.delegation,
    status: "ready",
    summary: `Child ${childCount}, ${review}, ${redelegation}, parallel ${maxParallelSessions}`,
    itemCount: childCount,
  }
}

function buildMonitoringDetailProjection(
  input: UnifiedSettingsAgentDetailInput["monitoring"],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
  redactionCounter: { count: number },
): { section: UnifiedSettingsDetailSectionView; view: UnifiedSettingsMonitoringView } {
  const logLevel = redactMonitoringText(input?.logLevel, "product", labels)
  redactionCounter.count += logLevel.redactedCount
  const eventCount = safeCount(input?.eventCount ?? input?.traceItems?.length)
  const activeRunCount = safeCount(input?.activeRunCount)
  const traceItems = (input?.traceItems ?? []).map((item) => buildMonitoringTraceItem(item, labels, redactionCounter))
  const treePaths = (input?.treePaths ?? []).map((path) => {
    const result = redactMonitoringText(path, labels.detail.noTarget, labels)
    redactionCounter.count += result.redactedCount
    return result.value
  })
  const state = resolveMonitoringState(input, eventCount, traceItems.length)
  const reviewSummary = input?.reviewSummary
    ? redactMonitoringText(input.reviewSummary, labels.detail.checkingRuntimeTrace, labels)
    : { value: monitoringReviewSummary(traceItems, labels), redactedCount: 0 }
  const latestResultSummary = input?.latestResultSummary
    ? redactMonitoringText(input.latestResultSummary, labels.detail.noResult, labels)
    : { value: latestMonitoringResultSummary(traceItems, labels), redactedCount: 0 }
  redactionCounter.count += reviewSummary.redactedCount + latestResultSummary.redactedCount
  const statusLabel = monitoringStateLabel(state, labels)

  return {
    section: {
      id: "monitoring",
      title: labels.detail.monitoring,
      status: state === "stale" || state === "partial" || state === "failed" ? "needs_attention" : traceItems.length > 0 || activeRunCount > 0 ? "ready" : "idle",
      summary: `Event ${eventCount}, active ${activeRunCount}, ${statusLabel}`,
      itemCount: eventCount + activeRunCount,
    },
    view: {
      state,
      statusLabel,
      activeRunCount,
      eventCount,
      treePaths,
      traceItems,
      reviewSummary: reviewSummary.value,
      latestResultSummary: latestResultSummary.value,
    },
  }
}

function resolveMonitoringState(
  input: UnifiedSettingsAgentDetailInput["monitoring"],
  eventCount: number,
  traceItemCount: number,
): UnifiedSettingsMonitoringState {
  if (input?.state) return input.stale ? "stale" : input.state
  if (input?.stale) return "stale"
  if (eventCount > 0 || traceItemCount > 0) return "loaded"
  if (safeCount(input?.activeRunCount) > 0) return "partial"
  return "idle"
}

function monitoringStateLabel(
  state: UnifiedSettingsMonitoringState,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): string {
  if (state === "loaded") return labels.detail.monitoringLoaded
  if (state === "stale") return labels.detail.monitoringStale
  if (state === "partial") return labels.detail.monitoringPartial
  if (state === "failed") return labels.detail.monitoringFailed
  return labels.detail.monitoringIdle
}

function buildMonitoringTraceItem(
  input: UnifiedSettingsMonitoringTraceInput,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
  redactionCounter: { count: number },
): UnifiedSettingsMonitoringTraceView {
  const actorLabel = redactMonitoringText(input.actorLabel, labels.fallbackAgentLabel, labels)
  const targetLabel = redactMonitoringText(input.targetLabel, labels.detail.noTarget, labels)
  const summary = redactMonitoringText(input.summary, monitoringKindLabel(input.kind, labels), labels)
  const reason = redactMonitoringText(input.reason, "", labels)
  const reviewStatus = redactMonitoringText(input.reviewStatus, "", labels)
  const quality = redactMonitoringText(input.quality, "", labels)
  const latestResultSummary = redactMonitoringText(input.latestResultSummary, "", labels)
  const redelegationSummary = redactMonitoringText(input.redelegationSummary, "", labels)
  const atLabel = redactMonitoringText(input.atLabel, "", labels)
  redactionCounter.count += actorLabel.redactedCount + targetLabel.redactedCount + summary.redactedCount + reason.redactedCount +
    reviewStatus.redactedCount + quality.redactedCount + latestResultSummary.redactedCount + redelegationSummary.redactedCount + atLabel.redactedCount
  return {
    actorLabel: actorLabel.value,
    targetLabel: targetLabel.value,
    kind: input.kind,
    kindLabel: monitoringKindLabel(input.kind, labels),
    status: input.status,
    statusLabel: monitoringStatusLabel(input.status, labels),
    tone: monitoringTone(input.status, input.kind, input.quality),
    summary: summary.value,
    reason: reason.value,
    reviewStatus: reviewStatus.value,
    quality: quality.value,
    qualityLabel: monitoringQualityLabel(input.quality, labels),
    latestResultSummary: latestResultSummary.value,
    redelegationSummary: redelegationSummary.value,
    atLabel: atLabel.value,
  }
}

function monitoringReviewSummary(
  traceItems: UnifiedSettingsMonitoringTraceView[],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): string {
  if (traceItems.length === 0) return labels.detail.noTrace
  if (traceItems.some((item) => item.reviewStatus === "final_ready" || item.kind === "final_delivery_prepared")) {
    return labels.detail.finalDeliveryAfterParentReview
  }
  if (traceItems.some((item) => item.reviewStatus === "aggregated" || item.kind === "parent_aggregating")) {
    return labels.detail.parentAggregating
  }
  if (traceItems.some((item) => item.reviewStatus === "reviewing_child_result" || item.kind === "parent_reviewing")) {
    return labels.detail.parentReviewing
  }
  if (traceItems.some((item) => item.kind === "redelegation_planned" || item.reviewStatus === "needs_redelegation")) {
    return labels.detail.redelegatedAfterReview
  }
  return labels.detail.checkingRuntimeTrace
}

function latestMonitoringResultSummary(
  traceItems: UnifiedSettingsMonitoringTraceView[],
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): string {
  return [...traceItems].reverse().find((item) => item.latestResultSummary)?.latestResultSummary ?? labels.detail.noResult
}

function monitoringTone(status: string, kind: string, quality: string | undefined): UnifiedSettingsMonitoringTone {
  if (status === "completed") return "success"
  if (status === "blocked" || status === "cancelled" || status === "failed") return "error"
  if (status === "reviewing" || kind === "redelegation_planned" || (quality && quality !== "sufficient")) return "warning"
  return "info"
}

function monitoringStatusLabel(status: string, labels: ReturnType<typeof buildUnifiedSettingsLabels>): string {
  if (status === "pending") return labels.detail.monitoringPartial
  if (status === "running") return labels.detail.monitoringLoaded
  if (status === "reviewing") return labels.detail.parentReviewing
  if (status === "completed") return labels.status.ready
  if (status === "blocked") return labels.status.blocked
  if (status === "cancelled") return labels.detail.monitoringFailed
  return status
}

function monitoringKindLabel(kind: string, labels: ReturnType<typeof buildUnifiedSettingsLabels>): string {
  const kindLabels: Record<string, string> = {
    request_received: labels.detail.checkingRuntimeTrace,
    delegation_planned: labels.detail.delegation,
    child_result_returned: labels.detail.parentReviewing,
    parent_reviewing: labels.detail.parentReviewing,
    parent_aggregating: labels.detail.parentAggregating,
    redelegation_planned: labels.detail.redelegatedAfterReview,
    final_delivery_prepared: labels.detail.finalDeliveryAfterParentReview,
    completed: labels.status.ready,
    blocked: labels.status.blocked,
    cancelled: labels.detail.monitoringFailed,
  }
  return kindLabels[kind] ?? kind
}

function monitoringQualityLabel(quality: string | undefined, labels: ReturnType<typeof buildUnifiedSettingsLabels>): string {
  if (!quality) return ""
  if (quality === "sufficient") return labels.status.ready
  if (quality === "missing_information") return labels.status.needs_attention
  if (quality === "needs_verification") return labels.status.needs_attention
  if (quality === "permission_required") return labels.detail.permissions
  if (quality === "split_required") return labels.detail.redelegatedAfterReview
  return labels.status.needs_attention
}

function redactMonitoringText(
  value: string | undefined,
  fallback: string,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): SanitizedText {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: fallback, redactedCount: 0 }
  if (/^[[{]/.test(trimmed)) return { value: fallback, redactedCount: 1 }
  let redactedCount = 0
  let result = trimmed
  const replace = (pattern: RegExp, replacement: string) => {
    result = result.replace(pattern, (...args: unknown[]) => {
      redactedCount += 1
      return replacement
    })
  }
  replace(/sk-[A-Za-z0-9_-]{4,}/giu, labels.detail.secretRedacted)
  replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu, `$1${labels.detail.secretRedacted}@`)
  replace(/\b(api[_-]?key|token|password|secret)=\S+/giu, `$1=${labels.detail.secretRedacted}`)
  replace(/Bearer\s+[A-Za-z0-9._-]+/giu, `Bearer ${labels.detail.secretRedacted}`)
  replace(/\b(?:agent|node|run|task|evt|trace):[A-Za-z0-9_.:-]+/giu, labels.detail.internalId)
  replace(/\b(?:raw payload|raw tool input|raw tool output|raw screenshot binary|stack trace)\b/giu, labels.detail.diagnosticRedacted)
  return { value: result, redactedCount }
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) && value !== undefined ? Math.max(0, Math.floor(value)) : 0
}

function saveDisabledReasonFor(
  input: BuildUnifiedSettingsViewModelInput,
  readiness: UnifiedSettingsReadinessResult,
): UnifiedSettingsActionView["disabledReason"] {
  if (readiness.status === "blocked") return "readiness_blocked"
  if (input.agents.length === 0) return "no_sub_agents_configured"
  if (input.lifecycleState !== "ready_to_save" && input.lifecycleState !== "drafting") return "not_ready_to_save"
  return undefined
}

function activateDisabledReasonFor(
  input: BuildUnifiedSettingsViewModelInput,
  readiness: UnifiedSettingsReadinessResult,
): UnifiedSettingsActionView["disabledReason"] {
  if (readiness.status === "blocked") return "readiness_blocked"
  if (input.agents.length === 0) return "no_sub_agents_configured"
  if (input.lifecycleState !== "saved") return "not_saved"
  return undefined
}

function countChildrenByParentId(input: EvaluateUnifiedSettingsReadinessInput): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of input.agents) {
    const parentId = item.parentId ?? input.rootAgent.id
    counts.set(parentId, (counts.get(parentId) ?? 0) + 1)
  }
  return counts
}

function resolveSelectedAgentIndex(input: BuildUnifiedSettingsViewModelInput): number {
  if (input.agents.length === 0) return -1
  const selectedIndex = input.selectedAgentId ? input.agents.findIndex((item) => item.id === input.selectedAgentId) : -1
  return selectedIndex >= 0 ? selectedIndex : 0
}

function buildGraph(
  input: BuildUnifiedSettingsViewModelInput,
  labelByAgentId: Map<string, string>,
  rootLabel: string,
  readiness: UnifiedSettingsReadinessResult,
  labels: ReturnType<typeof buildUnifiedSettingsLabels>,
): UnifiedSettingsViewModel["graph"] {
  return {
    nodes: [
      { label: rootLabel, statusLabel: labels.status.ready },
      ...input.agents.map((item) => ({
        label: labelByAgentId.get(item.id) ?? labels.fallbackAgentLabel,
        statusLabel: labels.status[readinessStatusForAgent(readiness, item.id)],
      })),
    ],
    edges: input.agents.map((item) => ({
      sourceLabel: labelByAgentId.get(item.parentId ?? input.rootAgent.id) ?? rootLabel,
      targetLabel: labelByAgentId.get(item.id) ?? labels.fallbackAgentLabel,
    })),
  }
}

function readinessStatusForAgent(
  readiness: UnifiedSettingsReadinessResult,
  agentId: string,
): UnifiedSettingsReadinessStatus {
  const issues = readiness.issues.filter((issue) => issue.agentId === agentId)
  if (issues.some((issue) => issue.severity === "blocked")) return "blocked"
  if (issues.length > 0) return "needs_attention"
  return readiness.status === "skipped" ? "skipped" : "ready"
}

function firstSafeText(values: Array<string | undefined>, fallback: string): SanitizedText {
  let totalRedacted = 0
  for (const value of values) {
    const safe = sanitizeText(value, fallback)
    totalRedacted += safe.redactedCount
    if (safe.value !== fallback) return { value: safe.value, redactedCount: totalRedacted }
  }
  return { value: fallback, redactedCount: totalRedacted }
}

function sanitizeText(value: string | undefined, fallback: string): SanitizedText {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return { value: fallback, redactedCount: 0 }
  if (isUnsafeUserText(trimmed)) return { value: fallback, redactedCount: 1 }
  return { value: trimmed, redactedCount: 0 }
}

function isUnsafeUserText(value: string): boolean {
  return (
    /^[[{]/.test(value) ||
    /["']?(token|secret|raw|apiKey|password)["']?\s*:/i.test(value) ||
    /\bBearer\s+\S+/i.test(value) ||
    /\bsk-[A-Za-z0-9_-]{8,}/i.test(value) ||
    /\bxox[a-z]-[A-Za-z0-9_-]{8,}/i.test(value) ||
    /\/Users\/[^\s"']+/i.test(value) ||
    /\bagent:[A-Za-z0-9:_-]+/i.test(value)
  )
}
