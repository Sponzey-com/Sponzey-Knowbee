import {
  buildAdvancedSubAgentSettingsView,
  buildBeginnerSubAgentSetupView,
  validateSubAgentSettingsCommand,
  type SubAgentSettingsValidationIssue,
} from "../../../core/src/ui/sub-agent-settings.js"
import type {
  AgentRelationship,
  PermissionProfile,
  SkillMcpAllowlist,
  SubAgentConfig,
} from "../../../core/src/contracts/sub-agent-orchestration.js"
import type { SetupDraft, SetupSubAgentDraft, SetupSubAgentDraftItem } from "../contracts/setup"
import type { UiLanguage } from "../stores/uiLanguage"
import { pickUiText } from "../stores/uiLanguage"

const CONTRACT_SCHEMA_VERSION = 1 as const

export interface BeginnerSubAgentCreateInput {
  displayName: string
  nickname: string
  role: string
  description: string
}

export interface BeginnerSubAgentCreateResult {
  ok: boolean
  draft?: SetupDraft
  fieldErrors: Partial<Record<keyof BeginnerSubAgentCreateInput, string>>
  message: string
  issueCodes: string[]
}

export interface BeginnerSubAgentReadinessPanelView {
  status: "empty" | "ready" | "needs_attention" | "pending_runtime" | "blocked"
  tone: "info" | "success" | "warning" | "error"
  title: string
  summary: string
  stats: {
    topLevelCount: number
    readyCount: number
    needsAttentionCount: number
    pendingRuntimeCount: number
    recentRuntimeLabel: string
  }
  cards: Array<{
    id: string
    displayName: string
    displayLabel: string
    role: string
    readinessState: string
    lifecycleState: string
    statusLabel: string
    summary: string
  }>
  actions: Array<{
    id: "create" | "topology" | "advanced"
    label: string
    href?: string
  }>
}

const rootAgent = {
  agentId: "agent:knowbee",
  displayName: "Knowbee",
  nickname: "Knowbee",
}

const safePermissionProfile: PermissionProfile = {
  profileId: "profile:beginner-safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const emptyAllowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

function cloneDraft(draft: SetupDraft): SetupDraft {
  return JSON.parse(JSON.stringify(draft)) as SetupDraft
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

export function ensureSubAgentSetupDraft(draft: SetupDraft): SetupSubAgentDraft {
  const monitoring = draft.subAgents?.monitoring
  return {
    orchestrationEnabled: draft.subAgents?.orchestrationEnabled ?? false,
    items: draft.subAgents?.items ?? [],
    runtimeActiveAgentIds: draft.subAgents?.runtimeActiveAgentIds ?? [],
    lastRuntimeSeenAtByAgentId: draft.subAgents?.lastRuntimeSeenAtByAgentId ?? {},
    ...(monitoring ? { monitoring } : {}),
  }
}

function normalizeSlug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "sub_agent"
}

function createAgentId(input: BeginnerSubAgentCreateInput, existingIds: string[]): string {
  const base = `agent:${normalizeSlug(input.nickname || input.displayName)}`
  if (!existingIds.includes(base)) return base
  let index = 2
  while (existingIds.includes(`${base}_${index}`)) {
    index += 1
  }
  return `${base}_${index}`
}

function itemToSubAgentConfig(item: SetupSubAgentDraftItem): SubAgentConfig {
  const owner = { ownerType: "sub_agent" as const, ownerId: item.agentId }
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
    ...(item.modelPolicy?.mode === "override" && item.modelPolicy.providerId?.trim() && item.modelPolicy.modelId?.trim()
      ? {
          modelProfile: {
            providerId: item.modelPolicy.providerId.trim(),
            modelId: item.modelPolicy.modelId.trim(),
            ...(item.modelPolicy.fallbackModelId?.trim() ? { fallbackModelId: item.modelPolicy.fallbackModelId.trim() } : {}),
            ...(item.modelPolicy.effort?.trim() ? { effort: item.modelPolicy.effort.trim() } : {}),
            ...(typeof item.modelPolicy.maxOutputTokens === "number" ? { maxOutputTokens: item.modelPolicy.maxOutputTokens } : {}),
            ...(typeof item.modelPolicy.costBudget === "number" ? { costBudget: item.modelPolicy.costBudget } : {}),
          },
        }
      : {}),
    memoryPolicy: {
      owner,
      visibility: "private",
      readScopes: [owner],
      writeScope: owner,
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: safePermissionProfile,
      skillMcpAllowlist: itemSkillMcpAllowlist(item),
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 1,
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
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
      edgeId: `edge:knowbee:${item.agentId}`,
      parentAgentId: rootAgent.agentId,
      childAgentId: item.agentId,
      relationshipType: "parent_child",
      status: "active",
      sortOrder: index,
    }))
}

