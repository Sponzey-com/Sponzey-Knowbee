import { type LlmSolutionPlanPayload, type LlmSolutionPlanReceipt } from "./llm-solution-plan-receipt.js";
export interface LlmSolutionPlanProviderInput {
    workId: string;
    runId: string;
    ownerAgentName: string;
    requestDiagnosisReceiptId: string;
    goal: string;
    constraints: string[];
    capabilityRefs: string[];
    capabilityOptions?: LlmSolutionPlanCapabilityOption[];
    requiredCapabilityRefs: string[];
    completionCriteria: string[];
}
export interface LlmSolutionPlanCapabilityOption {
    capabilityRef: string;
    description: string;
    risk: "safe" | "approval_required";
    effectClass: "read_only" | "local_write" | "external_write" | "destructive" | "financial";
}
export interface LlmSolutionPlanProvider {
    planSolution(input: LlmSolutionPlanProviderInput): Promise<unknown> | unknown;
}
export interface LlmSolutionPlanValidationIssue {
    code: "solution_plan_schema_invalid";
    path: "$";
    message: string;
}
export interface LlmSolutionPlanRepairProviderInput {
    subject: LlmSolutionPlanProviderInput;
    invalidRawOutput: unknown;
    validationIssues: LlmSolutionPlanValidationIssue[];
    failedInputRefs: ["llm-output:solution_plan"];
    failedStrategy: "initial_llm_solution_plan";
    repairAttemptNumber: 1;
}
export interface LlmSolutionPlanRepairProvider {
    repairSolutionPlan(input: LlmSolutionPlanRepairProviderInput): Promise<unknown> | unknown;
}
export interface SolutionPlanCapabilitySelection {
    stepId: string;
    capabilityRef: string;
}
export type LlmSolutionPlanProviderResult = {
    status: "valid";
    workId: string;
    runId: string;
    plan: LlmSolutionPlanPayload;
    receipt: LlmSolutionPlanReceipt;
    capabilitySelections: SolutionPlanCapabilitySelection[];
} | {
    status: "blocked";
    reasonCode: "invalid_solution_plan_output" | "invalid_solution_plan_receipt" | "solution_plan_capability_ref_missing" | "solution_plan_capability_ref_ambiguous" | "solution_plan_capability_ref_outside_snapshot" | "solution_plan_required_capability_ref_missing";
    workId: string;
    runId: string;
};
export type LlmSolutionPlanProviderWithRepairResult = (Extract<LlmSolutionPlanProviderResult, {
    status: "valid";
}> & {
    repairAttempted: boolean;
}) | {
    status: "blocked";
    reasonCode: "invalid_solution_plan_output" | "invalid_solution_plan_receipt" | CapabilityRefValidationReason | "solution_plan_repair_provider_missing" | "invalid_solution_plan_after_schema_repair";
    workId: string;
    runId: string;
    repairAttempted: boolean;
    repairFailureReasonCode?: Extract<LlmSolutionPlanProviderResult, {
        status: "blocked";
    }>["reasonCode"];
    reanalysis?: {
        action: "changed_strategy_reanalysis";
        failedInputRefs: ["llm-output:solution_plan", "llm-output:repaired_solution_plan"];
        failedStrategies: ["initial_llm_solution_plan", "schema_repair"];
    };
};
type CapabilityRefValidationReason = "solution_plan_capability_ref_missing" | "solution_plan_capability_ref_ambiguous" | "solution_plan_capability_ref_outside_snapshot" | "solution_plan_required_capability_ref_missing";
export declare function runLlmSolutionPlanProvider(input: {
    provider: LlmSolutionPlanProvider;
    workId: string;
    runId: string;
    ownerAgentName: string;
    requestDiagnosisReceiptId: string;
    requestDiagnosisIssuedAt: number;
    issuedAt: number;
    goal: string;
    constraints: string[];
    capabilityRefs: string[];
    requiredCapabilityRefs?: string[];
    completionCriteria: string[];
}): Promise<LlmSolutionPlanProviderResult>;
export declare function runLlmSolutionPlanProviderWithRepair(input: Parameters<typeof runLlmSolutionPlanProvider>[0] & {
    repairProvider?: LlmSolutionPlanRepairProvider;
}): Promise<LlmSolutionPlanProviderWithRepairResult>;
export {};
//# sourceMappingURL=llm-solution-plan-provider.d.ts.map