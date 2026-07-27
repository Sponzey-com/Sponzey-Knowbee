import type Database from "better-sqlite3";
import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js";
import type { YeonjangEvidenceEnvelope } from "./evidence.js";
import { type YeonjangSideEffectGoalValidationReasonCode } from "./side-effect-goal-validation.js";
import type { YeonjangToolRiskLevel } from "./tool-mapping.js";
export type RuntimeYeonjangSideEffectGoalValidationReasonCode = "manual_result_details_invalid" | "manual_result_not_candidate" | "candidate_not_ready" | YeonjangSideEffectGoalValidationReasonCode;
export type RuntimeYeonjangSideEffectGoalValidationResult = {
    status: "validated";
    evidence: YeonjangEvidenceEnvelope;
    publicSummary: {
        operationId: string;
        runId: string;
        workId: string;
        adapterId: string;
        state: "MANUAL_INTERVENTION";
        revision: number;
        transitionCount: number;
    };
} | {
    status: "not_validated";
    reasonCode: RuntimeYeonjangSideEffectGoalValidationReasonCode;
    detail?: string;
};
export interface ValidateRuntimeYeonjangSideEffectGoalInput {
    db: Database.Database;
    manualResultDetails: unknown;
    expectedRunId: string;
    expectedWorkId?: string;
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
    now?: () => number;
}
export declare function validateRuntimeYeonjangSideEffectGoal(input: ValidateRuntimeYeonjangSideEffectGoalInput): Promise<RuntimeYeonjangSideEffectGoalValidationResult>;
//# sourceMappingURL=side-effect-goal-validation-runtime.d.ts.map