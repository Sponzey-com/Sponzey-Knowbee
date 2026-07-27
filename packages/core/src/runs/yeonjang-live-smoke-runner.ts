import {
  type YeonjangLiveCommandReceipt,
  type YeonjangLiveInstanceReceipt,
  type YeonjangLiveObservedResultReceipt,
  type YeonjangLiveResultDiagnosisReceipt,
  type YeonjangLiveSmokeResult,
  type YeonjangLiveSmokeScenario,
  type YeonjangLiveSmokeSummary,
  isYeonjangLiveSmokeReadOnlyMethod,
  transitionYeonjangLiveSmokeState,
} from "./yeonjang-live-smoke.js"

export type YeonjangLiveSmokeRunnerErrorCode =
  | "yeonjang_smoke_run_id_invalid"
  | "yeonjang_smoke_max_age_invalid"
  | "yeonjang_smoke_cancelled"

export type YeonjangLiveSmokeRunnerRejectionCode =
  | "yeonjang_smoke_scenario_invalid"
  | "yeonjang_smoke_instance_not_connected"
  | "yeonjang_smoke_instance_duplicate"
  | "yeonjang_smoke_instance_untrusted"
  | "yeonjang_smoke_instance_not_runnable"
  | "yeonjang_smoke_target_mismatch"
  | "yeonjang_smoke_session_stale"
  | "yeonjang_smoke_execution_failed"
  | "yeonjang_smoke_command_mismatch"
  | "yeonjang_smoke_command_not_acked"
  | "yeonjang_smoke_observed_result_missing"
  | "yeonjang_smoke_observed_result_mismatch"
  | "yeonjang_smoke_audit_missing"
  | "yeonjang_smoke_llm_diagnosis_invalid"

export class YeonjangLiveSmokeRunnerError extends Error {
  readonly code: YeonjangLiveSmokeRunnerErrorCode

  constructor(code: YeonjangLiveSmokeRunnerErrorCode) {
    super(code)
    this.name = "YeonjangLiveSmokeRunnerError"
    this.code = code
  }
}

export interface YeonjangLiveSmokeSelection {
  readonly scenario: YeonjangLiveSmokeScenario
  readonly instance: YeonjangLiveInstanceReceipt
}

export interface YeonjangLiveObservedExecution {
  readonly command: YeonjangLiveCommandReceipt | null
  readonly observedResult: YeonjangLiveObservedResultReceipt | null
  readonly auditEventId: string | null
  readonly diagnosisPayload: unknown
}

export interface YeonjangLiveSmokeExecutionInput {
  readonly runId: string
  readonly selection: YeonjangLiveSmokeSelection
  readonly signal: AbortSignal
}

export interface YeonjangLiveSmokeDiagnosisInput {
  readonly runId: string
  readonly scenario: YeonjangLiveSmokeScenario
  readonly evidenceRef: string
  readonly diagnosisPayload: unknown
  readonly signal: AbortSignal
}

export type YeonjangLiveSmokeExecutePort = (
  input: YeonjangLiveSmokeExecutionInput,
) => Promise<YeonjangLiveObservedExecution>

export type YeonjangLiveSmokeDiagnosisPort = (
  input: YeonjangLiveSmokeDiagnosisInput,
) => Promise<unknown>

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const REQUIRED_CRITERIA = ["existence", "accuracy", "target_match", "constraint_compliance"]

function exact(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256
}

function fail(code: YeonjangLiveSmokeRunnerErrorCode): never {
  throw new YeonjangLiveSmokeRunnerError(code)
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) fail("yeonjang_smoke_cancelled")
}

function preflightRejection(input: {
  selection: YeonjangLiveSmokeSelection
  now: number
  maxInstanceAgeMs: number
}): YeonjangLiveSmokeRunnerRejectionCode | null {
  const { scenario, instance } = input.selection
  if (
    !exact(scenario.id) ||
    !exact(scenario.expectedInstanceId) ||
    !exact(scenario.expectedSessionId) ||
    !isYeonjangLiveSmokeReadOnlyMethod(scenario.expectedMethod) ||
    scenario.readOnly !== true
  ) {
    return "yeonjang_smoke_scenario_invalid"
  }
  if (instance.status !== "connected") return "yeonjang_smoke_instance_not_connected"
  if (instance.duplicateActiveIdentityCount !== 0) return "yeonjang_smoke_instance_duplicate"
  if (instance.trustState !== "trusted") return "yeonjang_smoke_instance_untrusted"
  if (!instance.runnableTarget) return "yeonjang_smoke_instance_not_runnable"
  if (
    instance.instanceId !== scenario.expectedInstanceId ||
    instance.sessionId !== scenario.expectedSessionId
  ) {
    return "yeonjang_smoke_target_mismatch"
  }
  if (instance.observedAt > input.now || input.now - instance.observedAt > input.maxInstanceAgeMs) {
    return "yeonjang_smoke_session_stale"
  }
  return null
}

