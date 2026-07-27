import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, join, resolve } from "node:path"
import { type ArtifactStorageContext, recordArtifactMetadata } from "../artifacts/lifecycle.js"
import { insertDiagnosticEvent } from "../db/index.js"

export const WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION = 2
export const WEB_RETRIEVAL_EVIDENCE_CONTRACT_VERSION = "web-evidence-llm-diagnosis-v2"

export type WebRetrievalSmokeStatus = "passed" | "failed" | "skipped" | "warning"
export type WebRetrievalLiveSmokeMode = "dry-run" | "live-run"

export interface WebRetrievalFixtureTargetInput {
  kind?: string
  rawQuery?: string | null
  canonicalName?: string | null
  symbols?: string[]
  market?: string | null
  locationName?: string | null
  locale?: string | null
}

export interface WebRetrievalFixtureSource {
  id: string
  method: string
  status?: "succeeded" | "failed"
  toolName?: string | null
  sourceKind: string
  reliability: string
  sourceUrl?: string | null
  sourceDomain?: string | null
  sourceLabel?: string | null
  sourceTimestamp?: string | null
  fetchTimestamp?: string | null
  inputKind: string
  content?: unknown
  errorKind?: string | null
  stopReason?: string | null
}

export interface WebRetrievalLlmDiagnosisExpectation {
  status: "complete" | "followup" | "ask_user"
  requiredEvidenceSourceIds: string[]
  requiredConditionVerdicts: string[]
  changedStrategyRequired: boolean
}

export interface WebRetrievalFixtureExpected {
  minimumAttempts: number
  llmDiagnosisExpectation: WebRetrievalLlmDiagnosisExpectation
}

export interface WebRetrievalFixture {
  schemaVersion: number
  id: string
  title: string
  freshnessPolicy: string
  target: WebRetrievalFixtureTargetInput
  sources: WebRetrievalFixtureSource[]
  expected: WebRetrievalFixtureExpected
}

export interface WebRetrievalFixtureRegressionResult {
  fixtureId: string
  title: string
  status: WebRetrievalSmokeStatus
  failures: string[]
  attempts: number
  successfulSourceCount: number
  evidenceSourceIds: string[]
  llmDiagnosisExpectation: WebRetrievalLlmDiagnosisExpectation
  sanitizedSummary: string
}

export interface WebRetrievalFixtureRegressionSummary {
  kind: "web_retrieval.provenance_fixture_regression"
  policyVersion: string
  startedAt: string
  finishedAt: string
  status: WebRetrievalSmokeStatus
  counts: { total: number; passed: number; failed: number; skipped: number }
  results: WebRetrievalFixtureRegressionResult[]
}

export interface WebRetrievalLiveSmokeScenario {
  id: string
  title: string
  request: string
  target: WebRetrievalFixtureTargetInput
  freshnessPolicy: string
  minimumMethods: string[]
  completionConditions: string[]
}

export interface WebRetrievalLiveDiagnosisReceipt {
  diagnosedBy: "llm" | "fixture"
  status: "complete" | "followup" | "ask_user"
  contextFingerprint: `sha256:${string}`
  criterionKeys: readonly string[]
  conditionCount: number
  evidenceRefs: readonly string[]
}

export interface WebRetrievalLiveSourceEvidenceReceipt {
  evidenceRef: string
  sourceDomain: string
  sourceTimestamp: string
  fetchedAt: string
}

export interface WebRetrievalLiveTargetBindingReceipt {
  status: "verified" | "unverified"
  requestedTargetFingerprint: `sha256:${string}`
  evidenceTargetFingerprint: `sha256:${string}`
}

export interface WebRetrievalLiveAcceptanceReceipt {
  auditEventId: string
  redactionStatus: "verified" | "unverified"
  targetBinding: WebRetrievalLiveTargetBindingReceipt
  sourceEvidence: readonly WebRetrievalLiveSourceEvidenceReceipt[]
}

