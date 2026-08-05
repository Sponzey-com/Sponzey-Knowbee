import { recordLatencyMetric } from "../observability/latency.js"
import { redactLogText } from "../logger/index.js"

export type CandidateKind = "schedule" | "run" | "artifact"

export type CandidateReason =
  | "explicit_id"
  | "structured_key"
  | "schedule_identity_key"
  | "schedule_delivery_key"
  | "schedule_payload_hash"
  | "run_contract_projection"
  | "artifact_id"
  | "artifact_path"

export type CandidateSource =
  | "explicit_id"
  | "structured_key"
  | "schedule_store"
  | "run_store"
  | "artifact_store"

export type CandidateProviderStage = "fast" | "store" | "slow"

export interface CandidateScore {
  kind: "candidate_score"
  metric: "store" | "fts" | "vector" | "hybrid"
  value: number
}

export interface DecisionConfidence {
  kind: "decision_confidence"
  level: "exact" | "strong" | "weak" | "clarify"
}

export interface CandidateResult<TPayload = unknown> {
  candidateId: string
  candidateKind: CandidateKind
  candidateReason: CandidateReason
  source: CandidateSource
  payload: TPayload
  matchedKeys: string[]
  requiresFinalDecision: boolean
  score?: CandidateScore
}

export interface CandidateSearchInput {
  runId?: string
  explicitIds?: {
    runId?: string
    requestGroupId?: string
    approvalId?: string
    scheduleId?: string
    artifactId?: string
  }
  structuredKeys?: Record<string, string | null | undefined>
  sessionId?: string
  requestGroupId?: string
  source?: string
  limit?: number
}

export interface CandidateProviderContext {
  signal: AbortSignal
  now: () => number
}

export interface CandidateProvider<TInput extends CandidateSearchInput = CandidateSearchInput, TPayload = unknown> {
  id: string
  source: CandidateSource
  stage: CandidateProviderStage
  find(input: TInput, context: CandidateProviderContext): Promise<Array<CandidateResult<TPayload>>> | Array<CandidateResult<TPayload>>
}

export interface CandidateProviderTrace<TPayload = unknown> {
  providerId: string
  source: CandidateSource
  stage: CandidateProviderStage
  durationMs: number
  candidateCount: number
  skipped?: boolean
  timedOut?: boolean
  error?: string
  candidates: Array<CandidateResult<TPayload>>
}

export interface CandidateSearchResult<TPayload = unknown> {
  candidates: Array<CandidateResult<TPayload>>
  traces: Array<CandidateProviderTrace<TPayload>>
  skippedSlowProviders: boolean
}

export type CandidateFinalDecisionKind = "same" | "cancel" | "update" | "new" | "clarify"
export type CandidateFinalDecisionSource = "explicit_id" | "structured_key" | "contract_key" | "contract_ai" | "user_choice" | "safe_fallback"

export interface CandidateFinalDecision<TPayload = unknown> {
  kind: CandidateFinalDecisionKind
  finalDecisionSource: CandidateFinalDecisionSource
  reasonCode: string
  selectedCandidate?: CandidateResult<TPayload>
}

const STAGE_ORDER: Record<CandidateProviderStage, number> = {
  fast: 0,
  store: 1,
  slow: 2,
}

function normalizeId(value: string | null | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized || undefined
}

function timeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(50, timeoutMs))
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function isFastPathCandidate(candidate: CandidateResult): boolean {
  return (candidate.source === "explicit_id" || candidate.source === "structured_key")
    && candidate.requiresFinalDecision === false
}

function candidateProviderErrorTrace(error: unknown): Pick<CandidateProviderTrace, "timedOut" | "error"> {
  const raw = error instanceof Error ? error.message : String(error)
  if (raw === "candidate provider timeout") return { timedOut: true }
  return { error: redactLogText(raw) }
}

