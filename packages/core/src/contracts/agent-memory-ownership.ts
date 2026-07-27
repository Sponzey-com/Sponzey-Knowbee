export const AGENT_MEMORY_STORE_KINDS = ["short_term", "long_term", "history"] as const
export type AgentMemoryStoreKind = typeof AGENT_MEMORY_STORE_KINDS[number]

export const SHORT_TERM_MEMORY_CATEGORIES = [
  "current_conversation",
  "current_work",
  "recent_tool_result",
  "active_delegation",
  "provisional_judgment",
] as const
export type ShortTermMemoryCategory = typeof SHORT_TERM_MEMORY_CATEGORIES[number]

export interface AgentMemoryOwner {
  agentId: string
  lifecycle: "active" | "inactive"
}

export interface AgentMemoryStoreBinding {
  agentId: string
  namespaceId: string
  storeKind: AgentMemoryStoreKind
  lifecycle: "active" | "retired"
}

export interface ShortTermMemoryEntryIntent {
  entryId: string
  ownerAgentId: string
  sourceOwnerAgentId: string
  category: ShortTermMemoryCategory
  scopeType: "session" | "run" | "work" | "delegation"
  scopeId: string
  scopeLifecycle: "active" | "terminated"
}

export type AgentMemoryOwnershipIssueCode =
  | "agent_owner_duplicate"
  | "memory_store_binding_missing"
  | "memory_store_binding_duplicate"
  | "memory_namespace_shared"
  | "memory_binding_owner_unknown"
  | "short_term_owner_unknown"
  | "short_term_source_owner_mismatch"
  | "short_term_category_invalid"
  | "short_term_scope_invalid"
  | "short_term_scope_terminated"

export interface AgentMemoryOwnershipIssue {
  code: AgentMemoryOwnershipIssueCode
  subjectId: string
  storeKind?: AgentMemoryStoreKind
}

export type AgentMemoryOwnershipDecision =
  | { status: "eligible"; activeAgentIds: string[] }
  | { status: "blocked"; issues: AgentMemoryOwnershipIssue[] }

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

export function evaluateAgentMemoryOwnership(input: {
  agents: AgentMemoryOwner[]
  bindings: AgentMemoryStoreBinding[]
  shortTermEntries: ShortTermMemoryEntryIntent[]
}): AgentMemoryOwnershipDecision {
  const issues: AgentMemoryOwnershipIssue[] = []
  const add = (code: AgentMemoryOwnershipIssueCode, subjectId: string, storeKind?: AgentMemoryStoreKind): void => {
    issues.push({ code, subjectId, ...(storeKind ? { storeKind } : {}) })
  }
  const agentCounts = new Map<string, number>()
  const activeAgentIds = new Set<string>()
  for (const agent of input.agents) {
    const agentId = required(agent.agentId, "Agent ID")
    agentCounts.set(agentId, (agentCounts.get(agentId) ?? 0) + 1)
    if (agent.lifecycle === "active") activeAgentIds.add(agentId)
  }
  for (const [agentId, count] of agentCounts) if (count > 1) add("agent_owner_duplicate", agentId)

  const bindingCounts = new Map<string, number>()
  const namespaceOwners = new Map<string, string>()
  for (const binding of input.bindings) {
    const agentId = required(binding.agentId, "Memory binding agent ID")
    const namespaceId = required(binding.namespaceId, "Memory namespace ID")
    if (!agentCounts.has(agentId)) add("memory_binding_owner_unknown", namespaceId, binding.storeKind)
    if (binding.lifecycle === "active") {
      const key = `${agentId}\u0000${binding.storeKind}`
      bindingCounts.set(key, (bindingCounts.get(key) ?? 0) + 1)
      const existingOwner = namespaceOwners.get(namespaceId)
      if (existingOwner && existingOwner !== agentId) add("memory_namespace_shared", namespaceId, binding.storeKind)
      else namespaceOwners.set(namespaceId, agentId)
    }
  }
  for (const agentId of activeAgentIds) {
    for (const storeKind of AGENT_MEMORY_STORE_KINDS) {
      const count = bindingCounts.get(`${agentId}\u0000${storeKind}`) ?? 0
      if (count === 0) add("memory_store_binding_missing", agentId, storeKind)
      if (count > 1) add("memory_store_binding_duplicate", agentId, storeKind)
    }
  }

  const allowedCategories = new Set<string>(SHORT_TERM_MEMORY_CATEGORIES)
  const allowedScopes: Record<ShortTermMemoryCategory, Set<ShortTermMemoryEntryIntent["scopeType"]>> = {
    current_conversation: new Set(["session"]),
    current_work: new Set(["run", "work"]),
    recent_tool_result: new Set(["run", "work"]),
    active_delegation: new Set(["delegation"]),
    provisional_judgment: new Set(["run", "work"]),
  }
  for (const entry of input.shortTermEntries) {
    const entryId = required(entry.entryId, "Short-term entry ID")
    const ownerAgentId = required(entry.ownerAgentId, "Short-term owner agent ID")
    const sourceOwnerAgentId = required(entry.sourceOwnerAgentId, "Short-term source owner agent ID")
    required(entry.scopeId, "Short-term scope ID")
    if (!activeAgentIds.has(ownerAgentId)) add("short_term_owner_unknown", entryId)
    if (sourceOwnerAgentId !== ownerAgentId) add("short_term_source_owner_mismatch", entryId)
    if (!allowedCategories.has(entry.category)) add("short_term_category_invalid", entryId)
    else if (!allowedScopes[entry.category].has(entry.scopeType)) add("short_term_scope_invalid", entryId)
    if (entry.scopeLifecycle !== "active") add("short_term_scope_terminated", entryId)
  }
  const unique = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}\u0000${issue.storeKind ?? ""}`, issue])).values()]
  return unique.length > 0
    ? { status: "blocked", issues: unique }
    : { status: "eligible", activeAgentIds: [...activeAgentIds].sort() }
}

export async function writeAgentMemoryEntry<T>(input: {
  decision: AgentMemoryOwnershipDecision
  write: (decision: Extract<AgentMemoryOwnershipDecision, { status: "eligible" }>) => Promise<T>
}): Promise<{ status: "written"; result: T } | Extract<AgentMemoryOwnershipDecision, { status: "blocked" }>> {
  if (input.decision.status === "blocked") return input.decision
  return { status: "written", result: await input.write(input.decision) }
}
