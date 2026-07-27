import {
  checkPromptSourceLocaleParity,
  dryRunPromptSourceAssembly,
  inspectPromptSourceAssemblyCoverage,
  loadPromptSourceRegistry,
  promptSourceFileExists,
  type LoadedPromptSource,
  type PromptSourceAssemblyCoverageReport,
  type PromptSourceLocaleParityResult,
} from "./knowbee-md.js"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { validateGoalOwnershipCatalog } from "../maintenance/goal-ownership.js"
import {
  CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
  validateCanonicalPromptResponsibilityManifest,
} from "../contracts/canonical-prompt-responsibility-manifest.js"

export type PromptRegressionSeverity = "error" | "warning"
export type PromptRegressionLocale = "ko" | "en"

export interface PromptRegressionIssue {
  severity: PromptRegressionSeverity
  code: string
  message: string
  sourceId?: string
  locale?: PromptRegressionLocale
  evidence?: string
}

export interface PromptResponsibilityRuleResult {
  id: string
  description: string
  ok: boolean
  allowedSourceIds: string[]
  issues: PromptRegressionIssue[]
}

export interface PromptImpactScenarioResult {
  id: string
  description: string
  locale: PromptRegressionLocale
  ok: boolean
  requiredMarkers: string[]
  missingMarkers: string[]
}

export interface PromptSourceRegressionResult {
  ok: boolean
  workDir: string
  generatedAt: number
  locales: PromptRegressionLocale[]
  registry: {
    sourceCount: number
    runtimeSourceCount: number
    checksums: Array<{ sourceId: string; locale: PromptRegressionLocale; checksum: string; version: string; path: string }>
  }
  localeParity: PromptSourceLocaleParityResult
  responsibility: PromptResponsibilityRuleResult[]
  policyCompatibility: PromptResponsibilityRuleResult[]
  assemblyCoverage: PromptAssemblyCoverageRegressionResult[]
  impact: PromptImpactScenarioResult[]
  issues: PromptRegressionIssue[]
}

export interface PromptAssemblyCoverageRegressionResult extends PromptSourceAssemblyCoverageReport {
  locale: PromptRegressionLocale
}

interface ResponsibilityMarker {
  code: string
  pattern: RegExp
  message: string
}

interface ResponsibilityRule {
  id: string
  description: string
  allowedSourceIds: string[]
  markers: ResponsibilityMarker[]
}

interface ImpactMarker {
  id: string
  patterns: Record<PromptRegressionLocale, RegExp>
}

interface ImpactScenario {
  id: string
  description: string
  markers: ImpactMarker[]
  sourceScope?: "assembly" | "prompt_sources"
}

const EXPECTED_PROMPT_SOURCE_IDS = [
  "system",
  "definitions",
  "identity",
  "runtime_identity_context",
  "user",
  "task_intake",
  "work_record",
  "tool_policy",
  "memory_policy",
  "prompt_visibility",
  "soul",
  "planner",
  "knowbee_execution",
  "workflow",
  "sub_agent_delegation",
  "yeonjang_policy",
  "prompt_improvement",
  "reasoning_policy_runtime",
  "web_access_policy_runtime",
  "recovery_policy",
  "topology_executor_policy",
  "completion_policy",
  "result_review",
  "output_policy",
  "final_response",
  "maintenance_policy",
  "ui_policy",
  "runtime_environment_policy",
  "logging_policy",
  "channel",
  "bootstrap",
  "sub_agent_base",
  "agent_persona",
  "completion_review",
  "prompt_bundle_default_safety_rules_user",
  "prompt_bundle_self_agent_name_rule_user",
  "prompt_bundle_agent_name_attribution_rule_user",
  "prompt_bundle_executor_profile_projection_user",
  "prompt_bundle_context_labels_user",
  "prompt_source_assembly_context_labels_user",
  "imported_agent_draft_review_summary_suffix_user",
  "imported_agent_draft_avoid_tasks_user",
  "profile_context_user_header_user",
  "profile_context_agent_header_user",
  "profile_context_team_header_user",
  "agent_runtime_prompt_context_labels_user",
  "instruction_merge_context_labels_user",
  "internal_run_prompt_prefix_labels_user",
  "memory_prompt_context_labels_user",
  "memory_restore_prompt_context_labels_user",
  "memory_compressor_summary_prompt_user",
  "root_session_summary_prompt_user",
  "task_intake_user",
  "intake_complete_condition_schedule_saved_user",
  "intake_complete_condition_schedule_timing_matches_user",
  "intake_complete_condition_schedule_timing_preserved_user",
  "intake_complete_condition_cancel_schedule_user",
  "intake_complete_condition_missing_info_collected_user",
  "intake_complete_condition_reply_destination_user",
  "intake_complete_condition_schedule_registered_user",
  "intake_complete_condition_clarification_requested_user",
  "intake_complete_condition_default_result_user",
  "intake_conversation_context_labels_user",
  "completion_review_user",
  "completion_review_context_v2",
  "completion_review_context_labels_user",
  "response_language_exception_review",
  "response_language_exception_review_user",
  "final_response_user",
  "delegated_child_followup_user",
  "review_cycle_followup_result_report_instruction_user",
  "sub_agent_result_review_required_changes_user",
  "comparison_prompt_context_labels_user",
  "schedule_intake_recovery_user",
  "request_continuation",
  "direct_artifact_delivery_recovery_user",
  "command_failure_recovery_user",
  "execution_recovery_user",
  "ai_error_recovery_user",
  "worker_runtime_error_recovery_user",
  "filesystem_execution_required_user",
  "filesystem_verification_recovery_user",
  "empty_result_recovery_user",
  "truncated_output_recovery_user",
  "recovery_prompt_section_text_user",
  "approval_granted_continuation_user",
  "task_execution_brief_user",
  "task_execution_brief_section_labels_user",
  "task_execution_filesystem_instruction_user",
  "task_execution_general_instruction_user",
  "task_execution_default_required_output_user",
  "task_execution_default_verification_note_user",
  "task_execution_filesystem_verification_note_user",
  "task_execution_text_verification_note_user",
  "context_preflight_pruning_labels_user",
  "execution_default_target_user",
  "execution_default_destination_user",
  "execution_default_complete_condition_user",
  "execution_fallback_original_request_context_user",
  "structured_execution_checklist_confirm_goal_user",
  "structured_execution_checklist_filesystem_work_user",
  "structured_execution_checklist_general_work_user",
  "structured_execution_checklist_complete_condition_user",
  "structured_execution_checklist_direct_artifact_user",
  "structured_execution_checklist_final_result_user",
  "structured_execution_checklist_stop_condition_user",
  "task_execution_checklist_confirm_goal_user",
  "task_execution_checklist_filesystem_work_user",
  "task_execution_checklist_general_work_user",
  "task_execution_checklist_complete_condition_user",
  "task_execution_checklist_direct_artifact_user",
  "task_execution_checklist_final_result_user",
  "task_execution_checklist_stop_condition_user",
  "root_execution_header_user",
  "root_execution_intake_complete_intro_user",
  "root_execution_checklist_order_closing_user",
  "root_execution_incomplete_checklist_closing_user",
  "structured_execution_original_request_block_user",
  "structured_execution_section_labels_user",
  "structured_execution_brief_user",
  "scheduled_followup_user",
  "scheduled_tool_enabled_instruction_user",
  "scheduled_tool_disabled_instruction_user",
  "scheduled_default_destination_user",
  "scheduled_structured_request_header_user",
  "scheduled_context_task_payload_user",
  "scheduled_context_task_profile_user",
  "scheduled_context_time_reached_user",
  "scheduled_complete_time_reached_user",
  "scheduled_complete_destination_user",
  "scheduled_contract_execution_user",
  "filesystem_verification_user",
  "filesystem_verification_context_labels_user",
  "delegated_task_dispatch_user",
  "execution_decision_harness",
  "diagnosis_json_instruction_user",
  "request_diagnosis",
  "result_diagnosis",
  "diagnosis_schema_repair",
  "topology_recovery_review_summaries_user",
  "work_order_template_prompt_text_user",
  "topology_runtime_harness_text_user",
  "execution_harness_fallback_text_user",
  "execution_harness_policy_context_labels_user",
  "ai_connection_test",
  "codex_oauth_fallback_prompt_labels_user",
  "schedule_comparison",
  "node_definition_api_system_user",
  "node_definition_suggestion",
  "node_definition_input_block_user",
  "node_definition_name_guidance_user",
  "node_definition_description_guidance_user",
  "node_definition_description_review_guidance_user",
] as const

