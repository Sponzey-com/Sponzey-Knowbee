import type { ChannelSource } from "../channels/contracts.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { ResponseLanguageMode } from "../contracts/index.js";
import { type InstructionRuntimeContext } from "../instructions/merge.js";
import { type FirstResponseDeadline } from "../runs/first-response-deadline.js";
import { type IdentityClaim } from "./identity-claim.js";
import { type TaskIntakeIntentCategory } from "./intake-category.js";
export type { ResponseLanguageMode } from "../contracts/index.js";
export declare const LLM_INTAKE_RESULT_NOTE = "llm-intake-result";
export type TaskApprovalToolName = "screen_capture" | "yeonjang_camera_capture" | "mouse_click" | "keyboard_type" | "file_write" | "app_launch" | "external_action";
export interface TaskExecutionSemantics {
    filesystemEffect: "none" | "mutate";
    privilegedOperation: "none" | "required";
    artifactDelivery: "none" | "direct";
    approvalRequired: boolean;
    approvalTool: TaskApprovalToolName;
}
export type TaskStructuredRequestLanguage = "ko" | "en" | "unknown";
export interface TaskStructuredRequest {
    source_language: TaskStructuredRequestLanguage;
    response_language_mode?: ResponseLanguageMode;
    normalized_english: string;
    target: string;
    to: string;
    context: string[];
    complete_condition: string[];
}
export interface StructuredRequestEnvironment {
    destination: string;
    contextLines: string[];
}
export interface TaskIntakeIntent {
    category: TaskIntakeIntentCategory;
    summary: string;
    confidence: number;
}
export interface TaskIntakeUserMessage {
    mode: "direct_answer" | "accepted_receipt" | "failed_receipt" | "clarification_receipt";
    text: string;
}
export interface TaskIntakeActionItem {
    id: string;
    type: "reply" | "run_task" | "delegate_agent" | "create_schedule" | "update_schedule" | "cancel_schedule" | "ask_user" | "log_only";
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    reason: string;
    payload: Record<string, unknown>;
}
export interface TaskSchedulingSpec {
    detected: boolean;
    kind: "one_time" | "recurring" | "none";
    status: "accepted" | "failed" | "needs_clarification" | "not_applicable";
    schedule_text: string;
    cron?: string;
    run_at?: string;
    failure_reason?: string;
}
export interface TaskExecutionPlan {
    requires_run: boolean;
    requires_delegation: boolean;
    suggested_target: string;
    max_delegation_turns: number;
    needs_tools: boolean;
    needs_web: boolean;
    execution_semantics: TaskExecutionSemantics;
}
export interface TaskIntentEnvelope {
    intent_type: TaskIntakeIntent["category"];
    source_language: TaskStructuredRequestLanguage;
    response_language_mode?: ResponseLanguageMode;
    normalized_english: string;
    target: string;
    destination: string;
    context: string[];
    complete_condition: string[];
    schedule_spec: TaskSchedulingSpec;
    execution_semantics: TaskExecutionSemantics;
    delivery_mode: TaskExecutionSemantics["artifactDelivery"];
    requires_approval: boolean;
    approval_tool: TaskApprovalToolName;
    preferred_target: string;
    needs_tools: boolean;
    needs_web: boolean;
}
export interface TaskIntakeResult {
    intent: TaskIntakeIntent;
    user_message: TaskIntakeUserMessage;
    identity_claim: IdentityClaim;
    action_items: TaskIntakeActionItem[];
    structured_request: TaskStructuredRequest;
    intent_envelope: TaskIntentEnvelope;
    scheduling: TaskSchedulingSpec;
    execution: TaskExecutionPlan;
    notes: string[];
}
export declare function defaultTaskExecutionSemantics(): TaskExecutionSemantics;
export declare function defaultTaskStructuredRequest(): TaskStructuredRequest;
export declare function parseResponseLanguageMode(value: unknown): ResponseLanguageMode;
export declare function parseTaskExecutionSemantics(value: unknown): TaskExecutionSemantics;
export declare function inferStructuredRequestCompleteCondition(intent: TaskIntakeIntent, actionItems: TaskIntakeActionItem[], scheduling: TaskSchedulingSpec, environment: StructuredRequestEnvironment): string[];
export declare function promotePromissoryDirectAnswer(result: TaskIntakeResult, latestUserMessage: string): TaskIntakeResult;
export interface AnalyzeTaskIntakeParams {
    instructionRuntime: InstructionRuntimeContext;
    userMessage: string;
    sessionId?: string;
    requestGroupId?: string;
    model?: string;
    config: KnowbeeConfig;
    workDir?: string;
    source?: ChannelSource;
    signal?: AbortSignal;
    firstResponseDeadline?: FirstResponseDeadline;
    nowMs?: () => number;
}
export type TaskIntakeAnalysisFailureReason = "provider_contract_rejected" | "provider_unavailable" | "transport_failed" | "response_invalid" | "deadline_exceeded" | "cancelled";
export type TaskIntakeAnalysisOutcome = {
    status: "success";
    intake: TaskIntakeResult;
    directResponseProvenance: {
        taskIntakePromptSha256: string;
        finalResponsePromptSha256: string;
        providerInvocationRef: string;
    };
} | {
    status: "failure";
    reasonCode: TaskIntakeAnalysisFailureReason;
    retryable: boolean;
};
export declare function isTaskIntakeAnalysisOutcome(value: unknown): value is TaskIntakeAnalysisOutcome;
export declare function analyzeTaskIntakeOutcome(params: AnalyzeTaskIntakeParams): Promise<TaskIntakeAnalysisOutcome>;
export declare function analyzeTaskIntake(params: AnalyzeTaskIntakeParams): Promise<TaskIntakeResult | null>;
//# sourceMappingURL=intake.d.ts.map