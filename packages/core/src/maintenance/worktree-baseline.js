import { describeRepositoryArtifact } from "./artifact-inventory.js";
function normalizeRepositoryPath(rawPath) {
    const path = rawPath.replaceAll("\\", "/").replace(/^\.\//u, "");
    if (!path ||
        path.includes("\0") ||
        path.startsWith("/") ||
        /^[A-Za-z]:\//u.test(path) ||
        path.split("/").includes("..")) {
        return undefined;
    }
    return path;
}
function changeKind(status) {
    if (status === "??")
        return "untracked";
    if (status.length !== 2 || status === "!!")
        return undefined;
    if (/U/u.test(status) || ["AA", "DD", "AU", "UA", "DU", "UD"].includes(status)) {
        return "conflicted";
    }
    if (status.includes("R"))
        return "renamed";
    if (status.includes("C"))
        return "copied";
    if (status.includes("D"))
        return "deleted";
    if (status.includes("A"))
        return "added";
    if (status.includes("M") || status.includes("T"))
        return "modified";
    return undefined;
}
function classifyPath(path) {
    if (path.startsWith(".tasks/")) {
        return { category: "task_only", ownerArtifactId: path, reasonCode: "task_artifact" };
    }
    if (path.startsWith("tests/")) {
        return { category: "test", ownerArtifactId: path, reasonCode: "test_artifact" };
    }
    if (path.startsWith("prompts/") && path.endsWith(".md")) {
        return { category: "prompt", ownerArtifactId: path, reasonCode: "prompt_source" };
    }
    if (/(?:^|\/)(?:migrations?|migration)(?:\/|[-_.])/u.test(path)) {
        return { category: "migration", ownerArtifactId: path, reasonCode: "migration_artifact" };
    }
    if (path.startsWith("docs/") ||
        /^(?:AGENTS|CHANGELOG|CONTRIBUTING|LICENSE|PROJECT|README(?:\.[^.]+)?)\.md$/u.test(path)) {
        return { category: "docs", ownerArtifactId: path, reasonCode: "documentation_artifact" };
    }
    if (path === ".gitignore" || path === "devenv.toml") {
        return { category: "source", ownerArtifactId: path, reasonCode: "repository_configuration" };
    }
    const descriptor = describeRepositoryArtifact(path);
    if (!descriptor)
        return undefined;
    if (descriptor.kind === "generated_output" && descriptor.generatedFrom) {
        return {
            category: "generated",
            ownerArtifactId: descriptor.generatedFrom,
            reasonCode: "generated_source_owner",
        };
    }
    if (["source", "configuration", "data", "ui_asset"].includes(descriptor.kind)) {
        return { category: "source", ownerArtifactId: path, reasonCode: "canonical_source" };
    }
    if (descriptor.kind === "document") {
        return { category: "docs", ownerArtifactId: path, reasonCode: "documentation_artifact" };
    }
    if (descriptor.kind === "test_fixture") {
        return { category: "test", ownerArtifactId: path, reasonCode: "test_artifact" };
    }
    return undefined;
}
export function classifyWorktreeChanges(changes) {
    const records = [];
    const diagnostics = [];
    for (const change of changes) {
        const path = normalizeRepositoryPath(change.path);
        const originalPath = change.originalPath
            ? normalizeRepositoryPath(change.originalPath)
            : undefined;
        if (!path || (change.originalPath && !originalPath)) {
            diagnostics.push({ path: change.path, code: "unsafe_path" });
            continue;
        }
        const kind = changeKind(change.status);
        if (!kind) {
            diagnostics.push({ path, code: "status_unrecognized" });
            continue;
        }
        const classification = classifyPath(path);
        if (!classification) {
            diagnostics.push({ path, code: "artifact_unclassified" });
            continue;
        }
        records.push({
            status: change.status,
            path,
            ...(originalPath ? { originalPath } : {}),
            changeKind: kind,
            ...classification,
        });
    }
    records.sort((left, right) => left.path.localeCompare(right.path));
    diagnostics.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
    return { complete: diagnostics.length === 0, records, diagnostics };
}
export function buildWorktreeBaselineReceipt(input) {
    const classification = classifyWorktreeChanges(input.changes);
    const byCategory = {};
    for (const record of classification.records) {
        byCategory[record.category] = (byCategory[record.category] ?? 0) + 1;
    }
    return {
        schemaVersion: 1,
        repositoryRoot: input.repositoryRoot,
        headSha: input.headSha,
        headCommittedAt: input.headCommittedAt,
        capturedAt: input.capturedAt,
        complete: classification.complete,
        counts: {
            total: input.changes.length,
            tracked: input.changes.filter((change) => change.status !== "??").length,
            untracked: input.changes.filter((change) => change.status === "??").length,
            deleted: input.changes.filter((change) => changeKind(change.status) === "deleted").length,
            unknown: classification.diagnostics.length,
            byCategory,
        },
        records: classification.records,
        diagnostics: classification.diagnostics,
    };
}
//# sourceMappingURL=worktree-baseline.js.map