const CANONICAL_BOUNDARY_PROMPT_SOURCE_IDS = [
  "system",
  "definitions",
  "identity",
  "user",
  "soul",
  "planner",
  "task_intake",
  "work_record",
  "knowbee_execution",
  "workflow",
  "prompt_visibility",
  "sub_agent_base",
  "agent_persona",
  "sub_agent_delegation",
  "result_review",
  "yeonjang_policy",
  "memory_policy",
  "prompt_improvement",
  "recovery_policy",
  "tool_policy",
  "topology_executor_policy",
  "completion_policy",
  "output_policy",
  "final_response",
  "maintenance_policy",
  "ui_policy",
  "runtime_environment_policy",
  "logging_policy",
  "channel",
  "request_diagnosis",
  "result_diagnosis",
  "diagnosis_schema_repair",
] as const

const RESPONSIBILITY_RULES: ResponsibilityRule[] = [
  {
    id: "system_owns_platform_agent_role",
    description: "The root platform-agent role and prompt-stack ownership declarations must stay in system.md.",
    allowedSourceIds: ["system"],
    markers: [
      {
        code: "platform_agent_role_outside_system",
        pattern: /act as the platform-level main agent, not as a general-purpose chatbot/iu,
        message: "The platform-agent role declaration must stay in system.md.",
      },
      {
        code: "prompt_stack_contract_outside_system",
        pattern: /Use this root prompt to resolve source priority and module ownership only/iu,
        message: "The root prompt-stack ownership contract must stay in system.md.",
      },
    ],
  },
  {
    id: "identity_owns_agent_name_contract",
    description: "Product names and the agent ID/name boundary must stay in identity.md.",
    allowedSourceIds: ["identity", "runtime_identity_context"],
    markers: [
      {
        code: "name_definition_outside_identity",
        pattern: /(?:제품명|product name|기본 이름|영문 이름|default name|english name|default self name)\s*:/iu,
        message: "Product and agent-name definitions must stay in identity.md.",
      },
    ],
  },
  {
    id: "task_intake_owns_work_start_decision",
    description: "LLM request intake and work-start decisions must stay in task_intake.md.",
    allowedSourceIds: ["task_intake"],
    markers: [
      {
        code: "work_start_decision_outside_task_intake",
        pattern: /Identify at least one viable solution path before deciding that work should start/iu,
        message: "The request-intake work-start decision must stay in task_intake.md.",
      },
    ],
  },
  {
    id: "sub_agent_base_owns_base_layer_contract",
    description: "The ordinary sub-agent base-layer order and configured boundary must stay in sub_agent_base.md.",
    allowedSourceIds: ["sub_agent_base"],
    markers: [
      {
        code: "sub_agent_base_contract_outside_sub_agent_base",
        pattern: /Apply the platform base prompt before this sub-agent base policy/iu,
        message: "The sub-agent base-layer order must stay in sub_agent_base.md.",
      },
    ],
  },
  {
    id: "agent_persona_owns_explicit_trait_contract",
    description: "Explicit optional agent traits and empty-persona rejection must stay in agent_persona.md.",
    allowedSourceIds: ["agent_persona"],
    markers: [
      {
        code: "agent_persona_contract_outside_agent_persona",
        pattern: /Apply persona details only when the user or trusted configuration explicitly provides them for this agent/iu,
        message: "Explicit persona activation rules must stay in agent_persona.md.",
      },
      {
        code: "agent_persona_contract_outside_agent_persona",
        pattern: /Ignore empty persona values instead of injecting them as defaults/iu,
        message: "Empty persona handling must stay in agent_persona.md.",
      },
    ],
  },
  {
    id: "sub_agent_delegation_owns_direct_child_execution",
    description: "Direct-child delegation and changed redelegation execution must stay in sub_agent_delegation.md.",
    allowedSourceIds: ["sub_agent_delegation"],
    markers: [
      {
        code: "sub_agent_delegation_contract_outside_sub_agent_delegation",
        pattern: /The main agent may delegate only to direct top-level sub-agents/iu,
        message: "Main-agent direct-child delegation must stay in sub_agent_delegation.md.",
      },
      {
        code: "sub_agent_delegation_contract_outside_sub_agent_delegation",
        pattern: /A refinement or redelegation request must change at least one axis/iu,
        message: "Changed-axis redelegation execution must stay in sub_agent_delegation.md.",
      },
    ],
  },
  {
    id: "user_owns_user_profile",
    description: "사용자 이름, 호칭, 시간대, 선호 같은 사용자 최소 정보는 user prompt에만 있어야 한다.",
    allowedSourceIds: ["user"],
    markers: [
      {
        code: "user_profile_definition_outside_user",
        pattern: /(?:실명|계정명\/닉네임|선호 이름|기본 호칭|real name|account name|preferred name|default form of address|default address style)\s*:/iu,
        message: "User profile definitions must stay in user.",
      },
      {
        code: "timezone_definition_outside_user",
        pattern: /(?:기준 시간대|표시 시간대|reference timezone|display timezone)\s*:/iu,
        message: "User timezone defaults must stay in user.",
      },
    ],
  },
  {
    id: "soul_owns_long_term_principles",
    description: "장기 운영 원칙의 제목과 핵심 원칙 선언은 soul prompt에만 있어야 한다.",
    allowedSourceIds: ["soul"],
    markers: [
      {
        code: "soul_heading_outside_soul",
        pattern: /^(?:#\s+(?:소울 프롬프트|Soul Prompt)|##\s+(?:핵심 원칙|Core Principles|Core Priorities|Long-Term Consistency Rules))$/imu,
        message: "Long-term operating principle headings must stay in soul.",
      },
    ],
  },
  {
    id: "yeonjang_policy_owns_computer_control_details",
    description: "Yeonjang computer-control details must stay in yeonjang_policy, not the root system prompt.",
    allowedSourceIds: ["yeonjang_policy"],
    markers: [
      {
        code: "yeonjang_control_policy_outside_yeonjang",
        pattern: /Yeonjang.{0,120}(?:privileged local operations|screen capture|keyboard control|mouse control|command execution|computer inspection|computer control)/iu,
        message: "Yeonjang computer-control policy details must stay in yeonjang_policy.",
      },
      {
        code: "yeonjang_targeting_policy_outside_yeonjang",
        pattern: /(?:Before dispatching a Yeonjang action, record the selected instance|Check the selected instance state, trust state, scope access, support profile, requested method, and output mode before execution|If no Yeonjang instance is available, continue with Knowbee-only conversation|When a Yeonjang action fails, diagnose whether the failure came from target selection)/iu,
        message: "Yeonjang targeting, validation, fallback, and retry policy details must stay in yeonjang_policy.",
      },
    ],
  },
  {
    id: "definitions_owns_trusted_settings_definition",
    description: "Trusted-settings source definitions must stay in definitions.",
    allowedSourceIds: ["definitions"],
    markers: [
      {
        code: "trusted_settings_definition_outside_definitions",
        pattern: /Trusted settings are (?:explicit config values|limited to explicit config values)/iu,
        message: "Trusted-settings source definitions must stay in definitions; other prompts should reference definitions.md.",
      },
    ],
  },
  {
    id: "memory_policy_owns_memory_scope_details",
    description: "Detailed memory ownership, injection gate, and long-term write gate rules must stay in memory_policy.",
    allowedSourceIds: ["memory_policy"],
    markers: [
      {
        code: "memory_policy_detail_outside_memory_policy",
        pattern: /The MainAgent and every SubAgent must have independent short-term memory and independent long-term memory/iu,
        message: "Agent memory ownership rules must stay in memory_policy.",
      },
      {
        code: "memory_policy_detail_outside_memory_policy",
        pattern: /Inject memory only from the active agent's owner scope/iu,
        message: "Memory injection gate rules must stay in memory_policy.",
      },
      {
        code: "memory_policy_detail_outside_memory_policy",
        pattern: /Before writing long-term memory, verify storage need, sensitivity, user intent, target owner scope, source evidence, and retention purpose/iu,
        message: "Long-term memory write gate rules must stay in memory_policy.",
      },
      {
        code: "memory_policy_detail_outside_memory_policy",
        pattern: /General chat is not long-term memory unless the user explicitly asks to remember it/iu,
        message: "Long-term memory promotion defaults must stay in memory_policy.",
      },
    ],
  },
  {
    id: "prompt_visibility_owns_raw_prompt_disclosure",
    description: "Detailed raw prompt-source disclosure, summary fallback, and redaction policy must stay in prompt_visibility.",
    allowedSourceIds: ["prompt_visibility"],
    markers: [
      {
        code: "prompt_visibility_detail_outside_prompt_visibility",
        pattern: /Raw prompt source disclosure requires an authorized workflow purpose/iu,
        message: "Authorized raw prompt-source disclosure rules must stay in prompt_visibility.",
      },
      {
        code: "prompt_visibility_detail_outside_prompt_visibility",
        pattern: /If the user asks to see a system prompt outside an authorized workflow/iu,
        message: "Unauthorized prompt disclosure fallback rules must stay in prompt_visibility.",
      },
      {
        code: "prompt_visibility_detail_outside_prompt_visibility",
        pattern: /Redact secrets, tokens, credentials, private memory, internal file paths, personal data/iu,
        message: "Prompt source disclosure redaction rules must stay in prompt_visibility.",
      },
      {
        code: "prompt_visibility_detail_outside_prompt_visibility",
        pattern: /refuse raw disclosure and provide only the behavior-policy summary/iu,
        message: "Unsafe disclosure refusal rules must stay in prompt_visibility.",
      },
    ],
  },
  {
    id: "execution_policy_owns_delegation_route_details",
    description: "Detailed mandatory delegation and route behavior must stay in execution/delegation policy prompts.",
    allowedSourceIds: ["knowbee_execution", "sub_agent_delegation", "topology_executor_policy", "execution_decision_harness"],
    markers: [
      {
        code: "delegation_route_policy_outside_execution_policy",
        pattern: /delegated automatically when an enabled direct child/iu,
        message: "Automatic delegation route behavior must stay in execution/delegation policy prompts.",
      },
      {
        code: "delegation_route_policy_outside_execution_policy",
        pattern: /If at least one suitable delegation target exists/iu,
        message: "Mandatory delegation behavior must stay in execution/delegation policy prompts.",
      },
      {
        code: "delegation_route_policy_outside_execution_policy",
        pattern: /Do not delegate directly to grandchildren/iu,
        message: "Detailed hierarchy route prohibitions must stay in execution/delegation policy prompts.",
      },
      {
        code: "delegation_route_policy_outside_execution_policy",
        pattern: /Every delegation must include a `CommandRequest`/iu,
        message: "Delegation handoff payload requirements must stay in execution/delegation policy prompts.",
      },
    ],
  },
  {
    id: "work_record_owns_diagnosis_schema",
    description: "Diagnosis field lists and RecommendedAction enum definitions must stay in work_record.",
    allowedSourceIds: ["work_record"],
    markers: [
      {
        code: "diagnosis_schema_definition_outside_work_record",
        pattern: /RecommendedAction values are/iu,
        message: "RecommendedAction enum definitions must stay in work_record.",
      },
      {
        code: "diagnosis_schema_definition_outside_work_record",
        pattern: /Request diagnosis records must include/iu,
        message: "Request diagnosis field definitions must stay in work_record.",
      },
      {
        code: "diagnosis_schema_definition_outside_work_record",
        pattern: /Result diagnosis records must include/iu,
        message: "Result diagnosis field definitions must stay in work_record.",
      },
      {
        code: "diagnosis_schema_definition_outside_work_record",
        pattern: /Include these fields:\s*`diagnosis_summary`/iu,
        message: "Diagnosis field lists must stay in work_record.",
      },
      {
        code: "diagnosis_schema_definition_outside_work_record",
        pattern: /`recommended_action`\s+must be one of:/iu,
        message: "RecommendedAction enum definitions must stay in work_record.",
      },
    ],
  },
  {
    id: "request_diagnosis_owns_action_routing_boundary",
    description: "Request diagnosis action-routing boundaries must stay in request_diagnosis.",
    allowedSourceIds: ["request_diagnosis"],
    markers: [
      {
        code: "request_diagnosis_boundary_outside_request_diagnosis",
        pattern: /Base the recommendation on diagnosed goal, constraints, risk, missing information, explicit user targets, and available capabilities, not keyword matching/iu,
        message: "Request diagnosis action-routing details must stay in request_diagnosis.",
      },
      {
        code: "request_diagnosis_boundary_outside_request_diagnosis",
        pattern: /Downstream execution must use the structured diagnosis and structured request; it must not reinterpret raw user text/iu,
        message: "Request diagnosis raw-input boundary details must stay in request_diagnosis.",
      },
    ],
  },
  {
    id: "result_diagnosis_owns_raw_result_boundary",
    description: "Raw result evidence and diagnosis boundaries must stay in result_diagnosis.",
    allowedSourceIds: ["result_diagnosis"],
    markers: [
      {
        code: "result_diagnosis_boundary_outside_result_diagnosis",
        pattern: /Treat raw execution output, tool output, Yeonjang output, validation output, and sub-agent output as evidence candidates, not as action decisions/iu,
        message: "Raw result evidence boundaries must stay in result_diagnosis.",
      },
      {
        code: "result_diagnosis_boundary_outside_result_diagnosis",
        pattern: /If raw output is unstructured or ambiguous, diagnose the ambiguity instead of forwarding it as a final answer/iu,
        message: "Unstructured raw output diagnosis boundaries must stay in result_diagnosis.",
      },
    ],
  },
  {
    id: "result_review_owns_next_action_boundary",
    description: "Diagnosis-first next-action review boundaries must stay in result_review.",
    allowedSourceIds: ["result_review"],
    markers: [
      {
        code: "result_review_boundary_outside_result_review",
        pattern: /Act from a valid structured result diagnosis, not from raw output text, raw child status, raw tool status, or raw Yeonjang status alone/iu,
        message: "Diagnosis-first next-action review boundaries must stay in result_review.",
      },
      {
        code: "result_review_boundary_outside_result_review",
        pattern: /If the result diagnosis is missing or invalid, follow `work_record\.md` schema repair rules before choosing retry, redelegation, final report, partial report, or blocked report/iu,
        message: "Invalid result diagnosis repair boundaries must stay in result_review.",
      },
    ],
  },
  {
    id: "maintenance_policy_owns_cleanup_evidence_details",
    description: "Detailed cleanup evidence, deletion validation, and duplicate-removal rules must stay in maintenance_policy.",
    allowedSourceIds: ["maintenance_policy"],
    markers: [
      {
        code: "maintenance_cleanup_detail_outside_maintenance_policy",
        pattern: /Record each cleanup candidate with artifact path or id, artifact kind, current owner, cleanup reason, replacement owner when duplicated/iu,
        message: "Cleanup candidate evidence details must stay in maintenance_policy.",
      },
      {
        code: "maintenance_cleanup_detail_outside_maintenance_policy",
        pattern: /Prompt cleanup must verify prompt registry membership, prompt assembly order, prompt regression ownership, active locale handling, and generated prompt artifacts before deletion/iu,
        message: "Prompt cleanup validation details must stay in maintenance_policy.",
      },
      {
        code: "maintenance_cleanup_detail_outside_maintenance_policy",
        pattern: /Compatibility layers may remain only with an owner, active caller evidence, removal condition, and validation/iu,
        message: "Compatibility-layer cleanup details must stay in maintenance_policy.",
      },
    ],
  },
  {
    id: "ui_policy_owns_configuration_clarity_details",
    description: "Detailed UI configuration clarity and visibility rules must stay in ui_policy.",
    allowedSourceIds: ["ui_policy"],
    markers: [
      {
        code: "ui_policy_detail_outside_ui_policy",
        pattern: /Organize settings around user tasks and outcomes, not internal module names, database fields, graph schemas, or runtime implementation boundaries/iu,
        message: "User-facing settings organization details must stay in ui_policy.",
      },
      {
        code: "ui_policy_detail_outside_ui_policy",
        pattern: /Hide `agent_id`, raw prompt stack, raw persona traits, hidden system instructions, internal topology metadata, and raw execution contracts from ordinary agent configuration screens/iu,
        message: "Agent configuration visibility details must stay in ui_policy.",
      },
      {
        code: "ui_policy_detail_outside_ui_policy",
        pattern: /Button labels must match persistence behavior/iu,
        message: "Save and navigation UI semantics must stay in ui_policy.",
      },
      {
        code: "ui_policy_detail_outside_ui_policy",
        pattern: /Keyboard navigation, visible focus, accessible names, control-to-error association, and non-color state cues are required for every primary workflow/iu,
        message: "Primary-workflow accessibility criteria must stay in ui_policy.",
      },
    ],
  },
  {
    id: "runtime_environment_policy_owns_environment_details",
    description: "Detailed runtime environment intake, explicit configuration delivery, and log-level boundaries must stay in runtime_environment_policy.",
    allowedSourceIds: ["runtime_environment_policy"],
    markers: [
      {
        code: "runtime_environment_detail_outside_runtime_environment_policy",
        pattern: /Read environment variables and external environment constants only during process startup or an explicit bootstrap stage/iu,
        message: "Startup-only environment intake details must stay in runtime_environment_policy.",
      },
      {
        code: "runtime_environment_detail_outside_runtime_environment_policy",
        pattern: /After bootstrap, do not read, inject, or mutate `process\.env`, hidden mutable config, singleton config, or global runtime constants to change behavior/iu,
        message: "Mid-process environment mutation boundaries must stay in runtime_environment_policy.",
      },
      {
        code: "runtime_environment_detail_outside_runtime_environment_policy",
        pattern: /Pass accepted environment values through explicit settings objects, constructor arguments, use-case input, command options, dependency injection, or runtime context objects/iu,
        message: "Explicit configuration delivery details must stay in runtime_environment_policy.",
      },
      {
        code: "runtime_environment_detail_outside_runtime_environment_policy",
        pattern: /Log level is chosen during bootstrap/iu,
        message: "Runtime log-level boundary details must stay in runtime_environment_policy.",
      },
    ],
  },
  {
    id: "logging_policy_owns_log_level_details",
    description: "Detailed product/debug/development logging and redaction rules must stay in logging_policy.",
    allowedSourceIds: ["logging_policy"],
    markers: [
      {
        code: "logging_policy_detail_outside_logging_policy",
        pattern: /Classify every log event as `product`, `debug`, or `development`/iu,
        message: "Logging level classification details must stay in logging_policy.",
      },
      {
        code: "logging_policy_detail_outside_logging_policy",
        pattern: /`product` logs are minimal operator-facing records for startup, shutdown, final state, failure, security, permission, approval, and delivery status/iu,
        message: "Product log details must stay in logging_policy.",
      },
      {
        code: "logging_policy_detail_outside_logging_policy",
        pattern: /`debug` logs support field diagnosis with request id, run id, adapter state, external-call summary, retry summary, recovery summary, and sanitized error class/iu,
        message: "Debug log details must stay in logging_policy.",
      },
      {
        code: "logging_policy_detail_outside_logging_policy",
        pattern: /Logs are observability records; they must not become the source of domain decisions, completion decisions, approval decisions, or user-facing truth by themselves/iu,
        message: "Logging observability boundary details must stay in logging_policy.",
      },
    ],
  },
  {
    id: "prompt_improvement_owns_harness_state_machine",
    description: "Detailed recursive prompt-improvement harness states, events, and transitions must stay in prompt_improvement.",
    allowedSourceIds: ["prompt_improvement"],
    markers: [
      {
        code: "prompt_improvement_harness_state_machine_outside_prompt_improvement",
        pattern: /Recursive prompt improvement must be represented as a state machine, not loose flag combinations/iu,
        message: "Prompt improvement harness state-machine rules must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_harness_state_machine_outside_prompt_improvement",
        pattern: /Allowed harness states:\s*-\s*`idle`\s*-\s*`intake`\s*-\s*`source_discovery`/iu,
        message: "Prompt improvement harness state lists must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_harness_state_machine_outside_prompt_improvement",
        pattern: /Allowed harness events:\s*-\s*`start_requested`\s*-\s*`inputs_validated`\s*-\s*`source_found`/iu,
        message: "Prompt improvement harness event lists must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_harness_state_machine_outside_prompt_improvement",
        pattern: /Allowed transitions:\s*-\s*`idle -> intake`\s*-\s*`intake -> source_discovery`/iu,
        message: "Prompt improvement harness transition tables must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_harness_state_machine_outside_prompt_improvement",
        pattern: /`completed`, `blocked`, and `rolled_back` are terminal states/iu,
        message: "Prompt improvement harness terminal-state details must stay in prompt_improvement.",
      },
    ],
  },
  {
    id: "prompt_improvement_owns_proposal_and_diff_limits",
    description: "Detailed prompt-improvement proposal fields and diff rejection rules must stay in prompt_improvement.",
    allowedSourceIds: ["prompt_improvement"],
    markers: [
      {
        code: "prompt_improvement_proposal_contract_outside_prompt_improvement",
        pattern: /Every prompt improvement proposal must include:\s*-\s*`problem`\s*-\s*`root_cause`\s*-\s*`target_files`/iu,
        message: "Prompt improvement proposal field rules must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_proposal_contract_outside_prompt_improvement",
        pattern: /`clarity_review` must confirm the prompt states actor, condition, allowed behavior, forbidden behavior, and completion criteria/iu,
        message: "Prompt improvement review-gate rules must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_proposal_contract_outside_prompt_improvement",
        pattern: /Reject a diff that duplicates a rule already owned by another canonical prompt module/iu,
        message: "Prompt improvement diff rejection rules must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_proposal_contract_outside_prompt_improvement",
        pattern: /Reject a diff that removes or weakens safety, permission, identity, memory, delegation, Yeonjang, approval, audit, rollback, activation, or stop-condition rules/iu,
        message: "Prompt improvement invariant-preservation diff rules must stay in prompt_improvement.",
      },
    ],
  },
  {
    id: "prompt_improvement_owns_activation_boundary",
    description: "Prompt-write, activation, and current-run harness isolation rules must stay in prompt_improvement.",
    allowedSourceIds: ["prompt_improvement"],
    markers: [
      {
        code: "prompt_improvement_activation_boundary_outside_prompt_improvement",
        pattern: /Prompt source writes and runtime activation are separate actions/iu,
        message: "Prompt write and activation separation must stay in prompt_improvement.",
      },
      {
        code: "prompt_improvement_activation_boundary_outside_prompt_improvement",
        pattern: /must not apply a changed harness to the current run before validation, approval, and activation are confirmed/iu,
        message: "Current-run harness isolation must stay in prompt_improvement.",
      },
    ],
  },
  {
    id: "tool_policy_owns_capability_authorization_audit",
    description: "Skill, MCP, and tool capability, authorization, and audit rules must stay in tool_policy.",
    allowedSourceIds: ["tool_policy"],
    markers: [
      {
        code: "tool_authorization_audit_boundary_outside_tool_policy",
        pattern: /Require a registered capability binding and explicit authorization before every Skill, MCP, or tool invocation/iu,
        message: "Tool capability and authorization rules must stay in tool_policy.",
      },
      {
        code: "tool_authorization_audit_boundary_outside_tool_policy",
        pattern: /Record auditable invocation and result evidence with agent name, capability, target, authorization decision, invocation receipt, and result receipt/iu,
        message: "Tool audit evidence rules must stay in tool_policy.",
      },
    ],
  },
  {
    id: "final_response_owns_llm_language_boundary",
    description: "Final LLM rendering and user-question language rules must stay in final_response.",
    allowedSourceIds: ["final_response"],
    markers: [
      {
        code: "final_response_llm_language_boundary_outside_final_response",
        pattern: /Route every user-facing natural-language answer through the LLM response layer/iu,
        message: "Final user-facing LLM rendering must stay in final_response.",
      },
      {
        code: "final_response_llm_language_boundary_outside_final_response",
        pattern: /Answer only in the user's question language unless the user explicitly requests translation, language comparison, or multilingual output/iu,
        message: "Final response language selection must stay in final_response.",
      },
    ],
  },
  {
    id: "work_record_owns_state_contract",
    description: "Work-record state values and transition tables must stay in work_record.",
    allowedSourceIds: ["work_record"],
    markers: [
      {
        code: "work_record_state_contract_outside_work_record",
        pattern: /WorkRecordStatus values are/iu,
        message: "WorkRecordStatus enum definitions must stay in work_record.",
      },
      {
        code: "work_record_state_contract_outside_work_record",
        pattern: /WorkStepStatus values are/iu,
        message: "WorkStepStatus enum definitions must stay in work_record.",
      },
      {
        code: "work_record_state_contract_outside_work_record",
        pattern: /Allowed `WorkRecordStatus` transitions/iu,
        message: "Work-record transition tables must stay in work_record.",
      },
      {
        code: "work_record_state_contract_outside_work_record",
        pattern: /intake\s*->\s*planned/iu,
        message: "Work-record transition tables must stay in work_record.",
      },
    ],
  },
  {
    id: "work_record_owns_handoff_result_schema",
    description: "Handoff package and child-result schema field definitions must stay in work_record.",
    allowedSourceIds: ["work_record"],
    markers: [
      {
        code: "handoff_result_schema_definition_outside_work_record",
        pattern: /WorkHandoffPackage` required fields(?: are|:)/iu,
        message: "WorkHandoffPackage field definitions must stay in work_record.",
      },
      {
        code: "handoff_result_schema_definition_outside_work_record",
        pattern: /ChildWorkResult` required fields(?: are|:)/iu,
        message: "ChildWorkResult field definitions must stay in work_record.",
      },
      {
        code: "handoff_result_schema_definition_outside_work_record",
        pattern: /`current_step\.step_id` must exist in `step_plan`/iu,
        message: "Handoff package validation rules must stay in work_record.",
      },
      {
        code: "handoff_result_schema_definition_outside_work_record",
        pattern: /Include goal, context, constraints, allowed tools/iu,
        message: "Handoff package field-list instructions must stay in work_record.",
      },
    ],
  },
  {
    id: "workflow_owns_step_authoring_contract",
    description: "Workflow step decomposition, ordering, and observable completion rules must stay in workflow.",
    allowedSourceIds: ["workflow"],
    markers: [
      {
        code: "workflow_step_contract_outside_workflow",
        pattern: /Each step must represent one verifiable action or decision/iu,
        message: "Workflow step decomposition rules must stay in workflow.md.",
      },
      {
        code: "workflow_step_contract_outside_workflow",
        pattern: /Completion criteria must be observable: file exists, change applied, message delivered/iu,
        message: "Workflow completion criteria rules must stay in workflow.md.",
      },
    ],
  },
  {
    id: "work_record_owns_recovery_schema",
    description: "Failure diagnosis, recovery candidate, and action decision schema field definitions must stay in work_record.",
    allowedSourceIds: ["work_record"],
    markers: [
      {
        code: "recovery_schema_definition_outside_work_record",
        pattern: /FailureDiagnosis` required fields are/iu,
        message: "FailureDiagnosis field definitions must stay in work_record.",
      },
      {
        code: "recovery_schema_definition_outside_work_record",
        pattern: /RecoveryCandidate` required fields are/iu,
        message: "RecoveryCandidate field definitions must stay in work_record.",
      },
      {
        code: "recovery_schema_definition_outside_work_record",
        pattern: /ActionDecision` required fields are/iu,
        message: "ActionDecision field definitions must stay in work_record.",
      },
      {
        code: "recovery_schema_definition_outside_work_record",
        pattern: /`changed_dimensions` must contain one or more `RecoveryChangedDimension` values/iu,
        message: "Recovery changed-dimension field rules must stay in work_record.",
      },
    ],
  },
]

const IMPACT_SCENARIOS: ImpactScenario[] = [
  {
    id: "impossible_requests_complete_with_reason",
    description: "물리적/논리적 불가능 요청은 임의 대체 없이 사유를 반환하고 완료해야 한다.",
    markers: [
      { id: "physical_or_logical", patterns: { ko: /물리적.*논리적|논리적.*물리적/u, en: /physically.*logically|logically.*physically/iu } },
      { id: "impossible", patterns: { ko: /불가능/u, en: /impossible/iu } },
      { id: "reason_without_substitution", patterns: { ko: /다른\s+대상으로\s+바꾸지|임의.*바꾸지|사유를\s+반환/u, en: /without changing the target|do not convert|return(?:s|ing)? the reason/iu } },
    ],
  },
  {
    id: "text_answer_does_not_trigger_artifact_recovery",
    description: "텍스트 답변으로 충족되는 요청은 artifact delivery/recovery 실패로 오판하지 않아야 한다.",
    markers: [
      { id: "text_answer", patterns: { ko: /텍스트\s+답변/u, en: /text-only answers?|text replies/iu } },
      { id: "artifact_recovery", patterns: { ko: /artifact\s+(?:delivery|recovery)|결과물\s+복구/u, en: /artifact\s+(?:delivery|recovery)/iu } },
      { id: "not_routed", patterns: { ko: /전환하지\s+않는다|보내지\s+않는다/u, en: /do not need|not route|must not route/iu } },
    ],
  },
  {
    id: "approval_stays_in_channel_thread",
    description: "승인은 원 요청 채널과 thread 경계 안에서 처리해야 한다.",
    markers: [
      { id: "approval", patterns: { ko: /승인/u, en: /approval/iu } },
      { id: "original_channel_thread", patterns: { ko: /원\s+요청\s+채널|원\s+요청\s+thread/u, en: /original request (?:channel|thread)|where the request arrived/iu } },
      { id: "pending_not_aborted", patterns: { ko: /Aborted by user.*단정하지/u, en: /(?:not.*Aborted by user|Aborted by user.*not)/iu } },
    ],
  },
  {
    id: "schedule_uses_contract",
    description: "예약/리마인더 요청은 ScheduleContract 생성 경로로 구조화해야 한다.",
    markers: [
      { id: "schedule_contract", patterns: { ko: /ScheduleContract/u, en: /ScheduleContract/u } },
      { id: "schedule_request", patterns: { ko: /예약|리마인더|반복 실행/u, en: /scheduling|reminder|recurring execution/iu } },
      { id: "literal_destination", patterns: { ko: /literal_text|destination/u, en: /literal_text|destination/u } },
    ],
  },
  {
    id: "raw_errors_are_sanitized",
    description: "provider raw 오류, HTML, stack trace, secret, token은 사용자에게 그대로 노출하면 안 된다.",
    markers: [
      { id: "raw_error", patterns: { ko: /raw\s+오류|HTML\s+오류|stack trace/u, en: /raw errors?|HTML error|stack trace/iu } },
      { id: "secret_token", patterns: { ko: /secret|token/u, en: /secret|token/iu } },
      { id: "do_not_expose", patterns: { ko: /노출하지\s+않는다/u, en: /do not expose/iu } },
    ],
  },
  {
    id: "local_extension_first_for_device_work",
    description: "화면/카메라/로컬 명령 같은 장치 작업은 로컬 실행 확장을 우선해야 한다.",
    markers: [
      { id: "local_extension", patterns: { ko: /로컬\s+실행\s+확장/u, en: /local execution extension/iu } },
      { id: "first_or_prefer", patterns: { ko: /우선|먼저/u, en: /prefer|first/iu } },
      { id: "device_work", patterns: { ko: /화면\s+캡처|카메라|로컬\s+명령/u, en: /screen capture|camera|local commands?/iu } },
    ],
  },
  {
    id: "product_parameter_safe_defaults",
    description: "GOAL 11 제품 파라미터는 결정 전 안전 기본값을 prompt source에 유지해야 한다.",
    sourceScope: "prompt_sources",
    markers: [
      { id: "main_agent_name_default", patterns: { ko: /Knowbee[\s\S]{0,80}노비/u, en: /defaults to `Knowbee` in English and `노비` in Korean/iu } },
      { id: "prompt_low_risk_guard", patterns: { ko: /low[\s\S]{0,80}regression tests[\s\S]{0,80}rollback/u, en: /Low-risk prompt improvements may skip approval only when known regression tests pass and an exact rollback target exists before write/iu } },
      { id: "prompt_medium_risk_approval", patterns: { ko: /medium[\s\S]{0,80}user or administrator approval/u, en: /Medium-risk prompt improvements require user or administrator approval before apply-change/iu } },
      { id: "prompt_high_risk_explicit_approval", patterns: { ko: /high[\s\S]{0,80}explicit approval/u, en: /High-risk prompt improvements always require explicit approval before apply-change/iu } },
      { id: "yeonjang_sensitive_approval", patterns: { ko: /File changes[\s\S]{0,180}external network calls require approval before dispatch/u, en: /File changes, app execution, terminal commands, screen control, camera capture, keyboard input, mouse input, and external network calls require approval before dispatch/iu } },
      { id: "sub_agent_preconfigured_children", patterns: { ko: /configured direct child sub-agents/u, en: /configured direct child sub-agents/iu } },
      { id: "sub_agent_runtime_child_creation_disabled", patterns: { ko: /Do not create child sub-agents at runtime/u, en: /Do not create child sub-agents at runtime/iu } },
      { id: "memory_runtime_config_default", patterns: { ko: /runtime configuration[\s\S]{0,120}long-term storage disabled[\s\S]{0,80}short-term memory/u, en: /runtime configuration does not define long-term memory storage or retention, keep long-term storage disabled and use short-term memory only/iu } },
      { id: "general_chat_memory_explicit_save", patterns: { ko: /General chat[\s\S]{0,80}explicitly asks to remember it/u, en: /General chat is not long-term memory unless the user explicitly asks to remember it/iu } },
    ],
  },
]

function makeIssue(input: {
  severity: PromptRegressionSeverity
  code: string
  message: string
  sourceId?: string
  locale?: PromptRegressionLocale
  evidence?: string
}): PromptRegressionIssue {
  return {
    severity: input.severity,
    code: input.code,
    message: input.message,
    ...(input.sourceId ? { sourceId: input.sourceId } : {}),
    ...(input.locale ? { locale: input.locale } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
  }
}

function sourceKey(sourceId: string, locale: PromptRegressionLocale): string {
  return `${sourceId}:${locale}`
}

function firstMatchingLine(content: string, pattern: RegExp): string {
  return content
    .split(/\n/u)
    .find((line) => pattern.test(line))?.trim() ?? ""
}

function validateRegistryCompleteness(
  workDir: string,
  sources: LoadedPromptSource[],
  locales: PromptRegressionLocale[],
): PromptRegressionIssue[] {
  const existing = new Set(sources.map((source) => sourceKey(source.sourceId, source.locale)))
  const issues: PromptRegressionIssue[] = []
  for (const sourceId of EXPECTED_PROMPT_SOURCE_IDS) {
    if (!existing.has(sourceKey(sourceId, "en"))) {
      issues.push(makeIssue({
        severity: "error",
        code: "prompt_source_missing",
        sourceId,
        locale: "en",
        message: `${sourceId}:en prompt source is missing or unsafe.`,
      }))
    }
    for (const locale of locales) {
      if (locale === "en") continue
      if (!promptSourceFileExists(workDir, sourceId, locale)) continue
      if (existing.has(sourceKey(sourceId, locale))) continue
      issues.push(makeIssue({
        severity: "error",
        code: "prompt_source_missing",
        sourceId,
        locale,
        message: `${sourceId}:${locale} prompt source is missing or unsafe.`,
      }))
    }
  }
  return issues
}

function validateOrphanPromptSourceFiles(
  workDir: string,
  sources: LoadedPromptSource[],
): PromptRegressionIssue[] {
  const registeredEnglishFilenames = new Set(
    sources
      .filter((source) => source.locale === "en")
      .map((source) => basename(source.path)),
  )
  const promptDirs = new Set<string>(sources.map((source) => dirname(source.path)))
  const workDirPrompts = join(workDir, "prompts")
  if (existsSync(workDirPrompts)) promptDirs.add(workDirPrompts)

  const issues: PromptRegressionIssue[] = []
  for (const promptDir of promptDirs) {
    if (!existsSync(promptDir)) continue
    let filenames: string[]
    try {
      filenames = readdirSync(promptDir)
    } catch {
      continue
    }
    for (const filename of filenames) {
      if (!filename.endsWith(".md") || filename.endsWith(".ko.md")) continue
      if (registeredEnglishFilenames.has(filename)) continue
      issues.push(makeIssue({
        severity: "error",
        code: "orphan_prompt_source_file",
        message: `${filename} exists under prompts/ but is not registered as an English prompt source.`,
        evidence: filename,
      }))
    }
  }
  return issues
}

function validateResponsibilities(sources: LoadedPromptSource[]): PromptResponsibilityRuleResult[] {
  const promptRules = RESPONSIBILITY_RULES.map((rule) => {
    const issues: PromptRegressionIssue[] = []
    for (const source of sources) {
      if (rule.allowedSourceIds.includes(source.sourceId)) continue
      for (const marker of rule.markers) {
        if (!marker.pattern.test(source.content)) continue
        issues.push(makeIssue({
          severity: "error",
          code: marker.code,
          sourceId: source.sourceId,
          locale: source.locale,
          message: marker.message,
          evidence: firstMatchingLine(source.content, marker.pattern),
        }))
      }
    }
    return {
      id: rule.id,
      description: rule.description,
      ok: issues.length === 0,
      allowedSourceIds: rule.allowedSourceIds,
      issues,
    }
  })
  const ownership = validateGoalOwnershipCatalog()
  return [
    ...promptRules,
    {
      id: "goal_chapter_prompt_ownership_catalog",
      description: "GOAL chapter and canonical prompt responsibility checks share one ownership catalog.",
      ok: ownership.complete,
      allowedSourceIds: [],
      issues: ownership.diagnostics.map((diagnostic) => makeIssue({
        severity: "error",
        code: diagnostic.code,
        message: `${diagnostic.chapter}:${diagnostic.responsibilityId} ownership catalog validation failed.`,
        evidence: diagnostic.artifact,
      })),
    },
  ]
}

const ALLOWED_KOREAN_PROMPT_LITERALS = new Set<string>([
  "깊게 봐줘",
  "다운로드",
  "다운도르",
  "노비",
  "스폰지 노비",
  "연장",
])

const ALLOWED_KOREAN_OUTPUT_TEMPLATE_LINES = new Map<string, RegExp[]>()

function isAllowedKoreanPromptLiteral(value: string): boolean {
  return ALLOWED_KOREAN_PROMPT_LITERALS.has(value.trim())
}

function stripAllowedKoreanPromptSegments(line: string): string {
  return line
    .replace(/`([^`\n]*[가-힣][^`\n]*)`/gu, (segment, value: string) => (
      isAllowedKoreanPromptLiteral(value) ? "" : segment
    ))
    .replace(/"([^"\n]*[가-힣][^"\n]*)"/gu, (segment, value: string) => (
      isAllowedKoreanPromptLiteral(value) ? "" : segment
    ))
    .replace(/'([^'\n]*[가-힣][^'\n]*)'/gu, (segment, value: string) => (
      isAllowedKoreanPromptLiteral(value) ? "" : segment
    ))
}

function stripAllowedKoreanOutputTemplateLine(sourceId: string, line: string): string {
  const allowed = ALLOWED_KOREAN_OUTPUT_TEMPLATE_LINES.get(sourceId) ?? []
  return allowed.some((pattern) => pattern.test(line.trim())) ? "" : line
}

function validateEnglishPromptLocale(sources: LoadedPromptSource[]): PromptRegressionIssue[] {
  const issues: PromptRegressionIssue[] = []
  for (const source of sources) {
    if (source.locale !== "en") continue
    const line = source.content
      .split(/\n/u)
      .map((candidate) => candidate.trim())
      .find((candidate) => /[가-힣]/u.test(stripAllowedKoreanOutputTemplateLine(
        source.sourceId,
        stripAllowedKoreanPromptSegments(candidate),
      )))
    if (!line) continue
    issues.push(makeIssue({
      severity: "error",
      code: "english_prompt_contains_korean_instruction",
      sourceId: source.sourceId,
      locale: source.locale,
      message: "English prompt sources may include Korean only as approved product names or user-input examples; operating instructions must be written in English.",
      evidence: line,
    }))
  }
  return issues
}

function validatePlanningArtifactCopies(sources: LoadedPromptSource[]): PromptRegressionIssue[] {
  const issues: PromptRegressionIssue[] = []
  const planningArtifactPattern = /(?:^\s*[-*]\s*\[[ xX]\]\s+|\.tasks\/task\d+\.md\b)/u
  for (const source of sources) {
    if (source.sourceId.endsWith("_user")) continue
    const line = source.content.split(/\n/u).find((candidate) => planningArtifactPattern.test(candidate))
    if (!line) continue
    issues.push(makeIssue({
      severity: "error",
      code: "planning_artifact_copied_into_prompt",
      sourceId: source.sourceId,
      locale: source.locale,
      message: "System prompt sources must define runtime policy and must not copy task checklists or task-file references.",
      evidence: line.trim(),
    }))
  }
  return issues
}

function validateCanonicalBoundarySections(sources: LoadedPromptSource[]): PromptRegressionIssue[] {
  const issues: PromptRegressionIssue[] = []
  const canonicalIds = new Set<string>(CANONICAL_BOUNDARY_PROMPT_SOURCE_IDS)
  for (const source of sources) {
    if (source.locale !== "en" || !canonicalIds.has(source.sourceId)) continue
    if (!/^## Purpose\s*$/imu.test(source.content)) {
      issues.push(makeIssue({
        severity: "error",
        code: "canonical_prompt_purpose_missing",
        sourceId: source.sourceId,
        locale: source.locale,
        message: `${source.sourceId} canonical prompt module must include a ## Purpose section.`,
      }))
    }
    if (!/^## Out Of Scope\s*$/imu.test(source.content)) {
      issues.push(makeIssue({
        severity: "error",
        code: "canonical_prompt_out_of_scope_missing",
        sourceId: source.sourceId,
        locale: source.locale,
        message: `${source.sourceId} canonical prompt module must include a ## Out Of Scope section.`,
      }))
    }
  }
  return issues
}