function rejectedResult(input: {
  selection: YeonjangLiveSmokeSelection
  runId: string
  startedAt: number
  finishedAt: number
  reasonCode: YeonjangLiveSmokeRunnerRejectionCode
  observed?: YeonjangLiveObservedExecution
}): YeonjangLiveSmokeResult {
  return {
    scenario: input.selection.scenario,
    state: "rejected",
    status: "failed",
    reasonCode: input.reasonCode,
    trace: {
      requestGroupId: input.runId,
      instance: input.selection.instance,
      ...(input.observed?.command ? { command: input.observed.command } : {}),
      ...(input.observed?.observedResult ? { observedResult: input.observed.observedResult } : {}),
      ...(input.observed?.auditEventId ? { auditEventId: input.observed.auditEventId } : {}),
      redactionStatus: "verified",
    },
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  }
}

function summary(input: {
  runId: string
  startedAt: number
  finishedAt: number
  result: YeonjangLiveSmokeResult
}): YeonjangLiveSmokeSummary {
  return Object.freeze({
    kind: "yeonjang.live_smoke",
    mode: "live-run",
    runId: input.runId,
    status: input.result.status === "passed" ? "passed" : "failed",
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    results: Object.freeze([input.result]),
  })
}

function commandMatches(
  command: YeonjangLiveCommandReceipt,
  runId: string,
  scenario: YeonjangLiveSmokeScenario,
): boolean {
  return (
    command.runId === runId &&
    command.requestGroupId === runId &&
    exact(command.commandId) &&
    command.instanceId === scenario.expectedInstanceId &&
    command.sessionId === scenario.expectedSessionId &&
    command.method === scenario.expectedMethod &&
    command.readOnly === true
  )
}

function observedMatches(input: {
  observed: YeonjangLiveObservedResultReceipt
  command: YeonjangLiveCommandReceipt
  runId: string
  scenario: YeonjangLiveSmokeScenario
}): boolean {
  return (
    input.observed.runId === input.runId &&
    input.observed.commandId === input.command.commandId &&
    input.observed.instanceId === input.scenario.expectedInstanceId &&
    input.observed.sessionId === input.scenario.expectedSessionId &&
    input.observed.status === "observed" &&
    exact(input.observed.evidenceRef)
  )
}

function parseDiagnosis(
  value: unknown,
  evidenceRef: string,
): YeonjangLiveResultDiagnosisReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Partial<YeonjangLiveResultDiagnosisReceipt>
  if (
    receipt.diagnosedBy !== "llm" ||
    receipt.status !== "complete" ||
    !SHA256.test(receipt.contextFingerprint ?? "") ||
    !Array.isArray(receipt.criterionKeys) ||
    REQUIRED_CRITERIA.some((criterion) => !receipt.criterionKeys?.includes(criterion)) ||
    !Array.isArray(receipt.evidenceRefs) ||
    receipt.evidenceRefs.length !== 1 ||
    receipt.evidenceRefs[0] !== evidenceRef
  ) {
    return null
  }
  return Object.freeze({
    diagnosedBy: "llm",
    status: "complete",
    contextFingerprint: receipt.contextFingerprint as `sha256:${string}`,
    criterionKeys: Object.freeze([...receipt.criterionKeys]),
    evidenceRefs: Object.freeze([evidenceRef]),
  })
}

