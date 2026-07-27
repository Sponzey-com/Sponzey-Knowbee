import { createPreflightedLiveAcceptanceExecutor } from "../release/live-acceptance-preflighted-executor.js";
import { captureLiveAcceptanceRuntimeSnapshot, } from "../release/live-acceptance-runtime-snapshot-adapter.js";
import { createVerifiedLiveAcceptanceExecutor, } from "../release/live-acceptance-verified-executor.js";
import { createExtensionLiveToolDispatchAdapter } from "../runs/extension-live-tool-dispatch-adapter.js";
import { createWebRetrievalToolDispatchAdapter } from "../runs/web-retrieval-tool-dispatch-adapter.js";
import { createYeonjangLiveTransportAdapter } from "../runs/yeonjang-live-transport-adapter.js";
export function createLiveAcceptanceRuntimeFactory(input) {
    const web = createWebRetrievalToolDispatchAdapter({
        dispatcher: input.dispatcher,
        contextFor: input.webContextFor,
        findAuditEventId: ({ runId, toolName }) => input.findAuditEventId({ runId, toolName }),
    });
    const extensions = createExtensionLiveToolDispatchAdapter({
        dispatcher: input.dispatcher,
        contextFor: (execution) => {
            const base = input.extensionBaseContextFor(execution);
            const { authorization } = execution.selection;
            const isSkill = authorization.capability === "skill";
            const enabledSkillIds = isSkill ? [authorization.catalogId] : [];
            const enabledMcpServerIds = isSkill ? [] : [authorization.catalogId];
            const enabledToolNames = [authorization.toolName];
            const disabledToolNames = [];
            const allowedPaths = [];
            Object.freeze(enabledSkillIds);
            Object.freeze(enabledMcpServerIds);
            Object.freeze(enabledToolNames);
            Object.freeze(disabledToolNames);
            Object.freeze(allowedPaths);
            const skillMcpAllowlist = Object.freeze({
                enabledSkillIds,
                enabledMcpServerIds,
                enabledToolNames,
                disabledToolNames,
                ...(authorization.secretScopeId ? { secretScopeId: authorization.secretScopeId } : {}),
            });
            return {
                artifactStorage: base.artifactStorage,
                sessionId: base.sessionId,
                runId: execution.runId,
                workDir: base.workDir,
                userMessage: base.userMessage,
                source: base.source,
                allowWebAccess: false,
                onProgress: base.onProgress,
                signal: execution.signal,
                agentId: authorization.agentId,
                capabilityBindingId: authorization.bindingId,
                ...(authorization.secretScopeId ? { secretScopeId: authorization.secretScopeId } : {}),
                auditId: base.auditId,
                capabilityPolicy: Object.freeze({
                    permissionProfile: Object.freeze({
                        profileId: `live-acceptance:${authorization.bindingId}`,
                        riskCeiling: "safe",
                        approvalRequiredFrom: "moderate",
                        allowExternalNetwork: false,
                        allowFilesystemWrite: false,
                        allowShellExecution: false,
                        allowScreenControl: false,
                        allowedPaths,
                    }),
                    skillMcpAllowlist,
                    rateLimit: Object.freeze({ maxConcurrentCalls: 1 }),
                }),
                ...(base.mqttConfig ? { mqttConfig: base.mqttConfig } : {}),
                ...(base.securityConfig ? { securityConfig: base.securityConfig } : {}),
                ...(base.searchConfig ? { searchConfig: base.searchConfig } : {}),
                ...(base.memoryConfig ? { memoryConfig: base.memoryConfig } : {}),
            };
        },
        findAuditEventId: ({ runId, requestGroupId, toolName }) => input.findAuditEventId({ runId, requestGroupId, toolName }),
    });
    const yeonjang = createYeonjangLiveTransportAdapter({
        invoke: input.invokeYeonjang,
        timeoutMs: input.yeonjangTimeoutMs,
        createCommandId: input.createCommandId,
        createAuditCorrelationId: input.createAuditCorrelationId,
        recordAuditEvent: input.recordYeonjangAuditEvent,
    });
    const policy = Object.freeze({
        failurePolicy: input.policy.failurePolicy,
        maxPreflightAgeMs: input.policy.maxPreflightAgeMs,
        maxWebSourceAgeMs: input.policy.maxWebSourceAgeMs,
        maxYeonjangSessionAgeMs: input.policy.maxYeonjangSessionAgeMs,
        maxEvidenceAgeMs: input.policy.maxEvidenceAgeMs,
        maxYeonjangInstanceAgeMs: input.policy.maxYeonjangInstanceAgeMs,
        ...(input.policy.webScenarios ? { webScenarios: [...input.policy.webScenarios] } : {}),
    });
    const readers = input.readers;
    const llm = input.llm;
    const requestSink = input.requestSink;
    const createRunId = input.createRunId;
    const now = input.now;
    const runChannels = input.runChannels;
    return (server) => {
        const channelExecutor = server.channelSmokeLiveExecutor;
        if (!channelExecutor)
            return undefined;
        const executeVerified = createVerifiedLiveAcceptanceExecutor({
            channels: (context) => runChannels(channelExecutor, context),
            web,
            extensions,
            yeonjang,
            llm,
            requestSink,
            createRunId,
            failurePolicy: policy.failurePolicy,
            maxPreflightAgeMs: policy.maxPreflightAgeMs,
            maxWebSourceAgeMs: policy.maxWebSourceAgeMs,
            maxYeonjangSessionAgeMs: policy.maxYeonjangSessionAgeMs,
            maxEvidenceAgeMs: policy.maxEvidenceAgeMs,
            maxYeonjangInstanceAgeMs: policy.maxYeonjangInstanceAgeMs,
            ...(policy.webScenarios ? { webScenarios: policy.webScenarios } : {}),
        });
        return createPreflightedLiveAcceptanceExecutor({
            now,
            maxYeonjangAgeMs: policy.maxYeonjangInstanceAgeMs,
            captureSnapshot: (capturedAt) => captureLiveAcceptanceRuntimeSnapshot({ capturedAt, readers }),
            executeVerified,
        });
    };
}
//# sourceMappingURL=live-acceptance-runtime-factory.js.map