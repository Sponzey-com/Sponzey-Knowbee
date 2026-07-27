import { detectAvailableProvider, getDefaultModel, getProvider, type AIProvider, type AIProviderConfigSnapshot } from "../ai/index.js"
import type { Message } from "../ai/types.js"
import {
  buildIntentComparisonProjection,
  hasPersistedComparableContract,
  serializeActiveRunCandidateForComparison,
  type ActiveRunContractProjection,
} from "./active-run-projection.js"
import { stableContractHash, type IntentContract, type JsonObject } from "../contracts/index.js"
import { chatWithContextPreflight } from "./context-preflight.js"
import { loadPromptTemplate } from "../memory/knowbee-md.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"

export type RequestContinuationDecisionKind = "same_run" | "new_run" | "clarify" | "cancel_target" | "update_target"

const COMPARISON_PROMPT_CONTEXT_LABELS_SOURCE_ID = "comparison_prompt_context_labels_user"

function comparisonPromptContextLabel(key: string): string {
  const value = loadPromptValue(COMPARISON_PROMPT_CONTEXT_LABELS_SOURCE_ID, {}, { required: true })
    .split(/\r?\n/u)
    .find((line) => line.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim()
  return value ?? key
}

export interface RequestContinuationDecision {
  kind: RequestContinuationDecisionKind
  requestGroupId?: string
  runId?: string
  approvalId?: string
  decisionSource: "explicit_id" | "contract_ai" | "contract_exact" | "safe_fallback"
  reason: string
}

interface ParsedRequestContinuationDecision {
  decision: RequestContinuationDecisionKind
  request_group_id?: string
  run_id?: string
  approval_id?: string
  reason?: string
}

function safeFallbackDecision(candidateCount: number, reason: string): RequestContinuationDecision {
  return {
    kind: candidateCount > 1 ? "clarify" : "new_run",
    decisionSource: "safe_fallback",
    reason,
  }
}

function withTimeoutSignal(timeoutMs: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(100, timeoutMs))
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  }
}

function buildIncomingComparisonProjection(contract: IntentContract): JsonObject {
  return buildIntentComparisonProjection(contract)
}

function findCandidateByAnyId(
  candidates: ActiveRunContractProjection[],
  parsed: ParsedRequestContinuationDecision,
): ActiveRunContractProjection | undefined {
  const requestGroupId = parsed.request_group_id?.trim()
  const runId = parsed.run_id?.trim()
  const approvalId = parsed.approval_id?.trim()

  return candidates.find((candidate) => (
    (requestGroupId && candidate.requestGroupId === requestGroupId)
    || (runId && candidate.runId === runId)
    || (approvalId && candidate.approvalId === approvalId)
  ))
}

