import type { AgentPromptImprovementAuthorizationDecision } from "./agent-prompt-improvement-authorization.js";
import type { PromptSourceApplicationDecision } from "./platform-prompt-activation-boundary.js";
import type { PromptImprovementApplicationGateDecision } from "./prompt-improvement-application-gate.js";
export declare const RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS: readonly ["safety", "permission", "user_identity", "agent_identity", "response_language", "llm_final_response", "memory_isolation", "delegation_rules", "yeonjang_authorization", "approval", "audit", "rollback", "next_run_activation", "stop_condition"];
export type RecursivePromptBehaviorInvariant = typeof RECURSIVE_PROMPT_BEHAVIOR_INVARIANTS[number];
export declare const REQUIRED_HARNESS_REGRESSION_TEST_IDS: readonly ["entry_conditions", "required_inputs", "invariants", "approval", "regression_tests", "audit_log", "rollback", "activation_confirmation"];
export type RequiredHarnessRegressionTestId = typeof REQUIRED_HARNESS_REGRESSION_TEST_IDS[number];
export declare const PROMPT_IMPROVEMENT_ENTRY_TRIGGER_KINDS: readonly ["user_harness_change", "administrator_prompt_maintenance", "regression_or_validation_failure", "safety_vulnerability", "goal_behavior_mismatch", "casual_chat", "ordinary_task", "ambiguous_improvement", "protected_boundary_bypass", "target_source_missing", "invariant_weakening", "runtime_environment_mutation", "hidden_instruction_mutation"];
export type PromptImprovementEntryTriggerKind = typeof PROMPT_IMPROVEMENT_ENTRY_TRIGGER_KINDS[number];
export type PromptImprovementEntryActorType = "user" | "administrator" | "system";
export interface PromptImprovementEntryReceipt {
    schemaVersion: 1;
    requestId: string;
    actorId: string;
    actorType: PromptImprovementEntryActorType;
    classifiedBy: "llm";
    diagnosisReceiptId: string;
    triggerKind: PromptImprovementEntryTriggerKind;
    diagnosedAction: "enter_prompt_improvement" | "ask_clarification" | "ordinary_request" | "stop_blocked";
    explicitRequest: boolean;
    targetSourceRefs: string[];
    evidenceRefs: string[];
    diagnosedAt: number;
    expiresAt: number;
}
export type PromptImprovementEntryReasonCode = "entry_receipt_invalid" | "entry_receipt_expired" | "llm_diagnosis_required" | "actor_not_authorized" | "explicit_confirmation_required" | "trigger_evidence_required" | "target_source_required" | "ordinary_request" | "needs_clarification" | "protected_boundary_bypass" | "target_source_missing" | "invariant_weakening" | "runtime_environment_mutation" | "hidden_instruction_mutation";
export type PromptImprovementEntryDecision = {
    status: "authorized";
    state: "intake";
    requestId: string;
    triggerKind: Extract<PromptImprovementEntryTriggerKind, "user_harness_change" | "administrator_prompt_maintenance" | "regression_or_validation_failure" | "safety_vulnerability" | "goal_behavior_mismatch">;
    targetSourceRefs: string[];
    evidenceRefs: string[];
} | {
    status: "blocked";
    state: "blocked";
    reasonCode: PromptImprovementEntryReasonCode;
    nextAction: "ask_explicit_prompt_change_confirmation" | "continue_ordinary_request" | "repair_entry_evidence" | "report_protected_boundary";
};
export interface HarnessRegressionSuiteReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    status: "passed" | "failed";
    requiredTestIds: RequiredHarnessRegressionTestId[];
    passedTestIds: RequiredHarnessRegressionTestId[];
    sourceFingerprint: string;
}
export interface HarnessExplicitApprovalReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    decision: "approved" | "denied";
    scope: "harness_apply";
    approvedBy: string;
    issuedAt: number;
    expiresAt: number;
}
export interface RecursivePromptImprovementTriggerReceipt {
    requestId: string;
    diagnosisReceiptId: string;
    classifiedBy: "llm";
    classification: "explicit_prompt_improvement" | "ambiguous_prompt_improvement" | "protected_invariant_bypass" | "casual_chat" | "ordinary_task";
    diagnosedAction: "prompt_improvement_proposal" | "ask_clarification" | "ordinary_request" | "stop_blocked";
    explicitRequest: boolean;
    targetPromptSourceRefs: string[];
    protectedInvariantBypassRequested: boolean;
}
export interface RecursivePromptHarnessGateReceipt {
    schemaVersion: 1;
    harnessRunId: string;
    proposalFingerprint: string;
    ownershipFingerprint: string;
    invariantReviewFingerprint: string;
    controllingHarnessFingerprint: string;
    activeHarnessFingerprint: string;
    state: "approval_wait";
    attempt: number;
    maxAttempts: number;
    priorProposalFingerprints: string[];
    passedInvariants: RecursivePromptBehaviorInvariant[];
    regressionReceiptRefs: string[];
    changeKind: "prompt_source" | "harness";
    riskLevel?: "low" | "medium" | "high";
    harnessRegressionSuite?: HarnessRegressionSuiteReceipt;
    harnessApproval?: HarnessExplicitApprovalReceipt;
    rollbackRef: string;
    trigger: RecursivePromptImprovementTriggerReceipt;
    issuedAt: number;
    expiresAt: number;
}
export type RecursivePromptImprovementGateDecision = {
    status: "authorized";
    harnessRunId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
} | {
    status: "blocked";
    reasonCode: "harness_receipt_invalid" | "explicit_improvement_trigger_required" | "improvement_trigger_diagnosis_mismatch" | "improvement_target_required" | "protected_invariant_bypass_blocked" | "harness_receipt_expired" | "inactive_harness_control" | "attempt_limit_invalid" | "proposal_repeat_detected" | "behavior_invariant_incomplete" | "regression_receipt_missing" | "harness_regression_suite_missing" | "harness_regression_suite_failed" | "harness_regression_suite_incomplete" | "harness_high_risk_required" | "harness_explicit_approval_required" | "rollback_missing" | "agent_authorization_blocked" | "behavior_gate_blocked" | "source_application_blocked" | "proposal_scope_mismatch";
};
export declare function authorizePromptImprovementEntry(input: {
    receipt: PromptImprovementEntryReceipt;
    now: number;
}): PromptImprovementEntryDecision;
export declare function enterAuthorizedPromptImprovement<T>(input: {
    decision: PromptImprovementEntryDecision;
    enter: (authorization: Extract<PromptImprovementEntryDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "entered";
    result: T;
} | Extract<PromptImprovementEntryDecision, {
    status: "blocked";
}>>;
export declare function authorizeRecursivePromptImprovement(input: {
    harness: RecursivePromptHarnessGateReceipt;
    agentAuthorization: AgentPromptImprovementAuthorizationDecision;
    behaviorGate: PromptImprovementApplicationGateDecision;
    sourceApplication: PromptSourceApplicationDecision;
    expectedOwnershipFingerprint: string;
    expectedInvariantReviewFingerprint: string;
    now: number;
}): RecursivePromptImprovementGateDecision;
export declare function writeRecursivePromptImprovement<T>(input: {
    decision: RecursivePromptImprovementGateDecision;
    write: (authorization: Extract<RecursivePromptImprovementGateDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | Extract<RecursivePromptImprovementGateDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=recursive-prompt-improvement-gate.d.ts.map