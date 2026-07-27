import type { KnowbeeConfig } from "../config/types.js"
import type { RuntimePaths } from "../config/paths.js"
import { createArtifactStorageContext } from "../artifacts/lifecycle.js"
import {
  createMemoryJournalRepository,
  type MemoryJournalRepository,
} from "../memory/journal.js"
import { createAgentHierarchyStorage } from "../orchestration/hierarchy.js"
import { createLogger, redactLogText } from "../logger/index.js"
import { getFeatureFlag } from "../runtime/rollout-safety.js"
import { buildCompatChannelConnectionsFromConfig, persistChannelConnections } from "./connections.js"
import { ChannelRegistry, buildChannelRegistryRuntimeDiagnostics, createBuiltInChannelProviderFactories } from "./registry.js"
import { CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY, resolveChannelRegistryRuntimeMode } from "./runtime.js"
import { SlackChannel } from "./slack/bot.js"
import { getActiveSlackChannel, setActiveSlackChannel, setSlackRuntimeError, stopActiveSlackChannel } from "./slack/runtime.js"
import { TelegramChannel } from "./telegram/bot.js"
import { getActiveTelegramChannel, setActiveTelegramChannel, setTelegramRuntimeError, stopActiveTelegramChannel } from "./telegram/runtime.js"
import { DiscordChannelAdapter } from "./discord/adapter.js"
import { setDiscordRuntimeError, stopDiscordRuntime } from "./discord/runtime.js"
import { GoogleChatChannelAdapter } from "./google-chat/adapter.js"
import { setGoogleChatRuntimeError, stopGoogleChatRuntime } from "./google-chat/runtime.js"
import {
  createStartedChannelRecoveryRuntime,
  type StartedChannelRecoveryRuntime,
} from "./pending-response-delivery.js"

