import {
  validateCanonicalPromptResponsibilityManifest,
  type CanonicalPromptManifestIssueCode,
  type CanonicalPromptModuleId,
  type CanonicalPromptResponsibilityManifestEntry,
} from "../contracts/canonical-prompt-responsibility-manifest.js"
import {
  GOAL_REVIEW_GATE_REQUIRED_KEYS,
  validateGoalReviewGateReport,
  type GoalReviewGateIssueCode,
  type GoalReviewGateReport,
} from "../contracts/goal-review-gate.js"
import {
  auditGoalRuleOwnership,
  type GoalDocumentRuleOccurrence,
  type GoalDocumentRuleOwnershipIssueCode,
} from "./goal-ownership.js"

export type GoalDocumentReviewIssue =
  | {
      source: "review_gate"
      code: GoalReviewGateIssueCode
      subjectId: string
    }
  | {
      source: "document_ownership"
      code: GoalDocumentRuleOwnershipIssueCode
      subjectId: string
    }
  | {
      source: "prompt_manifest"
      code: CanonicalPromptManifestIssueCode
      subjectId: string
    }

export type GoalDocumentReviewAcceptanceDecision =
  | {
      status: "eligible"
      documentGateKeys: string[]
      moduleIds: CanonicalPromptModuleId[]
    }
  | {
      status: "blocked"
      issues: GoalDocumentReviewIssue[]
    }

export function decideGoalDocumentReviewAcceptance(input: {
  report: Partial<GoalReviewGateReport>
  section10Occurrences: readonly GoalDocumentRuleOccurrence[]
  promptManifest: readonly CanonicalPromptResponsibilityManifestEntry[]
}): GoalDocumentReviewAcceptanceDecision {
  const gate = validateGoalReviewGateReport(input.report)
  const ownership = auditGoalRuleOwnership({ occurrences: input.section10Occurrences })
  const manifest = validateCanonicalPromptResponsibilityManifest(input.promptManifest)
  const issues: GoalDocumentReviewIssue[] = [
    ...gate.issues.map((issue): GoalDocumentReviewIssue => ({
      source: "review_gate",
      code: issue.code,
      subjectId: issue.key ?? issue.category,
    })),
    ...ownership.diagnostics.map((issue): GoalDocumentReviewIssue => ({
      source: "document_ownership",
      code: issue.code,
      subjectId: issue.ruleKey,
    })),
    ...(manifest.status === "blocked"
      ? manifest.issues.map((issue): GoalDocumentReviewIssue => ({
          source: "prompt_manifest",
          code: issue.code,
          subjectId: issue.subjectId,
        }))
      : []),
  ]

  if (issues.length > 0) return { status: "blocked", issues }
  return {
    status: "eligible",
    documentGateKeys: [...GOAL_REVIEW_GATE_REQUIRED_KEYS.documentStructure],
    moduleIds: manifest.status === "eligible" ? [...manifest.moduleIds] : [],
  }
}
