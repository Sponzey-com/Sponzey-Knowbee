export const GOAL_REVIEW_GATE_REQUIRED_KEYS = {
    documentStructure: [
        "canonical_owner_alignment",
        "no_duplicate_rule_definition",
        "chapter4_prompt_contract_only",
        "canonical_module_boundary_alignment",
    ],
    behaviorInvariants: [
        "identity_language_llm_memory_delegation_yeonjang_failure",
        "llm_diagnosis_before_action",
        "no_raw_input_or_result_action",
        "traceable_workflow",
        "step_list_with_done_criteria",
        "structured_work_record",
        "schema_validated_work_and_diagnosis",
        "work_record_state_transition",
        "parent_child_work_record_shape",
        "recursive_failure_recovery",
        "no_unsupported_repeat_action",
        "sub_agent_base_prompt_and_persona_boundary",
        "agent_name_only_user_facing",
        "user_facing_final_response_provenance",
    ],
    promptSources: [
        "english_system_prompt_sources",
        "prompt_assembly_and_module_boundary",
        "canonical_prompt_responsibility_split",
        "prompt_source_visibility_boundary",
        "prompt_sentence_reviewability",
        "prompt_assembly_coverage",
        "canonical_prompt_module_coverage",
        "prompt_canonical_reference",
        "sub_agent_runtime_child_creation_prompt",
    ],
    harness: [
        "harness_only_path",
        "harness_high_risk_meta_change",
        "baseline_target_invariant_test_approval_activation_rollback",
        "no_activation_claim_before_confirmation",
    ],
    operations: [
        "cleanup_reference_policy",
        "single_canonical_owner",
        "temporary_artifact_expiry_owner",
        "new_boundary_justification",
        "no_hidden_global_or_duplicate_adapter",
        "log_level_boundary",
        "ui_user_convenience_review",
        "product_parameter_defaults",
        "yeonjang_required_failure_policy",
        "generated_artifact_consistency",
    ],
};
function hasEvidence(item) {
    return Array.isArray(item.evidenceRefs) &&
        item.evidenceRefs.some((evidenceRef) => typeof evidenceRef === "string" && evidenceRef.trim().length > 0);
}
function addIssue(issues, code, category, path, message, key) {
    issues.push({ code, category, path, message, ...(key ? { key } : {}) });
}
export function validateGoalReviewGateReport(report) {
    const issues = [];
    for (const category of Object.keys(GOAL_REVIEW_GATE_REQUIRED_KEYS)) {
        const items = report[category];
        if (!Array.isArray(items)) {
            addIssue(issues, "review_category_missing", category, category, `${category} review category is required.`);
            continue;
        }
        const seen = new Set();
        const byKey = new Map();
        for (const item of items) {
            if (seen.has(item.key)) {
                addIssue(issues, "review_gate_duplicate", category, `${category}.${item.key}`, `${item.key} review gate is duplicated.`, item.key);
            }
            seen.add(item.key);
            byKey.set(item.key, item);
        }
        for (const requiredKey of GOAL_REVIEW_GATE_REQUIRED_KEYS[category]) {
            const item = byKey.get(requiredKey);
            if (!item) {
                addIssue(issues, "review_gate_missing", category, `${category}.${requiredKey}`, `${requiredKey} review gate is required.`, requiredKey);
                continue;
            }
            if (!item.passed) {
                addIssue(issues, "review_gate_failed", category, `${category}.${requiredKey}`, `${requiredKey} review gate did not pass.`, requiredKey);
            }
            if (!hasEvidence(item)) {
                addIssue(issues, "review_evidence_missing", category, `${category}.${requiredKey}.evidenceRefs`, `${requiredKey} review gate requires evidence.`, requiredKey);
            }
        }
    }
    return {
        ok: issues.length === 0,
        issues,
    };
}
//# sourceMappingURL=goal-review-gate.js.map