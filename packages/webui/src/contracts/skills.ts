import type {
  SkillCatalogProjection,
  SkillRuntimeStatus,
  SkillSourceKind,
} from "../lib/skill-catalog-contract"

export interface SkillCatalogQueryInput {
  limit?: number
  cursor?: string
  search?: string
  sourceKind?: SkillSourceKind
  runtimeStatus?: SkillRuntimeStatus
  boundOnly?: boolean
}

export interface SkillCatalogPageResponse {
  items: SkillCatalogProjection[]
  nextCursor: string | null
  revision: number
  observedAt: number
}

export interface SkillSourceValidationRequest {
  displayName: string
  sourceKind: SkillSourceKind
  requestedPath?: string
}

export interface SkillSourceValidationResponse {
  ready: boolean
  displayName: string
  sourceKind: SkillSourceKind
  reasonCodes: string[]
}

export interface SkillCreateRequest {
  envelope: {
    scope: "capability:write"
    mutationId: string
    targetRevision: number
    purpose: "skill_create"
    issuedAt: number
    nonce: string
  }
  draft: {
    displayName: string
    description: string
    sourceKind: SkillSourceKind
    requestedPath?: string
  }
}

export interface SkillCreateReceipt {
  mutationId: string
  state: "active" | "rejected" | "failed" | "rolled_back"
  reasonCode: string | null
  allowedActions: string[]
  revision: number
  skillRef: string | null
}

export interface SkillUpdateRequest {
  envelope: {
    scope: "capability:write"
    mutationId: string
    targetRevision: number
    purpose: "skill_update"
    issuedAt: number
    nonce: string
  }
  change: {
    displayName?: string
    description?: string
    runtimeStatus?: "active" | "inactive"
  }
}

export type SkillUpdateReceipt = SkillCreateReceipt

export interface SkillAgentProjection { agentRef: string; name: string }
export interface SkillDetailResponse extends SkillCatalogProjection {
  bindings: { boundAgents: SkillAgentProjection[]; availableAgents: SkillAgentProjection[] }
}

export interface SkillBindingRequest {
  envelope: {
    scope: "capability:write"
    mutationId: string
    targetRevision: number
    purpose: "skill_bind" | "skill_unbind"
    issuedAt: number
    nonce: string
  }
  bound: boolean
}

export interface SkillBindingReceipt extends SkillCreateReceipt {
  agentRef: string
  bound: boolean
}

export interface SkillDeleteRequest {
  envelope: {
    scope: "capability:write"
    mutationId: string
    targetRevision: number
    purpose: "skill_delete"
    issuedAt: number
    nonce: string
  }
}

export interface SkillDeleteReceipt extends SkillCreateReceipt {
  deleted: boolean
  impact: { bindingCount: number; agentNames: string[] }
}
