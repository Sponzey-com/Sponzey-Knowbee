import type { PersistedChannelSmokeRunResult } from "../channels/smoke-runner.js"
import {
  type ExtensionLiveSmokeExecutePort,
  runExtensionLiveSmokeScenarios,
} from "../runs/extension-live-smoke-runner.js"
import type {
  WebRetrievalLiveFetchPort,
  WebRetrievalLiveSearchPort,
} from "../runs/web-retrieval-live-runner.js"
import { runWebRetrievalLiveScenario } from "../runs/web-retrieval-live-runner.js"
import {
  type WebRetrievalLiveSmokeScenario,
  getDefaultWebRetrievalLiveSmokeScenarios,
  runWebRetrievalLiveSmokeScenarios,
} from "../runs/web-retrieval-smoke.js"
import {
  type YeonjangLiveSmokeExecutePort,
  type YeonjangLiveSmokeSelection,
  runYeonjangLiveSmokeScenarios,
} from "../runs/yeonjang-live-smoke-runner.js"
import type { YeonjangLiveSmokeReadOnlyMethod } from "../runs/yeonjang-live-smoke.js"
import type { LiveAcceptanceLlmPorts } from "./live-acceptance-llm-adapter.js"
import type {
  LiveAcceptanceVerifiedExecutionContext,
  LiveAcceptanceVerifiedExecutor,
} from "./live-acceptance-preflighted-executor.js"
import type {
  LiveAcceptanceRunnerContext,
  LiveAcceptanceRunnerFailurePolicy,
  LiveAcceptanceSigningRequestSink,
} from "./live-acceptance-runner.js"
import { runProductionLiveAcceptance } from "./live-acceptance-runtime-ports.js"

export type LiveAcceptanceLiveRunStage = "web" | "extensions" | "yeonjang"

export interface LiveAcceptanceLiveRunIdInput {
  readonly stage: LiveAcceptanceLiveRunStage
  readonly scenarioId?: string
}

export interface VerifiedLiveAcceptanceExecutorInput {
  readonly channels: (
    context: LiveAcceptanceRunnerContext,
  ) => Promise<PersistedChannelSmokeRunResult>
  readonly web: Readonly<{
    search: WebRetrievalLiveSearchPort
    fetch: WebRetrievalLiveFetchPort
  }>
  readonly extensions: ExtensionLiveSmokeExecutePort
  readonly yeonjang: YeonjangLiveSmokeExecutePort
  readonly llm: Readonly<LiveAcceptanceLlmPorts>
  readonly requestSink: LiveAcceptanceSigningRequestSink
  readonly createRunId: (input: LiveAcceptanceLiveRunIdInput) => string
  readonly webScenarios?: readonly WebRetrievalLiveSmokeScenario[]
  readonly failurePolicy: LiveAcceptanceRunnerFailurePolicy
  readonly maxPreflightAgeMs: number
  readonly maxWebSourceAgeMs: number
  readonly maxYeonjangSessionAgeMs: number
  readonly maxEvidenceAgeMs: number
  readonly maxYeonjangInstanceAgeMs: number
}

