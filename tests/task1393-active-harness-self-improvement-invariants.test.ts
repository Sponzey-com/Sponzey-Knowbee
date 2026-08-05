import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeHarnessSelfImprovementActivation,
  authorizeHarnessSelfImprovementReview,
  decideHarnessSelfImprovementFailure,
  executeAuthorizedHarnessSelfImprovement,
  publishAuthorizedHarnessSelfImprovement,
  type HarnessSelfImprovementReviewInput,
} from "../packages/core/src/contracts/harness-self-improvement-invariants.ts"
import { HIGH_RISK_IMPROVEMENT_CHECKS } from "../packages/core/src/contracts/high-risk-improvement-verification.ts"
import { HIGH_RISK_PERMISSION_CAPABILITIES } from "../packages/core/src/contracts/high-risk-source-activation-evidence.ts"
import { CURRENT_HARNESS_CONTROL_EVIDENCE, HARNESS_STATE_MACHINE_COMPONENTS } from "../packages/core/src/contracts/harness-publication-control.ts"
import { REQUIRED_HARNESS_REGRESSION_TEST_IDS } from "../packages/core/src/contracts/recursive-prompt-improvement-gate.ts"
import { REQUIRED_HARNESS_GUARDRAILS } from "../packages/core/src/memory/prompt-improvement-harness.ts"

const proposal = "proposal:harness:1393"
const sourceSet = "sources:harness:1393"
const sources = ["packages/core/src/memory/prompt-improvement-harness.ts"]
const currentRuntime = "runtime:current:1393"
const nextRuntime = "runtime:next:1393"

function reviewInput(overrides: Partial<HarnessSelfImprovementReviewInput> = {}): HarnessSelfImprovementReviewInput {
  return {
    proposalFingerprint: proposal,
    sourceSetFingerprint: sourceSet,
    currentRuntimeSnapshotFingerprint: currentRuntime,
    entry: { status: "authorized", scope: "entry", requestId: "request:1393", targetHarnessSourceRefs: sources },
    control: { status: "verified", proposalRunId: "run:proposal:1393", proposalFingerprint: proposal, activeHarnessChecksum: "aaaaaaaa", targetSourceRefs: sources },
    application: { status: "authorized", fixedRisk: "high", guardrails: REQUIRED_HARNESS_GUARDRAILS },
    stateMachine: { status: "complete", proposalFingerprint: proposal, components: HARNESS_STATE_MACHINE_COMPONENTS },
    highRisk: { status: "authorized", changeId: proposal, risk: "high", checks: HIGH_RISK_IMPROVEMENT_CHECKS, rollbackSourceRef: "git:baseline:1393" },
    sourceEvidence: { status: "verified", changeId: proposal, sourceSetFingerprint: sourceSet, permissionCapabilities: HIGH_RISK_PERMISSION_CAPABILITIES, sourceRefs: sources },
    applyApproval: { status: "authorized", scope: "apply", approvalId: "approval:apply:1393", proposalFingerprint: proposal, sourceSetFingerprint: sourceSet },
    mutations: [{
      status: "authorized",
      target: { targetKind: "file", requestedRef: sources[0]!, canonicalWorkspacePath: sources[0]!, withinWorkspace: true, traversedSymlink: false, sourceAuthorization: "harness_state_machine" },
      runtimeSnapshotId: currentRuntime,
    }],
    rollbackReadiness: [{
      status: "authorized", sourceType: "source_control_revision", sourceRef: "git:baseline:1393", targetSourceRef: sources[0]!, baselineVersion: "v1", baselineChecksum: "aaaaaaaa", executorId: "rollback:git", verificationMethod: "checksum_compare", evidenceRef: "evidence:rollback-ready:1393",
    }],
    ...overrides,
  }
}

function authorizedReview() {
  return authorizeHarnessSelfImprovementReview(reviewInput())
}

function writeReceipt(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1 as const, proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, sourceRefs: sources, appliedChecksum: "bbbbbbbb", writtenAt: 2_000, verified: true as const, ...overrides }
}

function regression(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1 as const, proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, status: "passed" as const, requiredTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS], passedTestIds: [...REQUIRED_HARNESS_REGRESSION_TEST_IDS], evidenceRef: "evidence:regression:1393", ...overrides }
}