export interface WebRetrievalLiveSmokeTrace {
  attemptedMethods: readonly string[]
  sourceDomains?: readonly string[]
  answerProduced: boolean
  resultDiagnosis?: WebRetrievalLiveDiagnosisReceipt | null
  liveAcceptance?: WebRetrievalLiveAcceptanceReceipt | null
  finalText?: string | null
  artifactPath?: string | null
  rawError?: string | null
  skipped?: boolean
  skipReason?: string
}

export interface WebRetrievalLiveSmokeResult {
  scenario: WebRetrievalLiveSmokeScenario
  status: WebRetrievalSmokeStatus
  failures: string[]
  reason?: string
  trace?: WebRetrievalLiveSmokeTrace
  startedAt: string
  finishedAt: string
}

export interface WebRetrievalLiveSmokeSummary {
  kind: "web_retrieval.live_smoke"
  mode: WebRetrievalLiveSmokeMode
  smokeId: string
  policyVersion: string
  startedAt: string
  finishedAt: string
  status: WebRetrievalSmokeStatus
  artifactPath?: string | null
  diagnosticEventId?: string | null
  counts: { total: number; passed: number; failed: number; skipped: number }
  results: WebRetrievalLiveSmokeResult[]
}

export interface WebRetrievalReleaseGateSummary {
  kind: "web_retrieval.release_gate"
  policyVersion: string
  fixtureRegression: Pick<
    WebRetrievalFixtureRegressionSummary,
    "status" | "counts" | "results"
  > | null
  liveSmoke: Pick<
    WebRetrievalLiveSmokeSummary,
    "mode" | "smokeId" | "status" | "counts" | "artifactPath"
  > | null
  gateStatus: "passed" | "failed" | "warning"
  blockingFailures: string[]
  warnings: string[]
}

const EMPTY_ENV: Record<string, string | undefined> = Object.freeze({})
const LOCAL_PATH = /(?:\/Users\/[^\s"')]+|\/tmp\/[^\s"')]+|[A-Za-z]:\\[^\s"']+)/gu
const SECRET = /(Bearer\s+[A-Za-z0-9._~+/=-]+|xox[abpr]-[A-Za-z0-9-]+|\bsk-[A-Za-z0-9_-]{12,})/giu

function nowIso(now = new Date()): string {
  return now.toISOString()
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function sanitizeText(value: string): string {
  const text = value.replace(SECRET, "[secret hidden]").replace(LOCAL_PATH, "[local path hidden]")
  if (/(<!doctype\s+html|<html\b|<script\b|<body\b)/iu.test(text)) return "[html content hidden]"
  return text.length > 1_000 ? `${text.slice(0, 990)}...` : text
}

function sanitizeValue<T>(value: T): T {
  if (typeof value === "string") return sanitizeText(value) as T
  if (Array.isArray(value)) return value.map(sanitizeValue) as T
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        /token|secret|authorization|cookie|api[_-]?key|password|credential|raw/iu.test(key)
          ? "***"
          : sanitizeValue(item),
      ]),
    ) as T
  }
  return value
}

export function loadWebRetrievalFixturesFromDir(dir: string): WebRetrievalFixture[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => JSON.parse(readFileSync(join(dir, entry.name), "utf8")) as WebRetrievalFixture)
}

