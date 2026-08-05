import { detectPrimaryMessageLanguage } from "../channels/language.js"
import type {
  CanonicalResultOutcome,
  CanonicalResultReportFacts,
} from "../contracts/canonical-result-report.js"

const SPECULATION =
  /(?:아마|추측|것\s*같|일\s*수\s*있|maybe|probably|i\s+(?:think|guess)|it\s+(?:may|might))/iu
const INTERNAL_DETAIL =
  /(?:diagnosis|evidence|receipt|request|run|session|agent|goal|work)[_-]?(?:id|ref)?\s*[:=]/iu

export interface CanonicalResultReportLlmInput {
  instruction: string
  language: "ko" | "en"
  result: CanonicalResultOutcome
  completedScope: string[]
  unresolvedScope: string[]
  verifiedReasonFacts: string[]
  nextActions: Array<{ kind: "user_action" | "required_condition"; text: string }>
  reviewFeedback?: string
}

export interface CanonicalResultReportReviewPolicy {
  maxRepairAttempts: number
  maxReasonCharacters: number
  maxNextActionCharacters: number
  maxReportCharacters: number
}

export interface CanonicalResultReportLlmOutput {
  result: CanonicalResultOutcome
  reason: string
  nextAction: string
  text: string
}

export type CanonicalResultReportRenderer = (
  input: CanonicalResultReportLlmInput,
) => Promise<CanonicalResultReportLlmOutput>

export type CanonicalResultReportRenderResolution =
  | {
      status: "ready"
      outcome: CanonicalResultOutcome
      text: string
      textSource: "llm_reviewed"
      repairAttempts: number
    }
  | { status: "blocked"; reasonCode: string }

function sentenceCount(value: string): number {
  return value
    .trim()
    .split(/(?<=[.!?。！？])\s*/u)
    .map((part) => part.trim())
    .filter(Boolean).length
}

function invalidLanguage(value: string, expected: "ko" | "en"): boolean {
  const detected = detectPrimaryMessageLanguage(value)
  return detected !== "unknown" && detected !== expected
}

export async function renderCanonicalResultReport(input: {
  originalRequest: string
  facts: CanonicalResultReportFacts
  render: CanonicalResultReportRenderer
  reviewPolicy: CanonicalResultReportReviewPolicy
}): Promise<CanonicalResultReportRenderResolution> {
  if (!input.originalRequest.trim())
    return { status: "blocked", reasonCode: "original_request_missing" }
  const policy = input.reviewPolicy
  if (!Number.isSafeInteger(policy.maxRepairAttempts) || policy.maxRepairAttempts < 0) {
    throw new Error("Maximum repair attempts must be a non-negative integer.")
  }
  for (const [value, field] of [
    [policy.maxReasonCharacters, "Maximum reason characters"],
    [policy.maxNextActionCharacters, "Maximum next-action characters"],
    [policy.maxReportCharacters, "Maximum report characters"],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error(`${field} must be a positive integer.`)
  }

  const llmInput: CanonicalResultReportLlmInput = {
    instruction:
      "Return the result, one or two verified reason sentences, one concise next action when supplied, and final user-facing text. Use only supplied facts and the requested language.",
    language: input.facts.primaryLanguage,
    result: input.facts.outcome,
    completedScope: [...input.facts.completedScope],
    unresolvedScope: [...input.facts.unresolvedScope],
    verifiedReasonFacts: [...input.facts.verifiedReasonFacts],
    nextActions: input.facts.nextActions.map((action) => ({ ...action })),
  }

  let lastReasonCode = "report_review_failed"
  for (let attempt = 0; attempt <= policy.maxRepairAttempts; attempt += 1) {
    const output = await input.render(
      attempt === 0 ? llmInput : { ...llmInput, reviewFeedback: lastReasonCode },
    )
    const violation = reviewCanonicalResultOutput(output, input.facts, policy)
    if (violation) {
      lastReasonCode = violation
      continue
    }
    return {
      status: "ready",
      outcome: input.facts.outcome,
      text: output.text.trim(),
      textSource: "llm_reviewed",
      repairAttempts: attempt,
    }
  }
  return { status: "blocked", reasonCode: lastReasonCode }
}

function reviewCanonicalResultOutput(
  output: CanonicalResultReportLlmOutput,
  facts: CanonicalResultReportFacts,
  policy: CanonicalResultReportReviewPolicy,
): string | undefined {
  if (output.result !== facts.outcome) return "result_mismatch"
  const reason = output.reason.trim()
  if (sentenceCount(reason) < 1 || sentenceCount(reason) > 2) {
    return "reason_sentence_count_invalid"
  }
  if (reason.length > policy.maxReasonCharacters) return "reason_too_long"
  if (SPECULATION.test(reason)) return "speculative_reason"
  if (INTERNAL_DETAIL.test(reason) || INTERNAL_DETAIL.test(output.text)) {
    return "internal_detail_exposed"
  }
  const nextAction = output.nextAction.trim()
  if (facts.outcome !== "completed" && !nextAction) return "next_action_missing"
  if (nextAction.length > policy.maxNextActionCharacters) return "next_action_too_long"
  const text = output.text.trim()
  if (!text) return "report_text_missing"
  if (text.length > policy.maxReportCharacters) return "report_text_too_long"
  if (
    invalidLanguage([reason, nextAction, text].filter(Boolean).join(" "), facts.primaryLanguage)
  ) {
    return "language_mismatch"
  }
  return undefined
}

export async function applyCanonicalResultReport(input: {
  originalRequest: string
  facts: CanonicalResultReportFacts
  render: CanonicalResultReportRenderer
  reviewPolicy: CanonicalResultReportReviewPolicy
  deliver: (input: {
    outcome: CanonicalResultOutcome
    text: string
    textSource: "llm_reviewed"
  }) => Promise<void>
}): Promise<
  | { status: "delivered"; outcome: CanonicalResultOutcome }
  | { status: "blocked"; reasonCode: string }
> {
  const resolution = await renderCanonicalResultReport(input)
  if (resolution.status === "blocked") return resolution
  await input.deliver({
    outcome: resolution.outcome,
    text: resolution.text,
    textSource: resolution.textSource,
  })
  return { status: "delivered", outcome: resolution.outcome }
}