function catalogsFromDraft(draft: SetupDraft) {
  const modelIds = draft.aiBackends.flatMap((backend) => {
    const models = new Set([
      ...backend.availableModels.map((model) => model.trim()).filter(Boolean),
      backend.defaultModel.trim(),
    ].filter(Boolean))
    return [...models].map((model) => `${backend.providerType}:${model}`)
  })
  return {
    skillIds: draft.skills.items.map((item) => item.id),
    mcpServerIds: draft.mcp.servers.map((server) => server.id),
    modelIds,
    enabledProviderIds: draft.aiBackends
      .filter((backend) => backend.enabled && backend.status === "ready")
      .map((backend) => backend.providerType),
    capabilityIds: ["capability:web", "capability:file_read", "capability:shell"],
    dangerousCapabilityIds: ["capability:shell"],
  }
}

function validationMessage(issue: SubAgentSettingsValidationIssue, language: UiLanguage): string {
  switch (issue.code) {
    case "display_name_required":
      return pickUiText(language, "이름을 입력해야 합니다.", "Enter a name.")
    case "nickname_duplicate":
      return pickUiText(language, "이미 사용 중인 별명입니다.", "That nickname is already in use.")
    case "reserved_knowbee_name":
      return pickUiText(language, "노우비 이름은 메인 에이전트만 사용할 수 있습니다.", "Only the main agent can use the Knowbee name.")
    case "parent_missing":
      return pickUiText(language, "상위 에이전트를 찾을 수 없습니다.", "The parent agent is missing.")
    default:
      return pickUiText(language, "입력값을 다시 확인해야 합니다.", "Check the entered values.")
  }
}

function firstMessage(messages: string[], language: UiLanguage): string {
  return messages[0] ?? pickUiText(language, "입력값을 다시 확인해야 합니다.", "Check the entered values.")
}

export function createBeginnerSubAgent(
  draft: SetupDraft,
  input: BeginnerSubAgentCreateInput,
  now = Date.now(),
  language: UiLanguage = "ko",
): BeginnerSubAgentCreateResult {
  const subAgents = ensureSubAgentSetupDraft(draft)
  const agents = subAgents.items.map(itemToSubAgentConfig)
  const command = {
    kind: "create_basic" as const,
    source: "beginner" as const,
    parentAgentId: rootAgent.agentId,
    displayName: input.displayName.trim(),
    nickname: input.nickname.trim(),
    role: input.role.trim(),
    description: input.description.trim(),
    initialLifecycleState: "saved" as const,
    safeDefaultPolicy: true,
  }
  const validation = validateSubAgentSettingsCommand(command, {
    rootAgent,
    agents,
    relationships: relationshipsFor(subAgents.items),
    catalogs: catalogsFromDraft(draft),
  })
  const fieldErrors: BeginnerSubAgentCreateResult["fieldErrors"] = {}
  const messages = validation.issues.map((issue) => validationMessage(issue, language))

  if (!input.displayName.trim()) {
    fieldErrors.displayName = pickUiText(language, "이름을 입력해야 합니다.", "Enter a name.")
  }
  if (!input.role.trim()) {
    fieldErrors.role = pickUiText(language, "하는 일을 한 문장으로 입력해야 합니다.", "Enter one sentence about the agent's work.")
  }
  for (const issue of validation.issues) {
    if (issue.code === "display_name_required") fieldErrors.displayName = validationMessage(issue, language)
    if (issue.code === "nickname_duplicate") fieldErrors.nickname = validationMessage(issue, language)
    if (issue.code === "reserved_knowbee_name") {
      fieldErrors.displayName = validationMessage(issue, language)
      fieldErrors.nickname = validationMessage(issue, language)
    }
  }

  if (!validation.ok || Object.keys(fieldErrors).length > 0) {
    const fallbackMessages = Object.values(fieldErrors).filter(Boolean)
    return {
      ok: false,
      fieldErrors,
      message: firstMessage(messages.length > 0 ? messages : fallbackMessages, language),
      issueCodes: validation.issues.map((issue) => issue.code),
    }
  }

  const next = cloneDraft(draft)
  const existingIds = subAgents.items.map((item) => item.agentId)
  const item: SetupSubAgentDraftItem = {
    agentId: createAgentId(input, existingIds),
    displayName: input.displayName.trim(),
    nickname: input.nickname.trim() || input.displayName.trim(),
    role: input.role.trim(),
    description: input.description.trim(),
    status: "enabled",
    createdAt: now,
    updatedAt: now,
    profileVersion: 1,
  }
  next.subAgents = {
    ...subAgents,
    orchestrationEnabled: true,
    items: [...subAgents.items, item],
  }
  return {
    ok: true,
    draft: next,
    fieldErrors: {},
    message: pickUiText(language, "서브 에이전트를 추가했습니다.", "Sub-agent added."),
    issueCodes: [],
  }
}

