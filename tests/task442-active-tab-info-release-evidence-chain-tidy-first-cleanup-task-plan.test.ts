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

function readyApprovalGate() {
  const architectureReview = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
    termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
      lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
    }),
    cleanupCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
  const cleanupProposal = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
    architectureReview,
    proposalReasonByCandidateRef: {
      [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
      [SURFACE_BOUNDARY_CANDIDATE_REF]: "release_surface_boundary_duplicate",
    },
  })
  return evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
    cleanupProposal,
    operatorApprovalRef: OPERATOR_APPROVAL_REF,
    approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
}

describe("task442 active tab info release evidence chain tidy first cleanup task plan", () => {
  it("builds a separate Tidy First cleanup task plan from a ready approval gate", () => {
    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
      cleanupApprovalGate: readyApprovalGate(),
      cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF, SURFACE_BOUNDARY_TASK_REF],
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-release-evidence-chain-tidy-first-cleanup-task-plan.v1",
      method: "browser.active_tab_info",
      taskPlanStatus: "ready",
      reasonCode: "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ready",
      cleanupTaskCount: 2,
      cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF, SURFACE_BOUNDARY_TASK_REF],
      nextAllowedAction: "run_separate_tidy_first_cleanup_task",
      executeDeletionNow: false,
      modifyPackageNow: false,
      requiresSeparateCommit: true,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
  })

  it("blocks task planning when cleanup approval is not ready", () => {
    const cleanupProposal = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupProposal({
      architectureReview: buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainArchitectureReview({
        termination: evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainTermination({
          lastAcceptedBoundaryRef: ACCEPTED_BOUNDARY_REF,
        }),
        cleanupCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF],
      }),
      proposalReasonByCandidateRef: {
        [RECEIPT_CHAIN_CANDIDATE_REF]: "receipt_ledger_chain_too_deep",
      },
    })
    const blockedApproval = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
      cleanupProposal,
    })

    expect(buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
      cleanupApprovalGate: blockedApproval,
      cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF],
    })).toMatchObject({
      taskPlanStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_approval_not_ready",
      cleanupTaskCount: 0,
      nextAllowedAction: "complete_cleanup_approval",
      executeDeletionNow: false,
      modifyPackageNow: false,
      requiresSeparateCommit: true,
    })
  })

  it("rejects unsafe task refs and never performs deletion or package mutation", () => {
    const result = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
      cleanupApprovalGate: readyApprovalGate(),
      cleanupTaskRefs: ["/Users/private/delete-contract.ts", SURFACE_BOUNDARY_TASK_REF],
    })

    expect(result).toMatchObject({
      taskPlanStatus: "blocked",
      reasonCode: "active_tab_info_release_evidence_chain_tidy_first_cleanup_task_plan_ref_invalid",
      cleanupTaskCount: 0,
      executeDeletionNow: false,
      modifyPackageNow: false,
      requiresSeparateCommit: true,
      releaseReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /\.ts|\.js|Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|skill-mapping-activation|production-binding-mutation|default-live-smoke-run/iu,
    )
  })
})
