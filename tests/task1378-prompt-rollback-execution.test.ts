import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_ROLLBACK_TRIGGER_KINDS,
  authorizePromptRollbackTrigger,
  executeAuthorizedPromptRollback,
  type PromptRollbackTriggerReceipt,
} from "../packages/core/src/contracts/prompt-rollback-execution.ts"
import { authorizePromptChangeRollbackReadiness } from "../packages/core/src/contracts/prompt-change-rollback-readiness.ts"

const change = {
  sourceRef: "prompt:identity", proposedVersion: "v2", proposedChecksum: "sha:v2",
  baselineVersion: "v1", baselineChecksum: "sha:v1",
}
const sourceWrittenAt = 100
const base = { sourceRef: change.sourceRef, sourceVersion: "v2", sourceChecksum: "sha:v2", observedAt: 120, evidenceRef: "trigger:1378" }

const receipts: Record<typeof PROMPT_ROLLBACK_TRIGGER_KINDS[number], PromptRollbackTriggerReceipt> = {
  tests_failed_after_write: { ...base, kind: "tests_failed_after_write", failedTestIds: ["identity-regression"] },
  invariant_violation_after_apply: { ...base, kind: "invariant_violation_after_apply", invariantIds: ["identity"] },
  wrong_prompt_version_activated: { ...base, kind: "wrong_prompt_version_activated", expectedVersion: "v2", loadedVersion: "v3" },
  user_or_admin_requested: { ...base, kind: "user_or_admin_requested", requestedByType: "user", requestedByRef: "user:request" },
  changed_source_missing_corrupt_or_unsafe: { ...base, kind: "changed_source_missing_corrupt_or_unsafe", health: "unsafe" },
}

const readiness = authorizePromptChangeRollbackReadiness({
  change,
  rollback: {
    sourceType: "source_control_revision", sourceRef: "git:abc1234",
    targetSourceRef: change.sourceRef, targetBaselineVersion: "v1", targetBaselineChecksum: "sha:v1",
    executorId: "rollback-adapter:git", verificationMethod: "checksum_compare", evidenceRef: "ready:1378",
  },
})

describe("task1378 prompt rollback trigger and execution", () => {
  it.each(PROMPT_ROLLBACK_TRIGGER_KINDS)("authorizes exact post-write rollback trigger %s", (kind) => {
    expect(authorizePromptRollbackTrigger({ change, sourceWrittenAt, receipt: receipts[kind] })).toEqual({
      status: "authorized", kind, sourceRef: change.sourceRef, sourceVersion: "v2",
      observedAt: 120, evidenceRef: "trigger:1378",
    })
  })

  it("rejects missing trigger-specific evidence", () => {
    expect(authorizePromptRollbackTrigger({
      change, sourceWrittenAt,
      receipt: { ...receipts.tests_failed_after_write, failedTestIds: [] },
    })).toEqual({ status: "blocked", reasonCode: "rollback_trigger_evidence_invalid" })
  })

  it.each([
    [{ sourceWrittenAt: 0 }, "source_write_missing"],
    [{ receipt: { ...receipts.tests_failed_after_write, sourceRef: "prompt:other" } }, "rollback_trigger_lineage_mismatch"],
    [{ receipt: { ...receipts.tests_failed_after_write, observedAt: 99 } }, "rollback_trigger_time_invalid"],
  ] as const)("rejects invalid trigger context %#", (override, reasonCode) => {
    expect(authorizePromptRollbackTrigger({ change, sourceWrittenAt, receipt: receipts.tests_failed_after_write, ...override }))
      .toEqual({ status: "blocked", reasonCode })
  })

  it("returns rolled_back only after execution and exact restoration verification", async () => {
    const trigger = authorizePromptRollbackTrigger({ change, sourceWrittenAt, receipt: receipts.tests_failed_after_write })
    const execute = vi.fn(async () => ({ status: "restored" as const, sourceRef: change.sourceRef, version: "v1", checksum: "sha:v1", executionRef: "exec:1378" }))
    const verify = vi.fn(async () => ({ verified: true, verificationRef: "verify:1378" }))
    const complete = vi.fn(async () => "recorded")
    await expect(executeAuthorizedPromptRollback({ trigger, readiness, execute, verify, complete }))
      .resolves.toMatchObject({ status: "rolled_back", result: "recorded", restoredVersion: "v1", restoredChecksum: "sha:v1" })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(complete).toHaveBeenCalledTimes(1)
  })

  it.each(["execution_failed", "restored_lineage_mismatch", "restoration_verification_failed"] as const)(
    "does not complete rollback on %s",
    async (failure) => {
      const trigger = authorizePromptRollbackTrigger({ change, sourceWrittenAt, receipt: receipts.tests_failed_after_write })
      const execute = vi.fn(async () => failure === "execution_failed"
        ? { status: "failed" as const, reasonRef: "exec:failed" }
        : { status: "restored" as const, sourceRef: change.sourceRef, version: failure === "restored_lineage_mismatch" ? "v0" : "v1", checksum: "sha:v1", executionRef: "exec:1378" })
      const verify = vi.fn(async () => ({ verified: failure !== "restoration_verification_failed", verificationRef: "verify:1378" }))
      const complete = vi.fn()
      await expect(executeAuthorizedPromptRollback({ trigger, readiness, execute, verify, complete }))
        .resolves.toEqual({ status: "blocked", reasonCode: failure })
      expect(complete).not.toHaveBeenCalled()
    },
  )

  it("does not read hidden runtime state", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/prompt-rollback-execution.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