export { TelegramChannel } from "./telegram/bot.js"
export {
  TelegramChannelAdapter,
  buildTelegramCapabilityManifest,
  buildTelegramContinuationLookupCandidate,
  createTelegramChannelAdapter,
  normalizeTelegramInboundUpdate,
  normalizeTelegramInteractionUpdate,
  resolveTelegramConnectionPolicy,
  validateTelegramWebhookSecretToken,
} from "./telegram/adapter.js"
export type {
  TelegramAdapterTransport,
  TelegramConnectionMode,
  TelegramConnectionPolicy,
  TelegramContinuationLookupCandidate,
  TelegramWebhookSecretValidation,
} from "./telegram/adapter.js"
export { SlackChannel } from "./slack/bot.js"
export {
  SlackChannelAdapter,
  buildSlackCapabilityManifest,
  buildSlackContinuationLookupCandidate,
  createSlackChannelAdapter,
  normalizeSlackInboundEvent,
  normalizeSlackInteractionPayload,
  resolveSlackConnectionPolicy,
} from "./slack/adapter.js"
export type {
  SlackAdapterTransport,
  SlackConnectionMode,
  SlackConnectionPolicy,
  SlackContinuationLookupCandidate,
} from "./slack/adapter.js"
export {
  DiscordChannelAdapter,
  buildDiscordCapabilityManifest,
  buildDiscordContinuationLookupCandidate,
  buildDiscordPermissionDoctor,
  createDiscordChannelAdapter,
  normalizeDiscordComponentInteraction,
  normalizeDiscordInboundEvent,
  normalizeDiscordInteractionRequest,
  resolveDiscordConnectionPolicy,
  validateDiscordInteractionSignature,
} from "./discord/adapter.js"
export type {
  DiscordAdapterTransport,
  DiscordConnectionMode,
  DiscordConnectionPolicy,
  DiscordContinuationLookupCandidate,
  DiscordDoctorIssue,
  DiscordInteractionSignatureValidation,
  DiscordPermissionDoctor,
} from "./discord/adapter.js"
export {
  GoogleChatChannelAdapter,
  buildGoogleChatCapabilityManifest,
  buildGoogleChatContinuationLookupCandidate,
  buildGoogleChatWorkspaceDoctor,
  createGoogleChatChannelAdapter,
  normalizeGoogleChatCardAction,
  normalizeGoogleChatInboundEvent,
  resolveGoogleChatConnectionPolicy,
  validateGoogleChatRequestAuth,
} from "./google-chat/adapter.js"
export type {
  GoogleChatAdapterTransport,
  GoogleChatConnectionMode,
  GoogleChatConnectionPolicy,
  GoogleChatContinuationLookupCandidate,
  GoogleChatDoctorIssue,
  GoogleChatRequestAuthValidation,
  GoogleChatWorkspaceDoctor,
} from "./google-chat/adapter.js"
export {
  LocalBridgeChannelAdapter,
  buildLocalBridgeCapabilityManifest,
  buildLocalBridgeDoctor,
  createLocalBridgeChannelAdapter,
} from "./local-bridge/adapter.js"
export type {
  LocalBridgeConfig,
  LocalBridgeDoctor,
  LocalBridgeDoctorIssue,
  LocalBridgeMode,
  LocalBridgeProvider,
  LocalBridgeTransport,
} from "./local-bridge/adapter.js"
export {
  buildIMessageCapabilityManifest,
  buildIMessageLocalBridgeConfig,
  buildIMessageLocalBridgeDoctor,
  createIMessageChannelAdapter,
} from "./imessage/adapter.js"
export {
  buildKakaoTalkLocalBridgeCapabilityManifest,
  buildKakaoTalkLocalBridgeConfig,
  buildKakaoTalkLocalBridgeDoctor,
  buildKakaoTalkOfficialCapabilityManifest,
  buildKakaoTalkOfficialDoctor,
  createKakaoTalkLocalBridgeChannelAdapter,
} from "./kakaotalk/adapter.js"
export { ChannelRegistry, buildChannelRegistryRuntimeDiagnostics, createBuiltInChannelProviderFactories } from "./registry.js"
export {
  CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY,
  buildChannelRuntimeSummary,
  recordChannelRuntimeEvent,
  resolveChannelRegistryRuntimeMode,
  updateConnectionRuntimeHealth,
} from "./runtime.js"
export type {
  ChannelProviderFactory,
  ChannelProviderFactoryContext,
  ChannelRegistryRuntimeMode,
  ChannelRuntimeAdapter,
  ChannelRuntimeHealth,
  ChannelRuntimeStartDisposition,
  ChannelRuntimeStartResult,
  ChannelRuntimeSummary,
} from "./runtime.js"
export {
  buildAccessPolicyFromAllowedIds,
  evaluateInboundAccessPolicy,
  recordChannelAccessPolicyResult,
} from "./access-policy.js"
export type {
  ChannelAccessDecision,
  ChannelAccessPolicy,
  ChannelAccessPolicyPrincipal,
  ChannelAccessPolicyResult,
  ChannelAccessReasonCode,
} from "./access-policy.js"
export {
  buildContinuationConfirmationNotice,
  buildContinuationConfirmationPrompt,
  resolveChannelContinuation,
} from "./continuation.js"
export type {
  ChannelContinuationConfirmationNotice,
  ChannelContinuationCandidateSource,
  ChannelContinuationLookupCandidate,
  ChannelContinuationLookupInput,
  ChannelContinuationLookupResult,
  ChannelContinuationLookupStatus,
} from "./continuation.js"
export {
  buildIdentityNamespaceCandidates,
  buildRoomNamespaceCandidates,
  namespaceChannelPrincipal,
  namespaceChannelRoom,
  namespaceChannelThread,
  namespaceChannelUser,
  namespaceChannelWorkspace,
  parseNamespacedChannelPrincipal,
} from "./identity.js"
export type {
  ChannelPrincipalKind,
  ChannelPrincipalScope,
  ChannelPrincipalScopeKind,
  NamespacedChannelPrincipalInput,
  ParsedNamespacedChannelPrincipal,
} from "./identity.js"
export {
  applyChannelConnectionSettingsCompatPatch,
  buildCompatChannelConnectionsFromConfig,
  buildSettingsChannelConnectionSnapshot,
  channelConnectionSecretsToJson,
  namespaceChannelIdentity,
  parseNamespacedChannelIdentity,
  persistChannelConnections,
} from "./connections.js"
export type {
  BuildChannelConnectionSnapshotInput,
  ChannelAllowedPrincipal,
  ChannelConnectionConfigSource,
  ChannelConnectionHealthStatus,
  ChannelConnectionMode,
  ChannelConnectionRecord,
  ChannelConnectionSettingsPatchResult,
  ChannelDeliveryPolicy,
  ChannelIdentityKind,
  ChannelRuntimeSnapshot,
  ChannelSecretRef,
} from "./connections.js"
export {
  buildCapabilityFallbackNotice,
  describeUnsupportedCapability,
  resolveChannelDeliveryFallbackPlan,
  splitTextForChannel,
} from "./delivery-fallback.js"
export {
  detectPrimaryMessageLanguage,
  resolveUserFacingMessageLanguage,
} from "./language.js"
export {
  createStartedChannelRecoveryRuntime,
  type ChannelPendingResponseDeliveryInput,
  type ChannelPendingResponseDeliveryOwner,
  type StartedChannelRecoveryRuntime,
} from "./pending-response-delivery.js"
export type {
  ChannelPrimaryMessageLanguage,
  ChannelUserFacingLanguage,
} from "./language.js"
export type {
  ChannelCapabilityFallbackNotice,
  ChannelArtifactFallbackMode,
  ChannelDeliveryCapability,
  ChannelDeliveryFallbackAction,
  ChannelDeliveryFallbackIssue,
  ChannelDeliveryFallbackPlan,
  ChannelDeliveryFallbackSeverity,
  ResolveChannelDeliveryFallbackPlanInput,
} from "./delivery-fallback.js"
export {
  buildUnsupportedCapabilityReceipt,
  createRawPayloadRef,
  defineChannelAdapter,
  defineChannelCapabilities,
  isBuiltInChannelProvider,
  isExternalChannelProvider,
  isInternalChannelSurface,
  isPositiveDeliveryReceipt,
  normalizeChannelSource,
  resolveDeliveryReceiptStatus,
  resolveChannelSurface,
  sanitizeChannelContractValue,
} from "./contracts.js"
export type {
  ApprovalInteractionDecision,
  BuiltInChannelProvider,
  ChannelAction,
  ChannelActionKind,
  ChannelAdapter,
  ChannelAccessPolicySnapshot,
  ChannelAttachment,
  ChannelBlock,
  ChannelCapabilities,
  ChannelConnectionId,
  ChannelConnectionKind,
  ChannelDeliveryStateCapabilities,
  ChannelHealthCheck,
  ChannelHealthStatus,
  ChannelId,
  ChannelIdentity,
  ChannelMention,
  ChannelProvider,
  ChannelProviderId,
  ChannelRateLimitPolicy,
  ChannelRiskLevel,
  ChannelRoom,
  ChannelSource,
  ChannelSurface,
  ChannelTarget,
  ChannelTypingIndicator,
  ChannelUploadOptions,
  ChannelWorkspace,
  DeliveryReceipt,
  DeliveryReceiptPart,
  DeliveryReceiptStatus,
  DeliveryReceiptUserFacingLanguage,
  InboundEnvelope,
  InteractionEnvelope,
  InteractionKind,
  InternalChannelSurface,
  JsonPrimitive,
  JsonValue,
  KnownChannelProvider,
  KnownChannelSource,
  OutboundChunkMode,
  OutboundChunkPolicy,
  OutboundDeliveryMode,
  OutboundMessage,
  OutboundPriority,
  OutboundRedactionPolicy,
  OutboundThreadPolicy,
  OutboundThreadPolicyMode,
  RawPayloadRedactionState,
  RawPayloadRef,
  RawPayloadStorage,
  ResolveDeliveryReceiptStatusInput,
} from "./contracts.js"
export {
  getDefaultChannelSmokeScenarios,
  createDryRunChannelSmokeExecutor,
  resolveChannelSmokeReadiness,
  runPersistedChannelSmokeScenarios,
  runChannelSmokeScenarios,
  sanitizeChannelSmokeTrace,
  sanitizeChannelSmokeValue,
  validateChannelSmokeTrace,
  type ChannelSmokeArtifactMode,
  type ChannelSmokeArtifactTrace,
  type ChannelSmokeChannel,
  type ChannelSmokeCapabilityFallbackTrace,
  type ChannelSmokeCorrelationKey,
  type ChannelSmokeFinalDeliveryTrace,
  type ChannelSmokeFinalizationTrace,
  type ChannelSmokeReadiness,
  type ChannelSmokeReleaseGateMode,
  type ChannelSmokeRequestFlowTrace,
  type ChannelSmokeRunMode,
  type ChannelSmokeRunResult,
  type ChannelSmokeSemanticReviewTrace,
  type ChannelSmokeRunnerOptions,
  type ChannelSmokeScenario,
  type ChannelSmokeScenarioKind,
  type ChannelSmokeStatus,
  type ChannelSmokeToolTrace,
  type ChannelSmokeTrace,
  type ChannelSmokeValidation,
  type PersistedChannelSmokeRunnerOptions,
  type PersistedChannelSmokeRunResult,
} from "./smoke-runner.js"
export {
  validateTelegramWebUiSemanticOutcomeMatrix,
  type ChannelSemanticOutcomeMatrixValidation,
} from "./semantic-outcome-matrix.js"
export {
  VerifyConversationProcessUseCase,
  type ConversationControlProbePort,
  type ConversationDecisionReceipts,
  type ConversationDeliveryEvidence,
  type ConversationDeliveryPostCheckPort,
  type ConversationEvidenceMode,
  type ConversationProbeObservation,
  type ConversationProbePort,
  type ConversationProbeResult,
  type ConversationReleaseReadiness,
  type ConversationRunBinding,
  type ConversationVerificationChannel,
  type ConversationVerificationInput,
  type ConversationVerificationResult,
  type ConversationVerificationStatus,
  type VerifyConversationProcessPorts,
} from "./conversation-process-verification.js"
export {
  projectConversationProcessBaseline,
  type ConversationBaselineClassification,
  type ConversationBaselineTestFile,
  type ConversationProcessBaselineEvidence,
  type ConversationProcessBaselineInput,
  type ConversationProcessBaselineProjection,
} from "./conversation-process-baseline.js"
export {
  validateConversationControlRecoveryParity,
  type ConversationControlRecoveryObservation,
  type ConversationControlRecoveryValidation,
  type ConversationInteractionAdmission,
} from "./conversation-control-recovery.js"
export {
  validateConversationDeliveryParity,
  type ConversationDeliveryObservation,
  type ConversationDeliveryParityValidation,
} from "./conversation-delivery-parity.js"

