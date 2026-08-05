import type { StopReportInput } from "./stop-report-decision.js"
import type { VerifiedFailureReportFacts } from "./verified-failure-report.js"

export type CanonicalResultOutcome = "completed" | "partial" | "impossible" | "blocked"
export type CanonicalResultLanguage = "ko" | "en"
export type CanonicalNextActionKind = "user_action" | "required_condition"

export interface CanonicalNextAction {
  kind: CanonicalNextActionKind
  text: string
}

export interface CanonicalResultReportInput {
  goalId: string
  workId: string
  outcome: CanonicalResultOutcome
  primaryLanguage: CanonicalResultLanguage
  completedScope: string[]
  unresolvedScope: string[]
  reasonCode: string
  verifiedReasonFacts: string[]
  evidenceRefs: string[]
  nextActions: CanonicalNextAction[]
}

export interface CanonicalResultReportFacts extends CanonicalResultReportInput {
  schemaVersion: 1
}

export type CanonicalResultReportSource =
  | {
      kind: "completion"
      report: StopReportInput
      workId: string
      primaryLanguage: CanonicalResultLanguage
      completedScope: string[]
      verifiedReasonFacts: string[]
    }
  | {
      kind: "verified_failure"
      report: VerifiedFailureReportFacts
      goalId: string
      workId: string
      completedScope: string[]
    }

function required(value: string, field: string, maxLength = 500): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} is required.`)
  if (normalized.length > maxLength)
    throw new Error(`${field} must not exceed ${maxLength} characters.`)
  return normalized
}

function unique(values: readonly string[], field: string): string[] {
  const normalized = values.map((value) => required(value, field))
  if (new Set(normalized).size !== normalized.length)
    throw new Error(`${field} values must be unique.`)
  return normalized
}

export function buildCanonicalResultReportFacts(
  input: CanonicalResultReportInput,
): CanonicalResultReportFacts {
  const goalId = required(input.goalId, "Goal ID")
  const workId = required(input.workId, "Work ID")
  const completedScope = unique(input.completedScope, "Completed scope")
  const unresolvedScope = unique(input.unresolvedScope, "Unresolved scope")
  const verifiedReasonFacts = unique(input.verifiedReasonFacts, "Verified reason fact")
  const evidenceRefs = unique(input.evidenceRefs, "Evidence reference")
  const reasonCode = required(input.reasonCode, "Reason code", 120)
  const nextActions = input.nextActions.map((action) => ({
    kind: action.kind,
    text: required(action.text, "Next action", 240),
  }))

  if (verifiedReasonFacts.length === 0)
    throw new Error("At least one verified reason fact is required.")
  if (input.outcome === "completed") {
    if (completedScope.length === 0) throw new Error("Completed report requires completed scope.")
    if (unresolvedScope.length > 0)
      throw new Error("Completed report cannot contain unresolved scope.")
    if (evidenceRefs.length === 0) throw new Error("Completed report requires evidence.")
  } else {
    if (unresolvedScope.length === 0)
      throw new Error(`${input.outcome} report requires unresolved scope.`)
    if (nextActions.length === 0)
      throw new Error(`${input.outcome} report requires at least one next action.`)
  }
  if (input.outcome === "partial" && completedScope.length === 0) {
    throw new Error("Partial report requires completed scope.")
  }
  if (input.outcome === "impossible" && evidenceRefs.length === 0) {
    throw new Error("Impossible report requires evidence.")
  }
  if (
    input.outcome === "blocked" &&
    !nextActions.some((action) => action.kind === "required_condition")
  ) {
    throw new Error("Blocked report requires at least one required condition.")
  }

  return {
    schemaVersion: 1,
    goalId,
    workId,
    outcome: input.outcome,
    primaryLanguage: input.primaryLanguage,
    completedScope,
    unresolvedScope,
    reasonCode,
    verifiedReasonFacts,
    evidenceRefs,
    nextActions,
  }
}

export function mapCanonicalResultReportFacts(
  source: CanonicalResultReportSource,
): CanonicalResultReportFacts {
  if (source.kind === "completion") {
    if (source.report.reasonCode !== "goal_achieved") {
      throw new Error("Canonical completed reporting requires a goal-achieved stop source.")
    }
    return buildCanonicalResultReportFacts({
      goalId: source.report.goalId,
      workId: source.workId,
      outcome: "completed",
      primaryLanguage: source.primaryLanguage,
      completedScope: source.completedScope,
      unresolvedScope: [],
      reasonCode: source.report.reasonCode,
      verifiedReasonFacts: source.verifiedReasonFacts,
      evidenceRefs: source.report.evidenceRefs,
      nextActions: [],
    })
  }

  const report = source.report
  const outcome: CanonicalResultOutcome =
    report.outcome === "partial"
      ? "partial"
      : report.verifiedReason.reasonCode === "concrete_impossibility"
        ? "impossible"
        : "blocked"
  return buildCanonicalResultReportFacts({
    goalId: source.goalId,
    workId: source.workId,
    outcome,
    primaryLanguage: report.primaryLanguage,
    completedScope: source.completedScope,
    unresolvedScope: report.failedScope,
    reasonCode: report.verifiedReason.reasonCode,
    verifiedReasonFacts: [report.verifiedReason.text],
    evidenceRefs: report.verifiedReason.evidenceRefs,
    nextActions: report.nextActions.map((text) => ({
      kind: outcome === "blocked" ? "required_condition" : "user_action",
      text,
    })),
  })
}
