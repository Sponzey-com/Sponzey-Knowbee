import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  HARNESS_APPROVAL_SCOPES,
  authorizeHarnessApprovalScope,
  authorizeHarnessImprovementEntry,
  enterAuthorizedHarnessImprovement,
  executeApprovedHarnessScope,
  type HarnessApprovalScope,
  type HarnessImprovementEntryReceipt,
  type HarnessScopedApprovalReceipt,
} from "../packages/core/src/contracts/harness-entry-approval-scope.ts"

const now = Date.UTC(2026, 6, 15, 3)
const proposal = "proposal:harness:1361"
const sourceSet = "sources:harness:1361"

function entry(requesterType: HarnessImprovementEntryReceipt["requesterType"] = "user"): HarnessImprovementEntryReceipt {
  return {
    requestId: "request:harness:1361",
    requesterId: `${requesterType}:owner`,
    requesterType,
    explicitRequest: true,
    classifiedBy: "llm",
    classification: "explicit_harness_improvement",
    diagnosedAction: "enter_harness_improvement",
    targetHarnessSourceRefs: ["packages/core/src/memory/prompt-improvement-harness.ts#state-machine"],
    diagnosedAt: now - 100,
    expiresAt: now + 100,
  }
}

function approval(scope: HarnessApprovalScope): HarnessScopedApprovalReceipt {
  return {
    approvalId: `approval:${scope}:1361`,
    scope,
    decision: "approved",
    approvedBy: "user:owner",
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    ...(scope === "activation" ? { appliedChecksum: "aaaaaaaa", runtimeTargetFingerprint: "runtime:next" } : {}),
    issuedAt: now - 100,
    expiresAt: now + 100,
  }
}

function scoped(requiredScope: HarnessApprovalScope, receipt = approval(requiredScope)) {
  return authorizeHarnessApprovalScope({
    requiredScope,
    receipt,
    expectedProposalFingerprint: proposal,
    expectedSourceSetFingerprint: sourceSet,
    ...(requiredScope === "activation" ? { expectedAppliedChecksum: "aaaaaaaa", expectedRuntimeTargetFingerprint: "runtime:next" } : {}),
    now,
  })
}

describe("task1361 harness entry and approval scope", () => {
  it.each(["user", "administrator"] as const)("enters only from an explicit LLM-diagnosed %s request", async (requesterType) => {
    const decision = authorizeHarnessImprovementEntry({ receipt: entry(requesterType), now })
    const enter = vi.fn(async () => "entered")
    await expect(enterAuthorizedHarnessImprovement({ decision, enter })).resolves.toEqual({ status: "entered", result: "entered" })
    expect(enter).toHaveBeenCalledWith(expect.objectContaining({ scope: "entry", targetHarnessSourceRefs: expect.any(Array) }))
  })

  it.each([
    [{ explicitRequest: false }, "explicit_request_required"],
    [{ classification: "ambiguous", diagnosedAction: "ask_clarification" }, "explicit_request_required"],
    [{ classification: "casual_chat", diagnosedAction: "ordinary_request" }, "explicit_request_required"],
    [{ classification: "ordinary_task", diagnosedAction: "ordinary_request" }, "explicit_request_required"],
    [{ requesterType: "agent", requesterId: "agent:self" }, "requester_not_authorized"],
    [{ targetHarnessSourceRefs: [] }, "entry_target_required"],
  ] as const)("blocks implicit or invalid harness entry: %s", async (override, reasonCode) => {
    const enter = vi.fn()
    const decision = authorizeHarnessImprovementEntry({ receipt: { ...entry(), ...override } as HarnessImprovementEntryReceipt, now })
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await enterAuthorizedHarnessImprovement({ decision, enter })
    expect(enter).not.toHaveBeenCalled()
  })

  it.each(HARNESS_APPROVAL_SCOPES)("authorizes exact isolated approval scope %s", (scope) => {
    expect(scoped(scope)).toMatchObject({ status: "authorized", scope, proposalFingerprint: proposal, sourceSetFingerprint: sourceSet })
  })

  it.each(HARNESS_APPROVAL_SCOPES.flatMap((actual) => HARNESS_APPROVAL_SCOPES
    .filter((required) => required !== actual)
    .map((required) => [required, actual] as const)))("does not reuse %s requirement with %s approval", async (required, actual) => {
      const execute = vi.fn()
      const decision = scoped(required, approval(actual))
      expect(decision).toEqual({ status: "blocked", reasonCode: "approval_scope_mismatch" })
      await executeApprovedHarnessScope({ requiredScope: required, decision, execute })
      expect(execute).not.toHaveBeenCalled()
    })

  it.each(["entry", "draft_review", "apply"] as const)("never activates from %s approval", async (scope) => {
    const activate = vi.fn()
    const decision = scoped("activation", approval(scope))
    await executeApprovedHarnessScope({ requiredScope: "activation", decision, execute: activate })
    expect(decision).toEqual({ status: "blocked", reasonCode: "approval_scope_mismatch" })
    expect(activate).not.toHaveBeenCalled()
  })

  it("requires exact applied checksum and runtime target for activation", () => {
    expect(scoped("activation", { ...approval("activation"), appliedChecksum: undefined }))
      .toEqual({ status: "blocked", reasonCode: "activation_lineage_missing" })
    expect(scoped("activation", { ...approval("activation"), runtimeTargetFingerprint: "runtime:other" }))
      .toEqual({ status: "blocked", reasonCode: "activation_lineage_mismatch" })
  })

  it("blocks denied, expired, proposal-mismatched, and source-mismatched approval", () => {
    expect(scoped("apply", { ...approval("apply"), decision: "denied" })).toEqual({ status: "blocked", reasonCode: "approval_denied" })
    expect(scoped("apply", { ...approval("apply"), expiresAt: now })).toEqual({ status: "blocked", reasonCode: "approval_expired" })
    expect(scoped("apply", { ...approval("apply"), proposalFingerprint: "proposal:other" })).toEqual({ status: "blocked", reasonCode: "approval_proposal_mismatch" })
    expect(scoped("apply", { ...approval("apply"), sourceSetFingerprint: "sources:other" })).toEqual({ status: "blocked", reasonCode: "approval_source_scope_mismatch" })
  })

  it("uses only injected diagnosis and approval receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/harness-entry-approval-scope.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|createLogger|conversation|memory|globalThis/u)
  })
})
