import { type CapabilitySelectionDecisionTraceSink } from "../contracts/capability-selection-decision-trace.js";
import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js";
export declare function createSqliteCapabilitySelectionDecisionTraceSink(input: {
    requestGroupId?: string;
    sessionId?: string;
    source?: string;
    receiptRepository: LlmInvocationReceiptRepository;
    now?: () => number;
}): CapabilitySelectionDecisionTraceSink;
//# sourceMappingURL=capability-selection-decision-trace-adapter.d.ts.map