export declare const CANONICAL_PROMPT_MODULE_IDS: readonly ["system", "identity", "task_intake", "work_record", "workflow", "prompt_visibility", "sub_agent_base", "agent_persona", "sub_agent_delegation", "result_review", "yeonjang_policy", "memory_policy", "prompt_improvement", "tool_policy", "final_response", "maintenance_policy", "ui_policy"];
export type CanonicalPromptModuleId = typeof CANONICAL_PROMPT_MODULE_IDS[number];
export type CanonicalPromptModuleKind = "root" | "common" | "function" | "sub_agent" | "terminal";
export interface CanonicalPromptResponsibilityManifestEntry {
    moduleId: CanonicalPromptModuleId;
    kind: CanonicalPromptModuleKind;
    purpose: string;
    ownedResponsibilityIds: string[];
    outOfScopeResponsibilityIds: string[];
    dependencyModuleIds: CanonicalPromptModuleId[];
}
export type CanonicalPromptManifestIssueCode = "module_missing" | "module_duplicate" | "module_unknown" | "purpose_missing" | "owned_responsibility_count_invalid" | "responsibility_duplicate" | "out_of_scope_missing" | "dependency_missing" | "dependency_unknown" | "dependency_self";
export interface CanonicalPromptManifestIssue {
    code: CanonicalPromptManifestIssueCode;
    subjectId: string;
}
export type CanonicalPromptManifestDecision = {
    status: "eligible";
    moduleIds: CanonicalPromptModuleId[];
    responsibilityIds: string[];
} | {
    status: "blocked";
    issues: CanonicalPromptManifestIssue[];
};
export declare const CANONICAL_PROMPT_RESPONSIBILITY_MANIFEST: readonly CanonicalPromptResponsibilityManifestEntry[];
export declare function validateCanonicalPromptResponsibilityManifest(entries: readonly CanonicalPromptResponsibilityManifestEntry[]): CanonicalPromptManifestDecision;
//# sourceMappingURL=canonical-prompt-responsibility-manifest.d.ts.map