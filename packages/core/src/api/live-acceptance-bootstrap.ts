import { randomUUID } from "node:crypto"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { getDefaultModel, getProvider } from "../ai/index.js"
import {
  type ArtifactStorageContext,
  createArtifactStorageContext,
} from "../artifacts/lifecycle.js"
import {
  getDefaultChannelSmokeScenarios,
  runPersistedChannelSmokeScenarios,
} from "../channels/smoke-runner.js"
import type { ChannelSmokeRunnerOptions } from "../channels/smoke-runner.js"
import type { RuntimePaths } from "../config/paths.js"
import type { KnowbeeConfig } from "../config/types.js"
import {
  insertAuditLog,
  listAgentCapabilityBindings,
  listAuditLogsForRun,
  listMcpServerCatalogEntries,
  listSkillCatalogEntries,
} from "../db/index.js"
import {
  type LiveAcceptanceLlmPorts,
  createFileBackedLiveAcceptanceLlmPorts,
} from "../release/live-acceptance-llm-adapter.js"
import type { LiveAcceptanceSigningRequestSink } from "../release/live-acceptance-runner.js"
import type { LiveAcceptanceRuntimeSnapshotReaders } from "../release/live-acceptance-runtime-snapshot-adapter.js"
import type { LiveAcceptanceRuntimeIdentityAdmission } from "../release/live-acceptance-runtime-identity.js"
import { captureLiveAcceptanceRuntimeSnapshot } from "../release/live-acceptance-runtime-snapshot-adapter.js"
import { inspectLiveAcceptanceSelectionAvailability } from "../release/live-acceptance-selection-preflight.js"
import { createLiveAcceptanceSigningRequestFileSink } from "../release/live-acceptance-signing-request-file-sink.js"
import type {
  YeonjangLiveAuditEvent,
  YeonjangLiveInvokeOptions,
} from "../runs/yeonjang-live-transport-adapter.js"
import type { YeonjangLiveSmokeReadOnlyMethod } from "../runs/yeonjang-live-smoke.js"
import type { ToolDispatcher } from "../tools/dispatcher.js"
import { invokeYeonjangMethod } from "../yeonjang/mqtt-client.js"
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js"
import { createLiveAcceptanceRuntimeFactory } from "./live-acceptance-runtime-factory.js"
import { createLiveAcceptanceRuntimeIdentityInspector } from "../runtime/live-acceptance-runtime-identity-adapter.js"
import type { ApiServerRuntimeDependencies } from "./server-runtime-context.js"

const LIVE_MAX_AGE_MS = 60_000
const LIVE_YEONJANG_TIMEOUT_MS = 15_000

export function resolveConfiguredTelegramLiveSmokeTarget(
  config: Readonly<KnowbeeConfig>,
): ApiServerRuntimeDependencies["telegramLiveSmokeTarget"] {
  const telegram = config.telegram
  if (
    !telegram?.enabled ||
    !telegram.botToken.trim() ||
    telegram.allowedUserIds.length !== 1 ||
    telegram.allowedGroupIds.length !== 0
  ) {
    return undefined
  }
  const [userId] = telegram.allowedUserIds
  if (userId === undefined || !Number.isSafeInteger(userId) || userId <= 0) return undefined
  return Object.freeze({ chatId: userId, userId })
}

export interface LiveAcceptanceBootstrapPorts {
  readonly readers: LiveAcceptanceRuntimeSnapshotReaders
  readonly inspectRuntimeIdentity: () => LiveAcceptanceRuntimeIdentityAdmission
  readonly llm: Readonly<LiveAcceptanceLlmPorts>
  readonly artifactStorage: ArtifactStorageContext
  readonly findAuditEventId: (input: {
    readonly runId: string
    readonly requestGroupId?: string
    readonly toolName: string
  }) => string | null
  readonly invokeYeonjang: Parameters<
    typeof createLiveAcceptanceRuntimeFactory
  >[0]["invokeYeonjang"]
  readonly recordYeonjangAuditEvent: (event: YeonjangLiveAuditEvent) => string | null
  readonly runChannels: Parameters<typeof createLiveAcceptanceRuntimeFactory>[0]["runChannels"]
  readonly requestSink: LiveAcceptanceSigningRequestSink
  readonly now: () => number
  readonly createId: () => string
}