function validateCanonicalResponsibilityManifest(): PromptRegressionIssue[] {
  const decision = validateCanonicalPromptResponsibilityManifest(
    CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST,
  )
  if (decision.status === "eligible") return []
  return decision.issues.map((issue) => makeIssue({
    severity: "error",
    code: `canonical_manifest_${issue.code}`,
    sourceId: issue.subjectId,
    message: `Canonical prompt responsibility manifest is invalid: ${issue.code}.`,
    evidence: issue.subjectId,
  }))
}

function validateAgentNameTerminology(sources: LoadedPromptSource[]): PromptRegressionIssue[] {
  const issues: PromptRegressionIssue[] = []
  for (const source of sources) {
    if (source.locale !== "en") continue
    const nicknameLine = source.content
      .split(/\n/u)
      .map((candidate) => candidate.trim())
      .find((candidate) => /\bnicknames?\b/iu.test(candidate))
    if (nicknameLine) {
      issues.push(makeIssue({
        severity: "error",
        code: "legacy_agent_nickname_terminology",
        sourceId: source.sourceId,
        locale: source.locale,
        message: "Prompt sources must use agent_name for agents and preferred name for users, not nickname.",
        evidence: nicknameLine,
      }))
    }

    const legacyAgentNameFieldLine = source.content
      .split(/\n/u)
      .map((candidate) => candidate.trim())
      .find((candidate) => /\bagent\s+(?:display[-\s]?name|profile[-\s]?name|alias)\b/iu.test(candidate))
    if (legacyAgentNameFieldLine) {
      issues.push(makeIssue({
        severity: "error",
        code: "legacy_agent_name_field_terminology",
        sourceId: source.sourceId,
        locale: source.locale,
        message: "Prompt sources must not define agent display name, agent profile name, or agent alias fields; use agent_name only.",
        evidence: legacyAgentNameFieldLine,
      }))
    }
  }
  return issues
}

