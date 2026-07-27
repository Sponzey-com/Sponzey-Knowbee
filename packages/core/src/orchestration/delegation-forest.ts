import { createHash } from "node:crypto"
import {
  findAgentNameNamespaceConflict,
  normalizeAgentNameSnapshot,
  validateAgentRelationship,
  type AgentRelationship,
  type AgentStatus,
  type DelegationPolicy,
} from "../contracts/sub-agent-orchestration.js"

export interface DelegationForestAgent {
  agentId: string
  agentName: string
  agentType: "knowbee" | "sub_agent"
  status: AgentStatus
  delegationPolicy?: DelegationPolicy
}

export interface DelegationForestSnapshot {
  rootAgentId: string
  agents: DelegationForestAgent[]
  relationships: AgentRelationship[]
  rootAgentIds: string[]
  directChildAgentIdsByParent: Record<string, string[]>
  snapshotFingerprint: string
}

export type DelegationForestDenialReason =
  | "snapshot_fingerprint_mismatch"
  | "caller_unknown"
  | "target_unknown"
  | "caller_inactive"
  | "target_inactive"
  | "target_not_direct_child"
  | "delegation_disabled"
  | "redelegation_denied"
  | "direct_child_policy_required"
  | "target_not_allowed"

export type DelegationForestAuthorization =
  | {
      ok: true
      authorizationReceiptId: string
      snapshotFingerprint: string
      callerAgentName: string
      targetAgentName: string
    }
  | { ok: false; reasonCode: DelegationForestDenialReason }

function requireText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function activeRelationships(relationships: AgentRelationship[]): AgentRelationship[] {
  return relationships.filter((relationship) => relationship.status === "active")
}

function assertNoCycles(agentIds: string[], childrenByParent: Map<string, string[]>): void {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (agentId: string): void => {
    if (visiting.has(agentId)) throw new Error("Delegation forest contains a cycle.")
    if (visited.has(agentId)) return
    visiting.add(agentId)
    for (const childId of childrenByParent.get(agentId) ?? []) visit(childId)
    visiting.delete(agentId)
    visited.add(agentId)
  }
  for (const agentId of agentIds) visit(agentId)
}

