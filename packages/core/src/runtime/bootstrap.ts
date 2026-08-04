import { createDefaultLiveAcceptanceBootstrapDependencies } from "../api/live-acceptance-bootstrap.js"
import { recoverInterruptedGatewayChannelSmokeRuns } from "../channels/smoke-runner.js"
import {
  type ApiServerRuntimeDependencies,
  createApiServerRuntimeContext,
} from "../api/server-runtime-context.js"
import { closeServer as closeApiServer, startServer } from "../api/server.js"
import { loadConfigSnapshot } from "../config/index.js"
import { type RuntimePaths, createRuntimePaths } from "../config/paths.js"
import {
  createImmutableConfigSnapshot,
  createStartupConfigSource,
} from "../config/startup-source.js"
import type { KnowbeeConfig } from "../config/types.js"
import { getDb, insertAuditLog, upsertPromptSources } from "../db/index.js"
import { eventBus } from "../events/index.js"
import { createLogger } from "../logger/index.js"
import { ensurePromptSourceFiles } from "../memory/knowbee-md.js"
import { startMqttBroker, stopMqttBroker } from "../mqtt/broker.js"
import { recoverActiveRunsOnStartup } from "../runs/store.js"
import { registerBuiltinSkills } from "../skills/builtin.js"
import {
  initializeToolDispatcher,
  registerBuiltinTools,
} from "../tools/index.js"
import {
  type BrowserFocusRuntimeBootstrap,
  type BrowserFocusRuntimeBootstrapOptions,
  createBrowserFocusRuntimeBootstrap,
} from "../yeonjang/browser-focus-runtime-bootstrap.js"
import { listYeonjangRegistryInstances } from "../yeonjang/registry.js"
import { activateChannelsAndRecoverPendingResponses } from "./channel-activation-recovery.js"
import { getGatewayProcessStartTimeMs } from "./build-status.js"
import { refreshRuntimeManifest } from "./manifest.js"
import {
  recoverApprovedOperationContinuations,
} from "./approved-operation-continuation-recovery.js"
import {
  createApprovedOperationContinuationRecoverySupervisor,
  type ApprovedOperationContinuationRecoverySupervisor,
} from "./approved-operation-continuation-recovery-supervisor.js"
import {
  type StartupProcessContext,
  captureStartupProcessContext,
} from "./startup-process-context.js"
import type { GatewayStartupProgressPort } from "./gateway-startup-coordinator.js"
import {
  createMcpStartupPort,
  startMcpConnectionsInBackground,
  type McpStartupPort,
} from "./mcp-startup-port.js"

let startupProcessContext: StartupProcessContext | null = null
let startupRuntimePaths: RuntimePaths | null = null
let startupBrowserFocusRuntime: {
  readonly runtime: BrowserFocusRuntimeBootstrap
  readonly dispatcherDependencies: Readonly<{
    yeonjangBrowserFocusExecutionAdmissionIssuer?: NonNullable<
      BrowserFocusRuntimeBootstrap["issuer"]
    >
    yeonjangExecutionAuthorizationIssuer?: NonNullable<
      BrowserFocusRuntimeBootstrap["executionAuthorizationIssuer"]
    >
  }>
} | null = null
let continuationRecoverySupervisor:
  ApprovedOperationContinuationRecoverySupervisor | null = null
let detachContinuationRecoveryWake: (() => void) | null = null
const continuationRecoveryLog = createLogger(
  "runtime:approved-operation-continuation",
)
const channelSmokeRecoveryLog = createLogger("runtime:channel-smoke-recovery")

async function stopContinuationRecovery(): Promise<void> {
  detachContinuationRecoveryWake?.()
  detachContinuationRecoveryWake = null
  const supervisor = continuationRecoverySupervisor
  continuationRecoverySupervisor = null
  await supervisor?.stop()
}

export interface BootstrapOptions {
  runtimePaths?: RuntimePaths
  startupProgress?: GatewayStartupProgressPort
  mcpStartupPort?: McpStartupPort
  browserFocusExecutionAdmission?: Omit<
    BrowserFocusRuntimeBootstrapOptions,
    "trustedExtensionIds" | "connectionPassword"
  >
}

async function advanceStartupOrThrow(
  progress: GatewayStartupProgressPort | undefined,
  event: Parameters<GatewayStartupProgressPort["advance"]>[0],
): Promise<void> {
  if (!progress) return
  const result = await progress.advance(event)
  if (result.status === "rejected") {
    throw new Error(`gateway_startup_transition_rejected:${result.reasonCode}`)
  }
}

function resolveBootstrapProcessContext(): StartupProcessContext {
  return (startupProcessContext ??= captureStartupProcessContext())
}

function resolveBootstrapRuntimePaths(): RuntimePaths {
  return (startupRuntimePaths ??= createRuntimePaths(resolveBootstrapProcessContext().env))
}

