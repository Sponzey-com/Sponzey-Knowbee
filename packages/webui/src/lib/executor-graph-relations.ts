import type {
  ExecutorDraft,
  ExecutorGraphWorkspace,
} from "./executor-graph"

export type ExecutorGraphRelationKind = "root_direct" | "child" | "indirect"

export interface ExecutorGraphRelationInfo {
  executorId: string
  relationKind: ExecutorGraphRelationKind
  relationLabelKo: string
  relationLabelEn: string
  relationDetailKo: string
  relationDetailEn: string
  selectableWithoutPath: boolean
  parentExecutorIds: string[]
  parentLabel?: string
  roleLabel: string
  shortId: string
  duplicateName: boolean
}

export interface ExecutorGraphRelationInfoOptions {
  rootAgentLabel?: string | undefined
}

interface RootAgentRelationText {
  koLabel: string
  koSubject: string
  enLabel: string
  enSubject: string
  enPossessive: string
}

export function buildExecutorGraphRelationInfoMap(
  graph: ExecutorGraphWorkspace | null | undefined,
  options: ExecutorGraphRelationInfoOptions = {},
): Map<string, ExecutorGraphRelationInfo> {
  const result = new Map<string, ExecutorGraphRelationInfo>()
  if (!graph) return result
  const rootAgent = rootAgentRelationText(options.rootAgentLabel)

  const executorById = new Map(graph.executors.map((executor) => [executor.id, executor]))
  const incoming = new Map<string, string[]>()
  for (const connection of graph.connections) {
    incoming.set(connection.toExecutorId, [
      ...(incoming.get(connection.toExecutorId) ?? []),
      connection.fromExecutorId,
    ])
  }

  const nameCounts = new Map<string, number>()
  for (const executor of graph.executors) {
    const key = normalizedName(executor.name)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }

  const depthMemo = new Map<string, number>()
  const depthFor = (executorId: string, seen = new Set<string>()): number => {
    if (depthMemo.has(executorId)) return depthMemo.get(executorId) ?? 0
    if (seen.has(executorId)) return 1
    const parents = incoming.get(executorId) ?? []
    if (parents.length === 0) {
      depthMemo.set(executorId, 0)
      return 0
    }
    const nextSeen = new Set(seen)
    nextSeen.add(executorId)
    const depth = 1 + Math.min(...parents.map((parentId) => depthFor(parentId, nextSeen)))
    depthMemo.set(executorId, depth)
    return depth
  }

  for (const executor of graph.executors) {
    const parentExecutorIds = [...(incoming.get(executor.id) ?? [])].sort((left, right) => left.localeCompare(right))
    const firstParent = parentExecutorIds[0] ? executorById.get(parentExecutorIds[0]) : undefined
    const parentLabel = firstParent ? executorNameForDisplay(firstParent) : undefined
    const depth = depthFor(executor.id)
    const duplicateName = (nameCounts.get(normalizedName(executor.name)) ?? 0) > 1
    const roleLabel = executorRoleLabel(executor)
    const shortId = shortExecutorId(executor.id)
    const relationKind: ExecutorGraphRelationKind = depth === 0
      ? "root_direct"
      : depth === 1
        ? "child"
        : "indirect"

    result.set(executor.id, {
      executorId: executor.id,
      relationKind,
      relationLabelKo: relationLabelKo(relationKind, parentLabel, rootAgent),
      relationLabelEn: relationLabelEn(relationKind, parentLabel, rootAgent),
      relationDetailKo: relationDetailKo(relationKind, parentLabel, rootAgent),
      relationDetailEn: relationDetailEn(relationKind, parentLabel, rootAgent),
      selectableWithoutPath: relationKind === "root_direct",
      parentExecutorIds,
      ...(parentLabel ? { parentLabel } : {}),
      roleLabel,
      shortId,
      duplicateName,
    })
  }

  return result
}

export function executorNameForDisplay(executor: ExecutorDraft): string {
  return normalizeLegacyExecutorDefaultText(executor.name.trim()) || executor.id
}

export function executorRoleLabel(executor: ExecutorDraft): string {
  return normalizeLegacyExecutorDefaultText(
    executor.executorProfile?.roleName?.trim() ||
    executor.advancedMapping?.nodeType ||
    runtimeModeLabel(executor.inferredRuntimeMode)
  )
}

