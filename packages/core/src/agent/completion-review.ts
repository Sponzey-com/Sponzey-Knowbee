import { createHash } from "node:crypto"
import {
  parseUserInputRequirement,
  type UserInputRequirement,
} from "../contracts/user-input-requirement.js"
import {
  type AIProvider,
  detectAvailableProvider,
  getDefaultModel,
  getProvider,
} from "../ai/index.js"
import type { Message } from "../ai/types.js"
import type { KnowbeeConfig } from "../config/types.js"
import type { InstructionRuntimeContext } from "../instructions/merge.js"
import { createLogger } from "../logger/index.js"
import {
  type PromptTemplateVariables,
  loadBundledPromptTemplate,
  loadPromptTemplate,
} from "../memory/knowbee-md.js"
import { loadPromptValue } from "../memory/prompt-fragments.js"
import { chatWithContextPreflight } from "../runs/context-preflight.js"
import { buildStructuredFollowupKey } from "../runs/completion-application.js"
import {
  type SuccessfulToolEvidence,
  evaluateSuccessfulToolEvidenceTrust,
} from "../runs/recovery.js"
import {
  createUntrustedEvidenceEnvelope,
  projectUntrustedEvidenceForPrompt,
  redactUntrustedEvidenceContent,
} from "../security/trust-boundary.js"
import { admitYeonjangEvidenceForReview } from "../yeonjang/evidence-admission.js"
import { buildUserProfilePromptContext } from "./profile-context.js"
export {
  aggregateSubSessionResultsForParent,
  buildParentAggregationRuntimeEvent,
  buildFeedbackRequest,
  collectResultReviewIssues,
  decideSubSessionCompletionIntegration,
  getSubAgentResultRetryBudgetLimit,
  normalizeResultReviewFailureKey,
  reviewSubAgentResult,
  summarizeChildResultForParent,
} from "./sub-agent-result-review.js"
export type {
  ParentAggregationChildInput,
  ParentAggregationInput,
  ParentAggregationNextAction,
  ParentAggregationRuntimeEventInput,
  ParentAggregationTrace,
  ParentFacingChildResult,
  ParentFacingChildResultStatus,
  SubAgentResultParentIntegrationStatus,
  SubAgentResultReview,
  SubAgentResultReviewInput,
  SubAgentResultReviewIssue,
  SubAgentResultReviewIssueCode,
  SubAgentResultReviewVerdict,
  SubAgentRetryClass,
  SubSessionCompletionIntegrationDecision,
} from "./sub-agent-result-review.js"

const log = createLogger("agent:completion-review")
const COMPLETION_REVIEW_CONTEXT_LABELS_SOURCE_ID = "completion_review_context_labels_user"
const MAX_COMPLETION_REVIEW_PRIOR_MESSAGES = 3
const MAX_COMPLETION_REVIEW_PRIOR_MESSAGE_CHARS = 1_200
const MAX_COMPLETION_REVIEW_OUTPUT_TOKENS = 4_096
const MAX_COMPLETION_REVIEW_REPAIR_RAW_CHARS = 6_000

function completionReviewContextLabel(
  key: string,
  variables: PromptTemplateVariables = {},
): string {
  const entries = loadPromptValue(COMPLETION_REVIEW_CONTEXT_LABELS_SOURCE_ID, variables, {
    required: true,
  })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line): [string, string] => {
      const separator = line.indexOf("=")
      if (separator < 0) return [line, ""]
      return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    })
  const value = new Map(entries).get(key)
  if (!value) throw new Error(`completion review context label missing: ${key}`)
  return value
}

export type CompletionReviewStatus =
  | "complete"
  | "followup"
  | "ask_user"
  | "blocked"
  | "paths_exhausted"
export const COMPLETION_REVIEW_CRITERION_KEYS = [
  "existence",
  "accuracy",
  "completeness",
  "freshness",
  "target_match",
  "constraint_compliance",
  "delivery",
] as const
const COMPLETION_REVIEW_EVIDENCE_ACQUISITION_CRITERION_KEYS =
  new Set<CompletionReviewCriterionKey>([
    "existence",
    "accuracy",
    "freshness",
    "target_match",
  ])
export type CompletionReviewCriterionKey = (typeof COMPLETION_REVIEW_CRITERION_KEYS)[number]
export type CompletionReviewCriterionVerdict = "satisfied" | "unsatisfied" | "uncertain"

export interface CompletionReviewCriterionAssessment {
  criterionKey: CompletionReviewCriterionKey
  applicable: boolean
  verdict: CompletionReviewCriterionVerdict
  evidenceRefs: string[]
  uncertainty: string
  reason: string
}

export interface CompletionReviewExpectedCondition {
  conditionId: `condition:${string}`
  description: string
}

export interface CompletionReviewConditionAssessment {
  conditionId: `condition:${string}`
  verdict: CompletionReviewCriterionVerdict
  evidenceRefs: string[]
  uncertainty: string
  reason: string
}

export interface CompletionReviewResult {
  status: CompletionReviewStatus
  summary: string
  reason: string
  followupPrompt?: string
  followupEvidenceRefs: string[]
  followupExecutionMode?: "tool" | "response_only"
  followupRequiredToolNames?: string[]
  followupTargetRefs?: string[]
  userMessage?: string
  inputRequirement?: UserInputRequirement
  remainingItems: string[]
  criterionAssessments?: CompletionReviewCriterionAssessment[]
  conditionAssessments?: CompletionReviewConditionAssessment[]
  contextReceipt?: CompletionReviewContextReceipt
  terminalEvidence?: CompletionReviewTerminalEvidence
}

