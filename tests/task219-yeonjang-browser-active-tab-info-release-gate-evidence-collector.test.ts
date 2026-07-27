import { describe, expect, it } from "vitest"

import {
  ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS,
  collectYeonjangBrowserActiveTabInfoReleaseGateEvidence,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-evidence-collector.ts"

const MODULES = [
  "readiness_projection",
  "pre_dispatch_bridge",
  "rust_inventory_contract",
  "audit_evidence_boundary",
  "runtime_result_assembler",
  "llm_review_admission",
  "review_ready_bundle",
  "final_projection_boundary",
  "safe_evidence_ref",
] as const

const TESTS = [
  "tests/task200-yeonjang-browser-active-tab-info-readiness-route.test.ts",
  "tests/task198-yeonjang-browser-active-tab-info-pre-dispatch-bridge.test.ts",
  "tests/task196-yeonjang-browser-active-tab-info-rust-inventory-contract.test.ts",
  "tests/task211-yeonjang-browser-active-tab-info-audit-evidence-boundary.test.ts",
  "tests/task214-yeonjang-browser-active-tab-info-runtime-result-assembler.test.ts",
  "tests/task215-yeonjang-browser-active-tab-info-postcheck-llm-review-admission.test.ts",
  "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts",
  "tests/task212-yeonjang-browser-active-tab-info-final-result-boundary.test.ts",
  "tests/task213-yeonjang-browser-active-tab-info-safe-evidence-ref.test.ts",
] as const

describe("Task 219 Yeonjang browser.active_tab_info release gate evidence collector", () => {
  it("collects release gate input from module and test evidence instead of static booleans", () => {
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
      moduleEvidence: MODULES.map((gateId) => ({ gateId, present: true })),
      testEvidence: TESTS.map((testPath) => ({ testPath, status: "passed" as const })),
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: {
        rustLiveHandlerEnabled: false,
        skillMappingEnabled: false,
        productionBindingEnabled: false,
        defaultLiveSmokeEnabled: false,
      },
    })

    expect(collected.summaryInput).toEqual({
      readinessProjectionReady: true,
      preDispatchBridgeReady: true,
      rustInventoryContractReady: true,
      auditEvidenceBoundaryReady: true,
      runtimeAssemblerReady: true,
      llmReviewAdmissionReady: true,
      reviewReadyBundleReady: true,
      finalProjectionBoundaryReady: true,
      safeEvidenceRefReady: true,
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      defaultLiveSmokeEnabled: false,
      rustLiveHandlerEnabled: false,
      skillMappingEnabled: false,
      productionBindingEnabled: false,
    })
    expect(collected.missingModuleGateIds).toEqual([])
    expect(collected.failingTestPaths).toEqual([])
    expect(collected.releaseGateSummary.gateStatus).toBe("ready_for_manual_live_integration_review")
  })

  it("fails closed when module or test evidence is missing", () => {
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
      moduleEvidence: MODULES
        .filter((gateId) => gateId !== "review_ready_bundle")
        .map((gateId) => ({ gateId, present: true })),
      testEvidence: TESTS
        .filter((testPath) => testPath !== "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts")
        .map((testPath) => ({ testPath, status: "passed" as const })),
      publicRawLeakDetected: false,
      reviewBypassDetected: false,
      unsafeEvidenceRefDetected: false,
      liveIntegrationState: {
        rustLiveHandlerEnabled: false,
        skillMappingEnabled: false,
        productionBindingEnabled: false,
        defaultLiveSmokeEnabled: false,
      },
    })

    expect(collected.summaryInput.reviewReadyBundleReady).toBe(false)
    expect(collected.missingModuleGateIds).toEqual(["review_ready_bundle"])
    expect(collected.failingTestPaths).toEqual([
      "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts",
    ])
    expect(collected.releaseGateSummary.gateStatus).toBe("blocked")
    expect(collected.releaseGateSummary.blockingReasonCodes).toContain(
      "required_gate_missing:review_ready_bundle",
    )
  })

  it("exposes exact required evidence requirements for package wiring", () => {
    expect(ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS).toEqual([
      {
        gateId: "readiness_projection",
        modulePath: "packages/core/src/api/routes/yeonjang-instances.ts",
        testPath: "tests/task200-yeonjang-browser-active-tab-info-readiness-route.test.ts",
      },
      {
        gateId: "pre_dispatch_bridge",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-pre-dispatch-bridge.ts",
        testPath: "tests/task198-yeonjang-browser-active-tab-info-pre-dispatch-bridge.test.ts",
      },
      {
        gateId: "rust_inventory_contract",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-rust-inventory-contract.ts",
        testPath: "tests/task196-yeonjang-browser-active-tab-info-rust-inventory-contract.test.ts",
      },
      {
        gateId: "audit_evidence_boundary",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-audit-evidence-boundary.ts",
        testPath: "tests/task211-yeonjang-browser-active-tab-info-audit-evidence-boundary.test.ts",
      },
      {
        gateId: "runtime_result_assembler",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-runtime-result-assembler.ts",
        testPath: "tests/task214-yeonjang-browser-active-tab-info-runtime-result-assembler.test.ts",
      },
      {
        gateId: "llm_review_admission",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-postcheck-llm-review-admission.ts",
        testPath: "tests/task215-yeonjang-browser-active-tab-info-postcheck-llm-review-admission.test.ts",
      },
      {
        gateId: "review_ready_bundle",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-review-ready-bundle.ts",
        testPath: "tests/task216-yeonjang-browser-active-tab-info-review-ready-bundle.test.ts",
      },
      {
        gateId: "final_projection_boundary",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts",
        testPath: "tests/task212-yeonjang-browser-active-tab-info-final-result-boundary.test.ts",
      },
      {
        gateId: "safe_evidence_ref",
        modulePath: "packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts",
        testPath: "tests/task213-yeonjang-browser-active-tab-info-safe-evidence-ref.test.ts",
      },
    ])
  })
})
