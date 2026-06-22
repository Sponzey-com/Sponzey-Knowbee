import type {
  AgentRelationship,
  MemoryPolicy,
  OwnerScope,
  PermissionProfile,
  SkillMcpAllowlist,
  SubAgentConfig,
} from "../../../core/src/contracts/sub-agent-orchestration.js"
import {
  type SubAgentSettingsValidationIssue,
  type UpdateSubAgentCapabilityPolicyCommand,
  type UpdateSubAgentDelegationPolicyCommand,
  type UpdateSubAgentIdentityCommand,
  type UpdateSubAgentMemoryPolicyCommand,
  type UpdateSubAgentModelPolicyCommand,
  type UpdateSubAgentSkillMcpBindingsCommand,
  validateSubAgentSettingsCommand,
} from "../../../core/src/ui/sub-agent-settings.js"
import type {
  SetupDraft,
  SetupSubAgentDraft,
  SetupSubAgentDraftItem,
  SetupSubAgentMonitoringDraft,
  SetupSubAgentMonitoringEvent,
  SetupSubAgentMonitoringEventKind,
  SetupSubAgentMonitoringEventStatus,
  SetupSubAgentMonitoringLogLevel,
  SetupSubAgentMonitoringQuality,
  SetupSubAgentMonitoringReviewStatus,
} from "../contracts/setup"
import type { UiLanguage } from "../stores/uiLanguage"
import { pickUiText } from "../stores/uiLanguage"

export type {
  UpdateSubAgentIdentityCommand,
  UpdateSubAgentModelPolicyCommand,
  UpdateSubAgentSkillMcpBindingsCommand,
  UpdateSubAgentMemoryPolicyCommand,
  UpdateSubAgentCapabilityPolicyCommand,
  UpdateSubAgentDelegationPolicyCommand,
} from "../../../core/src/ui/sub-agent-settings.js"

export type SubAgentAdvancedFilter = "active" | "all" | "needs_attention" | "runtime_pending"
export type SubAgentAdvancedSectionId =
  | "identity"
  | "model"
  | "skill_mcp"
  | "memory"
  | "permission"
  | "delegation"
  | "monitoring"

export interface SubAgentAdvancedSettingsView {
  globalPolicy: SubAgentAdvancedGlobalPolicyView
  rows: SubAgentAdvancedListRowView[]
  selectedAgent: SubAgentAdvancedDetailView | null
  selectedAgentId: string | null
  emptyState: {
    kind: "single_knowbee" | "orchestration_empty" | "filtered_empty" | "none"
    title: string
    message: string
    ctaLabel: string
  }
  statusBar: SubAgentAdvancedStatusBarView
  archivedHiddenCount: number
  filter: SubAgentAdvancedFilter
  query: string
}

export interface SubAgentAdvancedGlobalPolicyView {
  rootAgentLabel: string
  rootAgentNotice: string
  orchestrationModeLabel: string
  featureFlagLabel: string
  defaultModelLabel: string
  defaultMemoryLabel: string
  defaultPermissionLabel: string
  commonSkillMcpLabel: string
  affectedAgentCount: number
  inheritedAgentCount: number
  overriddenAgentCount: number
  catalogSummary: string
  impactSummary: string
}

export interface SubAgentAdvancedListRowView {
  agentId: string
  displayName: string
  nickname: string
  role: string
  lifecycleState: SetupSubAgentDraftItem["status"]
  lifecycleLabel: string
  readinessState: "ready" | "needs_attention" | "runtime_pending" | "disabled"
  readinessLabel: string
  runtimeState: "active" | "pending" | "inactive"
  runtimeLabel: string
  warningCount: number
  lastUpdatedLabel: string
  selected: boolean
}

export interface SubAgentAdvancedDetailSectionView {
  id: SubAgentAdvancedSectionId
  title: string
  summary: string
  helper: string
  inheritanceState: "global" | "inherited" | "overridden" | "agent_only"
  tone: "info" | "success" | "warning" | "error"
  items: string[]
}

export interface SubAgentAdvancedDetailView {
  agentId: string
  displayName: string
  nickname: string
  role: string
  description: string
  lifecycleLabel: string
  readinessLabel: string
  runtimeLabel: string
  parentLabel: string
  identity: SubAgentAdvancedIdentityView
  modelPolicy: SubAgentAdvancedModelPolicyView
  skillMcp: SubAgentAdvancedSkillMcpView
  memory: SubAgentAdvancedMemoryPolicyView
  permission: SubAgentAdvancedPermissionPolicyView
  delegation: SubAgentAdvancedDelegationPolicyView
  monitoring: SubAgentAdvancedMonitoringView
  sections: SubAgentAdvancedDetailSectionView[]
}

export interface SubAgentAdvancedIdentityView {
  displayName: string
  nickname: string
  role: string
  description: string
  parentLabel: string
  attributionLabel: string
  internalDebugId: string
  rootReadOnly: boolean
  warnings: string[]
  errors: string[]
}

export interface SubAgentAdvancedModelOptionView {
  providerId: string
  providerLabel: string
  modelId: string
  label: string
  available: boolean
  reason: string
}

export interface SubAgentAdvancedModelPolicyView {
  mode: "inherit" | "override"
  providerId: string
  modelId: string
  fallbackModelId: string
  inheritedModelLabel: string
  effectiveModelLabel: string
  badges: string[]
  options: SubAgentAdvancedModelOptionView[]
  providerOptions: Array<{ id: string; label: string; available: boolean }>
  runtimeReflectionRequired: boolean
  warnings: string[]
  errors: string[]
}

export type SubAgentAdvancedConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "degraded"
  | "permission_required"
  | "unavailable"

export interface SubAgentAdvancedSkillMcpCatalogItemView {
  id: string
  kind: "skill" | "mcp_server" | "mcp_tool"
  parentId?: string
  label: string
  description: string
  sourceLabel: string
  available: boolean
  required: boolean
  enabledForAgent: boolean
  recommendedForAgent: boolean
  approvalRequired: boolean
  riskLabel: "safe" | "moderate" | "external" | "sensitive" | "dangerous"
  connectionState: SubAgentAdvancedConnectionState
  statusLabel: string
  warning: string
}

export interface SubAgentAdvancedSkillMcpView {
  commonCatalogLabel: string
  enabledSkillIds: string[]
  enabledMcpServerIds: string[]
  enabledToolNames: string[]
  disabledToolNames: string[]
  recommendedSkillIds: string[]
  recommendedMcpServerIds: string[]
  items: SubAgentAdvancedSkillMcpCatalogItemView[]
  skillCount: number
  mcpServerCount: number
  enabledCount: number
  unavailableCount: number
  connectionIssueCount: number
  warnings: string[]
  errors: string[]
}

export type SubAgentAdvancedMemoryIsolationState =
  | "isolated"
  | "handoff_allowed"
  | "shared_summary_allowed"
  | "unsafe_mixed_blocked"
  | "degraded"

export interface SubAgentAdvancedMemoryPolicyView {
  owner: OwnerScope
  ownerLabel: string
  visibility: MemoryPolicy["visibility"]
  readScopes: OwnerScope[]
  writeScope: OwnerScope
  retentionPolicy: MemoryPolicy["retentionPolicy"]
  writebackReviewRequired: boolean
  rawWindowSize: number
  compactThreshold: number
  capsuleMode: "session_compaction" | "rolling_summary"
  archiveReferenceMode: "summary_reference" | "full_reference_disabled"
  handoffCapsuleAllowed: boolean
  lastCompactedLabel: string
  capsuleCount: number
  isolationState: SubAgentAdvancedMemoryIsolationState
  isolationLabel: string
  runtimeReflectionRequired: boolean
  warnings: string[]
  errors: string[]
  exchangePolicyItems: string[]
}

export type SubAgentAdvancedPermissionState =
  | "allowed"
  | "denied"
  | "approval_required"
  | "os_permission_required"
  | "unavailable"
  | "inherited"
  | "overridden"

export interface SubAgentAdvancedPermissionItemView {
  id: string
  label: string
  description: string
  state: SubAgentAdvancedPermissionState
  riskLabel: "safe" | "moderate" | "external" | "sensitive" | "dangerous"
  osSensitive: boolean
  dangerous: boolean
  warning: string
}

export interface SubAgentAdvancedPermissionPolicyView {
  profileId: string
  riskCeiling: PermissionProfile["riskCeiling"]
  approvalRequiredFrom: PermissionProfile["approvalRequiredFrom"]
  allowedCapabilityIds: string[]
  deniedCapabilityIds: string[]
  approvalRequiredCapabilityIds: string[]
  osSensitiveCapabilityIds: string[]
  items: SubAgentAdvancedPermissionItemView[]
  elevatedCount: number
  osPermissionRequiredCount: number
  warningCount: number
  logVisibility: "product" | "debug" | "dev"
  summary: string
  warnings: string[]
  errors: string[]
}

export interface SubAgentAdvancedDelegationChildView {
  agentId: string
  displayName: string
  nickname: string
  role: string
  readinessState: "ready" | "needs_attention" | "disabled"
  readinessLabel: string
  enabledForDelegation: boolean
}

export interface SubAgentAdvancedDelegationPolicyView {
  canDelegate: boolean
  directChildOnly: boolean
  allowedChildAgentIds: string[]
  resultReviewRequired: boolean
  aggregationMode: "parent_synthesis" | "append_summaries" | "verifier_required"
  redelegationAllowed: boolean
  escalationPolicy: "return_to_parent" | "ask_user" | "stop_with_report"
  maxParallelSessions: number
  directChildren: SubAgentAdvancedDelegationChildView[]
  blockedTargetCount: number
  summary: string
  reviewPolicyLabel: string
  redelegationPolicyLabel: string
  warnings: string[]
  errors: string[]
}

export interface SubAgentAdvancedMonitoringRunView {
  runId: string
  label: string
  status: SetupSubAgentMonitoringEventStatus
  statusLabel: string
  selected: boolean
  eventCount: number
  latestEventLabel: string
}

export interface SubAgentAdvancedMonitoringTraceItemView {
  eventId: string
  eventTimeLabel: string
  actorLabel: string
  targetLabel: string
  kind: SetupSubAgentMonitoringEventKind
  kindLabel: string
  status: SetupSubAgentMonitoringEventStatus
  statusLabel: string
  summary: string
  reason: string
  reviewStatus: SetupSubAgentMonitoringReviewStatus | ""
  quality: SetupSubAgentMonitoringQuality | ""
  qualityLabel: string
  latestResultSummary: string
  redelegationSummary: string
  debugLabel: string
  tone: "info" | "success" | "warning" | "error"
}

export interface SubAgentAdvancedMonitoringView {
  logLevel: SetupSubAgentMonitoringLogLevel
  activeRuns: SubAgentAdvancedMonitoringRunView[]
  selectedRunId: string
  traceItems: SubAgentAdvancedMonitoringTraceItemView[]
  treePaths: string[]
  latestResultSummary: string
  reviewSummary: string
  statusSummary: string
  stale: boolean
  staleLabel: string
  filters: {
    agentLabels: string[]
    statusLabels: string[]
  }
  warningCount: number
  errors: string[]
}

export interface SubAgentAdvancedStatusBarView {
  hasDraftChanges: boolean
  canSave: boolean
  canPublish: boolean
  draftStateLabel: string
  validationLabel: string
  validationTone: "info" | "success" | "warning" | "error"
  savedVersionLabel: string
  publishedVersionLabel: string
  runtimeActiveVersionLabel: string
  warningCount: number
  errorCount: number
  saveDisabledReason: string
  publishDisabledReason: string
}

export interface SubAgentAdvancedMutationResult {
  ok: boolean
  draft?: SetupDraft
  message: string
  fieldErrors: Record<string, string>
  issueCodes: string[]
}

const CONTRACT_SCHEMA_VERSION = 1 as const
const rootAgent = {
  agentId: "agent:knowbee",
  displayName: "Knowbee",
  nickname: "Knowbee",
}

const emptyAllowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