export interface CompletionReviewTerminalEvidence {
  blockerEvidenceRefs: string[]
  evaluatedAlternativeEvidenceRefs: string[]
  excludedCandidateEvidenceRefs: string[]
}

export type CompletionReviewCriterionGateResult =
  | { ok: true }
  | {
      ok: false
      reasonCode:
        | "completion_review_criteria_missing"
        | "completion_review_criteria_duplicate"
        | "completion_review_criteria_incomplete"
        | "completion_review_evidence_ref_foreign"
        | "completion_review_applicable_criterion_not_satisfied"
        | "completion_review_criterion_evidence_missing"
        | "completion_review_complete_without_evidence_refs"
        | "completion_review_freshness_evidence_invalid"
        | "completion_review_conditions_missing"
        | "completion_review_conditions_duplicate"
        | "completion_review_conditions_mismatch"
        | "completion_review_condition_not_satisfied"
        | "completion_review_condition_evidence_missing"
        | "completion_review_required_tool_evidence_missing"
    }

type CompletionReviewCriterionGateFailure = Extract<
  CompletionReviewCriterionGateResult,
  { ok: false }
>

export type CompletionReviewRejectionReasonCode =
  | "completion_review_parse_failed"
  | "completion_review_followup_evidence_missing"
  | "completion_review_followup_evidence_foreign"
  | "completion_review_followup_execution_missing"
  | "completion_review_followup_execution_invalid"
  | "completion_review_followup_transition_repeated"
  | CompletionReviewTerminalGateFailure["reasonCode"]
  | CompletionReviewCriterionGateFailure["reasonCode"]

export type CompletionReviewTerminalGateResult =
  | { ok: true }
  | {
      ok: false
      reasonCode:
        | "completion_review_terminal_evidence_missing"
        | "completion_review_terminal_evidence_foreign"
        | "completion_review_blocker_evidence_missing"
        | "completion_review_alternative_evidence_missing"
        | "completion_review_candidate_exclusion_incomplete"
    }

type CompletionReviewTerminalGateFailure = Extract<
  CompletionReviewTerminalGateResult,
  { ok: false }
>

export interface CompletionReviewContextReceipt {
  schemaVersion: 1
  receiptId: `completion-review:${string}`
  contextFingerprint: `sha256:${string}`
  requestFingerprint: `sha256:${string}`
  candidateFingerprint: `sha256:${string}`
  evidenceFingerprint: `sha256:${string}`
  conditionsFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

export interface CompletionReviewOperationalEvidence {
  artifacts: Array<{
    artifactRef: string
    targetRef: string
    observedAt?: string
    receiptRef?: string
  }>
  stateChanges: Array<{
    stateRef: string
    targetRef: string
    observedAt?: string
    status: "observed" | "not_observed"
  }>
  deliveries: Array<{
    deliveryRef: string
    targetRef: string
    observedAt?: string
    status: "satisfied" | "unsatisfied"
  }>
}

const MAX_COMPLETION_EVIDENCE_ITEMS = 12
const MAX_COMPLETION_EVIDENCE_OUTPUT_CHARS = 8_000
const MAX_COMPLETION_EVIDENCE_DETAILS_CHARS = 4_000

type CompletionReviewEvidencePayloadItem =
  | {
    evidence_kind: "tool_result"
    tool_name: string
    source_kind: string
    source_ref: string
    output: string
    details?: string
  }
  | {
    evidence_kind: "yeonjang_evidence"
    tool_name: string
    source_kind: string
    source_ref: string
    target_ref: string
    method_ids: string[]
    group: string
    risk_level: string
    requires_approval: boolean
    collected_at: number
    summary: string
    post_check: unknown
    raw_payload_visibility: "audit_only"
  }
  | {
    evidence_kind: "artifact"
    source_ref: string
    target_ref: string
    observed_at?: string
    receipt_ref?: string
  }
  | {
    evidence_kind: "state_change"
    source_ref: string
    target_ref: string
    status: "observed" | "not_observed"
    observed_at?: string
  }
  | {
    evidence_kind: "delivery"
    source_ref: string
    target_ref: string
    status: "satisfied" | "unsatisfied"
    observed_at?: string
  }

export function buildCompletionReviewEvidenceBlock(
  successfulTools: SuccessfulToolEvidence[],
  operationalEvidence?: CompletionReviewOperationalEvidence,
): string {
  const evidence = buildCompletionReviewEvidencePayload(successfulTools, operationalEvidence)
  if (evidence.length === 0) return ""
  const redaction = redactUntrustedEvidenceContent(JSON.stringify(evidence))
  const envelope = projectUntrustedEvidenceForPrompt(
    createUntrustedEvidenceEnvelope({
      sourceKind: "tool",
      sourceRef: "completion-review:tool-evidence",
      contentLabel: "Execution evidence for LLM completion diagnosis",
      ownerScope: { ownerType: "system", ownerId: "completion-review" },
      content: redaction.content,
      redactionState: "redacted",
    }),
  )
  return JSON.stringify(envelope)
}

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? ""
  return trimmed || null
}

