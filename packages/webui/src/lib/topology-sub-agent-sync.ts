import type { SetupDraft, SetupSubAgentDraftItem } from "../contracts/setup"
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

export type TopologySubAgentSummaryKind = "root" | "sub_agent"
export type TopologySubAgentReadinessState = "ready" | "pending_runtime" | "needs_attention" | "disabled"
export type TopologySubAgentRuntimeState = "active" | "pending_runtime" | "inactive"

export interface TopologySubAgentSummary {
  kind: TopologySubAgentSummaryKind
  displayName: string
  nickname: string
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

const NOBIE_AGENT_ID = "agent:nobie"
const NOBIE_DISPLAY_NAME = "Nobie"

export function hasSetupSubAgentTopology(draft: SetupDraft): boolean {
  return (draft.subAgents?.items ?? []).some((item) => item.status !== "archived")
}

export function buildSubAgentTopologyProjection(input: {
  draft: SetupDraft
  now?: number | string
}): SubAgentTopologyProjection {
  const now = input.now ?? Date.now()
  const items = activeSubAgentItems(input.draft)
  const nodes: ExecutorNodeV2[] = [
    rootNode(now),
    ...items.map((item, index) => subAgentNode(item, index, now)),
  ]
  const edges: ExecutorEdgeV2[] = items.map((item, index) => ({
    id: `edge:nobie:${index + 1}`,
    sourceNodeId: NOBIE_AGENT_ID,
    targetNodeId: item.agentId,
    type: "delegates_to",
    label: "위임",
    status: "active",
  }))
  const topology: ExecutorTopologyV2 = {
    schemaVersion: EXECUTOR_TOPOLOGY_V2_SCHEMA_VERSION,
    id: "topology:sub-agent-setup",
    name: "Nobie sub-agent team",
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
      now,
    }),
  }
}

export function buildTopologySubAgentSummaryMap(input: {
  draft: SetupDraft
  graphExecutorIds: string[]
  now?: number | string
}): Map<string, TopologySubAgentSummary> {
  const now = typeof input.now === "number" ? input.now : Date.now()
  const items = activeSubAgentItems(input.draft)
  const graphIds = new Set(input.graphExecutorIds)
  const activeRuntimeIds = new Set(input.draft.subAgents?.runtimeActiveAgentIds ?? [])
  const lastRuntimeSeenAtByAgentId = input.draft.subAgents?.lastRuntimeSeenAtByAgentId ?? {}
  const map = new Map<string, TopologySubAgentSummary>()

  if (graphIds.has(NOBIE_AGENT_ID) || items.length > 0) {
    map.set(NOBIE_AGENT_ID, {
      kind: "root",
      displayName: NOBIE_DISPLAY_NAME,
      nickname: NOBIE_DISPLAY_NAME,
      role: "메인 에이전트",
      description: "노비는 최상위에서 직접 하위 서브 에이전트에게만 일을 위임합니다.",
      parentDisplayName: "",
      directChildLabels: items.map((item) => item.displayName),
      childCount: items.length,
      readinessState: items.length > 0 ? "ready" : "pending_runtime",
      readinessLabel: items.length > 0 ? "직접 하위 준비" : "하위 없음",
      runtimeState: "active",
      runtimeLabel: "메인 에이전트",
      savedLabel: "저장됨",
      lastRuntimeLabel: "항상 대기",
      modelLabel: "공통 모델 정책",
      skillMcpLabel: "직접 하위에게 위임",
      memoryLabel: "메인 메모리",
      permissionLabel: "제품 기본 권한",
      delegationLabel: "직접 하위만 위임 가능",
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
      displayName: item.displayName,
      nickname: item.nickname || item.displayName,
      role: item.role,
      description: item.description,
      parentDisplayName: NOBIE_DISPLAY_NAME,
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
      skillMcpLabel: "공통 Skill/MCP 사용",
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
  if (executor.id === NOBIE_AGENT_ID || !draft.subAgents) return draft
  const updatedAt = typeof now === "number" ? now : Date.now()
  const items = draft.subAgents.items.map((item) => {
    if (item.agentId !== executor.id) return item
    const displayName = executor.name.trim() || item.displayName
    const role = executor.executorProfile?.roleName?.trim() || item.role
    const description = executor.description.trim() || item.description
    return {
      ...item,
      displayName,
      nickname: displayName,
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

function activeSubAgentItems(draft: SetupDraft): SetupSubAgentDraftItem[] {
  return (draft.subAgents?.items ?? []).filter((item) => item.status !== "archived")
}

function rootNode(now: number | string): ExecutorNodeV2 {
  return {
    id: NOBIE_AGENT_ID,
    name: NOBIE_DISPLAY_NAME,
    roleName: "메인 에이전트",
    description: "최상위에서 직접 하위 서브 에이전트에게 일을 위임합니다.",
    position: { x: 120, y: 80 },
    status: "active",
    profile: executorProfile({
      id: NOBIE_AGENT_ID,
      name: NOBIE_DISPLAY_NAME,
      roleName: "메인 에이전트",
      description: "최상위에서 직접 하위 서브 에이전트에게 일을 위임합니다.",
    }),
    metadata: {
      source: "setup_sub_agents",
      kind: "root",
      updatedAt: String(now),
    },
  }
}

function subAgentNode(item: SetupSubAgentDraftItem, index: number, now: number | string): ExecutorNodeV2 {
  const display = item.nickname || item.displayName
  return {
    id: item.agentId,
    name: display,
    roleName: item.role,
    description: item.description || item.role,
    position: {
      x: 80 + (index % 3) * 310,
      y: 300 + Math.floor(index / 3) * 200,
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
    roleName: node.roleName ?? "실행자",
    description: node.description,
  })
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    position: node.position,
    inferredRuntimeMode: node.id === NOBIE_AGENT_ID ? "auto" : "tool_execution",
    inferredCapabilities: node.id === NOBIE_AGENT_ID ? ["직접 하위 위임"] : [node.roleName ?? node.description],
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
      executorKind: node.id === NOBIE_AGENT_ID ? "nobie" : "agent",
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
