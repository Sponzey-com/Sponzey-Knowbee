import type {
  ChannelSmokeRunResult,
  ChannelSmokeScenarioKind,
} from "./smoke-runner.js"

export interface ChannelSemanticOutcomeMatrixValidation {
  status: "passed" | "failed"
  failures: string[]
}

const REQUIRED_KINDS: readonly ChannelSmokeScenarioKind[] = [
  "basic_query",
  "web_skill",
  "approval_required_tool",
  "artifact_delivery",
  "failure_tool",
]
const REQUIRED_CHANNELS = ["webui", "telegram"] as const

function normalized(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort()
}

function sameValues(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = normalized(left)
  const normalizedRight = normalized(right)
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

export function validateTelegramWebUiSemanticOutcomeMatrix(
  results: readonly ChannelSmokeRunResult[],
): ChannelSemanticOutcomeMatrixValidation {
  const failures: string[] = []

  for (const kind of REQUIRED_KINDS) {
    const matched = new Map<
      (typeof REQUIRED_CHANNELS)[number],
      ChannelSmokeRunResult | undefined
    >()
    for (const channel of REQUIRED_CHANNELS) {
      const candidates = results.filter(
        (result) =>
          result.scenario.channel === channel && result.scenario.kind === kind,
      )
      if (candidates.length === 0) {
        failures.push(`scenario_missing:${channel}:${kind}`)
        matched.set(channel, undefined)
        continue
      }
      if (candidates.length > 1) {
        failures.push(`scenario_duplicate:${channel}:${kind}`)
      }
      const candidate = candidates[0]
      matched.set(channel, candidate)
      if (candidate?.status !== "passed") {
        failures.push(`scenario_result_not_passed:${channel}:${kind}`)
      }
      if (!candidate?.trace?.semanticOutcome) {
        failures.push(`semantic_outcome_missing:${channel}:${kind}`)
      }
      const review = candidate?.trace?.semanticReview
      if (!review) {
        failures.push(`semantic_review_missing:${channel}:${kind}`)
      } else {
        const required = normalized(review.requiredCompletionConditionIds)
        const satisfied = normalized(review.satisfiedCompletionConditionIds)
        if (
          required.length === 0
          || !sameValues(required, satisfied)
          || normalized(review.reasonCodes).length === 0
          || normalized(review.evidenceRefs).length === 0
        ) {
          failures.push(`semantic_review_incomplete:${channel}:${kind}`)
        }
      }
    }

    const webUiOutcome = matched.get("webui")?.trace?.semanticOutcome
    const telegramOutcome = matched.get("telegram")?.trace?.semanticOutcome
    if (!webUiOutcome || !telegramOutcome) continue
    if (webUiOutcome.executionStatus !== telegramOutcome.executionStatus) {
      failures.push(`semantic_outcome_mismatch:${kind}:execution`)
    }
    if (webUiOutcome.deliveryStatus !== telegramOutcome.deliveryStatus) {
      failures.push(`semantic_outcome_mismatch:${kind}:delivery`)
    }
    const webUiReview = matched.get("webui")?.trace?.semanticReview
    const telegramReview = matched.get("telegram")?.trace?.semanticReview
    if (!webUiReview || !telegramReview) continue
    if (
      !sameValues(
        webUiReview.satisfiedCompletionConditionIds,
        telegramReview.satisfiedCompletionConditionIds,
      )
    ) {
      failures.push(`semantic_outcome_mismatch:${kind}:completion_coverage`)
    }
    if (!sameValues(webUiReview.reasonCodes, telegramReview.reasonCodes)) {
      failures.push(`semantic_outcome_mismatch:${kind}:reason_codes`)
    }
    if (webUiReview.terminalReport !== telegramReview.terminalReport) {
      failures.push(`semantic_outcome_mismatch:${kind}:terminal_report`)
    }
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
  }
}