const capabilityCatalog: Array<{
  id: string
  labelKo: string
  labelEn: string
  descriptionKo: string
  descriptionEn: string
  riskLabel: SubAgentAdvancedPermissionItemView["riskLabel"]
  dangerous?: boolean
  osSensitive?: boolean
}> = [
  {
    id: "capability:system_control",
    labelKo: "시스템 제어",
    labelEn: "System control",
    descriptionKo: "상태 확인과 기본 제어",
    descriptionEn: "Status checks and basic controls",
    riskLabel: "sensitive",
    dangerous: true,
  },
  {
    id: "capability:shell",
    labelKo: "명령 실행",
    labelEn: "Command execution",
    descriptionKo: "터미널 명령 실행",
    descriptionEn: "Run terminal commands",
    riskLabel: "dangerous",
    dangerous: true,
  },
  {
    id: "capability:app_launch",
    labelKo: "앱 실행",
    labelEn: "App launch",
    descriptionKo: "별도 앱이나 프로세스 실행",
    descriptionEn: "Launch applications or processes",
    riskLabel: "sensitive",
    osSensitive: true,
  },
  {
    id: "capability:screen_capture",
    labelKo: "화면 캡처",
    labelEn: "Screen capture",
    descriptionKo: "화면 내용을 캡처해 전달",
    descriptionEn: "Capture screen contents",
    riskLabel: "sensitive",
    osSensitive: true,
  },
  {
    id: "capability:screen_control",
    labelKo: "화면 제어",
    labelEn: "Screen control",
    descriptionKo: "화면 기반 자동화 제어",
    descriptionEn: "Screen-based automation control",
    riskLabel: "dangerous",
    dangerous: true,
    osSensitive: true,
  },
  {
    id: "capability:keyboard_control",
    labelKo: "키보드 제어",
    labelEn: "Keyboard control",
    descriptionKo: "입력과 단축키 실행",
    descriptionEn: "Keyboard input and shortcuts",
    riskLabel: "dangerous",
    dangerous: true,
    osSensitive: true,
  },
  {
    id: "capability:mouse_control",
    labelKo: "마우스 제어",
    labelEn: "Mouse control",
    descriptionKo: "포인터 이동과 클릭",
    descriptionEn: "Pointer movement and clicks",
    riskLabel: "dangerous",
    dangerous: true,
    osSensitive: true,
  },
  {
    id: "capability:file_read",
    labelKo: "파일 읽기",
    labelEn: "File read",
    descriptionKo: "허용 경로의 파일 읽기",
    descriptionEn: "Read files in allowed paths",
    riskLabel: "moderate",
  },
  {
    id: "capability:file_write",
    labelKo: "파일 쓰기",
    labelEn: "File write",
    descriptionKo: "허용 경로에 파일 쓰기",
    descriptionEn: "Write files in allowed paths",
    riskLabel: "sensitive",
    dangerous: true,
  },
  {
    id: "capability:network_mcp",
    labelKo: "네트워크/MCP 접근",
    labelEn: "Network/MCP access",
    descriptionKo: "외부 네트워크와 MCP 호출",
    descriptionEn: "External network and MCP calls",
    riskLabel: "external",
  },
]

export function buildSubAgentAdvancedSettingsView(input: {
  draft: SetupDraft
  selectedAgentId?: string | null
  query?: string
  filter?: SubAgentAdvancedFilter
  dirty?: boolean
  saving?: boolean
  savedVersion?: number
  publishedVersion?: number
  runtimeActiveVersion?: number
  validationIssues?: string[]
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedSettingsView {
  const language = input.language ?? "ko"
  const now = input.now ?? Date.now()
  const subAgents = input.draft.subAgents ?? {
    orchestrationEnabled: false,
    items: [],
    runtimeActiveAgentIds: [],
    lastRuntimeSeenAtByAgentId: {},
  }
  const activeItems = subAgents.items.filter((item) => item.status !== "archived")
  const archivedHiddenCount = subAgents.items.length - activeItems.length
  const runtimeActiveIds = new Set(subAgents.runtimeActiveAgentIds)
  const query = input.query?.trim() ?? ""
  const filter = input.filter ?? "active"
  const allRows = activeItems.map((item) =>
    rowForItem({
      item,
      selected: false,
      runtimeActive: runtimeActiveIds.has(item.agentId),
      lastRuntimeSeenAt: subAgents.lastRuntimeSeenAtByAgentId[item.agentId],
      language,
      now,
    }),
  )
  const filteredRows = allRows.filter((row) => rowMatches(row, query, filter))
  const selectedAgentId = resolveSelectedAgentId(input.selectedAgentId, filteredRows, allRows)
  const rows = filteredRows.map((row) => ({ ...row, selected: row.agentId === selectedAgentId }))
  const selectedItem = activeItems.find((item) => item.agentId === selectedAgentId) ?? null
  const selectedRow =
    rows.find((row) => row.agentId === selectedAgentId) ??
    allRows.find((row) => row.agentId === selectedAgentId) ??
    null
  const validationIssues = input.validationIssues ?? []
  const warningCount =
    rows.reduce((sum, row) => sum + row.warningCount, 0) + validationIssues.length
  const errorCount = validationIssues.filter((issue) => /오류|error|fatal/i.test(issue)).length

  return {
    globalPolicy: buildGlobalPolicy(input.draft, activeItems, language),
    rows,
    selectedAgent:
      selectedItem && selectedRow
        ? detailForItem({
            item: selectedItem,
            row: selectedRow,
            draft: input.draft,
            language,
            now,
          })
        : null,
    selectedAgentId,
    emptyState: emptyStateFor({
      rowCount: rows.length,
      totalActiveCount: activeItems.length,
      orchestrationEnabled: subAgents.orchestrationEnabled,
      filter,
      language,
    }),
    statusBar: {
      hasDraftChanges: input.dirty === true,
      canSave: input.dirty === true && input.saving !== true && errorCount === 0,
      canPublish: input.dirty !== true && errorCount === 0,
      draftStateLabel: input.dirty
        ? pickUiText(language, "저장 전 변경 있음", "Unsaved changes")
        : pickUiText(language, "저장됨", "Saved"),
      validationLabel:
        validationIssues.length > 0
          ? (validationIssues[0] ?? pickUiText(language, "확인 필요", "Needs review"))
          : pickUiText(language, "검증 통과", "Validation passed"),
      validationTone:
        errorCount > 0
          ? "error"
          : warningCount > 0
            ? "warning"
            : subAgents.orchestrationEnabled
              ? "success"
              : "info",
      savedVersionLabel: versionLabel(input.savedVersion),
      publishedVersionLabel: versionLabel(input.publishedVersion),
      runtimeActiveVersionLabel: versionLabel(input.runtimeActiveVersion),
      warningCount,
      errorCount,
      saveDisabledReason: input.saving
        ? pickUiText(language, "저장 중", "Saving")
        : errorCount > 0
          ? pickUiText(language, "치명 오류 해결 필요", "Resolve fatal errors first")
          : input.dirty
            ? ""
            : pickUiText(language, "변경 없음", "No changes"),
      publishDisabledReason: input.dirty
        ? pickUiText(language, "저장 후 활성화 가능", "Save before activation")
        : errorCount > 0
          ? pickUiText(language, "검증 오류 해결 필요", "Resolve validation errors")
          : "",
    },
    archivedHiddenCount,
    filter,
    query,
  }
}

function buildGlobalPolicy(
  draft: SetupDraft,
  activeItems: SetupSubAgentDraftItem[],
  language: UiLanguage,
): SubAgentAdvancedGlobalPolicyView {
  const enabledBackends = draft.aiBackends.filter((backend) => backend.enabled)
  const defaultBackend = enabledBackends[0] ?? draft.aiBackends[0]
  const affectedAgentCount = activeItems.length
  const overriddenAgentCount = activeItems.filter(
    (item) => item.modelPolicy?.mode === "override",
  ).length
  const inheritedAgentCount = affectedAgentCount - overriddenAgentCount
  const defaultModelLabel = defaultBackend
    ? `${defaultBackend.label} / ${defaultBackend.defaultModel || pickUiText(language, "모델 미지정", "No model")}`
    : pickUiText(language, "기본 모델 없음", "No default model")
  const enabledSkillCount = draft.skills.items.filter((item) => item.enabled).length
  const enabledMcpCount = draft.mcp.servers.filter((server) => server.enabled).length

  return {
    rootAgentLabel: "Knowbee",
    rootAgentNotice: pickUiText(
      language,
      "Knowbee는 메인 agent입니다. 이 화면에서는 일반 서브 에이전트 전용 설정만 편집합니다.",
      "Knowbee is the main agent. This screen edits sub-agent-only settings.",
    ),
    orchestrationModeLabel: draft.subAgents?.orchestrationEnabled
      ? pickUiText(language, "오케스트레이션", "Orchestration")
      : pickUiText(language, "단일 노우비", "Single Knowbee"),
    featureFlagLabel: draft.subAgents?.orchestrationEnabled ? "on" : "off",
    defaultModelLabel,
    defaultMemoryLabel: pickUiText(language, "agent별 독립 메모리", "Private memory per agent"),
    defaultPermissionLabel: pickUiText(language, "안전 기본 권한", "Safe default permissions"),
    commonSkillMcpLabel: pickUiText(
      language,
      `Skill ${enabledSkillCount}개 / MCP ${enabledMcpCount}개`,
      `${enabledSkillCount} skills / ${enabledMcpCount} MCP`,
    ),
    affectedAgentCount,
    inheritedAgentCount,
    overriddenAgentCount,
    catalogSummary: pickUiText(
      language,
      "공통 catalog는 여기에서 요약만 보고, agent별 binding은 상세에서 조정합니다.",
      "The common catalog is summarized here; per-agent bindings are adjusted in detail.",
    ),
    impactSummary: pickUiText(
      language,
      `공통 정책 변경 시 ${affectedAgentCount}개 agent가 영향을 받습니다.`,
      `${affectedAgentCount} agents inherit global policy changes.`,
    ),
  }
}

function rowForItem(input: {
  item: SetupSubAgentDraftItem
  selected: boolean
  runtimeActive: boolean
  lastRuntimeSeenAt?: number
  language: UiLanguage
  now: number
}): SubAgentAdvancedListRowView {
  const disabled = input.item.status === "disabled" || input.item.status === "degraded"
  const readinessState: SubAgentAdvancedListRowView["readinessState"] = disabled
    ? "needs_attention"
    : input.runtimeActive
      ? "ready"
      : "runtime_pending"
  return {
    agentId: input.item.agentId,
    displayName: input.item.displayName,
    nickname: input.item.nickname || input.item.displayName,
    role: input.item.role,
    lifecycleState: input.item.status,
    lifecycleLabel: lifecycleLabel(input.item.status, input.language),
    readinessState,
    readinessLabel: readinessLabel(readinessState, input.language),
    runtimeState: input.runtimeActive ? "active" : "pending",
    runtimeLabel: input.runtimeActive
      ? pickUiText(input.language, "실행 중", "Active")
      : pickUiText(input.language, "실행 반영 전", "Pending runtime"),
    warningCount: disabled ? 1 : input.runtimeActive ? 0 : 1,
    lastUpdatedLabel: relativeTimeLabel(input.item.updatedAt, input.now, input.language),
    selected: input.selected,
  }
}

function attributionLabelForItem(item: SetupSubAgentDraftItem): string {
  return item.nickname.trim() || item.displayName.trim()
}

function identityForItem(
  item: SetupSubAgentDraftItem,
  parentLabel: string,
  draft: SetupDraft,
  language: UiLanguage,
): SubAgentAdvancedIdentityView {
  const attributionLabel = attributionLabelForItem(item)
  return {
    displayName: item.displayName,
    nickname: item.nickname,
    role: item.role,
    description: item.description,
    parentLabel,
    attributionLabel,
    internalDebugId: item.agentId,
    rootReadOnly: false,
    warnings: identityWarningsForItem(item, draft, language),
    errors: attributionLabel
      ? []
      : [
          pickUiText(
            language,
            "표시 이름 또는 별명이 필요합니다.",
            "A display name or nickname is required.",
          ),
        ],
  }
}

function identityWarningsForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
): string[] {
  const warnings: string[] = []
  if (item.role.trim().length > 0 && item.role.trim().length < 4) {
    warnings.push(pickUiText(language, "역할 설명이 너무 짧습니다.", "Role is too short."))
  }
  if (item.description.length > 600) {
    warnings.push(
      pickUiText(
        language,
        "설명이 길어 UI에서는 줄임 표시됩니다.",
        "Long descriptions are clamped in the UI.",
      ),
    )
  }
  if (
    /system prompt|developer prompt|ignore previous|프롬프트|시스템 지시/i.test(item.description)
  ) {
    warnings.push(
      pickUiText(
        language,
        "raw prompt나 system instruction은 agent 설명에 넣지 마세요.",
        "Do not paste raw prompts or system instructions into the description.",
      ),
    )
  }
  const normalizedNickname = normalizeLabel(item.nickname)
  const duplicate = (draft.subAgents?.items ?? []).find(
    (candidate) =>
      candidate.agentId !== item.agentId &&
      candidate.status !== "archived" &&
      normalizeLabel(candidate.nickname) === normalizedNickname &&
      normalizedNickname.length > 0,
  )
  if (duplicate) {
    warnings.push(
      pickUiText(
        language,
        "별명이 다른 active agent와 중복됩니다.",
        "Nickname duplicates another active agent.",
      ),
    )
  }
  if (
    normalizedNickname === normalizeLabel(rootAgent.displayName) ||
    normalizedNickname === normalizeLabel(rootAgent.nickname)
  ) {
    warnings.push(
      pickUiText(
        language,
        "Knowbee 이름은 메인 agent 전용입니다.",
        "The Knowbee name is reserved for the main agent.",
      ),
    )
  }
  return warnings
}

function modelPolicyForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
): SubAgentAdvancedModelPolicyView {
  const catalog = modelCatalogFromDraft(draft, language)
  const modelPolicy =
    item.modelPolicy?.mode === "override" ? item.modelPolicy : { mode: "inherit" as const }
  const inheritedModelLabel = defaultModelLabel(draft, language)
  const providerId = modelPolicy.mode === "override" ? (modelPolicy.providerId?.trim() ?? "") : ""
  const modelId = modelPolicy.mode === "override" ? (modelPolicy.modelId?.trim() ?? "") : ""
  const fallbackModelId =
    modelPolicy.mode === "override" ? (modelPolicy.fallbackModelId?.trim() ?? "") : ""
  const selected =
    modelPolicy.mode === "override"
      ? catalog.options.find(
          (option) => option.providerId === providerId && option.modelId === modelId,
        )
      : undefined
  const fallback =
    modelPolicy.mode === "override" && fallbackModelId
      ? catalog.options.find(
          (option) => option.providerId === providerId && option.modelId === fallbackModelId,
        )
      : undefined
  const warnings = [
    ...(modelPolicy.mode === "override" && selected && !selected.available
      ? [
          pickUiText(
            language,
            "선택한 provider가 현재 사용할 수 없습니다.",
            "Selected provider is unavailable.",
          ),
        ]
      : []),
    ...(modelPolicy.mode === "override" && fallback && !fallback.available
      ? [
          pickUiText(
            language,
            "fallback provider가 현재 사용할 수 없습니다.",
            "Fallback provider is unavailable.",
          ),
        ]
      : []),
  ]
  const errors = [
    ...(modelPolicy.mode === "override" && (!providerId || !modelId)
      ? [
          pickUiText(
            language,
            "override에는 provider와 model이 필요합니다.",
            "Override requires provider and model.",
          ),
        ]
      : []),
    ...(modelPolicy.mode === "override" && fallbackModelId && fallbackModelId === modelId
      ? [
          pickUiText(
            language,
            "fallback 모델은 primary 모델과 달라야 합니다.",
            "Fallback model must differ from primary model.",
          ),
        ]
      : []),
    ...(modelPolicy.mode === "override" && modelId && !selected
      ? [
          pickUiText(
            language,
            "선택한 모델이 catalog에 없습니다.",
            "Selected model is not in the catalog.",
          ),
        ]
      : []),
    ...(modelPolicy.mode === "override" && fallbackModelId && !fallback
      ? [
          pickUiText(
            language,
            "fallback 모델이 catalog에 없습니다.",
            "Fallback model is not in the catalog.",
          ),
        ]
      : []),
  ]
  return {
    mode: modelPolicy.mode,
    providerId,
    modelId,
    fallbackModelId,
    inheritedModelLabel,
    effectiveModelLabel:
      modelPolicy.mode === "override"
        ? (selected?.label ?? `${providerId || "-"} / ${modelId || "-"}`)
        : inheritedModelLabel,
    badges: [
      modelPolicy.mode === "override"
        ? pickUiText(language, "overridden", "overridden")
        : pickUiText(language, "inherited", "inherited"),
      ...(warnings.length > 0 ? [pickUiText(language, "unavailable", "unavailable")] : []),
      ...(modelPolicy.mode === "override"
        ? [pickUiText(language, "publish required", "publish required")]
        : []),
    ],
    options: catalog.options,
    providerOptions: catalog.providers,
    runtimeReflectionRequired: modelPolicy.mode === "override",
    warnings,
    errors,
  }
}

