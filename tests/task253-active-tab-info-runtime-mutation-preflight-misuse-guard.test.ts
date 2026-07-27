import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-executor-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoActivationRequest,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-request.ts"
import {
  transitionYeonjangBrowserActiveTabInfoActivationTask,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-task-state-machine.ts"
import {
  bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-authorization-executor-bridge.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoHighRiskAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-high-risk-authorization.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"
import {
  buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-change-skeleton.ts"
import {
  buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-preflight.ts"

function runtimeMutationPreflight() {
  const targetSurfaces = ["rust_live_handler", "skill_mapping"] as const
  const activationRequest = buildYeonjangBrowserActiveTabInfoActivationRequest({
    prerequisiteProjection: evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
      productionExposureAuditPassed: true,
      manualReviewRecordAccepted: true,
      runtimeTransitionReady: true,
      releaseApprovalEvidenceValid: true,
      finalProductLogBoundaryReady: true,
      operatorWordingReady: true,
      taskEvidenceReady: true,
    }),
    manualApprovalReference: "review:browser-active-tab-info-live-enable",
    targetPlatform: "macos",
    operatorIdentityProof: "operator-proof:release-owner",
    rollbackRequirement: "disable_browser_active_tab_info_live_paths",
    explicitEnableScope: targetSurfaces,
  })
  const activationTaskState = transitionYeonjangBrowserActiveTabInfoActivationTask({
    currentState: "draft",
    activationRequest,
    operatorConfirmed: true,
    rollbackPlanAccepted: true,
    surfaceMatrixAccepted: true,
    cancelRequested: false,
  })
  const executorBoundary = buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
    activationTaskState,
    highRiskOperatorAuthorizationAccepted: true,
    targetSurfaces,
    rollbackCommandPlanAccepted: true,
    postCheckEvidenceRequirementAccepted: true,
    failureRecoveryRouteAccepted: true,
  })
  const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
    operatorIdentityProof: "operator-proof:release-owner",
    authorizationScope: "runtime_activation_executor",
    targetSurfaces,
    rollbackAcknowledged: true,
    postCheckAcknowledged: true,
    auditReference: "audit:browser-active-tab-info-live-enable",
    authorizedAt: "2026-07-22T01:00:00.000Z",
    expiresAt: "2026-07-22T02:00:00.000Z",
  }, {
    now: new Date("2026-07-22T01:30:00.000Z"),
  })
  const bridgeReadiness = bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
    authorization,
    executorBoundary,
    now: new Date("2026-07-22T01:30:00.000Z"),
  })
  const runtimeChangeSkeleton = buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton({
    bridgeReadiness,
    targetSurfaces: executorBoundary.targetSurfaces,
    rollbackCommandPlan: executorBoundary.rollbackCommandPlan,
    postCheckEvidenceRequirements: executorBoundary.postCheckEvidenceRequirements,
    failureRecoveryRoute: executorBoundary.failureRecoveryRoute,
  })

  return buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight({
    runtimeChangeSkeleton,
    productionExposureClosed: true,
    rollbackCommandAvailable: true,
    postCheckCollectorAvailable: true,
    finalProductLogBoundaryReady: true,
  })
}

describe("task253 active tab info runtime mutation preflight misuse guard", () => {
  it("rejects approval evidence that tries to carry runtime mutation preflight", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T01:00:00.000Z"),
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
      yeonjangBrowserActiveTabInfoRuntimeMutationPreflight: runtimeMutationPreflight(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept runtime mutation preflight as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoRuntimeMutationPreflight: runtimeMutationPreflight(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoRuntimeMutationPreflight"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
