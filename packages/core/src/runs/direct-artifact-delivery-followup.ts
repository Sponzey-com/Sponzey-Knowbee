import type { CompletionReviewResult } from "../agent/completion-review.js"
import type { ChannelSource } from "../channels/contracts.js"
import type { DeliveryOutcome } from "./delivery.js"
import type { SuccessfulToolEvidence } from "./recovery.js"

const DELIVERY_TOOL_BY_SOURCE: Partial<Record<ChannelSource, string>> = {
  telegram: "telegram_send_file",
  slack: "slack_send_file",
} as const

interface VerifiedArtifactForDelivery {
  artifactRef: string
  evidenceRef: string
}

/**
 * Preserve the capability plan's direct-delivery obligation after an effect has
 * produced a typed artifact. This is an execution-order guard, not a semantic
 * decision: the LLM already selected direct delivery during intake/planning.
 */
export function enforceDirectArtifactDeliveryFollowup(input: {
  source: ChannelSource
  deliveryOutcome: DeliveryOutcome
  successfulTools: readonly SuccessfulToolEvidence[]
  review: CompletionReviewResult | null
}): CompletionReviewResult | null {
  if (
    !input.deliveryOutcome.directArtifactDeliveryRequested
    || input.deliveryOutcome.deliverySatisfied
  ) {
    return input.review
  }

  const requiredToolName = DELIVERY_TOOL_BY_SOURCE[input.source]
  if (!requiredToolName) return input.review
  const artifact = latestVerifiedArtifact(input.successfulTools)
  if (!artifact) return input.review

  return {
    ...(input.review ?? {
      criterionAssessments: [],
      conditionAssessments: [],
    }),
    status: "followup",
    summary: "A verified artifact is ready; channel delivery remains pending.",
    reason: "The requested artifact exists, but no channel delivery receipt has been recorded.",
    followupPrompt: `Verified artifact reference for the required delivery: ${artifact.artifactRef}`,
    followupEvidenceRefs: [artifact.evidenceRef],
    followupExecutionMode: "tool",
    followupRequiredToolNames: [requiredToolName],
    followupTargetRefs: [`channel:${input.source}`],
    remainingItems: ["Deliver the verified artifact to the current request channel and verify the delivery receipt."],
  }
}

function latestVerifiedArtifact(
  tools: readonly SuccessfulToolEvidence[],
): VerifiedArtifactForDelivery | null {
  for (const tool of [...tools].reverse()) {
    const details = record(tool.details)
    if (!details || details.kind !== "camera_artifact") continue
    const artifactRef = typeof details.artifactRef === "string"
      ? details.artifactRef.trim()
      : ""
    if (artifactRef.startsWith("artifact:")) {
      return {
        artifactRef,
        // The public camera projection intentionally excludes Yeonjang evidence
        // envelopes. The durable artifact reference is still a same-run typed
        // evidence reference and is sufficient for the delivery handoff.
        evidenceRef: tool.evidenceSource?.sourceRef?.trim() || artifactRef,
      }
    }
  }
  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
