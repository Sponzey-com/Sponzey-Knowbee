import {
  type ExtensionLiveCapability,
  type ExtensionLiveResultDiagnosisReceipt,
  type ExtensionLiveSmokeResult,
  type ExtensionLiveSmokeScenario,
  type ExtensionLiveSmokeSummary,
  type ExtensionLiveToolExecutionReceipt,
  transitionExtensionLiveSmokeState,
} from "./extension-live-smoke.js"

export type ExtensionLiveSmokeRunnerErrorCode =
  | "extension_smoke_run_id_invalid"
  | "extension_smoke_scenario_set_invalid"
  | "extension_smoke_read_only_required"
  | "extension_smoke_cancelled"

export type ExtensionLiveSmokeRejectionCode =
  | "extension_smoke_execution_failed"
  | "extension_smoke_tool_receipt_invalid"
  | "extension_smoke_audit_missing"
  | "extension_smoke_llm_diagnosis_invalid"

export class ExtensionLiveSmokeRunnerError extends Error {
  readonly code: ExtensionLiveSmokeRunnerErrorCode

  constructor(code: ExtensionLiveSmokeRunnerErrorCode) {
    super(code)
    this.name = "ExtensionLiveSmokeRunnerError"
    this.code = code
  }
}

export interface ExtensionLiveAuthorizationReceipt {
  readonly snapshotCapturedAt: number
  readonly capability: ExtensionLiveCapability
  readonly agentId: string
  readonly bindingId: string
  readonly catalogId: string
  readonly toolName: string
  readonly secretScopeId?: string
}

export interface ExtensionLiveSmokeSelection {
  readonly scenario: ExtensionLiveSmokeScenario
  readonly params: Readonly<Record<string, unknown>>
  readonly authorization: ExtensionLiveAuthorizationReceipt
}

export interface ExtensionLiveObservedExecution {
  readonly toolExecution: ExtensionLiveToolExecutionReceipt
  readonly auditEventId: string | null
  readonly diagnosisPayload: unknown
}

export interface ExtensionLiveSmokeExecutionInput {
  readonly runId: string
  readonly selection: ExtensionLiveSmokeSelection
  readonly signal: AbortSignal
}

export interface ExtensionLiveSmokeDiagnosisInput {
  readonly runId: string
  readonly scenario: ExtensionLiveSmokeScenario
  readonly evidenceRef: string
  readonly diagnosisPayload: unknown
  readonly signal: AbortSignal
}

export type ExtensionLiveSmokeExecutePort = (
  input: ExtensionLiveSmokeExecutionInput,
) => Promise<ExtensionLiveObservedExecution>

export type ExtensionLiveSmokeDiagnosisPort = (
  input: ExtensionLiveSmokeDiagnosisInput,
) => Promise<unknown>

const REQUIRED_CAPABILITIES: readonly ExtensionLiveCapability[] = ["skill", "mcp"]
const REQUIRED_CRITERIA = ["existence", "accuracy", "target_match", "constraint_compliance"]
const SHA256 = /^sha256:[a-f0-9]{64}$/u

function exact(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256
}

function fail(code: ExtensionLiveSmokeRunnerErrorCode): never {
  throw new ExtensionLiveSmokeRunnerError(code)
}

function validateSelections(selections: readonly ExtensionLiveSmokeSelection[]): void {
  if (selections.length !== REQUIRED_CAPABILITIES.length) {
    fail("extension_smoke_scenario_set_invalid")
  }
  const capabilities = selections.map((item) => item.scenario.capability)
  const ids = selections.map((item) => item.scenario.id)
  if (
    new Set(capabilities).size !== REQUIRED_CAPABILITIES.length ||
    REQUIRED_CAPABILITIES.some((capability) => !capabilities.includes(capability)) ||
    new Set(ids).size !== ids.length ||
    selections.some(
      ({ scenario, params, authorization }) =>
        !exact(scenario.id) ||
        !exact(scenario.expectedAgentId) ||
        !exact(scenario.expectedBindingId) ||
        !exact(scenario.expectedCatalogId) ||
        !exact(scenario.expectedToolName) ||
        !params ||
        typeof params !== "object" ||
        Array.isArray(params) ||
        !authorization ||
        !Number.isSafeInteger(authorization.snapshotCapturedAt) ||
        authorization.snapshotCapturedAt < 0 ||
        authorization.capability !== scenario.capability ||
        authorization.agentId !== scenario.expectedAgentId ||
        authorization.bindingId !== scenario.expectedBindingId ||
        authorization.catalogId !== scenario.expectedCatalogId ||
        authorization.toolName !== scenario.expectedToolName ||
        (scenario.capability === "mcp" && !exact(authorization.secretScopeId)),
    )
  ) {
    fail("extension_smoke_scenario_set_invalid")
  }
  if (selections.some(({ scenario }) => !scenario.readOnly)) {
    fail("extension_smoke_read_only_required")
  }
}

function receiptMatches(
  receipt: ExtensionLiveToolExecutionReceipt,
  runId: string,
  scenario: ExtensionLiveSmokeScenario,
): boolean {
  return (
    receipt.runId === runId &&
    receipt.requestGroupId === runId &&
    receipt.capability === scenario.capability &&
    receipt.agentId === scenario.expectedAgentId &&
    receipt.bindingId === scenario.expectedBindingId &&
    receipt.catalogId === scenario.expectedCatalogId &&
    receipt.toolName === scenario.expectedToolName &&
    receipt.status === "succeeded" &&
    receipt.executionObserved === true &&
    exact(receipt.evidenceRef)
  )
}

