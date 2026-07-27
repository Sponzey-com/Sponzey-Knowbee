import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_ROLLBACK_SOURCE_MANIFEST,
  authorizePromptChangeRollbackReadiness,
  type PromptChangeRollbackReadinessDecision,
} from "../packages/core/src/contracts/prompt-change-rollback-readiness.ts"
import {
  applyPromptImprovementWithPrerequisites,
  authorizePromptImprovementApplyPrerequisites,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

const change = {
  sourceRef: "prompt:final_response",
  proposedVersion: "v2",
  proposedChecksum: "sha:v2",
  baselineVersion: "v1",
  baselineChecksum: "sha:v1",
}

function readiness(overrides: Record<string, unknown> = {}): PromptChangeRollbackReadinessDecision {
  return authorizePromptChangeRollbackReadiness({
    change,
    rollback: {
      sourceType: "source_control_revision",
      sourceRef: "git:abc1234",
      targetSourceRef: change.sourceRef,
      targetBaselineVersion: change.baselineVersion,
      targetBaselineChecksum: change.baselineChecksum,
      executorId: "rollback-adapter:git",
      verificationMethod: "checksum_compare",
      evidenceRef: "rollback-ready:1377",
      ...overrides,
    },
  })
}

function prerequisite() {
  return authorizePromptImprovementApplyPrerequisites({
    risk: "low", tests: ["prompt-regression"], rollbackTarget: "git:abc1234",
    rollbackVerified: true, approvalMode: "none", approvalGranted: false,
  })
}

describe("task1377 prompt change rollback readiness", () => {
  it.each(PROMPT_ROLLBACK_SOURCE_MANIFEST)("authorizes immutable $sourceType rollback source", (entry) => {
    expect(readiness({ sourceType: entry.sourceType, sourceRef: entry.example })).toMatchObject({
      status: "authorized",
      sourceType: entry.sourceType,
      sourceRef: entry.example,
      targetSourceRef: change.sourceRef,
      baselineVersion: "v1",
      verificationMethod: "checksum_compare",
    })
  })

  it.each([
    ["source_control_revision", "git:HEAD"],
    ["source_control_revision", "git:main"],
    ["prompt_registry_version", "prompt-registry:final_response:latest"],
    ["timestamped_backup_file", "backup:latest:final_response.md"],
    ["reverse_patch", "patch:*"],
    ["release_artifact_version", "release:current"],
  ] as const)("rejects mutable or broad %s rollback reference %s", (sourceType, sourceRef) => {
    expect(readiness({ sourceType, sourceRef })).toEqual({
      status: "blocked", reasonCode: "rollback_source_invalid",
    })
  })

  it.each([
    [{ targetSourceRef: "prompt:identity" }, "rollback_lineage_mismatch"],
    [{ targetBaselineVersion: "v2" }, "rollback_baseline_invalid"],
    [{ targetBaselineChecksum: "sha:v2" }, "rollback_baseline_invalid"],
    [{ executorId: "" }, "rollback_executor_missing"],
    [{ verificationMethod: "" }, "rollback_verification_missing"],
    [{ evidenceRef: "" }, "rollback_evidence_missing"],
  ] as const)("blocks incomplete rollback readiness %#", (overrides, reasonCode) => {
    expect(readiness(overrides)).toEqual({ status: "blocked", reasonCode })
  })

  it("allows apply only when prerequisites and rollback readiness are both authorized", async () => {
    const apply = vi.fn(async () => "written")
    await expect(applyPromptImprovementWithPrerequisites({
      decision: prerequisite(), rollbackReadiness: readiness({ executorId: "" }), apply,
    })).resolves.toEqual({ status: "blocked", reasonCode: "apply_rollback_readiness_missing" })
    expect(apply).not.toHaveBeenCalled()

    await expect(applyPromptImprovementWithPrerequisites({
      decision: prerequisite(), rollbackReadiness: readiness(), apply,
    })).resolves.toEqual({ status: "applied", result: "written" })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it("uses explicit decisions without environment, filesystem, or network lookup", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-change-rollback-readiness.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