function skillMcpBindingsForItem(
  item: SetupSubAgentDraftItem,
): NonNullable<SetupSubAgentDraftItem["skillMcpBindings"]> {
  return {
    enabledSkillIds: [...(item.skillMcpBindings?.enabledSkillIds ?? [])],
    enabledMcpServerIds: [...(item.skillMcpBindings?.enabledMcpServerIds ?? [])],
    enabledToolNames: [...(item.skillMcpBindings?.enabledToolNames ?? [])],
    disabledToolNames: [...(item.skillMcpBindings?.disabledToolNames ?? [])],
    recommendedSkillIds: [...(item.skillMcpBindings?.recommendedSkillIds ?? [])],
    recommendedMcpServerIds: [...(item.skillMcpBindings?.recommendedMcpServerIds ?? [])],
    connectionStateByCatalogId: { ...(item.skillMcpBindings?.connectionStateByCatalogId ?? {}) },
  }
}

function riskLabelForStatus(input: {
  required: boolean
  status: string
  source?: string
  toolCount: number
}): SubAgentAdvancedSkillMcpCatalogItemView["riskLabel"] {
  if (input.status === "error") return "sensitive"
  if (input.required) return "external"
  if (input.toolCount > 0) return "moderate"
  if (input.source === "local") return "moderate"
  return "safe"
}

function connectionStateForCatalogItem(input: {
  id: string
  enabledForAgent: boolean
  available: boolean
  status: string
  required: boolean
  connectionStateByCatalogId: Record<string, SubAgentAdvancedConnectionState>
}): SubAgentAdvancedConnectionState {
  const explicit = input.connectionStateByCatalogId[input.id]
  if (explicit) return explicit
  if (!input.available) return "unavailable"
  if (!input.enabledForAgent) return "disconnected"
  if (input.status === "error") return "degraded"
  if (input.status === "planned") return "connecting"
  if (input.required) return "permission_required"
  return "connected"
}

function connectionStateLabel(
  state: SubAgentAdvancedConnectionState,
  language: UiLanguage,
): string {
  if (state === "connected") return pickUiText(language, "connected", "connected")
  if (state === "connecting") return pickUiText(language, "connecting", "connecting")
  if (state === "degraded") return pickUiText(language, "degraded", "degraded")
  if (state === "permission_required")
    return pickUiText(language, "approval required", "approval required")
  if (state === "unavailable") return pickUiText(language, "unavailable", "unavailable")
  return pickUiText(language, "disconnected", "disconnected")
}

function redactedDiagnosticText(value: string | undefined, language: UiLanguage): string {
  const text = value?.trim()
  if (!text) return pickUiText(language, "상태 확인이 필요합니다.", "Status check is required.")
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/gu, "[secret redacted]")
    .replace(/(?:api[_-]?key|token|password|secret)=\S+/giu, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
}

function skillMcpViewForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
): SubAgentAdvancedSkillMcpView {
  const bindings = skillMcpBindingsForItem(item)
  const enabledSkillIds = new Set(bindings.enabledSkillIds)
  const enabledMcpServerIds = new Set(bindings.enabledMcpServerIds)
  const disabledToolNames = new Set(bindings.disabledToolNames)
  const recommendedSkillIds = new Set(bindings.recommendedSkillIds)
  const recommendedMcpServerIds = new Set(bindings.recommendedMcpServerIds)
  const connectionStateByCatalogId = bindings.connectionStateByCatalogId ?? {}
  const skillItems: SubAgentAdvancedSkillMcpCatalogItemView[] = draft.skills.items.map((skill) => {
    const available = skill.enabled && skill.status === "ready"
    const enabledForAgent = enabledSkillIds.has(skill.id)
    const connectionState = connectionStateForCatalogItem({
      id: skill.id,
      enabledForAgent,
      available,
      status: skill.status,
      required: skill.required,
      connectionStateByCatalogId,
    })
    return {
      id: skill.id,
      kind: "skill",
      label: skill.label || skill.id,
      description: skill.description || pickUiText(language, "설명 없음", "No description"),
      sourceLabel: skill.source,
      available,
      required: skill.required,
      enabledForAgent,
      recommendedForAgent: recommendedSkillIds.has(skill.id),
      approvalRequired:
        skill.required ||
        riskLabelForStatus({
          required: skill.required,
          status: skill.status,
          source: skill.source,
          toolCount: 0,
        }) !== "safe",
      riskLabel: riskLabelForStatus({
        required: skill.required,
        status: skill.status,
        source: skill.source,
        toolCount: 0,
      }),
      connectionState,
      statusLabel: connectionStateLabel(connectionState, language),
      warning: available ? "" : redactedDiagnosticText(skill.reason, language),
    }
  })
  const mcpServerItems: SubAgentAdvancedSkillMcpCatalogItemView[] = draft.mcp.servers.map(
    (server) => {
      const available = server.enabled && server.status === "ready"
      const enabledForAgent = enabledMcpServerIds.has(server.id)
      const connectionState = connectionStateForCatalogItem({
        id: server.id,
        enabledForAgent,
        available,
        status: server.status,
        required: server.required,
        connectionStateByCatalogId,
      })
      return {
        id: server.id,
        kind: "mcp_server",
        label: server.name || server.id,
        description:
          server.tools.length > 0
            ? pickUiText(language, `도구 ${server.tools.length}개`, `${server.tools.length} tools`)
            : pickUiText(language, "등록된 tool 없음", "No tools registered"),
        sourceLabel: server.transport,
        available,
        required: server.required,
        enabledForAgent,
        recommendedForAgent: recommendedMcpServerIds.has(server.id),
        approvalRequired: server.required || server.transport === "http",
        riskLabel: riskLabelForStatus({
          required: server.required,
          status: server.status,
          source: server.transport,
          toolCount: server.tools.length,
        }),
        connectionState,
        statusLabel: connectionStateLabel(connectionState, language),
        warning: available ? "" : redactedDiagnosticText(server.reason, language),
      }
    },
  )
  const mcpToolItems: SubAgentAdvancedSkillMcpCatalogItemView[] = draft.mcp.servers.flatMap(
    (server) =>
      server.tools.map((toolName) => {
        const parentEnabled = enabledMcpServerIds.has(server.id)
        const disabled = disabledToolNames.has(toolName)
        const available = server.enabled && server.status === "ready"
        const connectionState = connectionStateForCatalogItem({
          id: toolName,
          enabledForAgent: parentEnabled && !disabled,
          available,
          status: server.status,
          required: false,
          connectionStateByCatalogId,
        })
        return {
          id: toolName,
          kind: "mcp_tool" as const,
          parentId: server.id,
          label: toolName,
          description: pickUiText(
            language,
            `${server.name || server.id} 서버의 tool`,
            `Tool from ${server.name || server.id}`,
          ),
          sourceLabel: server.name || server.id,
          available,
          required: false,
          enabledForAgent: parentEnabled && !disabled,
          recommendedForAgent: false,
          approvalRequired: server.transport === "http",
          riskLabel: server.transport === "http" ? "external" : "moderate",
          connectionState,
          statusLabel: connectionStateLabel(connectionState, language),
          warning: parentEnabled
            ? ""
            : pickUiText(
                language,
                "상위 MCP 서버가 agent에 enabled 되어야 합니다.",
                "Enable the parent MCP server for this agent first.",
              ),
        }
      }),
  )
  const items = [...skillItems, ...mcpServerItems, ...mcpToolItems]
  const unavailableCount = items.filter((catalogItem) => !catalogItem.available).length
  const connectionIssueCount = items.filter(
    (catalogItem) =>
      catalogItem.enabledForAgent &&
      (catalogItem.connectionState === "degraded" ||
        catalogItem.connectionState === "permission_required" ||
        catalogItem.connectionState === "unavailable"),
  ).length
  return {
    commonCatalogLabel: pickUiText(
      language,
      `공통 catalog Skill ${skillItems.length}개 / MCP ${mcpServerItems.length}개`,
      `Common catalog: ${skillItems.length} skills / ${mcpServerItems.length} MCP`,
    ),
    enabledSkillIds: bindings.enabledSkillIds,
    enabledMcpServerIds: bindings.enabledMcpServerIds,
    enabledToolNames: bindings.enabledToolNames,
    disabledToolNames: bindings.disabledToolNames,
    recommendedSkillIds: bindings.recommendedSkillIds ?? [],
    recommendedMcpServerIds: bindings.recommendedMcpServerIds ?? [],
    items,
    skillCount: skillItems.length,
    mcpServerCount: mcpServerItems.length,
    enabledCount: items.filter((catalogItem) => catalogItem.enabledForAgent).length,
    unavailableCount,
    connectionIssueCount,
    warnings: [
      ...(unavailableCount > 0
        ? [
            pickUiText(
              language,
              "공통 catalog에 사용할 수 없는 항목이 있습니다.",
              "Some common catalog items are unavailable.",
            ),
          ]
        : []),
      ...(connectionIssueCount > 0
        ? [
            pickUiText(
              language,
              "선택 agent의 binding connection 상태를 확인해야 합니다.",
              "Check this agent's binding connection state.",
            ),
          ]
        : []),
    ],
    errors: [],
  }
}

