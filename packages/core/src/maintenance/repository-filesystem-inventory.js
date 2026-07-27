import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describeRepositoryArtifact, } from "./artifact-inventory.js";
const GOVERNED_DIRECTORIES = [
    ".temp",
    "backups",
    "docs",
    "packages",
    "prompts",
    "scripts",
    "tests",
];
const GOVERNED_ROOT_FILES = [
    "AGENTS.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE.md",
    "PROJECT.md",
    "README.md",
    "README.ko.md",
    "biome.json",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "tsconfig.base.json",
];
const SKIPPED_DIRECTORIES = new Set([".git", "node_modules", "dist", "coverage"]);
export function collectRepositoryArtifactInventory(input) {
    const artifacts = [];
    const diagnostics = [];
    try {
        if (!lstatSync(input.repositoryRoot).isDirectory())
            throw new Error("not a directory");
    }
    catch {
        return {
            complete: false,
            artifacts,
            diagnostics: [{ code: "repository_root_unreadable", artifactId: "." }],
        };
    }
    const inspectFile = (absolutePath) => {
        const artifactId = relative(input.repositoryRoot, absolutePath).replaceAll("\\", "/");
        const descriptor = describeRepositoryArtifact(artifactId);
        if (descriptor)
            artifacts.push(descriptor);
        else
            diagnostics.push({ code: "artifact_unclassified", artifactId });
    };
    const walk = (absoluteDir) => {
        let entries;
        try {
            entries = readdirSync(absoluteDir).sort();
        }
        catch {
            diagnostics.push({
                code: "path_unreadable",
                artifactId: relative(input.repositoryRoot, absoluteDir).replaceAll("\\", "/") || ".",
            });
            return;
        }
        for (const entry of entries) {
            if (SKIPPED_DIRECTORIES.has(entry))
                continue;
            const absolutePath = join(absoluteDir, entry);
            const artifactId = relative(input.repositoryRoot, absolutePath).replaceAll("\\", "/");
            try {
                const stat = lstatSync(absolutePath);
                if (stat.isSymbolicLink()) {
                    diagnostics.push({ code: "symlink_skipped", artifactId });
                }
                else if (stat.isDirectory()) {
                    walk(absolutePath);
                }
                else if (stat.isFile()) {
                    inspectFile(absolutePath);
                }
            }
            catch {
                diagnostics.push({ code: "path_unreadable", artifactId });
            }
        }
    };
    for (const directory of GOVERNED_DIRECTORIES) {
        const absoluteDir = join(input.repositoryRoot, directory);
        if (existsSync(absoluteDir))
            walk(absoluteDir);
    }
    for (const filename of GOVERNED_ROOT_FILES) {
        const absolutePath = join(input.repositoryRoot, filename);
        if (existsSync(absolutePath))
            inspectFile(absolutePath);
    }
    artifacts.sort((left, right) => left.artifactId.localeCompare(right.artifactId));
    diagnostics.sort((left, right) => left.artifactId.localeCompare(right.artifactId) || left.code.localeCompare(right.code));
    return { complete: diagnostics.length === 0, artifacts, diagnostics };
}
//# sourceMappingURL=repository-filesystem-inventory.js.map