function buildCompletionReviewEvidencePayload(
  successfulTools: SuccessfulToolEvidence[],
  operationalEvidence?: CompletionReviewOperationalEvidence,
): CompletionReviewEvidencePayloadItem[] {
  const toolEvidence = successfulTools
    .filter((item) => evaluateSuccessfulToolEvidenceTrust(item).allowed)
    .slice(-MAX_COMPLETION_EVIDENCE_ITEMS)
    .flatMap((item): CompletionReviewEvidencePayloadItem[] => {
      const yeonjangEvidence = buildCompletionReviewYeonjangEvidence(item)
      if (yeonjangEvidence) return [yeonjangEvidence]
      if (isYeonjangToolEvidence(item)) return []
      const details = stringifyBoundedEvidence(item.details, MAX_COMPLETION_EVIDENCE_DETAILS_CHARS)
      return [{
        evidence_kind: "tool_result" as const,
        tool_name: item.toolName,
        source_kind: item.evidenceSource?.sourceKind ?? "tool",
        source_ref: item.evidenceSource?.sourceRef ?? "unavailable",
        output: item.output.slice(0, MAX_COMPLETION_EVIDENCE_OUTPUT_CHARS),
        ...(details ? { details } : {}),
      }]
    })
  const artifacts = (operationalEvidence?.artifacts ?? []).flatMap((item) => {
    const sourceRef = trimmedOrNull(item.artifactRef)
    const targetRef = trimmedOrNull(item.targetRef)
    const observedAt = trimmedOrNull(item.observedAt)
    const receiptRef = trimmedOrNull(item.receiptRef)
    if (!sourceRef || !targetRef) return []
    return [
      {
        evidence_kind: "artifact" as const,
        source_ref: sourceRef,
        target_ref: targetRef,
        ...(observedAt ? { observed_at: observedAt } : {}),
        ...(receiptRef ? { receipt_ref: receiptRef } : {}),
      },
    ]
  })
  const stateChanges = (operationalEvidence?.stateChanges ?? []).flatMap((item) => {
    const sourceRef = trimmedOrNull(item.stateRef)
    const targetRef = trimmedOrNull(item.targetRef)
    const observedAt = trimmedOrNull(item.observedAt)
    if (!sourceRef || !targetRef) return []
    return [
      {
        evidence_kind: "state_change" as const,
        source_ref: sourceRef,
        target_ref: targetRef,
        status: item.status,
        ...(observedAt ? { observed_at: observedAt } : {}),
      },
    ]
  })
  const deliveries = (operationalEvidence?.deliveries ?? []).flatMap((item) => {
    const sourceRef = trimmedOrNull(item.deliveryRef)
    const targetRef = trimmedOrNull(item.targetRef)
    const observedAt = trimmedOrNull(item.observedAt)
    if (!sourceRef || !targetRef) return []
    return [
      {
        evidence_kind: "delivery" as const,
        source_ref: sourceRef,
        target_ref: targetRef,
        status: item.status,
        ...(observedAt ? { observed_at: observedAt } : {}),
      },
    ]
  })
  return [...toolEvidence, ...artifacts, ...stateChanges, ...deliveries].slice(
    -MAX_COMPLETION_EVIDENCE_ITEMS,
  )
}

function isYeonjangToolEvidence(item: SuccessfulToolEvidence): boolean {
  return item.toolName.startsWith("yeonjang_") || hasYeonjangEvidenceEnvelope(item)
}

function hasYeonjangEvidenceEnvelope(item: SuccessfulToolEvidence): boolean {
  return recordValue(recordValue(item.details)?.evidence)?.schemaVersion === "yeonjang-evidence-v1"
}