const startupConfigSource = createStartupConfigSource(() => {
  const processContext = resolveBootstrapProcessContext()
  return loadConfigSnapshot({
    baseEnv: { ...processContext.env },
    cwd: processContext.cwd,
    paths: resolveBootstrapRuntimePaths(),
  })
})

function resolveBootstrapConfig(config?: KnowbeeConfig): KnowbeeConfig {
  return config ? createImmutableConfigSnapshot(config) : startupConfigSource.getSnapshot()
}

function resolveBootstrapBrowserFocusRuntime(
  options: BootstrapOptions,
  runtimeConfig: KnowbeeConfig,
): NonNullable<typeof startupBrowserFocusRuntime> {
  if (startupBrowserFocusRuntime) return startupBrowserFocusRuntime
  const trustedExtensionIds = listYeonjangRegistryInstances()
    .filter((instance) => instance.trustState === "trusted")
    .map((instance) => instance.nodeId)
  const runtime = createBrowserFocusRuntimeBootstrap({
    trustedExtensionIds,
    connectionPassword: runtimeConfig.mqtt.password,
    ...(options.browserFocusExecutionAdmission ?? {}),
  })
  startupBrowserFocusRuntime = Object.freeze({
    runtime,
    dispatcherDependencies: Object.freeze({
      ...(runtime.issuer ? { yeonjangBrowserFocusExecutionAdmissionIssuer: runtime.issuer } : {}),
      ...(runtime.executionAuthorizationIssuer
        ? { yeonjangExecutionAuthorizationIssuer: runtime.executionAuthorizationIssuer }
        : {}),
    }),
  })
  return startupBrowserFocusRuntime
}

export function bootstrap(
  config?: KnowbeeConfig,
  options: BootstrapOptions = {},
): KnowbeeConfig {
  const processContext = resolveBootstrapProcessContext()
  const runtimeConfig = resolveBootstrapConfig(config)
  const runtimePaths = options.runtimePaths ?? resolveBootstrapRuntimePaths()
  getDb({ paths: runtimePaths })
  const browserFocusRuntime = resolveBootstrapBrowserFocusRuntime(options, runtimeConfig)
  try {
    const promptSeed = ensurePromptSourceFiles(runtimeConfig.profile.workspace)
    upsertPromptSources(promptSeed.registry.map(({ content: _content, ...metadata }) => metadata))
    insertAuditLog({
      timestamp: Date.now(),
      session_id: null,
      source: "system",
      tool_name: "prompt_bootstrap",
      params: JSON.stringify({ promptsDir: promptSeed.promptsDir }),
      output: JSON.stringify({
        created: promptSeed.created,
        existing: promptSeed.existing.length,
        sources: promptSeed.registry.length,
      }),
      result: "success",
      duration_ms: null,
      approval_required: 0,
      approved_by: null,
    })
  } catch {
    try {
      insertAuditLog({
        timestamp: Date.now(),
        session_id: null,
        source: "system",
        tool_name: "prompt_bootstrap",
        params: null,
        output: "Prompt bootstrap failed with a safe initialization error summary.",
        result: "failed",
        duration_ms: null,
        approval_required: 0,
        approved_by: null,
      })
    } catch {
      // Prompt diagnostics remain available after the database becomes available.
    }
  }
  const dispatcher = initializeToolDispatcher(
    runtimeConfig,
    browserFocusRuntime.dispatcherDependencies,
  )
  registerBuiltinTools(dispatcher)
  const configuredMainAgentId = runtimeConfig.orchestration.knowbee?.agentId
  registerBuiltinSkills(configuredMainAgentId ? { mainAgentId: configuredMainAgentId } : {})
  try {
    refreshRuntimeManifest({
      includeEnvironment: false,
      includeReleasePackage: false,
      config: runtimeConfig,
      paths: runtimePaths,
      processCwd: processContext.cwd,
    })
  } catch {
    // Runtime manifest failures are surfaced through doctor checks.
  }
  return runtimeConfig
}

export async function bootstrapRuntime(
  config?: KnowbeeConfig,
  options: BootstrapOptions = {},
): Promise<KnowbeeConfig> {
  const runtimeConfig = resolveBootstrapConfig(config)
  bootstrap(runtimeConfig, options)
  recoverActiveRunsOnStartup()
  return runtimeConfig
}

