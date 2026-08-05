import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
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
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"

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

function cleanupTaskPlanSummary() {
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
  const cleanupApprovalGate = evaluateYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupApprovalGate({
    cleanupProposal,
    operatorApprovalRef: OPERATOR_APPROVAL_REF,
    approvedCandidateRefs: [RECEIPT_CHAIN_CANDIDATE_REF, SURFACE_BOUNDARY_CANDIDATE_REF],
  })
  const cleanupTaskPlan = buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainTidyFirstCleanupTaskPlan({
    cleanupApprovalGate,
    cleanupTaskRefs: [RECEIPT_CHAIN_TASK_REF, SURFACE_BOUNDARY_TASK_REF],
  })
  return buildYeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary({
    cleanupTaskPlan,
  })
}

describe("task444 active tab info release evidence chain cleanup task plan summary misuse guard", () => {
  it("rejects approval evidence that tries to carry cleanup task plan summary state", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-23T13:20:00.000Z"),
      yeonjangBrowserActiveTabInfoReleaseGateEvidence: {
        moduleEvidence: [],
        testEvidence: [],
      },
    })
    const evidence = buildReleaseApprovalEvidenceProjection({
      manifest,
      readiness: evaluateReleaseReadiness(manifest),
    })

    expect(validateReleaseApprovalEvidenceProjection({
      ...evidence,
      yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary:
        cleanupTaskPlanSummary(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept cleanup task plan summary as final response or product log evidence", () => {
    const redacted = projectYeonjangBrowserActiveTabInfo({
      browserName: "Google Chrome",
      title: "Private Ticket",
      url: "https://example.test/account?token=private",
      observationStatus: "available",
    })
    if (!redacted.ok) throw new Error(redacted.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: redacted.observation,
    })

    expect(buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: {
        ...redacted.observation,
        yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary:
          cleanupTaskPlanSummary(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: [
        "evidenceRef",
        "yeonjangBrowserActiveTabInfoReleaseEvidenceChainCleanupTaskPlanSummary",
      ],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
