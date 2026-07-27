import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizePromptImprovementMutableSource, buildPromptImprovementHarnessReport, decidePromptImprovementHarnessInput, executeAuthorizedPromptImprovementMutableSource, } from "./prompt-improvement-harness.js";
import { PromptSourceContentQualityError, validatePromptSourceContentQuality, } from "./prompt-source-quality.js";
const MAX_KNOWBEE_MD_SIZE = 8000;
const MAX_SYSTEM_PROMPT_SIZE = 180000;
const MEMORY_FILENAMES = ["KNOWBEE.md", "WIZBY.md", "HOWIE.md"];
const PROMPTS_DIRNAME = "prompts";
const PROMPT_ASSEMBLY_POLICY_VERSION = 1;
const PROMPTS_DIR_SEARCH_DEPTH = 8;
const MODULE_DIRNAME = dirname(fileURLToPath(import.meta.url));
const EXECUTION_RUNTIME_PROMPT_SOURCE_IDS = new Set([
    "system",
    "definitions",
    "identity",
    "user",
    "tool_policy",
    "workflow",
    "recovery_policy",
    "completion_policy",
    "output_policy",
    "channel",
]);
const PROMPT_SOURCE_DEFINITIONS = [
    {
        sourceId: "system",
        filenames: { ko: "system.ko.md", en: "system.md" },
        priority: 5,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "definitions",
        filenames: { ko: "definitions.ko.md", en: "definitions.md" },
        priority: 10,
        required: true,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "identity",
        filenames: { ko: "identity.ko.md", en: "identity.md" },
        priority: 20,
        required: true,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "runtime_identity_context",
        filenames: { ko: "runtime_identity_context.ko.md", en: "runtime_identity_context.md" },
        priority: 22,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "user",
        filenames: { ko: "user.ko.md", en: "user.md" },
        priority: 30,
        required: true,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "task_intake",
        filenames: { ko: "task_intake.ko.md", en: "task_intake.md" },
        priority: 35,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "work_record",
        filenames: { ko: "work_record.ko.md", en: "work_record.md" },
        priority: 36,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "tool_policy",
        filenames: { ko: "tool_policy.ko.md", en: "tool_policy.md" },
        priority: 37,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "memory_policy",
        filenames: { ko: "memory_policy.ko.md", en: "memory_policy.md" },
        priority: 38,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "prompt_visibility",
        filenames: { ko: "prompt_visibility.ko.md", en: "prompt_visibility.md" },
        priority: 39,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "soul",
        filenames: { ko: "soul.ko.md", en: "soul.md" },
        priority: 40,
        required: true,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "planner",
        filenames: { ko: "planner.ko.md", en: "planner.md" },
        priority: 50,
        required: true,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "knowbee_execution",
        filenames: { ko: "knowbee-execution.ko.md", en: "knowbee-execution.md" },
        priority: 55,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "workflow",
        filenames: { ko: "workflow.ko.md", en: "workflow.md" },
        priority: 56,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "sub_agent_delegation",
        filenames: { ko: "sub_agent_delegation.ko.md", en: "sub_agent_delegation.md" },
        priority: 57,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "yeonjang_policy",
        filenames: { ko: "yeonjang_policy.ko.md", en: "yeonjang_policy.md" },
        priority: 58,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "prompt_improvement",
        filenames: { ko: "prompt_improvement.ko.md", en: "prompt_improvement.md" },
        priority: 59,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "reasoning_policy_runtime",
        filenames: { ko: "reasoning_policy_runtime.ko.md", en: "reasoning_policy_runtime.md" },
        priority: 73,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_access_policy_runtime",
        filenames: { ko: "web_access_policy_runtime.ko.md", en: "web_access_policy_runtime.md" },
        priority: 74,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_access_policy_contract_v2",
        filenames: {
            ko: "web_access_policy_contract_v2.ko.md",
            en: "web_access_policy_contract_v2.md",
        },
        priority: 75,
        required: true,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "recovery_policy",
        filenames: { ko: "recovery_policy.ko.md", en: "recovery_policy.md" },
        priority: 80,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "topology_executor_policy",
        filenames: { ko: "topology_executor_policy.ko.md", en: "topology_executor_policy.md" },
        priority: 85,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "completion_policy",
        filenames: { ko: "completion_policy.ko.md", en: "completion_policy.md" },
        priority: 90,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "output_policy",
        filenames: { ko: "output_policy.ko.md", en: "output_policy.md" },
        priority: 100,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "maintenance_policy",
        filenames: { ko: "maintenance_policy.ko.md", en: "maintenance_policy.md" },
        priority: 106,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "ui_policy",
        filenames: { ko: "ui_policy.ko.md", en: "ui_policy.md" },
        priority: 107,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "runtime_environment_policy",
        filenames: { ko: "runtime_environment_policy.ko.md", en: "runtime_environment_policy.md" },
        priority: 108,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "logging_policy",
        filenames: { ko: "logging_policy.ko.md", en: "logging_policy.md" },
        priority: 109,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "channel",
        filenames: { ko: "channel.ko.md", en: "channel.md" },
        priority: 110,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "result_review",
        filenames: { ko: "result_review.ko.md", en: "result_review.md" },
        priority: 115,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "final_response",
        filenames: { ko: "final_response.ko.md", en: "final_response.md" },
        priority: 116,
        required: false,
        usageScope: "runtime",
        defaultRuntime: true,
    },
    {
        sourceId: "bootstrap",
        filenames: { ko: "bootstrap.ko.md", en: "bootstrap.md" },
        priority: 120,
        required: true,
        usageScope: "first_run",
        defaultRuntime: false,
    },
    {
        sourceId: "sub_agent_base",
        filenames: { ko: "sub_agent_base.ko.md", en: "sub_agent_base.md" },
        priority: 130,
        required: false,
        usageScope: "runtime",
        defaultRuntime: false,
    },
    {
        sourceId: "agent_persona",
        filenames: { ko: "agent_persona.ko.md", en: "agent_persona.md" },
        priority: 140,
        required: false,
        usageScope: "runtime",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review",
        filenames: { ko: "completion_review.ko.md", en: "completion_review.md" },
        priority: 210,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_policy_v2",
        filenames: {
            ko: "completion_review_policy_v2.ko.md",
            en: "completion_review_policy_v2.md",
        },
        priority: 210.05,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_bundle_default_safety_rules_user",
        filenames: {
            ko: "prompt_bundle_default_safety_rules_user.ko.md",
            en: "prompt_bundle_default_safety_rules_user.md",
        },
        priority: 211,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_bundle_self_agent_name_rule_user",
        filenames: {
            ko: "prompt_bundle_self_agent_name_rule_user.ko.md",
            en: "prompt_bundle_self_agent_name_rule_user.md",
        },
        priority: 212,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_bundle_agent_name_attribution_rule_user",
        filenames: {
            ko: "prompt_bundle_agent_name_attribution_rule_user.ko.md",
            en: "prompt_bundle_agent_name_attribution_rule_user.md",
        },
        priority: 213,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_bundle_executor_profile_projection_user",
        filenames: {
            ko: "prompt_bundle_executor_profile_projection_user.ko.md",
            en: "prompt_bundle_executor_profile_projection_user.md",
        },
        priority: 214,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_bundle_context_labels_user",
        filenames: {
            ko: "prompt_bundle_context_labels_user.ko.md",
            en: "prompt_bundle_context_labels_user.md",
        },
        priority: 214.05,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "prompt_source_assembly_context_labels_user",
        filenames: {
            ko: "prompt_source_assembly_context_labels_user.ko.md",
            en: "prompt_source_assembly_context_labels_user.md",
        },
        priority: 214.06,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "imported_agent_draft_review_summary_suffix_user",
        filenames: {
            ko: "imported_agent_draft_review_summary_suffix_user.ko.md",
            en: "imported_agent_draft_review_summary_suffix_user.md",
        },
        priority: 214.1,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "imported_agent_draft_avoid_tasks_user",
        filenames: {
            ko: "imported_agent_draft_avoid_tasks_user.ko.md",
            en: "imported_agent_draft_avoid_tasks_user.md",
        },
        priority: 214.2,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "profile_context_user_header_user",
        filenames: {
            ko: "profile_context_user_header_user.ko.md",
            en: "profile_context_user_header_user.md",
        },
        priority: 214.3,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "profile_context_agent_header_user",
        filenames: {
            ko: "profile_context_agent_header_user.ko.md",
            en: "profile_context_agent_header_user.md",
        },
        priority: 214.4,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "profile_context_team_header_user",
        filenames: {
            ko: "profile_context_team_header_user.ko.md",
            en: "profile_context_team_header_user.md",
        },
        priority: 214.5,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "agent_runtime_prompt_context_labels_user",
        filenames: {
            ko: "agent_runtime_prompt_context_labels_user.ko.md",
            en: "agent_runtime_prompt_context_labels_user.md",
        },
        priority: 214.6,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "instruction_merge_context_labels_user",
        filenames: {
            ko: "instruction_merge_context_labels_user.ko.md",
            en: "instruction_merge_context_labels_user.md",
        },
        priority: 214.65,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "internal_run_prompt_prefix_labels_user",
        filenames: {
            ko: "internal_run_prompt_prefix_labels_user.ko.md",
            en: "internal_run_prompt_prefix_labels_user.md",
        },
        priority: 214.66,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "memory_prompt_context_labels_user",
        filenames: {
            ko: "memory_prompt_context_labels_user.ko.md",
            en: "memory_prompt_context_labels_user.md",
        },
        priority: 214.7,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "memory_restore_prompt_context_labels_user",
        filenames: {
            ko: "memory_restore_prompt_context_labels_user.ko.md",
            en: "memory_restore_prompt_context_labels_user.md",
        },
        priority: 214.8,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "memory_compressor_summary_prompt_user",
        filenames: {
            ko: "memory_compressor_summary_prompt_user.ko.md",
            en: "memory_compressor_summary_prompt_user.md",
        },
        priority: 214.81,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "root_session_summary_prompt_user",
        filenames: {
            ko: "root_session_summary_prompt_user.ko.md",
            en: "root_session_summary_prompt_user.md",
        },
        priority: 214.82,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_intake_user",
        filenames: { ko: "task_intake_user.ko.md", en: "task_intake_user.md" },
        priority: 215,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_intake_identity_retry_user",
        filenames: {
            ko: "task_intake_identity_retry_user.ko.md",
            en: "task_intake_identity_retry_user.md",
        },
        priority: 215.01,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_intake_schema_retry_user",
        filenames: {
            ko: "task_intake_schema_retry_user.ko.md",
            en: "task_intake_schema_retry_user.md",
        },
        priority: 215.02,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_schedule_saved_user",
        filenames: {
            ko: "intake_complete_condition_schedule_saved_user.ko.md",
            en: "intake_complete_condition_schedule_saved_user.md",
        },
        priority: 215.101,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_schedule_timing_matches_user",
        filenames: {
            ko: "intake_complete_condition_schedule_timing_matches_user.ko.md",
            en: "intake_complete_condition_schedule_timing_matches_user.md",
        },
        priority: 215.102,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_schedule_timing_preserved_user",
        filenames: {
            ko: "intake_complete_condition_schedule_timing_preserved_user.ko.md",
            en: "intake_complete_condition_schedule_timing_preserved_user.md",
        },
        priority: 215.103,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_cancel_schedule_user",
        filenames: {
            ko: "intake_complete_condition_cancel_schedule_user.ko.md",
            en: "intake_complete_condition_cancel_schedule_user.md",
        },
        priority: 215.104,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_missing_info_collected_user",
        filenames: {
            ko: "intake_complete_condition_missing_info_collected_user.ko.md",
            en: "intake_complete_condition_missing_info_collected_user.md",
        },
        priority: 215.105,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_reply_destination_user",
        filenames: {
            ko: "intake_complete_condition_reply_destination_user.ko.md",
            en: "intake_complete_condition_reply_destination_user.md",
        },
        priority: 215.106,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_schedule_registered_user",
        filenames: {
            ko: "intake_complete_condition_schedule_registered_user.ko.md",
            en: "intake_complete_condition_schedule_registered_user.md",
        },
        priority: 215.107,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_clarification_requested_user",
        filenames: {
            ko: "intake_complete_condition_clarification_requested_user.ko.md",
            en: "intake_complete_condition_clarification_requested_user.md",
        },
        priority: 215.108,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_complete_condition_default_result_user",
        filenames: {
            ko: "intake_complete_condition_default_result_user.ko.md",
            en: "intake_complete_condition_default_result_user.md",
        },
        priority: 215.109,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "intake_conversation_context_labels_user",
        filenames: {
            ko: "intake_conversation_context_labels_user.ko.md",
            en: "intake_conversation_context_labels_user.md",
        },
        priority: 215.11,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_user",
        filenames: { ko: "completion_review_user.ko.md", en: "completion_review_user.md" },
        priority: 216,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_context_v2",
        filenames: {
            ko: "completion_review_context_v2.ko.md",
            en: "completion_review_context_v2.md",
        },
        priority: 216.025,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_contract_v2",
        filenames: {
            ko: "completion_review_contract_v2.ko.md",
            en: "completion_review_contract_v2.md",
        },
        priority: 216.05,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_context_labels_user",
        filenames: {
            ko: "completion_review_context_labels_user.ko.md",
            en: "completion_review_context_labels_user.md",
        },
        priority: 216.1,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_review_repair_user",
        filenames: {
            ko: "completion_review_repair_user.ko.md",
            en: "completion_review_repair_user.md",
        },
        priority: 216.15,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "completion_followup_evidence_user",
        filenames: {
            ko: "completion_followup_evidence_user.ko.md",
            en: "completion_followup_evidence_user.md",
        },
        priority: 216.17,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "response_language_exception_review",
        filenames: {
            ko: "response_language_exception_review.ko.md",
            en: "response_language_exception_review.md",
        },
        priority: 216.2,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "response_language_exception_review_user",
        filenames: {
            ko: "response_language_exception_review_user.ko.md",
            en: "response_language_exception_review_user.md",
        },
        priority: 216.3,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "final_response_user",
        filenames: { ko: "final_response_user.ko.md", en: "final_response_user.md" },
        priority: 217,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "delegated_child_followup_user",
        filenames: {
            ko: "delegated_child_followup_user.ko.md",
            en: "delegated_child_followup_user.md",
        },
        priority: 218,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "review_cycle_followup_result_report_instruction_user",
        filenames: {
            ko: "review_cycle_followup_result_report_instruction_user.ko.md",
            en: "review_cycle_followup_result_report_instruction_user.md",
        },
        priority: 218.1,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "sub_agent_result_review_required_changes_user",
        filenames: {
            ko: "sub_agent_result_review_required_changes_user.ko.md",
            en: "sub_agent_result_review_required_changes_user.md",
        },
        priority: 218.2,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "comparison_prompt_context_labels_user",
        filenames: {
            ko: "comparison_prompt_context_labels_user.ko.md",
            en: "comparison_prompt_context_labels_user.md",
        },
        priority: 218.3,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "schedule_intake_recovery_user",
        filenames: {
            ko: "schedule_intake_recovery_user.ko.md",
            en: "schedule_intake_recovery_user.md",
        },
        priority: 219,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "request_continuation",
        filenames: { ko: "request_continuation.ko.md", en: "request_continuation.md" },
        priority: 220,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "direct_artifact_delivery_recovery_user",
        filenames: {
            ko: "direct_artifact_delivery_recovery_user.ko.md",
            en: "direct_artifact_delivery_recovery_user.md",
        },
        priority: 221,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "command_failure_recovery_user",
        filenames: {
            ko: "command_failure_recovery_user.ko.md",
            en: "command_failure_recovery_user.md",
        },
        priority: 222,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_recovery_user",
        filenames: { ko: "execution_recovery_user.ko.md", en: "execution_recovery_user.md" },
        priority: 223,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "ai_error_recovery_user",
        filenames: { ko: "ai_error_recovery_user.ko.md", en: "ai_error_recovery_user.md" },
        priority: 224,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "worker_runtime_error_recovery_user",
        filenames: {
            ko: "worker_runtime_error_recovery_user.ko.md",
            en: "worker_runtime_error_recovery_user.md",
        },
        priority: 225,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "filesystem_execution_required_user",
        filenames: {
            ko: "filesystem_execution_required_user.ko.md",
            en: "filesystem_execution_required_user.md",
        },
        priority: 226,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "filesystem_verification_recovery_user",
        filenames: {
            ko: "filesystem_verification_recovery_user.ko.md",
            en: "filesystem_verification_recovery_user.md",
        },
        priority: 227,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "empty_result_recovery_user",
        filenames: { ko: "empty_result_recovery_user.ko.md", en: "empty_result_recovery_user.md" },
        priority: 228,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "truncated_output_recovery_user",
        filenames: {
            ko: "truncated_output_recovery_user.ko.md",
            en: "truncated_output_recovery_user.md",
        },
        priority: 229,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "recovery_prompt_section_text_user",
        filenames: {
            ko: "recovery_prompt_section_text_user.ko.md",
            en: "recovery_prompt_section_text_user.md",
        },
        priority: 229.1,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "approval_granted_continuation_user",
        filenames: {
            ko: "approval_granted_continuation_user.ko.md",
            en: "approval_granted_continuation_user.md",
        },
        priority: 229.5,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_brief_user",
        filenames: { ko: "task_execution_brief_user.ko.md", en: "task_execution_brief_user.md" },
        priority: 229.6,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_brief_section_labels_user",
        filenames: {
            ko: "task_execution_brief_section_labels_user.ko.md",
            en: "task_execution_brief_section_labels_user.md",
        },
        priority: 229.605,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_filesystem_instruction_user",
        filenames: {
            ko: "task_execution_filesystem_instruction_user.ko.md",
            en: "task_execution_filesystem_instruction_user.md",
        },
        priority: 229.61,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_general_instruction_user",
        filenames: {
            ko: "task_execution_general_instruction_user.ko.md",
            en: "task_execution_general_instruction_user.md",
        },
        priority: 229.62,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_default_required_output_user",
        filenames: {
            ko: "task_execution_default_required_output_user.ko.md",
            en: "task_execution_default_required_output_user.md",
        },
        priority: 229.63,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_default_verification_note_user",
        filenames: {
            ko: "task_execution_default_verification_note_user.ko.md",
            en: "task_execution_default_verification_note_user.md",
        },
        priority: 229.64,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_filesystem_verification_note_user",
        filenames: {
            ko: "task_execution_filesystem_verification_note_user.ko.md",
            en: "task_execution_filesystem_verification_note_user.md",
        },
        priority: 229.65,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_text_verification_note_user",
        filenames: {
            ko: "task_execution_text_verification_note_user.ko.md",
            en: "task_execution_text_verification_note_user.md",
        },
        priority: 229.66,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "context_preflight_pruning_labels_user",
        filenames: {
            ko: "context_preflight_pruning_labels_user.ko.md",
            en: "context_preflight_pruning_labels_user.md",
        },
        priority: 229.661,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_default_target_user",
        filenames: {
            ko: "execution_default_target_user.ko.md",
            en: "execution_default_target_user.md",
        },
        priority: 229.667,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_default_destination_user",
        filenames: {
            ko: "execution_default_destination_user.ko.md",
            en: "execution_default_destination_user.md",
        },
        priority: 229.668,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_default_complete_condition_user",
        filenames: {
            ko: "execution_default_complete_condition_user.ko.md",
            en: "execution_default_complete_condition_user.md",
        },
        priority: 229.669,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_fallback_original_request_context_user",
        filenames: {
            ko: "execution_fallback_original_request_context_user.ko.md",
            en: "execution_fallback_original_request_context_user.md",
        },
        priority: 229.67,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_confirm_goal_user",
        filenames: {
            ko: "structured_execution_checklist_confirm_goal_user.ko.md",
            en: "structured_execution_checklist_confirm_goal_user.md",
        },
        priority: 229.671,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_filesystem_work_user",
        filenames: {
            ko: "structured_execution_checklist_filesystem_work_user.ko.md",
            en: "structured_execution_checklist_filesystem_work_user.md",
        },
        priority: 229.672,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_general_work_user",
        filenames: {
            ko: "structured_execution_checklist_general_work_user.ko.md",
            en: "structured_execution_checklist_general_work_user.md",
        },
        priority: 229.673,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_complete_condition_user",
        filenames: {
            ko: "structured_execution_checklist_complete_condition_user.ko.md",
            en: "structured_execution_checklist_complete_condition_user.md",
        },
        priority: 229.674,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_direct_artifact_user",
        filenames: {
            ko: "structured_execution_checklist_direct_artifact_user.ko.md",
            en: "structured_execution_checklist_direct_artifact_user.md",
        },
        priority: 229.675,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_final_result_user",
        filenames: {
            ko: "structured_execution_checklist_final_result_user.ko.md",
            en: "structured_execution_checklist_final_result_user.md",
        },
        priority: 229.676,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_checklist_stop_condition_user",
        filenames: {
            ko: "structured_execution_checklist_stop_condition_user.ko.md",
            en: "structured_execution_checklist_stop_condition_user.md",
        },
        priority: 229.677,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_confirm_goal_user",
        filenames: {
            ko: "task_execution_checklist_confirm_goal_user.ko.md",
            en: "task_execution_checklist_confirm_goal_user.md",
        },
        priority: 229.681,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_filesystem_work_user",
        filenames: {
            ko: "task_execution_checklist_filesystem_work_user.ko.md",
            en: "task_execution_checklist_filesystem_work_user.md",
        },
        priority: 229.682,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_general_work_user",
        filenames: {
            ko: "task_execution_checklist_general_work_user.ko.md",
            en: "task_execution_checklist_general_work_user.md",
        },
        priority: 229.683,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_complete_condition_user",
        filenames: {
            ko: "task_execution_checklist_complete_condition_user.ko.md",
            en: "task_execution_checklist_complete_condition_user.md",
        },
        priority: 229.684,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_direct_artifact_user",
        filenames: {
            ko: "task_execution_checklist_direct_artifact_user.ko.md",
            en: "task_execution_checklist_direct_artifact_user.md",
        },
        priority: 229.685,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_final_result_user",
        filenames: {
            ko: "task_execution_checklist_final_result_user.ko.md",
            en: "task_execution_checklist_final_result_user.md",
        },
        priority: 229.686,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "task_execution_checklist_stop_condition_user",
        filenames: {
            ko: "task_execution_checklist_stop_condition_user.ko.md",
            en: "task_execution_checklist_stop_condition_user.md",
        },
        priority: 229.687,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "root_execution_header_user",
        filenames: { ko: "root_execution_header_user.ko.md", en: "root_execution_header_user.md" },
        priority: 229.6881,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "root_execution_intake_complete_intro_user",
        filenames: {
            ko: "root_execution_intake_complete_intro_user.ko.md",
            en: "root_execution_intake_complete_intro_user.md",
        },
        priority: 229.6882,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "root_execution_checklist_order_closing_user",
        filenames: {
            ko: "root_execution_checklist_order_closing_user.ko.md",
            en: "root_execution_checklist_order_closing_user.md",
        },
        priority: 229.6883,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "root_execution_incomplete_checklist_closing_user",
        filenames: {
            ko: "root_execution_incomplete_checklist_closing_user.ko.md",
            en: "root_execution_incomplete_checklist_closing_user.md",
        },
        priority: 229.6884,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_original_request_block_user",
        filenames: {
            ko: "structured_execution_original_request_block_user.ko.md",
            en: "structured_execution_original_request_block_user.md",
        },
        priority: 229.69,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_section_labels_user",
        filenames: {
            ko: "structured_execution_section_labels_user.ko.md",
            en: "structured_execution_section_labels_user.md",
        },
        priority: 229.695,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "structured_execution_brief_user",
        filenames: {
            ko: "structured_execution_brief_user.ko.md",
            en: "structured_execution_brief_user.md",
        },
        priority: 229.7,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_followup_user",
        filenames: { ko: "scheduled_followup_user.ko.md", en: "scheduled_followup_user.md" },
        priority: 229.8,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_tool_enabled_instruction_user",
        filenames: {
            ko: "scheduled_tool_enabled_instruction_user.ko.md",
            en: "scheduled_tool_enabled_instruction_user.md",
        },
        priority: 229.81,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_tool_disabled_instruction_user",
        filenames: {
            ko: "scheduled_tool_disabled_instruction_user.ko.md",
            en: "scheduled_tool_disabled_instruction_user.md",
        },
        priority: 229.82,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_default_destination_user",
        filenames: {
            ko: "scheduled_default_destination_user.ko.md",
            en: "scheduled_default_destination_user.md",
        },
        priority: 229.821,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_structured_request_header_user",
        filenames: {
            ko: "scheduled_structured_request_header_user.ko.md",
            en: "scheduled_structured_request_header_user.md",
        },
        priority: 229.822,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_context_task_payload_user",
        filenames: {
            ko: "scheduled_context_task_payload_user.ko.md",
            en: "scheduled_context_task_payload_user.md",
        },
        priority: 229.823,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_context_task_profile_user",
        filenames: {
            ko: "scheduled_context_task_profile_user.ko.md",
            en: "scheduled_context_task_profile_user.md",
        },
        priority: 229.824,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_context_time_reached_user",
        filenames: {
            ko: "scheduled_context_time_reached_user.ko.md",
            en: "scheduled_context_time_reached_user.md",
        },
        priority: 229.825,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_complete_time_reached_user",
        filenames: {
            ko: "scheduled_complete_time_reached_user.ko.md",
            en: "scheduled_complete_time_reached_user.md",
        },
        priority: 229.826,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_complete_destination_user",
        filenames: {
            ko: "scheduled_complete_destination_user.ko.md",
            en: "scheduled_complete_destination_user.md",
        },
        priority: 229.827,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "scheduled_contract_execution_user",
        filenames: {
            ko: "scheduled_contract_execution_user.ko.md",
            en: "scheduled_contract_execution_user.md",
        },
        priority: 229.83,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "filesystem_verification_user",
        filenames: { ko: "filesystem_verification_user.ko.md", en: "filesystem_verification_user.md" },
        priority: 229.9,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "filesystem_verification_context_labels_user",
        filenames: {
            ko: "filesystem_verification_context_labels_user.ko.md",
            en: "filesystem_verification_context_labels_user.md",
        },
        priority: 229.901,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "delegated_task_dispatch_user",
        filenames: { ko: "delegated_task_dispatch_user.ko.md", en: "delegated_task_dispatch_user.md" },
        priority: 229.95,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_decision_harness",
        filenames: { ko: "execution_decision_harness.ko.md", en: "execution_decision_harness.md" },
        priority: 230,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "diagnosis_json_instruction_user",
        filenames: {
            ko: "diagnosis_json_instruction_user.ko.md",
            en: "diagnosis_json_instruction_user.md",
        },
        priority: 231,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "solution_plan_json_instruction_user",
        filenames: {
            ko: "solution_plan_json_instruction_user.ko.md",
            en: "solution_plan_json_instruction_user.md",
        },
        priority: 231.5,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "capability_selection",
        filenames: {
            ko: "capability_selection.ko.md",
            en: "capability_selection.md",
        },
        priority: 231.6,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "capability_selection_json_instruction_user",
        filenames: {
            ko: "capability_selection_json_instruction_user.ko.md",
            en: "capability_selection_json_instruction_user.md",
        },
        priority: 231.7,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_research_method",
        filenames: {
            ko: "web_research_method.ko.md",
            en: "web_research_method.md",
        },
        priority: 231.8,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_research_method_json_instruction_user",
        filenames: {
            ko: "web_research_method_json_instruction_user.ko.md",
            en: "web_research_method_json_instruction_user.md",
        },
        priority: 231.9,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_source_selection",
        filenames: { ko: "web_source_selection.ko.md", en: "web_source_selection.md" },
        priority: 231.91,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_source_selection_json_instruction_user",
        filenames: {
            ko: "web_source_selection_json_instruction_user.ko.md",
            en: "web_source_selection_json_instruction_user.md",
        },
        priority: 231.92,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_chunk_selection",
        filenames: { ko: "web_chunk_selection.ko.md", en: "web_chunk_selection.md" },
        priority: 231.93,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_chunk_selection_json_instruction_user",
        filenames: {
            ko: "web_chunk_selection_json_instruction_user.ko.md",
            en: "web_chunk_selection_json_instruction_user.md",
        },
        priority: 231.94,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_compression",
        filenames: { ko: "web_evidence_compression.ko.md", en: "web_evidence_compression.md" },
        priority: 231.95,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_compression_json_instruction_user",
        filenames: {
            ko: "web_evidence_compression_json_instruction_user.ko.md",
            en: "web_evidence_compression_json_instruction_user.md",
        },
        priority: 231.96,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_review",
        filenames: { ko: "web_evidence_review.ko.md", en: "web_evidence_review.md" },
        priority: 231.97,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_review_json_instruction_user",
        filenames: {
            ko: "web_evidence_review_json_instruction_user.ko.md",
            en: "web_evidence_review_json_instruction_user.md",
        },
        priority: 231.98,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_verification",
        filenames: { ko: "web_evidence_verification.ko.md", en: "web_evidence_verification.md" },
        priority: 231.99,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "web_evidence_verification_json_instruction_user",
        filenames: {
            ko: "web_evidence_verification_json_instruction_user.ko.md",
            en: "web_evidence_verification_json_instruction_user.md",
        },
        priority: 231.995,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "request_diagnosis",
        filenames: { ko: "request_diagnosis.ko.md", en: "request_diagnosis.md" },
        priority: 232,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "result_diagnosis",
        filenames: { ko: "result_diagnosis.ko.md", en: "result_diagnosis.md" },
        priority: 234,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "live_acceptance_evidence",
        filenames: {
            ko: "live_acceptance_evidence.ko.md",
            en: "live_acceptance_evidence.md",
        },
        priority: 235,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "diagnosis_schema_repair",
        filenames: { ko: "diagnosis_schema_repair.ko.md", en: "diagnosis_schema_repair.md" },
        priority: 236,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "topology_recovery_review_summaries_user",
        filenames: {
            ko: "topology_recovery_review_summaries_user.ko.md",
            en: "topology_recovery_review_summaries_user.md",
        },
        priority: 236.5,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "work_order_template_prompt_text_user",
        filenames: {
            ko: "work_order_template_prompt_text_user.ko.md",
            en: "work_order_template_prompt_text_user.md",
        },
        priority: 236.6,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "topology_runtime_harness_text_user",
        filenames: {
            ko: "topology_runtime_harness_text_user.ko.md",
            en: "topology_runtime_harness_text_user.md",
        },
        priority: 236.7,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_harness_fallback_text_user",
        filenames: {
            ko: "execution_harness_fallback_text_user.ko.md",
            en: "execution_harness_fallback_text_user.md",
        },
        priority: 236.8,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "execution_harness_policy_context_labels_user",
        filenames: {
            ko: "execution_harness_policy_context_labels_user.ko.md",
            en: "execution_harness_policy_context_labels_user.md",
        },
        priority: 236.81,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "ai_connection_test",
        filenames: { ko: "ai_connection_test.ko.md", en: "ai_connection_test.md" },
        priority: 240,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "codex_oauth_fallback_prompt_labels_user",
        filenames: {
            ko: "codex_oauth_fallback_prompt_labels_user.ko.md",
            en: "codex_oauth_fallback_prompt_labels_user.md",
        },
        priority: 240.1,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "schedule_comparison",
        filenames: { ko: "schedule_comparison.ko.md", en: "schedule_comparison.md" },
        priority: 250,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_api_system_user",
        filenames: {
            ko: "node_definition_api_system_user.ko.md",
            en: "node_definition_api_system_user.md",
        },
        priority: 259.9,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_suggestion",
        filenames: { ko: "node_definition_suggestion.ko.md", en: "node_definition_suggestion.md" },
        priority: 260,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_input_block_user",
        filenames: {
            ko: "node_definition_input_block_user.ko.md",
            en: "node_definition_input_block_user.md",
        },
        priority: 261,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_name_guidance_user",
        filenames: {
            ko: "node_definition_name_guidance_user.ko.md",
            en: "node_definition_name_guidance_user.md",
        },
        priority: 262,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_description_guidance_user",
        filenames: {
            ko: "node_definition_description_guidance_user.ko.md",
            en: "node_definition_description_guidance_user.md",
        },
        priority: 263,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
    {
        sourceId: "node_definition_description_review_guidance_user",
        filenames: {
            ko: "node_definition_description_review_guidance_user.ko.md",
            en: "node_definition_description_review_guidance_user.md",
        },
        priority: 264,
        required: false,
        usageScope: "internal",
        defaultRuntime: false,
    },
];
export function listPromptSourceDefinitions() {
    return PROMPT_SOURCE_DEFINITIONS.map((definition) => ({
        ...definition,
        filenames: { ...definition.filenames },
    }));
}
const DEFAULT_PROMPT_SOURCE_SEED_LOCALES = ["en"];
export const REQUIRED_RUNTIME_PROMPT_SOURCE_IDS = PROMPT_SOURCE_DEFINITIONS.filter((definition) => definition.required && definition.defaultRuntime).map((definition) => definition.sourceId);
function buildPromptSeedSearchDirs(workDir) {
    const candidates = [findPromptsDirInAncestors(workDir), findPromptsDirInAncestors(MODULE_DIRNAME)];
    const unique = [];
    for (const candidate of candidates) {
        if (!candidate || !existsSync(candidate) || unique.includes(candidate))
            continue;
        unique.push(candidate);
    }
    return unique;
}
function promptSeedFilenames(definition, _locale) {
    return [definition.filenames.en];
}
function readPromptSourceSeedContent(workDir, definition, locale, excludePath) {
    for (const promptsDir of buildPromptSeedSearchDirs(workDir)) {
        for (const filename of promptSeedFilenames(definition, locale)) {
            const candidate = join(promptsDir, filename);
            if (excludePath && candidate === excludePath)
                continue;
            if (!existsSync(candidate))
                continue;
            try {
                const content = readFileSync(candidate, "utf-8").trim();
                if (!content || !isPromptSourceContentSafe(content))
                    continue;
                return content;
            }
            catch {
                // Ignore one unreadable seed source and continue looking for a file-backed prompt.
            }
        }
    }
    return null;
}
const PROMPT_SOURCE_SECRET_PATTERNS = [
    {
        marker: "api_key_assignment",
        pattern: /\b(?:api[_ -]?key|apikey)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i,
    },
    {
        marker: "oauth_token_assignment",
        pattern: /\b(?:oauth[_ -]?token|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i,
    },
    {
        marker: "bot_token_assignment",
        pattern: /\b(?:bot[_ -]?token|telegram[_ -]?token|slack[_ -]?token)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i,
    },
    {
        marker: "channel_secret_assignment",
        pattern: /\b(?:channel[_ -]?secret|client[_ -]?secret|signing[_ -]?secret)\b\s*[:=]\s*["']?(?!unknown|none|미확정|없음)[A-Za-z0-9_./+=-]{16,}/i,
    },
    { marker: "openai_secret_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
];
const promptAssemblyCache = new Map();
const PROMPT_SOURCE_FRAGMENT_SEPARATOR = "\n\n---\n\n";
const PROMPT_SOURCE_ASSEMBLY_CONTEXT_LABELS_SOURCE_ID = "prompt_source_assembly_context_labels_user";
const RUNTIME_TAIL_PRESERVATION_SOURCE_IDS = [
    "maintenance_policy",
    "ui_policy",
    "runtime_environment_policy",
    "logging_policy",
    "channel",
    "result_review",
    "final_response",
];
/**
 * Walk up from workDir (up to 3 parent levels) searching for KNOWBEE.md first,
 * then legacy WIZBY.md / HOWIE.md.
 * Returns the file contents (trimmed to 8KB) or null if not found.
 */
export function loadKnowbeeMd(workDir) {
    let current = workDir;
    for (let i = 0; i < 4; i++) {
        for (const filename of MEMORY_FILENAMES) {
            const candidate = join(current, filename);
            if (existsSync(candidate)) {
                try {
                    return readFileSync(candidate, "utf-8").slice(0, MAX_KNOWBEE_MD_SIZE);
                }
                catch {
                    return null;
                }
            }
        }
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function findPromptsDirInAncestors(workDir) {
    let current = workDir;
    for (let i = 0; i < PROMPTS_DIR_SEARCH_DEPTH; i++) {
        const candidate = join(current, PROMPTS_DIRNAME);
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function findPromptsDir(workDir) {
    return findPromptsDirInAncestors(workDir);
}
function resolvePromptsDirForSeed(workDir) {
    return findPromptsDirInAncestors(workDir) ?? join(workDir, PROMPTS_DIRNAME);
}
function checksumContent(content) {
    return createHash("sha256").update(content).digest("hex");
}
export function detectPromptSourceSecretMarkers(content) {
    return PROMPT_SOURCE_SECRET_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(({ marker }) => marker);
}
export function isPromptSourceContentSafe(content) {
    return detectPromptSourceSecretMarkers(content).length === 0;
}
export function ensurePromptSourceFiles(workDir) {
    const promptsDir = resolvePromptsDirForSeed(workDir);
    mkdirSync(promptsDir, { recursive: true });
    const created = [];
    const existing = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        for (const locale of DEFAULT_PROMPT_SOURCE_SEED_LOCALES) {
            const filename = definition.filenames[locale];
            const target = join(promptsDir, filename);
            if (existsSync(target)) {
                existing.push(filename);
                continue;
            }
            const content = readPromptSourceSeedContent(workDir, definition, locale, target);
            if (!content)
                continue;
            writeFileSync(target, `${content.trim()}\n`, "utf-8");
            created.push(filename);
        }
    }
    return {
        promptsDir,
        created,
        existing,
        registry: loadPromptSourceRegistry(promptsDir),
    };
}
export function loadPromptSourceRegistry(workDir) {
    const promptsDir = findPromptsDir(workDir);
    if (!promptsDir)
        return [];
    const sources = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        for (const locale of ["ko", "en"]) {
            const filename = definition.filenames[locale];
            const candidate = join(promptsDir, filename);
            if (!existsSync(candidate))
                continue;
            try {
                const content = readFileSync(candidate, "utf-8").trim();
                if (!content)
                    continue;
                if (!isPromptSourceContentSafe(content))
                    continue;
                const checksum = checksumContent(content);
                sources.push({
                    sourceId: definition.sourceId,
                    locale,
                    path: candidate,
                    version: checksum.slice(0, 12),
                    priority: definition.priority,
                    enabled: true,
                    required: definition.required,
                    usageScope: definition.usageScope,
                    checksum,
                    content,
                });
            }
            catch {
                // Ignore one unreadable prompt source. Required-source validation is handled by assembly.
            }
        }
    }
    return sources.sort((a, b) => a.priority - b.priority ||
        a.sourceId.localeCompare(b.sourceId) ||
        a.locale.localeCompare(b.locale));
}
function applyPromptSourceStates(sources, states) {
    if (states.length === 0)
        return sources;
    const stateByKey = new Map(states.map((state) => [`${state.sourceId}:${state.locale}`, state]));
    return sources.map((source) => {
        const state = stateByKey.get(`${source.sourceId}:${source.locale}`);
        return state ? { ...source, enabled: state.enabled } : source;
    });
}
function selectRuntimePromptSources(sources, locale) {
    const bySourceId = new Map();
    for (const source of sources) {
        if (source.usageScope !== "runtime")
            continue;
        if (!source.enabled && !source.required)
            continue;
        if (!PROMPT_SOURCE_DEFINITIONS.find((definition) => definition.sourceId === source.sourceId)
            ?.defaultRuntime)
            continue;
        const bucket = bySourceId.get(source.sourceId) ?? [];
        bucket.push(source);
        bySourceId.set(source.sourceId, bucket);
    }
    const selected = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS.filter((item) => item.defaultRuntime)) {
        const candidates = bySourceId.get(definition.sourceId) ?? [];
        const preferred = candidates.find((source) => source.locale === "en");
        if (preferred)
            selected.push(preferred);
    }
    return selected.sort((a, b) => a.priority - b.priority);
}
function selectPromptSourcesByUsageScope(sources, locale, usageScope) {
    const bySourceId = new Map();
    for (const source of sources) {
        if (source.usageScope !== usageScope)
            continue;
        if (!source.enabled && !source.required)
            continue;
        const bucket = bySourceId.get(source.sourceId) ?? [];
        bucket.push(source);
        bySourceId.set(source.sourceId, bucket);
    }
    const selected = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS.filter((item) => item.usageScope === usageScope)) {
        const candidates = bySourceId.get(definition.sourceId) ?? [];
        const preferred = candidates.find((source) => source.locale === "en");
        if (preferred)
            selected.push(preferred);
    }
    return selected.sort((a, b) => a.priority - b.priority);
}
function buildRequiredPromptSourceDiagnostics(selected, locale, usageScope) {
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    return PROMPT_SOURCE_DEFINITIONS.filter((definition) => definition.required && definition.usageScope === usageScope)
        .filter((definition) => usageScope !== "runtime" || definition.defaultRuntime)
        .filter((definition) => !selectedIds.has(definition.sourceId))
        .map((definition) => ({
        severity: "error",
        code: "required_prompt_source_missing",
        sourceId: definition.sourceId,
        locale,
        message: `Required prompt source '${definition.sourceId}' is missing for ${usageScope} assembly.`,
    }));
}
function buildPromptStateSignature(states) {
    return states
        .map((state) => `${state.sourceId}:${state.locale}:${state.enabled ? "1" : "0"}`)
        .sort()
        .join("|");
}
function buildPromptRegistrySignature(sources) {
    return sources
        .map((source) => [
        source.sourceId,
        source.locale,
        source.checksum,
        source.enabled ? "1" : "0",
        source.priority,
        source.usageScope,
    ].join(":"))
        .join("|");
}
function buildPromptTemplateVariableSignature(variables) {
    return Object.entries(variables)
        .map(([key, value]) => `${key}=${String(value ?? "")}`)
        .sort()
        .join("|");
}
export function renderPromptTemplate(content, variables = {}) {
    return content.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(variables, key))
            return match;
        return String(variables[key] ?? "");
    });
}
function selectPromptTemplateSource(registry, sourceId, _locale) {
    const candidates = registry.filter((source) => source.sourceId === sourceId);
    return candidates.find((source) => source.locale === "en");
}
function promptSourceAssemblyFragment(source, variables = {}) {
    return `${promptSourceAssemblyHeader(source)}\n${renderPromptTemplate(source.content, variables)}`;
}
function promptSourceAssemblyHeader(source) {
    return promptSourceAssemblyContextLabel("fragment_header", {
        sourceId: source.sourceId,
        locale: source.locale,
        version: source.version,
    });
}
function promptSourceAssemblyContextLabel(key, variables = {}) {
    const value = loadPromptTemplate({
        sourceId: PROMPT_SOURCE_ASSEMBLY_CONTEXT_LABELS_SOURCE_ID,
        variables,
    })
        .match(/(?:^|\n)## Value\s*\n([\s\S]*?)(?=\n## |$)/iu)?.[1]
        ?.split(/\r?\n/u)
        .find((line) => line.startsWith(`${key}=`))
        ?.slice(key.length + 1)
        .trim();
    if (!value) {
        throw new Error(`prompt source assembly context label missing: ${key}`);
    }
    return value;
}
export function inspectPromptSourceAssemblyCoverage(assembly, variables = {}) {
    const items = assembly.sources.map((source) => {
        const header = promptSourceAssemblyHeader(source);
        const fullFragment = promptSourceAssemblyFragment(source, variables);
        return {
            sourceId: source.sourceId,
            locale: source.locale,
            version: source.version,
            headerPresent: assembly.text.includes(header),
            fullFragmentPresent: assembly.text.includes(fullFragment),
        };
    });
    const omittedSourceIds = items.filter((item) => !item.headerPresent).map((item) => item.sourceId);
    const truncatedSourceIds = items
        .filter((item) => item.headerPresent && !item.fullFragmentPresent)
        .map((item) => item.sourceId);
    return {
        ok: omittedSourceIds.length === 0 && truncatedSourceIds.length === 0,
        totalSources: items.length,
        omittedSourceIds,
        truncatedSourceIds,
        items,
    };
}
function renderPromptSourceAssemblyText(sources, variables = {}) {
    const fragments = sources.map((source) => promptSourceAssemblyFragment(source, variables));
    const fullText = fragments.join(PROMPT_SOURCE_FRAGMENT_SEPARATOR);
    if (fullText.length <= MAX_SYSTEM_PROMPT_SIZE)
        return fullText;
    const tailStartIndex = sources.findIndex((source) => RUNTIME_TAIL_PRESERVATION_SOURCE_IDS.includes(source.sourceId));
    if (tailStartIndex < 0)
        return fullText.slice(0, MAX_SYSTEM_PROMPT_SIZE);
    const prefixText = fragments.slice(0, tailStartIndex).join(PROMPT_SOURCE_FRAGMENT_SEPARATOR);
    const tailText = fragments.slice(tailStartIndex).join(PROMPT_SOURCE_FRAGMENT_SEPARATOR);
    const truncationNotice = [
        promptSourceAssemblyContextLabel("assembly_notice_header"),
        promptSourceAssemblyContextLabel("truncation_notice"),
    ].join("\n");
    const reservedTail = [truncationNotice, tailText].join(PROMPT_SOURCE_FRAGMENT_SEPARATOR);
    if (reservedTail.length >= MAX_SYSTEM_PROMPT_SIZE) {
        return reservedTail.slice(reservedTail.length - MAX_SYSTEM_PROMPT_SIZE);
    }
    const prefixBudget = MAX_SYSTEM_PROMPT_SIZE - reservedTail.length - PROMPT_SOURCE_FRAGMENT_SEPARATOR.length;
    const prefix = prefixText.slice(0, Math.max(0, prefixBudget)).trimEnd();
    return [prefix, reservedTail]
        .filter((part) => part.length > 0)
        .join(PROMPT_SOURCE_FRAGMENT_SEPARATOR);
}
export function loadPromptTemplate(input) {
    const workDir = input.workDir ?? MODULE_DIRNAME;
    const locale = input.locale ?? "en";
    const registry = loadPromptSourceRegistry(workDir);
    const source = selectPromptTemplateSource(registry, input.sourceId, locale);
    const definition = resolvePromptSourceDefinition(input.sourceId);
    const fallback = definition ? readPromptSourceSeedContent(workDir, definition, locale) : null;
    const content = source?.content ?? fallback;
    if (!content)
        throw new Error(`prompt template not found: ${input.sourceId}`);
    return renderPromptTemplate(content, input.variables ?? {});
}
export function loadBundledPromptTemplate(input) {
    const locale = input.locale ?? "en";
    const definition = resolvePromptSourceDefinition(input.sourceId);
    if (!definition)
        throw new Error(`bundled prompt template definition not found: ${input.sourceId}`);
    const content = readPromptSourceSeedContent(MODULE_DIRNAME, definition, locale);
    if (!content)
        throw new Error(`bundled prompt template not found: ${input.sourceId}`);
    return renderPromptTemplate(content, input.variables ?? {});
}
export function loadSystemPromptSourceAssembly(workDir, locale = "en", states = [], variables = {}, profile = "full") {
    const registry = applyPromptSourceStates(loadPromptSourceRegistry(workDir), states);
    const allRuntimeSources = selectRuntimePromptSources(registry, locale);
    const runtimeSources = profile === "execution"
        ? allRuntimeSources.filter((source) => EXECUTION_RUNTIME_PROMPT_SOURCE_IDS.has(source.sourceId))
        : allRuntimeSources;
    if (runtimeSources.length === 0)
        return null;
    const cacheKey = [
        `policy=${PROMPT_ASSEMBLY_POLICY_VERSION}`,
        `profile=${profile}`,
        `workDir=${workDir}`,
        `locale=${locale}`,
        `states=${buildPromptStateSignature(states)}`,
        `sources=${buildPromptRegistrySignature(runtimeSources)}`,
        `variables=${buildPromptTemplateVariableSignature(variables)}`,
    ].join("\n");
    const cached = promptAssemblyCache.get(cacheKey);
    if (cached)
        return cached;
    const text = renderPromptSourceAssemblyText(runtimeSources, variables);
    const assembly = {
        text,
        snapshot: {
            assemblyVersion: 1,
            createdAt: Date.now(),
            sources: runtimeSources.map(({ content: _content, ...metadata }) => metadata),
            diagnostics: buildRequiredPromptSourceDiagnostics(allRuntimeSources, locale, "runtime"),
        },
        sources: runtimeSources,
    };
    promptAssemblyCache.set(cacheKey, assembly);
    return assembly;
}
export function loadFirstRunPromptSourceAssembly(workDir, locale = "en", states = []) {
    const registry = applyPromptSourceStates(loadPromptSourceRegistry(workDir), states);
    const firstRunSources = selectPromptSourcesByUsageScope(registry, locale, "first_run");
    if (firstRunSources.length === 0)
        return null;
    const cacheKey = [
        `policy=${PROMPT_ASSEMBLY_POLICY_VERSION}`,
        "scope=first_run",
        `workDir=${workDir}`,
        `locale=${locale}`,
        `states=${buildPromptStateSignature(states)}`,
        `sources=${buildPromptRegistrySignature(firstRunSources)}`,
    ].join("\n");
    const cached = promptAssemblyCache.get(cacheKey);
    if (cached)
        return cached;
    const text = firstRunSources
        .map((source) => promptSourceAssemblyFragment(source))
        .join("\n\n---\n\n")
        .slice(0, MAX_SYSTEM_PROMPT_SIZE);
    const assembly = {
        text,
        snapshot: {
            assemblyVersion: 1,
            createdAt: Date.now(),
            sources: firstRunSources.map(({ content: _content, ...metadata }) => metadata),
            diagnostics: buildRequiredPromptSourceDiagnostics(firstRunSources, locale, "first_run"),
        },
        sources: firstRunSources,
    };
    promptAssemblyCache.set(cacheKey, assembly);
    return assembly;
}
/**
 * Load canonical runtime prompt sources from prompts/.
 * Bootstrap prompts are intentionally excluded from the default runtime assembly.
 */
export function loadSystemPromptSources(workDir) {
    return loadSystemPromptSourceAssembly(workDir)?.text ?? null;
}
function resolvePromptSourceDefinition(sourceId) {
    return PROMPT_SOURCE_DEFINITIONS.find((definition) => definition.sourceId === sourceId);
}
function resolvePromptSourcePath(workDir, sourceId, locale) {
    const definition = resolvePromptSourceDefinition(sourceId);
    if (!definition)
        throw new Error(`unknown prompt source: ${sourceId}`);
    const promptsDir = findPromptsDir(workDir) ?? resolvePromptsDirForSeed(workDir);
    return join(promptsDir, definition.filenames[locale]);
}
export function promptSourceFileExists(workDir, sourceId, locale) {
    try {
        return existsSync(resolvePromptSourcePath(workDir, sourceId, locale));
    }
    catch {
        return false;
    }
}
function requirePromptSourceFile(workDir, sourceId, locale) {
    const sourcePath = resolvePromptSourcePath(workDir, sourceId, locale);
    if (!existsSync(sourcePath))
        throw new Error(`prompt source not found: ${sourceId}:${locale}`);
    return sourcePath;
}
function normalizePromptSourceComparableContent(content) {
    return content.replace(/\r/g, "").trim();
}
function splitPromptSourceComparableLines(content) {
    const normalized = normalizePromptSourceComparableContent(content);
    return normalized ? normalized.split("\n") : [];
}
export function buildPromptSourceContentDiff(beforeContent, afterContent) {
    const normalizedBefore = normalizePromptSourceComparableContent(beforeContent);
    const normalizedAfter = normalizePromptSourceComparableContent(afterContent);
    const beforeLines = splitPromptSourceComparableLines(normalizedBefore);
    const afterLines = splitPromptSourceComparableLines(normalizedAfter);
    const max = Math.max(beforeLines.length, afterLines.length);
    const lines = [];
    for (let index = 0; index < max; index++) {
        const before = beforeLines[index];
        const after = afterLines[index];
        if (before === after) {
            if (before !== undefined)
                lines.push({
                    kind: "unchanged",
                    beforeLine: index + 1,
                    afterLine: index + 1,
                    before,
                    after: before,
                });
            continue;
        }
        if (before !== undefined && after !== undefined) {
            lines.push({ kind: "changed", beforeLine: index + 1, afterLine: index + 1, before, after });
            continue;
        }
        if (before !== undefined) {
            lines.push({ kind: "removed", beforeLine: index + 1, before });
            continue;
        }
        if (after !== undefined) {
            lines.push({ kind: "added", afterLine: index + 1, after });
        }
    }
    const beforeChecksum = checksumContent(normalizedBefore);
    const afterChecksum = checksumContent(normalizedAfter);
    return {
        beforeChecksum,
        afterChecksum,
        changed: beforeChecksum !== afterChecksum,
        lines,
    };
}
export function createPromptSourceBackup(workDir, sourceId, locale) {
    const sourcePath = requirePromptSourceFile(workDir, sourceId, locale);
    const content = readFileSync(sourcePath, "utf-8");
    const checksum = checksumContent(content);
    const createdAt = Date.now();
    const backupDir = join(dirname(sourcePath), ".backups");
    mkdirSync(backupDir, { recursive: true });
    const backupId = `${sourceId}.${locale}.${createdAt}.${checksum.slice(0, 12)}.${basename(sourcePath)}`;
    const backupPath = join(backupDir, backupId);
    copyFileSync(sourcePath, backupPath);
    return { backupId, sourceId, locale, sourcePath, backupPath, checksum, createdAt };
}
export function exportPromptSourcesToFile(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const createdAt = Date.now();
    const payload = {
        kind: "knowbee.prompt-sources.export",
        version: 1,
        createdAt,
        sources,
    };
    mkdirSync(dirname(input.outputPath), { recursive: true });
    writeFileSync(input.outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
    const checksum = checksumContent(readFileSync(input.outputPath, "utf-8"));
    return {
        exportPath: input.outputPath,
        checksum,
        createdAt,
        sourceCount: sources.length,
        sources: sources.map(({ content: _content, ...metadata }) => metadata),
    };
}
export function importPromptSourcesFromFile(input) {
    const parsed = JSON.parse(readFileSync(input.exportPath, "utf-8"));
    if (parsed.kind !== "knowbee.prompt-sources.export" ||
        parsed.version !== 1 ||
        !Array.isArray(parsed.sources)) {
        throw new Error("invalid prompt source export file");
    }
    const imported = [];
    const skipped = [];
    const backups = [];
    for (const source of parsed.sources) {
        const sourceId = source.sourceId;
        const locale = source.locale;
        const key = `${sourceId}:${locale}`;
        if (locale !== "ko" && locale !== "en") {
            skipped.push(key);
            continue;
        }
        if (!isPromptSourceContentSafe(source.content))
            throw new Error(`prompt source export contains secret-like content: ${key}`);
        let targetPath;
        try {
            targetPath = resolvePromptSourcePath(input.workDir, sourceId, locale);
        }
        catch {
            skipped.push(key);
            continue;
        }
        if (existsSync(targetPath)) {
            if (!input.overwrite) {
                skipped.push(key);
                continue;
            }
            const result = writePromptSourceWithBackup({
                workDir: input.workDir,
                sourceId,
                locale,
                content: source.content,
            });
            if (result.backup)
                backups.push(result.backup);
            if (result.diff.changed)
                imported.push(key);
            else
                skipped.push(key);
            continue;
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, `${source.content.trimEnd()}\n`, "utf-8");
        imported.push(key);
    }
    promptAssemblyCache.clear();
    return {
        exportPath: input.exportPath,
        imported,
        skipped,
        backups,
        registry: loadPromptSourceRegistry(input.workDir).map(({ content: _content, ...metadata }) => metadata),
    };
}
export function writePromptSourceWithBackup(input) {
    const sourcePath = requirePromptSourceFile(input.workDir, input.sourceId, input.locale);
    const beforeContent = readFileSync(sourcePath, "utf-8");
    const nextContent = `${input.content.trimEnd()}\n`;
    if (!isPromptSourceContentSafe(nextContent))
        throw new Error("prompt source contains secret-like content");
    const quality = validatePromptSourceContentQuality({
        sourceId: input.sourceId,
        content: nextContent,
    });
    if (!quality.ok)
        throw new PromptSourceContentQualityError(quality.issues);
    const diff = buildPromptSourceContentDiff(normalizePromptSourceComparableContent(beforeContent), normalizePromptSourceComparableContent(nextContent));
    const backup = diff.changed && input.createBackup !== false
        ? createPromptSourceBackup(input.workDir, input.sourceId, input.locale)
        : null;
    if (diff.changed)
        writeFileSync(sourcePath, nextContent, "utf-8");
    const source = loadPromptSourceRegistry(input.workDir).find((item) => item.sourceId === input.sourceId && item.locale === input.locale);
    if (!source)
        throw new Error(`prompt source reload failed: ${input.sourceId}:${input.locale}`);
    promptAssemblyCache.clear();
    return { backup, source, diff };
}
export class PromptSourceHarnessValidationError extends Error {
    validation;
    decision;
    constructor(validation, decision) {
        super("prompt improvement harness validation failed");
        this.name = "PromptSourceHarnessValidationError";
        this.validation = validation;
        this.decision = decision ?? {
            state: "blocked",
            risk: validation.risk,
            missingFields: [],
            issues: validation.issues,
        };
    }
}
export function writePromptSourceWithHarness(input) {
    const harnessDecision = decidePromptImprovementHarnessInput(input.harnessInput);
    if (harnessDecision.state === "blocked") {
        throw new PromptSourceHarnessValidationError({
            ok: false,
            risk: harnessDecision.risk,
            issues: harnessDecision.issues,
        }, harnessDecision);
    }
    const harnessValidation = {
        ok: true,
        risk: harnessDecision.risk,
        issues: [],
    };
    const harnessInput = input.harnessInput;
    const sourceRef = `${input.sourceId}:${input.locale}`;
    if (!harnessInput.targetPromptSources.includes(sourceRef)) {
        throw new PromptSourceHarnessValidationError({
            ok: false,
            risk: harnessValidation.risk,
            issues: [
                {
                    code: "source_write_target_mismatch",
                    path: "sourceId",
                    message: "The prompt source being written must exactly match a validated targetPromptSources entry.",
                },
            ],
        });
    }
    const currentSource = loadPromptSourceRegistry(input.workDir).find((source) => source.sourceId === input.sourceId && source.locale === input.locale);
    const sourceDecision = authorizePromptImprovementMutableSource({
        sourceKind: "prompt_registry_record",
        sourceRef,
        baselineVersion: currentSource ? `checksum:${currentSource.checksum}` : "",
        baselineChecksum: currentSource?.checksum ?? "",
    });
    const execution = executeAuthorizedPromptImprovementMutableSource({
        authorization: sourceDecision,
        writerKind: "prompt_registry_record",
        auditContext: {
            runId: `prompt-improvement:${currentSource?.checksum.slice(0, 12) ?? "missing-source"}`,
            actor: harnessInput.improvingAgentName,
            timestamp: Date.now(),
        },
        recordAudit: input.recordMutableSourceAudit ?? (() => undefined),
        write: () => writePromptSourceWithBackup({
            workDir: input.workDir,
            sourceId: input.sourceId,
            locale: input.locale,
            content: input.content,
            ...(input.createBackup !== undefined ? { createBackup: input.createBackup } : {}),
        }),
    });
    if (execution.status === "blocked") {
        throw new PromptSourceHarnessValidationError({
            ok: false,
            risk: harnessValidation.risk,
            issues: [
                {
                    code: "mutable_source_not_authorized",
                    path: "sourceId",
                    message: `Prompt source mutation is blocked: ${execution.reasonCode}.`,
                },
            ],
        });
    }
    const result = execution.result;
    const sourceWriteState = result.diff.changed
        ? "written"
        : "unchanged";
    const activationState = sourceWriteState === "written" ? "activation_pending" : "unchanged";
    const harnessReport = buildPromptImprovementHarnessReport({
        runId: `prompt-improvement:${result.diff.afterChecksum.slice(0, 12)}`,
        harnessInput,
        validation: harnessValidation,
        sourceWriteState,
        changedPromptSources: result.diff.changed ? [sourceRef] : [],
        backupPath: result.backup?.backupPath ?? null,
        sourceChecksums: [{ sourceRef, beforeChecksum: result.diff.beforeChecksum }],
        currentPromptSummary: harnessInput.currentBehavior,
        rollbackTarget: result.backup?.backupPath ?? harnessInput.rollbackPlan,
    });
    return {
        ...result,
        harnessValidation,
        sourceWriteState,
        activationState,
        harnessReport,
    };
}
export function rollbackPromptSourceBackup(input) {
    if (!existsSync(input.sourcePath))
        throw new Error("prompt source file not found");
    if (!existsSync(input.backupPath))
        throw new Error("prompt source backup not found");
    const previousContent = readFileSync(input.sourcePath, "utf-8");
    const restoredContent = readFileSync(input.backupPath, "utf-8");
    if (!isPromptSourceContentSafe(restoredContent))
        throw new Error("prompt source backup contains secret-like content");
    writeFileSync(input.sourcePath, restoredContent, "utf-8");
    promptAssemblyCache.clear();
    return {
        sourcePath: input.sourcePath,
        backupPath: input.backupPath,
        restoredChecksum: checksumContent(normalizePromptSourceComparableContent(restoredContent)),
        previousChecksum: checksumContent(normalizePromptSourceComparableContent(previousContent)),
        rolledBackFiles: [{ sourcePath: input.sourcePath, backupPath: input.backupPath }],
        reason: input.reason?.trim() || "prompt_source_rollback_requested",
        activationStateAfterRollback: "rolled_back",
        remainingRisk: "Runtime may still need reload or restart before the restored prompt source is active.",
        nextRecommendedAction: "Run prompt regression checks and confirm runtime activation before reporting the prompt as active.",
    };
}
export function dryRunPromptSourceAssembly(workDir, locale = "en", states = []) {
    const assembly = loadSystemPromptSourceAssembly(workDir, locale, states);
    const sources = assembly?.sources ?? [];
    return {
        assembly,
        sourceOrder: sources.map((source) => ({
            sourceId: source.sourceId,
            locale: source.locale,
            checksum: source.checksum,
            version: source.version,
            path: source.path,
        })),
        totalChars: assembly?.text.length ?? 0,
        diagnostics: assembly?.snapshot.diagnostics ?? buildRequiredPromptSourceDiagnostics([], locale, "runtime"),
    };
}
function extractHeadingKeys(content) {
    return content
        .split(/\n/u)
        .map((line) => line
        .match(/^#{1,3}\s+(.+)$/u)?.[1]
        ?.trim()
        .toLowerCase())
        .filter((value) => Boolean(value));
}
export function checkPromptSourceLocaleParity(workDir) {
    const promptsDir = findPromptsDir(workDir);
    if (!promptsDir) {
        return {
            ok: false,
            issues: [
                { sourceId: "prompts", code: "missing_locale", message: "prompts directory was not found" },
            ],
        };
    }
    const issues = [];
    for (const definition of PROMPT_SOURCE_DEFINITIONS) {
        const koPath = join(promptsDir, definition.filenames.ko);
        const enPath = join(promptsDir, definition.filenames.en);
        const hasKo = existsSync(koPath);
        const hasEn = existsSync(enPath);
        if (!hasEn)
            issues.push({
                sourceId: definition.sourceId,
                code: "missing_locale",
                locale: "en",
                message: `${definition.sourceId} is missing English source`,
            });
        if (!hasKo || !hasEn)
            continue;
        const koHeadings = extractHeadingKeys(readFileSync(koPath, "utf-8"));
        const enHeadings = extractHeadingKeys(readFileSync(enPath, "utf-8"));
        const minHeadingCount = Math.min(koHeadings.length, enHeadings.length);
        if (minHeadingCount === 0)
            continue;
        const headingDelta = Math.abs(koHeadings.length - enHeadings.length);
        if (headingDelta > 2) {
            issues.push({
                sourceId: definition.sourceId,
                code: "section_mismatch",
                message: `${definition.sourceId} locale headings differ too much (${koHeadings.length} vs ${enHeadings.length})`,
            });
        }
    }
    return { ok: issues.length === 0, issues };
}
const TEMPLATE = `# Project Memory

## Technology Stack
- Describe languages, frameworks, runtimes, and major services.

## Code Rules
- Describe coding conventions, formatters, linters, and review rules.

## Important Paths
- List important config files, databases, logs, and generated artifacts.

## Prohibited Actions
- List actions that must not be performed.

## Additional Notes
- Add any other project-specific context the agent should know.
`;
/** Write a KNOWBEE.md template to the given directory. */
export function initKnowbeeMd(dir) {
    const target = join(dir, "KNOWBEE.md");
    if (!existsSync(target)) {
        writeFileSync(target, TEMPLATE, "utf-8");
    }
    return target;
}
export const loadWizbyMd = loadKnowbeeMd;
export const initWizbyMd = initKnowbeeMd;
export const loadHowieMd = loadKnowbeeMd;
export const initHowieMd = initKnowbeeMd;
//# sourceMappingURL=knowbee-md.js.map