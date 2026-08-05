import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
const REQUIRED_GATE_IDS = [
    "readiness_projection",
    "pre_dispatch_bridge",
    "rust_inventory_contract",
    "audit_evidence_boundary",
    "runtime_result_assembler",
    "llm_review_admission",
    "review_ready_bundle",
    "final_projection_boundary",
    "safe_evidence_ref",
];
export function buildYeonjangBrowserActiveTabInfoReleaseGateSummary(input) {
    const readinessByGate = new Map([
        ["readiness_projection", input.readinessProjectionReady],
        ["pre_dispatch_bridge", input.preDispatchBridgeReady],
        ["rust_inventory_contract", input.rustInventoryContractReady],
        ["audit_evidence_boundary", input.auditEvidenceBoundaryReady],
        ["runtime_result_assembler", input.runtimeAssemblerReady],
        ["llm_review_admission", input.llmReviewAdmissionReady],
        ["review_ready_bundle", input.reviewReadyBundleReady],
        ["final_projection_boundary", input.finalProjectionBoundaryReady],
        ["safe_evidence_ref", input.safeEvidenceRefReady],
    ]);
    const missingGateIds = REQUIRED_GATE_IDS.filter((gateId) => !readinessByGate.get(gateId));
    const blockingReasonCodes = [
        ...missingGateIds.map((gateId) => `required_gate_missing:${gateId}`),
        ...(input.publicRawLeakDetected ? ["public_raw_leak_detected"] : []),
        ...(input.reviewBypassDetected ? ["llm_review_bypass_detected"] : []),
        ...(input.unsafeEvidenceRefDetected ? ["unsafe_evidence_ref_detected"] : []),
        ...(input.defaultLiveSmokeEnabled ? ["default_live_smoke_enabled_before_gate"] : []),
        ...(input.rustLiveHandlerEnabled ? ["rust_live_handler_enabled_before_gate"] : []),
        ...(input.skillMappingEnabled ? ["skill_mapping_enabled_before_gate"] : []),
        ...(input.productionBindingEnabled ? ["production_binding_enabled_before_gate"] : []),
    ];
    return Object.freeze({
        schemaVersion: "yeonjang-browser-active-tab-info-release-gate-summary-v1",
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        gateStatus: blockingReasonCodes.length === 0
            ? "ready_for_manual_live_integration_review"
            : "blocked",
        missingGateIds,
        blockingReasonCodes,
        requiredGateIds: [...REQUIRED_GATE_IDS],
        liveIntegrationState: {
            rustLiveHandlerEnabled: input.rustLiveHandlerEnabled,
            skillMappingEnabled: input.skillMappingEnabled,
            productionBindingEnabled: input.productionBindingEnabled,
            defaultLiveSmokeEnabled: input.defaultLiveSmokeEnabled,
        },
        addRustDispatchNow: false,
        addProductionBindingNow: false,
        enableSkillMappingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-gate-summary.js.map