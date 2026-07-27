import { describe, expect, it } from "vitest"
import {
  evaluatePromptImprovementRollbackRequirement,
  validatePromptImprovementRollbackSource,
  type PromptImprovementRollbackSource,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"

describe("task0769 prompt improvement rollback policy", () => {
  it("accepts allowed rollback source types with exact references", () => {
    const sources: PromptImprovementRollbackSource[] = [
      { sourceType: "source_control_revision", sourceRef: "git:abc1234" },
      { sourceType: "prompt_registry_version", sourceRef: "prompt-registry:final_response:v12" },
      { sourceType: "timestamped_backup_file", sourceRef: "backup:20260704T000000Z:final_response.md" },
      { sourceType: "reverse_patch", sourceRef: "patch:prompt-improvement:123" },
      { sourceType: "release_artifact_version", sourceRef: "release:v0.2.16" },
    ]

    for (const source of sources) {
      expect(validatePromptImprovementRollbackSource(source)).toEqual({
        ok: true,
        issues: [],
      })
    }
  })

  it("rejects rollback sources without an exact reference", () => {
    const result = validatePromptImprovementRollbackSource({
      sourceType: "timestamped_backup_file",
      sourceRef: "",
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "rollback_source_ref_missing",
      path: "sourceRef",
    }))
  })

  it.each([
    { sourceType: "source_control_revision", sourceRef: "git:HEAD" },
    { sourceType: "source_control_revision", sourceRef: "git:HEAD~1" },
    { sourceType: "prompt_registry_version", sourceRef: "prompt-registry:final_response:latest" },
    { sourceType: "timestamped_backup_file", sourceRef: "backup:latest:final_response.md" },
    { sourceType: "release_artifact_version", sourceRef: "release:current" },
  ] as const)("rejects mutable or broad rollback reference $sourceRef", (source) => {
    expect(validatePromptImprovementRollbackSource(source).issues).toContainEqual(expect.objectContaining({
      code: "rollback_source_ref_invalid",
      path: "sourceRef",
    }))
  })

  it("requires rollback for every GOAL 9.15 trigger after a source write", () => {
    const result = evaluatePromptImprovementRollbackRequirement({
      sourceWriteState: "written",
      testsFailed: ["tests/prompt-source-regression.test.ts"],
      invariantViolations: ["identity"],
      activationVersionMismatch: true,
      rollbackRequestedBy: "admin:operator",
      changedSourceHealth: "unsafe",
      rollbackSource: { sourceType: "source_control_revision", sourceRef: "git:abc1234" },
    })

    expect(result).toEqual({
      rollbackRequired: true,
      reasons: [
        "tests_failed_after_write",
        "invariant_violation_after_apply",
        "wrong_prompt_version_activated",
        "user_or_admin_requested",
        "changed_source_missing_corrupt_or_unsafe",
      ],
      rollbackSourceValid: true,
      issues: [],
      nextState: "rollback_required",
    })
  })

  it("does not require file rollback when no prompt source was written", () => {
    const result = evaluatePromptImprovementRollbackRequirement({
      sourceWriteState: "unchanged",
      testsFailed: ["tests/prompt-source-regression.test.ts"],
      invariantViolations: ["identity"],
      activationVersionMismatch: true,
      rollbackRequestedBy: "admin:operator",
      changedSourceHealth: "unsafe",
      rollbackSource: { sourceType: "source_control_revision", sourceRef: "git:abc1234" },
    })

    expect(result).toEqual({
      rollbackRequired: false,
      reasons: [],
      rollbackSourceValid: true,
      issues: [],
      nextState: "blocked",
    })
  })

  it("reports invalid rollback sources when rollback is required", () => {
    const result = evaluatePromptImprovementRollbackRequirement({
      sourceWriteState: "written",
      testsFailed: ["tests/prompt-source-regression.test.ts"],
      invariantViolations: [],
      activationVersionMismatch: false,
      rollbackRequestedBy: "",
      changedSourceHealth: "ok",
      rollbackSource: { sourceType: "timestamped_backup_file", sourceRef: "" },
    })

    expect(result.rollbackRequired).toBe(true)
    expect(result.rollbackSourceValid).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "rollback_source_ref_missing",
      path: "rollbackSource.sourceRef",
    }))
  })
})
