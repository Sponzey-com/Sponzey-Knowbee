export declare const GOAL_REVIEW_GATE_REQUIRED_KEYS: {
    readonly documentStructure: readonly ["canonical_owner_alignment", "no_duplicate_rule_definition", "chapter4_prompt_contract_only", "canonical_module_boundary_alignment"];
    readonly behaviorInvariants: readonly ["identity_language_llm_memory_delegation_yeonjang_failure", "llm_diagnosis_before_action", "no_raw_input_or_result_action", "traceable_workflow", "step_list_with_done_criteria", "structured_work_record", "schema_validated_work_and_diagnosis", "work_record_state_transition", "parent_child_work_record_shape", "recursive_failure_recovery", "no_unsupported_repeat_action", "sub_agent_base_prompt_and_persona_boundary", "agent_name_only_user_facing", "user_facing_final_response_provenance"];
    readonly promptSources: readonly ["english_system_prompt_sources", "prompt_assembly_and_module_boundary", "canonical_prompt_responsibility_split", "prompt_source_visibility_boundary", "prompt_sentence_reviewability", "prompt_assembly_coverage", "canonical_prompt_module_coverage", "prompt_canonical_reference", "sub_agent_runtime_child_creation_prompt"];
    readonly harness: readonly ["harness_only_path", "harness_high_risk_meta_change", "baseline_target_invariant_test_approval_activation_rollback", "no_activation_claim_before_confirmation"];
    readonly operations: readonly ["cleanup_reference_policy", "single_canonical_owner", "temporary_artifact_expiry_owner", "new_boundary_justification", "no_hidden_global_or_duplicate_adapter", "log_level_boundary", "ui_user_convenience_review", "product_parameter_defaults", "yeonjang_required_failure_policy", "generated_artifact_consistency"];
};
export type GoalReviewGateCategory = keyof typeof GOAL_REVIEW_GATE_REQUIRED_KEYS;
export interface GoalReviewGateItem {
    key: string;
    passed: boolean;
    evidenceRefs: string[];
    notes?: string;
}
export type GoalReviewGateReport = {
    [Category in GoalReviewGateCategory]: GoalReviewGateItem[];
};
export type GoalReviewGateIssueCode = "review_category_missing" | "review_gate_missing" | "review_gate_failed" | "review_evidence_missing" | "review_gate_duplicate";
export interface GoalReviewGateIssue {
    code: GoalReviewGateIssueCode;
    category: GoalReviewGateCategory;
    key?: string;
    path: string;
    message: string;
}
export interface GoalReviewGateValidationResult {
    ok: boolean;
    issues: GoalReviewGateIssue[];
}
export declare function validateGoalReviewGateReport(report: Partial<GoalReviewGateReport>): GoalReviewGateValidationResult;
//# sourceMappingURL=goal-review-gate.d.ts.map