export async function compareRequestContinuationWithAI(params: {
  incomingContract: IntentContract
  sessionId?: string
  candidates: ActiveRunContractProjection[]
  model?: string
  providerId?: string
  provider?: AIProvider
  config?: AIProviderConfigSnapshot
  timeoutMs?: number
}): Promise<RequestContinuationDecision> {
  if (params.candidates.length === 0) {
    return { kind: "new_run", decisionSource: "safe_fallback", reason: "no candidates" }
  }

  const comparableCandidates = params.candidates.filter(hasPersistedComparableContract)
  if (comparableCandidates.length === 0) {
    return safeFallbackDecision(params.candidates.length, "active candidates are legacy items without persisted contracts")
  }

  const incomingProjection = buildIncomingComparisonProjection(params.incomingContract)
  const incomingHash = stableContractHash(incomingProjection, "active-run")
  const exactMatches = comparableCandidates.filter((candidate) => candidate.comparisonHash === incomingHash)
  if (exactMatches.length > 1) {
    return { kind: "clarify", decisionSource: "safe_fallback", reason: "multiple active runs share the same contract projection" }
  }
  const exactMatch = exactMatches[0]
  if (exactMatch) {
    return {
      kind: "same_run",
      requestGroupId: exactMatch.requestGroupId,
      runId: exactMatch.runId,
      decisionSource: "contract_exact",
      reason: "incoming contract matched active run projection hash",
    }
  }

  if (!params.config) {
    return safeFallbackDecision(params.candidates.length, "AI config missing")
  }

  const model = params.model?.trim() || getDefaultModel(params.config)
  const providerId = params.providerId?.trim() || detectAvailableProvider(params.config)
  if (!model || !providerId) {
    return safeFallbackDecision(params.candidates.length, "no configured provider")
  }

  const provider = params.provider ?? getProvider(providerId, params.config)
  // knowbee-critical-decision-audit: entry-comparison.contract_projection_comparison
  // Comparator inputs are canonical contract projections and stable ids only.
  const messages: Message[] = [
    {
      role: "user",
      content: [
        comparisonPromptContextLabel("incoming_intent_contract_projection_label"),
        JSON.stringify(incomingProjection),
        "",
        comparisonPromptContextLabel("active_run_contract_candidates_label"),
        JSON.stringify(comparableCandidates.map(serializeActiveRunCandidateForComparison)),
      ].join("\n"),
    },
  ]

  const timeout = withTimeoutSignal(params.timeoutMs ?? 1800)
  let raw = ""
  try {
    for await (const chunk of chatWithContextPreflight({
      provider,
      model,
      messages,
      system: buildRequestContinuationSystemPrompt(),
      tools: [],
      maxTokens: 260,
      signal: timeout.signal,
      metadata: { operation: "request_continuation_comparison" },
    })) {
      if (chunk.type === "text_delta") raw += chunk.delta
    }
  } catch {
    return safeFallbackDecision(params.candidates.length, "contract comparison failed or timed out")
  } finally {
    timeout.clear()
  }

  const parsed = parseRequestContinuationDecision(raw)
  if (!parsed) {
    return safeFallbackDecision(params.candidates.length, "unparseable contract comparison result")
  }

  if (parsed.decision === "clarify" || parsed.decision === "new_run") {
    return {
      kind: parsed.decision,
      decisionSource: "contract_ai",
      reason: parsed.reason?.trim() || (parsed.decision === "clarify" ? "ambiguous active run target" : "new independent run"),
    }
  }

  const selected = findCandidateByAnyId(comparableCandidates, parsed)
  if (!selected) {
    return safeFallbackDecision(params.candidates.length, "contract comparison selected an unknown target")
  }

  return {
    kind: parsed.decision,
    requestGroupId: selected.requestGroupId,
    runId: selected.runId,
    ...(selected.approvalId ? { approvalId: selected.approvalId } : {}),
    decisionSource: "contract_ai",
    reason: parsed.reason?.trim() || "matched active run contract",
  }
}

export function buildRequestContinuationSystemPrompt(options: { workDir?: string | undefined; locale?: "ko" | "en" | undefined } = {}): string {
  return loadPromptTemplate({
    sourceId: "request_continuation",
    workDir: options.workDir,
    locale: options.locale ?? "en",
  })
}

export function parseRequestContinuationDecision(raw: string): ParsedRequestContinuationDecision | null {
  const jsonLike = extractJsonObject(raw.trim())
  if (!jsonLike) return null
  try {
    const parsed = JSON.parse(jsonLike) as Partial<Record<string, unknown>>
    const rawDecision = parsed.decision
    const decision = normalizeDecision(rawDecision)
    if (!decision) return null
    return {
      decision,
      ...(typeof parsed.request_group_id === "string" ? { request_group_id: parsed.request_group_id } : {}),
      ...(typeof parsed.run_id === "string" ? { run_id: parsed.run_id } : {}),
      ...(typeof parsed.approval_id === "string" ? { approval_id: parsed.approval_id } : {}),
      ...(typeof parsed.reason === "string" ? { reason: parsed.reason } : {}),
    }
  } catch {
    return null
  }
}

function normalizeDecision(value: unknown): RequestContinuationDecisionKind | null {
  switch (value) {
    case "same_run":
    case "new_run":
    case "clarify":
    case "cancel_target":
    case "update_target":
      return value
    case "reuse":
      return "same_run"
    case "new":
      return "new_run"
    default:
      return null
  }
}

function extractJsonObject(text: string): string | null {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const start = withoutFence.indexOf("{")
  const end = withoutFence.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  return withoutFence.slice(start, end + 1)
}
