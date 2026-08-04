import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  admitLiveAcceptanceRuntimeIdentity,
  type LiveAcceptanceRuntimeIdentitySnapshot,
} from "../packages/core/src/release/live-acceptance-runtime-identity.ts"
import { createLiveAcceptanceRuntimeIdentityInspector } from "../packages/core/src/runtime/live-acceptance-runtime-identity-adapter.ts"
import type { RuntimeBuildStatus } from "../packages/core/src/runtime/build-status.ts"

const HASH = `sha256:${"a".repeat(64)}` as const

function snapshot(
  overrides: Partial<LiveAcceptanceRuntimeIdentitySnapshot> = {},
): LiveAcceptanceRuntimeIdentitySnapshot {
  return {
    buildId: "build:runtime-identity",
    bundleSha256: HASH,
    processStartedAt: "2026-07-28T09:00:00.000Z",
    artifactBuiltAt: "2026-07-28T08:59:00.000Z",
    buildRequired: false,
    restartRequired: false,
    manifestMatchesArtifact: true,
    activeBundleMatchesArtifact: true,
    ...overrides,
  }
}

describe("live acceptance runtime identity", () => {
  it("admits a redacted immutable identity only when source, artifact and process agree", () => {
    const result = admitLiveAcceptanceRuntimeIdentity(snapshot())

    expect(result).toEqual({
      status: "verified",
      receipt: {
        buildId: "build:runtime-identity",
        bundleSha256: HASH,
        processStartedAt: "2026-07-28T09:00:00.000Z",
        artifactBuiltAt: "2026-07-28T08:59:00.000Z",
        buildRequired: false,
        restartRequired: false,
      },
    })
    expect(Object.isFrozen(result)).toBe(true)
    if (result.status === "verified") expect(Object.isFrozen(result.receipt)).toBe(true)
  })

  it.each([
    [
      { buildRequired: true },
      "live_acceptance_runtime_build_required",
    ],
    [
      { restartRequired: true },
      "live_acceptance_runtime_restart_required",
    ],
    [
      {
        processStartedAt: "2026-07-28T08:58:59.999Z",
        artifactBuiltAt: "2026-07-28T08:59:00.000Z",
      },
      "live_acceptance_runtime_restart_required",
    ],
    [
      { manifestMatchesArtifact: false },
      "live_acceptance_runtime_bundle_identity_mismatch",
    ],
    [
      { activeBundleMatchesArtifact: false },
      "live_acceptance_runtime_bundle_identity_mismatch",
    ],
  ] as const)("blocks stale or mismatched runtime before live work", (overrides, reasonCode) => {
    expect(admitLiveAcceptanceRuntimeIdentity(snapshot(overrides))).toEqual({
      status: "blocked",
      reasonCode,
    })
  })

  it("rejects unsafe or incomplete identity values without returning raw details", () => {
    const result = admitLiveAcceptanceRuntimeIdentity(
      snapshot({
        buildId: "/private/workspace?token=secret",
        bundleSha256: "sha256:not-a-digest",
      }),
    )

    expect(result).toEqual({
      status: "blocked",
      reasonCode: "live_acceptance_runtime_identity_invalid",
    })
    expect(JSON.stringify(result)).not.toMatch(/private|token|secret/u)
  })

  it("keeps the bootstrap bundle identity immutable when files change at runtime", () => {
    let artifact = Buffer.from("gateway-bundle-v1")
    let manifestHash = createHash("sha256").update(artifact).digest("hex")
    const entry = Buffer.from("gateway-entry-v1")
    const inputPath = "packages/core/dist/runtime/bootstrap.js"
    const input = Buffer.from("gateway-input-v1")
    const inputHash = createHash("sha256")
      .update(inputPath)
      .update("\0")
      .update(input)
      .update("\0")
      .digest("hex")
    const inspector = createLiveAcceptanceRuntimeIdentityInspector({
      workspaceRoot: "/workspace",
      processStartTimeMs: Date.parse("2026-07-28T09:00:00.000Z"),
      readText: () => JSON.stringify({
        schemaVersion: 2,
        artifact: "packages/core/dist/runtime/serve-bundle.js",
        bundleSha256: manifestHash,
        entryPoint: "packages/cli/dist/serve-entry.js",
        entryPointSha256: createHash("sha256").update(entry).digest("hex"),
        bundledInputs: [inputPath],
        bundledInputsSha256: inputHash,
      }),
      readBytes: (path) =>
        path.endsWith("serve-bundle.js")
          ? artifact
          : path.endsWith("serve-entry.js")
            ? entry
            : input,
      readMtimeMs: () => Date.parse("2026-07-28T08:59:00.000Z"),
      readBuildStatus: () => ({
        buildId: "build:runtime-identity",
        processStartedAt: "2026-07-28T09:00:00.000Z",
        buildRequired: false,
        restartRequired: false,
      } as RuntimeBuildStatus),
    })

    expect(inspector().status).toBe("verified")

    artifact = Buffer.from("gateway-bundle-v2")
    manifestHash = createHash("sha256").update(artifact).digest("hex")

    expect(inspector()).toEqual({
      status: "blocked",
      reasonCode: "live_acceptance_runtime_bundle_identity_mismatch",
    })

    const restartedInspector = createLiveAcceptanceRuntimeIdentityInspector({
      workspaceRoot: "/workspace",
      processStartTimeMs: Date.parse("2026-07-28T09:01:00.000Z"),
      readText: () => JSON.stringify({
        schemaVersion: 2,
        artifact: "packages/core/dist/runtime/serve-bundle.js",
        bundleSha256: manifestHash,
        entryPoint: "packages/cli/dist/serve-entry.js",
        entryPointSha256: createHash("sha256").update(entry).digest("hex"),
        bundledInputs: [inputPath],
        bundledInputsSha256: inputHash,
      }),
      readBytes: (path) =>
        path.endsWith("serve-bundle.js")
          ? artifact
          : path.endsWith("serve-entry.js")
            ? entry
            : input,
      readMtimeMs: () => Date.parse("2026-07-28T09:00:30.000Z"),
      readBuildStatus: () => ({
        buildId: "build:runtime-identity-v2",
        processStartedAt: "2026-07-28T09:01:00.000Z",
        buildRequired: false,
        restartRequired: false,
      } as RuntimeBuildStatus),
    })

    expect(restartedInspector()).toMatchObject({
      status: "verified",
      receipt: {
        buildId: "build:runtime-identity-v2",
        bundleSha256: `sha256:${manifestHash}`,
      },
    })
  })

  it("keeps a byte-identical deterministic rebuild admitted after process start", () => {
    const artifact = Buffer.from("gateway-bundle-v1")
    const artifactHash = createHash("sha256").update(artifact).digest("hex")
    const entry = Buffer.from("gateway-entry-v1")
    const entryHash = createHash("sha256").update(entry).digest("hex")
    const inputPath = "packages/core/dist/runtime/bootstrap.js"
    const bundledInput = Buffer.from("gateway-input-v1")
    const bundledInputsHash = createHash("sha256")
      .update(inputPath)
      .update("\0")
      .update(bundledInput)
      .update("\0")
      .digest("hex")
    let artifactMtimeMs = Date.parse("2026-07-28T08:59:00.000Z")
    let restartRequired = false
    const inspector = createLiveAcceptanceRuntimeIdentityInspector({
      workspaceRoot: "/workspace",
      processStartTimeMs: Date.parse("2026-07-28T09:00:00.000Z"),
      readText: () => JSON.stringify({
        schemaVersion: 2,
        artifact: "packages/core/dist/runtime/serve-bundle.js",
        bundleSha256: artifactHash,
        entryPoint: "packages/cli/dist/serve-entry.js",
        entryPointSha256: entryHash,
        bundledInputs: [inputPath],
        bundledInputsSha256: bundledInputsHash,
      }),
      readBytes: (path) =>
        path.endsWith("serve-bundle.js")
          ? artifact
          : path.endsWith("serve-entry.js")
            ? entry
            : bundledInput,
      readMtimeMs: () => artifactMtimeMs,
      readBuildStatus: () => ({
        buildId: "build:runtime-identity",
        processStartedAt: "2026-07-28T09:00:00.000Z",
        buildRequired: false,
        restartRequired,
      } as RuntimeBuildStatus),
    })

    expect(inspector().status).toBe("verified")

    artifactMtimeMs = Date.parse("2026-07-28T09:01:00.000Z")
    restartRequired = true

    expect(inspector().status).toBe("verified")
  })

  it("rejects legacy or input-mismatched manifests before live execution", () => {
    const artifact = Buffer.from("gateway-bundle")
    const artifactHash = createHash("sha256").update(artifact).digest("hex")
    const base = {
      artifact: "packages/core/dist/runtime/serve-bundle.js",
      bundleSha256: artifactHash,
      entryPoint: "packages/cli/dist/serve-entry.js",
      entryPointSha256: artifactHash,
      bundledInputs: ["packages/core/dist/runtime/bootstrap.js"],
      bundledInputsSha256: artifactHash,
    }
    let manifest: Record<string, unknown> = { schemaVersion: 1, ...base }
    const inspector = createLiveAcceptanceRuntimeIdentityInspector({
      workspaceRoot: "/workspace",
      readText: () => JSON.stringify(manifest),
      readBytes: () => artifact,
      readMtimeMs: () => Date.parse("2026-07-28T08:59:00.000Z"),
      readBuildStatus: () => ({
        buildId: "build:runtime-identity",
        processStartedAt: "2026-07-28T09:00:00.000Z",
        buildRequired: false,
        restartRequired: false,
      } as RuntimeBuildStatus),
    })

    expect(inspector()).toEqual({
      status: "blocked",
      reasonCode: "live_acceptance_runtime_identity_invalid",
    })

    manifest = { schemaVersion: 2, ...base }
    const mismatched = createLiveAcceptanceRuntimeIdentityInspector({
      workspaceRoot: "/workspace",
      readText: () => JSON.stringify(manifest),
      readBytes: () => artifact,
      readMtimeMs: () => Date.parse("2026-07-28T08:59:00.000Z"),
      readBuildStatus: () => ({
        buildId: "build:runtime-identity",
        processStartedAt: "2026-07-28T09:00:00.000Z",
        buildRequired: false,
        restartRequired: false,
      } as RuntimeBuildStatus),
    })
    expect(mismatched()).toEqual({
      status: "blocked",
      reasonCode: "live_acceptance_runtime_identity_invalid",
    })
  })
})