function activation(overrides: Record<string, unknown> = {}) {
  return authorizeHarnessSelfImprovementActivation({
    review: authorizedReview(),
    write: writeReceipt(),
    regression: regression(),
    activationApproval: { status: "authorized", scope: "activation", approvalId: "approval:activation:1393", proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, appliedChecksum: "bbbbbbbb", runtimeTargetFingerprint: nextRuntime },
    publication: { status: "authorized", proposalFingerprint: proposal, activationRunId: "run:activation:1393", runtimeSnapshotFingerprint: nextRuntime },
    ...overrides,
  })
}

describe("task1393 active-harness self-improvement invariant gate", () => {
  it("authorizes review only from explicit entry plus separate exact apply approval", async () => {
    const apply = vi.fn(async () => "written")
    const decision = authorizedReview()
    expect(decision).toMatchObject({ status: "authorized", receipt: { stage: "apply_authorized", proposalFingerprint: proposal, fixedRisk: "high", applyApprovalId: "approval:apply:1393" } })
    await expect(executeAuthorizedHarnessSelfImprovement({ decision, apply })).resolves.toEqual({ status: "applied", result: "written" })
    expect(apply).toHaveBeenCalledOnce()
  })

  it.each([
    ["entry", { entry: { status: "blocked", reasonCode: "explicit_request_required" } }, "entry_unverified"],
    ["active control", { control: { status: "blocked", reasonCode: "inactive_harness_control" } }, "current_harness_unverified"],
    ["guardrails", { application: { status: "blocked", reasonCode: "proposed_guardrail_missing", guardrail: "approval" } }, "guardrail_review_unverified"],
    ["state machine", { stateMachine: { status: "blocked", reasonCode: "state_machine_component_missing", component: "failure" } }, "state_machine_unverified"],
    ["high risk", { highRisk: { status: "blocked", reasonCode: "check_failed", check: "harness_regression_suite" } }, "high_risk_review_unverified"],
    ["source evidence", { sourceEvidence: { status: "blocked", reasonCode: "checksum_source_missing", sourceRef: sources[0] } }, "source_evidence_unverified"],
  ] as const)("blocks unverified %s before source mutation", async (_label, override, reasonCode) => {
    const apply = vi.fn()
    const decision = authorizeHarnessSelfImprovementReview(reviewInput(override as Partial<HarnessSelfImprovementReviewInput>))
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await executeAuthorizedHarnessSelfImprovement({ decision, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("does not treat entry authorization as apply approval", () => {
    expect(authorizeHarnessSelfImprovementReview(reviewInput({ applyApproval: undefined as never })))
      .toEqual({ status: "blocked", reasonCode: "apply_approval_missing" })
    expect(authorizeHarnessSelfImprovementReview(reviewInput({ applyApproval: reviewInput().entry as never })))
      .toEqual({ status: "blocked", reasonCode: "apply_approval_unverified" })
  })

  it.each([
    [{ proposalFingerprint: "proposal:other" }, "proposal_scope_mismatch"],
    [{ sourceSetFingerprint: "sources:other" }, "source_scope_mismatch"],
    [{ currentRuntimeSnapshotFingerprint: "" }, "runtime_snapshot_invalid"],
  ] as const)("rejects aggregate lineage mismatch %#", (override, reasonCode) => {
    expect(authorizeHarnessSelfImprovementReview(reviewInput(override)))
      .toEqual({ status: "blocked", reasonCode })
  })

  it("blocks forbidden runtime and environment mutation decisions", () => {
    for (const reasonCode of ["runtime_mutation_forbidden", "runtime_environment_forbidden"] as const) {
      expect(authorizeHarnessSelfImprovementReview(reviewInput({ mutations: [{ status: "blocked", reasonCode }] })))
        .toEqual({ status: "blocked", reasonCode: "mutation_boundary_blocked" })
    }
  })

  it("requires one exact mutation and rollback target for every source", () => {
    expect(authorizeHarnessSelfImprovementReview(reviewInput({ mutations: [] })))
      .toEqual({ status: "blocked", reasonCode: "mutation_scope_mismatch" })
    expect(authorizeHarnessSelfImprovementReview(reviewInput({ rollbackReadiness: [] })))
      .toEqual({ status: "blocked", reasonCode: "rollback_readiness_missing" })
    expect(authorizeHarnessSelfImprovementReview(reviewInput({ mutations: [{ ...reviewInput().mutations[0]!, runtimeSnapshotId: "runtime:other" }] })))
      .toEqual({ status: "blocked", reasonCode: "runtime_snapshot_mismatch" })
  })

  it("authorizes activation only after verified write, complete regression, and separate activation approval", async () => {
    const publish = vi.fn(async () => "active")
    const decision = activation()
    expect(decision).toMatchObject({ status: "authorized", receipt: { stage: "activation_authorized", proposalFingerprint: proposal, runtimeSnapshotFingerprint: nextRuntime } })
    await expect(publishAuthorizedHarnessSelfImprovement({ decision, publish })).resolves.toEqual({ status: "published", result: "active" })
    expect(publish).toHaveBeenCalledOnce()
  })

  it.each([
    ["write", { write: writeReceipt({ verified: false }) }, "source_write_unverified"],
    ["regression missing", { regression: undefined }, "post_write_regression_missing"],
    ["regression failed", { regression: regression({ status: "failed" }) }, "post_write_regression_failed"],
    ["regression incomplete", { regression: regression({ passedTestIds: REQUIRED_HARNESS_REGRESSION_TEST_IDS.slice(1) }) }, "post_write_regression_incomplete"],
    ["activation approval", { activationApproval: { status: "blocked", reasonCode: "approval_denied" } }, "activation_approval_unverified"],
    ["publication", { publication: { status: "blocked", reasonCode: "activation_unconfirmed" } }, "publication_unverified"],
  ] as const)("blocks activation for %s", async (_label, override, reasonCode) => {
    const publish = vi.fn()
    const decision = activation(override as Record<string, unknown>)
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await publishAuthorizedHarnessSelfImprovement({ decision, publish })
    expect(publish).not.toHaveBeenCalled()
  })

  it("requires exact post-write and next-runtime lineage", () => {
    expect(activation({ write: writeReceipt({ proposalFingerprint: "proposal:other" }) }))
      .toEqual({ status: "blocked", reasonCode: "post_write_scope_mismatch" })
    expect(activation({ publication: { status: "authorized", proposalFingerprint: proposal, activationRunId: "run:next", runtimeSnapshotFingerprint: currentRuntime } }))
      .toEqual({ status: "blocked", reasonCode: "current_runtime_activation_forbidden" })
  })

  it("requires verified rollback after any post-write failure", () => {
    const failed = decideHarnessSelfImprovementFailure({ review: authorizedReview(), write: writeReceipt(), failure: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, kind: "tests_failed_after_write", evidenceRef: "failure:1393" } })
    expect(failed).toEqual({ status: "rollback_required", reasonCode: "post_write_failure", rollbackSourceRefs: sources })
    const rolledBack = decideHarnessSelfImprovementFailure({
      review: authorizedReview(), write: writeReceipt(),
      failure: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, kind: "tests_failed_after_write", evidenceRef: "failure:1393" },
      restoration: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, restoredSourceRefs: sources, baselineRestored: true, verificationRef: "rollback:verified:1393" },
    })
    expect(rolledBack).toEqual({ status: "rolled_back", proposalFingerprint: proposal, verificationRef: "rollback:verified:1393" })
  })

  it("does not accept incomplete or cross-proposal rollback as completion", () => {
    expect(decideHarnessSelfImprovementFailure({
      review: authorizedReview(), write: writeReceipt(),
      failure: { proposalFingerprint: proposal, sourceSetFingerprint: sourceSet, kind: "tests_failed_after_write", evidenceRef: "failure:1393" },
      restoration: { proposalFingerprint: "proposal:other", sourceSetFingerprint: sourceSet, restoredSourceRefs: sources, baselineRestored: true, verificationRef: "rollback:verified:1393" },
    })).toEqual({ status: "rollback_required", reasonCode: "rollback_unverified", rollbackSourceRefs: sources })
  })

  it("uses only injected decisions and immutable receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/harness-self-improvement-invariants.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|globalThis/u)
  })
})
