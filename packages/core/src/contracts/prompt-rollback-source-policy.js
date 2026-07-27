export const PROMPT_ROLLBACK_SOURCE_TYPES = [
    "source_control_revision",
    "prompt_registry_version",
    "timestamped_backup_file",
    "reverse_patch",
    "release_artifact_version",
];
export const PROMPT_ROLLBACK_SOURCE_MANIFEST = [
    { sourceType: "source_control_revision", exactReferencePattern: /^git:[a-f0-9]{7,40}$/iu, example: "git:abc1234" },
    { sourceType: "prompt_registry_version", exactReferencePattern: /^prompt-registry:[a-z0-9_-]+:v[1-9][0-9]*$/iu, example: "prompt-registry:final_response:v12" },
    { sourceType: "timestamped_backup_file", exactReferencePattern: /^backup:[0-9]{8}T[0-9]{6}Z:[^\s]+$/u, example: "backup:20260704T000000Z:final_response.md" },
    { sourceType: "reverse_patch", exactReferencePattern: /^patch:[a-z0-9_-]+:[a-z0-9._-]+$/iu, example: "patch:prompt-improvement:123" },
    { sourceType: "release_artifact_version", exactReferencePattern: /^release:v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][a-z0-9.-]+)?$/iu, example: "release:v0.2.16" },
];
const manifestByType = new Map(PROMPT_ROLLBACK_SOURCE_MANIFEST.map((entry) => [entry.sourceType, entry]));
export function validatePromptImprovementRollbackSource(source, pathPrefix = "") {
    const issues = [];
    const sourceTypePath = pathPrefix ? `${pathPrefix}.sourceType` : "sourceType";
    const sourceRefPath = pathPrefix ? `${pathPrefix}.sourceRef` : "sourceRef";
    const manifest = source.sourceType ? manifestByType.get(source.sourceType) : undefined;
    if (!manifest) {
        issues.push({
            code: "rollback_source_type_invalid",
            path: sourceTypePath,
            message: "Rollback source type must be source-control revision, prompt registry version, timestamped backup file, reverse patch, or release artifact version.",
        });
    }
    if (!source.sourceRef?.trim()) {
        issues.push({
            code: "rollback_source_ref_missing",
            path: sourceRefPath,
            message: "Rollback source requires an exact source reference.",
        });
    }
    else if (manifest && !manifest.exactReferencePattern.test(source.sourceRef.trim())) {
        issues.push({
            code: "rollback_source_ref_invalid",
            path: sourceRefPath,
            message: "Rollback source reference must be an immutable exact reference for its declared source type.",
        });
    }
    return { ok: issues.length === 0, issues };
}
//# sourceMappingURL=prompt-rollback-source-policy.js.map