function validateFixture(fixture: WebRetrievalFixture): WebRetrievalFixtureRegressionResult {
  const failures: string[] = []
  const ids = fixture.sources.map((source) => source.id.trim()).filter(Boolean)
  const uniqueIds = new Set(ids)
  const expectation = fixture.expected?.llmDiagnosisExpectation
  if (fixture.schemaVersion !== WEB_RETRIEVAL_FIXTURE_SCHEMA_VERSION)
    failures.push("fixture_schema_version_mismatch")
  if (ids.length !== fixture.sources.length || uniqueIds.size !== ids.length)
    failures.push("evidence_source_id_invalid")
  if (!expectation) failures.push("llm_diagnosis_expectation_missing")
  const requiredIds = expectation?.requiredEvidenceSourceIds ?? []
  if (requiredIds.some((id) => !uniqueIds.has(id)))
    failures.push("required_evidence_source_missing")
  const attempts = fixture.sources.length
  if (attempts < (fixture.expected?.minimumAttempts ?? 1))
    failures.push(`minimum_attempts_not_met:${attempts}`)
  if (expectation?.status === "complete" && requiredIds.length === 0)
    failures.push("complete_expectation_evidence_missing")
  if (expectation?.status !== "complete" && !expectation?.changedStrategyRequired)
    failures.push("followup_strategy_change_missing")
  const successfulSourceCount = fixture.sources.filter(
    (source) => (source.status ?? "succeeded") === "succeeded",
  ).length
  const status = failures.length > 0 ? "failed" : "passed"
  return {
    fixtureId: fixture.id,
    title: fixture.title,
    status,
    failures,
    attempts,
    successfulSourceCount,
    evidenceSourceIds: ids,
    llmDiagnosisExpectation: expectation ?? {
      status: "followup",
      requiredEvidenceSourceIds: [],
      requiredConditionVerdicts: [],
      changedStrategyRequired: true,
    },
    sanitizedSummary: sanitizeText(`${fixture.id}: ${status}; sources=${ids.length}`),
  }
}

export function runWebRetrievalFixtureRegression(
  fixtures: WebRetrievalFixture[],
  input: { startedAt?: Date; finishedAt?: Date } = {},
): WebRetrievalFixtureRegressionSummary {
  const results = fixtures.map(validateFixture)
  const counts = {
    total: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: 0,
  }
  return {
    kind: "web_retrieval.provenance_fixture_regression",
    policyVersion: WEB_RETRIEVAL_EVIDENCE_CONTRACT_VERSION,
    startedAt: nowIso(input.startedAt),
    finishedAt: nowIso(input.finishedAt),
    status: counts.failed > 0 ? "failed" : counts.passed > 0 ? "passed" : "skipped",
    counts,
    results,
  }
}

function scenario(id: string, title: string, request: string): WebRetrievalLiveSmokeScenario {
  return {
    id,
    title,
    request,
    target: { rawQuery: request },
    freshnessPolicy: "latest_approximate",
    minimumMethods: ["fast_text_search", "direct_fetch"],
    completionConditions: ["requested current value, target, source and basis time are verified"],
  }
}

export function getDefaultWebRetrievalLiveSmokeScenarios(): WebRetrievalLiveSmokeScenario[] {
  return [
    scenario("kospi", "KOSPI current evidence", "지금 코스피 지수 얼마야"),
    scenario("kosdaq", "KOSDAQ current evidence", "지금 코스닥 지수 알려줘"),
    scenario("nasdaq", "NASDAQ current evidence", "지금 나스닥 지수 얼마야"),
    scenario("weather", "Current weather evidence", "지금 동천동 날씨 어때"),
  ]
}

export function isLiveWebSmokeEnabled(
  env: Record<string, string | undefined> = EMPTY_ENV,
): boolean {
  return env.KNOWBEE_LIVE_WEB_SMOKE === "1"
}

export function createDryRunWebRetrievalLiveSmokeExecutor(
  input: {
    traceOverrides?: Record<string, Partial<WebRetrievalLiveSmokeTrace>>
  } = {},
): (scenario: WebRetrievalLiveSmokeScenario) => Promise<WebRetrievalLiveSmokeTrace> {
  return async (item) => ({
    attemptedMethods: [...item.minimumMethods],
    sourceDomains: ["fixture.example"],
    answerProduced: true,
    resultDiagnosis: {
      diagnosedBy: "fixture",
      status: "complete",
      contextFingerprint: `sha256:${hash(item)}`,
      criterionKeys: ["existence", "accuracy", "completeness", "freshness", "target_match"],
      conditionCount: item.completionConditions.length,
      evidenceRefs: [`tool-result:tool:${hash({ id: item.id, source: "fixture" })}`],
    },
    finalText: `${item.title} dry-run receipt verified`,
    ...(input.traceOverrides?.[item.id] ?? {}),
  })
}

