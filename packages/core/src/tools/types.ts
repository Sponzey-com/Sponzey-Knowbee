import type { ArtifactStorageContext } from "../artifacts/lifecycle.js"
import type { ChannelSource } from "../channels/contracts.js"
import type { MemoryConfig, MqttConfig, SearchConfig, SecurityConfig } from "../config/types.js"
import type { SideEffectClass } from "../contracts/side-effect-operation.js"
import type {
  AgentEntityType,
  CapabilityPolicy,
  DepthScopedToolPolicy,
  PermissionProfile,
  SkillMcpAllowlist,
} from "../contracts/sub-agent-orchestration.js"
import type { UntrustedEvidenceSourceKind } from "../security/trust-boundary.js"
import type {
  YeonjangBrowserFocusExecutionAdmission,
} from "../capabilities/yeonjang-browser-focus-execution-admission.js"

export type RiskLevel = "safe" | "moderate" | "dangerous"
export type ToolEvidenceSourceKind = UntrustedEvidenceSourceKind

export interface ToolEvidenceSourceReceipt {
  readonly sourceKind: ToolEvidenceSourceKind
  readonly sourceRef: string
  readonly trustClass: "untrusted_external"
  readonly instructionIsolation: "data_only"
}

export interface ToolAuthorizationReceipt {
  policyDecisionId: string
  toolName: string
  paramsHash: string
  policyDecision: "allow"
  permissionScope: string
  runId: string
  requestGroupId: string
  approvalDecision?: "allow_once" | "allow_run"
  approvalId?: string
}

export interface YeonjangBrowserFocusExecutionAdmissionIssuerPort {
  issue(input: {
    readonly extensionId: string
    readonly sessionId?: string
    readonly targetHash: string
    readonly approvalScopeId: string
  }):
    | { readonly ok: true; readonly admission: YeonjangBrowserFocusExecutionAdmission }
    | { readonly ok: false; readonly reasonCode: string }
}

export interface ToolContext {
  artifactStorage: ArtifactStorageContext
  sessionId: string
  runId: string
  requestGroupId?: string
  workDir: string
  userMessage: string
  source: ChannelSource
  allowWebAccess: boolean
  onProgress: (message: string) => void
  signal: AbortSignal
  agentId?: string
  agentType?: AgentEntityType
  capabilityPolicy?: CapabilityPolicy
  permissionProfile?: PermissionProfile
  skillMcpAllowlist?: SkillMcpAllowlist
  capabilityRateLimit?: CapabilityPolicy["rateLimit"]
  delegationDepth?: number
  depthScopedToolPolicy?: DepthScopedToolPolicy
  capabilityBindingId?: string
  secretScopeId?: string
  parentSecretScopeId?: string
  allowParentSecretFallback?: boolean
  fallbackSecretScopeAllowlist?: string[]
  auditId?: string
  capabilityDelegationId?: string
  capabilityResultSharing?: "data_exchange" | "result_report_artifact"
  mqttConfig?: MqttConfig
  securityConfig?: SecurityConfig
  searchConfig?: SearchConfig
  memoryConfig?: MemoryConfig
  authorizationReceipt?: Readonly<ToolAuthorizationReceipt>
  yeonjangBrowserFocusExecutionAdmissionIssuer?: YeonjangBrowserFocusExecutionAdmissionIssuerPort
}

interface ArtifactDeliveryResultDetailsBase {
  kind: "artifact_delivery"
  channel: ChannelSource
  caption?: string
  mimeType?: string
  size: number
  source: ToolContext["source"]
}

export type ArtifactDeliveryResultDetails = ArtifactDeliveryResultDetailsBase & (
  | {
      filePath: string
      artifactRef?: never
    }
  | {
      artifactRef: string
      filePath?: never
    }
)

export function isArtifactDeliveryResultDetails(
  value: unknown,
): value is ArtifactDeliveryResultDetails {
  if (!value || typeof value !== "object") return false

  const candidate = value as Partial<ArtifactDeliveryResultDetails>
  return (
    candidate.kind === "artifact_delivery" &&
    typeof candidate.channel === "string" &&
    (
      typeof candidate.filePath === "string" ||
      typeof candidate.artifactRef === "string"
    ) &&
    typeof candidate.size === "number" &&
    typeof candidate.source === "string"
  )
}

export interface ToolResult {
  success: boolean
  output: string
  details?: unknown
  error?: string | undefined
  evidenceSource?: Readonly<ToolEvidenceSourceReceipt>
}

export interface ToolSideEffectObservation {
  available: boolean
  targetRef: string
  expectedState: unknown
  observedState: unknown
}

export interface ToolSideEffectContract<TParams = unknown> {
  effectClass: Exclude<SideEffectClass, "read_only">
  compensationSupport: "reversible" | "irreversible"
  targetRef(params: TParams, ctx: ToolContext): string
  expectedState(params: TParams, ctx: ToolContext): unknown
  observe(params: TParams, ctx: ToolContext, result: ToolResult): Promise<ToolSideEffectObservation>
  observeCurrent?:
    | ((params: TParams, ctx: ToolContext) => Promise<ToolSideEffectObservation>)
    | undefined
  compensate?:
    | ((
        params: TParams,
        ctx: ToolContext,
        result: ToolResult,
      ) => Promise<{ success: boolean; evidence: unknown }>)
    | undefined
  verifyCompensation?:
    | ((params: TParams, ctx: ToolContext) => Promise<{ verified: boolean; evidence: unknown }>)
    | undefined
}

// TParams is covariant here — use unknown as the base so any typed tool can be assigned
export interface AgentTool<TParams = unknown> {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  riskLevel: RiskLevel
  requiresApproval: boolean
  availableSources?: ToolContext["source"][]
  evidenceSourceKind?: ToolEvidenceSourceKind
  resolveEvidenceSourceKind?: (result: Readonly<ToolResult>) => ToolEvidenceSourceKind
  runtimeHealthMode?: "required" | "additional"
  runtimeMethodIds?: string[]
  sideEffect?: ToolSideEffectContract<TParams>
  execute(params: TParams, ctx: ToolContext): Promise<ToolResult>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = AgentTool<any>
