import { type PromptImprovementRollbackSource } from "../contracts/prompt-rollback-source-policy.js";
import type { PromptChangeRollbackReadinessDecision } from "../contracts/prompt-change-rollback-readiness.js";
import { REQUIRED_HARNESS_GUARDRAILS, type PromptImprovementHarnessGuardrail } from "../contracts/harness-guardrails.js";
import { type RecursiveImprovementEvent, type RecursiveImprovementState } from "../contracts/recursive-improvement-state-machine.js";
export { PROMPT_ROLLBACK_SOURCE_MANIFEST, PROMPT_ROLLBACK_SOURCE_TYPES, validatePromptImprovementRollbackSource, } from "../contracts/prompt-rollback-source-policy.js";
export type { PromptImprovementRollbackSource, PromptImprovementRollbackSourceType, PromptImprovementRollbackSourceValidationResult, } from "../contracts/prompt-rollback-source-policy.js";
export type PromptImprovementKind = "prompt_source" | "harness_rule" | "harness_state_machine" | "harness_test_fixture" | "prompt_metadata";
export type PromptImprovementAgentType = "main" | "sub_agent";
export type PromptImprovementTriggerSource = "user_request" | "admin_request" | "regression_failure" | "safety_review" | "product_gap";
export type PromptImprovementApprovalMode = "none" | "user_required" | "admin_required";
export type PromptImprovementApprovalScope = "draft" | "apply_change" | "activation";
export type PromptImprovementRisk = "low" | "medium" | "high";
export type PromptImprovementChangeKind = "wording_clarification" | "behavior_change";
export type PromptImprovementImpactAxis = "task_processing" | "delegation_wording" | "workflow_generation" | "response_style" | "identity" | "user_data" | "memory" | "safety" | "refusal_behavior" | "tool" | "mcp" | "yeonjang" | "permission" | "activation" | "recursive_improvement";
export interface PromptImprovementImpactAssessment {
    changeKind: PromptImprovementChangeKind;
    impactAxes: PromptImprovementImpactAxis[];
}
export type PromptImprovementApplyPrerequisiteReasonCode = "apply_tests_missing" | "apply_rollback_target_missing" | "apply_rollback_unverified" | "apply_approval_missing" | "apply_approval_mode_invalid" | "apply_maintenance_approval_invalid";
export interface PromptImprovementMaintenanceApprovalReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    scope: "apply_change";
    approvedBy: string;
    decision: "approved" | "denied";
    approvedAt: number;
    expiresAt: number;
}
export type PromptImprovementApplyPrerequisiteDecision = {
    status: "authorized";
    risk: PromptImprovementRisk;
    tests: string[];
    rollbackTarget: string;
    approvalMode: PromptImprovementApprovalMode;
} | {
    status: "blocked";
    reasonCode: PromptImprovementApplyPrerequisiteReasonCode;
};
export type PromptImprovementSourceWriteState = "unchanged" | "written";
export type PromptImprovementActivationState = "unchanged" | "activation_pending" | "activated" | "rolled_back";
export type PromptImprovementActivationMethod = "restart" | "reload" | "registry_activation" | "explicit_prompt_version_activation";
export type PromptImprovementHarnessExecutionState = "completed" | "activation_pending" | "blocked" | "rolled_back";
export type PromptImprovementHarnessState = RecursiveImprovementState;
export type PromptImprovementHarnessEvent = RecursiveImprovementEvent;
export declare const PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES: readonly ["target", "input", "tool", "work_split", "execution_order", "verification_method"];
export type PromptImprovementRecoveryChangeAxis = typeof PROMPT_IMPROVEMENT_RECOVERY_CHANGE_AXES[number];
export interface PromptImprovementRecoveryStrategy {
    targetRef: string;
    inputFingerprint: string;
    toolIds: string[];
    workSplitFingerprint: string;
    executionOrderFingerprint: string;
    verificationMethod: string;
}
export type PromptImprovementBlockedEvidence = "user_limit_reached" | "safety_boundary_reached" | "safe_changed_strategies_exhausted";
export interface PromptImprovementTransitionContext {
    sourceWriteState: PromptImprovementSourceWriteState;
    blockedEvidence?: PromptImprovementBlockedEvidence;
}
export type PromptImprovementRecoveryDecision = {
    status: "proposal_revision_authorized";
    nextState: "proposal_drafting";
    changedAxes: PromptImprovementRecoveryChangeAxis[];
    retryCount: number;
} | {
    status: "strategy_change_required";
    nextState: "test_execution";
    reasonCode: "same_strategy" | "strategy_missing";
    retryCount: number;
} | {
    status: "blocked";
    nextState: "blocked";
    reasonCode: PromptImprovementBlockedEvidence;
    retryCount: number;
} | {
    status: "rollback_required";
    nextState: "rolled_back";
    reasonCode: PromptImprovementBlockedEvidence | "cancel_after_source_write";
    retryCount: number;
};
export type PromptImprovementInterruptDecision = {
    status: "transition_authorized";
    nextState: "blocked";
} | {
    status: "rollback_required";
    nextState: "rolled_back";
    reasonCode: "rollback_requested" | "cancel_after_source_write";
} | {
    status: "blocked";
    reasonCode: "interrupt_not_allowed" | "rollback_source_not_written" | "blocked_evidence_missing";
};
export interface PromptImprovementApprovalRecord {
    approvedBy: string;
    approvedAt: string;
    approvalScope: PromptImprovementApprovalScope[];
    targetPromptSources: string[];
    targetHarnessSources: string[];
    riskAccepted: PromptImprovementRisk;
}
export type PromptImprovementApprovalScopeDecision = {
    status: "authorized";
    scope: PromptImprovementApprovalScope;
    approvedBy: string;
} | {
    status: "blocked";
    reasonCode: "approval_record_missing" | "approval_scope_missing";
};
export interface PromptImprovementApprovalRequest {
    targetFiles: string[];
    changeSummary: string;
    riskLevel: PromptImprovementRisk;
    invariantsAffected: string[];
    testsToRun: string[];
    rollbackPlan: string;
    activationMethod: string;
    harnessChangeScope: string[];
    harnessGuardrailsToPreserve: string[];
    approvalMode: PromptImprovementApprovalMode;
    approvalScopesRequested: PromptImprovementApprovalScope[];
    activationIncluded: boolean;
}
export interface PromptImprovementActivePromptVersion {
    sourceRef: string;
    version: string;
    checksum?: string;
}
export interface PromptImprovementActivationRecord {
    state: "activated";
    activePromptVersions: PromptImprovementActivePromptVersion[];
    loadedByProcess: string;
    loadedByAgentName: string;
    activatedAt: string;
    activationMethod: PromptImprovementActivationMethod;
    testsBeforeActivation: string[];
    rollbackPath: string;
}
export interface PromptImprovementHarnessInput {
    improvementGoal: string;
    improvementKind: PromptImprovementKind;
    riskLevel?: PromptImprovementRisk;
    impactAssessment?: PromptImprovementImpactAssessment;
    improvingAgentName: string;
    improvingAgentType: PromptImprovementAgentType;
    parentReviewerAgentName?: string;
    triggerSource: PromptImprovementTriggerSource;
    targetPromptSources: string[];
    activeHarnessVersion: string;
    targetHarnessSources: string[];
    agentOwnedPromptScope: string[];
    currentBehavior: string;
    desiredBehavior: string;
    userReactionEvidence: string[];
    responseStrategyTarget: string;
    harnessChangeScope: string[];
    harnessGuardrailsToPreserve: string[];
    nonGoals: string[];
    allowedChangeScope: string[];
    requiredInvariants: string[];
    requiredTests: string[];
    approvalMode: PromptImprovementApprovalMode;
    approvalRecord?: PromptImprovementApprovalRecord;
    rollbackPlan: string;
}
export type PromptImprovementHarnessIssueCode = "required_field_missing" | "improvement_goal_not_specific" | "improvement_kind_invalid" | "improving_agent_name_invalid" | "improving_agent_type_invalid" | "target_prompt_source_missing" | "target_prompt_source_too_broad" | "target_prompt_source_invalid_ref" | "target_prompt_source_outside_allowed_scope" | "target_prompt_source_outside_agent_scope" | "source_write_target_mismatch" | "mutable_source_not_authorized" | "response_strategy_target_too_broad" | "response_strategy_target_not_owned" | "non_goal_invalid" | "non_goal_duplicate" | "non_goal_conflict" | "allowed_change_scope_invalid" | "allowed_change_scope_duplicate" | "required_invariant_invalid" | "required_invariant_duplicate" | "required_invariant_missing" | "required_test_invalid" | "required_test_duplicate" | "approval_mode_risk_mismatch" | "rollback_plan_invalid" | "sub_agent_parent_reviewer_missing" | "sub_agent_parent_reviewer_invalid" | "sub_agent_parent_reviewer_mismatch" | "active_harness_version_invalid" | "harness_source_missing" | "harness_source_invalid_ref" | "harness_source_duplicate" | "harness_change_scope_missing" | "harness_change_scope_invalid" | "harness_change_scope_duplicate" | "harness_guardrail_missing" | "harness_guardrail_invalid" | "harness_guardrail_duplicate" | "harness_explicit_request_required" | "harness_field_not_allowed" | "harness_admin_approval_required" | "approval_record_missing" | "approval_record_field_missing" | "approval_required" | "approval_scope_missing" | "approval_target_mismatch" | "approval_risk_mismatch" | "activation_source_missing" | "activation_loader_missing" | "activation_timestamp_missing" | "activation_method_missing" | "activation_test_evidence_missing" | "activation_rollback_missing" | "baseline_source_checksum_missing" | "baseline_rollback_target_missing" | "proposal_field_missing" | "proposal_invalid_risk" | "proposal_impact_assessment_missing" | "proposal_risk_underclassified" | "proposal_approval_required" | "proposal_review_failed" | "proposal_target_file_invalid_ref" | "proposal_input_record_invalid" | "proposal_input_scope_mismatch" | "proposal_input_non_goals_mismatch" | "proposal_input_invariants_mismatch" | "proposal_input_tests_mismatch" | "proposal_harness_high_risk_required" | "proposal_harness_scope_missing" | "proposal_harness_guardrail_missing" | "diff_target_missing" | "diff_reviewability_invalid" | "diff_too_large" | "diff_broad_rewrite_note_missing" | "diff_unrelated_rewrite" | "diff_outside_module" | "diff_duplicate_rule" | "diff_copied_rule_without_reference" | "diff_multi_file_rule_definition" | "diff_critical_rule_weakening" | "diff_access_broadened" | "diff_approval_removed" | "diff_stop_condition_removed" | "diff_harness_guardrail_weakening" | "diff_current_run_harness_application" | "diff_current_run_prompt_application" | "diff_ambiguous_wording" | "diff_unverifiable_wording" | "diff_execution_criteria_missing" | "diff_repetitive_rule" | "diff_overloaded_rule_sentence" | "diff_non_english_system_instruction" | "diff_user_language_rule_weakened" | "diff_final_response_llm_boundary_weakened" | "diff_prompt_source_conflict" | "diff_assembly_definition_duplicate" | "diff_agent_name_tests_missing" | "diff_activation_implied" | "diff_audit_rollback_removed" | "rollback_source_type_invalid" | "rollback_source_ref_missing" | "rollback_source_ref_invalid" | "invalid_state_transition";
export interface PromptImprovementHarnessIssue {
    code: PromptImprovementHarnessIssueCode;
    path: string;
    message: string;
}
export interface PromptImprovementHarnessValidationResult {
    ok: boolean;
    risk: PromptImprovementRisk;
    issues: PromptImprovementHarnessIssue[];
}
export interface PromptImprovementHarnessBlockedDecision {
    state: "blocked";
    risk: PromptImprovementRisk;
    missingFields: string[];
    issues: PromptImprovementHarnessIssue[];
}
export type PromptImprovementHarnessInputDecision = {
    state: "ready";
    risk: PromptImprovementRisk;
    input: PromptImprovementHarnessInput;
} | PromptImprovementHarnessBlockedDecision;
export declare const PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS: readonly ["versioned_prompt_file", "prompt_registry_record", "prompt_metadata", "prompt_test_fixture"];
export type PromptImprovementMutableSourceKind = typeof PROMPT_IMPROVEMENT_MUTABLE_SOURCE_KINDS[number];
export interface PromptImprovementMutableSourceDescriptor {
    sourceKind: PromptImprovementMutableSourceKind;
    sourceRef: string;
    baselineVersion: string;
    baselineChecksum: string;
    fixturePurpose?: "validation" | "regression";
}
export type PromptImprovementMutableSourceDecision = {
    status: "authorized";
    source: PromptImprovementMutableSourceDescriptor;
} | {
    status: "blocked";
    reasonCode: "source_kind_invalid" | "source_ref_invalid" | "source_version_missing" | "fixture_purpose_invalid";
};
export interface PromptImprovementMutableSourceAuditContext {
    runId: string;
    actor: string;
    timestamp: number;
}
export interface PromptImprovementMutableSourceAuditRecord extends PromptImprovementMutableSourceAuditContext {
    event: "prompt_improvement.mutable_source_execution";
    sourceKind: PromptImprovementMutableSourceKind | null;
    sourceRef: string | null;
    baselineVersion: string | null;
    baselineChecksum: string | null;
    writerKind: PromptImprovementMutableSourceKind;
    decision: "applied" | "blocked";
    reasonCode: "source_not_authorized" | "writer_kind_mismatch" | null;
}
export type PromptImprovementMutableSourceExecutionDecision<T> = {
    status: "applied";
    source: PromptImprovementMutableSourceDescriptor;
    result: T;
} | {
    status: "blocked";
    reasonCode: "source_not_authorized" | "writer_kind_mismatch";
};
export interface PromptImprovementActivationRecordValidationResult {
    ok: boolean;
    issues: PromptImprovementHarnessIssue[];
}
export interface PromptImprovementHarnessBaselineCapture {
    runId: string;
    timestamp: number;
    actor: string;
    triggerSource: PromptImprovementTriggerSource;
    targetPromptSources: string[];
    activeHarnessVersion: string;
    targetHarnessSources: string[];
    sourceChecksums: Array<{
        sourceRef: string;
        beforeChecksum: string;
    }>;
    currentPromptSummary: string;
    knownRegressionTests: string[];
    currentInvariants: string[];
    harnessGuardrailsSnapshot: string[];
    activationState: PromptImprovementActivationState;
    rollbackTarget: string;
}
export interface PromptImprovementHarnessReport {
    runId: string;
    startedAt: number;
    finishedAt: number;
    actor: string;
    triggerSource: PromptImprovementTriggerSource;
    state: PromptImprovementHarnessExecutionState;
    targetPromptSources: string[];
    changedPromptSources: string[];
    improvementGoal: string;
    behaviorBefore: string;
    behaviorAfter: string;
    riskLevel: PromptImprovementRisk;
    approvalRecord: {
        mode: PromptImprovementApprovalMode;
        required: boolean;
        granted: boolean;
        approvedBy?: string;
        approvedAt?: string;
        approvalScope: PromptImprovementApprovalScope[];
        targetPromptSources: string[];
        targetHarnessSources: string[];
        riskAccepted?: PromptImprovementRisk;
    };
    testsRequested: string[];
    testsPassed: string[];
    testsFailed: string[];
    activationState: PromptImprovementActivationState;
    rollbackState: "not_required" | "backup_available" | "source_control_required" | "rolled_back";
    baselineCapture: PromptImprovementHarnessBaselineCapture;
    baselineIntegrityIssues: PromptImprovementHarnessIssue[];
    activationRecord?: PromptImprovementActivationRecord;
    rollbackPlan: string;
    summary: string;
}
export interface PromptImprovementAuditRecord {
    runId: string;
    startedAt: number;
    finishedAt: number;
    actor: string;
    triggerSource: PromptImprovementTriggerSource;
    state: PromptImprovementHarnessExecutionState;
    targetPromptSources: string[];
    changedPromptSources: string[];
    improvementGoal: string;
    behaviorBefore: string;
    behaviorAfter: string;
    riskLevel: PromptImprovementRisk;
    approvalRecord: PromptImprovementHarnessReport["approvalRecord"];
    testsRequested: string[];
    testsPassed: string[];
    testsFailed: string[];
    activationState: PromptImprovementActivationState;
    rollbackState: PromptImprovementHarnessReport["rollbackState"];
    summary: string;
}
export type PromptImprovementAuditRecordDecision = {
    status: "authorized";
    record: PromptImprovementAuditRecord;
} | {
    status: "blocked";
    reasonCode: "audit_identity_invalid" | "audit_timestamp_invalid" | "audit_source_lineage_invalid" | "audit_content_invalid" | "audit_approval_invalid" | "audit_test_lineage_invalid" | "audit_state_inconsistent" | "audit_summary_missing";
};
export interface PromptImprovementProductLogEvent {
    level: "product";
    event: string;
    runId: string;
    state: PromptImprovementHarnessExecutionState;
    riskLevel?: PromptImprovementRisk;
    approvalRequired?: boolean;
    changedPromptSourceCount?: number;
    activationState?: PromptImprovementActivationState;
    rollbackState?: PromptImprovementHarnessReport["rollbackState"];
    summary?: string;
}
export interface PromptImprovementUserOutput {
    state: PromptImprovementHarnessExecutionState;
    inspectedPromptSources: string[];
    changedPromptSources: string[];
    changeReason: string;
    behaviorBefore: string;
    behaviorAfter: string;
    outcomeSummary: string;
    invariantsChecked: string[];
    testsPassed: string[];
    testsFailed: string[];
    activeNow: boolean;
    activationState: PromptImprovementActivationState;
    reloadOrRestartRequired: boolean;
    rollbackPath: string;
    promptChanged: boolean;
    noChangeStatement: string;
}
export type PromptImprovementProposalRisk = "low" | "medium" | "high";
export interface PromptImprovementProposalReview {
    passed: boolean;
    notes: string;
}
export interface PromptImprovementModuleBoundaryReview extends PromptImprovementProposalReview {
    canonicalModuleId: string;
    responsibilityIds: string[];
    overlappingRuleKeys: string[];
}
export interface PromptImprovementProposal {
    improvementKind: PromptImprovementKind;
    problem: string;
    rootCause: string;
    targetFiles: string[];
    proposedChangeSummary: string;
    expectedBehaviorAfterChange: string;
    nonGoals: string[];
    invariantsChecked: string[];
    testsToRun: string[];
    riskLevel: PromptImprovementProposalRisk;
    impactAssessment: PromptImprovementImpactAssessment;
    rollbackPlan: string;
    approvalRequired: boolean;
    harnessChangeScope: string[];
    harnessGuardrailsToPreserve: string[];
    clarityReview: PromptImprovementProposalReview;
    brevityReview: PromptImprovementProposalReview;
    moduleBoundaryReview: PromptImprovementModuleBoundaryReview;
}
export interface PromptImprovementProposalValidationResult {
    ok: boolean;
    issues: PromptImprovementHarnessIssue[];
}
export type PromptImprovementProposalWriteDecision<T> = {
    status: "written";
    result: T;
} | {
    status: "blocked";
    issues: PromptImprovementHarnessIssue[];
};
export interface PromptImprovementDiffAssessment {
    targetFiles: string[];
    changedSections: string[];
    changedLineCount: number;
    maxReviewableLineCount: number;
    unrelatedSectionsRewritten: boolean;
    outsideTargetModuleRules: string[];
    duplicatedCanonicalRules: string[];
    copiedRulesWithoutReferences: string[];
    multiFileRuleDefinitions: string[];
    weakensCriticalRules: PromptImprovementCriticalRuleWeakening[];
    broadenedAccess: PromptImprovementAccessExpansion[];
    removedApprovalRuleKeys: string[];
    removedStopConditionRuleKeys: string[];
    broadensToolMcpOrExternalAccess: boolean;
    removesApprovalRequirements: boolean;
    removesStopConditions: boolean;
    removedHarnessGuardrails: PromptImprovementRemovedHarnessGuardrail[];
    weakensHarnessGuardrails: string[];
    currentRunHarnessApplications: PromptImprovementCurrentRunHarnessApplication[];
    appliesChangedHarnessToCurrentRun: boolean;
    appliesChangedPromptToCurrentRun: boolean;
    ambiguousWordingEvidence: PromptImprovementAmbiguousWordingEvidence[];
    ambiguousWording: string[];
    unverifiableWordingEvidence: PromptImprovementUnverifiableWordingEvidence[];
    missingExecutionCriterionEvidence: PromptImprovementMissingExecutionCriterion[];
    missingExecutionCriteria: string[];
    repeatedRuleEvidence: PromptImprovementRepeatedRuleEvidence[];
    repetitiveRules: string[];
    overloadedRuleSentenceEvidence: PromptImprovementOverloadedRuleSentenceEvidence[];
    overloadedRuleSentences: string[];
    nonEnglishSystemInstructionEvidence: PromptImprovementNonEnglishSystemInstructionEvidence[];
    addsNonEnglishSystemInstructions: boolean;
    userLanguageRuleWeakeningEvidence: PromptImprovementUserLanguageRuleWeakeningEvidence[];
    weakensUserLanguageRule: boolean;
    weakensFinalResponseLlmBoundary: boolean;
    promptSourceConflictEvidence: PromptImprovementPromptSourceConflictEvidence[];
    conflictsWithPromptSources: string[];
    assemblyDuplicateDefinitionEvidence: PromptImprovementAssemblyDuplicateDefinitionEvidence[];
    duplicatedAssemblyDefinitions: string[];
    defaultAgentNameChangeEvidence: PromptImprovementDefaultAgentNameChangeEvidence[];
    changesDefaultAgentNames: boolean;
    nameTestsUpdated: boolean;
    impliedRuntimeActivationEvidence: PromptImprovementImpliedRuntimeActivationEvidence[];
    impliesRuntimeActivation: boolean;
    removedAuditRollbackProtectionEvidence: PromptImprovementRemovedAuditRollbackProtection[];
    removesAuditOrRollback: boolean;
    broadRewrite: boolean;
    broadRewriteArchitectureNoteReceipt?: PromptImprovementBroadRewriteArchitectureNoteReceipt;
    broadRewriteArchitectureNote?: string;
}
export declare const PROMPT_IMPROVEMENT_ACCESS_KINDS: readonly ["tool", "mcp", "external_capability"];
export type PromptImprovementAccessKind = typeof PROMPT_IMPROVEMENT_ACCESS_KINDS[number];
export interface PromptImprovementAccessExpansion {
    kind: PromptImprovementAccessKind;
    capability: string;
}
export { REQUIRED_HARNESS_GUARDRAILS };
export type { PromptImprovementHarnessGuardrail };
export interface PromptImprovementRemovedHarnessGuardrail {
    guardrail: PromptImprovementHarnessGuardrail;
    ruleKey: string;
}
export interface PromptImprovementCurrentRunHarnessApplication {
    harnessSource: string;
    runId: string;
}
export interface PromptImprovementAmbiguousWordingEvidence {
    source: string;
    section: string;
    phrase: string;
}
export interface PromptImprovementUnverifiableWordingEvidence {
    source: string;
    section: string;
    phrase: string;
    missingCriterion: string;
}
export declare const PROMPT_IMPROVEMENT_EXECUTION_CRITERIA: readonly ["actor", "condition", "allowed_behavior", "forbidden_behavior", "completion_criterion"];
export type PromptImprovementExecutionCriterion = typeof PROMPT_IMPROVEMENT_EXECUTION_CRITERIA[number];
export interface PromptImprovementMissingExecutionCriterion {
    source: string;
    section: string;
    criterion: PromptImprovementExecutionCriterion;
}
export interface PromptImprovementRepeatedRuleEvidence {
    canonicalRuleKey: string;
    canonicalOwner: string;
    duplicateSource: string;
    duplicateSection: string;
}
export interface PromptImprovementOverloadedRuleSentenceEvidence {
    source: string;
    section: string;
    sentence: string;
    combinedRuleKeys: string[];
}
export interface PromptImprovementNonEnglishSystemInstructionEvidence {
    source: string;
    section: string;
    instruction: string;
    detectedLanguage: string;
}
export interface PromptImprovementUserLanguageRuleWeakeningEvidence {
    canonicalRuleKey: string;
    changedSource: string;
    weakeningSummary: string;
}
export interface PromptImprovementPromptSourceConflictEvidence {
    changedSource: string;
    changedRuleKey: string;
    canonicalSource: string;
    canonicalRuleKey: string;
}
export interface PromptImprovementAssemblyDuplicateDefinitionEvidence {
    definitionKey: string;
    contributingSources: string[];
}
export interface PromptImprovementDefaultAgentNameChangeEvidence {
    beforeName: string;
    afterName: string;
    affectedLocale: string;
    requiredTestIds: string[];
    updatedTestIds: string[];
}
export interface PromptImprovementImpliedRuntimeActivationEvidence {
    changedSource: string;
    activationPath: string;
    missingConfirmation: string;
}
export type PromptImprovementAuditRollbackProtectionKind = "audit" | "rollback";
export interface PromptImprovementRemovedAuditRollbackProtection {
    kind: PromptImprovementAuditRollbackProtectionKind;
    ruleKey: string;
}
export interface PromptImprovementBroadRewriteArchitectureNoteReceipt {
    artifactRef: string;
    smallDiffInsufficiencyRationale: string;
    reviewedBy: string;
}
export declare const PROMPT_IMPROVEMENT_CRITICAL_RULE_CATEGORIES: readonly ["safety", "permission", "identity", "memory", "delegation", "yeonjang"];
export type PromptImprovementCriticalRuleCategory = typeof PROMPT_IMPROVEMENT_CRITICAL_RULE_CATEGORIES[number];
export interface PromptImprovementCriticalRuleWeakening {
    category: PromptImprovementCriticalRuleCategory;
    ruleKey: string;
}
export interface PromptImprovementDiffAssessmentValidationResult {
    ok: boolean;
    issues: PromptImprovementHarnessIssue[];
}
export declare function authorizePromptImprovementApprovalScope(input: {
    approvalRecord?: PromptImprovementApprovalRecord;
    requestedScope: PromptImprovementApprovalScope;
}): PromptImprovementApprovalScopeDecision;
export type PromptImprovementChangedSourceHealth = "ok" | "missing" | "corrupt" | "unsafe";
export type PromptImprovementRollbackReason = "tests_failed_after_write" | "invariant_violation_after_apply" | "wrong_prompt_version_activated" | "user_or_admin_requested" | "changed_source_missing_corrupt_or_unsafe";
export interface PromptImprovementRollbackRequirementInput {
    sourceWriteState: PromptImprovementSourceWriteState;
    testsFailed: string[];
    invariantViolations: string[];
    activationVersionMismatch: boolean;
    rollbackRequestedBy?: string;
    changedSourceHealth: PromptImprovementChangedSourceHealth;
    rollbackSource?: Partial<PromptImprovementRollbackSource>;
}
export interface PromptImprovementRollbackRequirementResult {
    rollbackRequired: boolean;
    reasons: PromptImprovementRollbackReason[];
    rollbackSourceValid: boolean;
    issues: PromptImprovementHarnessIssue[];
    nextState: "rollback_required" | "blocked";
}
export declare const PROMPT_IMPROVEMENT_MEDIUM_IMPACT_AXES: readonly ["task_processing", "delegation_wording", "workflow_generation", "response_style"];
export declare const PROMPT_IMPROVEMENT_HIGH_IMPACT_AXES: readonly ["identity", "user_data", "memory", "safety", "refusal_behavior", "tool", "mcp", "yeonjang", "permission", "activation", "recursive_improvement"];
export declare const PROMPT_IMPROVEMENT_INVARIANTS: readonly ["identity", "delegation", "memory_isolation", "yeonjang", "tool_mcp", "safety", "user_language", "prompt_visibility", "recursive_ownership", "runtime_environment", "harness_integrity", "audit", "redaction", "activation_boundary", "rollback"];
export type PromptImprovementInvariant = typeof PROMPT_IMPROVEMENT_INVARIANTS[number];
export declare const PROMPT_IMPROVEMENT_HARNESS_TRANSITIONS: Readonly<Record<"blocked" | "idle" | "intake" | "completed" | "reporting" | "source_discovery" | "baseline_capture" | "proposal_drafting" | "harness_meta_review" | "invariant_review" | "diff_generation" | "approval_wait" | "apply_change" | "test_execution" | "activation_pending" | "activated" | "rolled_back", readonly ("blocked" | "idle" | "intake" | "completed" | "reporting" | "source_discovery" | "baseline_capture" | "proposal_drafting" | "harness_meta_review" | "invariant_review" | "diff_generation" | "approval_wait" | "apply_change" | "test_execution" | "activation_pending" | "activated" | "rolled_back")[]>>;
export declare function classifyPromptImprovementRisk(assessment: PromptImprovementImpactAssessment): PromptImprovementRisk;
export declare function authorizePromptImprovementApplyPrerequisites(input: {
    risk: PromptImprovementRisk;
    tests: string[];
    rollbackTarget: string;
    rollbackVerified: boolean;
    approvalMode: PromptImprovementApprovalMode;
    approvalGranted: boolean;
    proposalFingerprint?: string;
    now?: number;
    maintenanceApproval?: PromptImprovementMaintenanceApprovalReceipt;
}): PromptImprovementApplyPrerequisiteDecision;
export declare function applyPromptImprovementWithPrerequisites<T>(input: {
    decision: PromptImprovementApplyPrerequisiteDecision;
    rollbackReadiness: PromptChangeRollbackReadinessDecision;
    apply: (decision: Extract<PromptImprovementApplyPrerequisiteDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<PromptImprovementApplyPrerequisiteDecision, {
    status: "blocked";
}> | {
    status: "blocked";
    reasonCode: "apply_rollback_readiness_missing";
}>;
export declare const PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES: readonly ["entry_conditions", "input_schema", "state_machine", "invariants", "approval_policy", "test_policy", "audit_log", "activation", "rollback"];
export type PromptImprovementHarnessChangeScope = typeof PROMPT_IMPROVEMENT_HARNESS_CHANGE_SCOPES[number];
export declare function isHarnessImprovementKind(kind: PromptImprovementKind): boolean;
export declare function validatePromptImprovementProposal(proposal: Partial<PromptImprovementProposal>): PromptImprovementProposalValidationResult;
export declare function writeValidatedPromptImprovementProposal<T>(input: {
    harnessInput: Partial<PromptImprovementHarnessInput>;
    proposal: Partial<PromptImprovementProposal>;
    write: (proposal: PromptImprovementProposal) => Promise<T>;
}): Promise<PromptImprovementProposalWriteDecision<T>>;
export declare function validatePromptImprovementDiffAssessment(assessment: Partial<PromptImprovementDiffAssessment>): PromptImprovementDiffAssessmentValidationResult;
export declare function writeApprovedReviewablePromptDiff<T>(input: {
    approvalDecision: PromptImprovementApprovalScopeDecision;
    diffAssessment: Partial<PromptImprovementDiffAssessment>;
    write: (assessment: PromptImprovementDiffAssessment) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | {
    status: "blocked";
    reasonCode: "approval_record_missing" | "approval_scope_missing";
} | {
    status: "blocked";
    issues: PromptImprovementHarnessIssue[];
}>;
export declare function evaluatePromptImprovementRollbackRequirement(input: PromptImprovementRollbackRequirementInput): PromptImprovementRollbackRequirementResult;
export declare function validatePromptImprovementHarnessInput(input: Partial<PromptImprovementHarnessInput>): PromptImprovementHarnessValidationResult;
export declare function decidePromptImprovementHarnessInput(input: Partial<PromptImprovementHarnessInput>): PromptImprovementHarnessInputDecision;
export declare function authorizePromptImprovementMutableSource(source: Partial<PromptImprovementMutableSourceDescriptor>): PromptImprovementMutableSourceDecision;
export declare function executeAuthorizedPromptImprovementMutableSource<T>(input: {
    authorization: PromptImprovementMutableSourceDecision;
    writerKind: PromptImprovementMutableSourceKind;
    auditContext: PromptImprovementMutableSourceAuditContext;
    recordAudit: (record: PromptImprovementMutableSourceAuditRecord) => void;
    write: (source: PromptImprovementMutableSourceDescriptor) => T;
}): PromptImprovementMutableSourceExecutionDecision<T>;
export declare function canTransitionPromptImprovementHarnessState(from: PromptImprovementHarnessState, to: PromptImprovementHarnessState, event?: PromptImprovementHarnessEvent, context?: PromptImprovementTransitionContext): boolean;
export declare function validatePromptImprovementHarnessStateTransition(from: PromptImprovementHarnessState, to: PromptImprovementHarnessState, event?: PromptImprovementHarnessEvent, context?: PromptImprovementTransitionContext): PromptImprovementHarnessIssue[];
export declare function changedPromptImprovementRecoveryAxes(input: {
    previous: PromptImprovementRecoveryStrategy;
    next: PromptImprovementRecoveryStrategy;
}): PromptImprovementRecoveryChangeAxis[];
export declare function decidePromptImprovementRecovery(input: {
    retryCount: number;
    sourceWriteState: PromptImprovementSourceWriteState;
    previousStrategy?: PromptImprovementRecoveryStrategy;
    nextStrategy?: PromptImprovementRecoveryStrategy;
    blockedEvidence?: PromptImprovementBlockedEvidence;
}): PromptImprovementRecoveryDecision;
export declare function decidePromptImprovementInterrupt(input: {
    state: PromptImprovementHarnessState;
    event: "rollback_requested" | "cancel_requested";
    sourceWriteState: PromptImprovementSourceWriteState;
    blockedEvidence?: PromptImprovementBlockedEvidence;
}): PromptImprovementInterruptDecision;
export declare function buildPromptImprovementApprovalRequest(input: {
    harnessInput: PromptImprovementHarnessInput;
    validation: PromptImprovementHarnessValidationResult;
    changeSummary: string;
    invariantsAffected: string[];
    activationMethod: string;
    approvalScopesRequested: PromptImprovementApprovalScope[];
}): PromptImprovementApprovalRequest;
export declare function buildPromptImprovementActivationRecord(input: Omit<PromptImprovementActivationRecord, "state">): PromptImprovementActivationRecord;
export declare function validatePromptImprovementActivationRecord(record: Partial<PromptImprovementActivationRecord>): PromptImprovementActivationRecordValidationResult;
export declare function buildPromptImprovementHarnessReport(input: {
    runId: string;
    harnessInput: PromptImprovementHarnessInput;
    validation: PromptImprovementHarnessValidationResult;
    sourceWriteState: PromptImprovementSourceWriteState;
    changedPromptSources: string[];
    backupPath?: string | null;
    sourceChecksums?: Array<{
        sourceRef: string;
        beforeChecksum: string;
    }>;
    currentPromptSummary?: string;
    rollbackTarget?: string | null;
    startedAt?: number;
    finishedAt?: number;
    testsPassed?: string[];
    testsFailed?: string[];
    activationRecord?: PromptImprovementActivationRecord;
}): PromptImprovementHarnessReport;
export declare function buildPromptImprovementAuditRecord(report: PromptImprovementHarnessReport): PromptImprovementAuditRecord;
export declare function authorizePromptImprovementAuditRecord(record: PromptImprovementAuditRecord): PromptImprovementAuditRecordDecision;
export declare function appendAuthorizedPromptImprovementAuditRecord<T>(input: {
    decision: PromptImprovementAuditRecordDecision;
    append: (record: PromptImprovementAuditRecord) => Promise<T>;
}): Promise<{
    status: "appended";
    result: T;
} | Extract<PromptImprovementAuditRecordDecision, {
    status: "blocked";
}>>;
export declare function buildPromptImprovementUserOutput(report: PromptImprovementHarnessReport): PromptImprovementUserOutput;
export declare function buildPromptImprovementProductLogEvents(audit: PromptImprovementAuditRecord): PromptImprovementProductLogEvent[];
//# sourceMappingURL=prompt-improvement-harness.d.ts.map