function validateImpactScenarios(
  workDir: string,
  sources: LoadedPromptSource[],
  locales: PromptRegressionLocale[],
): PromptImpactScenarioResult[] {
  const results: PromptImpactScenarioResult[] = []
  for (const locale of locales) {
    if (!sources.some((source) => source.locale === locale)) continue
    const assembly = dryRunPromptSourceAssembly(workDir, locale).assembly
    for (const scenario of IMPACT_SCENARIOS) {
      const text = scenario.sourceScope === "prompt_sources"
        ? sources
          .filter((source) => source.locale === locale)
          .map((source) => source.content)
          .join("\n\n---\n\n")
        : assembly?.text ?? ""
      const missingMarkers = scenario.markers
        .filter((marker) => !marker.patterns[locale].test(text))
        .map((marker) => marker.id)
      results.push({
        id: scenario.id,
        description: scenario.description,
        locale,
        ok: missingMarkers.length === 0,
        requiredMarkers: scenario.markers.map((marker) => marker.id),
        missingMarkers,
      })
    }
  }
  return results
}

function validateAssemblyCoverage(
  workDir: string,
  locales: PromptRegressionLocale[],
): PromptAssemblyCoverageRegressionResult[] {
  const results: PromptAssemblyCoverageRegressionResult[] = []
  for (const locale of locales) {
    const assembly = dryRunPromptSourceAssembly(workDir, locale).assembly
    if (!assembly) continue
    results.push({
      locale,
      ...inspectPromptSourceAssemblyCoverage(assembly),
    })
  }
  return results
}