export function validateWebRetrievalLiveSmokeTrace(
  scenario: WebRetrievalLiveSmokeScenario,
  trace: WebRetrievalLiveSmokeTrace,
): string[] {
  if (trace.skipped) return []
  const failures: string[] = []
  for (const method of scenario.minimumMethods) {
    if (!trace.attemptedMethods.includes(method)) failures.push(`minimum_method_missing:${method}`)
  }
  const receipt = trace.resultDiagnosis
  if (!receipt) failures.push("llm_result_diagnosis_receipt_missing")
  if (receipt && !/^sha256:[a-f0-9]{64}$/u.test(receipt.contextFingerprint))
    failures.push("diagnosis_context_fingerprint_invalid")
  if (receipt && receipt.conditionCount !== scenario.completionConditions.length)
    failures.push("diagnosis_condition_coverage_mismatch")
  if (receipt?.status === "complete" && receipt.evidenceRefs.length === 0)
    failures.push("diagnosis_evidence_refs_missing")
  if (trace.answerProduced && receipt?.status !== "complete")
    failures.push("answer_without_complete_llm_diagnosis")
  if (
    /(<!doctype\s+html|<html\b|<script\b|Bearer\s+|\bsk-|\/Users\/|\/tmp\/)/iu.test(
      JSON.stringify(trace),
    )
  ) {
    failures.push("unsanitized_trace_payload")
  }
  return failures
}

export async function runWebRetrievalLiveSmokeScenarios(
  input: {
    artifactStorage?: ArtifactStorageContext
    mode?: WebRetrievalLiveSmokeMode
    scenarios?: WebRetrievalLiveSmokeScenario[]
    executeScenario?: (
      scenario: WebRetrievalLiveSmokeScenario,
    ) => Promise<WebRetrievalLiveSmokeTrace>
    env?: NodeJS.ProcessEnv
    liveEnabled?: boolean
    writeArtifact?: boolean
    now?: Date
    clock?: () => Date
  } = {},
): Promise<WebRetrievalLiveSmokeSummary> {
  const mode = input.mode ?? "dry-run"
  const scenarios = input.scenarios ?? getDefaultWebRetrievalLiveSmokeScenarios()
  const clock = input.clock ?? (() => new Date())
  const startedAt = nowIso(input.now ?? clock())
  const smokeId = `web-smoke:${hash({ startedAt, mode, scenarios: scenarios.map((item) => item.id) }).slice(0, 16)}`
  const execute =
    input.executeScenario ??
    (mode === "dry-run" ? createDryRunWebRetrievalLiveSmokeExecutor() : null)
  const results: WebRetrievalLiveSmokeResult[] = []
  for (const item of scenarios) {
    const itemStartedAt = nowIso(clock())
    if (
      mode === "live-run" &&
      !(
        input.liveEnabled === true ||
        (input.liveEnabled === undefined && isLiveWebSmokeEnabled(input.env))
      )
    ) {
      results.push({
        scenario: item,
        status: "skipped",
        failures: [],
        reason: "live_web_smoke_disabled",
        startedAt: itemStartedAt,
        finishedAt: nowIso(clock()),
      })
      continue
    }
    if (!execute) {
      results.push({
        scenario: item,
        status: "failed",
        failures: ["live_executor_missing"],
        reason: "live_executor_missing",
        startedAt: itemStartedAt,
        finishedAt: nowIso(clock()),
      })
      continue
    }
    try {
      const trace = sanitizeValue(await execute(item))
      const failures = validateWebRetrievalLiveSmokeTrace(item, trace)
      results.push({
        scenario: item,
        status: failures.length ? "failed" : "passed",
        failures,
        ...(failures[0] ? { reason: failures[0] } : {}),
        trace,
        startedAt: itemStartedAt,
        finishedAt: nowIso(clock()),
      })
    } catch (error) {
      results.push({
        scenario: item,
        status: "failed",
        failures: ["scenario_execution_failed"],
        reason: sanitizeText(error instanceof Error ? error.message : String(error)),
        startedAt: itemStartedAt,
        finishedAt: nowIso(clock()),
      })
    }
  }
  const counts = {
    total: results.length,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    skipped: results.filter((item) => item.status === "skipped").length,
  }
  const summary: WebRetrievalLiveSmokeSummary = {
    kind: "web_retrieval.live_smoke",
    mode,
    smokeId,
    policyVersion: WEB_RETRIEVAL_EVIDENCE_CONTRACT_VERSION,
    startedAt,
    finishedAt: nowIso(clock()),
    status: counts.failed ? "failed" : counts.passed ? "passed" : "skipped",
    counts,
    results,
  }
  if (input.writeArtifact) {
    if (!input.artifactStorage)
      throw new Error("web retrieval smoke artifact storage context is required")
    return writeWebRetrievalSmokeArtifact(summary, input.artifactStorage)
  }
  return summary
}