function ownerScope(agentId: string): OwnerScope {
  return { ownerType: "sub_agent", ownerId: agentId }
}

function defaultMemoryPolicyForItem(
  item: SetupSubAgentDraftItem,
): NonNullable<SetupSubAgentDraftItem["memoryPolicy"]> {
  const scope = ownerScope(item.agentId)
  return {
    owner: scope,
    visibility: "private",
    readScopes: [scope],
    writeScope: scope,
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
    rawWindowSize: 24_000,
    compactThreshold: 32_000,
    capsuleMode: "session_compaction",
    archiveReferenceMode: "summary_reference",
    handoffCapsuleAllowed: true,
    capsuleCount: 0,
  }
}

function displayLabelForAgentId(agentId: string, draft: SetupDraft): string {
  if (agentId === rootAgent.agentId) return rootAgent.nickname
  const item = draft.subAgents?.items.find((candidate) => candidate.agentId === agentId)
  return item?.nickname?.trim() || item?.displayName?.trim() || agentId
}

function memoryPolicyViewForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
): SubAgentAdvancedMemoryPolicyView {
  const policy = { ...defaultMemoryPolicyForItem(item), ...(item.memoryPolicy ?? {}) }
  const ownerMatches =
    policy.owner.ownerType === "sub_agent" && policy.owner.ownerId === item.agentId
  const writeMatches =
    policy.writeScope.ownerType === "sub_agent" && policy.writeScope.ownerId === item.agentId
  const readMatches = policy.readScopes.every(
    (scope) => scope.ownerType === "sub_agent" && scope.ownerId === item.agentId,
  )
  const isolationState: SubAgentAdvancedMemoryIsolationState =
    !ownerMatches || !writeMatches || !readMatches
      ? "degraded"
      : policy.handoffCapsuleAllowed
        ? "handoff_allowed"
        : policy.visibility === "coordinator_visible"
          ? "shared_summary_allowed"
          : "isolated"
  const warnings = [
    ...(!ownerMatches || !writeMatches || !readMatches
      ? [
          pickUiText(
            language,
            "다른 agent memory scope가 섞인 설정은 저장할 수 없습니다.",
            "Mixed agent memory scopes cannot be saved.",
          ),
        ]
      : []),
    ...(policy.compactThreshold <= policy.rawWindowSize
      ? [
          pickUiText(
            language,
            "compact threshold가 raw window보다 작거나 같습니다.",
            "Compact threshold is not larger than the raw window.",
          ),
        ]
      : []),
  ]
  return {
    owner: policy.owner,
    ownerLabel: displayLabelForAgentId(policy.owner.ownerId, draft),
    visibility: policy.visibility,
    readScopes: policy.readScopes,
    writeScope: policy.writeScope,
    retentionPolicy: policy.retentionPolicy,
    writebackReviewRequired: policy.writebackReviewRequired,
    rawWindowSize: policy.rawWindowSize,
    compactThreshold: policy.compactThreshold,
    capsuleMode: policy.capsuleMode,
    archiveReferenceMode: policy.archiveReferenceMode,
    handoffCapsuleAllowed: policy.handoffCapsuleAllowed,
    lastCompactedLabel: policy.lastCompactedAt
      ? relativeTimeLabel(policy.lastCompactedAt, Date.now(), language)
      : pickUiText(language, "기록 없음", "No record"),
    capsuleCount: policy.capsuleCount,
    isolationState,
    isolationLabel: memoryIsolationLabel(isolationState, language),
    runtimeReflectionRequired: true,
    warnings,
    errors: isolationState === "degraded" ? warnings : [],
    exchangePolicyItems: [
      pickUiText(
        language,
        "parent -> child handoff capsule 허용",
        "Parent to child handoff capsule allowed",
      ),
      pickUiText(
        language,
        "child -> parent result capsule 허용",
        "Child to parent result capsule allowed",
      ),
      pickUiText(
        language,
        "sibling direct memory exchange 금지",
        "Sibling direct memory exchange is blocked",
      ),
      pickUiText(language, "명시적 exchange package 필요", "Explicit exchange package is required"),
    ],
  }
}

function memoryIsolationLabel(
  state: SubAgentAdvancedMemoryIsolationState,
  language: UiLanguage,
): string {
  if (state === "handoff_allowed") return pickUiText(language, "handoff allowed", "handoff allowed")
  if (state === "shared_summary_allowed")
    return pickUiText(language, "shared summary allowed", "shared summary allowed")
  if (state === "unsafe_mixed_blocked")
    return pickUiText(language, "unsafe mixed blocked", "unsafe mixed blocked")
  if (state === "degraded") return pickUiText(language, "degraded", "degraded")
  return pickUiText(language, "isolated", "isolated")
}

function defaultPermissionProfile(profileId = "profile:advanced-safe"): PermissionProfile {
  return {
    profileId,
    riskCeiling: "moderate",
    approvalRequiredFrom: "moderate",
    allowExternalNetwork: true,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPaths: [],
  }
}

function defaultCapabilityPolicyForItem(
  item: SetupSubAgentDraftItem,
): NonNullable<SetupSubAgentDraftItem["capabilityPolicy"]> {
  const permissionProfile = defaultPermissionProfile(
    `profile:${item.agentId.replace(/[^a-zA-Z0-9_-]+/g, "_")}:safe`,
  )
  return {
    permissionProfile,
    allowedCapabilityIds: ["capability:network_mcp", "capability:file_read"],
    deniedCapabilityIds: [
      "capability:shell",
      "capability:screen_control",
      "capability:keyboard_control",
      "capability:mouse_control",
      "capability:file_write",
    ],
    approvalRequiredCapabilityIds: ["capability:file_write", "capability:screen_capture"],
    osSensitiveCapabilityIds: [
      "capability:screen_capture",
      "capability:keyboard_control",
      "capability:mouse_control",
    ],
    logVisibility: "product",
  }
}

function permissionViewForItem(
  item: SetupSubAgentDraftItem,
  language: UiLanguage,
): SubAgentAdvancedPermissionPolicyView {
  const policy = { ...defaultCapabilityPolicyForItem(item), ...(item.capabilityPolicy ?? {}) }
  const allowed = new Set(policy.allowedCapabilityIds)
  const denied = new Set(policy.deniedCapabilityIds)
  const approval = new Set(policy.approvalRequiredCapabilityIds)
  const osSensitive = new Set(policy.osSensitiveCapabilityIds)
  const items = capabilityCatalog.map((capability): SubAgentAdvancedPermissionItemView => {
    const state: SubAgentAdvancedPermissionState = denied.has(capability.id)
      ? "denied"
      : osSensitive.has(capability.id)
        ? "os_permission_required"
        : approval.has(capability.id)
          ? "approval_required"
          : allowed.has(capability.id)
            ? "allowed"
            : "denied"
    return {
      id: capability.id,
      label: pickUiText(language, capability.labelKo, capability.labelEn),
      description: pickUiText(language, capability.descriptionKo, capability.descriptionEn),
      state,
      riskLabel: capability.riskLabel,
      osSensitive: capability.osSensitive === true,
      dangerous: capability.dangerous === true,
      warning:
        capability.dangerous && state === "allowed"
          ? pickUiText(
              language,
              "위험 권한입니다. 고급 설정에서만 명시적으로 허용합니다.",
              "Dangerous capability. It must be explicitly allowed in advanced settings.",
            )
          : "",
    }
  })
  const elevatedCount = items.filter(
    (capability) => capability.state === "allowed" && capability.dangerous,
  ).length
  const osPermissionRequiredCount = items.filter(
    (capability) => capability.state === "os_permission_required",
  ).length
  return {
    profileId: policy.permissionProfile.profileId,
    riskCeiling: policy.permissionProfile.riskCeiling,
    approvalRequiredFrom: policy.permissionProfile.approvalRequiredFrom,
    allowedCapabilityIds: policy.allowedCapabilityIds,
    deniedCapabilityIds: policy.deniedCapabilityIds,
    approvalRequiredCapabilityIds: policy.approvalRequiredCapabilityIds,
    osSensitiveCapabilityIds: policy.osSensitiveCapabilityIds,
    items,
    elevatedCount,
    osPermissionRequiredCount,
    warningCount: elevatedCount + osPermissionRequiredCount,
    logVisibility: policy.logVisibility ?? "product",
    summary: pickUiText(
      language,
      `allowed ${policy.allowedCapabilityIds.length}개 / approval ${policy.approvalRequiredCapabilityIds.length}개 / OS 승인 ${osPermissionRequiredCount}개`,
      `${policy.allowedCapabilityIds.length} allowed / ${policy.approvalRequiredCapabilityIds.length} approval / ${osPermissionRequiredCount} OS permissions`,
    ),
    warnings: [
      ...(elevatedCount > 0
        ? [
            pickUiText(
              language,
              "위험 권한이 허용되어 있습니다.",
              "Dangerous capabilities are allowed.",
            ),
          ]
        : []),
      ...(osPermissionRequiredCount > 0
        ? [
            pickUiText(
              language,
              "일부 권한은 운영체제 승인 후 동작합니다.",
              "Some capabilities require OS approval.",
            ),
          ]
        : []),
    ],
    errors: [],
  }
}

function defaultDelegationPolicyForItem(): NonNullable<SetupSubAgentDraftItem["delegationPolicy"]> {
  return {
    canDelegate: true,
    directChildOnly: true,
    allowedChildAgentIds: [],
    resultReviewRequired: true,
    aggregationMode: "parent_synthesis",
    redelegationAllowed: true,
    escalationPolicy: "return_to_parent",
    maxParallelSessions: 1,
  }
}

function directChildItems(parentAgentId: string, draft: SetupDraft): SetupSubAgentDraftItem[] {
  return (draft.subAgents?.items ?? [])
    .filter((candidate) => candidate.status !== "archived")
    .filter((candidate) => (candidate.parentAgentId ?? rootAgent.agentId) === parentAgentId)
}

function delegationViewForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
): SubAgentAdvancedDelegationPolicyView {
  const policy = { ...defaultDelegationPolicyForItem(), ...(item.delegationPolicy ?? {}) }
  const allowed = new Set(policy.allowedChildAgentIds)
  const children = directChildItems(item.agentId, draft)
  const directChildren = children.map((child): SubAgentAdvancedDelegationChildView => {
    const disabled = child.status === "disabled" || child.status === "degraded"
    return {
      agentId: child.agentId,
      displayName: child.displayName,
      nickname: child.nickname || child.displayName,
      role: child.role,
      readinessState: disabled ? "disabled" : "ready",
      readinessLabel: disabled
        ? pickUiText(language, "위임 불가", "Unavailable")
        : pickUiText(language, "위임 가능", "Ready"),
      enabledForDelegation: allowed.has(child.agentId),
    }
  })
  const blockedTargetCount = policy.allowedChildAgentIds.filter((childId) => {
    const child = (draft.subAgents?.items ?? []).find((candidate) => candidate.agentId === childId)
    return (
      !child ||
      child.status !== "enabled" ||
      (child.parentAgentId ?? rootAgent.agentId) !== item.agentId
    )
  }).length
  return {
    canDelegate: policy.canDelegate,
    directChildOnly: true,
    allowedChildAgentIds: policy.allowedChildAgentIds,
    resultReviewRequired: policy.resultReviewRequired,
    aggregationMode: policy.aggregationMode,
    redelegationAllowed: policy.redelegationAllowed,
    escalationPolicy: policy.escalationPolicy,
    maxParallelSessions: policy.maxParallelSessions,
    directChildren,
    blockedTargetCount,
    summary: pickUiText(
      language,
      `direct child ${directChildren.length}개 / 위임 허용 ${policy.allowedChildAgentIds.length}개`,
      `${directChildren.length} direct children / ${policy.allowedChildAgentIds.length} allowed`,
    ),
    reviewPolicyLabel: policy.resultReviewRequired
      ? pickUiText(language, "결과 검토 후 최종 전달", "Review before final delivery")
      : pickUiText(language, "검토 정책 확인 필요", "Review policy needs attention"),
    redelegationPolicyLabel: policy.redelegationAllowed
      ? pickUiText(
          language,
          "불만족 결과 재정리 후 재위임 가능",
          "Can refine and redelegate insufficient results",
        )
      : pickUiText(language, "재위임 비활성", "Redelegation disabled"),
    warnings: [
      ...(blockedTargetCount > 0
        ? [
            pickUiText(
              language,
              "위임 대상 중 direct child가 아니거나 비활성인 agent가 있습니다.",
              "Some delegation targets are not direct enabled children.",
            ),
          ]
        : []),
      ...(!policy.resultReviewRequired
        ? [
            pickUiText(
              language,
              "child 결과는 부모 검토 없이 최종 전달되면 안 됩니다.",
              "Child results must not bypass parent review.",
            ),
          ]
        : []),
    ],
    errors:
      blockedTargetCount > 0
        ? [pickUiText(language, "위임 대상 검증 필요", "Delegation targets need validation.")]
        : [],
  }
}

function safeMonitoringLogLevel(
  value: SetupSubAgentMonitoringLogLevel | undefined,
): SetupSubAgentMonitoringLogLevel {
  return value === "debug" || value === "dev" ? value : "product"
}

function validMonitoringEvents(
  monitoring: SetupSubAgentMonitoringDraft | undefined,
): SetupSubAgentMonitoringEvent[] {
  return [...(monitoring?.events ?? [])]
    .filter((event): event is SetupSubAgentMonitoringEvent =>
      Boolean(event?.eventId && event.runId && event.actorAgentId && event.kind && event.status),
    )
    .sort((left, right) => left.at - right.at)
}

function monitoringLabelForAgentId(
  agentId: string | undefined,
  draft: SetupDraft,
  language: UiLanguage,
): string {
  if (!agentId) return pickUiText(language, "대상 없음", "No target")
  if (agentId === rootAgent.agentId) return rootAgent.nickname
  const item = draft.subAgents?.items.find((candidate) => candidate.agentId === agentId)
  return (
    item?.nickname?.trim() ||
    item?.displayName?.trim() ||
    pickUiText(language, "알 수 없는 agent", "Unknown agent")
  )
}

function agentPathIds(agentId: string | undefined, draft: SetupDraft): string[] {
  if (!agentId) return []
  if (agentId === rootAgent.agentId) return [rootAgent.agentId]
  const byId = new Map((draft.subAgents?.items ?? []).map((item) => [item.agentId, item]))
  const path: string[] = []
  const seen = new Set<string>()
  let current: string | undefined = agentId
  while (current && !seen.has(current)) {
    seen.add(current)
    path.unshift(current)
    if (current === rootAgent.agentId) break
    const item = byId.get(current)
    current = item ? (item.parentAgentId ?? rootAgent.agentId) : undefined
  }
  if (path[0] !== rootAgent.agentId) path.unshift(rootAgent.agentId)
  return path
}

function agentTreePathLabel(
  agentId: string | undefined,
  draft: SetupDraft,
  language: UiLanguage,
): string {
  const labels = agentPathIds(agentId, draft).map((pathAgentId) =>
    monitoringLabelForAgentId(pathAgentId, draft, language),
  )
  return labels.join(" -> ")
}

function monitoringEventAgentIds(event: SetupSubAgentMonitoringEvent): string[] {
  return [
    event.actorAgentId,
    event.targetAgentId,
    event.redelegation?.previousChildAgentId,
    event.redelegation?.nextTargetAgentId,
  ].filter((agentId): agentId is string => Boolean(agentId))
}

function monitoringEventTouchesAgent(
  event: SetupSubAgentMonitoringEvent,
  agentId: string,
  draft: SetupDraft,
): boolean {
  return monitoringEventAgentIds(event).some((eventAgentId) => {
    if (eventAgentId === agentId) return true
    return agentPathIds(eventAgentId, draft).includes(agentId)
  })
}

function redactedMonitoringText(
  value: string | undefined,
  language: UiLanguage,
  fallback = "",
): string {
  const text = value?.trim()
  if (!text) return fallback
  return text
    .replace(/sk-[A-Za-z0-9_-]{4,}/giu, "[secret redacted]")
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/giu, "$1[credential-redacted]@")
    .replace(/\b(api[_-]?key|token|password|secret)=\S+/giu, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [redacted]")
    .replace(/\b(?:agent|node|run|task|evt|trace):[A-Za-z0-9_.:-]+/giu, "[internal id]")
    .replace(
      /\b(?:raw payload|raw tool input|raw tool output|raw screenshot binary|stack trace)\b/giu,
      pickUiText(language, "[진단 원문 숨김]", "[diagnostic redacted]"),
    )
}

function monitoringStatusTone(
  status: SetupSubAgentMonitoringEventStatus,
): SubAgentAdvancedMonitoringTraceItemView["tone"] {
  if (status === "completed") return "success"
  if (status === "blocked" || status === "cancelled") return "error"
  if (status === "reviewing") return "warning"
  return "info"
}

function runStatus(events: SetupSubAgentMonitoringEvent[]): SetupSubAgentMonitoringEventStatus {
  const statuses = new Set(events.map((event) => event.status))
  if (statuses.has("blocked")) return "blocked"
  if (statuses.has("cancelled")) return "cancelled"
  if (statuses.has("reviewing")) return "reviewing"
  if (statuses.has("running")) return "running"
  if (statuses.has("pending")) return "pending"
  return "completed"
}

function statusLabel(status: SetupSubAgentMonitoringEventStatus, language: UiLanguage): string {
  if (status === "pending") return pickUiText(language, "대기", "Pending")
  if (status === "running") return pickUiText(language, "진행 중", "Running")
  if (status === "reviewing") return pickUiText(language, "검토 중", "Reviewing")
  if (status === "completed") return pickUiText(language, "완료", "Completed")
  if (status === "blocked") return pickUiText(language, "중단 보고", "Blocked")
  return pickUiText(language, "취소", "Cancelled")
}

function monitoringKindLabel(kind: SetupSubAgentMonitoringEventKind, language: UiLanguage): string {
  const labels: Record<SetupSubAgentMonitoringEventKind, string> = {
    request_received: pickUiText(language, "요청 수신", "Request received"),
    delegation_planned: pickUiText(language, "위임 계획", "Delegation planned"),
    handoff_package_created: pickUiText(language, "전달 패키지", "Handoff package"),
    child_accepted: pickUiText(language, "하위 수락", "Child accepted"),
    child_running: pickUiText(language, "하위 실행", "Child running"),
    child_result_returned: pickUiText(language, "하위 결과 반환", "Child result returned"),
    parent_reviewing: pickUiText(language, "부모 검토", "Parent reviewing"),
    parent_aggregating: pickUiText(language, "부모 취합", "Parent aggregating"),
    redelegation_planned: pickUiText(language, "재위임 계획", "Redelegation planned"),
    final_delivery_prepared: pickUiText(language, "최종 전달 준비", "Final delivery prepared"),
    completed: pickUiText(language, "완료", "Completed"),
    blocked: pickUiText(language, "중단", "Blocked"),
    cancelled: pickUiText(language, "취소", "Cancelled"),
  }
  return labels[kind]
}

function qualityLabel(
  quality: SetupSubAgentMonitoringQuality | undefined,
  language: UiLanguage,
): string {
  if (!quality) return ""
  if (quality === "sufficient") return pickUiText(language, "충분", "Sufficient")
  if (quality === "missing_information")
    return pickUiText(language, "정보 부족", "Missing information")
  if (quality === "needs_verification")
    return pickUiText(language, "검증 필요", "Needs verification")
  if (quality === "permission_required")
    return pickUiText(language, "권한 필요", "Permission required")
  if (quality === "split_required") return pickUiText(language, "분리 필요", "Split required")
  return pickUiText(language, "다른 하위 agent 필요", "Different child required")
}