function buildCompletionReviewYeonjangEvidence(
  item: SuccessfulToolEvidence,
): CompletionReviewEvidencePayloadItem | null {
  if (!hasYeonjangEvidenceEnvelope(item)) return null
  const trust = evaluateSuccessfulToolEvidenceTrust(item)
  if (!trust.allowed) return null
  const admission = admitYeonjangEvidenceForReview({
    result: {
      success: true,
      output: item.output,
      details: item.details,
      ...(item.evidenceSource ? { evidenceSource: item.evidenceSource } : {}),
    },
    expectedToolName: item.toolName,
  })
  if (admission.status !== "admitted") return null
  const evidence = admission.evidence
  return {
    evidence_kind: "yeonjang_evidence" as const,
    tool_name: evidence.toolName,
    source_kind: item.evidenceSource?.sourceKind ?? "yeonjang",
    source_ref: trust.sourceRef,
    target_ref: evidence.targetRef,
    method_ids: evidence.methodIds,
    group: evidence.group,
    risk_level: evidence.riskLevel,
    requires_approval: evidence.requiresApproval,
    collected_at: evidence.collectedAt,
    summary: evidence.summary,
    post_check: evidence.postCheck,
    raw_payload_visibility: evidence.rawPayloadVisibility,
  }
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function buildCompletionReviewFreshnessEvidenceRefs(
  successfulTools: SuccessfulToolEvidence[],
  operationalEvidence?: CompletionReviewOperationalEvidence,
): string[] {
  const evidenceRefs = buildCompletionReviewEvidencePayload(
    successfulTools,
    operationalEvidence,
  ).map((item) => item.source_ref)
  const ineligibleRefs = new Set(
    successfulTools.flatMap((item) => {
      const trust = evaluateSuccessfulToolEvidenceTrust(item)
      if (!trust.allowed) return []
      const sourceEvidence = recordValue(recordValue(item.details)?.sourceEvidence)
      if (sourceEvidence?.freshnessPolicy !== "strict_timestamp") return []
      return sourceEvidence.freshnessVerdict === "fresh" ? [] : [trust.sourceRef]
    }),
  )
  return [...new Set(evidenceRefs.filter((ref) => !ineligibleRefs.has(ref)))]
}

function fingerprint(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

export function buildCompletionReviewContextReceipt(input: {
  originalRequest: string
  latestAssistantMessage: string
  successfulTools: SuccessfulToolEvidence[]
  operationalEvidence?: CompletionReviewOperationalEvidence
  completionConditions?: string[]
}): CompletionReviewContextReceipt {
  const evidence = buildCompletionReviewEvidencePayload(
    input.successfulTools,
    input.operationalEvidence,
  )
  const requestFingerprint = fingerprint(input.originalRequest.trim())
  const candidateFingerprint = fingerprint(input.latestAssistantMessage.trim())
  const evidenceFingerprint = fingerprint(JSON.stringify(evidence))
  const evidenceRefs = [...new Set(evidence.map((item) => item.source_ref))]
  const expectedConditions = buildCompletionReviewExpectedConditions(
    input.completionConditions ?? [],
  )
  const conditionsFingerprint = fingerprint(JSON.stringify(expectedConditions))
  const contextFingerprint = fingerprint(
    JSON.stringify({
      requestFingerprint,
      candidateFingerprint,
      evidenceFingerprint,
      conditionsFingerprint,
      evidenceRefs,
    }),
  )
  return {
    schemaVersion: 1,
    receiptId: `completion-review:${contextFingerprint.slice(-24)}`,
    contextFingerprint,
    requestFingerprint,
    candidateFingerprint,
    evidenceFingerprint,
    conditionsFingerprint,
    evidenceRefs,
  }
}

export function buildCompletionReviewExpectedConditions(
  completionConditions: string[],
): CompletionReviewExpectedCondition[] {
  return [
    ...new Set(completionConditions.map((condition) => condition.trim()).filter(Boolean)),
  ].map((description) => ({
    conditionId: `condition:${fingerprint(description).slice("sha256:".length)}` as const,
    description,
  }))
}

function stringifyBoundedEvidence(value: unknown, maxChars: number): string | null {
  if (value === undefined) return null
  try {
    const serialized = JSON.stringify(value)
    if (!serialized) return null
    return serialized.slice(0, maxChars)
  } catch {
    return null
  }
}

function projectPriorAssistantMessages(messages: string[] | undefined): string[] {
  if (!messages) return []
  return messages
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(-MAX_COMPLETION_REVIEW_PRIOR_MESSAGES)
    .map((message) => message.slice(0, MAX_COMPLETION_REVIEW_PRIOR_MESSAGE_CHARS))
}

export async function reviewTaskCompletion(params: {
  instructionRuntime: InstructionRuntimeContext
  originalRequest: string
  latestAssistantMessage: string
  priorAssistantMessages?: string[]
  model?: string
  providerId?: string
  provider?: AIProvider
  config: KnowbeeConfig
  workDir?: string
  successfulTools?: SuccessfulToolEvidence[]
  operationalEvidence?: CompletionReviewOperationalEvidence
  completionConditions?: string[]
  requiresSuccessfulToolEvidence?: boolean
  runId?: string | undefined
  requestGroupId?: string | undefined
  sessionId?: string | undefined
  seenFollowupTransitionKeys?: ReadonlySet<string>
  onRejected?: (reasonCode: CompletionReviewRejectionReasonCode, attempt: number) => void
}): Promise<CompletionReviewResult | null> {
  const originalRequest = params.originalRequest.trim()
  const latestAssistantMessage = params.latestAssistantMessage.trim()
  if (!originalRequest || !latestAssistantMessage) return null

  const config = params.config
  const model = params.model ?? getDefaultModel(config)
  const providerId = params.providerId ?? detectAvailableProvider(config)
  const provider = params.provider ?? getProvider(providerId, config)
  const profileContext = buildUserProfilePromptContext(config.profile)
  const toolEvidenceBlock = buildCompletionReviewEvidenceBlock(
    params.successfulTools ?? [],
    params.operationalEvidence,
  )
  const expectedConditions = buildCompletionReviewExpectedConditions(
    params.completionConditions ?? [],
  )
  const contextReceipt = buildCompletionReviewContextReceipt({
    originalRequest,
    latestAssistantMessage,
    successfulTools: params.successfulTools ?? [],
    ...(params.operationalEvidence ? { operationalEvidence: params.operationalEvidence } : {}),
    completionConditions: params.completionConditions ?? [],
  })
  const freshnessEvidenceRefs = buildCompletionReviewFreshnessEvidenceRefs(
    params.successfulTools ?? [],
    params.operationalEvidence,
  )
  const successfulToolEvidenceRefs = [
    ...new Set(
      buildCompletionReviewEvidencePayload(params.successfulTools ?? [])
        .map((item) => item.source_ref),
    ),
  ]
  const priorAssistantMessages = projectPriorAssistantMessages(params.priorAssistantMessages)

  const initialMessages: Message[] = [
    {
      role: "user",
      content: [
        loadPromptTemplate({
          sourceId: "completion_review_user",
          workDir: params.workDir,
          variables: {
            originalRequest,
            priorAssistantMessagesBlock:
              priorAssistantMessages.length > 0
                ? `${completionReviewContextLabel("prior_assistant_results_header")}\n${priorAssistantMessages.map((item, index) => `${index + 1}. ${item}`).join("\n")}`
                : "",
            latestAssistantMessage,
          },
        }),
        loadBundledPromptTemplate({
          sourceId: "completion_review_context_v2",
          variables: {
            completionConditionsBlock: JSON.stringify(expectedConditions),
            allowedEvidenceRefsBlock: JSON.stringify(contextReceipt.evidenceRefs),
            toolEvidenceBlock,
            toolEvidenceRequiredBlock:
              params.requiresSuccessfulToolEvidence === true ? "true" : "false",
          },
        }),
      ].join("\n\n"),
    },
  ]

  const system = [
    buildCompletionReviewSystemPrompt({ workDir: params.workDir }),
    profileContext ? `\n${profileContext}` : "",
  ].join("\n")
  let messages = initialMessages
  let previousRaw = ""
  let previousReason: CompletionReviewRejectionReasonCode | null = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (attempt > 1 && previousReason) {
      messages = [
        ...initialMessages,
        {
          role: "assistant",
          content: previousRaw.slice(0, MAX_COMPLETION_REVIEW_REPAIR_RAW_CHARS),
        },
        {
          role: "user",
          content: loadPromptTemplate({
            sourceId: "completion_review_repair_user",
            workDir: params.workDir,
            variables: {
              reasonCode: previousReason,
              allowedEvidenceRefsBlock: JSON.stringify(contextReceipt.evidenceRefs),
              expectedConditionsBlock: JSON.stringify(expectedConditions),
            },
          }),
        },
      ]
    }

    let raw = ""
    for await (const chunk of chatWithContextPreflight({
      provider,
      model,
      messages,
      system,
      tools: [],
      maxTokens: MAX_COMPLETION_REVIEW_OUTPUT_TOKENS,
      signal: new AbortController().signal,
      memoryConfig: config.memory,
      metadata: {
        ...(params.runId ? { runId: params.runId } : {}),
        ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        operation: attempt === 1 ? "completion_review" : "completion_review_repair",
        llmStage: "review",
      },
    })) {
      if (chunk.type === "text_delta") raw += chunk.delta
    }

    const parsed = parseCompletionReviewResult(raw)
    const criterionGate =
      parsed && contextReceipt.evidenceRefs.length > 0
        ? evaluateCompletionReviewCriterionGate({
            review: parsed,
            allowedEvidenceRefs: contextReceipt.evidenceRefs,
            freshnessEvidenceRefs,
            expectedConditions,
            requiresSuccessfulToolEvidence:
              params.requiresSuccessfulToolEvidence === true,
            successfulToolEvidenceRefs,
          })
        : { ok: true as const }
    const terminalGate = parsed
      ? evaluateCompletionReviewTerminalGate({
          review: parsed,
          allowedEvidenceRefs: contextReceipt.evidenceRefs,
        })
      : { ok: true as const }
    const followupGate = parsed
      ? evaluateCompletionReviewFollowupGate(
          parsed,
          params.successfulTools ?? [],
          contextReceipt.evidenceRefs,
          freshnessEvidenceRefs,
        )
      : { ok: true as const }
    const repeatedTransition =
      parsed?.status === "followup" &&
      parsed.followupExecutionMode === "response_only" &&
      params.seenFollowupTransitionKeys?.has(
        buildStructuredFollowupKey({
          kind: "followup",
          summary: parsed.summary,
          reason: parsed.reason,
          remainingItems: parsed.remainingItems,
          followupPrompt: parsed.followupPrompt ?? "",
          followupEvidenceRefs: parsed.followupEvidenceRefs,
          evidenceRevisionRefs: contextReceipt.evidenceRefs,
          followupExecutionMode: parsed.followupExecutionMode,
          ...(parsed.followupRequiredToolNames
            ? { followupRequiredToolNames: parsed.followupRequiredToolNames }
            : {}),
          ...(parsed.followupTargetRefs
            ? { followupTargetRefs: parsed.followupTargetRefs }
            : {}),
        }, contextReceipt.evidenceRefs),
      ) === true
    if (
      parsed
      && criterionGate.ok
      && terminalGate.ok
      && followupGate.ok
      && !repeatedTransition
    ) {
      log.debug("completion review accepted", { providerId, model, attempt })
      return { ...parsed, contextReceipt }
    }

    previousRaw = raw
    previousReason =
      parsed && !criterionGate.ok
        ? criterionGate.reasonCode
        : parsed && !terminalGate.ok
          ? terminalGate.reasonCode
        : parsed && !followupGate.ok
          ? followupGate.reasonCode
          : repeatedTransition
            ? "completion_review_followup_transition_repeated"
          : "completion_review_parse_failed"
    if (!parsed) {
      log.fieldDebug("completion_review_parse_rejected", {
        providerId,
        model,
        attempt,
        structuralReason: classifyCompletionReviewParseFailure(raw),
        characterCount: raw.length,
      })
    }
    params.onRejected?.(previousReason, attempt)
    log.debug("completion review rejected", {
      providerId,
      model,
      attempt,
      reasonCode: previousReason,
    })
  }

  return null
}

export function evaluateCompletionReviewFollowupGate(
  review: CompletionReviewResult,
  successfulTools: SuccessfulToolEvidence[] = [],
  allowedEvidenceRefs?: readonly string[],
  freshnessEvidenceRefs?: readonly string[],
):
  | { ok: true }
  | {
      ok: false
      reasonCode:
        | "completion_review_followup_evidence_missing"
        | "completion_review_followup_evidence_foreign"
        | "completion_review_followup_execution_missing"
        | "completion_review_followup_execution_invalid"
    } {
  if (review.status !== "followup") return { ok: true }
  const allowed = new Set(
    allowedEvidenceRefs ?? successfulTools.flatMap((item) =>
      item.evidenceSource?.sourceRef ? [item.evidenceSource.sourceRef] : []),
  )
  const cited = review.followupEvidenceRefs
  if (allowed.size > 0 && cited.length === 0) {
    return { ok: false, reasonCode: "completion_review_followup_evidence_missing" }
  }
  if (cited.some((ref) => !allowed.has(ref))) {
    return { ok: false, reasonCode: "completion_review_followup_evidence_foreign" }
  }
  if (!review.followupExecutionMode) {
    return { ok: false, reasonCode: "completion_review_followup_execution_missing" }
  }
  const freshnessAssessment = review.criterionAssessments?.find(
    (assessment) => assessment.criterionKey === "freshness",
  )
  const responseOnlyFreshnessInvalid =
    review.followupExecutionMode === "response_only" &&
    freshnessAssessment?.applicable === true &&
    freshnessEvidenceRefs !== undefined &&
    (
      freshnessAssessment.evidenceRefs.length === 0 ||
      freshnessAssessment.evidenceRefs.some(
        (ref) => !freshnessEvidenceRefs.includes(ref),
      )
    )
  const followupToolNames = review.followupRequiredToolNames ?? []
  if (
    (review.followupExecutionMode === "tool" &&
      (
        followupToolNames.length !== 1
        || !followupToolNames[0]?.trim()
      )) ||
    (review.followupExecutionMode === "response_only" &&
      (Boolean(review.followupRequiredToolNames?.length) ||
        responseOnlyFreshnessInvalid ||
        review.criterionAssessments?.some(
          (assessment) =>
            assessment.applicable &&
            assessment.verdict !== "satisfied" &&
            COMPLETION_REVIEW_EVIDENCE_ACQUISITION_CRITERION_KEYS.has(
              assessment.criterionKey,
            ),
        ) === true))
  ) {
    return { ok: false, reasonCode: "completion_review_followup_execution_invalid" }
  }
  return { ok: true }
}

export function buildCompletionReviewSystemPrompt(
  options: { workDir?: string | undefined; locale?: "ko" | "en" | undefined } = {},
): string {
  const locale = options.locale ?? "en"
  return [
    loadPromptTemplate({
      sourceId: "completion_review",
      workDir: options.workDir,
      locale,
    }),
    loadBundledPromptTemplate({
      sourceId: "completion_review_policy_v2",
      locale,
    }),
    loadBundledPromptTemplate({
      sourceId: "completion_review_contract_v2",
      locale,
    }),
  ].join("\n\n")
}

export function parseCompletionReviewResult(raw: string): CompletionReviewResult | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const jsonLike = extractJsonObject(trimmed)
  if (!jsonLike) return null

  try {
    const parsed = JSON.parse(jsonLike) as Partial<Record<string, unknown>>
    const status = normalizeStatus(parsed.status)
    if (!status) return null
    const inputRequirement = parseUserInputRequirement({
      resolutionKind: parsed.input_resolution_kind,
      missingFields: parsed.missing_fields,
    })
    if (
      (status === "ask_user" && !inputRequirement)
      || (
        status !== "ask_user"
        && !hasEmptyNonAskUserInputFields(parsed)
      )
    ) return null

    const criterionAssessments = parseCriterionAssessments(parsed.criterion_assessments)
    const conditionAssessments = parseConditionAssessments(parsed.condition_assessments)
    const terminalEvidence = parseTerminalEvidence(parsed)
    return {
      status,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "",
      ...(typeof parsed.followup_prompt === "string" && parsed.followup_prompt.trim()
        ? { followupPrompt: parsed.followup_prompt.trim() }
        : {}),
      followupEvidenceRefs: Array.isArray(parsed.followup_evidence_refs)
        ? [...new Set(parsed.followup_evidence_refs
            .filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
            .map((ref) => ref.trim()))]
        : [],
      ...(parsed.followup_execution_mode === "tool" ||
      parsed.followup_execution_mode === "response_only"
        ? { followupExecutionMode: parsed.followup_execution_mode }
        : {}),
      followupRequiredToolNames: Array.isArray(parsed.followup_required_tool_names)
        ? [...new Set(parsed.followup_required_tool_names
            .filter(
              (name): name is string =>
                typeof name === "string" && /^[a-z][a-z0-9_]{0,63}$/u.test(name.trim()),
            )
            .map((name) => name.trim()))]
        : [],
      followupTargetRefs: Array.isArray(parsed.followup_target_refs)
        ? [...new Set(parsed.followup_target_refs
            .filter(
              (ref): ref is string =>
                typeof ref === "string" && ref.trim().length > 0 && ref.trim().length <= 2048,
            )
            .map((ref) => ref.trim()))]
        : [],
      ...(typeof parsed.user_message === "string" && parsed.user_message.trim()
        ? { userMessage: parsed.user_message.trim() }
        : {}),
      ...(inputRequirement ? { inputRequirement } : {}),
      remainingItems: Array.isArray(parsed.remaining_items)
        ? parsed.remaining_items.filter(
            (item): item is string => typeof item === "string" && item.trim().length > 0,
          )
        : [],
      ...(criterionAssessments ? { criterionAssessments } : {}),
      ...(conditionAssessments ? { conditionAssessments } : {}),
      ...(terminalEvidence ? { terminalEvidence } : {}),
    }
  } catch {
    return null
  }
}

