import type {
  ResponseStrategyCategory,
  ResponseStrategyImprovementIntake,
} from "./response-strategy-improvement-intake.js"

export const RESPONSE_STRATEGY_CANONICAL_MODULES = [
  "prompts/task_intake.md",
  "prompts/workflow.md",
  "prompts/sub_agent_delegation.md",
  "prompts/result_review.md",
  "prompts/final_response.md",
] as const

export type ResponseStrategyCanonicalModule = typeof RESPONSE_STRATEGY_CANONICAL_MODULES[number]
export type FailureReportProposalPurpose = "result_review" | "user_output"

export interface ResponseStrategyProposalValidationCriterion {
  inputCondition: string
  expectedResult: string
  passCondition: string
}

export interface CanonicalResponseStrategyProposal {
  schemaVersion: 1
  strategyCategory: ResponseStrategyCategory
  targetModule: ResponseStrategyCanonicalModule
  changePurpose: string
  exactScope: string
  evidenceReceiptRefs: string[]
  validationCriteria: ResponseStrategyProposalValidationCriterion[]
  harnessProjection: {
    targetPromptSources: [ResponseStrategyCanonicalModule]
    allowedChangeScope: [ResponseStrategyCanonicalModule]
    responseStrategyTarget: ResponseStrategyCategory
    currentBehavior: string
    desiredBehavior: string
    userReactionEvidence: string[]
    requiredTests: string[]
  }
}

export type CanonicalResponseStrategyProposalDecision =
  | { status: "ready"; proposal: CanonicalResponseStrategyProposal }
  | {
      status: "rejected"
      reasonCode:
        | "failure_report_purpose_required"
        | "canonical_module_mismatch"
        | "broad_scope_rejected"
        | "evidence_not_in_intake"
        | "one_off_emotion_global_change"
    }

const BROAD_SCOPE = /^(?:all|global|everything|entire response|all responses|모든|전체|전역)(?:\s|$)/iu
const EXACT_SCOPE = /^(?:rule|behavior):[a-z0-9_.-]+$/iu

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  return normalized
}

function canonicalModule(input: {
  category: ResponseStrategyCategory
  failureReportPurpose?: FailureReportProposalPurpose
}): ResponseStrategyCanonicalModule | "purpose_required" {
  switch (input.category) {
    case "request_analysis":
    case "clarification":
      return "prompts/task_intake.md"
    case "solution_path":
      return "prompts/workflow.md"
    case "delegation":
      return "prompts/sub_agent_delegation.md"
    case "next_action":
      return "prompts/result_review.md"
    case "failure_report":
      if (!input.failureReportPurpose) return "purpose_required"
      return input.failureReportPurpose === "result_review"
        ? "prompts/result_review.md"
        : "prompts/final_response.md"
  }
}

export function buildCanonicalResponseStrategyProposal(input: {
  intake: ResponseStrategyImprovementIntake
  targetModules: ResponseStrategyCanonicalModule[]
  changePurpose: string
  exactScope: string
  evidenceReceiptRefs: string[]
  validationCriteria: ResponseStrategyProposalValidationCriterion[]
  failureReportPurpose?: FailureReportProposalPurpose
}): CanonicalResponseStrategyProposalDecision {
  if (input.intake.schemaVersion !== 1) throw new Error("Unsupported response-strategy intake schema version.")
  const expectedModule = canonicalModule({
    category: input.intake.candidate.category,
    ...(input.failureReportPurpose ? { failureReportPurpose: input.failureReportPurpose } : {}),
  })
  if (expectedModule === "purpose_required") {
    return { status: "rejected", reasonCode: "failure_report_purpose_required" }
  }
  if (input.targetModules.length !== 1 || input.targetModules[0] !== expectedModule) {
    return { status: "rejected", reasonCode: "canonical_module_mismatch" }
  }

  const changePurpose = required(input.changePurpose, "Change purpose")
  const exactScope = required(input.exactScope, "Exact scope")
  if (BROAD_SCOPE.test(exactScope) || !EXACT_SCOPE.test(exactScope)) {
    return { status: "rejected", reasonCode: "broad_scope_rejected" }
  }

  const availableReceipts = new Set(input.intake.evidence.map((item) => item.interactionReceiptRef))
  const evidenceReceiptRefs = [...new Set(input.evidenceReceiptRefs.map((value) => required(value, "Evidence receipt reference")))]
  if (evidenceReceiptRefs.length === 0 || evidenceReceiptRefs.some((value) => !availableReceipts.has(value))) {
    return { status: "rejected", reasonCode: "evidence_not_in_intake" }
  }
  const selectedEvidence = input.intake.evidence.filter((item) => evidenceReceiptRefs.includes(item.interactionReceiptRef))
  const emotionOnly = selectedEvidence.every((item) => item.kind === "satisfaction" || item.kind === "dissatisfaction")
  if (emotionOnly && new Set(selectedEvidence.map((item) => item.interactionReceiptRef)).size < 2) {
    return { status: "rejected", reasonCode: "one_off_emotion_global_change" }
  }

  if (input.validationCriteria.length === 0) throw new Error("At least one validation criterion is required.")
  const validationCriteria = input.validationCriteria.map((criterion) => ({
    inputCondition: required(criterion.inputCondition, "Validation input condition"),
    expectedResult: required(criterion.expectedResult, "Validation expected result"),
    passCondition: required(criterion.passCondition, "Validation pass condition"),
  }))
  return {
    status: "ready",
    proposal: {
      schemaVersion: 1,
      strategyCategory: input.intake.candidate.category,
      targetModule: expectedModule,
      changePurpose,
      exactScope,
      evidenceReceiptRefs,
      validationCriteria,
      harnessProjection: {
        targetPromptSources: [expectedModule],
        allowedChangeScope: [expectedModule],
        responseStrategyTarget: input.intake.candidate.category,
        currentBehavior: input.intake.candidate.currentBehavior,
        desiredBehavior: input.intake.candidate.desiredBehavior,
        userReactionEvidence: evidenceReceiptRefs,
        requiredTests: validationCriteria.map((criterion) =>
          `${criterion.inputCondition} => ${criterion.expectedResult}; pass=${criterion.passCondition}`),
      },
    },
  }
}
