import type { CompletionReviewResult } from "../agent/completion-review.js";
import type { ChannelSource } from "../channels/contracts.js";
import type { DeliveryOutcome } from "./delivery.js";
import type { SuccessfulToolEvidence } from "./recovery.js";
/**
 * Preserve the capability plan's direct-delivery obligation after an effect has
 * produced a typed artifact. This is an execution-order guard, not a semantic
 * decision: the LLM already selected direct delivery during intake/planning.
 */
export declare function enforceDirectArtifactDeliveryFollowup(input: {
    source: ChannelSource;
    deliveryOutcome: DeliveryOutcome;
    successfulTools: readonly SuccessfulToolEvidence[];
    review: CompletionReviewResult | null;
}): CompletionReviewResult | null;
//# sourceMappingURL=direct-artifact-delivery-followup.d.ts.map