function validAge(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function freezeWebScenarios(
  scenarios: readonly WebRetrievalLiveSmokeScenario[],
): readonly WebRetrievalLiveSmokeScenario[] {
  return Object.freeze(
    scenarios.map((scenario) => {
      const symbols = scenario.target.symbols ? [...scenario.target.symbols] : undefined
      if (symbols) Object.freeze(symbols)
      const target = {
        ...scenario.target,
        ...(symbols ? { symbols } : {}),
      }
      const minimumMethods = [...scenario.minimumMethods]
      const completionConditions = [...scenario.completionConditions]
      Object.freeze(target)
      Object.freeze(minimumMethods)
      Object.freeze(completionConditions)
      return Object.freeze({
        ...scenario,
        target,
        minimumMethods,
        completionConditions,
      })
    }),
  )
}

function requireRunId(value: string): string {
  const runId = value.trim()
  if (!runId || runId.length > 256) throw new Error("live_verified_run_id_invalid")
  return runId
}

const YEONJANG_DEFAULT_NO_PARAM_METHODS: readonly YeonjangLiveSmokeReadOnlyMethod[] =
  Object.freeze(["node.capabilities", "system.info", "camera.list"])
const YEONJANG_PATH_BACKED_METHODS: readonly YeonjangLiveSmokeReadOnlyMethod[] = Object.freeze([
  "file.list",
  "disk.usage",
])
const YEONJANG_PATH_REQUIRED_METHODS: readonly YeonjangLiveSmokeReadOnlyMethod[] = Object.freeze([
  "file.metadata",
  "file.list",
  "file.read",
  "file.search",
  "disk.info",
  "disk.usage",
  "disk.exists",
])

function pathParams(selection: YeonjangLiveSmokeSelection): Readonly<Record<string, unknown>> | null {
  const value = selection.scenario.params?.path
  if (typeof value !== "string" || value.trim().length === 0) return null
  return Object.freeze({ path: value })
}

function cloneYeonjangSelection(input: {
  readonly base: YeonjangLiveSmokeSelection
  readonly method: YeonjangLiveSmokeReadOnlyMethod
  readonly params?: Readonly<Record<string, unknown>>
}): YeonjangLiveSmokeSelection {
  return Object.freeze({
    scenario: Object.freeze({
      id: `live-acceptance:yeonjang-${input.method.replaceAll(".", "-")}`,
      expectedInstanceId: input.base.scenario.expectedInstanceId,
      expectedSessionId: input.base.scenario.expectedSessionId,
      expectedMethod: input.method,
      ...(input.params ? { params: input.params } : {}),
      readOnly: true,
    }),
    instance: input.base.instance,
  })
}

export function expandYeonjangLiveAcceptanceSelections(
  selection: YeonjangLiveSmokeSelection,
): readonly YeonjangLiveSmokeSelection[] {
  const expanded: YeonjangLiveSmokeSelection[] = []
  const seen = new Set<string>()
  const add = (
    method: YeonjangLiveSmokeReadOnlyMethod,
    params?: Readonly<Record<string, unknown>>,
  ) => {
    if (seen.has(method)) return
    seen.add(method)
    expanded.push(cloneYeonjangSelection({ base: selection, method, ...(params ? { params } : {}) }))
  }

  for (const method of YEONJANG_DEFAULT_NO_PARAM_METHODS) add(method)
  const fileDiskParams = pathParams(selection)
  if (fileDiskParams) {
    for (const method of YEONJANG_PATH_BACKED_METHODS) add(method, fileDiskParams)
  }
  if (
    !seen.has(selection.scenario.expectedMethod) &&
    (fileDiskParams || !YEONJANG_PATH_REQUIRED_METHODS.includes(selection.scenario.expectedMethod))
  ) {
    const params = fileDiskParams && selection.scenario.params ? selection.scenario.params : undefined
    add(selection.scenario.expectedMethod, params)
  }

  return Object.freeze(expanded)
}

export function createVerifiedLiveAcceptanceExecutor(
  input: VerifiedLiveAcceptanceExecutorInput,
): LiveAcceptanceVerifiedExecutor {
  const maxPreflightAgeMs = input.maxPreflightAgeMs
  const maxWebSourceAgeMs = input.maxWebSourceAgeMs
  const maxYeonjangSessionAgeMs = input.maxYeonjangSessionAgeMs
  const maxEvidenceAgeMs = input.maxEvidenceAgeMs
  const maxYeonjangInstanceAgeMs = input.maxYeonjangInstanceAgeMs
  const failurePolicy = input.failurePolicy
  const ages = [
    maxPreflightAgeMs,
    maxWebSourceAgeMs,
    maxYeonjangSessionAgeMs,
    maxEvidenceAgeMs,
    maxYeonjangInstanceAgeMs,
  ]
  const webScenarios = freezeWebScenarios(
    input.webScenarios ?? getDefaultWebRetrievalLiveSmokeScenarios(),
  )
  if (
    ages.some((value) => !validAge(value)) ||
    (failurePolicy !== "continue_diagnostics" && failurePolicy !== "stop_on_failure") ||
    webScenarios.length === 0 ||
    new Set(webScenarios.map((scenario) => scenario.id)).size !== webScenarios.length
  ) {
    throw new Error("live_verified_executor_config_invalid")
  }

  const channels = input.channels
  const webSearch = input.web.search
  const webFetch = input.web.fetch
  const extensionExecute = input.extensions
  const yeonjangExecute = input.yeonjang
  const webPlan = input.llm.webPlan
  const webDiagnosis = input.llm.webDiagnosis
  const webRediagnosis = input.llm.webRediagnosis
  const extensionDiagnosis = input.llm.extensionDiagnosis
  const yeonjangDiagnosis = input.llm.yeonjangDiagnosis
  const requestSink = input.requestSink
  const createRunId = input.createRunId

  return async (context: LiveAcceptanceVerifiedExecutionContext) => {
    const fixedClock = () => new Date(context.observedAt)
    return runProductionLiveAcceptance({
      candidate: context.candidate,
      approval: context.approval,
      preflight: Object.freeze({
        capturedAt: context.preflight.snapshotCapturedAt,
        stages: Object.freeze({
          channels: Object.freeze({ status: "ready" as const }),
          web: Object.freeze({ status: "ready" as const }),
          extensions: Object.freeze({ status: "ready" as const }),
          yeonjang: Object.freeze({ status: "ready" as const }),
        }),
      }),
      executors: Object.freeze({
        channels,
        web: async () =>
          runWebRetrievalLiveSmokeScenarios({
            mode: "live-run",
            liveEnabled: true,
            scenarios: [...webScenarios],
            now: fixedClock(),
            clock: fixedClock,
            executeScenario: (scenario) =>
              runWebRetrievalLiveScenario({
                runId: requireRunId(createRunId({ stage: "web", scenarioId: scenario.id })),
                scenario,
                search: webSearch,
                plan: webPlan,
                fetch: webFetch,
                diagnose: webDiagnosis,
                rediagnose: webRediagnosis,
                maxAttempts: 3,
                signal: context.signal,
              }),
          }),
        extensions: async () =>
          runExtensionLiveSmokeScenarios({
            runId: requireRunId(createRunId({ stage: "extensions" })),
            selections: context.preflight.extensions,
            execute: extensionExecute,
            diagnose: extensionDiagnosis,
            now: () => context.observedAt,
            signal: context.signal,
          }),
        yeonjang: async () =>
          runYeonjangLiveSmokeScenarios({
            runId: requireRunId(createRunId({ stage: "yeonjang" })),
            selections: expandYeonjangLiveAcceptanceSelections(context.preflight.yeonjang),
            execute: yeonjangExecute,
            diagnose: yeonjangDiagnosis,
            maxInstanceAgeMs: maxYeonjangInstanceAgeMs,
            now: () => context.observedAt,
            signal: context.signal,
          }),
      }),
      maxPreflightAgeMs,
      maxWebSourceAgeMs,
      maxYeonjangSessionAgeMs,
      maxEvidenceAgeMs,
      failurePolicy,
      requestedKeyId: context.requestedKeyId,
      requestSink,
      now: context.observedAt,
      isCancelled: () => context.signal.aborted,
    })
  }
}
