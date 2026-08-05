import type {
  WebRetrievalLiveDiagnosisReceipt,
  WebRetrievalLiveSmokeScenario,
  WebRetrievalLiveSmokeTrace,
  WebRetrievalLiveTargetBindingReceipt,
} from "./web-retrieval-smoke.js"
import type { WebRetrievalCandidate } from "../contracts/web-retrieval.js"
import type { WebDocumentFetchFailureReason } from "./web-document-fetch-port.js"
import type { WebSearchFailureReason } from "./web-search-port.js"
import {
  createWebRetrievalMachine,
  transitionWebRetrieval,
  type WebRetrievalEvent,
  type WebRetrievalMachine,
} from "./web-retrieval-state-machine.js"

export type WebRetrievalLiveRunnerErrorCode =
  | "web_live_run_id_invalid"
  | "web_live_cancelled"
  | "web_live_search_evidence_invalid"
  | "web_live_search_audit_missing"
  | "web_live_llm_source_selection_invalid"
  | "web_live_fetch_evidence_invalid"
  | "web_live_fetch_audit_missing"
  | "web_live_llm_result_diagnosis_invalid"
  | "web_live_rediagnosis_invalid"
  | "web_live_rediagnosis_blocked"
  | "web_live_rediagnosis_exhausted"
  | "web_live_rediagnosis_strategy_duplicate"

export class WebRetrievalLiveRunnerError extends Error {
  readonly code: WebRetrievalLiveRunnerErrorCode

  constructor(code: WebRetrievalLiveRunnerErrorCode) {
    super(code)
    this.name = "WebRetrievalLiveRunnerError"
    this.code = code
  }
}

export type WebRetrievalLiveFailureReasonCode =
  | WebRetrievalLiveRunnerErrorCode
  | WebSearchFailureReason
  | WebDocumentFetchFailureReason

export class WebRetrievalLivePortError extends Error {
  readonly reasonCode: WebRetrievalLiveFailureReasonCode

  constructor(reasonCode: WebRetrievalLiveFailureReasonCode) {
    super(reasonCode)
    this.name = "WebRetrievalLivePortError"
    this.reasonCode = reasonCode
  }
}

export type WebRetrievalLiveCandidate = WebRetrievalCandidate

export interface WebRetrievalLiveSearchObservation {
  readonly candidates: readonly WebRetrievalLiveCandidate[]
  readonly auditEventId: string | null
  readonly diagnosisPayload: unknown
}

export interface WebRetrievalLiveFetchObservation {
  readonly evidenceRef: string
  readonly sourceDomain: string
  readonly sourceTimestamp: string | null
  readonly fetchedAt: string
  readonly auditEventId: string | null
  readonly diagnosisPayload: unknown
}

export interface WebRetrievalLiveExecutionInput {
  readonly runId: string
  readonly scenario: WebRetrievalLiveSmokeScenario
  readonly searchRequest: string
  readonly signal: AbortSignal
}

export interface WebRetrievalLiveFetchInput extends WebRetrievalLiveExecutionInput {
  readonly candidate: WebRetrievalLiveCandidate
}

export interface WebRetrievalLivePlanInput extends WebRetrievalLiveExecutionInput {
  readonly candidates: readonly WebRetrievalLiveCandidate[]
  readonly diagnosisPayload: unknown
}

export interface WebRetrievalLiveDiagnosisInput extends WebRetrievalLiveExecutionInput {
  readonly evidenceRef: string
  readonly requestedTargetFingerprint: `sha256:${string}`
  readonly diagnosisPayload: unknown
}

export type WebRetrievalLiveSearchPort = (
  input: WebRetrievalLiveExecutionInput,
) => Promise<WebRetrievalLiveSearchObservation>
export type WebRetrievalLiveFetchPort = (
  input: WebRetrievalLiveFetchInput,
) => Promise<WebRetrievalLiveFetchObservation>
export type WebRetrievalLivePlanPort = (input: WebRetrievalLivePlanInput) => Promise<unknown>
export type WebRetrievalLiveDiagnosisPort = (
  input: WebRetrievalLiveDiagnosisInput,
) => Promise<unknown>