export function createLiveAcceptanceBootstrapDependencies(input: {
  readonly config: Readonly<KnowbeeConfig>
  readonly dispatcher: Pick<ToolDispatcher, "dispatch" | "dispatchAgentScoped">
  readonly ports: LiveAcceptanceBootstrapPorts
}): ApiServerRuntimeDependencies {
  const config = input.config
  const ports = input.ports
  const factory = createLiveAcceptanceRuntimeFactory({
    readers: ports.readers,
    inspectRuntimeIdentity: ports.inspectRuntimeIdentity,
    dispatcher: input.dispatcher,
    webContextFor: ({ runId, scenario, signal }) => ({
      artifactStorage: ports.artifactStorage,
      sessionId: `live-acceptance:${runId}`,
      runId,
      workDir: config.profile.workspace,
      userMessage: scenario.request,
      source: "webui",
      allowWebAccess: true,
      onProgress: () => undefined,
      signal,
      mqttConfig: config.mqtt,
      securityConfig: config.security,
      searchConfig: config.search,
      memoryConfig: config.memory,
    }),
    extensionBaseContextFor: ({ runId }) => ({
      artifactStorage: ports.artifactStorage,
      sessionId: `live-acceptance:${runId}`,
      workDir: config.profile.workspace,
      userMessage: "live acceptance extension verification",
      source: "webui",
      onProgress: () => undefined,
      auditId: `live-acceptance:${runId}`,
      mqttConfig: config.mqtt,
      securityConfig: config.security,
      searchConfig: config.search,
      memoryConfig: config.memory,
    }),
    findAuditEventId: ports.findAuditEventId,
    llm: ports.llm,
    invokeYeonjang: ports.invokeYeonjang,
    yeonjangTimeoutMs: LIVE_YEONJANG_TIMEOUT_MS,
    createCommandId: ports.createId,
    createAuditCorrelationId: ports.createId,
    recordYeonjangAuditEvent: ports.recordYeonjangAuditEvent,
    runChannels: ports.runChannels,
    requestSink: ports.requestSink,
    createRunId: ({ stage, scenarioId }) =>
      `live-acceptance:${stage}:${scenarioId ?? "all"}:${ports.createId()}`,
    now: ports.now,
    policy: Object.freeze({
      failurePolicy: "continue_diagnostics",
      maxPreflightAgeMs: LIVE_MAX_AGE_MS,
      maxWebSourceAgeMs: LIVE_MAX_AGE_MS,
      maxYeonjangSessionAgeMs: LIVE_MAX_AGE_MS,
      maxEvidenceAgeMs: LIVE_MAX_AGE_MS,
      maxYeonjangInstanceAgeMs: LIVE_MAX_AGE_MS,
    }),
  })
  const liveAcceptanceSelectionAvailabilityInspector = () => {
    const now = ports.now()
    return inspectLiveAcceptanceSelectionAvailability({
      snapshot: captureLiveAcceptanceRuntimeSnapshot({
        capturedAt: now,
        readers: ports.readers,
      }),
      now,
      maxYeonjangAgeMs: LIVE_MAX_AGE_MS,
    })
  }
  return Object.freeze({
    liveAcceptanceExecutorFactory: factory,
    liveAcceptanceSelectionAvailabilityInspector,
    liveAcceptanceRuntimeIdentityInspector: ports.inspectRuntimeIdentity,
  })
}

