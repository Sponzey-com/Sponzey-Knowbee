import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-architecture-review.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-approval-gate.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-proposal.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.ts"
import {
  buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-evidence-chain-termination.ts"

const ACCEPTED_BOUNDARY_REF =
  "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger-receipt-surface-matrix:active-tab-info:accepted:001"
const RECEIPT_CHAIN_CANDIDATE_REF =
  "receipt-ledger-chain:active-tab-info:cleanup-candidate:operator-final-retained-chain"
const SURFACE_BOUNDARY_CANDIDATE_REF =
  "release-surface-boundary:active-tab-info:cleanup-candidate:legacy-ledger-boundary"
const OPERATOR_APPROVAL_REF =
  "cleanup-approval:active-tab-info:operator-approved:manual-review-001"
const RECEIPT_CHAIN_TASK_REF =
  "tidy-first-cleanup-task:active-tab-info:approved:receipt-chain"
const SURFACE_BOUNDARY_TASK_REF =
  "tidy-first-cleanup-task:active-tab-info:approved:surface-boundary"

function cleanupProposal(candidateRefs = [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF]) {
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
    architectureReview: buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
      termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
        lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
      }),
      cleanupCandidateRefs: candidateRefs,
    }),
    proposalReasonByCandidateRef: Object.fromEntries(
      candidateRefs.map((candidateRef) => [candidateRef, "receipt_ledger_chain_too_deep"]),
    ),
  })
}

function readyTaskPlan() {
  const cleanupApprovalGate = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
    cleanupProposal: cleanupProposal(),
    operatorApprovalRef: OPERATOR_APPROVAL_REF,
    approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
    cleanupApprovalGate,
    cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF, SURFACE_BOUNDARY_TASK_REF],
  })
}

function blockedTaskPlan() {
  const cleanupApprovalGate = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
    cleanupProposal: cleanupProposal([RECEIPT_CHAIN_CANDIDATE_REF]),
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
    cleanupApprovalGate,
    cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF],
  })
}

describe("task443 active tab info release evidence chain cleanup task plan summary", () => {
  it("summarizes a ready cleanup task plan without exposing raw task refs", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary({
      cleanupTaskPlan: readyTaskPlan(),
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1",
      method: "browser.active_tab_info",
      summaryStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_ready",
      cleanupTaskCount: 2,
      nextOperatorAction: "review_separate_tidy_first_cleanup_task",
      requiresSeparateCommit: true,
      executeDeletionNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks the public summary when the cleanup task plan is not ready", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary({
      cleanupTaskPlan: blockedTaskPlan(),
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-cleanup-task-plan-summary.v1",
      method: "browser.active_tab_info",
      summaryStatus: "blocked",
      reasonCode:
        "active_tab_info_release_evidence_chain_cleanup_task_plan_summary_task_plan_not_ready",
      cleanupTaskCount: 0,
      nextOperatorAction: "complete_cleanup_task_plan",
      requiresSeparateCommit: true,
      executeDeletionNow: false,
      modifyPackageNow: false,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("does not include task refs, approval refs, raw paths, URLs, or tokens in the public summary", () => {
    const serialized = JSON.stringify(
      buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary({
        cleanupTaskPlan: readyTaskPlan(),
      }),
    )

    expect(serialized).not.toContain(RECEIPT_CHAIN_TASK_REF)
    expect(serialized).not.toContain(SURFACE_BOUNDARY_TASK_REF)
    expect(serialized).not.toContain(OPERATOR_APPROVAL_REF)
    expect(serialized).not.toContain(RECEIPT_CHAIN_CANDIDATE_REF)
    expect(serialized).not.toContain(SURFACE_BOUNDARY_CANDIDATE_REF)
    expect(serialized).not.toMatch(
      /\.ts|\.js|Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })

  it("does not permit deletion, package mutation, release readiness, skill activation, or production binding", () => {
    const result = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary({
      cleanupTaskPlan: readyTaskPlan(),
    })

    expect(result.requiresSeparateCommit).toBe(true)
    expect(result.executeDeletionNow).toBe(false)
    expect(result.modifyPackageNow).toBe(false)
    expect(result.releaseReadinessNow).toBe(false)
    expect(result.enableSkillMappingNow).toBe(false)
    expect(result.addProductionBindingNow).toBe(false)
  })
})