export type WebRetrievalFailureStage = "search" | "selection" | "fetch" | "verification"

export interface WebRetrievalLiveRediagnosisInput extends WebRetrievalLiveExecutionInput {
  readonly failure: Readonly<{
    stage: WebRetrievalFailureStage
    reasonCode: WebRetrievalLiveFailureReasonCode
  }>
  readonly attemptFingerprints: readonly string[]
  readonly diagnosisPayload: unknown
}

export type WebRetrievalLiveRediagnosisPort = (
  input: WebRetrievalLiveRediagnosisInput,
) => Promise<unknown>

interface WebRetrievalLiveRediagnosisReceipt {
  readonly diagnosedBy: "llm"
  readonly status: "retry" | "blocked"
  readonly contextFingerprint: `sha256:${string}`
  readonly nextAction?: Readonly<{
    kind: "search"
    searchRequest: string
    attemptFingerprint: `sha256:${string}`
  }>
}

interface WebRetrievalLivePlanReceipt {
  readonly diagnosedBy: "llm"
  readonly status: "selected"
  readonly contextFingerprint: `sha256:${string}`
  readonly selectedEvidenceRef: string
  readonly selectedSourceUrl: string
  readonly requestedTargetFingerprint: `sha256:${string}`
}

const SHA256 = /^sha256:[a-f0-9]{64}$/u
const REQUIRED_CRITERIA = ["existence", "accuracy", "freshness", "target_match"]

function exact(value: unknown, max = 2_048): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
}

function fail(code: WebRetrievalLiveRunnerErrorCode): never {
  throw new WebRetrievalLiveRunnerError(code)
}

function move(machine: WebRetrievalMachine, event: WebRetrievalEvent): WebRetrievalMachine {
  const moved = transitionWebRetrieval(machine, event)
  if (!moved.ok) {
    fail(
      moved.reasonCode === "web_retrieval_attempt_duplicate"
        ? "web_live_rediagnosis_strategy_duplicate"
        : "web_live_rediagnosis_invalid",
    )
  }
  return moved.value
}

function portFailureReason(
  value: unknown,
  fallback: WebRetrievalLiveRunnerErrorCode,
): WebRetrievalLiveFailureReasonCode {
  return value instanceof WebRetrievalLivePortError ? value.reasonCode : fallback
}

function failReason(code: WebRetrievalLiveFailureReasonCode): never {
  if (code.startsWith("web_live_")) fail(code as WebRetrievalLiveRunnerErrorCode)
  throw new WebRetrievalLivePortError(code)
}

function normalizedSearchStrategy(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase()
}

function validPublicUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      !parsed.username &&
      !parsed.password &&
      Boolean(parsed.hostname)
    )
  } catch {
    return false
  }
}

function validateCandidates(value: readonly WebRetrievalLiveCandidate[]): boolean {
  if (value.length === 0 || value.length > 16) return false
  const refs = new Set<string>()
  const urls = new Set<string>()
  for (const candidate of value) {
    if (
      !exact(candidate.evidenceRef) ||
      !exact(candidate.sourceUrl) ||
      !validPublicUrl(candidate.sourceUrl) ||
      !exact(candidate.sourceDomain, 256) ||
      !exact(candidate.fetchedAt, 128) ||
      (candidate.sourceTimestamp !== null && !exact(candidate.sourceTimestamp, 128)) ||
      refs.has(candidate.evidenceRef) ||
      urls.has(candidate.sourceUrl)
    ) {
      return false
    }
    refs.add(candidate.evidenceRef)
    urls.add(candidate.sourceUrl)
  }
  return true
}

