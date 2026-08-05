import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  HIGH_RISK_IMPROVEMENT_CHECKS,
  authorizeHighRiskImprovementVerification,
  executeVerifiedHighRiskImprovement,
  type HighRiskCheckReceipt,
  type HighRiskLogBoundaryReceipt,
} from "../packages/core/src/contracts/high-risk-improvement-verification.ts"

const changeId = "change:prompt:1358"

function checks(): HighRiskCheckReceipt[] {
  return HIGH_RISK_IMPROVEMENT_CHECKS.map((check) => ({ changeId, check, status: "passed", evidenceRef: `test:${check}` }))
}

function logs(): HighRiskLogBoundaryReceipt[] {
  return [
    { changeId, purpose: "product", visibility: "production_default", containsInternalDiagnostics: false, containsUserSafeSummary: true, evidenceRef: "log:product" },
    { changeId, purpose: "field_debug", visibility: "field_opt_in", containsInternalDiagnostics: true, containsUserSafeSummary: false, evidenceRef: "log:field" },
    { changeId, purpose: "development", visibility: "development_only", containsInternalDiagnostics: true, containsUserSafeSummary: false, evidenceRef: "log:development" },
  ]
}

function decision(overrides: Partial<Parameters<typeof authorizeHighRiskImprovementVerification>[0]> = {}) {
  return authorizeHighRiskImprovementVerification({
    changeId,
    kind: "harness",
    checks: checks(),
    rollback: {
      changeId,
      sourceRef: "prompts/prompt_improvement.md",
      baselineChecksum: "aaaaaaaa",
      changedChecksum: "bbbbbbbb",
      restoredChecksum: "aaaaaaaa",
      rollbackEvidenceRef: "test:rollback",
    },
    logs: logs(),
    ...overrides,
  })
}

describe("task1358 high-risk improvement verification", () => {
  it("authorizes and applies a complete harness high-risk verification bundle", async () => {
    const apply = vi.fn(async () => "activated")
    await expect(executeVerifiedHighRiskImprovement({ decision: decision(), apply }))
      .resolves.toEqual({ status: "applied", result: "activated" })
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ risk: "high", checks: HIGH_RISK_IMPROVEMENT_CHECKS }))
  })

  it.each(HIGH_RISK_IMPROVEMENT_CHECKS)("blocks missing required harness check %s", async (check) => {
    const apply = vi.fn()
    const denied = decision({ checks: checks().filter((receipt) => receipt.check !== check) })
    expect(denied).toEqual({ status: "blocked", reasonCode: "check_missing", check })
    await executeVerifiedHighRiskImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(HIGH_RISK_IMPROVEMENT_CHECKS)("blocks failed required harness check %s", async (check) => {
    const apply = vi.fn()
    const denied = decision({ checks: checks().map((receipt) => receipt.check === check ? { ...receipt, status: "failed" } : receipt) })
    expect(denied).toEqual({ status: "blocked", reasonCode: "check_failed", check })
    await executeVerifiedHighRiskImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("requires harness regression only for harness changes", () => {
    expect(decision({ kind: "prompt_source", checks: checks().filter((receipt) => receipt.check !== "harness_regression_suite") }))
      .toMatchObject({ status: "authorized", checks: expect.not.arrayContaining(["harness_regression_suite"]) })
  })

  it.each([
    { baselineChecksum: "aaaaaaaa", changedChecksum: "aaaaaaaa", restoredChecksum: "aaaaaaaa" },
    { baselineChecksum: "aaaaaaaa", changedChecksum: "bbbbbbbb", restoredChecksum: "cccccccc" },
    { baselineChecksum: "invalid", changedChecksum: "bbbbbbbb", restoredChecksum: "invalid" },
  ])("blocks invalid rollback checksum proof: %s", async (checksumOverride) => {
    const apply = vi.fn()
    const denied = decision({ rollback: { changeId, sourceRef: "prompts/prompt_improvement.md", rollbackEvidenceRef: "test:rollback", ...checksumOverride } })
    expect(denied).toEqual({ status: "blocked", reasonCode: "rollback_checksum_invalid" })
    await executeVerifiedHighRiskImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each([
    ["product", { visibility: "field_opt_in" }],
    ["product", { containsInternalDiagnostics: true }],
    ["field_debug", { visibility: "production_default" }],
    ["development", { visibility: "production_default" }],
  ] as const)("blocks invalid %s log boundary", async (purpose, override) => {
    const apply = vi.fn()
    const denied = decision({ logs: logs().map((receipt) => receipt.purpose === purpose ? { ...receipt, ...override } : receipt) })
    expect(denied).toEqual({ status: "blocked", reasonCode: "log_boundary_invalid", purpose })
    await executeVerifiedHighRiskImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(["product", "field_debug", "development"] as const)("requires log purpose %s", (purpose) => {
    expect(decision({ logs: logs().filter((receipt) => receipt.purpose !== purpose) }))
      .toEqual({ status: "blocked", reasonCode: "log_purpose_missing", purpose })
  })

  it("keeps verification independent from environment, files, and logger singleton", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/high-risk-improvement-verification.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|createLogger|logger\b|fetch\(|globalThis/u)
  })
})