function redelegationSummaryForEvent(
  event: SetupSubAgentMonitoringEvent,
  draft: SetupDraft,
  language: UiLanguage,
): string {
  const redelegation = event.redelegation
  if (!redelegation) return ""
  const nextTarget = monitoringLabelForAgentId(redelegation.nextTargetAgentId, draft, language)
  return [
    redelegation.previousResultSummary
      ? pickUiText(
          language,
          `이전 결과: ${redactedMonitoringText(redelegation.previousResultSummary, language)}`,
          `Previous result: ${redactedMonitoringText(redelegation.previousResultSummary, language)}`,
        )
      : "",
    redelegation.refinedInstructionSummary
      ? redactedMonitoringText(redelegation.refinedInstructionSummary, language)
      : "",
    redelegation.changedInputSummary
      ? pickUiText(
          language,
          `변경 입력: ${redactedMonitoringText(redelegation.changedInputSummary, language)}`,
          `Changed input: ${redactedMonitoringText(redelegation.changedInputSummary, language)}`,
        )
      : "",
    redelegation.validationMethod
      ? pickUiText(
          language,
          `검증: ${redactedMonitoringText(redelegation.validationMethod, language)}`,
          `Validation: ${redactedMonitoringText(redelegation.validationMethod, language)}`,
        )
      : "",
    redelegation.nextTargetAgentId
      ? pickUiText(language, `다시 위임 대상: ${nextTarget}`, `Redelegated to: ${nextTarget}`)
      : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

function monitoringDebugLabel(
  event: SetupSubAgentMonitoringEvent,
  logLevel: SetupSubAgentMonitoringLogLevel,
  language: UiLanguage,
): string {
  if (logLevel === "product" || !event.debug) return ""
  return [
    typeof event.debug.attemptCount === "number" ? `attempt ${event.debug.attemptCount}` : "",
    event.debug.internalTraceId
      ? redactedMonitoringText(event.debug.internalTraceId, language)
      : "",
    event.debug.relatedTaskId ? redactedMonitoringText(event.debug.relatedTaskId, language) : "",
  ]
    .filter(Boolean)
    .join(" · ")
}

function monitoringTraceItemForEvent(input: {
  event: SetupSubAgentMonitoringEvent
  draft: SetupDraft
  logLevel: SetupSubAgentMonitoringLogLevel
  language: UiLanguage
  now: number
}): SubAgentAdvancedMonitoringTraceItemView {
  const reason = redactedMonitoringText(input.event.reason, input.language)
  return {
    eventId: input.event.eventId,
    eventTimeLabel: relativeTimeLabel(input.event.at, input.now, input.language),
    actorLabel: monitoringLabelForAgentId(input.event.actorAgentId, input.draft, input.language),
    targetLabel: monitoringLabelForAgentId(input.event.targetAgentId, input.draft, input.language),
    kind: input.event.kind,
    kindLabel: monitoringKindLabel(input.event.kind, input.language),
    status: input.event.status,
    statusLabel: statusLabel(input.event.status, input.language),
    summary: redactedMonitoringText(
      input.event.summary,
      input.language,
      monitoringKindLabel(input.event.kind, input.language),
    ),
    reason,
    reviewStatus: input.event.reviewStatus ?? "",
    quality: input.event.quality ?? "",
    qualityLabel: qualityLabel(input.event.quality, input.language),
    latestResultSummary: redactedMonitoringText(input.event.latestResultSummary, input.language),
    redelegationSummary: redelegationSummaryForEvent(input.event, input.draft, input.language),
    debugLabel: monitoringDebugLabel(input.event, input.logLevel, input.language),
    tone: monitoringStatusTone(input.event.status),
  }
}

function monitoringViewForItem(
  item: SetupSubAgentDraftItem,
  draft: SetupDraft,
  language: UiLanguage,
  now: number,
): SubAgentAdvancedMonitoringView {
  const monitoring = draft.subAgents?.monitoring
  const logLevel = safeMonitoringLogLevel(monitoring?.logLevel)
  const allEvents = validMonitoringEvents(monitoring)
  const relevantEvents = allEvents.filter((event) =>
    monitoringEventTouchesAgent(event, item.agentId, draft),
  )
  const explicitRunIds = (monitoring?.activeRunIds ?? []).filter((runId) =>
    relevantEvents.some((event) => event.runId === runId),
  )
  const eventRunIds = relevantEvents.map((event) => event.runId)
  const runIds = Array.from(new Set([...explicitRunIds, ...eventRunIds]))
  const selectedRunId =
    monitoring?.selectedRunId && runIds.includes(monitoring.selectedRunId)
      ? monitoring.selectedRunId
      : (runIds[0] ?? "")
  const selectedEvents = selectedRunId
    ? relevantEvents.filter((event) => event.runId === selectedRunId)
    : relevantEvents
  const traceItems = selectedEvents.map((event) =>
    monitoringTraceItemForEvent({ event, draft, logLevel, language, now }),
  )
  const activeRuns = runIds.map((runId, index): SubAgentAdvancedMonitoringRunView => {
    const runEvents = relevantEvents.filter((event) => event.runId === runId)
    const status = runStatus(runEvents)
    const latestEvent = runEvents[runEvents.length - 1]
    return {
      runId,
      label: pickUiText(language, `실행 ${index + 1}`, `Run ${index + 1}`),
      status,
      statusLabel: statusLabel(status, language),
      selected: runId === selectedRunId,
      eventCount: runEvents.length,
      latestEventLabel: latestEvent
        ? monitoringKindLabel(latestEvent.kind, language)
        : pickUiText(language, "이벤트 없음", "No events"),
    }
  })
  const treePaths = Array.from(
    new Set(
      selectedEvents
        .flatMap((event) => monitoringEventAgentIds(event))
        .map((agentId) => agentTreePathLabel(agentId, draft, language))
        .filter(Boolean),
    ),
  )
  const latestResultSummary =
    [...traceItems].reverse().find((event) => event.latestResultSummary)?.latestResultSummary ??
    pickUiText(language, "결과 없음", "No result")
  const hasFinalReady = traceItems.some(
    (event) => event.reviewStatus === "final_ready" || event.kind === "final_delivery_prepared",
  )
  const hasAggregation = traceItems.some(
    (event) => event.reviewStatus === "aggregated" || event.kind === "parent_aggregating",
  )
  const hasReview = traceItems.some(
    (event) => event.reviewStatus === "reviewing_child_result" || event.kind === "parent_reviewing",
  )
  const hasRedelegation = traceItems.some((event) => event.kind === "redelegation_planned")
  const reviewSummary =
    traceItems.length === 0
      ? pickUiText(language, "아직 trace event가 없습니다.", "No trace events yet.")
      : hasFinalReady
        ? pickUiText(
            language,
            "부모 검토 후 final delivery 준비",
            "Final delivery prepared after parent review",
          )
        : hasAggregation
          ? pickUiText(
              language,
              "부모가 하위 결과를 취합 중입니다.",
              "Parent is aggregating child results.",
            )
          : hasReview
            ? pickUiText(
                language,
                "부모가 하위 결과를 검토 중입니다.",
                "Parent is reviewing child results.",
              )
            : hasRedelegation
              ? pickUiText(
                  language,
                  "하위 결과를 정리해 다시 위임했습니다.",
                  "Child result was refined and redelegated.",
                )
              : pickUiText(
                  language,
                  "runtime trace를 확인 중입니다.",
                  "Runtime trace is being checked.",
                )
  const stale =
    typeof monitoring?.refreshedAt === "number" &&
    typeof monitoring.staleAfterMs === "number" &&
    monitoring.refreshedAt + monitoring.staleAfterMs < now
  const staleLabel = stale
    ? pickUiText(language, "갱신 필요", "Refresh needed")
    : monitoring?.refreshedAt
      ? pickUiText(
          language,
          `최근 갱신 ${relativeTimeLabel(monitoring.refreshedAt, now, language)}`,
          `Refreshed ${relativeTimeLabel(monitoring.refreshedAt, now, language)}`,
        )
      : pickUiText(language, "갱신 기록 없음", "No refresh record")
  const warningCount =
    traceItems.filter(
      (event) =>
        event.status === "blocked" ||
        event.status === "cancelled" ||
        event.kind === "redelegation_planned" ||
        (event.quality && event.quality !== "sufficient"),
    ).length + (stale ? 1 : 0)
  return {
    logLevel,
    activeRuns,
    selectedRunId,
    traceItems,
    treePaths,
    latestResultSummary,
    reviewSummary,
    statusSummary: pickUiText(
      language,
      `trace ${traceItems.length}개 / 실행 ${activeRuns.length}개 / ${reviewSummary}`,
      `${traceItems.length} trace events / ${activeRuns.length} runs / ${reviewSummary}`,
    ),
    stale,
    staleLabel,
    filters: {
      agentLabels: Array.from(
        new Set(
          traceItems.flatMap((event) => [event.actorLabel, event.targetLabel]).filter(Boolean),
        ),
      ),
      statusLabels: Array.from(new Set(traceItems.map((event) => event.statusLabel))),
    },
    warningCount,
    errors: [],
  }
}

function detailForItem(input: {
  item: SetupSubAgentDraftItem
  row: SubAgentAdvancedListRowView
  draft: SetupDraft
  language: UiLanguage
  now: number
}): SubAgentAdvancedDetailView {
  const parentLabel = "Knowbee"
  const identity = identityForItem(input.item, parentLabel, input.draft, input.language)
  const modelPolicy = modelPolicyForItem(input.item, input.draft, input.language)
  const skillMcp = skillMcpViewForItem(input.item, input.draft, input.language)
  const memory = memoryPolicyViewForItem(input.item, input.draft, input.language)
  const permission = permissionViewForItem(input.item, input.language)
  const delegation = delegationViewForItem(input.item, input.draft, input.language)
  const monitoring = monitoringViewForItem(input.item, input.draft, input.language, input.now)
  return {
    agentId: input.item.agentId,
    displayName: input.item.displayName,
    nickname: input.item.nickname || input.item.displayName,
    role: input.item.role,
    description: input.item.description,
    lifecycleLabel: input.row.lifecycleLabel,
    readinessLabel: input.row.readinessLabel,
    runtimeLabel: input.row.runtimeLabel,
    parentLabel,
    identity,
    modelPolicy,
    skillMcp,
    memory,
    permission,
    delegation,
    monitoring,
    sections: [
      {
        id: "identity",
        title: pickUiText(input.language, "기본 정보", "Identity"),
        summary: pickUiText(
          input.language,
          `${identity.attributionLabel} 이름으로 대화와 위임에 표시됩니다.`,
          `${identity.attributionLabel} is used for conversation and delegation.`,
        ),
        helper: pickUiText(
          input.language,
          "별명은 root Knowbee나 다른 active agent와 중복될 수 없습니다.",
          "Nickname cannot duplicate root Knowbee or another active agent.",
        ),
        inheritanceState: "agent_only",
        tone:
          identity.errors.length > 0 ? "error" : identity.warnings.length > 0 ? "warning" : "info",
        items: [
          input.item.displayName,
          input.item.nickname || input.item.displayName,
          input.item.role,
          parentLabel,
        ],
      },
      {
        id: "model",
        title: pickUiText(input.language, "모델", "Model"),
        summary: modelPolicy.effectiveModelLabel,
        helper: modelPolicy.runtimeReflectionRequired
          ? pickUiText(
              input.language,
              "저장 후 runtime 반영이 필요합니다.",
              "Runtime activation is required after saving.",
            )
          : pickUiText(
              input.language,
              "global default 모델을 그대로 상속합니다.",
              "Inherits the global default model.",
            ),
        inheritanceState: modelPolicy.mode === "override" ? "overridden" : "inherited",
        tone:
          modelPolicy.errors.length > 0
            ? "error"
            : modelPolicy.warnings.length > 0
              ? "warning"
              : "info",
        items: modelPolicy.badges,
      },
      {
        id: "skill_mcp",
        title: "Skill/MCP",
        summary: pickUiText(
          input.language,
          `agent별 enabled ${skillMcp.enabledCount}개 / connection 확인 ${skillMcp.connectionIssueCount}개`,
          `${skillMcp.enabledCount} enabled for this agent / ${skillMcp.connectionIssueCount} connection issues`,
        ),
        helper: pickUiText(
          input.language,
          "공통 catalog와 agent별 binding은 분리되어 저장됩니다.",
          "Common catalog and per-agent bindings are stored separately.",
        ),
        inheritanceState: "agent_only",
        tone: skillMcp.connectionIssueCount > 0 ? "warning" : "info",
        items: [skillMcp.commonCatalogLabel],
      },
      {
        id: "memory",
        title: "Memory",
        summary: pickUiText(
          input.language,
          `${memory.isolationLabel} · compact ${memory.compactThreshold}`,
          `${memory.isolationLabel} · compact ${memory.compactThreshold}`,
        ),
        helper: pickUiText(
          input.language,
          "명시적 데이터 교환 외에는 다른 agent 메모리와 섞지 않습니다.",
          "Memory is not mixed with other agents except explicit exchanges.",
        ),
        inheritanceState: "agent_only",
        tone:
          memory.errors.length > 0 ? "error" : memory.warnings.length > 0 ? "warning" : "success",
        items: [memory.visibility, memory.retentionPolicy, memory.capsuleMode],
      },
      {
        id: "permission",
        title: pickUiText(input.language, "권한", "Permission"),
        summary: permission.summary,
        helper: pickUiText(
          input.language,
          "위험 권한 상승은 고급 검증 후 저장해야 합니다.",
          "Risk escalation must pass advanced validation before saving.",
        ),
        inheritanceState: permission.elevatedCount > 0 ? "overridden" : "agent_only",
        tone: permission.elevatedCount > 0 ? "warning" : "info",
        items: [
          permission.riskCeiling,
          `approval ${permission.approvalRequiredFrom}`,
          `log ${permission.logVisibility}`,
        ],
      },
      {
        id: "delegation",
        title: pickUiText(input.language, "위임/검토", "Delegation/review"),
        summary: delegation.summary,
        helper: pickUiText(
          input.language,
          "하위 agent 결과가 부족하면 상위가 정리 후 다시 위임할 수 있어야 합니다.",
          "A parent can refine and redelegate when a child result is insufficient.",
        ),
        inheritanceState: "agent_only",
        tone:
          delegation.errors.length > 0
            ? "error"
            : delegation.warnings.length > 0
              ? "warning"
              : "info",
        items: [
          delegation.reviewPolicyLabel,
          delegation.redelegationPolicyLabel,
          `max parallel ${delegation.maxParallelSessions}`,
        ],
      },
      {
        id: "monitoring",
        title: pickUiText(input.language, "모니터링", "Monitoring"),
        summary: monitoring.statusSummary,
        helper: pickUiText(
          input.language,
          "저장 상태와 runtime active 상태를 구분하고 부모 검토 후 final delivery만 확인합니다.",
          "Separate saved state from runtime active state and confirm final delivery after parent review.",
        ),
        inheritanceState: "global",
        tone:
          monitoring.errors.length > 0
            ? "error"
            : monitoring.warningCount > 0
              ? "warning"
              : input.row.readinessState === "ready"
                ? "success"
                : "info",
        items: [input.row.lastUpdatedLabel, input.row.readinessLabel, monitoring.reviewSummary],
      },
    ],
  }
}

function normalizeLabel(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR")
}

function cloneDraft(draft: SetupDraft): SetupDraft {
  return JSON.parse(JSON.stringify(draft)) as SetupDraft
}

function ensureSubAgentDraft(draft: SetupDraft): SetupSubAgentDraft {
  const monitoring = draft.subAgents?.monitoring
  return {
    orchestrationEnabled: draft.subAgents?.orchestrationEnabled ?? false,
    items: draft.subAgents?.items ?? [],
    runtimeActiveAgentIds: draft.subAgents?.runtimeActiveAgentIds ?? [],
    lastRuntimeSeenAtByAgentId: draft.subAgents?.lastRuntimeSeenAtByAgentId ?? {},
    ...(monitoring ? { monitoring } : {}),
  }
}

function defaultModelLabel(draft: SetupDraft, language: UiLanguage): string {
  const backend = draft.aiBackends.find((item) => item.enabled) ?? draft.aiBackends[0]
  if (!backend) return pickUiText(language, "기본 모델 없음", "No default model")
  return `${backend.label} / ${backend.defaultModel || pickUiText(language, "모델 미지정", "No model")}`
}

function modelCatalogFromDraft(
  draft: SetupDraft,
  language: UiLanguage,
): {
  options: SubAgentAdvancedModelOptionView[]
  providers: Array<{ id: string; label: string; available: boolean }>
  modelIds: string[]
  enabledProviderIds: string[]
} {
  const options = draft.aiBackends.flatMap((backend) => {
    const models = new Set(
      [
        ...backend.availableModels.map((model) => model.trim()).filter(Boolean),
        backend.defaultModel.trim(),
      ].filter(Boolean),
    )
    const available = backend.enabled && backend.status === "ready"
    return [...models].map((modelId) => ({
      providerId: backend.providerType,
      providerLabel: backend.label,
      modelId,
      label: `${backend.label} / ${modelId}`,
      available,
      reason: available
        ? pickUiText(language, "사용 가능", "Available")
        : backend.reason ||
          pickUiText(
            language,
            "provider가 비활성 또는 준비 전입니다.",
            "Provider is disabled or not ready.",
          ),
    }))
  })
  const providers = draft.aiBackends.map((backend) => ({
    id: backend.providerType,
    label: backend.label,
    available: backend.enabled && backend.status === "ready",
  }))
  return {
    options,
    providers,
    modelIds: options.map((option) => `${option.providerId}:${option.modelId}`),
    enabledProviderIds: providers
      .filter((provider) => provider.available)
      .map((provider) => provider.id),
  }
}

function itemModelProfile(item: SetupSubAgentDraftItem): SubAgentConfig["modelProfile"] {
  if (
    item.modelPolicy?.mode !== "override" ||
    !item.modelPolicy.providerId?.trim() ||
    !item.modelPolicy.modelId?.trim()
  ) {
    return undefined
  }
  return {
    providerId: item.modelPolicy.providerId.trim(),
    modelId: item.modelPolicy.modelId.trim(),
    ...(item.modelPolicy.fallbackModelId?.trim()
      ? { fallbackModelId: item.modelPolicy.fallbackModelId.trim() }
      : {}),
    ...(item.modelPolicy.effort?.trim() ? { effort: item.modelPolicy.effort.trim() } : {}),
    ...(typeof item.modelPolicy.maxOutputTokens === "number"
      ? { maxOutputTokens: item.modelPolicy.maxOutputTokens }
      : {}),
    ...(typeof item.modelPolicy.costBudget === "number"
      ? { costBudget: item.modelPolicy.costBudget }
      : {}),
  }
}

function itemSkillMcpAllowlist(item: SetupSubAgentDraftItem): SkillMcpAllowlist {
  return item.skillMcpBindings
    ? {
        enabledSkillIds: [...item.skillMcpBindings.enabledSkillIds],
        enabledMcpServerIds: [...item.skillMcpBindings.enabledMcpServerIds],
        enabledToolNames: [...item.skillMcpBindings.enabledToolNames],
        disabledToolNames: [...item.skillMcpBindings.disabledToolNames],
      }
    : emptyAllowlist
}

function itemToSubAgentConfig(item: SetupSubAgentDraftItem): SubAgentConfig {
  const memoryPolicy = item.memoryPolicy ?? defaultMemoryPolicyForItem(item)
  const capabilityPolicy = item.capabilityPolicy ?? defaultCapabilityPolicyForItem(item)
  const delegationPolicy = item.delegationPolicy ?? defaultDelegationPolicyForItem()
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: item.agentId,
    displayName: item.displayName,
    nickname: item.nickname,
    status: item.status,
    role: item.role,
    personality: item.description || item.role,
    specialtyTags: [],
    avoidTasks: [],
    ...(itemModelProfile(item) ? { modelProfile: itemModelProfile(item) } : {}),
    memoryPolicy,
    capabilityPolicy: {
      permissionProfile: capabilityPolicy.permissionProfile,
      skillMcpAllowlist: itemSkillMcpAllowlist(item),
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: delegationPolicy.canDelegate,
      maxParallelSessions: delegationPolicy.maxParallelSessions,
      directChildOnly: delegationPolicy.directChildOnly,
      allowedChildAgentIds: [...delegationPolicy.allowedChildAgentIds],
      resultReviewRequired: delegationPolicy.resultReviewRequired,
      aggregationMode: delegationPolicy.aggregationMode,
      redelegationAllowed: delegationPolicy.redelegationAllowed,
      escalationPolicy: delegationPolicy.escalationPolicy,
    },
    teamIds: [],
    delegation: {
      enabled: delegationPolicy.canDelegate,
      maxParallelSessions: delegationPolicy.maxParallelSessions,
    },
    profileVersion: item.profileVersion,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function relationshipsFor(items: SetupSubAgentDraftItem[]): AgentRelationship[] {
  return items
    .filter((item) => item.status !== "archived")
    .map((item, index) => ({
      edgeId: `edge:${item.parentAgentId ?? rootAgent.agentId}:${item.agentId}`,
      parentAgentId: item.parentAgentId ?? rootAgent.agentId,
      childAgentId: item.agentId,
      relationshipType: "parent_child" as const,
      status: "active" as const,
      sortOrder: index,
    }))
}

function validationContextFromDraft(draft: SetupDraft, language: UiLanguage) {
  const subAgents = ensureSubAgentDraft(draft)
  const catalog = modelCatalogFromDraft(draft, language)
  return {
    rootAgent,
    agents: subAgents.items.map(itemToSubAgentConfig),
    relationships: relationshipsFor(subAgents.items),
    catalogs: {
      skillIds: draft.skills.items.map((item) => item.id),
      mcpServerIds: draft.mcp.servers.map((server) => server.id),
      availableSkillIds: draft.skills.items
        .filter((item) => item.enabled && item.status === "ready")
        .map((item) => item.id),
      availableMcpServerIds: draft.mcp.servers
        .filter((server) => server.enabled && server.status === "ready")
        .map((server) => server.id),
      modelIds: catalog.modelIds,
      enabledProviderIds: catalog.enabledProviderIds,
      capabilityIds: capabilityCatalog.map((capability) => capability.id),
      dangerousCapabilityIds: capabilityCatalog
        .filter((capability) => capability.dangerous)
        .map((capability) => capability.id),
    },
  }
}

function validationMessage(issue: SubAgentSettingsValidationIssue, language: UiLanguage): string {
  switch (issue.code) {
    case "display_name_required":
      return pickUiText(language, "이름은 비워둘 수 없습니다.", "Display name is required.")
    case "attribution_label_required":
      return pickUiText(
        language,
        "대화에 표시할 이름이 필요합니다.",
        "A conversation label is required.",
      )
    case "nickname_duplicate":
      return pickUiText(
        language,
        "별명 또는 표시 이름이 중복됩니다.",
        "Nickname or display label is duplicated.",
      )
    case "reserved_knowbee_name":
      return pickUiText(
        language,
        "Knowbee 이름은 메인 agent 전용입니다.",
        "The Knowbee name is reserved for the main agent.",
      )
    case "model_provider_unavailable":
      return pickUiText(
        language,
        "선택한 provider가 현재 사용할 수 없습니다.",
        "Selected provider is unavailable.",
      )
    case "model_id_missing":
      return pickUiText(
        language,
        "선택한 모델이 catalog에 없습니다.",
        "Selected model is not in the catalog.",
      )
    case "catalog_id_missing":
      return pickUiText(
        language,
        "공통 catalog에 없는 Skill/MCP 항목입니다.",
        "Skill/MCP item is missing from the common catalog.",
      )
    case "catalog_item_unavailable":
      return pickUiText(
        language,
        "현재 사용할 수 없는 Skill/MCP 항목입니다.",
        "Skill/MCP item is currently unavailable.",
      )
    case "fallback_model_same_as_primary":
      return pickUiText(
        language,
        "fallback 모델은 primary 모델과 달라야 합니다.",
        "Fallback model must differ from primary model.",
      )
    case "archived_agent_not_editable":
      return pickUiText(
        language,
        "보관된 서브 에이전트의 binding은 수정할 수 없습니다.",
        "Archived sub-agent bindings cannot be edited.",
      )
    case "agent_missing":
      return pickUiText(
        language,
        "선택한 서브 에이전트를 찾을 수 없습니다.",
        "Selected sub-agent was not found.",
      )
    case "memory_owner_scope_mismatch":
      return pickUiText(
        language,
        "다른 agent memory scope는 참조할 수 없습니다.",
        "Another agent's memory scope cannot be referenced.",
      )
    case "permission_escalation_requires_advanced":
      return pickUiText(
        language,
        "위험 권한은 고급 설정에서만 명시적으로 켤 수 있습니다.",
        "Dangerous capabilities can only be granted from advanced settings.",
      )
    case "delegation_target_self":
      return pickUiText(
        language,
        "자기 자신에게 위임할 수 없습니다.",
        "An agent cannot delegate to itself.",
      )
    case "delegation_target_not_direct_child":
      return pickUiText(
        language,
        "direct child가 아닌 agent에게 위임할 수 없습니다.",
        "Delegation target must be a direct child.",
      )
    case "delegation_target_unavailable":
      return pickUiText(
        language,
        "비활성 또는 사용할 수 없는 child에게 위임할 수 없습니다.",
        "Unavailable children cannot be delegated to.",
      )
    case "direct_child_only_required":
      return pickUiText(
        language,
        "위임은 direct child로만 제한해야 합니다.",
        "Delegation must stay direct-child only.",
      )
    case "invalid_numeric_limit":
      return pickUiText(
        language,
        "숫자 제한값이 허용 범위를 벗어났습니다.",
        "Numeric limit is out of range.",
      )
    default:
      return issue.message
  }
}

function resultFromIssues(
  issues: SubAgentSettingsValidationIssue[],
  language: UiLanguage,
): SubAgentAdvancedMutationResult {
  const fieldErrors: Record<string, string> = {}
  for (const issue of issues) {
    fieldErrors[issue.path] = validationMessage(issue, language)
  }
  return {
    ok: false,
    message: issues[0]
      ? validationMessage(issues[0], language)
      : pickUiText(language, "저장할 수 없습니다.", "Cannot save."),
    fieldErrors,
    issueCodes: issues.map((issue) => issue.code),
  }
}

export function applySubAgentAdvancedIdentityCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentIdentityCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) =>
      item.agentId === input.command.agentId
        ? {
            ...item,
            displayName: input.command.displayName.trim(),
            nickname: input.command.nickname?.trim() || input.command.displayName.trim(),
            role: input.command.role.trim(),
            description: input.command.description.trim(),
            updatedAt: now,
            profileVersion: item.profileVersion + 1,
          }
        : item,
    ),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(language, "기본 정보를 저장했습니다.", "Identity saved."),
    fieldErrors: {},
    issueCodes: [],
  }
}

export function applySubAgentAdvancedModelPolicyCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentModelPolicyCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) =>
      item.agentId === input.command.agentId
        ? {
            ...item,
            modelPolicy:
              input.command.mode === "inherit"
                ? { mode: "inherit" as const }
                : {
                    mode: "override" as const,
                    providerId: input.command.providerId?.trim() ?? "",
                    modelId: input.command.modelId?.trim() ?? "",
                    ...(input.command.fallbackModelId?.trim()
                      ? { fallbackModelId: input.command.fallbackModelId.trim() }
                      : {}),
                    ...(input.command.effort?.trim()
                      ? { effort: input.command.effort.trim() }
                      : {}),
                    ...(typeof input.command.maxOutputTokens === "number"
                      ? { maxOutputTokens: input.command.maxOutputTokens }
                      : {}),
                    ...(typeof input.command.costBudget === "number"
                      ? { costBudget: input.command.costBudget }
                      : {}),
                  },
            updatedAt: now,
            profileVersion: item.profileVersion + 1,
          }
        : item,
    ),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(
      language,
      "모델 정책을 저장했습니다. runtime 반영이 필요합니다.",
      "Model policy saved. Runtime activation is required.",
    ),
    fieldErrors: {},
    issueCodes: [],
  }
}

export function applySubAgentAdvancedSkillMcpBindingsCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentSkillMcpBindingsCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) => {
      if (item.agentId !== input.command.agentId) return item
      return {
        ...item,
        skillMcpBindings: {
          enabledSkillIds: [...input.command.enabledSkillIds],
          enabledMcpServerIds: [...input.command.enabledMcpServerIds],
          enabledToolNames: [...input.command.enabledToolNames],
          disabledToolNames: [...input.command.disabledToolNames],
          recommendedSkillIds: [...(item.skillMcpBindings?.recommendedSkillIds ?? [])],
          recommendedMcpServerIds: [...(item.skillMcpBindings?.recommendedMcpServerIds ?? [])],
          connectionStateByCatalogId: {
            ...(item.skillMcpBindings?.connectionStateByCatalogId ?? {}),
          },
        },
        updatedAt: now,
        profileVersion: item.profileVersion + 1,
      }
    }),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(
      language,
      "Skill/MCP binding을 저장했습니다. runtime 반영이 필요합니다.",
      "Skill/MCP bindings saved. Runtime activation is required.",
    ),
    fieldErrors: {},
    issueCodes: [],
  }
}

