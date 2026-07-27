import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizePromptRollbackReport,
  publishAuthorizedPromptRollbackReport,
} from "../packages/core/src/contracts/prompt-rollback-report.ts"
import {
  appendAuthorizedPromptImprovementAuditRecord,
  authorizePromptImprovementAuditRecord,
  type PromptImprovementAuditRecord,
} from "../packages/core/src/memory/prompt-improvement-harness.ts"
import type { PromptRollbackRestorationReceipt } from "../packages/core/src/contracts/prompt-rollback-execution.ts"

const restoration: PromptRollbackRestorationReceipt = {
  sourceRef: "prompt:identity", restoredVersion: "v1", restoredChecksum: "sha:v1",
  triggerKind: "tests_failed_after_write", triggerEvidenceRef: "trigger:1379",
  readinessEvidenceRef: "ready:1379", executionRef: "execute:1379", verificationRef: "verify:1379",
}

function audit(overrides: Partial<PromptImprovementAuditRecord> = {}): PromptImprovementAuditRecord {
  return {
    runId: "improvement:1379", startedAt: 100, finishedAt: 200, actor: "마당쇠",
    triggerSource: "user_request", state: "rolled_back",
    targetPromptSources: ["prompt:identity"], changedPromptSources: ["prompt:identity"],
    improvementGoal: "Improve identity response.", behaviorBefore: "Old behavior.", behaviorAfter: "Proposed behavior.",
    riskLevel: "high",
    approvalRecord: {
      mode: "admin_required", required: true, granted: true, approvedBy: "admin:owner",
      approvedAt: "2026-07-15T00:00:00.000Z", approvalScope: ["apply_change"],
      targetPromptSources: ["prompt:identity"], targetHarnessSources: [], riskAccepted: "high",
    },
    testsRequested: ["identity-regression"], testsPassed: [], testsFailed: ["identity-regression"],
    activationState: "rolled_back", rollbackState: "rolled_back", summary: "Restored identity v1.",
    ...overrides,
  }
}

describe("task1379 rollback report and recursive improvement audit", () => {
  it("authorizes all required rollback report facts from verified restoration lineage", () => {
    expect(authorizePromptRollbackReport({
      restoration,
      rolledBackFiles: ["prompt:identity"], reason: "tests_failed_after_write",
      activationStateAfterRollback: "rolled_back",
      remainingRisk: "Runtime reload confirmation remains pending.",
      nextRecommendedAction: "Reload and verify identity v1.",
    })).toEqual({
      status: "authorized", rolledBackFiles: ["prompt:identity"], reason: "tests_failed_after_write",
      restoredChecksum: "sha:v1", activationStateAfterRollback: "rolled_back",
      remainingRisk: "Runtime reload confirmation remains pending.",
      nextRecommendedAction: "Reload and verify identity v1.",
      evidenceRefs: ["trigger:1379", "ready:1379", "execute:1379", "verify:1379"],
    })
  })

  it.each([
    [{ rolledBackFiles: [] }, "rolled_back_files_missing"],
    [{ reason: "" }, "rollback_reason_missing"],
    [{ remainingRisk: "" }, "remaining_risk_missing"],
    [{ nextRecommendedAction: "" }, "next_action_missing"],
    [{ rolledBackFiles: ["prompt:other"] }, "rollback_report_lineage_mismatch"],
  ] as const)("blocks incomplete rollback report %#", (override, reasonCode) => {
    expect(authorizePromptRollbackReport({
      restoration, rolledBackFiles: ["prompt:identity"], reason: "tests_failed_after_write",
      activationStateAfterRollback: "rolled_back", remainingRisk: "risk", nextRecommendedAction: "verify",
      ...override,
    })).toEqual({ status: "blocked", reasonCode })
  })

  it("publishes rollback facts only through the injected LLM report adapter", async () => {
    const renderWithLlm = vi.fn(async () => "롤백 완료")
    const blocked = authorizePromptRollbackReport({
      restoration, rolledBackFiles: [], reason: "tests_failed_after_write",
      activationStateAfterRollback: "rolled_back", remainingRisk: "risk", nextRecommendedAction: "verify",
    })
    await expect(publishAuthorizedPromptRollbackReport({ decision: blocked, renderWithLlm })).resolves.toEqual(blocked)
    expect(renderWithLlm).not.toHaveBeenCalled()
  })

  it("authorizes and appends a complete recursive-improvement audit record", async () => {
    const append = vi.fn(async () => "audit:stored")
    const decision = authorizePromptImprovementAuditRecord(audit())
    expect(decision).toMatchObject({ status: "authorized", record: { runId: "improvement:1379" } })
    await expect(appendAuthorizedPromptImprovementAuditRecord({ decision, append }))
      .resolves.toEqual({ status: "appended", result: "audit:stored" })
    expect(append).toHaveBeenCalledTimes(1)
  })

  it.each([
    [{ runId: "" }, "audit_identity_invalid"],
    [{ finishedAt: 99 }, "audit_timestamp_invalid"],
    [{ changedPromptSources: ["prompt:other"] }, "audit_source_lineage_invalid"],
    [{ testsPassed: ["unrequested-test"] }, "audit_test_lineage_invalid"],
    [{ state: "rolled_back", activationState: "activated" }, "audit_state_inconsistent"],
    [{ summary: "" }, "audit_summary_missing"],
  ] as const)("blocks incomplete or inconsistent audit %#", async (override, reasonCode) => {
    const append = vi.fn()
    const decision = authorizePromptImprovementAuditRecord(audit(override as Partial<PromptImprovementAuditRecord>))
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await appendAuthorizedPromptImprovementAuditRecord({ decision, append })
    expect(append).not.toHaveBeenCalled()
  })

  it("uses explicit records and injected ports only", () => {
    for (const path of [
      "../packages/core/src/contracts/prompt-rollback-report.ts",
      "../packages/core/src/memory/prompt-improvement-harness.ts",
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8")
      if (path.includes("prompt-rollback-report")) expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
    }
  })
})
