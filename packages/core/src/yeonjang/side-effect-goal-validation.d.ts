import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js";
import type { SideEffectOperationReceipt } from "../contracts/side-effect-operation.js";
import type { SideEffectOperationAggregate } from "../runs/side-effect-operation-use-case.js";
import type { YeonjangEvidenceEnvelope } from "./evidence.js";
import type { YeonjangToolRiskLevel } from "./tool-mapping.js";
export type YeonjangSideEffectGoalValidationReasonCode = "side_effect_operation_not_manual" | "side_effect_operation_receipt_missing" | "side_effect_operation_receipt_invalid" | "llm_goal_validation_failed";
export type YeonjangSideEffectGoalValidationResult = {
    status: "validated";
    evidence: YeonjangEvidenceEnvelope;
} | {
    status: "not_validated";
    reasonCode: YeonjangSideEffectGoalValidationReasonCode;
    detail?: string;
};
export interface ValidateYeonjangSideEffectGoalInput {
    operation: SideEffectOperationAggregate;
    loadReceipt: (receiptId: string) => SideEffectOperationReceipt | undefined;
    provider: LlmDiagnosisProvider;
    ownerAgentName: string;
    toolName: string;
    methodIds: string[];
    group: string;
    riskLevel: YeonjangToolRiskLevel;
    requiresApproval: boolean;
    targetRef: string;
    userRequestSummary: string;
    expectedOutput: string;
    publicToolOutput: string;
    sanitizedObservedStateSummary: string;
    risks?: string[];
    collectedAt?: number;
}
export declare function validateYeonjangSideEffectGoal(input: ValidateYeonjangSideEffectGoalInput): Promise<YeonjangSideEffectGoalValidationResult>;
//# sourceMappingURL=side-effect-goal-validation.d.ts.map