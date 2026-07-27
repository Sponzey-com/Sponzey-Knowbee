import { buildYeonjangBrowserActiveTabInfoReleaseGateSummary, } from "./yeonjang-browser-active-tab-info-release-gate-summary.js";
export const ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS = [
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
];
export function collectYeonjangBrowserActiveTabInfoReleaseGateEvidence(input) {
    const moduleEvidenceByGate = new Map(input.moduleEvidence.map((item) => [item.gateId, item.present]));
    const testStatusByPath = new Map(input.testEvidence.map((item) => [item.testPath, item.status]));
    const missingModuleGateIds = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .filter((requirement) => moduleEvidenceByGate.get(requirement.gateId) !== true)
        .map((requirement) => requirement.gateId);
    const failingTestPaths = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .filter((requirement) => testStatusByPath.get(requirement.testPath) !== "passed")
        .map((requirement) => requirement.testPath);
    const ready = (gateId) => {
        const requirement = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.find((item) => item.gateId === gateId);
        return Boolean(requirement &&
            moduleEvidenceByGate.get(gateId) === true &&
            testStatusByPath.get(requirement.testPath) === "passed");
    };
    const summaryInput = {
        readinessProjectionReady: ready("readiness_projection"),
        preDispatchBridgeReady: ready("pre_dispatch_bridge"),
        rustInventoryContractReady: ready("rust_inventory_contract"),
        auditEvidenceBoundaryReady: ready("audit_evidence_boundary"),
        runtimeAssemblerReady: ready("runtime_result_assembler"),
        llmReviewAdmissionReady: ready("llm_review_admission"),
        reviewReadyBundleReady: ready("review_ready_bundle"),
        finalProjectionBoundaryReady: ready("final_projection_boundary"),
        safeEvidenceRefReady: ready("safe_evidence_ref"),
        publicRawLeakDetected: input.publicRawLeakDetected,
        reviewBypassDetected: input.reviewBypassDetected,
        unsafeEvidenceRefDetected: input.unsafeEvidenceRefDetected,
        defaultLiveSmokeEnabled: input.liveIntegrationState.defaultLiveSmokeEnabled,
        rustLiveHandlerEnabled: input.liveIntegrationState.rustLiveHandlerEnabled,
        skillMappingEnabled: input.liveIntegrationState.skillMappingEnabled,
        productionBindingEnabled: input.liveIntegrationState.productionBindingEnabled,
    };
    return Object.freeze({
        summaryInput,
        missingModuleGateIds,
        failingTestPaths,
        releaseGateSummary: buildYeonjangBrowserActiveTabInfoReleaseGateSummary(summaryInput),
    });
}
export function collectYeonjangBrowserActiveTabInfoReleaseGateEvidenceFromRepository(input) {
    const missingSourcePaths = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .filter((requirement) => !input.evidencePort.existsFile(requirement.modulePath))
        .map((requirement) => requirement.modulePath);
    const missingTestPaths = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS
        .filter((requirement) => !input.evidencePort.existsFile(requirement.testPath))
        .map((requirement) => requirement.testPath);
    const moduleEvidence = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => ({
        gateId: requirement.gateId,
        present: !missingSourcePaths.includes(requirement.modulePath),
    }));
    const testEvidence = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => {
        if (missingTestPaths.includes(requirement.testPath)) {
            return { testPath: requirement.testPath, status: "missing" };
        }
        return {
            testPath: requirement.testPath,
            status: input.evidencePort.getTestStatus?.(requirement.testPath) ?? "missing",
        };
    });
    const collected = collectYeonjangBrowserActiveTabInfoReleaseGateEvidence({
        moduleEvidence,
        testEvidence,
        publicRawLeakDetected: input.publicRawLeakDetected,
        reviewBypassDetected: input.reviewBypassDetected,
        unsafeEvidenceRefDetected: input.unsafeEvidenceRefDetected,
        liveIntegrationState: input.liveIntegrationState,
    });
    return Object.freeze({
        ...collected,
        missingSourcePaths,
        missingTestPaths,
    });
}
export function normalizeYeonjangBrowserActiveTabInfoReleaseGateTestStatusEvidence(input) {
    const evidenceByPath = new Map(input.evidence.map((item) => [item.testPath, item]));
    const staleTestPaths = [];
    const missingTestStatusPaths = [];
    const rejectedRawReportVisibilityPaths = [];
    const testEvidence = ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => {
        const evidence = evidenceByPath.get(requirement.testPath);
        if (!evidence) {
            missingTestStatusPaths.push(requirement.testPath);
            return { testPath: requirement.testPath, status: "missing" };
        }
        if (evidence.rawReportVisibility !== "audit_only") {
            rejectedRawReportVisibilityPaths.push(requirement.testPath);
            return { testPath: requirement.testPath, status: "missing" };
        }
        if (input.now - evidence.executedAt > input.maxAgeMs) {
            staleTestPaths.push(requirement.testPath);
            return { testPath: requirement.testPath, status: "stale" };
        }
        return { testPath: requirement.testPath, status: evidence.status };
    });
    return Object.freeze({
        testEvidence,
        staleTestPaths,
        missingTestStatusPaths,
        rejectedRawReportVisibilityPaths,
    });
}
export function adaptYeonjangBrowserActiveTabInfoReleaseGateTestRunnerSummary(input) {
    const requiredTestPaths = new Set(ACTIVE_TAB_INFO_RELEASE_GATE_EVIDENCE_REQUIREMENTS.map((requirement) => requirement.testPath));
    const rejectedUnknownTestPaths = [];
    const rejectedSkippedTestPaths = [];
    const evidence = [];
    for (const record of input.records) {
        if (!requiredTestPaths.has(record.testPath)) {
            rejectedUnknownTestPaths.push(record.testPath);
            continue;
        }
        if (record.outcome === "skipped") {
            rejectedSkippedTestPaths.push(record.testPath);
            evidence.push({
                testPath: record.testPath,
                status: "missing",
                executedAt: record.finishedAt,
                sourceKind: record.sourceKind,
                rawReportVisibility: record.rawReportVisibility,
            });
            continue;
        }
        evidence.push({
            testPath: record.testPath,
            status: record.outcome,
            executedAt: record.finishedAt,
            sourceKind: record.sourceKind,
            rawReportVisibility: record.rawReportVisibility,
        });
    }
    return Object.freeze({
        evidence,
        rejectedUnknownTestPaths,
        rejectedSkippedTestPaths,
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-release-gate-evidence-collector.js.map