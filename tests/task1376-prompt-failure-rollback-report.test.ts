import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizePromptUpdateReport,
  publishAuthorizedPromptUpdateReport,
  type PromptRollbackCompletionReceipt,
  type PromptSourceValidationFailureReceipt,
  type PromptSourceWriteReceipt,
} from "../packages/core/src/contracts/prompt-update-report-boundary.ts"
import type { CompletePromptActivationDecision } from "../packages/core/src/contracts/complete-prompt-activation.ts"

const write: PromptSourceWriteReceipt = {
  sourceRef: "prompt:identity", sourceVersion: "v2", sourceChecksum: "sha:v2",
  writtenAt: 100, evidenceRef: "write:1376",
}
const failure: PromptSourceValidationFailureReceipt = {
  sourceRef: write.sourceRef, proposedVersion: write.sourceVersion,
  failedCheckIds: ["identity-regression"], failedAt: 120,
  evidenceRefs: ["test:identity-regression:failed"],
}
const rollback: PromptRollbackCompletionReceipt = {
  sourceRef: write.sourceRef, rolledBackFromVersion: "v2", rolledBackFromChecksum: "sha:v2",
  restoredVersion: "v1", restoredChecksum: "sha:v1", rolledBackAt: 150,
  rollbackSourceRef: "git:abc1234", verificationRef: "restore:verified:1376",
}
const activation: CompletePromptActivationDecision = {
  status: "authorized", activationId: "activation:1376", sourceRef: write.sourceRef,
  sourceVersion: write.sourceVersion, loaderId: "gateway:123", activatedAt: 130,
  method: "reload", testIds: ["identity-regression"], rollbackSourceRef: "git:abc1234",
  evidenceRefs: ["activation:1376"],
}

describe("task1376 prompt validation-failure and rollback reporting", () => {
  it("authorizes a validation-failed and not-activated fact from exact failed checks", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_update_validation_failed", validationFailure: failure }))
      .toEqual({
        status: "authorized", claimCode: "source_update_validation_failed",
        sourceRef: write.sourceRef, proposedVersion: "v2", activeNow: false,
        failedCheckIds: ["identity-regression"], evidenceRefs: ["test:identity-regression:failed"],
      })
  })

  it("rejects invalid validation failure evidence and any activated failure claim", () => {
    expect(authorizePromptUpdateReport({
      requestedClaim: "source_update_validation_failed",
      validationFailure: { ...failure, failedCheckIds: [] },
    })).toEqual({ status: "blocked", reasonCode: "validation_failure_evidence_invalid" })
    expect(authorizePromptUpdateReport({
      requestedClaim: "source_update_validation_failed", validationFailure: failure, activation,
    })).toEqual({ status: "blocked", reasonCode: "report_state_mismatch" })
  })

  it("authorizes a verified rollback to an earlier baseline", () => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_rolled_back_to_baseline", write, rollback }))
      .toEqual({
        status: "authorized", claimCode: "source_rolled_back_to_baseline",
        sourceRef: write.sourceRef, rolledBackFromVersion: "v2", restoredVersion: "v1",
        restoredChecksum: "sha:v1", activeNow: false, rollbackSourceRef: "git:abc1234",
        evidenceRefs: ["write:1376", "restore:verified:1376"],
      })
  })

  it.each([
    [{ ...rollback, restoredVersion: "v2" }, "rollback_target_invalid"],
    [{ ...rollback, sourceRef: "prompt:other" }, "rollback_lineage_mismatch"],
    [{ ...rollback, rolledBackAt: 99 }, "rollback_time_invalid"],
    [{ ...rollback, verificationRef: "" }, "rollback_evidence_invalid"],
  ] as const)("rejects invalid rollback completion %#", (receipt, reasonCode) => {
    expect(authorizePromptUpdateReport({ requestedClaim: "source_rolled_back_to_baseline", write, rollback: receipt }))
      .toEqual({ status: "blocked", reasonCode })
  })

  it("keeps blocked failure and rollback facts away from the LLM report adapter", async () => {
    const renderWithLlm = vi.fn(async () => "보고")
    const blocked = authorizePromptUpdateReport({ requestedClaim: "source_rolled_back_to_baseline", write })
    await expect(publishAuthorizedPromptUpdateReport({ decision: blocked, renderWithLlm })).resolves.toEqual(blocked)
    expect(renderWithLlm).not.toHaveBeenCalled()
  })

  it("keeps failure facts in prompt improvement and user wording in final response", () => {
    const improvement = readFileSync(new URL("../prompts/prompt_improvement.md", import.meta.url), "utf8")
    const finalResponse = readFileSync(new URL("../prompts/final_response.md", import.meta.url), "utf8")
    expect(improvement).toContain("Emit `source_update_validation_failed` only from explicit failed validation receipts")
    expect(improvement).toContain("Emit `source_rolled_back_to_baseline` only from verified restoration evidence")
    expect(finalResponse).toContain("Render `source_update_validation_failed` as a concise statement")
    expect(finalResponse).toContain("Render `source_rolled_back_to_baseline` as a concise statement")
  })
})