function parsePlan(
  value: unknown,
  candidates: readonly WebRetrievalLiveCandidate[],
): { receipt: WebRetrievalLivePlanReceipt; candidate: WebRetrievalLiveCandidate } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Partial<WebRetrievalLivePlanReceipt>
  if (
    receipt.diagnosedBy !== "llm" ||
    receipt.status !== "selected" ||
    !SHA256.test(receipt.contextFingerprint ?? "") ||
    !exact(receipt.selectedEvidenceRef) ||
    !exact(receipt.selectedSourceUrl) ||
    !SHA256.test(receipt.requestedTargetFingerprint ?? "")
  ) {
    return null
  }
  const candidate = candidates.find(
    (item) =>
      item.evidenceRef === receipt.selectedEvidenceRef &&
      item.sourceUrl === receipt.selectedSourceUrl,
  )
  if (!candidate) return null
  return {
    receipt: Object.freeze({
      diagnosedBy: "llm",
      status: "selected",
      contextFingerprint: receipt.contextFingerprint as `sha256:${string}`,
      selectedEvidenceRef: candidate.evidenceRef,
      selectedSourceUrl: candidate.sourceUrl,
      requestedTargetFingerprint: receipt.requestedTargetFingerprint as `sha256:${string}`,
    }),
    candidate,
  }
}

function parseDiagnosis(
  value: unknown,
  evidenceRef: string,
  requestedTargetFingerprint: `sha256:${string}`,
  conditionCount: number,
): {
  diagnosis: WebRetrievalLiveDiagnosisReceipt
  targetBinding: WebRetrievalLiveTargetBindingReceipt
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Partial<WebRetrievalLiveDiagnosisReceipt> & {
    targetBinding?: Partial<WebRetrievalLiveTargetBindingReceipt>
  }
  const target = receipt.targetBinding
  if (
    receipt.diagnosedBy !== "llm" ||
    receipt.status !== "complete" ||
    !SHA256.test(receipt.contextFingerprint ?? "") ||
    !Array.isArray(receipt.criterionKeys) ||
    REQUIRED_CRITERIA.some((criterion) => !receipt.criterionKeys?.includes(criterion)) ||
    receipt.conditionCount !== conditionCount ||
    !Array.isArray(receipt.evidenceRefs) ||
    receipt.evidenceRefs.length !== 1 ||
    receipt.evidenceRefs[0] !== evidenceRef ||
    target?.status !== "verified" ||
    target.requestedTargetFingerprint !== requestedTargetFingerprint ||
    target.evidenceTargetFingerprint !== requestedTargetFingerprint
  ) {
    return null
  }
  return {
    diagnosis: Object.freeze({
      diagnosedBy: "llm",
      status: "complete",
      contextFingerprint: receipt.contextFingerprint as `sha256:${string}`,
      criterionKeys: Object.freeze([...receipt.criterionKeys]),
      conditionCount,
      evidenceRefs: Object.freeze([evidenceRef]),
    }),
    targetBinding: Object.freeze({
      status: "verified",
      requestedTargetFingerprint,
      evidenceTargetFingerprint: requestedTargetFingerprint,
    }),
  }
}

function parseRediagnosis(value: unknown): WebRetrievalLiveRediagnosisReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const receipt = value as Partial<WebRetrievalLiveRediagnosisReceipt>
  if (
    receipt.diagnosedBy !== "llm" ||
    (receipt.status !== "retry" && receipt.status !== "blocked") ||
    !SHA256.test(receipt.contextFingerprint ?? "")
  ) {
    return null
  }
  if (receipt.status === "blocked") {
    return Object.freeze({
      diagnosedBy: "llm",
      status: "blocked",
      contextFingerprint: receipt.contextFingerprint as `sha256:${string}`,
    })
  }
  const next = receipt.nextAction
  if (
    next?.kind !== "search" ||
    !exact(next.searchRequest) ||
    !SHA256.test(next.attemptFingerprint ?? "")
  ) {
    return null
  }
  return Object.freeze({
    diagnosedBy: "llm",
    status: "retry",
    contextFingerprint: receipt.contextFingerprint as `sha256:${string}`,
    nextAction: Object.freeze({
      kind: "search",
      searchRequest: next.searchRequest.trim(),
      attemptFingerprint: next.attemptFingerprint as `sha256:${string}`,
    }),
  })
}