export function buildBeginnerSubAgentReadinessPanel(input: {
  draft: SetupDraft
  language: UiLanguage
  now?: number
}): BeginnerSubAgentReadinessPanelView {
  const subAgents = ensureSubAgentSetupDraft(input.draft)
  const agents = subAgents.items.map(itemToSubAgentConfig)
  const runtime = {
    activeAgentIds: subAgents.runtimeActiveAgentIds,
    lastSeenAtByAgentId: subAgents.lastRuntimeSeenAtByAgentId,
  }
  const beginner = buildBeginnerSubAgentSetupView({
    rootAgent,
    savedAgents: agents,
    relationships: relationshipsFor(subAgents.items),
    catalogs: catalogsFromDraft(input.draft),
    runtime,
    now: input.now,
  })
  const advanced = buildAdvancedSubAgentSettingsView({
    rootAgent,
    savedAgents: agents,
    relationships: relationshipsFor(subAgents.items),
    catalogs: catalogsFromDraft(input.draft),
    runtime,
    now: input.now,
  })
  const pendingRuntimeCount = beginner.cards.filter((card) => card.lifecycleState !== "runtime_active").length
  const recentRuntimeAt = Object.values(subAgents.lastRuntimeSeenAtByAgentId).sort((left, right) => right - left)[0]
  const status: BeginnerSubAgentReadinessPanelView["status"] =
    beginner.summary.blockedAgentCount > 0
      ? "blocked"
      : subAgents.orchestrationEnabled && subAgents.items.length === 0
        ? "needs_attention"
        : subAgents.items.length === 0
          ? "empty"
          : pendingRuntimeCount > 0
            ? "pending_runtime"
            : beginner.summary.needsAttentionCount > 0
              ? "needs_attention"
              : "ready"
  const tone: BeginnerSubAgentReadinessPanelView["tone"] =
    status === "blocked" ? "error" : status === "ready" ? "success" : status === "empty" ? "info" : "warning"
  const title = pickUiText(input.language, "서브 에이전트 팀", "Sub-agent team")
  const summary =
    status === "empty"
      ? pickUiText(input.language, "지금은 노우비 혼자 처리합니다. 필요할 때 서브 에이전트를 추가하세요.", "Knowbee works alone for now. Add sub-agents when needed.")
      : status === "needs_attention" && subAgents.items.length === 0
        ? pickUiText(input.language, "오케스트레이션을 쓰려면 서브 에이전트를 먼저 추가해야 합니다.", "Add a sub-agent before using orchestration.")
        : status === "pending_runtime"
          ? pickUiText(input.language, "저장된 서브 에이전트가 아직 실행 런타임에 반영되지 않았습니다.", "Saved sub-agents are not active in runtime yet.")
          : status === "blocked"
            ? pickUiText(input.language, "서브 에이전트 설정을 다시 확인해야 합니다.", "Review the sub-agent settings.")
            : pickUiText(input.language, "서브 에이전트 팀을 사용할 준비가 되었습니다.", "The sub-agent team is ready.")

  return {
    status,
    tone,
    title,
    summary,
    stats: {
      topLevelCount: beginner.summary.topLevelAgentCount,
      readyCount: beginner.summary.readyAgentCount,
      needsAttentionCount: beginner.summary.needsAttentionCount + beginner.summary.blockedAgentCount,
      pendingRuntimeCount,
      recentRuntimeLabel: recentRuntimeAt
        ? new Date(recentRuntimeAt).toLocaleString(input.language === "ko" ? "ko-KR" : "en-US")
        : pickUiText(input.language, "아직 실행 기록 없음", "No runtime activity yet"),
    },
    cards: beginner.cards.map((card) => ({
      id: card.id,
      displayName: card.displayName,
      displayLabel: card.displayLabel,
      role: card.role,
      readinessState: card.readinessState,
      lifecycleState: card.lifecycleState,
      statusLabel: card.readinessState === "ready"
        ? pickUiText(input.language, "준비됨", "Ready")
        : card.readinessState === "blocked"
          ? pickUiText(input.language, "확인 필요", "Blocked")
          : pickUiText(input.language, "주의 필요", "Needs attention"),
      summary: advanced.selectedAgent?.summary.id === card.id
        ? advanced.selectedAgent.identity.description
        : card.description,
    })),
    actions: [
      { id: "create", label: pickUiText(input.language, "서브 에이전트 추가", "Add sub-agent") },
      { id: "sub-agents", label: pickUiText(input.language, "서브에이전트 설정에서 보기", "View sub-agent settings"), href: "/sub-agents" },
      { id: "advanced", label: pickUiText(input.language, "고급 설정에서 보기", "Open advanced settings"), href: "/advanced/orchestration" },
    ],
  }
}
