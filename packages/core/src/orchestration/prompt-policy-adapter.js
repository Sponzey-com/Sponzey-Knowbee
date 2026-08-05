import { AiChatCapabilitySelectionProviderAdapter } from "../ai/capability-selection-adapter.js";
import { AiChatDiagnosisProviderAdapter } from "../ai/diagnosis-adapter.js";
import { AiChatSolutionPlanProviderAdapter } from "../ai/solution-plan-adapter.js";
import { AiChatWebResearchMethodProviderAdapter } from "../ai/web-research-method-adapter.js";
import { loadPromptSourceRegistry } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
export { createFileBackedWebEvidencePipelineAdapter, WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS, } from "../ai/web-evidence-pipeline-factory.js";
const PROMPT_BUNDLE_CONTEXT_LABELS_SOURCE_ID = "prompt_bundle_context_labels_user";
function promptBundleContextLabel(key) {
    const value = loadPromptValue(PROMPT_BUNDLE_CONTEXT_LABELS_SOURCE_ID, {}, { required: true })
        .split(/\r?\n/u)
        .find((line) => line.startsWith(`${key}=`))
        ?.slice(key.length + 1)
        .trim();
    return value ?? key;
}
export const AGENT_PROMPT_BUNDLE_SOURCE_IDS = [
    "system",
    "definitions",
    "identity",
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
    "recovery_policy",
    "topology_executor_policy",
    "completion_policy",
    "output_policy",
    "maintenance_policy",
    "ui_policy",
    "runtime_environment_policy",
    "logging_policy",
    "channel",
    "result_review",
    "final_response",
];
export const CANONICAL_AGENT_PROMPT_SOURCE_IDS = [
    "system",
    "identity",
    "task_intake",
    "work_record",
    "tool_policy",
    "memory_policy",
    "prompt_visibility",
    "workflow",
    "sub_agent_delegation",
    "yeonjang_policy",
    "prompt_improvement",
    "maintenance_policy",
    "ui_policy",
    "result_review",
    "final_response",
];
export function buildAgentPromptStageIds(input) {
    return [
        ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(0, -2),
        ...(input.agentType === "sub_agent" ? ["sub_agent_base"] : []),
        ...(input.agentType === "sub_agent" && input.hasExplicitUserTraits
            ? ["agent_persona"]
            : []),
        "work_handoff",
        ...CANONICAL_AGENT_PROMPT_SOURCE_IDS.slice(-2),
    ];
}
export function auditAgentPromptSourceComposition(input) {
    const stageIds = buildAgentPromptStageIds(input);
    const issueCodes = [];
    for (const sourceId of stageIds) {
        if (sourceId === "work_handoff")
            continue;
        const eligibleCount = input.sources.filter((candidate) => candidate.sourceId === sourceId &&
            candidate.locale === "en" &&
            candidate.usageScope === "runtime" &&
            candidate.enabled).length;
        if (eligibleCount === 0)
            issueCodes.push(`source_missing:${sourceId}`);
        if (eligibleCount > 1)
            issueCodes.push(`source_duplicate:${sourceId}`);
    }
    return {
        status: issueCodes.length === 0 ? "eligible" : "ineligible",
        stageIds,
        issueCodes,
    };
}
export function composeAgentPromptSources(input) {
    const orderedIds = buildAgentPromptStageIds(input).filter((sourceId) => sourceId !== "work_handoff");
    return orderedIds.flatMap((sourceId) => {
        const source = input.sources.find((candidate) => candidate.sourceId === sourceId &&
            candidate.locale === "en" &&
            candidate.usageScope === "runtime" &&
            candidate.enabled);
        return source ? [source] : [];
    });
}
export const SUB_AGENT_PROMPT_BUNDLE_SOURCE_IDS = [
    ...AGENT_PROMPT_BUNDLE_SOURCE_IDS,
    "sub_agent_base",
    "agent_persona",
];
export const EXECUTION_HARNESS_POLICY_SOURCE_IDS = [
    "task_intake",
    "work_record",
    "result_review",
    "final_response",
    "knowbee_execution",
    "workflow",
    "tool_policy",
    "recovery_policy",
    "topology_executor_policy",
    "completion_policy",
];
export const DIAGNOSIS_SUPPORT_SOURCE_IDS = ["work_record"];
export const REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS = [
    "request_diagnosis",
    "result_diagnosis",
    "diagnosis_schema_repair",
];
export const DIAGNOSIS_PROMPT_SOURCE_IDS = [
    ...DIAGNOSIS_SUPPORT_SOURCE_IDS,
    ...REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS,
];
export const SOLUTION_PLAN_PROMPT_SOURCE_IDS = ["work_record", "workflow"];
export const CAPABILITY_SELECTION_PROMPT_SOURCE_IDS = ["capability_selection"];
export const WEB_RESEARCH_METHOD_PROMPT_SOURCE_IDS = ["web_research_method"];
export function selectRuntimePromptSources(input) {
    const sourceIds = new Set(input.sourceIds ?? AGENT_PROMPT_BUNDLE_SOURCE_IDS);
    return input.sources
        .filter((source) => source.locale === "en")
        .filter((source) => source.usageScope === "runtime")
        .filter((source) => source.enabled)
        .filter((source) => sourceIds.has(source.sourceId))
        .sort((a, b) => a.priority - b.priority || a.sourceId.localeCompare(b.sourceId));
}
export function selectAgentPromptBundleSources(input) {
    return selectRuntimePromptSources({
        ...input,
        sourceIds: input.sourceIds ?? AGENT_PROMPT_BUNDLE_SOURCE_IDS,
    });
}
export function selectExecutionHarnessPolicySources(input) {
    return selectRuntimePromptSources({
        ...input,
        sourceIds: input.sourceIds ?? EXECUTION_HARNESS_POLICY_SOURCE_IDS,
    });
}
export function selectDiagnosisPromptSources(input) {
    const sourceIds = input.sourceIds ?? DIAGNOSIS_PROMPT_SOURCE_IDS;
    return sourceIds.flatMap((sourceId) => {
        const candidates = input.sources
            .filter((source) => source.sourceId === sourceId)
            .filter((source) => source.usageScope === "internal" || source.sourceId === "work_record")
            .filter((source) => source.enabled);
        const preferred = candidates.find((source) => source.locale === "en");
        return preferred ? [preferred] : [];
    });
}
export function selectSolutionPlanPromptSources(input) {
    return selectRuntimePromptSources({ ...input, sourceIds: SOLUTION_PLAN_PROMPT_SOURCE_IDS });
}
export function selectCapabilitySelectionPromptSources(input) {
    return input.sources
        .filter((source) => source.locale === "en")
        .filter((source) => source.usageScope === "internal")
        .filter((source) => source.enabled)
        .filter((source) => CAPABILITY_SELECTION_PROMPT_SOURCE_IDS.includes(source.sourceId))
        .sort((left, right) => left.priority - right.priority);
}
export function selectWebResearchMethodPromptSources(input) {
    return input.sources
        .filter((source) => source.locale === "en")
        .filter((source) => source.usageScope === "internal")
        .filter((source) => source.enabled)
        .filter((source) => WEB_RESEARCH_METHOD_PROMPT_SOURCE_IDS.includes(source.sourceId))
        .sort((left, right) => left.priority - right.priority);
}
export function loadRuntimePromptPolicySources(input = {}) {
    try {
        return input.workDir ? loadPromptSourceRegistry(input.workDir) : [];
    }
    catch {
        return [];
    }
}
export function renderPromptPolicySourceBlock(input) {
    const selected = selectRuntimePromptSources(input);
    if (selected.length === 0) {
        return [
            input.title ?? promptBundleContextLabel("runtime_prompt_policy_sources_header"),
            promptBundleContextLabel("unavailable_status"),
            promptBundleContextLabel("runtime_sources_missing_reason"),
        ].join("\n");
    }
    return [
        input.title ?? promptBundleContextLabel("runtime_prompt_policy_sources_header"),
        ...selected.flatMap((source) => [
            "",
            `## ${source.sourceId}`,
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content.trim(),
        ]),
    ].join("\n");
}
export function renderDiagnosisPromptSourceBlock(input) {
    const selected = selectDiagnosisPromptSources(input);
    if (selected.length === 0) {
        return [
            input.title ?? promptBundleContextLabel("diagnosis_prompt_sources_header"),
            promptBundleContextLabel("unavailable_status"),
            promptBundleContextLabel("diagnosis_sources_missing_reason"),
        ].join("\n");
    }
    return [
        input.title ?? promptBundleContextLabel("diagnosis_prompt_sources_header"),
        ...selected.flatMap((source) => [
            "",
            `## ${source.sourceId}`,
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content.trim(),
        ]),
    ].join("\n");
}
export function createFileBackedDiagnosisProvider(input) {
    const locale = input.locale ?? "en";
    const sources = loadPromptSourceRegistry(input.workDir);
    const selected = selectDiagnosisPromptSources({ sources, locale });
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    const missingSourceIds = [
        ...DIAGNOSIS_SUPPORT_SOURCE_IDS,
        ...REQUIRED_DIAGNOSIS_PROMPT_SOURCE_IDS,
    ].filter((sourceId) => !selectedIds.has(sourceId));
    if (missingSourceIds.length > 0) {
        throw new Error(`diagnosis prompt sources missing: ${missingSourceIds.join(", ")}`);
    }
    return new AiChatDiagnosisProviderAdapter({
        provider: input.provider,
        model: input.model,
        diagnosisPromptSourceBlock: renderDiagnosisPromptSourceBlock({ sources: selected, locale }),
        workDir: input.workDir,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    });
}
export function createFileBackedSolutionPlanProvider(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const selected = selectSolutionPlanPromptSources({ sources, locale: input.locale ?? "en" });
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    const missing = SOLUTION_PLAN_PROMPT_SOURCE_IDS.filter((sourceId) => !selectedIds.has(sourceId));
    if (missing.length > 0) {
        throw new Error(`solution plan prompt sources missing: ${missing.join(", ")}`);
    }
    return new AiChatSolutionPlanProviderAdapter({
        provider: input.provider,
        model: input.model,
        solutionPlanPromptSourceBlock: renderPromptPolicySourceBlock({
            sources: selected,
            locale: "en",
            sourceIds: SOLUTION_PLAN_PROMPT_SOURCE_IDS,
            title: "[Solution Plan Prompt Sources]",
        }),
        workDir: input.workDir,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    });
}
export function createFileBackedCapabilitySelectionProvider(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const selected = selectCapabilitySelectionPromptSources({ sources, locale: "en" });
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    const missing = CAPABILITY_SELECTION_PROMPT_SOURCE_IDS.filter((sourceId) => !selectedIds.has(sourceId));
    if (missing.length > 0) {
        throw new Error(`capability selection prompt sources missing: ${missing.join(", ")}`);
    }
    const source = selected[0];
    if (!source) {
        throw new Error("capability selection prompt source selection is empty");
    }
    return new AiChatCapabilitySelectionProviderAdapter({
        provider: input.provider,
        model: input.model,
        capabilitySelectionPromptSourceBlock: [
            "[Capability Selection Prompt Sources]",
            "",
            `## ${source.sourceId}`,
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content.trim(),
        ].join("\n"),
        workDir: input.workDir,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.deadlineMs === undefined ? {} : { deadlineMs: input.deadlineMs }),
        ...(input.maxVisibleTextBytes === undefined
            ? {}
            : { maxVisibleTextBytes: input.maxVisibleTextBytes }),
        ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    });
}
export function createFileBackedWebResearchMethodProvider(input) {
    const sources = loadPromptSourceRegistry(input.workDir);
    const selected = selectWebResearchMethodPromptSources({ sources, locale: "en" });
    const selectedIds = new Set(selected.map((source) => source.sourceId));
    const missing = WEB_RESEARCH_METHOD_PROMPT_SOURCE_IDS.filter((sourceId) => !selectedIds.has(sourceId));
    if (missing.length > 0) {
        throw new Error(`web research method prompt sources missing: ${missing.join(", ")}`);
    }
    const source = selected[0];
    if (!source) {
        throw new Error("web research method prompt source selection is empty");
    }
    return new AiChatWebResearchMethodProviderAdapter({
        provider: input.provider,
        model: input.model,
        webResearchMethodPromptSourceBlock: [
            "[Web Research Method Prompt Sources]",
            "",
            `## ${source.sourceId}`,
            `sourceId: ${source.sourceId}`,
            `locale: ${source.locale}`,
            `usageScope: ${source.usageScope}`,
            `path: ${source.path}`,
            `checksum: ${source.checksum}`,
            "",
            source.content.trim(),
        ].join("\n"),
        workDir: input.workDir,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
    });
}
//# sourceMappingURL=prompt-policy-adapter.js.map