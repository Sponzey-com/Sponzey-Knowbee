import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoReleaseGateSummary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-release-gate-summary.ts"

const COMPLETE_INPUT = {
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
} as const

describe("Task 217 Yeonjang browser.active_tab_info release gate summary", () => {
  it("passes only to manual live integration review when all safe gates are present and live paths stay closed", () => {
    const summary = buildYeonjangBrowserActiveTabInfoReleaseGateSummary(COMPLETE_INPUT)

    expect(summary).toEqual({
      schemaVersion: "yeonjang-browser-active-tab-info-release-gate-summary-v1",
      method: "browser.active_tab_info",
      gateStatus: "ready_for_manual_live_integration_review",
      missingGateIds: [],
      blockingReasonCodes: [],
      requiredGateIds: [
        "readiness_projection",
        "pre_dispatch_bridge",
        "rust_inventory_contract",
        "audit_evidence_boundary",
        "runtime_result_assembler",
        "llm_review_admission",
        "review_ready_bundle",
        "final_projection_boundary",
        "safe_evidence_ref",
      ],
      liveIntegrationState: {
        rustLiveHandlerEnabled: false,
        skillMappingEnabled: false,
        productionBindingEnabled: false,
        defaultLiveSmokeEnabled: false,
      },
      addRustDispatchNow: false,
      addProductionBindingNow: false,
      enableSkillMappingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("fails closed when required gates are missing", () => {
    const summary = buildYeonjangBrowserActiveTabInfoReleaseGateSummary({
      ...COMPLETE_INPUT,
      auditEvidenceBoundaryReady: false,
      llmReviewAdmissionReady: false,
    })

    expect(summary.gateStatus).toBe("blocked")
    expect(summary.missingGateIds).toEqual([
      "audit_evidence_boundary",
      "llm_review_admission",
    ])
    expect(summary.blockingReasonCodes).toEqual([
      "required_gate_missing:audit_evidence_boundary",
      "required_gate_missing:llm_review_admission",
    ])
    expect(summary.addRustDispatchNow).toBe(false)
    expect(summary.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("fails closed on raw leak, review bypass, unsafe evidenceRef, or live enablement", () => {
    const summary = buildYeonjangBrowserActiveTabInfoReleaseGateSummary({
      ...COMPLETE_INPUT,
      publicRawLeakDetected: true,
      reviewBypassDetected: true,
      unsafeEvidenceRefDetected: true,
      defaultLiveSmokeEnabled: true,
      rustLiveHandlerEnabled: true,
      skillMappingEnabled: true,
      productionBindingEnabled: true,
    })

    expect(summary.gateStatus).toBe("blocked")
    expect(summary.blockingReasonCodes).toEqual([
      "public_raw_leak_detected",
      "llm_review_bypass_detected",
      "unsafe_evidence_ref_detected",
      "default_live_smoke_enabled_before_gate",
      "rust_live_handler_enabled_before_gate",
      "skill_mapping_enabled_before_gate",
      "production_binding_enabled_before_gate",
    ])
    expect(summary.liveIntegrationState).toEqual({
      rustLiveHandlerEnabled: true,
      skillMappingEnabled: true,
      productionBindingEnabled: true,
      defaultLiveSmokeEnabled: true,
    })
    expect(summary.addRustDispatchNow).toBe(false)
    expect(summary.addProductionBindingNow).toBe(false)
    expect(summary.enableSkillMappingNow).toBe(false)
    expect(summary.enableDefaultLiveSmokeNow).toBe(false)
  })
})
