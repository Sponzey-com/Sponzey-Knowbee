export interface AgentRelationshipProjectionSource {
  internalEdgeId: string
  parentAgentId: string
  parentName: string
  childAgentId: string
  childName: string
  status: "active" | "disabled" | "archived"
  sortOrder: number
  revision: number
}

export interface AgentRelationshipProjectionItem {
  relationshipRef: string
  parentRef: string
  parentName: string
  childRef: string
  childName: string
  depth: number
  sortOrder: number
}

export interface AgentRelationshipProjection {
  root: { agentRef: string; name: string }
  relationships: AgentRelationshipProjectionItem[]
  revision: number
  observedAt: number
}

const AGENT_REF_PATTERN = /^agent_v1_[a-f0-9]{24}$/u
const RELATIONSHIP_REF_PATTERN = /^relationship_v1_[a-f0-9]{24}$/u

export function buildAgentRelationshipProjection(input: {
  rootAgentId: string
  rootName: string
  relationships: readonly AgentRelationshipProjectionSource[]
  observedAt: number
  publicRefForAgent(internalAgentId: string): string
  publicRefForRelationship(internalEdgeId: string): string
}): AgentRelationshipProjection {
  const active = input.relationships.filter((relationship) => relationship.status === "active")
  const parentByChild = new Map<string, AgentRelationshipProjectionSource>()
  const publicAgentOwners = new Map<string, string>()
  const publicRelationshipOwners = new Map<string, string>()

  function agentRef(internalAgentId: string): string {
    const result = input.publicRefForAgent(internalAgentId)
    if (!AGENT_REF_PATTERN.test(result)) throw new Error("agent_relationship_public_ref_invalid")
    const owner = publicAgentOwners.get(result)
    if (owner && owner !== internalAgentId)
      throw new Error("agent_relationship_public_ref_collision")
    publicAgentOwners.set(result, internalAgentId)
    return result
  }

  for (const relationship of active) {
    if (!relationship.parentName.trim() || !relationship.childName.trim())
      throw new Error("agent_relationship_unknown_endpoint")
    if (relationship.childAgentId === input.rootAgentId)
      throw new Error("agent_relationship_root_child_forbidden")
    if (parentByChild.has(relationship.childAgentId))
      throw new Error("agent_relationship_duplicate_parent")
    parentByChild.set(relationship.childAgentId, relationship)
  }

  function depth(childAgentId: string): number {
    let cursor = childAgentId
    let value = 0
    const seen = new Set<string>()
    while (cursor !== input.rootAgentId) {
      if (seen.has(cursor)) throw new Error("agent_relationship_cycle")
      seen.add(cursor)
      const relationship = parentByChild.get(cursor)
      if (!relationship) return value
      cursor = relationship.parentAgentId
      value += 1
    }
    return value
  }

  const rootRef = agentRef(input.rootAgentId)
  const relationships = active
    .map((relationship): AgentRelationshipProjectionItem => {
      const relationshipRef = input.publicRefForRelationship(relationship.internalEdgeId)
      if (!RELATIONSHIP_REF_PATTERN.test(relationshipRef))
        throw new Error("agent_relationship_public_ref_invalid")
      const owner = publicRelationshipOwners.get(relationshipRef)
      if (owner && owner !== relationship.internalEdgeId)
        throw new Error("agent_relationship_public_ref_collision")
      publicRelationshipOwners.set(relationshipRef, relationship.internalEdgeId)
      return {
        relationshipRef,
        parentRef: agentRef(relationship.parentAgentId),
        parentName: relationship.parentName.trim(),
        childRef: agentRef(relationship.childAgentId),
        childName: relationship.childName.trim(),
        depth: depth(relationship.childAgentId),
        sortOrder: relationship.sortOrder,
      }
    })
    .sort(
      (left, right) =>
        left.depth - right.depth ||
        left.sortOrder - right.sortOrder ||
        left.childName.localeCompare(right.childName) ||
        left.childRef.localeCompare(right.childRef),
    )
  return Object.freeze({
    root: Object.freeze({ agentRef: rootRef, name: input.rootName.trim() }),
    relationships: Object.freeze(relationships) as AgentRelationshipProjectionItem[],
    revision: input.relationships.reduce(
      (maximum, relationship) => Math.max(maximum, relationship.revision),
      0,
    ),
    observedAt: input.observedAt,
  })
}

export function queryAgentRelationshipProjection(
  projection: AgentRelationshipProjection,
  input: { limit?: number } = {},
): AgentRelationshipProjection {
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 100)))
  return Object.freeze({
    ...projection,
    relationships: projection.relationships.slice(0, limit),
  })
}
