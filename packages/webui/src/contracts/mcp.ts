export type McpTransport = "stdio" | "http"

export interface McpToolStatus {
  name: string
  registeredName: string
  description: string
}

export interface McpServerStatus {
  name: string
  transport: McpTransport
  enabled: boolean
  required: boolean
  ready: boolean
  toolCount: number
  registeredToolCount: number
  command?: string
  url?: string
  error?: string
  tools: McpToolStatus[]
}

export interface McpSummary {
  serverCount: number
  readyCount: number
  toolCount: number
  requiredFailures: number
}

export interface McpServersResponse {
  servers: McpServerStatus[]
  summary: McpSummary
}

export type McpCatalogRuntimeStatus = "ready" | "unavailable" | "inactive" | "not_loaded"
export interface McpCatalogProjection {
  mcpRef: string
  displayName: string
  transport: McpTransport
  configuredStatus: "enabled" | "disabled"
  runtimeStatus: McpCatalogRuntimeStatus
  required: boolean
  toolCount: number
  bindingCount: number
  issueCode:
    | "mcp_inactive"
    | "mcp_runtime_not_loaded"
    | "mcp_runtime_unavailable"
    | "mcp_required_unavailable"
    | null
  revision: number
}
export interface McpCatalogDetail extends McpCatalogProjection {
  tools: Array<{ name: string; description: string; access?: McpToolAgentAccess[] }>
  bindings: { boundAgents: McpAgentProjection[]; availableAgents: McpAgentProjection[] }
}
export interface McpAgentProjection {
  agentRef: string
  name: string
}
export interface McpToolAgentAccess {
  agentRef: string
  agentName: string
  status: "allowed" | "disabled" | "not_bound"
}
export interface McpCatalogPageResponse {
  items: McpCatalogProjection[]
  nextCursor: string | null
  revision: number
  observedAt: number
}
export interface McpCatalogQueryInput {
  limit?: number
  cursor?: string
  search?: string
  transport?: McpTransport
  runtimeStatus?: McpCatalogRuntimeStatus
  boundOnly?: boolean
}

export interface McpConnectionDraft {
  displayName: string
  transport: McpTransport
  command: string
  args: string[]
  cwd: string
  url?: string
  required: boolean
}

export interface McpProtectedUpdateChange {
  displayName?: string
  required?: boolean
  replacement?: Pick<McpConnectionDraft, "transport" | "command" | "args" | "cwd" | "url">
}

export interface McpProbeReceipt {
  state: "ready" | "rejected" | "failed" | "cancelled" | "not_found"
  ready: boolean
  reasonCode: string | null
  tools?: Array<{ name: string; description: string }>
  observedAt: number
}

export interface McpMutationEnvelope {
  scope: "capability:write"
  mutationId: string
  targetRevision: number
  purpose:
    | "mcp_create"
    | "mcp_update"
    | "mcp_bind"
    | "mcp_unbind"
    | "mcp_enable"
    | "mcp_disable"
    | "mcp_delete"
    | "mcp_recover"
  issuedAt: number
  nonce: string
}

export interface McpMutationReceipt {
  mutationId: string
  state:
    | "validating"
    | "persisting"
    | "applying"
    | "verifying"
    | "active"
    | "rolling_back"
    | "rolled_back"
    | "failed"
    | "cancelled"
    | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  mcpRef: string | null
}

export interface McpCreateRequest {
  envelope: McpMutationEnvelope
  draft: McpConnectionDraft
}
export interface McpProtectedUpdateRequest {
  envelope: McpMutationEnvelope
  change: McpProtectedUpdateChange
}
export interface McpBindingRequest {
  envelope: McpMutationEnvelope
  bound: boolean
}
export interface McpBindingReceipt extends McpMutationReceipt {
  mcpRef: string
  agentRef: string
  bound: boolean
}
export interface McpStatusRequest {
  envelope: McpMutationEnvelope
  enabled: boolean
}
export interface McpDeleteRequest {
  envelope: McpMutationEnvelope
}
export interface McpRecoveryRequest {
  envelope: McpMutationEnvelope
}
export interface McpRecoveryReceipt extends McpMutationReceipt {
  mcpRef: string
  ready: boolean
  toolCount: number
}
export interface McpLifecycleReceipt extends McpMutationReceipt {
  mcpRef: string
  status: "enabled" | "disabled" | "deleted"
  deleted: boolean
  impact: { bindingCount: number; agentNames: string[] }
}