function lineIsNegatedPolicy(line: string): boolean {
  const normalized = line.toLowerCase()
  return [
    "do not",
    "don't",
    "must not",
    "never",
    "not keyword",
    "not a keyword",
    "not failure",
    "not terminal",
    "not as failure",
    "not a failure",
    "no keyword",
    "금지",
    "하지 않는다",
    "하지 않는다",
    "하지 말",
    "아니다",
    "않는다",
    "실패 조건이 아니",
  ].some((marker) => normalized.includes(marker))
}

function lineIsRawKeywordRoutingInstruction(line: string): boolean {
  const normalized = line.toLowerCase()
  if (lineIsNegatedPolicy(line)) return false
  return (
    /keyword(?:-based)?\s+(?:executor\s+)?routing/u.test(normalized) ||
    /route\s+(?:executors?|requests?|domains?)\s+by\s+keyword/u.test(normalized) ||
    /select\s+(?:executors?|agents?)\s+by\s+keyword/u.test(normalized) ||
    /keyword\s+matching\s+(?:against|to choose|to select)/u.test(normalized) ||
    /키워드\s*(?:라우팅|매칭)/u.test(line) ||
    /문자열\s*(?:검색|매칭).*(?:실행자|에이전트|라우팅)/u.test(line)
  )
}

