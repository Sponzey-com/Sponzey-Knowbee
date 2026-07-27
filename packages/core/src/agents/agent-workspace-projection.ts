export type AgentWorkspaceStatus = "enabled" | "disabled" | "archived" | "degraded"
export type AgentWorkspaceBindingKind = "skill" | "mcp_server" | "yeonjang"
export type AgentWorkspaceDiagnosticCode =
  | "agent_name_required"
  | "agent_name_duplicate"
  | "agent_binding_target_missing"
  | "agent_relationship_target_missing"

export interface AgentWorkspaceSource {
  agentId: string
  agentType: "knowbee" | "sub_agent"
  status: AgentWorkspaceStatus
  agentName: string
  role: string
  profileVersion: number
  updatedAt: number
  model: {
    configured: boolean
    availability: "ready" | "degraded" | "unavailable" | "unknown"
    modelName?: string
  }
}

export interface AgentWorkspaceBindingSource {
  agentId: string
  kind: AgentWorkspaceBindingKind
  status: "enabled" | "disabled" | "archived"
  displayName?: string
}

export interface AgentWorkspaceRelationshipSource {
  parentAgentId: string
  childAgentId: string
  status: "active" | "disabled" | "archived"
}

export interface AgentWorkspaceItem {
  agentRef: string
  name: string
  role: string
  status: AgentWorkspaceStatus
  profileVersion: number
  updatedAt: number
  model: AgentWorkspaceSource["model"]
  parentName: string
  directChildCount: number
  bindingCounts: { skills: number; mcpServers: number; yeonjang: number }
  diagnosticCodes: AgentWorkspaceDiagnosticCode[]
}

export interface AgentWorkspaceProjection {
  items: AgentWorkspaceItem[]
  details: AgentWorkspaceDetail[]
  summary: {
    total: number
    enabled: number
    disabled: number
    archived: number
    degraded: number
    issueCount: number
    diagnosticCodes: AgentWorkspaceDiagnosticCode[]
  }
  observedAt: number
}

export interface AgentWorkspaceDetail extends AgentWorkspaceItem {
  bindingNames: { skills: string[]; mcpServers: string[]; yeonjang: string[] }
  directChildNames: string[]
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export function buildAgentWorkspaceProjection(input: {
  agents: readonly AgentWorkspaceSource[]
  bindings: readonly AgentWorkspaceBindingSource[]
  relationships: readonly AgentWorkspaceRelationshipSource[]
  mainAgentName: string
  observedAt: number
  publicRefForAgentId(agentId: string): string
}): AgentWorkspaceProjection {
  const subAgents = input.agents.filter((agent) => agent.agentType === "sub_agent")
  const sourceById = new Map(subAgents.map((agent) => [agent.agentId, agent]))
  const duplicateNames = new Set<string>()
  const nameCounts = new Map<string, number>()
  for (const agent of subAgents) {
    const name = normalizedName(agent.agentName)
    if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1)
  }
  for (const [name, count] of nameCounts) if (count > 1) duplicateNames.add(name)

  const projectionDiagnostics = new Set<AgentWorkspaceDiagnosticCode>()
  for (const binding of input.bindings) {
    if (!sourceById.has(binding.agentId)) projectionDiagnostics.add("agent_binding_target_missing")
  }
  for (const relationship of input.relationships) {
    if (
      !sourceById.has(relationship.childAgentId) ||
      (!sourceById.has(relationship.parentAgentId) &&
        !input.agents.some(
          (agent) => agent.agentType === "knowbee" && agent.agentId === relationship.parentAgentId,
        ))
    ) {
      projectionDiagnostics.add("agent_relationship_target_missing")
    }
  }

  const details = subAgents
    .map((agent): AgentWorkspaceDetail => {
      const name = agent.agentName.trim()
      const diagnostics: AgentWorkspaceDiagnosticCode[] = []
      if (!name) diagnostics.push("agent_name_required")
      else if (duplicateNames.has(normalizedName(name))) diagnostics.push("agent_name_duplicate")
      const enabledBindings = input.bindings.filter(
        (binding) => binding.agentId === agent.agentId && binding.status === "enabled",
      )
      const parentRelationship = input.relationships.find(
        (relationship) =>
          relationship.childAgentId === agent.agentId && relationship.status === "active",
      )
      const parent = parentRelationship
        ? input.agents.find((candidate) => candidate.agentId === parentRelationship.parentAgentId)
        : undefined
      const directChildren = input.relationships
        .filter(
          (relationship) =>
            relationship.parentAgentId === agent.agentId && relationship.status === "active",
        )
        .map((relationship) => sourceById.get(relationship.childAgentId)?.agentName.trim())
        .filter((name): name is string => Boolean(name))
        .sort()
      const bindingNames = (kind: AgentWorkspaceBindingKind) =>
        enabledBindings
          .filter((binding) => binding.kind === kind)
          .map((binding) => binding.displayName?.trim())
          .filter((name): name is string => Boolean(name))
          .sort()
      return Object.freeze({
        agentRef: input.publicRefForAgentId(agent.agentId),
        name: name || "이름 없음",
        role: agent.role.trim(),
        status: agent.status,
        profileVersion: agent.profileVersion,
        updatedAt: agent.updatedAt,
        model: Object.freeze({ ...agent.model }),
        parentName:
          parent?.agentType === "sub_agent"
            ? parent.agentName.trim() || "이름 없음"
            : input.mainAgentName.trim() || "Knowbee",
        directChildCount: directChildren.length,
        bindingCounts: Object.freeze({
          skills: enabledBindings.filter((binding) => binding.kind === "skill").length,
          mcpServers: enabledBindings.filter((binding) => binding.kind === "mcp_server").length,
          yeonjang: enabledBindings.filter((binding) => binding.kind === "yeonjang").length,
        }),
        diagnosticCodes: Object.freeze(diagnostics) as AgentWorkspaceDiagnosticCode[],
        bindingNames: Object.freeze({
          skills: Object.freeze(bindingNames("skill")) as string[],
          mcpServers: Object.freeze(bindingNames("mcp_server")) as string[],
          yeonjang: Object.freeze(bindingNames("yeonjang")) as string[],
        }),
        directChildNames: Object.freeze(directChildren) as string[],
      })
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.agentRef.localeCompare(right.agentRef),
    )

  const items = details.map(
    ({ bindingNames: _bindingNames, directChildNames: _children, ...item }) => Object.freeze(item),
  )
  return Object.freeze({
    items: Object.freeze(items) as AgentWorkspaceItem[],
    details: Object.freeze(details) as AgentWorkspaceDetail[],
    summary: Object.freeze({
      total: items.length,
      enabled: items.filter((item) => item.status === "enabled").length,
      disabled: items.filter((item) => item.status === "disabled").length,
      archived: items.filter((item) => item.status === "archived").length,
      degraded: items.filter((item) => item.status === "degraded").length,
      issueCount:
        items.filter((item) => item.diagnosticCodes.length > 0).length + projectionDiagnostics.size,
      diagnosticCodes: Object.freeze(
        [...projectionDiagnostics].sort(),
      ) as AgentWorkspaceDiagnosticCode[],
    }),
    observedAt: input.observedAt,
  })
}