async function runProviderWithTimeout<TInput extends CandidateSearchInput, TPayload>(
  provider: CandidateProvider<TInput, TPayload>,
  input: TInput,
  params: {
    timeoutMs: number
    now: () => number
  },
): Promise<CandidateProviderTrace<TPayload>> {
  const started = params.now()
  const timeout = timeoutSignal(params.timeoutMs)
  try {
    const candidates = await Promise.race([
      Promise.resolve(provider.find(input, { signal: timeout.signal, now: params.now })),
      new Promise<Array<CandidateResult<TPayload>>>((_, reject) => {
        timeout.signal.addEventListener("abort", () => reject(new Error("candidate provider timeout")), { once: true })
      }),
    ])
    return {
      providerId: provider.id,
      source: provider.source,
      stage: provider.stage,
      durationMs: params.now() - started,
      candidateCount: candidates.length,
      candidates,
    }
  } catch (error) {
    return {
      providerId: provider.id,
      source: provider.source,
      stage: provider.stage,
      durationMs: params.now() - started,
      candidateCount: 0,
      candidates: [],
      ...candidateProviderErrorTrace(error),
    }
  } finally {
    timeout.clear()
  }
}

export async function runCandidateProviders<TInput extends CandidateSearchInput, TPayload>(
  input: TInput,
  providers: Array<CandidateProvider<TInput, TPayload>>,
  options: {
    providerTimeoutMs?: number
    skipSlowOnFastPath?: boolean
    now?: () => number
  } = {},
): Promise<CandidateSearchResult<TPayload>> {
  const now = options.now ?? Date.now
  const providerTimeoutMs = options.providerTimeoutMs ?? 200
  const ordered = [...providers].sort((a, b) => STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage])
  const traces: Array<CandidateProviderTrace<TPayload>> = []
  const candidates = new Map<string, CandidateResult<TPayload>>()
  let foundFastPath = false
  let skippedSlowProviders = false

  for (const provider of ordered) {
    if (foundFastPath && provider.stage !== "fast" && options.skipSlowOnFastPath !== false) {
      skippedSlowProviders = true
      traces.push({
        providerId: provider.id,
        source: provider.source,
        stage: provider.stage,
        durationMs: 0,
        candidateCount: 0,
        skipped: true,
        candidates: [],
      })
      continue
    }

    const trace = await runProviderWithTimeout(provider, input, { timeoutMs: providerTimeoutMs, now })
    recordLatencyMetric({
      name: "candidate_search_latency_ms",
      durationMs: trace.durationMs,
      timeout: trace.timedOut === true,
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.requestGroupId ? { requestGroupId: input.requestGroupId } : {}),
      ...(input.source ? { source: input.source } : {}),
      detail: {
        providerId: trace.providerId,
        providerSource: trace.source,
        providerStage: trace.stage,
        candidateCount: trace.candidateCount,
        skipped: trace.skipped === true,
        timedOut: trace.timedOut === true,
      },
    })
    traces.push(trace)
    for (const candidate of trace.candidates) {
      if (!candidates.has(candidate.candidateId)) candidates.set(candidate.candidateId, candidate)
    }
    foundFastPath = [...candidates.values()].some(isFastPathCandidate)
  }

  const limit = Math.max(1, Math.min(input.limit ?? 20, 100))
  return {
    candidates: [...candidates.values()].slice(0, limit),
    traces,
    skippedSlowProviders,
  }
}

export function createExplicitIdProvider<TInput extends CandidateSearchInput, TPayload>(params: {
  id: string
  candidateKind: CandidateKind
  ids: (input: TInput) => Array<string | undefined>
  resolve: (id: string, input: TInput) => TPayload | undefined | Promise<TPayload | undefined>
  candidateId?: (payload: TPayload, id: string) => string
}): CandidateProvider<TInput, TPayload> {
  return {
    id: params.id,
    source: "explicit_id",
    stage: "fast",
    async find(input) {
      const results: Array<CandidateResult<TPayload>> = []
      for (const rawId of params.ids(input)) {
        const id = normalizeId(rawId)
        if (!id) continue
        const payload = await params.resolve(id, input)
        if (!payload) continue
        results.push({
          candidateId: params.candidateId?.(payload, id) ?? id,
          candidateKind: params.candidateKind,
          candidateReason: "explicit_id",
          source: "explicit_id",
          payload,
          matchedKeys: [`explicit:${id}`],
          requiresFinalDecision: false,
        })
      }
      return results
    },
  }
}

