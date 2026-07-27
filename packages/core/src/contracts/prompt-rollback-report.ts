import type { PromptRollbackRestorationReceipt } from "./prompt-rollback-execution.js"

export type PromptRollbackReportDecision =
  | {
      status: "authorized"
      rolledBackFiles: string[]
      reason: string
      restoredChecksum: string
      activationStateAfterRollback: "rolled_back"
      remainingRisk: string
      nextRecommendedAction: string
      evidenceRefs: string[]
    }
  | {
      status: "blocked"
      reasonCode:
        | "rollback_restoration_invalid"
        | "rolled_back_files_missing"
        | "rollback_reason_missing"
        | "activation_state_invalid"
        | "remaining_risk_missing"
        | "next_action_missing"
        | "rollback_report_lineage_mismatch"
    }

function present(value: string): boolean {
  return value.trim().length > 0
}

function uniqueNonEmpty(values: readonly string[]): string[] | null {
  const normalized = values.map((value) => value.trim())
  if (normalized.length === 0 || normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) {
    return null
  }
  return normalized
}

export function authorizePromptRollbackReport(input: {
  restoration: PromptRollbackRestorationReceipt
  rolledBackFiles: string[]
  reason: string
  activationStateAfterRollback: string
  remainingRisk: string
  nextRecommendedAction: string
}): PromptRollbackReportDecision {
  const restoration = input.restoration
  if (!present(restoration.sourceRef)
    || !present(restoration.restoredVersion)
    || !present(restoration.restoredChecksum)
    || !present(restoration.triggerEvidenceRef)
    || !present(restoration.readinessEvidenceRef)
    || !present(restoration.executionRef)
    || !present(restoration.verificationRef)) {
    return { status: "blocked", reasonCode: "rollback_restoration_invalid" }
  }
  const rolledBackFiles = uniqueNonEmpty(input.rolledBackFiles)
  if (!rolledBackFiles) return { status: "blocked", reasonCode: "rolled_back_files_missing" }
  if (!present(input.reason)) return { status: "blocked", reasonCode: "rollback_reason_missing" }
  if (input.activationStateAfterRollback !== "rolled_back") {
    return { status: "blocked", reasonCode: "activation_state_invalid" }
  }
  if (!present(input.remainingRisk)) return { status: "blocked", reasonCode: "remaining_risk_missing" }
  if (!present(input.nextRecommendedAction)) return { status: "blocked", reasonCode: "next_action_missing" }
  if (!rolledBackFiles.includes(restoration.sourceRef)) {
    return { status: "blocked", reasonCode: "rollback_report_lineage_mismatch" }
  }
  return {
    status: "authorized",
    rolledBackFiles,
    reason: input.reason.trim(),
    restoredChecksum: restoration.restoredChecksum,
    activationStateAfterRollback: "rolled_back",
    remainingRisk: input.remainingRisk.trim(),
    nextRecommendedAction: input.nextRecommendedAction.trim(),
    evidenceRefs: [
      restoration.triggerEvidenceRef,
      restoration.readinessEvidenceRef,
      restoration.executionRef,
      restoration.verificationRef,
    ],
  }
}

export async function publishAuthorizedPromptRollbackReport<T>(input: {
  decision: PromptRollbackReportDecision
  renderWithLlm: (facts: Extract<PromptRollbackReportDecision, { status: "authorized" }>) => Promise<T>
}): Promise<
  | { status: "reported"; text: T }
  | Extract<PromptRollbackReportDecision, { status: "blocked" }>
> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "reported", text: await input.renderWithLlm(input.decision) }
}
