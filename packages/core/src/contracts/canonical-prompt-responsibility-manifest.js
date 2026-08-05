export const CANONICAL_PROMPT_MODULE_IDS = [
    "system",
    "identity",
    "task_intake",
    "work_record",
    "workflow",
    "prompt_visibility",
    "sub_agent_base",
    "agent_persona",
    "sub_agent_delegation",
    "result_review",
    "yeonjang_policy",
    "memory_policy",
    "prompt_improvement",
    "tool_policy",
    "final_response",
    "maintenance_policy",
    "ui_policy",
];
function entry(moduleId, kind, purpose, responsibilityId, outOfScopeResponsibilityIds, dependencyModuleIds) {
    return { moduleId, kind, purpose, ownedResponsibilityIds: [responsibilityId], outOfScopeResponsibilityIds, dependencyModuleIds };
}
export const CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST = [
    entry("system", "root", "Compose canonical prompt modules and resolve global priority.", "prompt_stack_contract", ["feature_policy_details"], []),
    entry("identity", "common", "Resolve product, agent, and user-facing identity names.", "identity_policy", ["user_profile", "response_rendering"], ["system"]),
    entry("task_intake", "common", "Diagnose requests and decide whether clarification or work should start.", "request_intake_policy", ["result_diagnosis", "work_record_schema"], ["identity"]),
    entry("work_record", "common", "Define structured work records, schemas, and allowed state transitions.", "work_record_contract", ["request_interpretation", "result_interpretation"], ["system"]),
    entry("workflow", "function", "Decompose work into ordered steps and completion criteria.", "workflow_policy", ["work_record_storage", "result_diagnosis"], ["work_record"]),
    entry("prompt_visibility", "common", "Control prompt disclosure, summaries, and redaction.", "prompt_visibility_policy", ["prompt_improvement", "ui_layout"], ["system"]),
    entry("sub_agent_base", "sub_agent", "Define the base sub-agent prompt stack and role boundary.", "sub_agent_base_policy", ["delegation_procedure", "memory_policy"], ["system"]),
    entry("agent_persona", "sub_agent", "Apply explicit agent-specific tendencies without overriding platform policy.", "agent_persona_policy", ["identity_defaults", "ui_layout"], ["sub_agent_base", "ui_policy"]),
    entry("sub_agent_delegation", "function", "Apply delegation, handoff, parent review, merge, and redelegation rules.", "delegation_policy", ["result_sufficiency", "recovery_diagnosis"], ["work_record", "result_review"]),
    entry("result_review", "terminal", "Diagnose execution results and recommend the next justified action.", "result_review_policy", ["final_response_rendering", "work_record_schema"], ["work_record"]),
    entry("yeonjang_policy", "function", "Control Yeonjang targeting, permission, safety, and unavailable fallback.", "yeonjang_policy", ["general_tool_policy", "final_response_rendering"], ["tool_policy"]),
    entry("memory_policy", "common", "Control isolated short-term and long-term agent memory.", "memory_policy", ["delegation_routing", "response_rendering"], ["system"]),
    entry("prompt_improvement", "function", "Control reviewable, reversible prompt and harness improvement.", "prompt_improvement_policy", ["feature_execution", "ui_layout"], ["system"]),
    entry("tool_policy", "common", "Control Skill, MCP, tool permission, approval, and audit boundaries.", "tool_policy", ["yeonjang_targeting", "workflow_decomposition"], ["system"]),
    entry("final_response", "terminal", "Render the final user-facing answer in the request language.", "final_response_policy", ["request_diagnosis", "result_diagnosis"], ["identity", "result_review", "prompt_visibility"]),
    entry("maintenance_policy", "function", "Control evidenced cleanup, duplicate removal, and structure simplification.", "maintenance_policy", ["feature_behavior", "prompt_rendering"], ["system"]),
    entry("ui_policy", "function", "Control user-first configuration, accessibility, and interaction recovery.", "ui_policy", ["agent_persona_content", "runtime_contract_details"], ["system"]),
];
export function validateCanonicalPromptResponsibilityManifest(entries) {
    const issues = [];
    const add = (code, subjectId) => { issues.push({ code, subjectId }); };
    const expected = new Set(CANONICAL_PROMPT_MODULE_IDS);
    const moduleCounts = new Map();
    const responsibilityOwners = new Map();
    for (const manifest of entries) {
        const moduleId = manifest.moduleId.trim();
        moduleCounts.set(moduleId, (moduleCounts.get(moduleId) ?? 0) + 1);
        if (!expected.has(moduleId))
            add("module_unknown", moduleId);
        if (!manifest.purpose.trim())
            add("purpose_missing", moduleId);
        if (manifest.ownedResponsibilityIds.length !== 1 || !manifest.ownedResponsibilityIds[0]?.trim()) {
            add("owned_responsibility_count_invalid", moduleId);
        }
        else {
            const responsibilityId = manifest.ownedResponsibilityIds[0].trim();
            if (responsibilityOwners.has(responsibilityId))
                add("responsibility_duplicate", responsibilityId);
            else
                responsibilityOwners.set(responsibilityId, moduleId);
        }
        if (manifest.outOfScopeResponsibilityIds.length === 0 || manifest.outOfScopeResponsibilityIds.some((id) => !id.trim())) {
            add("out_of_scope_missing", moduleId);
        }
        if (moduleId !== "system" && manifest.dependencyModuleIds.length === 0)
            add("dependency_missing", moduleId);
        for (const dependencyId of manifest.dependencyModuleIds) {
            if (dependencyId === moduleId)
                add("dependency_self", moduleId);
            else if (!expected.has(dependencyId))
                add("dependency_unknown", `${moduleId}:${dependencyId}`);
        }
    }
    for (const moduleId of CANONICAL_PROMPT_MODULE_IDS) {
        const count = moduleCounts.get(moduleId) ?? 0;
        if (count === 0)
            add("module_missing", moduleId);
        if (count > 1)
            add("module_duplicate", moduleId);
    }
    const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}\u0000${issue.subjectId}`, issue])).values()];
    if (uniqueIssues.length > 0)
        return { status: "blocked", issues: uniqueIssues };
    return {
        status: "eligible",
        moduleIds: [...CANONICAL_PROMPT_MODULE_IDS],
        responsibilityIds: entries.map((manifest) => manifest.ownedResponsibilityIds[0]),
    };
}
//# sourceMappingURL=canonical-prompt-responsibility-manifest.js.map