function hasEmptyNonAskUserInputFields(parsed: Partial<Record<string, unknown>>): boolean {
  const resolutionKind = parsed.input_resolution_kind
  const missingFields = parsed.missing_fields
  const resolutionKindEmpty = resolutionKind === undefined || resolutionKind === ""
  const missingFieldsEmpty = missingFields === undefined
    || (Array.isArray(missingFields) && missingFields.length === 0)
  return resolutionKindEmpty && missingFieldsEmpty
}

function classifyCompletionReviewParseFailure(raw: string):
  | "empty"
  | "json_object_missing"
  | "json_invalid"
  | "status_invalid"
  | "input_requirement_invalid" {
  const trimmed = raw.trim()
  if (!trimmed) return "empty"
  const jsonLike = extractJsonObject(trimmed)
  if (!jsonLike) return "json_object_missing"
  try {
    const parsed = JSON.parse(jsonLike) as Partial<Record<string, unknown>>
    const status = normalizeStatus(parsed.status)
    if (!status) return "status_invalid"
    const inputRequirement = parseUserInputRequirement({
      resolutionKind: parsed.input_resolution_kind,
      missingFields: parsed.missing_fields,
    })
    if (
      (status === "ask_user" && !inputRequirement)
      || (status !== "ask_user" && !hasEmptyNonAskUserInputFields(parsed))
    ) return "input_requirement_invalid"
    return "json_invalid"
  } catch {
    return "json_invalid"
  }
}

