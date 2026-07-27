export const IMPROVEMENT_MUTATION_TARGET_KINDS = [
    "file",
    "hidden_runtime_instruction",
    "environment_lookup",
    "in_memory_patch",
    "compiled_artifact",
    "provider_configuration",
    "runtime_environment",
    "yeonjang_permission_policy",
];
export const PROTECTED_COMMON_PROMPT_SOURCES = [
    { policyKind: "system", sourceRef: "prompts/system.md" },
    { policyKind: "safety", sourceRef: "prompts/recovery_policy.md" },
    { policyKind: "tool", sourceRef: "prompts/tool_policy.md" },
    { policyKind: "yeonjang", sourceRef: "prompts/yeonjang_policy.md" },
];
const PROMPT_PATH = /^prompts\/[a-z0-9_-]+(?:\.(?:ko|en))?\.md$/u;
const HARNESS_PATH = "packages/core/src/memory/prompt-improvement-harness.ts";
const LOCKFILES = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "npm-shrinkwrap.json"]);
const APPLICATION_CODE = /^(?:packages|apps|scripts)\/.*\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|cs|sh|bat|ps1)$/u;
const DEPLOYMENT_SCRIPT = /^(?:scripts\/(?:deploy|release|install|installer|service|package|build-release)[^/]*|packages\/[^/]+\/scripts\/(?:deploy|release|install|service|package)[^/]*)\.(?:sh|bat|ps1|js|mjs|ts)$/u;
const PROVIDER_CONFIGURATION = /^(?:config\/|configuration\/|settings\/)(?:ai\/|model\/|providers?\/|provider[._-]).*|^(?:ai|model)[._-]providers?\.(?:json|ya?ml|toml)$/u;
const RUNTIME_ENVIRONMENT = /^(?:\.env(?:\..*)?|config\/runtime-environment\.(?:json|ya?ml|toml)|runtime\/environment\.(?:json|ya?ml|toml))$/u;
const YEONJANG_PERMISSION_POLICY = /^(?:yeonjang\/permissions?\.(?:json|ya?ml|toml)|config\/yeonjang[._/-](?:permission|policy).*)$/u;
const COMPILED_ARTIFACT = /^(?:(?:dist|build|out|target|release|artifacts?)\/|.*\.(?:d\.ts|js\.map|d\.ts\.map|map|wasm|node|dll|dylib|so|exe|class|jar|pyc|o|a|bin)$|packages\/.*\.js$)/u;
const PROTECTED_COMMON_SOURCE_REFS = new Set(PROTECTED_COMMON_PROMPT_SOURCES.map((source) => source.sourceRef));
function normalizeWorkspacePath(value) {
    return value.trim().replace(/\\/gu, "/").replace(/^\.\//u, "").replace(/\/+/gu, "/").toLocaleLowerCase();
}
export function authorizeImprovementMutation(input) {
    if (!input.runtimeSnapshot.snapshotId.trim() || !Number.isSafeInteger(input.runtimeSnapshot.capturedAt) || input.runtimeSnapshot.capturedAt < 0) {
        return { status: "blocked", reasonCode: "runtime_snapshot_invalid" };
    }
    if (input.target.targetKind !== "file") {
        if (input.target.targetKind === "compiled_artifact")
            return { status: "blocked", reasonCode: "compiled_artifact_forbidden" };
        if (input.target.targetKind === "provider_configuration")
            return { status: "blocked", reasonCode: "provider_configuration_forbidden" };
        if (input.target.targetKind === "runtime_environment")
            return { status: "blocked", reasonCode: "runtime_environment_forbidden" };
        if (input.target.targetKind === "yeonjang_permission_policy")
            return { status: "blocked", reasonCode: "yeonjang_permission_policy_forbidden" };
        return { status: "blocked", reasonCode: "runtime_mutation_forbidden" };
    }
    const requested = normalizeWorkspacePath(input.target.requestedRef);
    const canonical = normalizeWorkspacePath(input.target.canonicalWorkspacePath ?? "");
    if (!requested || !canonical)
        return { status: "blocked", reasonCode: "path_receipt_invalid" };
    if (!input.target.withinWorkspace || /(^|\/)\.\.(\/|$)/u.test(requested) || requested.startsWith("/")) {
        return { status: "blocked", reasonCode: "path_escape_forbidden" };
    }
    if (input.target.traversedSymlink)
        return { status: "blocked", reasonCode: "symlink_forbidden" };
    if (COMPILED_ARTIFACT.test(canonical))
        return { status: "blocked", reasonCode: "compiled_artifact_forbidden" };
    if (LOCKFILES.has(canonical) || canonical.endsWith("/package-lock.json") || canonical.endsWith("/pnpm-lock.yaml") || canonical.endsWith("/yarn.lock")) {
        return { status: "blocked", reasonCode: "lockfile_forbidden" };
    }
    if (DEPLOYMENT_SCRIPT.test(canonical))
        return { status: "blocked", reasonCode: "deployment_script_forbidden" };
    if (PROVIDER_CONFIGURATION.test(canonical))
        return { status: "blocked", reasonCode: "provider_configuration_forbidden" };
    if (RUNTIME_ENVIRONMENT.test(canonical))
        return { status: "blocked", reasonCode: "runtime_environment_forbidden" };
    if (YEONJANG_PERMISSION_POLICY.test(canonical))
        return { status: "blocked", reasonCode: "yeonjang_permission_policy_forbidden" };
    if (input.target.sourceAuthorization === "prompt_source") {
        if (!PROMPT_PATH.test(canonical)) {
            return { status: "blocked", reasonCode: APPLICATION_CODE.test(canonical) ? "application_code_forbidden" : "source_authorization_mismatch" };
        }
        if (PROTECTED_COMMON_SOURCE_REFS.has(canonical)) {
            const approval = input.commonPolicyApproval;
            const now = input.now ?? Number.NaN;
            if (!approval)
                return { status: "blocked", reasonCode: "common_policy_approval_required" };
            if (approval.schemaVersion !== 1 || !approval.approvalId.trim() || !approval.approvedBy.trim()
                || !["user", "administrator"].includes(approval.approvedByType)
                || approval.scope !== "common_prompt_policy_mutation" || approval.risk !== "high"
                || !Number.isSafeInteger(approval.issuedAt) || !Number.isSafeInteger(approval.expiresAt)
                || !Number.isSafeInteger(now) || approval.issuedAt > now || approval.expiresAt <= now) {
                return { status: "blocked", reasonCode: "common_policy_approval_invalid" };
            }
            if (normalizeWorkspacePath(approval.sourceRef) !== canonical) {
                return { status: "blocked", reasonCode: "common_policy_approval_scope_mismatch" };
            }
        }
    }
    else if (canonical !== HARNESS_PATH) {
        return { status: "blocked", reasonCode: APPLICATION_CODE.test(canonical) ? "application_code_forbidden" : "source_authorization_mismatch" };
    }
    return { status: "authorized", target: { ...input.target, requestedRef: requested, canonicalWorkspacePath: canonical }, runtimeSnapshotId: input.runtimeSnapshot.snapshotId };
}
export async function executeAuthorizedImprovementMutation(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "mutated", result: await input.mutate(input.decision.target) };
}
//# sourceMappingURL=improvement-mutation-boundary.js.map