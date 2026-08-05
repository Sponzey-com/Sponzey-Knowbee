import type { SetupDraft, SetupSubAgentDraftItem } from "../contracts/setup"
import { canonicalizeLegacyAgentIdentity } from "../../../core/src/adapters/legacy-agent-identity.js"
import {
  EXECUTOR_TOPOLOGY_V2_SCHEMA_VERSION,
  type ExecutorEdgeV2,
  type ExecutorNodeV2,
  type ExecutorTopologyV2,
} from "./executor-topology-v2"
import {
  EXECUTOR_GRAPH_SCHEMA_VERSION,
  EXECUTOR_GRAPH_SOURCE_OF_TRUTH,
  type ExecutorConnectionDraft,
  type ExecutorDraft,
  type ExecutorGraphWorkspace,
} from "./executor-graph"
import { DEFAULT_MAIN_AGENT_NAME_EN } from "./main-agent-copy"

export type TopologySubAgentSummaryKind = "root" | "sub_agent"
export type TopologySubAgentReadinessState = "ready" | "pending_runtime" | "needs_attention" | "disabled"
export type TopologySubAgentRuntimeState = "active" | "pending_runtime" | "inactive"

export interface TopologySubAgentSummary {
  kind: TopologySubAgentSummaryKind
  agentName: string
  role: string
  description: string
  parentDisplayName: string
  directChildLabels: string[]
  childCount: number
  readinessState: TopologySubAgentReadinessState
  readinessLabel: string
  runtimeState: TopologySubAgentRuntimeState
  runtimeLabel: string
  savedLabel: string
  lastRuntimeLabel: string
  modelLabel: string
  skillMcpLabel: string
  memoryLabel: string
  permissionLabel: string
  delegationLabel: string
}

export interface SubAgentTopologyProjection {
  topology: ExecutorTopologyV2
  graph: ExecutorGraphWorkspace
  summaries: Map<string, TopologySubAgentSummary>
}

const KNOWBEE_AGENT_ID = "agent:knowbee"
const UNNAMED_SUB_AGENT_NAME = "Unnamed sub-agent"

export function hasSetupSubAgentTopology(draft: SetupDraft): boolean {
  return (draft.subAgents?.items ?? []).some((item) => item.status !== "archived")
}

export function buildSubAgentTopologyProjection(input: {
  draft: SetupDraft
  now?: number | string
}): SubAgentTopologyProjection {
  const now = input.now ?? Date.now()
  const items = activeSubAgentItems(input.draft)
  const rootDisplayName = rootAgentDisplayName(input.draft)
  const nodes: ExecutorNodeV2[] = items.map((item, index) => subAgentNode(item, index, now))
  const activeItemIds = new Set(items.map((item) => item.agentId))
  const edges: ExecutorEdgeV2[] = items.flatMap((item, index) => {
    const parentAgentId = item.parentAgentId?.trim()
    if (!parentAgentId || parentAgentId === KNOWBEE_AGENT_ID || !activeItemIds.has(parentAgentId)) return []
    return [{
      id: `edge:${parentAgentId}:${item.agentId}:${index + 1}`,
      sourceNodeId: parentAgentId,
      targetNodeId: item.agentId,
      type: "delegates_to",
      label: "위임",
      status: "active" as const,
    }]
  })
  const topology: ExecutorTopologyV2 = {
    schemaVersion: EXECUTOR_TOPOLOGY_V2_SCHEMA_VERSION,
    id: "topology:sub-agent-setup",
    name: "Knowbee sub-agent team",
    status: input.draft.subAgents?.orchestrationEnabled ? "active" : "draft",
    activeVersion: 1,
    nodes,
    edges,
    createdAt: now,
    updatedAt: now,
    metadata: {
      source: "setup_sub_agents",
      projectionOnly: true,
    },
  }
  const graph = graphFromSubAgentTopology({
    topology,
    items,
    now,
  })
  return {
    topology,
    graph,
    summaries: buildTopologySubAgentSummaryMap({
      draft: input.draft,
      graphExecutorIds: graph.executors.map((executor) => executor.id),
      rootDisplayName,
      now,
    }),
  }
}