function parseEvidenceRefs(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value
        .filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
        .map((ref) => ref.trim()))]
    : []
}

function parseTerminalEvidence(
  parsed: Partial<Record<string, unknown>>,
): CompletionReviewTerminalEvidence | undefined {
  const hasTerminalFields =
    parsed.blocker_evidence_refs !== undefined
    || parsed.evaluated_alternative_evidence_refs !== undefined
    || parsed.excluded_candidate_evidence_refs !== undefined
  if (!hasTerminalFields) return undefined
  return {
    blockerEvidenceRefs: parseEvidenceRefs(parsed.blocker_evidence_refs),
    evaluatedAlternativeEvidenceRefs: parseEvidenceRefs(
      parsed.evaluated_alternative_evidence_refs,
    ),
    excludedCandidateEvidenceRefs: parseEvidenceRefs(
      parsed.excluded_candidate_evidence_refs,
    ),
  }
}

function parseConditionAssessments(value: unknown): CompletionReviewConditionAssessment[] | null {
  if (!Array.isArray(value)) return null
  const assessments: CompletionReviewConditionAssessment[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const record = item as Record<string, unknown>
    const conditionId = record.condition_id
    const verdict = record.verdict
    if (typeof conditionId !== "string" || !/^condition:[a-f0-9]{64}$/u.test(conditionId))
      return null
    if (verdict !== "satisfied" && verdict !== "unsatisfied" && verdict !== "uncertain") return null
    if (
      !Array.isArray(record.evidence_refs) ||
      !record.evidence_refs.every((ref) => typeof ref === "string" && ref.trim())
    )
      return null
    assessments.push({
      conditionId: conditionId as `condition:${string}`,
      verdict,
      evidenceRefs: [...new Set(record.evidence_refs.map((ref) => (ref as string).trim()))],
      uncertainty: typeof record.uncertainty === "string" ? record.uncertainty.trim() : "",
      reason: typeof record.reason === "string" ? record.reason.trim() : "",
    })
  }
  return assessments
}

