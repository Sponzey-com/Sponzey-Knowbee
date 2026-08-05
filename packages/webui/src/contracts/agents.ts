export type AgentWorkspaceStatus = "enabled" | "disabled" | "archived" | "degraded"
export interface AgentWorkspaceItem {
  agentRef: string
  name: string
  role: string
  status: AgentWorkspaceStatus
  profileVersion: number
  updatedAt: number
  model: { configured: boolean; availability: string; modelName?: string }
  parentName: string
  directChildCount: number
  bindingCounts: { skills: number; mcpServers: number; yeonjang: number }
  diagnosticCodes: string[]
}
export interface AgentWorkspacePageResponse {
  items: AgentWorkspaceItem[]
  nextCursor: string | null
  cursorValid: boolean
  totalMatches: number
  summary: {
    total: number
    enabled: number
    disabled: number
    archived: number
    degraded: number
    issueCount: number
    diagnosticCodes: string[]
  }
  observedAt: number
}
export interface AgentWorkspaceDetail extends AgentWorkspaceItem {
  bindingNames: { skills: string[]; mcpServers: string[]; yeonjang: string[] }
  directChildNames: string[]
}
export interface AgentIdentityMutationEnvelope {
  mutationId: string
  nonce: string
  actorRef: string
  scope: "agent_identity"
}
export interface AgentIdentityMutationResponse {
  mutationId: string
  kind: "create" | "update" | "archive"
  state: "active" | "failed" | "conflict" | "cancelled"
  agentRef?: string
  revision?: number
  name?: string
  role?: string
  reasonCode?: string
  impact?: { activeChildCount: number; activeBindingCount: number }
  transitions: string[]
}

export type AgentCapabilityKind = "skill" | "mcp_server" | "yeonjang"
export interface AgentCapabilityBindingItem {
  capabilityRef: string
  kind: AgentCapabilityKind
  displayName: string
  catalogStatus: "enabled" | "disabled" | "archived"
  runtimeStatus: "ready" | "degraded" | "unavailable" | "unknown"
  bound: boolean
  editable: boolean
  revision: number
  reasonCodes: string[]
}
export interface AgentCapabilityBindingProjection {
  agentRef: string
  items: AgentCapabilityBindingItem[]
  orphanReasonCodes: string[]
  revisions: Record<AgentCapabilityKind, number>
  observedAt: number
}
export interface AgentCapabilityMutationEnvelope {
  actorRef: string
  scope: "capability:write"
  mutationId: string
  targetRevision: number
  purpose: string
  issuedAt: number
  nonce: string
}
export interface AgentCapabilityBindingResponse {
  mutationId: string
  kind: AgentCapabilityKind
  state: string
  reasonCode: string | null
  revision: number
  agentRef: string
  capabilityRef: string
  bound: boolean
  allowedActions: string[]
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
export type AgentRelationshipMutationKind = "connect" | "reparent" | "disconnect"
export interface AgentRelationshipMutationEnvelope {
  actorRef: string
  scope: "agent_relationship:write"
  mutationId: string
  targetRevision: number
  purpose: string
  issuedAt: number
  nonce: string
}
export interface AgentRelationshipMutationResponse {
  mutationId: string
  kind: AgentRelationshipMutationKind
  state: string
  reasonCode: string | null
  revision: number
  childRef: string
  parentRef: string | null
  allowedActions: string[]
}

export interface AgentOperationalSettingsProjection {
  agentRef: string
  status: AgentWorkspaceStatus
  revision: number
  model: {
    configured: boolean
    availability: "configured" | "unavailable"
    providerName?: string
    modelName?: string
    effort?: string
    fallbackModelName?: string
  }
  memory: {
    retentionPolicy: "session" | "short_term" | "long_term"
    capsuleMode: "session_compaction" | "rolling_summary"
    rawWindowSize: number | null
    compactThreshold: number | null
    writebackReviewRequired: boolean
    lastCompactedAt: number | null
    capsuleCount: number
  }
  permission: {
    riskCeiling: "safe" | "moderate" | "external" | "sensitive" | "dangerous"
    approvalRequiredFrom: "safe" | "moderate" | "external" | "sensitive" | "dangerous"
    allowExternalNetwork: boolean
    allowFilesystemWrite: boolean
    allowShellExecution: boolean
    allowScreenControl: boolean
    allowedPathCount: number
  }
  diagnosticCodes: string[]
  observedAt: number
}

export type AgentOperationalSettingsMutationKind =
  | "update_model"
  | "clear_model"
  | "update_memory"
  | "update_permission"

export interface AgentOperationalSettingsMutationRequest {
  kind: AgentOperationalSettingsMutationKind
  targetRevision: number
  value?: Record<string, unknown>
  confirmElevation?: boolean
}

export interface AgentOperationalSettingsMutationResponse {
  mutationId: string
  kind: AgentOperationalSettingsMutationKind
  state: string
  reasonCode: string | null
  revision: number
  agentRef: string
  allowedActions: string[]
}
