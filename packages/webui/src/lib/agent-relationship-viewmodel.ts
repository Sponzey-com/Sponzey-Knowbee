import type { AgentRelationshipProjection, AgentWorkspaceItem } from "../contracts/agents"

export interface AgentRelationshipCanvasNode {
  agentRef: string
  name: string
  role: string
  parentLabel: string
  depth: number
  sortOrder: number
  x: number
  y: number
}

export interface AgentRelationshipCanvasEdge {
  relationshipRef: string
  parentRef: string
  childRef: string
}

export interface AgentRelationshipCanvasModel {
  nodes: AgentRelationshipCanvasNode[]
  edges: AgentRelationshipCanvasEdge[]
}

export function agentDescendantRefs(
  selectedRef: string,
  projection: AgentRelationshipProjection,
): ReadonlySet<string> {
  const children = new Map<string, string[]>()
  for (const relationship of projection.relationships) {
    const current = children.get(relationship.parentRef) ?? []
    current.push(relationship.childRef)
    children.set(relationship.parentRef, current)
  }
  const result = new Set<string>()
  const pending = [...(children.get(selectedRef) ?? [])]
  while (pending.length > 0) {
    const childRef = pending.shift()
    if (!childRef || result.has(childRef)) continue
    result.add(childRef)
    pending.push(...(children.get(childRef) ?? []))
  }
  return result
}

export function agentParentCandidates(input: {
  selectedRef: string
  agents: readonly AgentWorkspaceItem[]
  projection: AgentRelationshipProjection
}): AgentWorkspaceItem[] {
  const descendants = agentDescendantRefs(input.selectedRef, input.projection)
  return input.agents
    .filter(
      (agent) =>
        agent.status === "enabled" &&
        agent.agentRef !== input.selectedRef &&
        !descendants.has(agent.agentRef),
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef),
    )
}

export function currentAgentParentRef(
  agentRef: string,
  projection: AgentRelationshipProjection,
): string | null {
  const relationship = projection.relationships.find((item) => item.childRef === agentRef)
  if (!relationship || relationship.parentRef === projection.root.agentRef) return null
  return relationship.parentRef
}

export function buildAgentRelationshipCanvasModel(input: {
  agents: readonly AgentWorkspaceItem[]
  projection: AgentRelationshipProjection
}): AgentRelationshipCanvasModel {
  const agentByRef = new Map(input.agents.map((agent) => [agent.agentRef, agent]))
  const relationByChild = new Map(
    input.projection.relationships.map((relationship) => [relationship.childRef, relationship]),
  )
  const ordered = input.agents
    .filter((agent) => agent.status !== "archived")
    .map((agent) => {
      const relationship = relationByChild.get(agent.agentRef)
      const parentIsRoot =
        !relationship || relationship.parentRef === input.projection.root.agentRef
      return {
        agent,
        relationship,
        depth: parentIsRoot ? 1 : Math.max(2, relationship.depth),
        sortOrder: relationship?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        parentLabel: parentIsRoot ? `${input.projection.root.name} 직속` : relationship.parentName,
      }
    })
    .sort(
      (left, right) =>
        left.depth - right.depth ||
        left.sortOrder - right.sortOrder ||
        left.agent.name.localeCompare(right.agent.name) ||
        left.agent.agentRef.localeCompare(right.agent.agentRef),
    )
  const rowByDepth = new Map<number, number>()
  const nodes = ordered.map((item) => {
    const row = rowByDepth.get(item.depth) ?? 0
    rowByDepth.set(item.depth, row + 1)
    return {
      agentRef: item.agent.agentRef,
      name: item.agent.name,
      role: item.agent.role,
      parentLabel: item.parentLabel,
      depth: item.depth,
      sortOrder: item.sortOrder,
      x: (item.depth - 1) * 280,
      y: row * 128,
    }
  })
  const displayedRefs = new Set(nodes.map((node) => node.agentRef))
  const edges = input.projection.relationships
    .filter(
      (relationship) =>
        displayedRefs.has(relationship.parentRef) &&
        displayedRefs.has(relationship.childRef) &&
        agentByRef.has(relationship.parentRef),
    )
    .map((relationship) => ({
      relationshipRef: relationship.relationshipRef,
      parentRef: relationship.parentRef,
      childRef: relationship.childRef,
    }))
  return { nodes, edges }
}
