import type {
  ChannelSmokeRunnerOptions,
  PersistedChannelSmokeRunResult,
} from "../channels/smoke-runner.js"
import type { LiveAcceptanceLlmPorts } from "../release/live-acceptance-llm-adapter.js"
import { createPreflightedLiveAcceptanceExecutor } from "../release/live-acceptance-preflighted-executor.js"
import type {
  LiveAcceptanceRunnerContext,
  LiveAcceptanceRunnerFailurePolicy,
  LiveAcceptanceSigningRequestSink,
} from "../release/live-acceptance-runner.js"
import {
  type LiveAcceptanceRuntimeSnapshotReaders,
  captureLiveAcceptanceRuntimeSnapshot,
} from "../release/live-acceptance-runtime-snapshot-adapter.js"
import {
  type LiveAcceptanceLiveRunIdInput,
  createVerifiedLiveAcceptanceExecutor,
} from "../release/live-acceptance-verified-executor.js"
import type { ExtensionLiveSmokeExecutionInput } from "../runs/extension-live-smoke-runner.js"
import { createExtensionLiveToolDispatchAdapter } from "../runs/extension-live-tool-dispatch-adapter.js"
import type { WebRetrievalLiveSmokeScenario } from "../runs/web-retrieval-smoke.js"
import { createWebRetrievalToolDispatchAdapter } from "../runs/web-retrieval-tool-dispatch-adapter.js"
import type {
  YeonjangLiveAuditEvent,
  YeonjangLiveInvokePort,
} from "../runs/yeonjang-live-transport-adapter.js"
import { createYeonjangLiveTransportAdapter } from "../runs/yeonjang-live-transport-adapter.js"
import type { ToolDispatcher } from "../tools/dispatcher.js"
import type { ToolContext } from "../tools/types.js"
import type {
  LiveAcceptanceExecutorFactory,
  LiveAcceptanceExecutorFactoryInput,
} from "./server-runtime-context.js"

export interface LiveAcceptanceRuntimePolicy {
  readonly failurePolicy: LiveAcceptanceRunnerFailurePolicy
  readonly maxPreflightAgeMs: number
  readonly maxWebSourceAgeMs: number
  readonly maxYeonjangSessionAgeMs: number
  readonly maxEvidenceAgeMs: number
  readonly maxYeonjangInstanceAgeMs: number
  readonly webScenarios?: readonly WebRetrievalLiveSmokeScenario[]
}

export type LiveAcceptanceWebContextFactory = (input: {
  readonly runId: string
  readonly scenario: WebRetrievalLiveSmokeScenario
  readonly signal: AbortSignal
}) => ToolContext & { readonly allowWebAccess: true }

type LiveAcceptanceExtensionBaseRequired = Pick<
  ToolContext,
  "artifactStorage" | "sessionId" | "workDir" | "userMessage" | "source" | "onProgress"
>

type LiveAcceptanceExtensionBaseOptional = Partial<
  Pick<ToolContext, "mqttConfig" | "securityConfig" | "searchConfig" | "memoryConfig">
>

export type LiveAcceptanceExtensionBaseContext = LiveAcceptanceExtensionBaseRequired &
  LiveAcceptanceExtensionBaseOptional & {
    readonly auditId: string
  }

export type LiveAcceptanceExtensionBaseContextFactory = (
  input: ExtensionLiveSmokeExecutionInput,
) => LiveAcceptanceExtensionBaseContext

export interface LiveAcceptanceRuntimeFactoryInput {
  readonly readers: LiveAcceptanceRuntimeSnapshotReaders
  readonly dispatcher: Pick<ToolDispatcher, "dispatch" | "dispatchAgentScoped">
  readonly webContextFor: LiveAcceptanceWebContextFactory
  readonly extensionBaseContextFor: LiveAcceptanceExtensionBaseContextFactory
  readonly findAuditEventId: (input: {
    readonly runId: string
    readonly requestGroupId?: string
    readonly toolName: string
  }) => string | null
  readonly llm: Readonly<LiveAcceptanceLlmPorts>
  readonly invokeYeonjang: YeonjangLiveInvokePort
  readonly yeonjangTimeoutMs: number
  readonly createCommandId: () => string
  readonly createAuditCorrelationId: () => string
  readonly recordYeonjangAuditEvent: (event: YeonjangLiveAuditEvent) => string | null
  readonly runChannels: (
    executor: ChannelSmokeRunnerOptions["executeScenario"],
    context: LiveAcceptanceRunnerContext,
  ) => Promise<PersistedChannelSmokeRunResult>
  readonly requestSink: LiveAcceptanceSigningRequestSink
  readonly createRunId: (input: LiveAcceptanceLiveRunIdInput) => string
  readonly now: () => number
  readonly policy: Readonly<LiveAcceptanceRuntimePolicy>
}

