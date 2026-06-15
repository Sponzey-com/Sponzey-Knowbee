import type { AIBackendCard, RoutingProfile } from "./ai"
import type { CapabilityStatus } from "./capabilities"
import type {
  MemoryPolicy,
  PermissionProfile,
} from "../../../core/src/contracts/sub-agent-orchestration.js"

export type SetupStepId =
  | "welcome"
  | "personal"
  | "ai_backends"
  | "ai_routing"
  | "mcp"
  | "skills"
  | "security"
  | "channels"
  | "remote_access"
  | "review"
  | "done"

export interface SetupState {
  version: 1
  completed: boolean
  currentStep: SetupStepId
  completedAt?: number
  skipped: {
    telegram: boolean
    remoteAccess: boolean
  }
}

export interface SetupPersonalDraft {
  profileName: string
  displayName: string
  language: string
  timezone: string
  workspace: string
}

export interface SetupMcpServerDraft {
  id: string
  name: string
  transport: "stdio" | "http"
  command: string
  argsText: string
  cwd: string
  url: string
  required: boolean
  enabled: boolean
  status: CapabilityStatus
  reason?: string
  tools: string[]
}

export interface SetupSkillDraftItem {
  id: string
  label: string
  description: string
  source: "local" | "builtin"
  path: string
  enabled: boolean
  required: boolean
  status: CapabilityStatus
  reason?: string
}

export interface SetupSecurityDraft {
  approvalMode: "always" | "on-miss" | "off"
  approvalTimeout: number
  approvalTimeoutFallback: "deny" | "allow"
  maxDelegationTurns: number
}

export interface SetupChannelDraft {
  telegramEnabled: boolean
  botToken: string
  allowedUserIds: string
  allowedGroupIds: string
  slackEnabled: boolean
  slackBotToken: string
  slackAppToken: string
  slackAllowedUserIds: string
  slackAllowedChannelIds: string
  discordEnabled: boolean
  discordBotToken: string
  discordApplicationId: string
  discordPublicKey: string
  discordAllowedUserIds: string
  discordAllowedGuildIds: string
  discordAllowedChannelIds: string
  discordGrantedIntents: string
  discordBotPermissions: string
  discordInstalledGuildIds: string
  discordLargeGuildMode: boolean
  googleChatEnabled: boolean
  googleChatProjectId: string
  googleChatAppCredentialJson: string
  googleChatServiceAccountEmail: string
  googleChatWebhookUrl: string
  googleChatVerificationToken: string
  googleChatAllowedUserIds: string
  googleChatAllowedSpaceIds: string
  googleChatDeployedSpaceIds: string
  googleChatGrantedScopes: string
  googleChatAppPublished: boolean
  googleChatDomainWideDelegation: boolean
  imessageEnabled: boolean
  imessageMode: "outgoing_only" | "manual_confirm"
  imessageLocalBridgeEnabled: boolean
  imessageYeonjangBridgeEnabled: boolean
  imessageRiskAcknowledged: boolean
  imessageMessagesAppAvailable: boolean
  imessageUserSessionActive: boolean
  imessageAutomationPermissionGranted: boolean
  imessageAllowedRecipientIds: string
  imessageManualConfirmationRequired: boolean
  kakaoTalkEnabled: boolean
  kakaoTalkMode: "official" | "local_bridge"
  kakaoTalkBusinessApiEnabled: boolean
  kakaoTalkBusinessApiKey: string
  kakaoTalkChannelId: string
  kakaoTalkLocalBridgeEnabled: boolean
  kakaoTalkYeonjangBridgeEnabled: boolean
  kakaoTalkRiskAcknowledged: boolean
  kakaoTalkAppAvailable: boolean
  kakaoTalkUserSessionActive: boolean
  kakaoTalkAutomationPermissionGranted: boolean
  kakaoTalkAllowedUserIds: string
  kakaoTalkAllowedRoomIds: string
  kakaoTalkManualConfirmationRequired: boolean
  kakaoTalkRateLimitPerMinute: number
}

export interface SetupRemoteAccessDraft {
  authEnabled: boolean
  authToken: string
  host: string
  port: number
}

export interface SetupMqttDraft {
  enabled: boolean
  host: string
  port: number
  username: string
  password: string
}

export type SetupSubAgentMonitoringLogLevel = "product" | "debug" | "dev"

export type SetupSubAgentMonitoringEventKind =
  | "request_received"
  | "delegation_planned"
  | "handoff_package_created"
  | "child_accepted"
  | "child_running"
  | "child_result_returned"
  | "parent_reviewing"
  | "parent_aggregating"
  | "redelegation_planned"
  | "final_delivery_prepared"
  | "completed"
  | "blocked"
  | "cancelled"

export type SetupSubAgentMonitoringEventStatus =
  | "pending"
  | "running"
  | "reviewing"
  | "completed"
  | "blocked"
  | "cancelled"

