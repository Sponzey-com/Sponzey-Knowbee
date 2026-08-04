import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { admitLiveAcceptanceRuntimeIdentity, } from "../release/live-acceptance-runtime-identity.js";
import { buildRuntimeBuildStatus, getGatewayProcessStartTimeMs, } from "./build-status.js";
import { getWorkspaceRootPath } from "../version.js";
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/u;
function inside(root, path) {
    const value = relative(root, path);
    return value !== ".." && !value.startsWith(`..${sep}`);
}
function readManifest(value) {
    try {
        const parsed = JSON.parse(value);
        if (parsed.schemaVersion !== 2
            || parsed.entryPoint !== "packages/cli/dist/serve-entry.js"
            || typeof parsed.entryPointSha256 !== "string"
            || !SHA256_HEX_PATTERN.test(parsed.entryPointSha256)
            || typeof parsed.artifact !== "string"
            || !parsed.artifact.trim()
            || typeof parsed.bundleSha256 !== "string"
            || !SHA256_HEX_PATTERN.test(parsed.bundleSha256)
            || !Array.isArray(parsed.bundledInputs)
            || parsed.bundledInputs.length === 0
            || parsed.bundledInputs.some((path) => typeof path !== "string" || !path.trim())
            || typeof parsed.bundledInputsSha256 !== "string"
            || !SHA256_HEX_PATTERN.test(parsed.bundledInputsSha256)) {
            return undefined;
        }
        const bundledInputs = [...new Set(parsed.bundledInputs)].sort();
        if (bundledInputs.length !== parsed.bundledInputs.length
            || bundledInputs.some((path, index) => path !== parsed.bundledInputs[index])) {
            return undefined;
        }
        return {
            schemaVersion: 2,
            entryPoint: parsed.entryPoint,
            entryPointSha256: parsed.entryPointSha256,
            artifact: parsed.artifact,
            bundleSha256: parsed.bundleSha256,
            bundledInputs,
            bundledInputsSha256: parsed.bundledInputsSha256,
        };
    }
    catch {
        return undefined;
    }
}
function digest(bytes) {
    return createHash("sha256").update(bytes).digest("hex");
}
function digestFileSet(paths, readBytes) {
    const hash = createHash("sha256");
    for (const path of paths) {
        hash.update(path);
        hash.update("\0");
        hash.update(readBytes(path));
        hash.update("\0");
    }
    return hash.digest("hex");
}
export function createLiveAcceptanceRuntimeIdentityInspector(input = {}) {
    const workspaceRoot = resolve(input.workspaceRoot ?? getWorkspaceRootPath());
    const processStartTimeMs = input.processStartTimeMs ?? getGatewayProcessStartTimeMs();
    const readText = input.readText ?? ((path) => readFileSync(path, "utf8"));
    const readBytes = input.readBytes ?? ((path) => readFileSync(path));
    const readMtimeMs = input.readMtimeMs ?? ((path) => statSync(path).mtimeMs);
    const manifestPath = resolve(workspaceRoot, "packages/core/dist/runtime/serve-bundle.manifest.json");
    const readCurrent = () => {
        const manifest = readManifest(readText(manifestPath));
        if (!manifest)
            return undefined;
        const artifactPath = resolve(workspaceRoot, manifest.artifact);
        const entryPointPath = resolve(workspaceRoot, manifest.entryPoint);
        const bundledInputPaths = manifest.bundledInputs.map((path) => resolve(workspaceRoot, path));
        if (!inside(workspaceRoot, artifactPath)
            || dirname(artifactPath) !== dirname(manifestPath)
            || !inside(workspaceRoot, entryPointPath)
            || bundledInputPaths.some((path) => !inside(workspaceRoot, path))) {
            return undefined;
        }
        const artifactSha256 = digest(readBytes(artifactPath));
        const entryPointSha256 = digest(readBytes(entryPointPath));
        const bundledInputsSha256 = digestFileSet(manifest.bundledInputs, (path) => readBytes(resolve(workspaceRoot, path)));
        if (entryPointSha256 !== manifest.entryPointSha256
            || bundledInputsSha256 !== manifest.bundledInputsSha256) {
            return undefined;
        }
        return {
            manifest,
            artifactSha256,
            artifactBuiltAt: new Date(readMtimeMs(artifactPath)).toISOString(),
        };
    };
    let activeIdentity;
    try {
        activeIdentity = readCurrent();
    }
    catch {
        activeIdentity = undefined;
    }
    const readBuildStatus = input.readBuildStatus
        ?? (() => buildRuntimeBuildStatus({ workspaceRoot, processStartTimeMs }));
    return () => {
        try {
            const current = readCurrent();
            const status = readBuildStatus();
            if (!current || !activeIdentity) {
                return Object.freeze({
                    status: "blocked",
                    reasonCode: "live_acceptance_runtime_identity_invalid",
                });
            }
            const activeBundleMatchesArtifact = activeIdentity.artifactSha256 === current.artifactSha256
                && activeIdentity.manifest.bundleSha256
                    === current.manifest.bundleSha256
                && activeIdentity.manifest.entryPointSha256
                    === current.manifest.entryPointSha256
                && activeIdentity.manifest.bundledInputsSha256
                    === current.manifest.bundledInputsSha256;
            return admitLiveAcceptanceRuntimeIdentity({
                buildId: status.buildId,
                bundleSha256: `sha256:${current.manifest.bundleSha256}`,
                processStartedAt: status.processStartedAt,
                artifactBuiltAt: activeIdentity.artifactBuiltAt,
                buildRequired: status.buildRequired,
                restartRequired: status.restartRequired && !activeBundleMatchesArtifact,
                manifestMatchesArtifact: current.manifest.bundleSha256 === current.artifactSha256,
                activeBundleMatchesArtifact,
            });
        }
        catch {
            return Object.freeze({
                status: "blocked",
                reasonCode: "live_acceptance_runtime_identity_invalid",
            });
        }
    };
}
//# sourceMappingURL=live-acceptance-runtime-identity-adapter.js.map