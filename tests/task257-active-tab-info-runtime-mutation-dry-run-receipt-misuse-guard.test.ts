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
  buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.ts"

const PLANNED_EXECUTOR_PLAN: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1",
  method: "browser.active_tab_info",
  state: "planned",
  reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready",
  mutationSurfaces: ["rust_live_handler", "skill_mapping"],
  orderedExecutionSteps: [
    "reconfirm_mutation_surface_lock",
    "apply_runtime_binding_change",
    "collect_post_check_evidence",
    "stop_before_default_live_smoke",
  ],
  rollbackDryRunSummary: "passed",
  postCheckDryRunSummary: "passed",
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function runtimeMutationDryRunReceipt() {
  return buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt({
    runtimeMutationExecutorPlan: PLANNED_EXECUTOR_PLAN,
    runtimeExecutorDryRunId: "dry-run:active-tab-info-runtime-executor:001",
    expectedMutationSurfaceCount: 2,
    rollbackDryRunId: "dry-run:active-tab-info-rollback:001",
    postCheckDryRunId: "dry-run:active-tab-info-post-check:001",
  })
}

describe("task257 active tab info runtime mutation dry-run receipt misuse guard", () => {
  it("rejects approval evidence that tries to carry runtime mutation dry-run receipt", () => {
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
      yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt:
        runtimeMutationDryRunReceipt(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept runtime mutation dry-run receipt as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt:
          runtimeMutationDryRunReceipt(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
