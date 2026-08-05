import { type ParentAggregationChildInput, type ParentAggregationInput, type ParentAggregationRuntimeEventInput, type ParentAggregationTrace } from "../agent/sub-agent-result-review.js";
import { type ChildResultTrustReasonCode } from "../contracts/child-result-trust.js";
export interface AggregateChildResultInput extends Omit<ParentAggregationInput, "parentAgentId"> {
    parentRunId: string;
    parentAgentId: string;
    directChildAgentIds: string[];
    childResults: ParentAggregationChildInput[];
}
export interface ChildResultTrustRejection {
    subSessionId: string;
    reasonCode: ChildResultTrustReasonCode;
}
export interface TrustedChildResultSource {
    subSessionId: string;
    sourceRef: string;
}
export interface AggregateChildResultOutput {
    trace: ParentAggregationTrace;
    event: ParentAggregationRuntimeEventInput;
    finalDeliveryAllowed: boolean;
    nextAction: ParentAggregationTrace["nextAction"];
    blockedSubSessionIds: string[];
    limitedSubSessionIds: string[];
    unverifiedSubSessionIds: string[];
    trustRejections: ChildResultTrustRejection[];
    trustedChildSources: TrustedChildResultSource[];
}
export interface AggregateChildResultDependencies {
    appendParentEvent?: (parentRunId: string, label: string) => Promise<void> | void;
    recordOrchestrationEvent?: (input: {
        eventKind: "parent_child_result_aggregated";
        runId: string;
        subSessionId?: string;
        agentId?: string;
        correlationId: string;
        dedupeKey: string;
        source: string;
        summary: string;
        payload: Record<string, unknown>;
    }) => void;
}
export declare class AggregateChildResult {
    private readonly dependencies;
    constructor(dependencies?: AggregateChildResultDependencies);
    execute(input: AggregateChildResultInput): Promise<AggregateChildResultOutput>;
}
//# sourceMappingURL=aggregate-child-result.d.ts.map