function lineIsCountLimitFailureInstruction(line: string): boolean {
  const normalized = line.toLowerCase()
  if (lineIsNegatedPolicy(line)) return false
  return (
    /(?:retry limit|max attempts|attempt limit|retry count|attempt count).{0,60}(?:fail|failure|terminal|stop|abort)/u.test(normalized) ||
    /(?:fail|failure|terminal|stop|abort).{0,60}(?:retry limit|max attempts|attempt limit|retry count|attempt count)/u.test(normalized) ||
    /(?:재시도|시도|횟수).{0,30}(?:실패|중단|종료)/u.test(line)
  )
}

function validateAgentsPromptCompatibility(
  workDir: string,
  sources: LoadedPromptSource[],
): PromptResponsibilityRuleResult[] {
  const agentsPath = join(workDir, "AGENTS.md")
  const agentsText = existsSync(agentsPath) ? readFileSync(agentsPath, "utf-8") : ""
  const checks: PromptResponsibilityRuleResult[] = []
  const enforcesNoKeywordRouting = /키워드\s+검색|keyword\s+search|keyword\s+routing|언어별\s+키워드/u.test(agentsText)
  const enforcesCountSignals = /retry count|attempt count|횟수는|숫자 제한/u.test(agentsText)

  if (enforcesNoKeywordRouting) {
    const issues = sources.flatMap((source) =>
      source.content
        .split(/\n/u)
        .filter(lineIsRawKeywordRoutingInstruction)
        .map((line) => makeIssue({
          severity: "error",
          code: "raw_keyword_executor_routing_instruction",
          sourceId: source.sourceId,
          locale: source.locale,
          message: "Prompt source conflicts with AGENTS.md by instructing raw keyword executor routing.",
          evidence: line.trim(),
        })),
    )
    checks.push({
      id: "agents_no_raw_keyword_routing",
      description: "AGENTS.md forbids natural-language keyword routing, so prompt sources must not reintroduce it.",
      ok: issues.length === 0,
      allowedSourceIds: [],
      issues,
    })
  }

  if (enforcesCountSignals) {
    const issues = sources.flatMap((source) =>
      source.content
        .split(/\n/u)
        .filter(lineIsCountLimitFailureInstruction)
        .map((line) => makeIssue({
          severity: "error",
          code: "count_limit_terminal_instruction",
          sourceId: source.sourceId,
          locale: source.locale,
          message: "Prompt source conflicts with AGENTS.md by treating retry/attempt counts as terminal failure.",
          evidence: line.trim(),
        })),
    )
    checks.push({
      id: "agents_count_signals_not_terminal",
      description: "AGENTS.md treats retry/attempt counts as alternative-search signals, not terminal failure.",
      ok: issues.length === 0,
      allowedSourceIds: [],
      issues,
    })
  }

  return checks
}

