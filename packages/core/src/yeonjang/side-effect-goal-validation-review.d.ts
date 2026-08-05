import type Database from "better-sqlite3";
import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js";
import type { SuccessfulToolEvidence } from "../runs/recovery.js";
import type { AnyTool } from "../tools/types.js";
import { validateRuntimeYeonjangSideEffectGoal, type RuntimeYeonjangSideEffectGoalValidationReasonCode } from "./side-effect-goal-validation-runtime.js";
import type { YeonjangToolRiskLevel } from "./tool-mapping.js";
export interface YeonjangSideEffectGoalValidationCandidate {
    toolName: string;
    output: string;
    details: unknown;
}
export interface YeonjangSideEffectGoalValidationToolMetadata {
    methodIds: string[];
    group: string;
    riskLevel: YeonjangToolRiskLevel;
    requiresApproval: boolean;
}
export type YeonjangSideEffectGoalValidationToolMetadataResolver = (toolName: string) => YeonjangSideEffectGoalValidationToolMetadata | null;
export interface YeonjangSideEffectGoalValidationAppendResult {
    added: number;
    skipped: Array<{
        toolName: string;
        reasonCode: "provider_missing" | "tool_metadata_missing" | "tool_metadata_invalid" | "candidate_not_validated";
        detail?: RuntimeYeonjangSideEffectGoalValidationReasonCode | string;
    }>;
}
export declare function collectYeonjangSideEffectGoalValidationCandidate(input: {
    toolName: string;
    success: boolean;
    output: string;
    details: unknown;
    candidates: YeonjangSideEffectGoalValidationCandidate[];
}): boolean;
export declare function resolveRuntimeToolMetadataFromDispatcher(toolName: string): YeonjangSideEffectGoalValidationToolMetadata | null;
export declare function resolveRuntimeToolMetadataFromTool(tool: Pick<AnyTool, "runtimeMethodIds" | "riskLevel" | "requiresApproval" | "name">): YeonjangSideEffectGoalValidationToolMetadata | null;
export declare function validateAndAppendYeonjangSideEffectGoalValidationEvidence(input: {
    db: Database.Database;
    provider?: LlmDiagnosisProvider | undefined;
    runId: string;
    ownerAgentName: string;
    originalRequest: string;
    completionConditions: string[];
    candidates: readonly YeonjangSideEffectGoalValidationCandidate[];
    successfulTools: SuccessfulToolEvidence[];
    resolveToolMetadata?: YeonjangSideEffectGoalValidationToolMetadataResolver | undefined;
    validateRuntimeGoal?: typeof validateRuntimeYeonjangSideEffectGoal | undefined;
}): Promise<YeonjangSideEffectGoalValidationAppendResult>;
//# sourceMappingURL=side-effect-goal-validation-review.d.ts.map