function parseCriterionAssessments(value: unknown): CompletionReviewCriterionAssessment[] | null {
  if (!Array.isArray(value)) return null
  const assessments: CompletionReviewCriterionAssessment[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") return null
    const record = item as Record<string, unknown>
    const criterionKey = record.criterion_key
    const verdict = record.verdict
    if (!COMPLETION_REVIEW_CRITERION_KEYS.includes(criterionKey as CompletionReviewCriterionKey))
      return null
    if (verdict !== "satisfied" && verdict !== "unsatisfied" && verdict !== "uncertain") return null
    if (typeof record.applicable !== "boolean") return null
    if (
      !Array.isArray(record.evidence_refs) ||
      !record.evidence_refs.every((ref) => typeof ref === "string" && ref.trim())
    )
      return null
    assessments.push({
      criterionKey: criterionKey as CompletionReviewCriterionKey,
      applicable: record.applicable,
      verdict,
      evidenceRefs: [...new Set(record.evidence_refs.map((ref) => (ref as string).trim()))],
      uncertainty: typeof record.uncertainty === "string" ? record.uncertainty.trim() : "",
      reason: typeof record.reason === "string" ? record.reason.trim() : "",
    })
  }
  return assessments
}

export function evaluateCompletionReviewCriterionGate(input: {
  review: CompletionReviewResult
  allowedEvidenceRefs: string[]
  freshnessEvidenceRefs?: string[]
  expectedConditions?: CompletionReviewExpectedCondition[]
  requiresSuccessfulToolEvidence?: boolean
  successfulToolEvidenceRefs?: string[]
}): CompletionReviewCriterionGateResult {
  if (
    input.review.status === "complete"
    && input.requiresSuccessfulToolEvidence === true
    && (input.successfulToolEvidenceRefs?.length ?? 0) === 0
  ) {
    return {
      ok: false,
      reasonCode: "completion_review_required_tool_evidence_missing",
    }
  }
  const assessments = input.review.criterionAssessments
  if (!assessments || assessments.length === 0) {
    return { ok: false, reasonCode: "completion_review_criteria_missing" }
  }
  const keys = assessments.map((assessment) => assessment.criterionKey)
  if (new Set(keys).size !== keys.length) {
    return { ok: false, reasonCode: "completion_review_criteria_duplicate" }
  }
  if (
    keys.length !== COMPLETION_REVIEW_CRITERION_KEYS.length ||
    COMPLETION_REVIEW_CRITERION_KEYS.some((key) => !keys.includes(key))
  ) {
    return { ok: false, reasonCode: "completion_review_criteria_incomplete" }
  }
  const allowedEvidenceRefs = new Set(input.allowedEvidenceRefs)
  if (
    assessments.some((assessment) =>
      assessment.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref)),
    )
  ) {
    return { ok: false, reasonCode: "completion_review_evidence_ref_foreign" }
  }
  const expectedConditionIds = (input.expectedConditions ?? []).map(
    (condition) => condition.conditionId,
  )
  if (expectedConditionIds.length > 0) {
    const conditionAssessments = input.review.conditionAssessments
    if (!conditionAssessments || conditionAssessments.length === 0) {
      return { ok: false, reasonCode: "completion_review_conditions_missing" }
    }
    const conditionIds = conditionAssessments.map((assessment) => assessment.conditionId)
    if (new Set(conditionIds).size !== conditionIds.length) {
      return { ok: false, reasonCode: "completion_review_conditions_duplicate" }
    }
    if (
      conditionIds.length !== expectedConditionIds.length ||
      expectedConditionIds.some((conditionId) => !conditionIds.includes(conditionId))
    ) {
      return { ok: false, reasonCode: "completion_review_conditions_mismatch" }
    }
    if (
      conditionAssessments.some((assessment) =>
        assessment.evidenceRefs.some((ref) => !allowedEvidenceRefs.has(ref)),
      )
    ) {
      return { ok: false, reasonCode: "completion_review_evidence_ref_foreign" }
    }
    if (
      input.review.status === "complete" &&
      conditionAssessments.some((assessment) => assessment.verdict !== "satisfied")
    ) {
      return { ok: false, reasonCode: "completion_review_condition_not_satisfied" }
    }
    if (
      input.review.status === "complete" &&
      conditionAssessments.some((assessment) => assessment.evidenceRefs.length === 0)
    ) {
      return { ok: false, reasonCode: "completion_review_condition_evidence_missing" }
    }
  }
  if (
    input.review.status === "complete" &&
    assessments.some((assessment) => assessment.applicable && assessment.verdict !== "satisfied")
  ) {
    return { ok: false, reasonCode: "completion_review_applicable_criterion_not_satisfied" }
  }
  if (
    input.review.status === "complete" &&
    assessments.some((assessment) => assessment.applicable && assessment.evidenceRefs.length === 0)
  ) {
    return { ok: false, reasonCode: "completion_review_criterion_evidence_missing" }
  }
  const freshnessAssessment = assessments.find(
    (assessment) => assessment.criterionKey === "freshness",
  )
  if (
    input.review.status === "complete" &&
    freshnessAssessment?.applicable &&
    input.freshnessEvidenceRefs !== undefined
  ) {
    const freshnessEvidenceRefs = new Set(input.freshnessEvidenceRefs)
    if (
      freshnessAssessment.evidenceRefs.length === 0 ||
      freshnessAssessment.evidenceRefs.some((ref) => !freshnessEvidenceRefs.has(ref))
    ) {
      return { ok: false, reasonCode: "completion_review_freshness_evidence_invalid" }
    }
  }
  if (
    input.review.status === "complete" &&
    !assessments.some((assessment) => assessment.applicable && assessment.evidenceRefs.length > 0)
  ) {
    return { ok: false, reasonCode: "completion_review_complete_without_evidence_refs" }
  }
  return { ok: true }
}