export function createStructuredKeyProvider<TInput extends CandidateSearchInput, TPayload>(params: {
  id: string
  candidateKind: CandidateKind
  keys: (input: TInput) => Array<{ key: string; value: string | undefined }>
  resolve: (key: string, value: string, input: TInput) => TPayload | undefined | Promise<TPayload | undefined>
  candidateId?: (payload: TPayload, key: string, value: string) => string
}): CandidateProvider<TInput, TPayload> {
  return {
    id: params.id,
    source: "structured_key",
    stage: "fast",
    async find(input) {
      const results: Array<CandidateResult<TPayload>> = []
      for (const item of params.keys(input)) {
        const value = normalizeId(item.value)
        if (!value) continue
        const payload = await params.resolve(item.key, value, input)
        if (!payload) continue
        results.push({
          candidateId: params.candidateId?.(payload, item.key, value) ?? `${item.key}:${value}`,
          candidateKind: params.candidateKind,
          candidateReason: "structured_key",
          source: "structured_key",
          payload,
          matchedKeys: [`${item.key}:${value}`],
          requiresFinalDecision: false,
        })
      }
      return results
    },
  }
}

export function createStoreCandidateProvider<TInput extends CandidateSearchInput, TPayload>(params: {
  id: string
  source: "schedule_store" | "run_store" | "artifact_store"
  candidateKind: CandidateKind
  candidateReason: Exclude<CandidateReason, "explicit_id" | "structured_key">
  find: (input: TInput) => Array<TPayload> | Promise<Array<TPayload>>
  candidateId: (payload: TPayload) => string
  matchedKeys?: (payload: TPayload) => string[]
  requiresFinalDecision?: boolean
}): CandidateProvider<TInput, TPayload> {
  return {
    id: params.id,
    source: params.source,
    stage: "store",
    async find(input) {
      const payloads = await params.find(input)
      return payloads.map((payload) => ({
        candidateId: params.candidateId(payload),
        candidateKind: params.candidateKind,
        candidateReason: params.candidateReason,
        source: params.source,
        payload,
        matchedKeys: params.matchedKeys?.(payload) ?? [],
        requiresFinalDecision: params.requiresFinalDecision ?? true,
      }))
    },
  }
}

export function decideCandidateFinal<TPayload>(params: {
  requested: Exclude<CandidateFinalDecisionKind, "new" | "clarify">
  candidate?: CandidateResult<TPayload>
  finalDecisionSource: CandidateFinalDecisionSource
}): CandidateFinalDecision<TPayload> {
  if (!params.candidate) {
    return {
      kind: "new",
      finalDecisionSource: "safe_fallback",
      reasonCode: "no_candidate",
    }
  }

  return {
    kind: params.requested,
    finalDecisionSource: params.finalDecisionSource,
    selectedCandidate: params.candidate,
    reasonCode: "final_decision_source_allowed",
  }
}

export function buildCandidateDecisionAuditDetails<TPayload>(params: {
  candidates: Array<CandidateResult<TPayload>>
  decision: CandidateFinalDecision<TPayload>
}): Record<string, unknown> {
  return {
    candidateSources: [...new Set(params.candidates.map((candidate) => candidate.source))],
    candidateReasons: [...new Set(params.candidates.map((candidate) => candidate.candidateReason))],
    finalDecisionSource: params.decision.finalDecisionSource,
    finalDecisionKind: params.decision.kind,
    selectedCandidateId: params.decision.selectedCandidate?.candidateId ?? null,
    selectedCandidateSource: params.decision.selectedCandidate?.source ?? null,
    selectedCandidateReason: params.decision.selectedCandidate?.candidateReason ?? null,
  }
}