export async function bootstrapAsync(
  config?: KnowbeeConfig,
  options: BootstrapOptions = {},
): Promise<KnowbeeConfig> {
  const processContext = resolveBootstrapProcessContext()
  const runtimeConfig = resolveBootstrapConfig(config)
  const runtimePaths = resolveBootstrapRuntimePaths()
  const startupProgress = options.startupProgress
  const mcpStartup = options.mcpStartupPort ?? createMcpStartupPort()
  const preparedMcp = mcpStartup.prepare(
    runtimeConfig,
    { ...processContext.env },
  )
  if (preparedMcp.status === "rejected") {
    throw new Error(`mcp_startup_prepare_rejected:${preparedMcp.reasonCode}`)
  }
  let channelRecoveryRuntime:
    Awaited<ReturnType<typeof activateChannelsAndRecoverPendingResponses>>["channelRuntime"]
    | undefined
  await advanceStartupOrThrow(startupProgress, {
    type: "runtime_loaded",
    at: Date.now(),
  })
  try {
    await bootstrapRuntime(runtimeConfig, options)
    const smokeRecovery = recoverInterruptedGatewayChannelSmokeRuns({
      gatewayStartedAt: getGatewayProcessStartTimeMs(),
      recoveredAt: Date.now(),
    })
    if (smokeRecovery.recoveredCount > 0) {
      channelSmokeRecoveryLog.product("channel_smoke_startup_reconciled", {
        reasonCode: "gateway_restart_interrupted",
        recoveredCount: smokeRecovery.recoveredCount,
      })
    }
    await advanceStartupOrThrow(startupProgress, {
      type: "core_initialized",
      at: Date.now(),
    })
    await startMqttBroker(runtimeConfig.mqtt)
    const channelActivation = await activateChannelsAndRecoverPendingResponses(
      runtimeConfig,
      runtimePaths,
    )
    channelRecoveryRuntime = channelActivation.channelRuntime
    await advanceStartupOrThrow(startupProgress, {
      type: "channels_activated",
      at: Date.now(),
    })
  } catch (error) {
    await startupProgress?.advance({
      type: "fail",
      at: Date.now(),
      reasonCode: "core_bootstrap_failed",
    })
    await stopMqttBroker()
    await mcpStartup.cancel()
    throw error
  }
  const browserFocusRuntime = resolveBootstrapBrowserFocusRuntime(options, runtimeConfig)
  let apiDependencies: ApiServerRuntimeDependencies = Object.freeze({
    ...(startupProgress ? { startupProgress } : {}),
    ...(browserFocusRuntime.runtime.pairingExecutionAdmissionKeyProvisioner
      ? {
          pairingExecutionAdmissionKeyProvisioner:
            browserFocusRuntime.runtime.pairingExecutionAdmissionKeyProvisioner,
        }
      : {}),
  })
  if (processContext.env.KNOWBEE_LIVE_ACCEPTANCE === "1") {
    try {
      apiDependencies = Object.freeze({
        ...apiDependencies,
        ...createDefaultLiveAcceptanceBootstrapDependencies({
          config: runtimeConfig,
          paths: runtimePaths,
          dispatcher: initializeToolDispatcher(
            runtimeConfig,
            browserFocusRuntime.dispatcherDependencies,
          ),
        }),
      })
    } catch {
      // The API server reports the bounded unavailable reason when dependencies fail closed.
    }
  }
  try {
    await startServer(
      runtimeConfig,
      runtimePaths,
      createApiServerRuntimeContext(processContext, apiDependencies),
    )
  } catch (error) {
    await stopMqttBroker()
    await mcpStartup.cancel()
    throw error
  }
  await stopContinuationRecovery()
  continuationRecoverySupervisor =
    createApprovedOperationContinuationRecoverySupervisor({
      recover: (signal) => recoverApprovedOperationContinuations({
        config: runtimeConfig,
        paths: runtimePaths,
        signal,
        ...(channelRecoveryRuntime
          ? {
              resolveDeliveryHandler:
                channelRecoveryRuntime.resolveDeliveryHandler,
            }
          : {}),
      }),
      onSummary: async (summary, signal) => {
        for (const runId of summary.completedRunIds) {
          await channelRecoveryRuntime?.resumeExistingRootRun(runId, signal)
        }
        if (summary.claimed > 0) {
          continuationRecoveryLog.product(
            "approved_operation_continuation_recovery_completed",
            {
              reasonCode: "runtime_recovery_settled",
              claimed: summary.claimed,
              completed: summary.completed,
              blocked: summary.blocked,
              cancelled: summary.cancelled,
            },
          )
        }
      },
      onError: () => {
        continuationRecoveryLog.product(
          "approved_operation_continuation_recovery_failed",
          { reasonCode: "runtime_recovery_unavailable" },
        )
      },
    })
  detachContinuationRecoveryWake = eventBus.on(
    "approval.continuation.enqueued",
    () => continuationRecoverySupervisor?.wake(),
  )
  void continuationRecoverySupervisor.wake()
  startMcpConnectionsInBackground(mcpStartup)
  return runtimeConfig
}

export async function closeServer(): Promise<void> {
  await stopContinuationRecovery()
  await closeApiServer()
}
