import type { ChannelSource } from "../channels/contracts.js"
import type { AgentExecutionToolBinding } from "../orchestration/execution-decision-contract.js"
import type { AnyTool } from "../tools/types.js"

type ExecutionToolDescriptor = Pick<
  AnyTool,
  | "name"
  | "description"
  | "riskLevel"
  | "requiresApproval"
  | "availableSources"
  | "evidenceSourceKind"
  | "sideEffect"
>

function permissionScope(tool: ExecutionToolDescriptor): AgentExecutionToolBinding["permission_scope"] {
  if (tool.requiresApproval) return "approval_required"
  if (tool.evidenceSourceKind === "web") return "external"
  if (tool.riskLevel === "dangerous") return "local_system"
  if (tool.sideEffect) return "write"
  return "read"
}

export function projectAgentExecutionToolBindings(input: {
  tools: ExecutionToolDescriptor[]
  source: ChannelSource
  toolsEnabled: boolean
}): AgentExecutionToolBinding[] {
  if (!input.toolsEnabled) return []

  return input.tools
    .filter((tool) =>
      tool.availableSources == null || tool.availableSources.includes(input.source)
    )
    .map((tool) => ({
      tool_id: tool.name,
      label: tool.description.trim() || tool.name,
      permission_scope: permissionScope(tool),
    }))
    .sort((left, right) => left.tool_id.localeCompare(right.tool_id))
}