export function validateDelegationForestSnapshot(input: {
  rootAgentId: string
  agents: DelegationForestAgent[]
  relationships: AgentRelationship[]
}): DelegationForestSnapshot {
  const rootAgentId = requireText(input.rootAgentId, "Root agent ID")
  if (input.agents.length === 0) throw new Error("Delegation forest requires at least one agent.")

  const agents = input.agents.map((agent) => ({
    ...agent,
    agentId: requireText(agent.agentId, "Agent ID"),
    agentName: normalizeAgentNameSnapshot(requireText(agent.agentName, "Agent name")),
    ...(agent.delegationPolicy ? { delegationPolicy: structuredClone(agent.delegationPolicy) } : {}),
  }))
  const agentById = new Map<string, DelegationForestAgent>()
  for (const item of agents) {
    if (agentById.has(item.agentId)) throw new Error(`Agent ID must be unique: ${item.agentId}.`)
    agentById.set(item.agentId, item)
  }
  const rootAgent = agentById.get(rootAgentId)
  if (!rootAgent || rootAgent.agentType !== "knowbee") {
    throw new Error("Root agent must exist and have knowbee agent type.")
  }
  const nameConflict = findAgentNameNamespaceConflict(agents.map((item) => ({
    entityType: item.agentType,
    entityId: item.agentId,
    agentName: item.agentName,
    agentNameSnapshot: item.agentName,
  })))
  if (nameConflict) throw new Error(`Agent name must be unique: ${nameConflict.normalizedAgentName}.`)

  const active = activeRelationships(input.relationships)
  const edgeIds = new Set<string>()
  const relationshipPairs = new Set<string>()
  const parentByChild = new Map<string, string>()
  const childrenByParent = new Map<string, string[]>()
  for (const relationship of active) {
    const validation = validateAgentRelationship(relationship)
    if (!validation.ok) {
      const selfEdge = relationship.parentAgentId === relationship.childAgentId
      throw new Error(selfEdge ? "Delegation forest rejects a self edge." : "Delegation forest relationship is invalid.")
    }
    if (edgeIds.has(relationship.edgeId)) throw new Error(`Delegation forest edge ID is duplicate: ${relationship.edgeId}.`)
    edgeIds.add(relationship.edgeId)
    if (!agentById.has(relationship.parentAgentId) || !agentById.has(relationship.childAgentId)) {
      throw new Error("Delegation forest relationship has an unknown endpoint.")
    }
    const pair = `${relationship.parentAgentId}\u0000${relationship.childAgentId}`
    if (relationshipPairs.has(pair)) throw new Error("Delegation forest contains a duplicate relationship.")
    relationshipPairs.add(pair)
    const existingParent = parentByChild.get(relationship.childAgentId)
    if (existingParent && existingParent !== relationship.parentAgentId) {
      throw new Error("A delegation forest agent cannot have multiple parents.")
    }
    parentByChild.set(relationship.childAgentId, relationship.parentAgentId)
    const children = childrenByParent.get(relationship.parentAgentId) ?? []
    children.push(relationship.childAgentId)
    childrenByParent.set(relationship.parentAgentId, children)
  }
  if (parentByChild.has(rootAgentId)) throw new Error("The main root agent must remain parentless.")
  assertNoCycles([...agentById.keys()], childrenByParent)

  const rootAgentIds = [...agentById.keys()].filter((agentId) => !parentByChild.has(agentId)).sort()
  const directChildAgentIdsByParent = Object.fromEntries(
    [...childrenByParent.entries()]
      .map(([parentAgentId, children]) => [parentAgentId, [...new Set(children)].sort()] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  )
  const relationships = active.map((relationship) => structuredClone(relationship)).sort((left, right) =>
    left.parentAgentId.localeCompare(right.parentAgentId)
    || left.childAgentId.localeCompare(right.childAgentId)
    || left.edgeId.localeCompare(right.edgeId))
  const sortedAgents = agents.sort((left, right) => left.agentId.localeCompare(right.agentId))
  const snapshotFingerprint = `sha256:${hash({ rootAgentId, agents: sortedAgents, relationships })}`
  return {
    rootAgentId,
    agents: sortedAgents,
    relationships,
    rootAgentIds,
    directChildAgentIdsByParent,
    snapshotFingerprint,
  }
}

export function authorizeDelegationInForest(input: {
  snapshot: DelegationForestSnapshot
  expectedSnapshotFingerprint: string
  callerAgentId: string
  targetAgentId: string
}): DelegationForestAuthorization {
  if (input.expectedSnapshotFingerprint !== input.snapshot.snapshotFingerprint) {
    return { ok: false, reasonCode: "snapshot_fingerprint_mismatch" }
  }
  const caller = input.snapshot.agents.find((agent) => agent.agentId === input.callerAgentId)
  const target = input.snapshot.agents.find((agent) => agent.agentId === input.targetAgentId)
  if (!caller) return { ok: false, reasonCode: "caller_unknown" }
  if (!target) return { ok: false, reasonCode: "target_unknown" }
  if (caller.status !== "enabled") return { ok: false, reasonCode: "caller_inactive" }
  if (target.status !== "enabled") return { ok: false, reasonCode: "target_inactive" }
  const directChildren = input.snapshot.directChildAgentIdsByParent[caller.agentId] ?? []
  if (!directChildren.includes(target.agentId)) return { ok: false, reasonCode: "target_not_direct_child" }

  if (caller.agentType === "sub_agent") {
    const policy = caller.delegationPolicy
    if (!policy?.enabled) return { ok: false, reasonCode: "delegation_disabled" }
    if (policy.redelegationAllowed !== true) return { ok: false, reasonCode: "redelegation_denied" }
    if (policy.directChildOnly !== true) return { ok: false, reasonCode: "direct_child_policy_required" }
    if (policy.allowedChildAgentIds && !policy.allowedChildAgentIds.includes(target.agentId)) {
      return { ok: false, reasonCode: "target_not_allowed" }
    }
  }

  return {
    ok: true,
    authorizationReceiptId: `delegation-forest:${hash({
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      callerAgentId: caller.agentId,
      targetAgentId: target.agentId,
    }).slice(0, 24)}`,
    snapshotFingerprint: input.snapshot.snapshotFingerprint,
    callerAgentName: caller.agentName,
    targetAgentName: target.agentName,
  }
}