export function evaluateCompletionReviewTerminalGate(input: {
  review: CompletionReviewResult
  allowedEvidenceRefs: readonly string[]
}): CompletionReviewTerminalGateResult {
  if (input.review.status !== "blocked" && input.review.status !== "paths_exhausted") {
    return { ok: true }
  }
  const terminal = input.review.terminalEvidence
  if (!terminal) {
    return { ok: false, reasonCode: "completion_review_terminal_evidence_missing" }
  }
  const allowed = new Set(input.allowedEvidenceRefs)
  const allTerminalRefs = [
    ...terminal.blockerEvidenceRefs,
    ...terminal.evaluatedAlternativeEvidenceRefs,
    ...terminal.excludedCandidateEvidenceRefs,
  ]
  if (allTerminalRefs.some((ref) => !allowed.has(ref))) {
    return { ok: false, reasonCode: "completion_review_terminal_evidence_foreign" }
  }
  if (terminal.evaluatedAlternativeEvidenceRefs.length === 0) {
    return { ok: false, reasonCode: "completion_review_alternative_evidence_missing" }
  }
  if (
    input.review.status === "blocked"
    && terminal.blockerEvidenceRefs.length === 0
  ) {
    return { ok: false, reasonCode: "completion_review_blocker_evidence_missing" }
  }
  if (input.review.status === "paths_exhausted") {
    const evaluated = new Set(terminal.evaluatedAlternativeEvidenceRefs)
    const excluded = new Set(terminal.excludedCandidateEvidenceRefs)
    if (
      evaluated.size === 0
      || evaluated.size !== excluded.size
      || [...evaluated].some((ref) => !excluded.has(ref))
    ) {
      return {
        ok: false,
        reasonCode: "completion_review_candidate_exclusion_incomplete",
      }
    }
  }
  return { ok: true }
}

function extractJsonObject(text: string): string | null {
  const withoutFence = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  const start = withoutFence.indexOf("{")
  const end = withoutFence.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  return withoutFence.slice(start, end + 1)
}

function normalizeStatus(value: unknown): CompletionReviewStatus | null {
  return value === "complete"
    || value === "followup"
    || value === "ask_user"
    || value === "blocked"
    || value === "paths_exhausted"
    ? value
    : null
}