export function buildTopologySubAgentSummaryMap(input: {
  draft: SetupDraft
  graphExecutorIds: string[]
  rootDisplayName?: string | undefined
  now?: number | string
}): Map<string, TopologySubAgentSummary> {
  const now = typeof input.now === "number" ? input.now : Date.now()
  const rootDisplayName = input.rootDisplayName?.trim() || rootAgentDisplayName(input.draft)
  const items = activeSubAgentItems(input.draft)
  const graphIds = new Set(input.graphExecutorIds)
  const activeRuntimeIds = new Set(input.draft.subAgents?.runtimeActiveAgentIds ?? [])
  const lastRuntimeSeenAtByAgentId = input.draft.subAgents?.lastRuntimeSeenAtByAgentId ?? {}
  const map = new Map<string, TopologySubAgentSummary>()

  if (graphIds.has(KNOWBEE_AGENT_ID) || items.length > 0) {
    map.set(KNOWBEE_AGENT_ID, {
      kind: "root",
      agentName: rootDisplayName,
      role: "메인 에이전트",
      description: `${rootDisplayName}은 최상위에서 직속 서브 에이전트에게만 일을 위임합니다.`,
      parentDisplayName: "",
      directChildLabels: items.map((item) => subAgentDisplayName(item)),
      childCount: items.length,
      readinessState: items.length > 0 ? "ready" : "pending_runtime",
      readinessLabel: items.length > 0 ? "직속 서브 에이전트 준비" : "하위 없음",
      runtimeState: "active",
      runtimeLabel: "메인 에이전트",
      savedLabel: "저장됨",
      lastRuntimeLabel: "항상 대기",
      modelLabel: "공통 모델 정책",
      skillMcpLabel: "직속 서브 에이전트에게 위임",
      memoryLabel: "메인 메모리",
      permissionLabel: "제품 기본 권한",
      delegationLabel: "직속 서브 에이전트만 위임 가능",
    })
  }

  for (const item of items) {
    if (!graphIds.has(item.agentId)) continue
    const runtimeActive = activeRuntimeIds.has(item.agentId)
    const disabled = item.status === "disabled" || item.status === "degraded"
    const readinessState: TopologySubAgentReadinessState = disabled
      ? "needs_attention"
      : runtimeActive
        ? "ready"
        : "pending_runtime"
    map.set(item.agentId, {
      kind: "sub_agent",
      agentName: subAgentDisplayName(item),
      role: item.role,
      description: item.description,
      parentDisplayName: rootDisplayName,
      directChildLabels: [],
      childCount: 0,
      readinessState,
      readinessLabel: readinessLabel(readinessState),
      runtimeState: runtimeActive ? "active" : "pending_runtime",
      runtimeLabel: runtimeActive ? "실행 중" : "실행 반영 전",
      savedLabel: "저장됨",
      lastRuntimeLabel: runtimeActive
        ? relativeRuntimeLabel(lastRuntimeSeenAtByAgentId[item.agentId], now)
        : "기록 없음",
      modelLabel: "공통 모델 상속",
      skillMcpLabel: "공통 작업 능력/외부 기능 사용",
      memoryLabel: "독립 메모리",
      permissionLabel: "안전 기본 권한",
      delegationLabel: "하위 위임 가능",
    })
  }

  return map
}

export function applyTopologyExecutorToSetupDraft(
  draft: SetupDraft,
  executor: ExecutorDraft,
  now: number | string = Date.now(),
): SetupDraft {
  if (executor.id === KNOWBEE_AGENT_ID || !draft.subAgents) return draft
  const updatedAt = typeof now === "number" ? now : Date.now()
  const items = draft.subAgents.items.map((item) => {
    if (item.agentId !== executor.id) return item
    const agentName = executor.name
    const role = executor.executorProfile?.roleName ?? item.role
    const description = executor.description
    const canonicalItem = canonicalizeLegacyAgentIdentity(
      item as SetupSubAgentDraftItem & Record<string, unknown>,
    )
    return {
      ...canonicalItem,
      agentName,
      role,
      description,
      updatedAt,
      profileVersion: item.profileVersion + 1,
    }
  })
  return {
    ...draft,
    subAgents: {
      ...draft.subAgents,
      items,
    },
  }
}

export function archiveTopologySubAgentInSetupDraft(
  draft: SetupDraft,
  agentId: string,
  now: number = Date.now(),
): SetupDraft {
  if (agentId === KNOWBEE_AGENT_ID || !draft.subAgents) return draft
  const target = draft.subAgents.items.find((item) =>
    item.agentId === agentId && item.status !== "archived"
  )
  if (!target) return draft

  const nextParentAgentId = target.parentAgentId?.trim() || KNOWBEE_AGENT_ID
  return {
    ...draft,
    subAgents: {
      ...draft.subAgents,
      items: draft.subAgents.items.map((item) => {
        if (item.agentId === agentId) {
          return {
            ...item,
            status: "archived",
            updatedAt: now,
            profileVersion: item.profileVersion + 1,
          }
        }
        if (item.status !== "archived" && item.parentAgentId === agentId) {
          return {
            ...item,
            parentAgentId: nextParentAgentId,
            updatedAt: now,
            profileVersion: item.profileVersion + 1,
          }
        }
        return item
      }),
      runtimeActiveAgentIds: draft.subAgents.runtimeActiveAgentIds.filter((id) => id !== agentId),
    },
  }
}

