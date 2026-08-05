import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  HIGH_RISK_PERMISSION_CAPABILITIES,
  projectPromptActivation,
  publishConfirmedPromptActivation,
  verifyHighRiskSourceEvidence,
  type HighRiskPermissionGateReceipt,
  type PromptSourceChecksumReceipt,
} from "../packages/core/src/contracts/high-risk-source-activation-evidence.ts"
import type { NextRunPromptActivationDecision } from "../packages/core/src/contracts/platform-prompt-activation-boundary.ts"

const changeId = "change:1359"
const fingerprint = "sources:fingerprint:1359"
const sourceRefs = ["prompts/system.md", "prompts/tool_policy.md"]

function permissions(): HighRiskPermissionGateReceipt[] {
  return HIGH_RISK_PERMISSION_CAPABILITIES.map((capability) => ({
    changeId,
    capability,
    testPassed: true,
    policyPreserved: true,
    approvalRequired: capability !== "tool",
    approvalSatisfied: true,
    policyFingerprint: `policy:${capability}:v1`,
    evidenceRef: `test:${capability}`,
  }))
}

function checksums(): PromptSourceChecksumReceipt[] {
  return sourceRefs.map((sourceRef, index) => ({
    changeId,
    sourceRef,
    sourceSetFingerprint: fingerprint,
    baselineChecksum: `aaaaaaaaaaaaaaa${index}`,
    proposedChecksum: `bbbbbbbbbbbbbbb${index}`,
    evidenceRef: `test:checksum:${index}`,
  }))
}

function decision(overrides: Partial<Parameters<typeof verifyHighRiskSourceEvidence>[0]> = {}) {
  return verifyHighRiskSourceEvidence({
    changeId,
    expectedSourceRefs: sourceRefs,
    expectedSourceSetFingerprint: fingerprint,
    permissions: permissions(),
    checksums: checksums(),
    ...overrides,
  })
}

describe("task1359 high-risk source and activation evidence", () => {
  it("verifies all permission boundaries and exact changed source checksum lineage", () => {
    expect(decision()).toEqual({
      status: "verified",
      changeId,
      sourceSetFingerprint: fingerprint,
      permissionCapabilities: HIGH_RISK_PERMISSION_CAPABILITIES,
      sourceRefs,
    })
  })

  it.each(HIGH_RISK_PERMISSION_CAPABILITIES)("blocks missing permission receipt for %s", (capability) => {
    expect(decision({ permissions: permissions().filter((receipt) => receipt.capability !== capability) }))
      .toEqual({ status: "blocked", reasonCode: "permission_missing", capability })
  })

  it.each(HIGH_RISK_PERMISSION_CAPABILITIES)("blocks failed permission test for %s", (capability) => {
    expect(decision({ permissions: permissions().map((receipt) => receipt.capability === capability ? { ...receipt, testPassed: false } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "permission_test_failed", capability })
  })

  it.each(HIGH_RISK_PERMISSION_CAPABILITIES)("blocks weakened permission policy for %s", (capability) => {
    expect(decision({ permissions: permissions().map((receipt) => receipt.capability === capability ? { ...receipt, policyPreserved: false } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "permission_policy_weakened", capability })
  })

  it.each(HIGH_RISK_PERMISSION_CAPABILITIES.filter((capability) => capability !== "tool"))(
    "blocks unsatisfied approval for %s",
    (capability) => {
      expect(decision({ permissions: permissions().map((receipt) => receipt.capability === capability ? { ...receipt, approvalSatisfied: false } : receipt) }))
        .toEqual({ status: "blocked", reasonCode: "permission_approval_unsatisfied", capability })
    },
  )

  it("blocks missing, unchanged, and wrong-fingerprint checksum evidence", () => {
    expect(decision({ checksums: checksums().slice(0, 1) })).toEqual({ status: "blocked", reasonCode: "checksum_source_missing", sourceRef: sourceRefs[1] })
    expect(decision({ checksums: checksums().map((receipt, index) => index === 0 ? { ...receipt, proposedChecksum: receipt.baselineChecksum } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "checksum_unchanged", sourceRef: sourceRefs[0] })
    expect(decision({ checksums: checksums().map((receipt, index) => index === 0 ? { ...receipt, sourceSetFingerprint: "sources:other" } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "checksum_fingerprint_mismatch", sourceRef: sourceRefs[0] })
  })

  it("projects and publishes only a canonical authorized activation", async () => {
    const canonical: NextRunPromptActivationDecision = {
      status: "authorized",
      activation: { method: "restart", activationRunId: "run:next", nextRuntimeSnapshotFingerprint: "runtime:next" },
    }
    const projection = projectPromptActivation(canonical)
    expect(projection).toEqual({ status: "active", method: "restart", activationRunId: "run:next", runtimeSnapshotFingerprint: "runtime:next" })
    const publish = vi.fn(async () => "visible")
    await expect(publishConfirmedPromptActivation({ projection, publish })).resolves.toEqual({ status: "published", result: "visible" })
    expect(publish).toHaveBeenCalledOnce()
  })

  it.each(["source_application_unverified", "source_application_scope_mismatch", "regression_tests_missing", "current_run_mutation", "current_process_snapshot_mutation", "loaded_source_mismatch"] as const)(
    "keeps blocked activation %s pending and never publishes",
    async (reasonCode) => {
      const projection = projectPromptActivation({ status: "blocked", reasonCode })
      const publish = vi.fn()
      expect(projection).toEqual({ status: "pending", reasonCode })
      await expect(publishConfirmedPromptActivation({ projection, publish })).resolves.toEqual({ status: "pending", reasonCode })
      expect(publish).not.toHaveBeenCalled()
    },
  )

  it("uses only injected receipts and canonical activation decisions", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/high-risk-source-activation-evidence.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|createLogger|globalThis/u)
    expect(source).toContain('from "./platform-prompt-activation-boundary.js"')
  })
})
