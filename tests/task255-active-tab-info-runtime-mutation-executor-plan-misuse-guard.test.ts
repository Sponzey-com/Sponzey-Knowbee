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
  buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationPreflight,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-preflight.ts"

const READY_PREFLIGHT: YeonjangBrowserActiveTabInfoRuntimeMutationPreflight = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-preflight.v1",
  method: "browser.active_tab_info",
  status: "mutation_preflight_ready",
  reasonCode: "active_tab_info_runtime_mutation_preflight_ready",
  targetSurfaces: ["rust_live_handler", "skill_mapping"],
  plannedMutationSurfaces: ["rust_live_handler", "skill_mapping"],
  rollbackCommandPlan: [
    "disable:browser.active_tab_info:rust_live_handler",
    "disable:browser.active_tab_info:skill_mapping",
  ],
  postCheckEvidenceRequirements: [
    "active_tab_info_runtime_result_redacted",
    "active_tab_info_product_log_evidence_ref_only",
  ],
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

function runtimeMutationExecutorPlan() {
  return buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan({
    runtimeMutationPreflight: READY_PREFLIGHT,
    operatorFinalConfirmation: true,
    rollbackCommandDryRunResult: "passed",
    postCheckCollectorDryRunResult: "passed",
    mutationSurfaceLockAcquired: true,
    cancelRequested: false,
  })
}

describe("task255 active tab info runtime mutation executor plan misuse guard", () => {
  it("rejects approval evidence that tries to carry runtime mutation executor plan", () => {
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
      yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan: runtimeMutationExecutorPlan(),
    })).toEqual({
      status: "rejected",
      reasonCode: "release_approval_evidence_invalid",
    })
  })

  it("does not accept runtime mutation executor plan as final response or product log evidence", () => {
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
        yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan: runtimeMutationExecutorPlan(),
      } as unknown as typeof redacted.observation,
      evidenceRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