export function writeWebRetrievalSmokeArtifact(
  summary: WebRetrievalLiveSmokeSummary,
  artifactStorage: ArtifactStorageContext,
): WebRetrievalLiveSmokeSummary {
  const root = join(artifactStorage.rootDir, "web-retrieval-smoke")
  mkdirSync(root, { recursive: true })
  const artifactPath = join(root, `${summary.smokeId.replace(/[^A-Za-z0-9_.-]/gu, "-")}.json`)
  writeFileSync(artifactPath, `${JSON.stringify(sanitizeValue(summary), null, 2)}\n`, "utf8")
  let diagnosticEventId: string | null = null
  try {
    const artifactId = recordArtifactMetadata(
      {
        artifactPath,
        mimeType: "application/json",
        sourceRunId: null,
        requestGroupId: null,
        ownerChannel: "web_retrieval_smoke",
        channelTarget: null,
        retentionPolicy: "standard",
        metadata: { kind: summary.kind, mode: summary.mode, status: summary.status },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      artifactStorage,
    )
    diagnosticEventId = insertDiagnosticEvent({
      kind: "web_retrieval_live_smoke",
      summary: `Web retrieval live smoke ${summary.status}.`,
      detail: { artifactId, smokeId: summary.smokeId, counts: summary.counts },
    })
  } catch {
    diagnosticEventId = null
  }
  return { ...summary, artifactPath, diagnosticEventId }
}

export function buildWebRetrievalReleaseGateSummary(
  input: {
    fixtureRegression?: WebRetrievalFixtureRegressionSummary | null
    liveSmoke?: WebRetrievalLiveSmokeSummary | null
  } = {},
): WebRetrievalReleaseGateSummary {
  const fixtureRegression = input.fixtureRegression ?? null
  const liveSmoke = input.liveSmoke ?? null
  const blockingFailures =
    fixtureRegression?.status === "failed"
      ? fixtureRegression.results.flatMap((result) =>
          result.failures.map((failure) => `${result.fixtureId}:${failure}`),
        )
      : []
  if (liveSmoke?.status === "failed") blockingFailures.push("live_smoke_failed")
  const warnings = liveSmoke ? [] : ["live_smoke_not_run"]
  return {
    kind: "web_retrieval.release_gate",
    policyVersion: WEB_RETRIEVAL_EVIDENCE_CONTRACT_VERSION,
    fixtureRegression: fixtureRegression
      ? {
          status: fixtureRegression.status,
          counts: fixtureRegression.counts,
          results: fixtureRegression.results,
        }
      : null,
    liveSmoke: liveSmoke
      ? {
          mode: liveSmoke.mode,
          smokeId: liveSmoke.smokeId,
          status: liveSmoke.status,
          counts: liveSmoke.counts,
          artifactPath: liveSmoke.artifactPath ?? null,
        }
      : null,
    gateStatus: blockingFailures.length ? "failed" : warnings.length ? "warning" : "passed",
    blockingFailures,
    warnings,
  }
}

export function buildFixtureRegressionFromWorkspace(
  rootDir: string,
): WebRetrievalFixtureRegressionSummary | null {
  const fixtures = loadWebRetrievalFixturesFromDir(
    resolve(rootDir, "tests", "fixtures", "web-retrieval"),
  )
  return fixtures.length ? runWebRetrievalFixtureRegression(fixtures) : null
}

export function fixtureFileNameForId(id: string): string {
  return `${basename(id).replace(/[^A-Za-z0-9_.-]/gu, "-")}.json`
}