export function runPromptSourceRegression(
  workDir: string,
  options: { locales?: PromptRegressionLocale[] } = {},
): PromptSourceRegressionResult {
  const locales: PromptRegressionLocale[] = options.locales?.length ? options.locales : ["en"]
  const sources = loadPromptSourceRegistry(workDir)
  const localeParity = checkPromptSourceLocaleParity(workDir)
  const responsibility = validateResponsibilities(sources)
  const policyCompatibility = validateAgentsPromptCompatibility(workDir, sources)
  const assemblyCoverage = validateAssemblyCoverage(workDir, locales)
  const impact = validateImpactScenarios(workDir, sources, locales)

  const issues: PromptRegressionIssue[] = [
    ...validateOrphanPromptSourceFiles(workDir, sources),
    ...validateRegistryCompleteness(workDir, sources, locales),
    ...localeParity.issues.map((issue) => makeIssue({
      severity: "error",
      code: `locale_${issue.code}`,
      sourceId: issue.sourceId,
      ...(issue.locale ? { locale: issue.locale } : {}),
      message: issue.message,
    })),
    ...responsibility.flatMap((result) => result.issues),
    ...validateCanonicalResponsibilityManifest(),
    ...validateCanonicalBoundarySections(sources),
    ...validateAgentNameTerminology(sources),
    ...validateEnglishPromptLocale(sources),
    ...validatePlanningArtifactCopies(sources),
    ...policyCompatibility.flatMap((result) => result.issues),
    ...assemblyCoverage.flatMap((coverage) => [
      ...coverage.omittedSourceIds.map((sourceId) => makeIssue({
        severity: "error",
        code: "prompt_assembly_source_omitted",
        sourceId,
        locale: coverage.locale,
        message: `${sourceId}:${coverage.locale} prompt source is missing from assembled runtime prompt text.`,
        evidence: sourceId,
      })),
      ...coverage.truncatedSourceIds.map((sourceId) => makeIssue({
        severity: "error",
        code: "prompt_assembly_source_truncated",
        sourceId,
        locale: coverage.locale,
        message: `${sourceId}:${coverage.locale} prompt source is truncated in assembled runtime prompt text.`,
        evidence: sourceId,
      })),
    ]),
    ...impact.flatMap((scenario) => scenario.missingMarkers.map((marker) => makeIssue({
      severity: "error",
      code: "impact_marker_missing",
      locale: scenario.locale,
      message: `${scenario.id} is missing required marker '${marker}'.`,
      evidence: `${scenario.id}:${marker}`,
    }))),
  ]

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    workDir,
    generatedAt: Date.now(),
    locales,
    registry: {
      sourceCount: sources.length,
      runtimeSourceCount: sources.filter((source) => source.usageScope === "runtime").length,
      checksums: sources.map((source) => ({
        sourceId: source.sourceId,
        locale: source.locale,
        checksum: source.checksum,
        version: source.version,
        path: source.path,
      })),
    },
    localeParity,
    responsibility,
    policyCompatibility,
    assemblyCoverage,
    impact,
    issues,
  }
}