function activeSubAgentItems(draft: SetupDraft): SetupSubAgentDraftItem[] {
  return (draft.subAgents?.items ?? []).filter((item) => item.status !== "archived")
}

function rootAgentDisplayName(draft: SetupDraft): string {
  return draft.mainAgent?.name.trim() || DEFAULT_MAIN_AGENT_NAME_EN
}

function subAgentNode(item: SetupSubAgentDraftItem, index: number, now: number | string): ExecutorNodeV2 {
  const display = subAgentDisplayName(item)
  return {
    id: item.agentId,
    name: display,
    roleName: item.role,
    description: item.description || item.role,
    position: {
      x: 80 + (index % 3) * 310,
      y: 80 + Math.floor(index / 3) * 200,
    },
    status: "active",
    profile: executorProfile({
      id: item.agentId,
      name: display,
      roleName: item.role,
      description: item.description || item.role,
    }),
    metadata: {
      source: "setup_sub_agents",
      kind: "sub_agent",
      updatedAt: String(now),
    },
  }
}

function subAgentDisplayName(item: SetupSubAgentDraftItem): string {
  return item.agentName === undefined ? UNNAMED_SUB_AGENT_NAME : item.agentName
}

function graphFromSubAgentTopology(input: {
  topology: ExecutorTopologyV2
  items: SetupSubAgentDraftItem[]
  now: number | string
}): ExecutorGraphWorkspace {
  const executors = input.topology.nodes.map((node) => executorDraftFromNode(node))
  const connections: ExecutorConnectionDraft[] = input.topology.edges.map((edge) => ({
    id: edge.id,
    fromExecutorId: edge.sourceNodeId,
    toExecutorId: edge.targetNodeId,
    inferredRelation: "handoff",
    label: "넘김",
    confidence: 1,
    userConfirmed: true,
    sourceRelationId: edge.id,
    advancedRelationType: "delegates_to",
  }))
  return {
    schemaVersion: EXECUTOR_GRAPH_SCHEMA_VERSION,
    graphId: `${input.topology.id}:executor-graph`,
    topologyId: input.topology.id,
    name: input.topology.name,
    mode: "simple",
    executors,
    sections: [],
    connections,
    selectedId: null,
    inference: {
      source: "enterprise_topology_projection",
      confidence: executors.length > 0 ? 1 : 0,
      executorCount: executors.length,
      connectionCount: connections.length,
      issueCount: 0,
      generatedAt: input.now,
    },
    compiledPreview: null,
    latestRun: null,
    issues: [],
    sourceOfTruth: EXECUTOR_GRAPH_SOURCE_OF_TRUTH,
  }
}

function executorDraftFromNode(node: ExecutorNodeV2): ExecutorDraft {
  const profile = executorProfile({
    id: node.id,
    name: node.name,
    roleName: node.roleName ?? "서브 에이전트",
    description: node.description,
  })
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    position: node.position,
    inferredRuntimeMode: "tool_execution",
    inferredCapabilities: [node.roleName ?? node.description],
    inferredTools: [],
    inferredOutputs: ["처리 결과"],
    inferredSuccessCriteria: ["맡은 일을 완료하고 상위 에이전트에게 보고"],
    executorProfile: profile,
    confidence: 1,
    userConfirmed: true,
    confirmedUnderstandingVersion: "setup-sub-agent-v1",
    sourceNodeId: node.id,
    advancedMapping: {
      nodeType: "function",
      executorKind: "agent",
      executorId: node.id,
    },
  }
}

function executorProfile(input: {
  id: string
  name: string
  roleName: string
  description: string
}): NonNullable<ExecutorDraft["executorProfile"]> {
  return {
    schemaVersion: 1,
    executorId: input.id,
    displayName: input.name,
    roleName: input.roleName,
    definition: input.description,
    does: [input.description],
    delegationScope: [input.roleName],
    expectedOutputs: ["처리 결과"],
    handoffStyle: "structured_handoff",
    declineCriteria: [],
    riskBoundary: [],
  }
}

function readinessLabel(state: TopologySubAgentReadinessState): string {
  if (state === "ready") return "실행 가능"
  if (state === "needs_attention") return "확인 필요"
  if (state === "disabled") return "비활성"
  return "실행 반영 전"
}

function relativeRuntimeLabel(value: number | undefined, now: number): string {
  if (!value) return "기록 없음"
  const diffMs = Math.max(0, now - value)
  const minutes = Math.max(1, Math.floor(diffMs / 60_000))
  if (minutes < 60) return `${minutes}분 전`
  const hours = Math.floor(minutes / 60)
  return `${hours}시간 전`
}