function parseDiagnosis(
  value: unknown,
  evidenceRef: string,
): ExtensionLiveResultDiagnosisReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Partial<ExtensionLiveResultDiagnosisReceipt>
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

function rejectedResult(input: {
  selection: ExtensionLiveSmokeSelection
  startedAt: number
  finishedAt: number
  reasonCode: ExtensionLiveSmokeRejectionCode
  runId: string
  observed?: ExtensionLiveObservedExecution
}): ExtensionLiveSmokeResult {
  return {
    scenario: input.selection.scenario,
    state: "rejected",
    status: "failed",
    reasonCode: input.reasonCode,
    trace: {
      requestGroupId: input.runId,
      selectedCapability: input.selection.scenario.capability,
      selectedAgentId: input.selection.scenario.expectedAgentId,
      selectedBindingId: input.selection.scenario.expectedBindingId,
      selectedCatalogId: input.selection.scenario.expectedCatalogId,
      discoveryOnly: false,
      ...(input.observed?.toolExecution ? { toolExecution: input.observed.toolExecution } : {}),
      ...(input.observed?.auditEventId ? { auditEventId: input.observed.auditEventId } : {}),
      redactionStatus: "verified",
    },
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  }
}

function checkCancelled(signal: AbortSignal): void {
  if (signal.aborted) fail("extension_smoke_cancelled")
}

export async function runExtensionLiveSmokeScenarios(input: {
  readonly runId: string
  readonly selections: readonly ExtensionLiveSmokeSelection[]
  readonly execute: ExtensionLiveSmokeExecutePort
  readonly diagnose: ExtensionLiveSmokeDiagnosisPort
  readonly now: () => number
  readonly signal: AbortSignal
}): Promise<ExtensionLiveSmokeSummary> {
  if (!exact(input.runId)) fail("extension_smoke_run_id_invalid")
  validateSelections(input.selections)
  checkCancelled(input.signal)
  const startedAt = input.now()
  const results: ExtensionLiveSmokeResult[] = []

  for (const selection of input.selections) {
    checkCancelled(input.signal)
    const itemStartedAt = input.now()
    const started = transitionExtensionLiveSmokeState("prepared", "START")
    if (!started.ok) throw new Error(started.reasonCode)
    let observed: ExtensionLiveObservedExecution
    try {
      observed = await input.execute({ runId: input.runId, selection, signal: input.signal })
    } catch {
      results.push(
        rejectedResult({
          selection,
          runId: input.runId,
          startedAt: itemStartedAt,
          finishedAt: input.now(),
          reasonCode: "extension_smoke_execution_failed",
        }),
      )
      continue
    }
    checkCancelled(input.signal)
    const observation = transitionExtensionLiveSmokeState(started.state, "OBSERVE")
    if (!observation.ok) throw new Error(observation.reasonCode)
    if (!receiptMatches(observed.toolExecution, input.runId, selection.scenario)) {
      results.push(
        rejectedResult({
          selection,
          observed,
          runId: input.runId,
          startedAt: itemStartedAt,
          finishedAt: input.now(),
          reasonCode: "extension_smoke_tool_receipt_invalid",
        }),
      )
      continue
    }
    if (!exact(observed.auditEventId)) {
      results.push(
        rejectedResult({
          selection,
          observed,
          runId: input.runId,
          startedAt: itemStartedAt,
          finishedAt: input.now(),
          reasonCode: "extension_smoke_audit_missing",
        }),
      )
      continue
    }

    checkCancelled(input.signal)
    const diagnosis = parseDiagnosis(
      await input.diagnose({
        runId: input.runId,
        scenario: selection.scenario,
        evidenceRef: observed.toolExecution.evidenceRef,
        diagnosisPayload: observed.diagnosisPayload,
        signal: input.signal,
      }),
      observed.toolExecution.evidenceRef,
    )
    checkCancelled(input.signal)
    if (!diagnosis) {
      results.push(
        rejectedResult({
          selection,
          observed,
          runId: input.runId,
          startedAt: itemStartedAt,
          finishedAt: input.now(),
          reasonCode: "extension_smoke_llm_diagnosis_invalid",
        }),
      )
      continue
    }
    const verified = transitionExtensionLiveSmokeState(observation.state, "VERIFY")
    if (!verified.ok) throw new Error(verified.reasonCode)
    results.push({
      scenario: selection.scenario,
      state: verified.state,
      status: "passed",
      trace: {
        requestGroupId: input.runId,
        selectedCapability: selection.scenario.capability,
        selectedAgentId: selection.scenario.expectedAgentId,
        selectedBindingId: selection.scenario.expectedBindingId,
        selectedCatalogId: selection.scenario.expectedCatalogId,
        discoveryOnly: false,
        toolExecution: observed.toolExecution,
        resultDiagnosis: diagnosis,
        auditEventId: observed.auditEventId,
        redactionStatus: "verified",
      },
      startedAt: itemStartedAt,
      finishedAt: input.now(),
    })
  }

  const finishedAt = input.now()
  return Object.freeze({
    kind: "extension.live_smoke",
    mode: "live-run",
    runId: input.runId,
    status: results.every((result) => result.status === "passed") ? "passed" : "failed",
    startedAt,
    finishedAt,
    results: Object.freeze(results),
  })
}
