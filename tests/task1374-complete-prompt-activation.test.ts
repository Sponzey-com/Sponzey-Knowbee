import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeCompletePromptActivation,
  authorizePreActivationTests,
  publishCompletePromptActivation,
  type PreActivationTestReceipt,
  type PromptRollbackEvidenceDecision,
} from "../packages/core/src/contracts/complete-prompt-activation.ts"
import { authorizePromptActivationEvidence } from "../packages/core/src/contracts/prompt-activation-evidence.ts"

const source = { sourceRef: "prompt:identity", sourceVersion: "v2", sourceChecksum: "sha:v2" }

function activation() {
  return authorizePromptActivationEvidence({
    receipt: {
      activationId: "activation:1374", ...source, sourceWrittenAt: 100, activatedAt: 300, issuedAt: 310, expiresAt: 500,
      loader: { kind: "process", loaderId: "gateway:123", runtimeId: "runtime:gateway", runtimeSnapshotId: "runtime:new", evidenceRef: "loader:1374" },
      methodEvidence: { method: "reload", reloadReceiptId: "reload:1374", runtimeSnapshotId: "runtime:new", evidenceRef: "reload:evidence" },
    },
    expectedRuntimeId: "runtime:gateway", expectedRuntimeSnapshotId: "runtime:new", now: 400,
  })
}

function testReceipt(testId: string, overrides: Partial<PreActivationTestReceipt> = {}): PreActivationTestReceipt {
  return { testId, status: "passed", ...source, executedAt: 200, evidenceRef: `test:${testId}`, ...overrides }
}

function tests(receipts = [testReceipt("prompt-regression"), testReceipt("identity-regression")]) {
  return authorizePreActivationTests({
    requiredTestIds: ["prompt-regression", "identity-regression"], receipts, ...source, sourceWrittenAt: 100, activatedAt: 300,
  })
}

const rollback: PromptRollbackEvidenceDecision = {
  status: "authorized", sourceRef: source.sourceRef, targetVersion: "v1", targetChecksum: "sha:v1",
  rollbackSourceRef: "git:abc1234", verificationRef: "rollback:verified:1374",
}

describe("task1374 complete prompt activation", () => {
  it("publishes a complete activation with version, loader, timestamp, method, tests, and rollback", async () => {
    const publish = vi.fn(async () => "complete")
    const decision = authorizeCompletePromptActivation({ activation: activation(), tests: tests(), rollback })
    await expect(publishCompletePromptActivation({ decision, publish })).resolves.toEqual({ status: "published", result: "complete" })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      sourceVersion: "v2", loaderId: "gateway:123", activatedAt: 300, method: "reload",
      testIds: ["prompt-regression", "identity-regression"], rollbackSourceRef: "git:abc1234",
    }))
  })

  it.each(["prompt-regression", "identity-regression"])("requires passed pre-activation test %s for the exact source lineage", (testId) => {
    expect(tests([testReceipt("prompt-regression"), testReceipt("identity-regression")].filter((receipt) => receipt.testId !== testId)))
      .toEqual({ status: "blocked", reasonCode: "activation_test_missing" })
    expect(tests([testReceipt("prompt-regression"), testReceipt("identity-regression")].map((receipt) => receipt.testId === testId ? { ...receipt, status: "failed" } : receipt)))
      .toEqual({ status: "blocked", reasonCode: "activation_test_failed" })
    expect(tests([testReceipt("prompt-regression"), testReceipt("identity-regression")].map((receipt) => receipt.testId === testId ? { ...receipt, sourceVersion: "v1" } : receipt)))
      .toEqual({ status: "blocked", reasonCode: "activation_test_lineage_mismatch" })
  })

  it("requires tests after source write and before activation", () => {
    expect(tests([testReceipt("prompt-regression", { executedAt: 99 }), testReceipt("identity-regression")]))
      .toEqual({ status: "blocked", reasonCode: "activation_test_time_invalid" })
    expect(tests([testReceipt("prompt-regression", { executedAt: 300 }), testReceipt("identity-regression")]))
      .toEqual({ status: "blocked", reasonCode: "activation_test_time_invalid" })
  })

  it("blocks missing rollback evidence and same-version rollback targets before publish", async () => {
    const publish = vi.fn()
    const blockedRollback = authorizeCompletePromptActivation({ activation: activation(), tests: tests(), rollback: { status: "blocked", reasonCode: "rollback_source_invalid" } })
    expect(blockedRollback).toEqual({ status: "blocked", reasonCode: "rollback_evidence_blocked" })
    await publishCompletePromptActivation({ decision: blockedRollback, publish })
    const sameVersion = authorizeCompletePromptActivation({ activation: activation(), tests: tests(), rollback: { ...rollback, targetVersion: "v2" } })
    expect(sameVersion).toEqual({ status: "blocked", reasonCode: "rollback_target_invalid" })
    expect(publish).not.toHaveBeenCalled()
  })

  it.each(["activation", "tests", "rollback"] as const)("blocks complete record when %s evidence is blocked", (part) => {
    const input = { activation: activation(), tests: tests(), rollback }
    if (part === "activation") input.activation = { status: "blocked", reasonCode: "activation_identity_invalid" }
    if (part === "tests") input.tests = { status: "blocked", reasonCode: "activation_test_missing" }
    if (part === "rollback") input.rollback = { status: "blocked", reasonCode: "rollback_missing" }
    const expectedReason = {
      activation: "activation_evidence_blocked",
      tests: "activation_tests_blocked",
      rollback: "rollback_evidence_blocked",
    } as const
    expect(authorizeCompletePromptActivation(input)).toEqual({
      status: "blocked",
      reasonCode: expectedReason[part],
    })
  })

  it("uses only injected activation, test, and rollback decisions", () => {
    const text = readFileSync(new URL("../packages/core/src/contracts/complete-prompt-activation.ts", import.meta.url), "utf8")
    expect(text).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