export function shortExecutorId(executorId: string): string {
  const parts = executorId.split(":").filter(Boolean)
  return parts.at(-1) ?? executorId
}

function normalizedName(name: string): string {
  return name.trim().toLocaleLowerCase() || "(blank)"
}

export function normalizeLegacyExecutorDefaultText(value: string): string {
  const trimmed = value.trim()
  if (/^새 실행자\s+\d+$/.test(trimmed)) return trimmed.replace(/^새 실행자/, "새 서브 에이전트")
  if (trimmed === "실행자") return "서브 에이전트"
  if (trimmed === "이 실행자가 맡을 일을 적어주세요.") return "이 서브 에이전트가 맡을 일을 적어주세요."
  return trimmed
}

function rootAgentRelationText(value: string | undefined): RootAgentRelationText {
  const trimmed = value?.trim() ?? ""
  if (!trimmed || isDefaultMainAgentAlias(trimmed)) {
    return {
      koLabel: "메인 에이전트",
      koSubject: "메인 에이전트가",
      enLabel: "main agent",
      enSubject: "The main agent",
      enPossessive: "the main agent's",
    }
  }
  return {
    koLabel: trimmed,
    koSubject: withKoreanSubjectParticle(trimmed),
    enLabel: trimmed,
    enSubject: trimmed,
    enPossessive: `${trimmed}'s`,
  }
}

function isDefaultMainAgentAlias(value: string): boolean {
  const normalized = value.trim().normalize("NFKC").toLocaleLowerCase()
  return normalized === "knowbee" || normalized === "노비"
}

function withKoreanSubjectParticle(value: string): string {
  return `${value}${hasKoreanFinalConsonant(value) ? "이" : "가"}`
}

function hasKoreanFinalConsonant(value: string): boolean {
  const lastHangul = [...value.trim()].reverse().find((char) => /[가-힣]/u.test(char))
  if (!lastHangul) return false
  const code = lastHangul.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return false
  return code % 28 !== 0
}

function relationLabelKo(kind: ExecutorGraphRelationKind, parentLabel: string | undefined, rootAgent: RootAgentRelationText): string {
  if (kind === "root_direct") return `${rootAgent.koLabel} 직속`
  if (kind === "child") return `${parentLabel ?? "상위 서브 에이전트"}의 하위`
  return "간접 서브 에이전트"
}

function relationLabelEn(kind: ExecutorGraphRelationKind, parentLabel: string | undefined, rootAgent: RootAgentRelationText): string {
  if (kind === "root_direct") return `Direct child of ${rootAgent.enLabel}`
  if (kind === "child") return `Child of ${parentLabel ?? "parent sub-agent"}`
  return "Indirect sub-agent"
}

function relationDetailKo(kind: ExecutorGraphRelationKind, parentLabel: string | undefined, rootAgent: RootAgentRelationText): string {
  if (kind === "root_direct") {
    return `채널이나 사용자 요청이 들어오면 ${rootAgent.koSubject} 바로 후보로 검토할 수 있는 서브 에이전트입니다.`
  }
  if (kind === "child") {
    return `${parentLabel ?? "상위 서브 에이전트"}를 통해 위임 흐름에 들어갑니다. 실행 때는 연결 경로가 필요합니다.`
  }
  return `${rootAgent.koSubject} 바로 고르는 후보가 아니라 연결된 위임 흐름을 거쳐 도달하는 서브 에이전트입니다.`
}

function relationDetailEn(kind: ExecutorGraphRelationKind, parentLabel: string | undefined, rootAgent: RootAgentRelationText): string {
  if (kind === "root_direct") {
    return `${rootAgent.enSubject} can consider this sub-agent directly when a channel or user request arrives.`
  }
  if (kind === "child") {
    return `Execution reaches this sub-agent through ${parentLabel ?? "its parent sub-agent"}; a connection path is required at runtime.`
  }
  return `This sub-agent is reached through the delegation flow, not selected directly from ${rootAgent.enPossessive} root decision.`
}

function runtimeModeLabel(mode: ExecutorDraft["inferredRuntimeMode"]): string {
  if (mode === "tool_execution") return "도구 사용"
  if (mode === "external") return "외부 연동"
  if (mode === "approval" || mode === "human_check" || mode === "unknown") return "최종 검토"
  return "자동 처리"
}
