import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildReleaseApprovalEvidenceProjection,
  buildReleaseManifest,
  evaluateReleaseReadiness,
  validateReleaseApprovalEvidenceProjection,
} from "../packages/core/src/release/package.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchExecutionPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-plan.ts"

const PLANNED_DISPATCH_PLAN: YeonjangBrowserActiveTabInfoDispatchExecutionPlan = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1",
  method: "browser.active_tab_info",
  state: "planned",
  reasonCode: "active_tab_info_dispatch_execution_plan_ready",
  liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
  targetSurfaces: ["rust_live_handler", "skill_mapping"],
  orderedDispatchSteps: [
    "reconfirm_live_execution_receipt",
    "reconfirm_target_surface_lock",
    "prepare_rust_dispatch_input",
    "collect_dispatch_result_reference",
    "stop_before_skill_mapping_activation",
  ],
  rollbackSteps: [
    "use_receipt_rollback_command_ref",
    "restore_previous_runtime_binding",
    "record_rollback_reference_only",
  ],
  postCheckSteps: [
    "use_receipt_post_execution_verification_plan_ref",
    "verify_redacted_runtime_result",
    "verify_final_and_product_log_boundaries",
  ],
  dispatchNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  markUserGoalSucceededNow: false,
}

function dispatchDryRunReceipt() {
  return buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt({
    dispatchExecutionPlan: PLANNED_DISPATCH_PLAN,
    dispatchAdapterDryRunId: "dry-run:active-tab-info-dispatch-adapter:001",
    expectedSurfaceCount: 2,
    rollbackDryRunId: "dry-run:active-tab-info-dispatch-rollback:001",
    postCheckDryRunId: "dry-run:active-tab-info-dispatch-post-check:001",
  })
}

describe("task265 active tab info dispatch dry-run receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry dispatch dry-run receipt", () => {
    const manifest = buildReleaseManifest({
      rootDir: process.cwd(),
      now: new Date("2026-07-22T02:08:00.000Z"),
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
      yeonjangBrowserActiveTabInfoDispatchDryRunReceipt: dispatchDryRunReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept dispatch dry-run receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoDispatchDryRunReceipt: dispatchDryRunReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoDispatchDryRunReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