export async function runWebRetrievalLiveScenario(input: {
  readonly runId: string
  readonly scenario: WebRetrievalLiveSmokeScenario
  readonly search: WebRetrievalLiveSearchPort
  readonly plan: WebRetrievalLivePlanPort
  readonly fetch: WebRetrievalLiveFetchPort
  readonly diagnose: WebRetrievalLiveDiagnosisPort
  readonly rediagnose?: WebRetrievalLiveRediagnosisPort | undefined
  readonly maxAttempts?: number
  readonly signal: AbortSignal
}): Promise<WebRetrievalLiveSmokeTrace> {
  if (!exact(input.runId, 256)) fail("web_live_run_id_invalid")
  const maxAttempts = input.maxAttempts ?? (input.rediagnose ? 3 : 1)
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 8) {
    fail("web_live_rediagnosis_invalid")
  }
  const baseExecutionInput = {
    runId: input.runId,
    scenario: input.scenario,
    signal: input.signal,
  }
  let machine = createWebRetrievalMachine()
  const ensureActive = (): void => {
    if (!input.signal.aborted) return
    machine = move(machine, { type: "cancelled" })
    fail("web_live_cancelled")
  }
  ensureActive()
  let searchRequest = input.scenario.request
  let searchAttemptCount = 1
  const attemptedSearchRequests = new Set([normalizedSearchStrategy(searchRequest)])
  machine = move(machine, {
    type: "search_planned",
    attemptFingerprint: `initial:${input.scenario.id}`,
  })

  const retry = async (failure: {
    stage: WebRetrievalFailureStage
    reasonCode: WebRetrievalLiveFailureReasonCode
    diagnosisPayload: unknown
    eventType: "search_failed" | "fetch_failed" | "verification_failed"
  }): Promise<void> => {
    machine = move(machine, { type: failure.eventType, reasonCode: failure.reasonCode })
    if (!input.rediagnose) failReason(failure.reasonCode)
    if (searchAttemptCount >= maxAttempts) {
      machine = move(machine, {
        type: "blocked",
        reasonCode: "web_live_rediagnosis_exhausted",
      })
      fail("web_live_rediagnosis_exhausted")
    }
    ensureActive()
    const receipt = parseRediagnosis(
      await input.rediagnose({
        ...baseExecutionInput,
        searchRequest,
        failure: Object.freeze({
          stage: failure.stage,
          reasonCode: failure.reasonCode,
        }),
        attemptFingerprints: Object.freeze([...machine.attemptFingerprints]),
        diagnosisPayload: failure.diagnosisPayload,
      }),
    )
    ensureActive()
    if (!receipt) {
      machine = move(machine, { type: "blocked", reasonCode: "web_live_rediagnosis_invalid" })
      fail("web_live_rediagnosis_invalid")
    }
    if (receipt.status === "blocked" || !receipt.nextAction) {
      machine = move(machine, { type: "blocked", reasonCode: "web_live_rediagnosis_blocked" })
      fail("web_live_rediagnosis_blocked")
    }
    const normalizedStrategy = normalizedSearchStrategy(receipt.nextAction.searchRequest)
    if (attemptedSearchRequests.has(normalizedStrategy)) {
      machine = move(machine, {
        type: "blocked",
        reasonCode: "web_live_rediagnosis_strategy_duplicate",
      })
      fail("web_live_rediagnosis_strategy_duplicate")
    }
    machine = move(machine, {
      type: "search_planned",
      attemptFingerprint: receipt.nextAction.attemptFingerprint,
    })
    searchRequest = receipt.nextAction.searchRequest
    attemptedSearchRequests.add(normalizedStrategy)
    searchAttemptCount += 1
  }

  for (;;) {
    const executionInput = { ...baseExecutionInput, searchRequest }
    machine = move(machine, { type: "search_started" })
    let search: WebRetrievalLiveSearchObservation
    try {
      search = await input.search(executionInput)
    } catch (error) {
      ensureActive()
      await retry({
        stage: "search",
        reasonCode: portFailureReason(error, "web_live_search_evidence_invalid"),
        diagnosisPayload: null,
        eventType: "search_failed",
      })
      continue
    }
    ensureActive()
    if (!validateCandidates(search.candidates)) {
      await retry({
        stage: "search",
        reasonCode: "web_live_search_evidence_invalid",
        diagnosisPayload: search.diagnosisPayload,
        eventType: "search_failed",
      })
      continue
    }
    if (!exact(search.auditEventId)) {
      await retry({
        stage: "search",
        reasonCode: "web_live_search_audit_missing",
        diagnosisPayload: search.diagnosisPayload,
        eventType: "search_failed",
      })
      continue
    }
    machine = move(machine, { type: "search_succeeded" })

    const planned = parsePlan(
      await input.plan({
        ...executionInput,
        candidates: Object.freeze(search.candidates.map((item) => Object.freeze({ ...item }))),
        diagnosisPayload: search.diagnosisPayload,
      }),
      search.candidates,
    )
    ensureActive()
    if (!planned) {
      await retry({
        stage: "selection",
        reasonCode: "web_live_llm_source_selection_invalid",
        diagnosisPayload: search.diagnosisPayload,
        eventType: "verification_failed",
      })
      continue
    }

    const fetchPlan = transitionWebRetrieval(machine, {
      type: "fetch_planned",
      attemptFingerprint: `fetch:${planned.candidate.evidenceRef}`,
    })
    if (!fetchPlan.ok) {
      await retry({
        stage: "selection",
        reasonCode: "web_live_llm_source_selection_invalid",
        diagnosisPayload: search.diagnosisPayload,
        eventType: "verification_failed",
      })
      continue
    }
    machine = fetchPlan.value
    machine = move(machine, { type: "fetch_started" })
    let fetched: WebRetrievalLiveFetchObservation
    try {
      fetched = await input.fetch({ ...executionInput, candidate: planned.candidate })
    } catch (error) {
      ensureActive()
      await retry({
        stage: "fetch",
        reasonCode: portFailureReason(error, "web_live_fetch_evidence_invalid"),
        diagnosisPayload: null,
        eventType: "fetch_failed",
      })
      continue
    }
    ensureActive()
    if (
      !exact(fetched.evidenceRef) ||
      !exact(fetched.sourceDomain, 256) ||
      !exact(fetched.sourceTimestamp, 128) ||
      !exact(fetched.fetchedAt, 128)
    ) {
      await retry({
        stage: "fetch",
        reasonCode: "web_live_fetch_evidence_invalid",
        diagnosisPayload: fetched.diagnosisPayload,
        eventType: "fetch_failed",
      })
      continue
    }
    if (!exact(fetched.auditEventId)) {
      await retry({
        stage: "fetch",
        reasonCode: "web_live_fetch_audit_missing",
        diagnosisPayload: fetched.diagnosisPayload,
        eventType: "fetch_failed",
      })
      continue
    }
    machine = move(machine, { type: "fetch_succeeded" })
    machine = move(machine, { type: "verification_started" })

    const diagnosed = parseDiagnosis(
      await input.diagnose({
        ...executionInput,
        evidenceRef: fetched.evidenceRef,
        requestedTargetFingerprint: planned.receipt.requestedTargetFingerprint,
        diagnosisPayload: fetched.diagnosisPayload,
      }),
      fetched.evidenceRef,
      planned.receipt.requestedTargetFingerprint,
      input.scenario.completionConditions.length,
    )
    ensureActive()
    if (!diagnosed) {
      await retry({
        stage: "verification",
        reasonCode: "web_live_llm_result_diagnosis_invalid",
        diagnosisPayload: fetched.diagnosisPayload,
        eventType: "verification_failed",
      })
      continue
    }
    machine = move(machine, { type: "verification_completed" })

    return Object.freeze({
      attemptedMethods: Object.freeze(["fast_text_search", "direct_fetch"]),
      sourceDomains: Object.freeze([fetched.sourceDomain]),
      answerProduced: machine.state === "COMPLETED",
      resultDiagnosis: diagnosed.diagnosis,
      liveAcceptance: Object.freeze({
        auditEventId: fetched.auditEventId,
        redactionStatus: "verified",
        targetBinding: diagnosed.targetBinding,
        sourceEvidence: Object.freeze([
          Object.freeze({
            evidenceRef: fetched.evidenceRef,
            sourceDomain: fetched.sourceDomain,
            sourceTimestamp: fetched.sourceTimestamp,
            fetchedAt: fetched.fetchedAt,
          }),
        ]),
      }),
      finalText: null,
    })
  }
}