export type SetupSubAgentMonitoringReviewStatus =
  | "waiting_for_child_result"
  | "reviewing_child_result"
  | "accepted"
  | "needs_clarification"
  | "needs_redelegation"
  | "aggregated"
  | "final_ready"
  | "returned_to_parent"

export type SetupSubAgentMonitoringQuality =
  | "sufficient"
  | "missing_information"
  | "needs_verification"
  | "permission_required"
  | "split_required"
  | "different_child_required"

export interface SetupSubAgentMonitoringEvent {
  eventId: string
  runId: string
  at: number
  kind: SetupSubAgentMonitoringEventKind
  status: SetupSubAgentMonitoringEventStatus
  actorAgentId: string
  targetAgentId?: string
  summary: string
  reason?: string
  reviewStatus?: SetupSubAgentMonitoringReviewStatus
  quality?: SetupSubAgentMonitoringQuality
  latestResultSummary?: string
  redelegation?: {
    previousChildAgentId?: string
    nextTargetAgentId?: string
    previousResultSummary?: string
    refinedInstructionSummary?: string
    changedInputSummary?: string
    validationMethod?: string
  }
  debug?: {
    relatedTaskId?: string
    internalTraceId?: string
    attemptCount?: number
  }
  logLevel?: SetupSubAgentMonitoringLogLevel
}

export interface SetupSubAgentMonitoringDraft {
  logLevel?: SetupSubAgentMonitoringLogLevel
  events?: SetupSubAgentMonitoringEvent[]
  activeRunIds?: string[]
  selectedRunId?: string
  refreshedAt?: number
  staleAfterMs?: number
}

export interface SetupSubAgentDraftItem {
  agentId: string
  parentAgentId?: string
  displayName: string
  nickname: string
  role: string
  description: string
  skillMcpBindings?: {
    enabledSkillIds: string[]
    enabledMcpServerIds: string[]
    enabledToolNames: string[]
    disabledToolNames: string[]
    recommendedSkillIds?: string[]
    recommendedMcpServerIds?: string[]
    connectionStateByCatalogId?: Record<string, "disconnected" | "connecting" | "connected" | "degraded" | "permission_required" | "unavailable">
  }
  modelPolicy?: {
    mode: "inherit" | "override"
    providerId?: string
    modelId?: string
    fallbackModelId?: string
    effort?: string
    maxOutputTokens?: number
    costBudget?: number
  }
  memoryPolicy?: MemoryPolicy & {
    rawWindowSize?: number
    compactThreshold?: number
    capsuleMode?: "session_compaction" | "rolling_summary"
    archiveReferenceMode?: "summary_reference" | "full_reference_disabled"
    handoffCapsuleAllowed?: boolean
    lastCompactedAt?: number
    capsuleCount?: number
  }
  capabilityPolicy?: {
    permissionProfile: PermissionProfile
    allowedCapabilityIds: string[]
    deniedCapabilityIds: string[]
    approvalRequiredCapabilityIds: string[]
    osSensitiveCapabilityIds: string[]
    statusByCapabilityId?: Record<string, "allowed" | "denied" | "approval_required" | "os_permission_required" | "unavailable">
    logVisibility?: "product" | "debug" | "dev"
  }
  delegationPolicy?: {
    canDelegate: boolean
    directChildOnly: boolean
    allowedChildAgentIds: string[]
    resultReviewRequired: boolean
    aggregationMode: "parent_synthesis" | "append_summaries" | "verifier_required"
    redelegationAllowed: boolean
    escalationPolicy: "return_to_parent" | "ask_user" | "stop_with_report"
    maxParallelSessions: number
  }
  status: "enabled" | "disabled" | "archived" | "degraded"
  createdAt: number
  updatedAt: number
  profileVersion: number
}

export interface SetupSubAgentDraft {
  orchestrationEnabled: boolean
  items: SetupSubAgentDraftItem[]
  runtimeActiveAgentIds: string[]
  lastRuntimeSeenAtByAgentId: Record<string, number>
  monitoring?: SetupSubAgentMonitoringDraft
}

export interface SetupDraft {
  personal: SetupPersonalDraft
  aiBackends: AIBackendCard[]
  routingProfiles: RoutingProfile[]
  mcp: {
    servers: SetupMcpServerDraft[]
  }
  skills: {
    items: SetupSkillDraftItem[]
  }
  security: SetupSecurityDraft
  channels: SetupChannelDraft
  mqtt: SetupMqttDraft
  remoteAccess: SetupRemoteAccessDraft
  subAgents?: SetupSubAgentDraft
}

export interface SetupStepMeta {
  id: SetupStepId
  label: string
  description: string
  status: CapabilityStatus
  reason?: string
  required: boolean
  highlights: string[]
  completed: boolean
  locked: boolean
  lockReason?: string
}
