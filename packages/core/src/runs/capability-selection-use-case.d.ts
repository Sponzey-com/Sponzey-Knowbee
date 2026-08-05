import type { CapabilitySelectionDecisionTraceSink } from "../contracts/capability-selection-decision-trace.js";
import { type CapabilitySelectionSnapshot, type LlmCapabilitySelectionAdmission, type LlmCapabilitySelectionAttemptProvider, type LlmCapabilitySelectionContext, type LlmCapabilitySelectionSchemaRepairProvider, type LlmCapabilitySelectionValidationCode } from "../contracts/llm-capability-selection.js";
type CapabilitySelectionUseCaseTerminalResult = LlmCapabilitySelectionAdmission | {
    status: "failed";
    reasonCode: "capability_selection_context_invalid" | "capability_selection_provider_failed" | "capability_selection_timed_out" | "capability_selection_output_limit_exceeded" | "capability_selection_invalid_output" | "capability_selection_trace_failed";
    validationReasonCodes?: Array<LlmCapabilitySelectionValidationCode | "invalid_json" | "json_object_required">;
    attemptCount: 0 | 1 | 2;
} | {
    status: "cancelled";
    reasonCode: "capability_selection_cancelled";
    attemptCount: 1 | 2;
};
export type CapabilitySelectionUseCaseResult = CapabilitySelectionUseCaseTerminalResult & {
    decisionTraceId?: string;
    strategyFingerprints?: string[];
};
export declare function executeCapabilitySelection(input: {
    runId: string;
    receiptId: string;
    capabilitySnapshot: CapabilitySelectionSnapshot;
    selectionContext: LlmCapabilitySelectionContext;
    provider: LlmCapabilitySelectionAttemptProvider;
    repairProvider?: LlmCapabilitySelectionSchemaRepairProvider;
    traceSink?: CapabilitySelectionDecisionTraceSink;
    userMethodSpecified: boolean;
    externalTransferAllowed: boolean;
    maxCost: "none" | "low" | "high";
}): Promise<CapabilitySelectionUseCaseResult>;
export {};
//# sourceMappingURL=capability-selection-use-case.d.ts.map