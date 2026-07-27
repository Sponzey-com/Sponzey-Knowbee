import { createArtifactStorageContext } from "../artifacts/lifecycle.js";
import { createMemoryJournalRepository, } from "../memory/journal.js";
import { createAgentHierarchyStorage } from "../orchestration/hierarchy.js";
import { createLogger, redactLogText } from "../logger/index.js";
import { getFeatureFlag } from "../runtime/rollout-safety.js";
import { buildCompatChannelConnectionsFromConfig, persistChannelConnections } from "./connections.js";
import { ChannelRegistry } from "./registry.js";
import { CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY, resolveChannelRegistryRuntimeMode } from "./runtime.js";
import { SlackChannel } from "./slack/bot.js";
import { getActiveSlackChannel, setActiveSlackChannel, setSlackRuntimeError, stopActiveSlackChannel } from "./slack/runtime.js";
import { TelegramChannel } from "./telegram/bot.js";
import { getActiveTelegramChannel, setActiveTelegramChannel, setTelegramRuntimeError, stopActiveTelegramChannel } from "./telegram/runtime.js";
import { DiscordChannelAdapter } from "./discord/adapter.js";
import { setDiscordRuntimeError, stopDiscordRuntime } from "./discord/runtime.js";
import { GoogleChatChannelAdapter } from "./google-chat/adapter.js";
import { setGoogleChatRuntimeError, stopGoogleChatRuntime } from "./google-chat/runtime.js";
import { createStartedChannelRecoveryRuntime, } from "./pending-response-delivery.js";
export { TelegramChannel } from "./telegram/bot.js";
export { TelegramChannelAdapter, buildTelegramCapabilityManifest, buildTelegramContinuationLookupCandidate, createTelegramChannelAdapter, normalizeTelegramInboundUpdate, normalizeTelegramInteractionUpdate, resolveTelegramConnectionPolicy, validateTelegramWebhookSecretToken, } from "./telegram/adapter.js";
export { SlackChannel } from "./slack/bot.js";
export { SlackChannelAdapter, buildSlackCapabilityManifest, buildSlackContinuationLookupCandidate, createSlackChannelAdapter, normalizeSlackInboundEvent, normalizeSlackInteractionPayload, resolveSlackConnectionPolicy, } from "./slack/adapter.js";
export { DiscordChannelAdapter, buildDiscordCapabilityManifest, buildDiscordContinuationLookupCandidate, buildDiscordPermissionDoctor, createDiscordChannelAdapter, normalizeDiscordComponentInteraction, normalizeDiscordInboundEvent, normalizeDiscordInteractionRequest, resolveDiscordConnectionPolicy, validateDiscordInteractionSignature, } from "./discord/adapter.js";
export { GoogleChatChannelAdapter, buildGoogleChatCapabilityManifest, buildGoogleChatContinuationLookupCandidate, buildGoogleChatWorkspaceDoctor, createGoogleChatChannelAdapter, normalizeGoogleChatCardAction, normalizeGoogleChatInboundEvent, resolveGoogleChatConnectionPolicy, validateGoogleChatRequestAuth, } from "./google-chat/adapter.js";
export { LocalBridgeChannelAdapter, buildLocalBridgeCapabilityManifest, buildLocalBridgeDoctor, createLocalBridgeChannelAdapter, } from "./local-bridge/adapter.js";
export { buildIMessageCapabilityManifest, buildIMessageLocalBridgeConfig, buildIMessageLocalBridgeDoctor, createIMessageChannelAdapter, } from "./imessage/adapter.js";
export { buildKakaoTalkLocalBridgeCapabilityManifest, buildKakaoTalkLocalBridgeConfig, buildKakaoTalkLocalBridgeDoctor, buildKakaoTalkOfficialCapabilityManifest, buildKakaoTalkOfficialDoctor, createKakaoTalkLocalBridgeChannelAdapter, } from "./kakaotalk/adapter.js";
export { ChannelRegistry, buildChannelRegistryRuntimeDiagnostics, createBuiltInChannelProviderFactories } from "./registry.js";
export { CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY, buildChannelRuntimeSummary, recordChannelRuntimeEvent, resolveChannelRegistryRuntimeMode, updateConnectionRuntimeHealth, } from "./runtime.js";
export { buildAccessPolicyFromAllowedIds, evaluateInboundAccessPolicy, recordChannelAccessPolicyResult, } from "./access-policy.js";
export { buildContinuationConfirmationNotice, buildContinuationConfirmationPrompt, resolveChannelContinuation, } from "./continuation.js";
export { buildIdentityNamespaceCandidates, buildRoomNamespaceCandidates, namespaceChannelPrincipal, namespaceChannelRoom, namespaceChannelThread, namespaceChannelUser, namespaceChannelWorkspace, parseNamespacedChannelPrincipal, } from "./identity.js";
export { applyChannelConnectionSettingsCompatPatch, buildCompatChannelConnectionsFromConfig, buildSettingsChannelConnectionSnapshot, channelConnectionSecretsToJson, namespaceChannelIdentity, parseNamespacedChannelIdentity, persistChannelConnections, } from "./connections.js";
export { buildCapabilityFallbackNotice, describeUnsupportedCapability, resolveChannelDeliveryFallbackPlan, splitTextForChannel, } from "./delivery-fallback.js";
export { detectPrimaryMessageLanguage, resolveUserFacingMessageLanguage, } from "./language.js";
export { createStartedChannelRecoveryRuntime, } from "./pending-response-delivery.js";
export { buildUnsupportedCapabilityReceipt, createRawPayloadRef, defineChannelAdapter, defineChannelCapabilities, isBuiltInChannelProvider, isExternalChannelProvider, isInternalChannelSurface, isPositiveDeliveryReceipt, normalizeChannelSource, resolveDeliveryReceiptStatus, resolveChannelSurface, sanitizeChannelContractValue, } from "./contracts.js";
export { getDefaultChannelSmokeScenarios, createDryRunChannelSmokeExecutor, resolveChannelSmokeReadiness, runPersistedChannelSmokeScenarios, runChannelSmokeScenarios, sanitizeChannelSmokeTrace, sanitizeChannelSmokeValue, validateChannelSmokeTrace, } from "./smoke-runner.js";
export { validateTelegramWebUiSemanticOutcomeMatrix, } from "./semantic-outcome-matrix.js";
export { VerifyConversationProcessUseCase, } from "./conversation-process-verification.js";
export { projectConversationProcessBaseline, } from "./conversation-process-baseline.js";
export { validateConversationControlRecoveryParity, } from "./conversation-control-recovery.js";
export { validateConversationDeliveryParity, } from "./conversation-delivery-parity.js";
const log = createLogger("channels");
let activeChannelMemoryJournal = null;
export function closeChannelRuntimeStorage() {
    activeChannelMemoryJournal?.close();
    activeChannelMemoryJournal = null;
}
function channelRuntimeErrorMessage(error) {
    const raw = error instanceof Error ? error.message : String(error);
    return redactLogText(raw);
}
export async function startChannels(config, paths) {
    const artifactStorage = createArtifactStorageContext(paths);
    closeChannelRuntimeStorage();
    const memoryJournal = createMemoryJournalRepository(paths);
    activeChannelMemoryJournal = memoryJournal;
    const hierarchyStorage = createAgentHierarchyStorage(paths);
    try {
        persistChannelConnections(buildCompatChannelConnectionsFromConfig(config));
    }
    catch (err) {
        const message = channelRuntimeErrorMessage(err);
        log.warn(`Failed to sync channel connection compatibility rows: ${message}`);
    }
    stopActiveSlackChannel();
    stopActiveTelegramChannel();
    stopDiscordRuntime();
    stopGoogleChatRuntime();
    setSlackRuntimeError(null);
    setTelegramRuntimeError(null);
    setDiscordRuntimeError(null);
    setGoogleChatRuntimeError(null);
    const runtimeFlag = getFeatureFlag(CHANNEL_REGISTRY_RUNTIME_FEATURE_KEY);
    if (resolveChannelRegistryRuntimeMode(runtimeFlag) === "registry") {
        const registry = new ChannelRegistry({
            config,
            artifactStorage,
            memoryJournal,
            hierarchyStorage,
        });
        await registry.startEnabled();
        const telegram = registry.getPendingResponseDeliveryOwner("telegram");
        const slack = registry.getPendingResponseDeliveryOwner("slack");
        return createStartedChannelRecoveryRuntime({
            ...(telegram ? { telegram } : {}),
            ...(slack ? { slack } : {}),
        });
    }
    let startedSlack;
    if (config.slack?.enabled) {
        const channel = new SlackChannel(config.slack, artifactStorage, {
            config,
            workDir: config.profile.workspace,
        }, memoryJournal, hierarchyStorage);
        try {
            await channel.start();
            setActiveSlackChannel(channel);
            startedSlack = channel;
        }
        catch (err) {
            const message = channelRuntimeErrorMessage(err);
            if (getActiveSlackChannel() === channel)
                setActiveSlackChannel(null);
            setSlackRuntimeError(message);
            log.warn(`Failed to start Slack channel: ${message}`);
        }
    }
    let startedTelegram;
    if (config.telegram?.enabled) {
        const channel = new TelegramChannel(config.telegram, artifactStorage, {
            config,
            workDir: config.profile.workspace,
        }, memoryJournal, hierarchyStorage);
        try {
            await channel.start();
            setActiveTelegramChannel(channel);
            startedTelegram = channel;
        }
        catch (err) {
            const message = channelRuntimeErrorMessage(err);
            if (getActiveTelegramChannel() === channel)
                setActiveTelegramChannel(null);
            setTelegramRuntimeError(message);
            log.warn(`Failed to start Telegram channel: ${message}`);
        }
    }
    if (config.discord?.enabled) {
        const adapter = new DiscordChannelAdapter({ config: config.discord });
        try {
            await adapter.start();
        }
        catch (err) {
            const message = channelRuntimeErrorMessage(err);
            setDiscordRuntimeError(message);
            log.warn(`Failed to start Discord channel: ${message}`);
        }
    }
    if (config.googleChat?.enabled) {
        const adapter = new GoogleChatChannelAdapter({ config: config.googleChat });
        try {
            await adapter.start();
        }
        catch (err) {
            const message = channelRuntimeErrorMessage(err);
            setGoogleChatRuntimeError(message);
            log.warn(`Failed to start Google Chat channel: ${message}`);
        }
    }
    return createStartedChannelRecoveryRuntime({
        ...(startedTelegram ? { telegram: startedTelegram } : {}),
        ...(startedSlack ? { slack: startedSlack } : {}),
    });
}
//# sourceMappingURL=index.js.map