function findAuditEventId(input: {
  readonly runId: string
  readonly requestGroupId?: string
  readonly toolName: string
}): string | null {
  const logs = listAuditLogsForRun(input.runId)
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const event = logs[index]
    if (
      event?.tool_name === input.toolName &&
      (!input.requestGroupId || event.request_group_id === input.requestGroupId)
    ) {
      return event.id
    }
  }
  return null
}

function recordYeonjangAuditEvent(event: YeonjangLiveAuditEvent): string {
  return insertAuditLog({
    timestamp: Date.now(),
    session_id: null,
    run_id: event.runId,
    request_group_id: event.requestGroupId,
    source: "system",
    tool_name: "live_acceptance_yeonjang",
    params: JSON.stringify({
      commandId: event.commandId,
      instanceId: event.instanceId,
      sessionId: event.sessionId,
      method: event.method,
    }),
    output: JSON.stringify({ evidenceRef: event.evidenceRef }),
    result: "success",
    duration_ms: null,
    approval_required: 0,
    approved_by: null,
  })
}

export function createDefaultLiveAcceptanceBootstrapDependencies(input: {
  readonly config: Readonly<KnowbeeConfig>
  readonly paths: Pick<RuntimePaths, "stateDir">
  readonly dispatcher: ToolDispatcher
}): ApiServerRuntimeDependencies {
  const provider = getProvider(undefined, input.config)
  const model = getDefaultModel(input.config)
  const outputDir = join(input.paths.stateDir, "release", "live-acceptance-signing-requests")
  mkdirSync(outputDir, { recursive: true, mode: 0o700 })
  const basicChannelScenarios = getDefaultChannelSmokeScenarios().filter(
    (scenario) =>
      scenario.kind === "basic_query" &&
      (scenario.channel === "webui" ||
        scenario.channel === "telegram" ||
        scenario.channel === "slack"),
  )
  const readers: LiveAcceptanceRuntimeSnapshotReaders = Object.freeze({
    listBindings: () => listAgentCapabilityBindings({ includeArchived: true }),
    listSkillCatalogs: () => listSkillCatalogEntries({ includeArchived: true }),
    listMcpCatalogs: () => listMcpServerCatalogEntries({ includeArchived: true }),
    listTools: () => input.dispatcher.getAll({ includeIsolated: true }),
    listYeonjangInstances: (capturedAt: number) =>
      listYeonjangRegistryInstances({ now: capturedAt }),
  })
  const ports: LiveAcceptanceBootstrapPorts = Object.freeze({
    readers,
    inspectRuntimeIdentity: createLiveAcceptanceRuntimeIdentityInspector(),
    llm: createFileBackedLiveAcceptanceLlmPorts({
      provider,
      model,
      workDir: input.config.profile.workspace,
    }),
    artifactStorage: createArtifactStorageContext(input.paths),
    findAuditEventId,
    invokeYeonjang: (
      method: YeonjangLiveSmokeReadOnlyMethod,
      params: Record<string, unknown>,
      options: YeonjangLiveInvokeOptions,
    ) => invokeYeonjangMethod(method, params, { ...options, mqttConfig: input.config.mqtt }),
    recordYeonjangAuditEvent,
    runChannels: (executor: ChannelSmokeRunnerOptions["executeScenario"]) =>
      runPersistedChannelSmokeScenarios({
        config: input.config,
        mode: "live-run",
        scenarios: [...basicChannelScenarios],
        initiatedBy: "release-live-acceptance",
        metadata: { source: "live-acceptance" },
        executeScenario: executor,
      }),
    requestSink: createLiveAcceptanceSigningRequestFileSink({ outputDir }),
    now: Date.now,
    createId: randomUUID,
  })
  const dependencies = createLiveAcceptanceBootstrapDependencies({
    config: input.config,
    dispatcher: input.dispatcher,
    ports,
  })
  const telegramLiveSmokeTarget = resolveConfiguredTelegramLiveSmokeTarget(input.config)
  return Object.freeze({
    ...dependencies,
    ...(telegramLiveSmokeTarget ? { telegramLiveSmokeTarget } : {}),
  })
}