export function createLiveAcceptanceRuntimeFactory(
  input: LiveAcceptanceRuntimeFactoryInput,
): LiveAcceptanceExecutorFactory {
  const web = createWebRetrievalToolDispatchAdapter({
    dispatcher: input.dispatcher,
    contextFor: input.webContextFor,
    findAuditEventId: ({ runId, toolName }) => input.findAuditEventId({ runId, toolName }),
  })
  const extensions = createExtensionLiveToolDispatchAdapter({
    dispatcher: input.dispatcher,
    contextFor: (execution) => {
      const base = input.extensionBaseContextFor(execution)
      const { authorization } = execution.selection
      const isSkill = authorization.capability === "skill"
      const enabledSkillIds: string[] = isSkill ? [authorization.catalogId] : []
      const enabledMcpServerIds: string[] = isSkill ? [] : [authorization.catalogId]
      const enabledToolNames = [authorization.toolName]
      const disabledToolNames: string[] = []
      const allowedPaths: string[] = []
      Object.freeze(enabledSkillIds)
      Object.freeze(enabledMcpServerIds)
      Object.freeze(enabledToolNames)
      Object.freeze(disabledToolNames)
      Object.freeze(allowedPaths)
      const skillMcpAllowlist = Object.freeze({
        enabledSkillIds,
        enabledMcpServerIds,
        enabledToolNames,
        disabledToolNames,
        ...(authorization.secretScopeId ? { secretScopeId: authorization.secretScopeId } : {}),
      })
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
            riskCeiling: "safe" as const,
            approvalRequiredFrom: "moderate" as const,
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
      }
    },
    findAuditEventId: ({ runId, requestGroupId, toolName }) =>
      input.findAuditEventId({ runId, requestGroupId, toolName }),
  })
  const yeonjang = createYeonjangLiveTransportAdapter({
    invoke: input.invokeYeonjang,
    timeoutMs: input.yeonjangTimeoutMs,
    createCommandId: input.createCommandId,
    createAuditCorrelationId: input.createAuditCorrelationId,
    recordAuditEvent: input.recordYeonjangAuditEvent,
  })
  const policy = Object.freeze({
    failurePolicy: input.policy.failurePolicy,
    maxPreflightAgeMs: input.policy.maxPreflightAgeMs,
    maxWebSourceAgeMs: input.policy.maxWebSourceAgeMs,
    maxYeonjangSessionAgeMs: input.policy.maxYeonjangSessionAgeMs,
    maxEvidenceAgeMs: input.policy.maxEvidenceAgeMs,
    maxYeonjangInstanceAgeMs: input.policy.maxYeonjangInstanceAgeMs,
    ...(input.policy.webScenarios ? { webScenarios: [...input.policy.webScenarios] } : {}),
  })
  const readers = input.readers
  const llm = input.llm
  const requestSink = input.requestSink
  const createRunId = input.createRunId
  const now = input.now
  const runChannels = input.runChannels

  return (server: Readonly<LiveAcceptanceExecutorFactoryInput>) => {
    const channelExecutor = server.channelSmokeLiveExecutor
    if (!channelExecutor) return undefined
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
    })
    return createPreflightedLiveAcceptanceExecutor({
      now,
      maxYeonjangAgeMs: policy.maxYeonjangInstanceAgeMs,
      captureSnapshot: (capturedAt) =>
        captureLiveAcceptanceRuntimeSnapshot({ capturedAt, readers }),
      executeVerified,
    })
  }
}