const log = createLogger("channels")
let activeChannelMemoryJournal: MemoryJournalRepository | null = null

export function closeChannelRuntimeStorage(): void {
  activeChannelMemoryJournal?.close()
  activeChannelMemoryJournal = null
}

function channelRuntimeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return redactLogText(raw)
}

export async function startChannels(
  config: KnowbeeConfig,
  paths: RuntimePaths,
): Promise<StartedChannelRecoveryRuntime> {
  const artifactStorage = createArtifactStorageContext(paths)
  closeChannelRuntimeStorage()
  const memoryJournal = createMemoryJournalRepository(paths)
  activeChannelMemoryJournal = memoryJournal
  const hierarchyStorage = createAgentHierarchyStorage(paths)
  try {
    persistChannelConnections(buildCompatChannelConnectionsFromConfig(config))
  } catch (err: unknown) {
    const message = channelRuntimeErrorMessage(err)
    log.warn(`Failed to sync channel connection compatibility rows: ${message}`)
  }

  stopActiveSlackChannel()
  stopActiveTelegramChannel()
  stopDiscordRuntime()
  stopGoogleChatRuntime()
  setSlackRuntimeError(null)
  setTelegramRuntimeError(null)
  setDiscordRuntimeError(null)
  setGoogleChatRuntimeError(null)

  const runtimeFlag = getFeatureFlag(CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY)
  if (resolveChannelRegistryRuntimeMode(runtimeFlag) === "registry") {
    const registry = new ChannelRegistry({
      config,
      artifactStorage,
      memoryJournal,
      hierarchyStorage,
    })
    await registry.startEnabled()
    const telegram = registry.getPendingResponseDeliveryOwner("telegram")
    const slack = registry.getPendingResponseDeliveryOwner("slack")
    return createStartedChannelRecoveryRuntime({
      ...(telegram ? { telegram } : {}),
      ...(slack ? { slack } : {}),
    })
  }

  let startedSlack: SlackChannel | undefined
  if (config.slack?.enabled) {
    const channel = new SlackChannel(config.slack, artifactStorage, {
      config,
      workDir: config.profile.workspace,
    }, memoryJournal, hierarchyStorage)
    try {
      await channel.start()
      setActiveSlackChannel(channel)
      startedSlack = channel
    } catch (err: unknown) {
      const message = channelRuntimeErrorMessage(err)
      if (getActiveSlackChannel() === channel) setActiveSlackChannel(null)
      setSlackRuntimeError(message)
      log.warn(`Failed to start Slack channel: ${message}`)
    }
  }

  let startedTelegram: TelegramChannel | undefined
  if (config.telegram?.enabled) {
    const channel = new TelegramChannel(config.telegram, artifactStorage, {
      config,
      workDir: config.profile.workspace,
    }, memoryJournal, hierarchyStorage)
    try {
      await channel.start()
      setActiveTelegramChannel(channel)
      startedTelegram = channel
    } catch (err: unknown) {
      const message = channelRuntimeErrorMessage(err)
      if (getActiveTelegramChannel() === channel) setActiveTelegramChannel(null)
      setTelegramRuntimeError(message)
      log.warn(`Failed to start Telegram channel: ${message}`)
    }
  }

  if (config.discord?.enabled) {
    const adapter = new DiscordChannelAdapter({ config: config.discord })
    try {
      await adapter.start()
    } catch (err: unknown) {
      const message = channelRuntimeErrorMessage(err)
      setDiscordRuntimeError(message)
      log.warn(`Failed to start Discord channel: ${message}`)
    }
  }

  if (config.googleChat?.enabled) {
    const adapter = new GoogleChatChannelAdapter({ config: config.googleChat })
    try {
      await adapter.start()
    } catch (err: unknown) {
      const message = channelRuntimeErrorMessage(err)
      setGoogleChatRuntimeError(message)
      log.warn(`Failed to start Google Chat channel: ${message}`)
    }
  }

  return createStartedChannelRecoveryRuntime({
    ...(startedTelegram ? { telegram: startedTelegram } : {}),
    ...(startedSlack ? { slack: startedSlack } : {}),
  })
}