export async function runYeonjangLiveSmokeScenario(input: {
  readonly runId: string
  readonly selection: YeonjangLiveSmokeSelection
  readonly execute: YeonjangLiveSmokeExecutePort
  readonly diagnose: YeonjangLiveSmokeDiagnosisPort
  readonly maxInstanceAgeMs: number
  readonly now: () => number
  readonly signal: AbortSignal
}): Promise<YeonjangLiveSmokeSummary> {
  if (!exact(input.runId)) fail("yeonjang_smoke_run_id_invalid")
  if (!Number.isFinite(input.maxInstanceAgeMs) || input.maxInstanceAgeMs <= 0) {
    fail("yeonjang_smoke_max_age_invalid")
  }
  checkCancelled(input.signal)
  const startedAt = input.now()
  const itemStartedAt = input.now()
  const preflightReason = preflightRejection({
    selection: input.selection,
    now: input.now(),
    maxInstanceAgeMs: input.maxInstanceAgeMs,
  })
  if (preflightReason) {
    const result = rejectedResult({
      selection: input.selection,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: preflightReason,
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }

  const dispatched = transitionYeonjangLiveSmokeState("prepared", "DISPATCH")
  if (!dispatched.ok) throw new Error(dispatched.reasonCode)
  let observed: YeonjangLiveObservedExecution
  try {
    observed = await input.execute({
      runId: input.runId,
      selection: input.selection,
      signal: input.signal,
    })
  } catch {
    const result = rejectedResult({
      selection: input.selection,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: "yeonjang_smoke_execution_failed",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }
  checkCancelled(input.signal)

  const command = observed.command
  let rejection: YeonjangLiveSmokeRunnerRejectionCode | null = null
  if (!command || !commandMatches(command, input.runId, input.selection.scenario)) {
    rejection = "yeonjang_smoke_command_mismatch"
  } else if (command.deliveryStatus !== "acked") {
    rejection = "yeonjang_smoke_command_not_acked"
  }
  if (rejection || !command) {
    const result = rejectedResult({
      selection: input.selection,
      observed,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: rejection ?? "yeonjang_smoke_command_mismatch",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }
  const acknowledged = transitionYeonjangLiveSmokeState(dispatched.state, "ACK")
  if (!acknowledged.ok) throw new Error(acknowledged.reasonCode)
  if (!observed.observedResult) {
    const result = rejectedResult({
      selection: input.selection,
      observed,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: "yeonjang_smoke_observed_result_missing",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }
  if (
    !observedMatches({
      observed: observed.observedResult,
      command,
      runId: input.runId,
      scenario: input.selection.scenario,
    })
  ) {
    const result = rejectedResult({
      selection: input.selection,
      observed,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: "yeonjang_smoke_observed_result_mismatch",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }
  const observation = transitionYeonjangLiveSmokeState(acknowledged.state, "OBSERVE")
  if (!observation.ok) throw new Error(observation.reasonCode)
  if (!exact(observed.auditEventId)) {
    const result = rejectedResult({
      selection: input.selection,
      observed,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: "yeonjang_smoke_audit_missing",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }

  checkCancelled(input.signal)
  const diagnosis = parseDiagnosis(
    await input.diagnose({
      runId: input.runId,
      scenario: input.selection.scenario,
      evidenceRef: observed.observedResult.evidenceRef,
      diagnosisPayload: observed.diagnosisPayload,
      signal: input.signal,
    }),
    observed.observedResult.evidenceRef,
  )
  checkCancelled(input.signal)
  if (!diagnosis) {
    const result = rejectedResult({
      selection: input.selection,
      observed,
      runId: input.runId,
      startedAt: itemStartedAt,
      finishedAt: input.now(),
      reasonCode: "yeonjang_smoke_llm_diagnosis_invalid",
    })
    return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
  }
  const verified = transitionYeonjangLiveSmokeState(observation.state, "VERIFY")
  if (!verified.ok) throw new Error(verified.reasonCode)
  const result: YeonjangLiveSmokeResult = {
    scenario: input.selection.scenario,
    state: verified.state,
    status: "passed",
    trace: {
      requestGroupId: input.runId,
      instance: input.selection.instance,
      command,
      observedResult: observed.observedResult,
      resultDiagnosis: diagnosis,
      auditEventId: observed.auditEventId,
      redactionStatus: "verified",
    },
    startedAt: itemStartedAt,
    finishedAt: input.now(),
  }
  return summary({ runId: input.runId, startedAt, finishedAt: input.now(), result })
}

export async function runYeonjangLiveSmokeScenarios(input: {
  readonly runId: string
  readonly selections: readonly YeonjangLiveSmokeSelection[]
  readonly execute: YeonjangLiveSmokeExecutePort
  readonly diagnose: YeonjangLiveSmokeDiagnosisPort
  readonly maxInstanceAgeMs: number
  readonly now: () => number
  readonly signal: AbortSignal
}): Promise<YeonjangLiveSmokeSummary> {
  if (!exact(input.runId)) fail("yeonjang_smoke_run_id_invalid")
  if (!Number.isFinite(input.maxInstanceAgeMs) || input.maxInstanceAgeMs <= 0) {
    fail("yeonjang_smoke_max_age_invalid")
  }
  checkCancelled(input.signal)
  const startedAt = input.now()
  const results: YeonjangLiveSmokeResult[] = []

  for (const selection of input.selections) {
    checkCancelled(input.signal)
    const summary = await runYeonjangLiveSmokeScenario({
      runId: input.runId,
      selection,
      execute: input.execute,
      diagnose: input.diagnose,
      maxInstanceAgeMs: input.maxInstanceAgeMs,
      now: input.now,
      signal: input.signal,
    })
    results.push(...summary.results)
  }

  return Object.freeze({
    kind: "yeonjang.live_smoke",
    mode: "live-run",
    runId: input.runId,
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    startedAt,
    finishedAt: input.now(),
    results: Object.freeze(results),
  })
}
