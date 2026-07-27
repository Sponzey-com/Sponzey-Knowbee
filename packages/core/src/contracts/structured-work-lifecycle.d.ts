import { type DiagnosisRoutingState, type LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
import { type LlmSolutionPlanReceipt } from "./llm-solution-plan-receipt.js";
import type { LlmRequestDiagnosisRecord, LlmResultDiagnosisRecord, WorkStepPlanItem } from "./work-record.js";
export interface StructuredWorkComplexitySignals {
    toolCount: number;
    subAgentCount: number;
    usesYeonjang: boolean;
    requiresApproval: boolean;
    changesFiles: boolean;
    longRunning: boolean;
}
export type StructuredWorkClassification = "simple" | "complex";
export interface StructuredWorkPlanDecision {
    workId: string;
    runId: string;
    ownerAgentName: string;
    classification: StructuredWorkClassification;
    requestReceiptId: string;
    solutionPlanReceiptId: string;
    requestIntent: string;
    missingInformation: string[];
    clarificationRequired: boolean;
    requestAction: LlmRequestDiagnosisRecord["recommended_action"];
    steps: WorkStepPlanItem[];
    lifecycleStates: DiagnosisRoutingState[];
}
export interface StructuredWorkLifecycleStepResult {
    stepId: string;
    outputRef: string;
    evidenceRefs: string[];
}
export type StructuredWorkLifecyclePhase = "input" | "decision" | "execution" | "validation" | "output";
export interface StructuredWorkLifecycleTraceEvent {
    workId: string;
    phase: StructuredWorkLifecyclePhase;
    reasonCode: string;
    stepIds: string[];
    referenceIds: string[];
}
export interface StructuredWorkLifecycleProjection {
    workId: string;
    status: "running" | "completed" | "awaiting_user" | "blocked";
    resultReceiptId: string;
    lifecycleStates: DiagnosisRoutingState[];
    trace: StructuredWorkLifecycleTraceEvent[];
    outputRefs: string[];
    evidenceRefs: string[];
}
export declare function planStructuredWorkLifecycle(input: {
    workId: string;
    runId?: string;
    ownerAgentName: string;
    subjectPayload: unknown;
    diagnosis: LlmRequestDiagnosisRecord;
    receipt: LlmDiagnosisReceipt | undefined;
    requestDiagnosisIssuedAt?: number;
    solutionPlanReceipt?: LlmSolutionPlanReceipt | undefined;
    complexity: StructuredWorkComplexitySignals;
    proposedSteps: WorkStepPlanItem[];
}): StructuredWorkPlanDecision;
export declare function projectStructuredWorkLifecycle(input: {
    plan: StructuredWorkPlanDecision;
    stepResults: StructuredWorkLifecycleStepResult[];
    resultSubjectPayload: unknown;
    resultDiagnosis: LlmResultDiagnosisRecord;
    resultReceipt: LlmDiagnosisReceipt | undefined;
}): StructuredWorkLifecycleProjection;
//# sourceMappingURL=structured-work-lifecycle.d.ts.map