export function applySubAgentAdvancedMemoryPolicyCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentMemoryPolicyCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) => {
      if (item.agentId !== input.command.agentId) return item
      const current = defaultMemoryPolicyForItem(item)
      return {
        ...item,
        memoryPolicy: {
          ...current,
          ...(item.memoryPolicy ?? {}),
          owner: input.command.owner,
          visibility: input.command.isolationLevel,
          readScopes: [...input.command.readScopes],
          writeScope: input.command.writeScope,
          compactThreshold: input.command.compactThreshold,
          capsuleMode: input.command.capsuleMode,
          handoffCapsuleAllowed:
            input.command.isolationLevel === "private"
              ? (item.memoryPolicy?.handoffCapsuleAllowed ?? true)
              : true,
        },
        updatedAt: now,
        profileVersion: item.profileVersion + 1,
      }
    }),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(
      language,
      "메모리 정책을 저장했습니다. runtime 반영이 필요합니다.",
      "Memory policy saved. Runtime activation is required.",
    ),
    fieldErrors: {},
    issueCodes: [],
  }
}

function permissionProfileFromCapabilityCommand(
  item: SetupSubAgentDraftItem,
  command: UpdateSubAgentCapabilityPolicyCommand,
): PermissionProfile {
  const current =
    item.capabilityPolicy?.permissionProfile ??
    defaultCapabilityPolicyForItem(item).permissionProfile
  const allowed = new Set(command.allowedCapabilityIds)
  const approval = new Set(command.approvalRequiredCapabilityIds)
  const dangerousAllowed = command.allowedCapabilityIds.some((id) =>
    capabilityCatalog.some((capability) => capability.id === id && capability.dangerous),
  )
  return {
    ...current,
    riskCeiling: dangerousAllowed
      ? "dangerous"
      : allowed.has("capability:screen_capture")
        ? "sensitive"
        : current.riskCeiling,
    approvalRequiredFrom: approval.size > 0 ? "moderate" : current.approvalRequiredFrom,
    allowExternalNetwork: allowed.has("capability:network_mcp"),
    allowFilesystemWrite: allowed.has("capability:file_write"),
    allowShellExecution: allowed.has("capability:shell"),
    allowScreenControl:
      allowed.has("capability:screen_control") ||
      allowed.has("capability:keyboard_control") ||
      allowed.has("capability:mouse_control") ||
      allowed.has("capability:screen_capture"),
  }
}

export function applySubAgentAdvancedCapabilityPolicyCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentCapabilityPolicyCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) => {
      if (item.agentId !== input.command.agentId) return item
      return {
        ...item,
        capabilityPolicy: {
          ...(item.capabilityPolicy ?? defaultCapabilityPolicyForItem(item)),
          permissionProfile: permissionProfileFromCapabilityCommand(item, input.command),
          allowedCapabilityIds: [...input.command.allowedCapabilityIds],
          deniedCapabilityIds: [...input.command.deniedCapabilityIds],
          approvalRequiredCapabilityIds: [...input.command.approvalRequiredCapabilityIds],
          osSensitiveCapabilityIds: [...input.command.osSensitiveCapabilityIds],
        },
        updatedAt: now,
        profileVersion: item.profileVersion + 1,
      }
    }),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(
      language,
      "권한 정책을 저장했습니다. runtime 반영이 필요합니다.",
      "Permission policy saved. Runtime activation is required.",
    ),
    fieldErrors: {},
    issueCodes: [],
  }
}

export function applySubAgentAdvancedDelegationPolicyCommand(input: {
  draft: SetupDraft
  command: UpdateSubAgentDelegationPolicyCommand
  language?: UiLanguage
  now?: number
}): SubAgentAdvancedMutationResult {
  const language = input.language ?? "ko"
  const validation = validateSubAgentSettingsCommand(
    input.command,
    validationContextFromDraft(input.draft, language),
  )
  if (!validation.ok) return resultFromIssues(validation.issues, language)

  const now = input.now ?? Date.now()
  const next = cloneDraft(input.draft)
  const subAgents = ensureSubAgentDraft(next)
  next.subAgents = {
    ...subAgents,
    items: subAgents.items.map((item) => {
      if (item.agentId !== input.command.agentId) return item
      return {
        ...item,
        delegationPolicy: {
          ...(item.delegationPolicy ?? defaultDelegationPolicyForItem()),
          canDelegate: input.command.canDelegate,
          directChildOnly: true,
          allowedChildAgentIds: [...input.command.allowedChildAgentIds],
          resultReviewRequired: input.command.resultReviewRequired,
          aggregationMode: item.delegationPolicy?.aggregationMode ?? "parent_synthesis",
          redelegationAllowed: input.command.redelegationAllowed,
          escalationPolicy: item.delegationPolicy?.escalationPolicy ?? "return_to_parent",
          maxParallelSessions: item.delegationPolicy?.maxParallelSessions ?? 1,
        },
        updatedAt: now,
        profileVersion: item.profileVersion + 1,
      }
    }),
  }
  return {
    ok: true,
    draft: next,
    message: pickUiText(
      language,
      "위임/결과 검토 정책을 저장했습니다. runtime 반영이 필요합니다.",
      "Delegation and review policy saved. Runtime activation is required.",
    ),
    fieldErrors: {},
    issueCodes: [],
  }
}

function rowMatches(
  row: SubAgentAdvancedListRowView,
  query: string,
  filter: SubAgentAdvancedFilter,
): boolean {
  if (filter === "needs_attention" && row.warningCount === 0) return false
  if (filter === "runtime_pending" && row.runtimeState !== "pending") return false
  const normalized = query.toLowerCase()
  if (!normalized) return true
  return [row.displayName, row.nickname, row.role, row.lifecycleLabel, row.readinessLabel].some(
    (value) => value.toLowerCase().includes(normalized),
  )
}

function resolveSelectedAgentId(
  requested: string | null | undefined,
  rows: SubAgentAdvancedListRowView[],
  allRows: SubAgentAdvancedListRowView[],
): string | null {
  if (requested && rows.some((row) => row.agentId === requested)) return requested
  if (requested && allRows.some((row) => row.agentId === requested)) return rows[0]?.agentId ?? null
  return rows[0]?.agentId ?? null
}

function emptyStateFor(input: {
  rowCount: number
  totalActiveCount: number
  orchestrationEnabled: boolean
  filter: SubAgentAdvancedFilter
  language: UiLanguage
}): SubAgentAdvancedSettingsView["emptyState"] {
  if (input.rowCount > 0) {
    return { kind: "none", title: "", message: "", ctaLabel: "" }
  }
  if (input.totalActiveCount > 0) {
    return {
      kind: "filtered_empty",
      title: pickUiText(input.language, "표시할 agent 없음", "No matching agents"),
      message: pickUiText(
        input.language,
        "검색 또는 필터 조건에 맞는 서브 에이전트가 없습니다.",
        "No sub-agents match the search or filter.",
      ),
      ctaLabel: pickUiText(input.language, "필터 초기화", "Reset filters"),
    }
  }
  if (input.orchestrationEnabled) {
    return {
      kind: "orchestration_empty",
      title: pickUiText(input.language, "서브 에이전트 필요", "Sub-agent required"),
      message: pickUiText(
        input.language,
        "오케스트레이션을 쓰려면 최소 하나의 서브 에이전트가 필요합니다.",
        "At least one sub-agent is needed for orchestration.",
      ),
      ctaLabel: pickUiText(input.language, "서브 에이전트 추가", "Add sub-agent"),
    }
  }
  return {
    kind: "single_knowbee",
    title: pickUiText(input.language, "단일 노우비 모드", "Single Knowbee mode"),
    message: pickUiText(
      input.language,
      "서브 에이전트가 없어도 정상입니다. 필요할 때 추가하세요.",
      "No sub-agents are required. Add them when needed.",
    ),
    ctaLabel: pickUiText(input.language, "서브 에이전트 추가", "Add sub-agent"),
  }
}

function lifecycleLabel(status: SetupSubAgentDraftItem["status"], language: UiLanguage): string {
  if (status === "enabled") return pickUiText(language, "활성", "Enabled")
  if (status === "disabled") return pickUiText(language, "비활성", "Disabled")
  if (status === "degraded") return pickUiText(language, "확인 필요", "Degraded")
  return pickUiText(language, "보관됨", "Archived")
}

function readinessLabel(
  state: SubAgentAdvancedListRowView["readinessState"],
  language: UiLanguage,
): string {
  if (state === "ready") return pickUiText(language, "실행 가능", "Ready")
  if (state === "needs_attention") return pickUiText(language, "확인 필요", "Needs attention")
  if (state === "disabled") return pickUiText(language, "비활성", "Disabled")
  return pickUiText(language, "실행 반영 전", "Pending runtime")
}

function relativeTimeLabel(value: number, now: number, language: UiLanguage): string {
  const diffMs = Math.max(0, now - value)
  const minutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (minutes < 60) return pickUiText(language, `${minutes}분 전`, `${minutes}m ago`)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return pickUiText(language, `${hours}시간 전`, `${hours}h ago`)
  const days = Math.floor(hours / 24)
  return pickUiText(language, `${days}일 전`, `${days}d ago`)
}

function versionLabel(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `v${value}` : "-"
}
