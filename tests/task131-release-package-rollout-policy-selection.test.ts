import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import {
  type ReleasePolicyAuthorizationRepository,
  authorizeSubAgentRolloutThresholdPolicy,
  selectReleaseRolloutThresholdPolicy,
} from "../packages/core/src/release/release-policy-authorization.ts"
import { SqliteReleasePolicyAuthorizationRepository } from "../packages/core/src/release/sqlite-release-policy-authorization-repository.ts"
import { SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS } from "../packages/core/src/release/sub-agent-release-gate.ts"
import type { SubAgentRolloutThresholdPolicyCandidate } from "../packages/core/src/release/sub-agent-rollout-threshold-policy.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function policy(): SubAgentRolloutThresholdPolicyCandidate {
  return {
    schemaVersion: 1,
    policyId: "rollout-policy:task131",
    policyVersion: 1,
    releaseMode: "limited_beta",
    thresholds: { ...SUB_AGENT_OPERATIONAL_REFERENCE_THRESHOLDS },
  }
}

function selector() {
  return {
    policyId: policy().policyId,
    policyVersion: policy().policyVersion,
    releaseMode: policy().releaseMode,
  } as const
}

function approve(
  repository: ReleasePolicyAuthorizationRepository,
  decision: "approved" | "denied" | "revoked",
) {
  return authorizeSubAgentRolloutThresholdPolicy({
    candidate: policy(),
    decision,
    principal: {
      principalType: "authenticated_user",
      principalId: "administrator:task131",
      authenticationId: "authentication:task131",
      roles: ["release_administrator"],
    },
    authorizationId: `authorization:task131:${decision}`,
    decidedAt: decision === "approved" ? 100 : 101,
    repository,
  })
}

beforeEach(() => closeDb())

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task131 release package rollout policy selection", () => {
  it("selects only an exact latest approved policy", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task131-selector-"))
    tempDirs.push(root)
    const db = initializeTestDbRuntime(root)
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    approve(repository, "approved")

    expect(selectReleaseRolloutThresholdPolicy({ selector: selector(), repository })).toMatchObject(
      {
        status: "selected",
        candidate: { policyId: policy().policyId, policyVersion: 1, releaseMode: "limited_beta" },
      },
    )
    expect(
      selectReleaseRolloutThresholdPolicy({
        selector: { ...selector(), policyVersion: 2 },
        repository,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["rollout_policy_selection_missing"] })
  })

  it("does not fall back to an older approval after revocation", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task131-revoked-"))
    tempDirs.push(root)
    const db = initializeTestDbRuntime(root)
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    approve(repository, "approved")
    approve(repository, "revoked")

    expect(selectReleaseRolloutThresholdPolicy({ selector: selector(), repository })).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_policy_selection_not_approved"],
    })
  })

  it("does not use an approval for a different mode or after a denial", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task131-denied-"))
    tempDirs.push(root)
    const db = initializeTestDbRuntime(root)
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    approve(repository, "approved")

    expect(
      selectReleaseRolloutThresholdPolicy({
        selector: { ...selector(), releaseMode: "full_enable" },
        repository,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["rollout_policy_selection_missing"] })

    approve(repository, "denied")
    expect(selectReleaseRolloutThresholdPolicy({ selector: selector(), repository })).toEqual({
      status: "baseline_only",
      reasonCodes: ["rollout_policy_selection_not_approved"],
    })
  })

  it("injects an explicitly selected approved policy into the manifest gate", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task131-manifest-"))
    tempDirs.push(root)
    const runtime = createTestRuntimeConfigFixture({ rootDir: root })
    const db = initializeTestDbRuntime(runtime.paths.stateDir)
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    approve(repository, "approved")

    const baseline = buildReleaseManifest({
      rootDir: root,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
    })
    const selected = buildReleaseManifest({
      rootDir: root,
      runtimePaths: runtime.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
      rolloutThresholdPolicySelection: { selector: selector(), repository },
    })

    expect(baseline.subAgentReleaseGate.checks).toContainEqual(
      expect.objectContaining({ id: "benchmark_threshold", status: "failed" }),
    )
    expect(selected.subAgentReleaseGate.checks).toContainEqual(
      expect.objectContaining({ id: "benchmark_threshold", status: "passed" }),
    )
    expect(selected.subAgentReleaseGate.gateStatus).toBe("failed")
  })

  it("requires the complete CLI selector and injects it without an environment fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task131-cli-"))
    tempDirs.push(root)
    const runtime = createTestRuntimeConfigFixture({ rootDir: root })
    const db = initializeTestDbRuntime(runtime.paths.stateDir)
    const repository = new SqliteReleasePolicyAuthorizationRepository(db)
    approve(repository, "approved")
    closeDb()

    const script = join(process.cwd(), "scripts", "release-package.mjs")
    const partial = spawnSync(
      process.execPath,
      [script, "--dry-run", "--rollout-policy-id", selector().policyId],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env } },
    )
    expect(partial.status).not.toBe(0)
    expect(partial.stderr).toContain(
      "requires --rollout-policy-id, --rollout-policy-version, and --rollout-policy-mode",
    )

    const invalidMode = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--rollout-policy-id",
        selector().policyId,
        "--rollout-policy-version",
        "1",
        "--rollout-policy-mode",
        "automatic",
      ],
      { cwd: process.cwd(), encoding: "utf8", env: { ...process.env } },
    )
    expect(invalidMode.status).not.toBe(0)
    expect(invalidMode.stderr).toContain("must be limited_beta or full_enable")

    const outputDir = join(root, "release-output")
    const selected = spawnSync(
      process.execPath,
      [
        script,
        "--dry-run",
        "--json",
        "--no-copy",
        "--output-dir",
        outputDir,
        "--rollout-policy-id",
        selector().policyId,
        "--rollout-policy-version",
        String(selector().policyVersion),
        "--rollout-policy-mode",
        selector().releaseMode,
        "--rollout-database",
        runtime.paths.dbFile,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, KNOWBEE_STATE_DIR: runtime.paths.stateDir },
      },
    )
    expect(selected.status, selected.stderr).toBe(0)
    const result = JSON.parse(selected.stdout) as {
      manifest: { subAgentReleaseGate: { checks: Array<{ id: string; status: string }> } }
    }
    expect(result.manifest.subAgentReleaseGate.checks).toContainEqual(
      expect.objectContaining({ id: "benchmark_threshold", status: "passed" }),
    )
  })
})
