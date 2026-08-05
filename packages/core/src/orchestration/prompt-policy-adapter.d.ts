import { AiChatCapabilitySelectionProviderAdapter } from "../ai/capability-selection-adapter.js";
import { AiChatDiagnosisProviderAdapter } from "../ai/diagnosis-adapter.js";
import { AiChatSolutionPlanProviderAdapter } from "../ai/solution-plan-adapter.js";
import type { AIProvider } from "../ai/types.js";
import { AiChatWebResearchMethodProviderAdapter } from "../ai/web-research-method-adapter.js";
import { type LoadedPromptSource } from "../memory/knowbee-md.js";
export { createFileBackedWebEvidencePipelineAdapter, WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS, } from "../ai/web-evidence-pipeline-factory.js";
export type { FileBackedWebEvidencePipelineAdapterInput, } from "../ai/web-evidence-pipeline-factory.js";
export declare const AGENT_PROMPT_BUNDLE_SOURCE_IDS: readonly ["system", "definitions", "identity", "user", "task_intake", "work_record", "tool_policy", "memory_policy", "prompt_visibility", "soul", "planner", "knowbee_execution", "workflow", "sub_agent_delegation", "yeonjang_policy", "prompt_improvement", "recovery_policy", "topology_executor_policy", "completion_policy", "output_policy", "maintenance_policy", "ui_policy", "runtime_environment_policy", "logging_policy", "channel", "result_review", "final_response"];
export declare const CANONICAL_AGENT_PROMPT_SOURCE_IDS: readonly ["system", "identity", "task_intake", "work_record", "tool_policy", "memory_policy", "prompt_visibility", "workflow", "sub_agent_delegation", "yeonjang_policy", "prompt_improvement", "maintenance_policy", "ui_policy", "result_review", "final_response"];
export interface AgentPromptSourceCompositionInput {
    sources: LoadedPromptSource[];
    agentType: "knowbee" | "sub_agent";
    hasExplicitUserTraits: boolean;
}
export type AgentPromptStageId = (typeof CANONICAL_AGENT_PROMPT_SOURCE_IDS)[number] | "sub_agent_base" | "agent_persona" | "work_handoff";
export interface AgentPromptStageInput {
    agentType: "knowbee" | "sub_agent";
    hasExplicitUserTraits: boolean;
}
export type AgentPromptSourceCompositionIssueCode = `source_missing:${string}` | `source_duplicate:${string}`;
export interface AgentPromptSourceCompositionAudit {
    status: "eligible" | "ineligible";
    stageIds: AgentPromptStageId[];
    issueCodes: AgentPromptSourceCompositionIssueCode[];
}
export declare function buildAgentPromptStageIds(input: AgentPromptStageInput): AgentPromptStageId[];
export declare function auditAgentPromptSourceComposition(input: AgentPromptSourceCompositionInput): AgentPromptSourceCompositionAudit;
export declare function composeAgentPromptSources(input: AgentPromptSourceCompositionInput): LoadedPromptSource[];
export declare const SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS: readonly ["system", "definitions", "identity", "user", "task_intake", "work_record", "tool_policy", "memory_policy", "prompt_visibility", "soul", "planner", "knowbee_execution", "workflow", "sub_agent_delegation", "yeonjang_policy", "prompt_improvement", "recovery_policy", "topology_executor_policy", "completion_policy", "output_policy", "maintenance_policy", "ui_policy", "runtime_environment_policy", "logging_policy", "channel", "result_review", "final_response", "sub_agent_base", "agent_persona"];
export declare const EXECUTION_HARNESS_POLICY_SOURCE_IDS: readonly ["task_intake", "work_record", "result_review", "final_response", "knowbee_execution", "workflow", "tool_policy", "recovery_policy", "topology_executor_policy", "completion_policy"];
export declare const DIAGNOSIS_SUPPORT_SOURCE_IDS: readonly ["work_record"];
export declare const REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS: readonly ["request_diagnosis", "result_diagnosis", "diagnosis_schema_repair"];
export declare const DIAGNOSIS_PROMPT_SOURCE_IDS: readonly ["work_record", "request_diagnosis", "result_diagnosis", "diagnosis_schema_repair"];
export type RuntimePromptSourceId = (typeof AGENT_PROMPT_BUNDLE_SOURCE_IDS)[number] | (typeof SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS)[number] | (typeof EXECUTION_HARNESS_POLICY_SOURCE_IDS)[number];
export interface PromptSourceSelectionInput {
    sources: LoadedPromptSource[];
    locale?: "ko" | "en";
    sourceIds?: readonly string[];
}
export interface PromptSourceLoadInput {
    workDir?: string;
    locale?: "ko" | "en";
}
export interface PromptPolicyBlockInput extends PromptSourceSelectionInput {
    title?: string;
}
export interface FileBackedDiagnosisProviderInput {
    provider: AIProvider;
    model: string;
    workDir: string;
    locale?: "ko" | "en";
    maxTokens?: number;
    deadlineMs?: number;
    maxVisibleTextBytes?: number;
    observabilityContext?: Pick<NonNullable<import("../ai/types.js").ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export type FileBackedSolutionPlanProviderInput = FileBackedDiagnosisProviderInput;
export type FileBackedCapabilitySelectionProviderInput = FileBackedDiagnosisProviderInput;
export type FileBackedWebResearchMethodProviderInput = FileBackedDiagnosisProviderInput;
export declare const SOLUTION_PLAN_PROMPT_SOURCE_IDS: readonly ["work_record", "workflow"];
export declare const CAPABILITY_SELECTION_PROMPT_SOURCE_IDS: readonly ["capability_selection"];
export declare const WEB_RESEARCH_METHOD_PROMPT_SOURCE_IDS: readonly ["web_research_method"];
export declare function selectRuntimePromptSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectAgentPromptBundleSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectExecutionHarnessPolicySources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectDiagnosisPromptSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectSolutionPlanPromptSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectCapabilitySelectionPromptSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function selectWebResearchMethodPromptSources(input: PromptSourceSelectionInput): LoadedPromptSource[];
export declare function loadRuntimePromptPolicySources(input?: PromptSourceLoadInput): LoadedPromptSource[];
export declare function renderPromptPolicySourceBlock(input: PromptPolicyBlockInput): string;
export declare function renderDiagnosisPromptSourceBlock(input: PromptPolicyBlockInput): string;
export declare function createFileBackedDiagnosisProvider(input: FileBackedDiagnosisProviderInput): AiChatDiagnosisProviderAdapter;
export declare function createFileBackedSolutionPlanProvider(input: FileBackedSolutionPlanProviderInput): AiChatSolutionPlanProviderAdapter;
export declare function createFileBackedCapabilitySelectionProvider(input: FileBackedCapabilitySelectionProviderInput): AiChatCapabilitySelectionProviderAdapter;
export declare function createFileBackedWebResearchMethodProvider(input: FileBackedWebResearchMethodProviderInput): AiChatWebResearchMethodProviderAdapter;
//# sourceMappingURL=prompt-policy-adapter.d.ts.map